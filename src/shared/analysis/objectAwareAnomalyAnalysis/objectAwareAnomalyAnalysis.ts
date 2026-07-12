import {
  isEnabled,
  markingKey,
  type AnalysisPetriNet,
  type Marking,
} from "../../targets/petriNet/firing.js";
import {
  getAllLocalTransitionIds,
  type ObjectAwareRealizabilityMetadata,
  type ObjectAwareAnomalyReport,
  type ObjectAwareAnomaly,
  type DeadBranchAbsenceViolation,
  type DecisionDeterminismViolation,
  type ReceiverProgressionViolation,
  type SenderProgressionViolation,
} from "./objectAwareAnomalyTypes.js";
import {
  createObjectAwareAnalysisCaches,
  existsLocalPreparationToEnableAny,
} from "./localPreparation.js";
import { markedPlacesSummary, markingSummary } from "./markings.js";
import {
  generateBehaviorStateSpace,
  type BehaviorStateSpace,
  type BehaviorStateSpaceNode,
} from "./stateSpace.js";
import { reconstructTrace, traceText } from "./traces.js";

export function analyzeObjectAwareAnomalies(args: {
  net: AnalysisPetriNet;
  metadata: ObjectAwareRealizabilityMetadata;
  maxMarkings?: number;
  maxLocalPreparationMarkings?: number;
}): ObjectAwareAnomalyReport {
  const {
    net,
    metadata,
    maxMarkings,
    maxLocalPreparationMarkings,
  } = args;
  const localTransitionIds = getAllLocalTransitionIds(metadata);
  const stateSpace = generateBehaviorStateSpace({
    net,
    maxMarkings,
  });
  const caches = createObjectAwareAnalysisCaches();
  const markingViolations = stateSpace.nodes.flatMap((node) =>
    attachMarkingContext({
      net,
      metadata,
      stateSpace,
      node,
      violations: [
        ...checkSenderProgressionAtMarking({
          net,
          marking: node.marking,
          metadata,
          localTransitionIds,
          caches,
          maxLocalPreparationMarkings,
        }),
        ...checkReceiverProgressionAtMarking({
          net,
          marking: node.marking,
          metadata,
        }),
        ...checkDecisionDeterminismAtMarking({
          net,
          marking: node.marking,
          metadata,
        }),
      ],
    }),
  );
  const deadBranchViolations = checkDeadBranchAbsence({
    net,
    metadata,
    stateSpace,
  });
  const violations = [...markingViolations, ...deadBranchViolations];
  const diagnostics = {
    senderProgressionViolations: violations.filter(
      (violation) => violation.kind === "sender-progression",
    ).length,
    receiverProgressionViolations: violations.filter(
      (violation) => violation.kind === "receiver-progression",
    ).length,
    decisionDeterminismViolations: violations.filter(
      (violation) => violation.kind === "decision-determinism",
    ).length,
    deadBranchAbsenceViolations: violations.filter(
      (violation) => violation.kind === "dead-branch-absence",
    ).length,
  };

  return {
    anomalyFree:
      diagnostics.senderProgressionViolations === 0 &&
      diagnostics.receiverProgressionViolations === 0 &&
      diagnostics.decisionDeterminismViolations === 0 &&
      diagnostics.deadBranchAbsenceViolations === 0,
    assumesInteractionRealizability: true,
    stateSpace: {
      markings: stateSpace.nodes.length,
      edges: stateSpace.edges.length,
    },
    metadata: {
      senderPositions: metadata.senderPositions.length,
      transmissions: metadata.transmissions.length,
      decisionGateways: metadata.decisionGateways.length,
      branches: metadata.branches.length,
      localTransitions: localTransitionIds.length,
      localTransitionsByRole: Object.fromEntries(
        [...metadata.localTransitionsByRole.entries()].map(
          ([role, transitionIds]) => [role, transitionIds.length],
        ),
      ),
    },
    diagnostics,
    violations,
  };
}

function checkSenderProgressionAtMarking(args: {
  net: AnalysisPetriNet;
  marking: Marking;
  metadata: ObjectAwareRealizabilityMetadata;
  localTransitionIds: string[];
  caches: ReturnType<typeof createObjectAwareAnalysisCaches>;
  maxLocalPreparationMarkings?: number;
}): SenderProgressionViolation[] {
  const {
    net,
    marking,
    metadata,
    localTransitionIds,
    caches,
    maxLocalPreparationMarkings,
  } = args;
  const violations: SenderProgressionViolation[] = [];
  const currentMarkingKey = markingKey(marking);

  for (const position of metadata.senderPositions) {
    if ((marking.get(position.placeId) ?? 0) <= 0) {
      continue;
    }

    const senderProgressable = existsLocalPreparationToEnableAny({
      net,
      start: marking,
      localTransitionIds,
      targetTransitionIds: position.senderTransitionIds,
      maxMarkings: maxLocalPreparationMarkings,
      caches,
    });

    if (!senderProgressable) {
      violations.push({
        kind: "sender-progression",
        message: `Sender progression violation at "${
          position.label ?? position.id
        }": control flow reached place "${
          position.placeId
        }", but no sequence of local lifecycle transitions can enable any associated sender-side transition. Sender transitions: ${formatList(
          position.senderTransitionIds,
        )}. Local transitions considered: ${formatList(localTransitionIds)}.`,
        positionId: position.id,
        positionLabel: position.label,
        positionKind: position.kind,
        placeId: position.placeId,
        placeLabel: net.placeLabels.get(position.placeId),
        taskIds: position.taskIds,
        taskNames: position.taskNames,
        senderTransitionIds: position.senderTransitionIds,
        localTransitionIds,
        markingKey: currentMarkingKey,
        trace: [],
        traceText: [],
      });
    }
  }

  return violations;
}

function checkReceiverProgressionAtMarking(args: {
  net: AnalysisPetriNet;
  marking: Marking;
  metadata: ObjectAwareRealizabilityMetadata;
}): ReceiverProgressionViolation[] {
  const { net, marking, metadata } = args;
  const violations: ReceiverProgressionViolation[] = [];
  const currentMarkingKey = markingKey(marking);

  for (const transmission of metadata.transmissions) {
    if ((marking.get(transmission.placeId) ?? 0) <= 0) {
      continue;
    }

    if (
      !transmission.receiverTransitionIds.some((transitionId) =>
        isEnabled(net, marking, transitionId),
      )
    ) {
      violations.push({
        kind: "receiver-progression",
        message: `Receiver progression violation for task "${
          transmission.taskName
        }": receiver "${transmission.receiverRole}" has a transmission token in place "${
          transmission.placeId
        }", but none of the receiver-side completion transitions is enabled. Receiver transitions: ${formatList(
          transmission.receiverTransitionIds,
        )}.`,
        transmissionId: transmission.id,
        taskId: transmission.taskId,
        taskName: transmission.taskName,
        receiverRole: transmission.receiverRole,
        transmissionPlaceId: transmission.placeId,
        transmissionPlaceLabel: net.placeLabels.get(transmission.placeId),
        receiverTransitionIds: transmission.receiverTransitionIds,
        markingKey: currentMarkingKey,
        trace: [],
        traceText: [],
      });
    }
  }

  return violations;
}

function checkDecisionDeterminismAtMarking(args: {
  net: AnalysisPetriNet;
  marking: Marking;
  metadata: ObjectAwareRealizabilityMetadata;
}): DecisionDeterminismViolation[] {
  const { net, marking, metadata } = args;
  const violations: DecisionDeterminismViolation[] = [];
  const currentMarkingKey = markingKey(marking);

  for (const decision of metadata.decisionGateways) {
    const markedIncomingPlaceIds = decision.incomingPlaceIds.filter(
      (placeId) => (marking.get(placeId) ?? 0) > 0,
    );

    if (markedIncomingPlaceIds.length === 0) {
      continue;
    }

    const enabledBranchTransitionIds = decision.branchTransitionIds.filter(
      (transitionId) => isEnabled(net, marking, transitionId),
    );

    if (enabledBranchTransitionIds.length !== 1) {
      violations.push({
        kind: "decision-determinism",
        message: `Decision determinism violation for gateway "${
          decision.gatewayName ?? decision.gatewayId
        }": expected exactly one enabled branch, found ${
          enabledBranchTransitionIds.length
        }. Enabled branches: ${formatList(
          enabledBranchTransitionIds,
        )}. Affected roles: ${formatList(decision.affectedRoles)}.`,
        gatewayId: decision.gatewayId,
        gatewayName: decision.gatewayName,
        incomingPlaceIds: decision.incomingPlaceIds,
        markedIncomingPlaceIds,
        affectedRoles: decision.affectedRoles,
        branchTransitionIds: decision.branchTransitionIds,
        enabledBranchTransitionIds,
        enabledBranchCount: enabledBranchTransitionIds.length,
        markingKey: currentMarkingKey,
        trace: [],
        traceText: [],
      });
    }
  }

  return violations;
}

function checkDeadBranchAbsence(args: {
  net: AnalysisPetriNet;
  metadata: ObjectAwareRealizabilityMetadata;
  stateSpace: BehaviorStateSpace;
}): DeadBranchAbsenceViolation[] {
  const {
    net,
    metadata,
    stateSpace,
  } = args;
  const violations: DeadBranchAbsenceViolation[] = [];

  for (const branch of metadata.branches) {
    const witnessNode = stateSpace.nodes.find((node) =>
      branch.transitionIds.some((transitionId) =>
        isEnabled(net, node.marking, transitionId),
      ),
    );

    if (witnessNode) {
      continue;
    }

    violations.push({
      kind: "dead-branch-absence",
      message: `Dead branch absence violation at gateway "${
        branch.gatewayName ?? branch.gatewayId
      }": branch "${
        branch.branchLabel ?? branch.targetNodeName ?? branch.targetNodeId
      }" is never executable in any reachable marking.`,
      branchId: branch.id,
      branchKind: branch.kind,
      branchLabel: branch.branchLabel,
      gatewayId: branch.gatewayId,
      gatewayName: branch.gatewayName,
      entryPlaceId: branch.entryPlaceId,
      entryPlaceLabel: net.placeLabels.get(branch.entryPlaceId),
      targetNodeId: branch.targetNodeId,
      targetNodeName: branch.targetNodeName,
      branchTransitionIds: branch.transitionIds,
      markingsChecked: stateSpace.nodes.length,
      trace: [],
      traceText: [],
    });
  }

  return violations;
}

function attachMarkingContext(args: {
  net: AnalysisPetriNet;
  metadata: ObjectAwareRealizabilityMetadata;
  stateSpace: BehaviorStateSpace;
  node: BehaviorStateSpaceNode;
  violations: ObjectAwareAnomaly[];
}): ObjectAwareAnomaly[] {
  const { net, metadata, stateSpace, node, violations } = args;
  const trace = reconstructTrace(stateSpace, node, net, metadata);

  return violations.map((violation) => ({
    ...violation,
    marking: markingSummary(node.marking),
    markedPlaces: markedPlacesSummary(net, node.marking),
    trace,
    traceText: traceText(trace),
  }));
}

function formatList(values: string[]): string {
  if (values.length === 0) {
    return "(none)";
  }

  return values.map((value) => `"${value}"`).join(", ");
}
