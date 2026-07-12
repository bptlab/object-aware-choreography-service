import type {
  FixedParticipantsByCaseAndRole,
  TypedArc,
  TypedIdentifierDomains,
  TypedMarking,
  TypedPetriNet,
  TypedPlace,
  TypedTransition,
  TypedStateSpace,
  TypedStateSpaceNode,
  TypedToken,
  TypedTransitionOccurrence,
} from "../../targets/typedPetriNet/index.js";
import type { ProjectedChoreographySoundnessResult } from "../projectedChoreographySoundness/index.js";
import {
  fireTypedTransitionOccurrence,
  generateTypedStateSpace,
  getEnabledTypedTransitionOccurrences,
  typedMarkingKey,
  typedTokenKey,
} from "../../targets/typedPetriNet/index.js";
import type {
  CrossCaseObjectAwareRealizabilityReport,
  CrossCaseCaseOptionToCompleteViolation,
  CrossCaseDecisionDeterminismGateway,
  CrossCaseDecisionConsistencyViolation,
  CrossCaseReceiverProgressionTransmission,
  CrossCaseReceiverProgressionViolation,
  CrossCaseSenderProgressionPosition,
  CrossCaseSenderProgressionViolation,
} from "./crossCaseObjectAwareRealizabilityTypes.js";

export function checkCrossCaseObjectAwareRealizability(args: {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
  maxMarkings?: number;
  maxDepth?: number;
  transmissions?: CrossCaseReceiverProgressionTransmission[];
  senderPositions?: CrossCaseSenderProgressionPosition[];
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
  maxLocalPreparationMarkings?: number;
  taskIds?: string[];
}): CrossCaseObjectAwareRealizabilityReport {
  const stateSpace = generateTypedStateSpace({
    net: args.net,
    domains: args.domains,
    maxMarkings: args.maxMarkings,
    maxDepth: args.maxDepth,
    fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
  });
  const markingKeyByNodeId = new Map(
    stateSpace.nodes.map((node) => [node.id, node.markingKey]),
  );
  const enabledOccurrencesByMarkingKey = enabledOccurrencesByMarkingKeyFromStateSpace(
    stateSpace.edges.map((edge) => ({
      markingKey: markingKeyByNodeId.get(edge.sourceId) ?? "",
      occurrence: edge.occurrence,
    })),
  );
  const senderPositions =
    args.senderPositions ?? inferSenderProgressionPositions(args.net);
  const transmissions =
    args.transmissions ?? inferReceiverProgressionTransmissions(args.net);
  const decisionGateways = inferDecisionDeterminismGateways(args.net);
  const localTransitionIds = inferLocalLifecycleTransitionIds(args.net);
  const caseOptionToComplete = analyzeCaseOptionToComplete({
    net: args.net,
    stateSpace,
  });
  const projectedChoreographySoundness =
    analyzeCrossCaseProjectedChoreographySoundness({
      net: args.net,
      stateSpace,
      caseOptionToComplete,
      taskIds: args.taskIds,
    });
  const caches = createCrossCaseObjectAwareRealizabilityCaches();
  const senderViolations = stateSpace.nodes.flatMap((node) =>
    checkSenderProgressionAtMarking({
      net: args.net,
      domains: args.domains,
      marking: node.marking,
      markingKey: node.markingKey,
      enabledOccurrences: getCachedEnabledOccurrences({
        net: args.net,
        domains: args.domains,
        marking: node.marking,
        markingKey: node.markingKey,
        enabledOccurrencesByMarkingKey,
        fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
        caches,
      }),
      senderPositions,
      localTransitionIds,
      fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
      maxLocalPreparationMarkings: args.maxLocalPreparationMarkings,
      caches,
    }),
  );
  const decisionViolations = stateSpace.nodes.flatMap((node) =>
    checkDecisionDeterminismAtMarking({
      marking: node.marking,
      markingKey: node.markingKey,
      enabledOccurrences: getCachedEnabledOccurrences({
        net: args.net,
        domains: args.domains,
        marking: node.marking,
        markingKey: node.markingKey,
        enabledOccurrencesByMarkingKey,
        fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
        caches,
      }),
      decisionGateways,
      arcsByBranchTransitionId: inputArcsByTransitionId(args.net),
    }),
  );
  const receiverViolations = stateSpace.nodes.flatMap((node) =>
    checkReceiverProgressionAtMarking({
      net: args.net,
      domains: args.domains,
      marking: node.marking,
      markingKey: node.markingKey,
      enabledOccurrences: getCachedEnabledOccurrences({
        net: args.net,
        domains: args.domains,
        marking: node.marking,
        markingKey: node.markingKey,
        enabledOccurrencesByMarkingKey,
        fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
        caches,
      }),
      transmissions,
      fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
    }),
  );
  const violations = [
    ...caseOptionToComplete.violations,
    ...senderViolations,
    ...receiverViolations,
    ...decisionViolations,
  ].sort(compareViolations);
  const senderProgressionHolds = senderViolations.length === 0;
  const receiverProgressionHolds = receiverViolations.length === 0;
  const decisionConsistencyHolds = decisionViolations.length === 0;
  const holds =
    projectedChoreographySoundness.holds &&
    senderProgressionHolds &&
    receiverProgressionHolds &&
    decisionConsistencyHolds;

  return {
    objectAwareRealizability: {
      holds,
      assumptions: {
        controlFlowSoundness: "assumedExternal",
        controlFlowRealizability: "assumedExternal",
      },
      subproperties: {
        projectedChoreographySoundness,
        senderProgression: senderProgressionHolds,
        receiverProgression: receiverProgressionHolds,
        decisionConsistency: decisionConsistencyHolds,
      },
      firstViolation: firstCrossCaseViolation({
        projectedChoreographySoundness,
        senderViolations,
        receiverViolations,
        decisionViolations,
      }),
    },
    crossCaseAnalysis: {
      holds,
      subproperties: {
        caseOptionToComplete: caseOptionToComplete.holds,
        projectedChoreographySoundness: projectedChoreographySoundness.holds,
        properInteractionCompletion:
          projectedChoreographySoundness.properInteractionCompletion.holds,
        taskCoverage: projectedChoreographySoundness.taskCoverage.holds,
        branchCoverage: projectedChoreographySoundness.branchCoverage.holds,
        senderProgression: senderProgressionHolds,
        receiverProgression: receiverProgressionHolds,
        decisionConsistency: decisionConsistencyHolds,
      },
    },
    stateSpace: {
      markings: stateSpace.nodes.length,
      edges: stateSpace.edges.length,
      truncated: stateSpace.truncated,
      truncationReasons: stateSpace.truncationReasons,
      limits: stateSpace.limits,
    },
    metadata: {
      caseOptionToCompleteSemantics: caseOptionToComplete.completionSemantics,
      activeCases: caseOptionToComplete.activeCaseCount,
      checkedCaseStatePairs: caseOptionToComplete.checkedPairCount,
      taskCoverageTasks:
        projectedChoreographySoundness.taskCoverage.totalTaskCount,
      branchCoverageBranches:
        projectedChoreographySoundness.branchCoverage.totalBranchCount,
      senderPositions: senderPositions.length,
      transmissions: transmissions.length,
      decisionGateways: decisionGateways.length,
      localTransitions: localTransitionIds.length,
    },
    diagnostics: {
      optionToCompleteViolations:
        projectedChoreographySoundness.optionToComplete.violatingStateCount,
      caseOptionToCompleteViolations: caseOptionToComplete.violationCount,
      properInteractionCompletionViolations:
        projectedChoreographySoundness.properInteractionCompletion
          .violatingStateCount,
      uncoveredTasks:
        projectedChoreographySoundness.taskCoverage.uncoveredTaskIds.length,
      uncoveredBranches:
        projectedChoreographySoundness.branchCoverage.uncoveredBranchIds.length,
      senderProgressionViolations: senderViolations.length,
      receiverProgressionViolations: receiverViolations.length,
      decisionConsistencyViolations: decisionViolations.length,
    },
    projectedChoreographySoundness,
    caseOptionToComplete,
    senderProgression: {
      holds: senderProgressionHolds,
      violations: senderViolations,
    },
    receiverProgression: {
      holds: receiverProgressionHolds,
      violations: receiverViolations,
    },
    decisionConsistency: {
      holds: decisionConsistencyHolds,
      violations: decisionViolations,
    },
    violations,
  };
}

export function inferSenderProgressionPositions(
  net: TypedPetriNet,
): CrossCaseSenderProgressionPosition[] {
  const transitionIds = new Set(net.transitions.map((transition) => transition.id));
  const placesById = new Map(net.places.map((place) => [place.id, place]));
  const transitionsById = new Map(
    net.transitions.map((transition) => [transition.id, transition]),
  );
  const positionsByKey = new Map<string, CrossCaseSenderProgressionPosition>();

  for (const transition of net.transitions.filter(isSenderTransition)) {
    const transmissionPlaceIds = net.arcs
      .filter(
        (arc) =>
          arc.kind === "ordinary" &&
          arc.sourceId === transition.id &&
          isTransmissionPlace(placesById.get(arc.targetId)),
      )
      .map((arc) => arc.targetId)
      .sort();

    if (transmissionPlaceIds.length === 0) {
      continue;
    }

    const controlFlowInputPlaceIds = net.arcs
      .filter(
        (arc) =>
          arc.kind === "ordinary" &&
          arc.targetId === transition.id &&
          transitionIds.has(transition.id) &&
          isCaseControlFlowPlace(placesById.get(arc.sourceId)),
      )
      .map((arc) => arc.sourceId)
      .sort();

    for (const controlFlowPlaceId of controlFlowInputPlaceIds) {
      for (const transmissionPlaceId of transmissionPlaceIds) {
        const transmissionPlace = placesById.get(transmissionPlaceId);
        const taskId = transmissionPlace
          ? taskIdFromTransmissionPlace(transmissionPlace)
          : taskIdFromSenderTransitionId(transition.id);
        const key = controlFlowPlaceId;
        const position = positionsByKey.get(key) ?? {
          id: key,
          taskId,
          taskName: taskNameFromSenderTransitionName(transition.name),
          taskIds: [],
          taskNames: [],
          controlFlowPlaceId,
          controlFlowPlaceName: placesById.get(controlFlowPlaceId)?.name,
          senderTransitionIds: [],
        };
        const taskName = taskNameFromSenderTransitionName(
          transitionsById.get(transition.id)?.name ?? "",
        );

        if (!position.senderTransitionIds.includes(transition.id)) {
          position.senderTransitionIds.push(transition.id);
        }

        const taskIds =
          taskId && !position.taskIds?.includes(taskId)
            ? [...(position.taskIds ?? []), taskId]
            : (position.taskIds ?? []);
        const taskNames =
          taskName && !position.taskNames?.includes(taskName)
            ? [...(position.taskNames ?? []), taskName]
            : (position.taskNames ?? []);

        positionsByKey.set(key, {
          ...position,
          taskId: position.taskId ?? taskId,
          taskName: position.taskName ?? taskName,
          taskIds: taskIds.sort(),
          taskNames: taskNames.sort(),
          senderTransitionIds: position.senderTransitionIds.sort(),
        });
      }
    }
  }

  for (const transition of net.transitions.filter(isAtomicTaskTransition)) {
    const controlFlowInputPlaceIds = net.arcs
      .filter(
        (arc) =>
          arc.kind === "ordinary" &&
          arc.targetId === transition.id &&
          isCaseControlFlowPlace(placesById.get(arc.sourceId)),
      )
      .map((arc) => arc.sourceId)
      .sort();

    for (const controlFlowPlaceId of controlFlowInputPlaceIds) {
      const taskId = taskIdFromAtomicTransitionId(transition.id);
      const taskName = taskNameFromAtomicTransitionName(transition.name);
      const key = controlFlowPlaceId;
      const position = positionsByKey.get(key) ?? {
        id: key,
        taskId,
        taskName,
        taskIds: [],
        taskNames: [],
        controlFlowPlaceId,
        controlFlowPlaceName: placesById.get(controlFlowPlaceId)?.name,
        senderTransitionIds: [],
      };

      if (!position.senderTransitionIds.includes(transition.id)) {
        position.senderTransitionIds.push(transition.id);
      }

      const taskIds =
        taskId && !position.taskIds?.includes(taskId)
          ? [...(position.taskIds ?? []), taskId]
          : (position.taskIds ?? []);
      const taskNames =
        taskName && !position.taskNames?.includes(taskName)
          ? [...(position.taskNames ?? []), taskName]
          : (position.taskNames ?? []);

      positionsByKey.set(key, {
        ...position,
        taskId: position.taskId ?? taskId,
        taskName: position.taskName ?? taskName,
        taskIds: taskIds.sort(),
        taskNames: taskNames.sort(),
        senderTransitionIds: position.senderTransitionIds.sort(),
      });
    }
  }

  return [...positionsByKey.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export function inferReceiverProgressionTransmissions(
  net: TypedPetriNet,
): CrossCaseReceiverProgressionTransmission[] {
  const transitionsById = new Set(net.transitions.map((transition) => transition.id));
  const transmissionPlaces = net.places
    .filter(isTransmissionPlace)
    .sort((left, right) => left.id.localeCompare(right.id));

  return transmissionPlaces.map((place) => {
    const receiverTransitionIds = net.arcs
      .filter(
        (arc) =>
          arc.kind === "ordinary" &&
          arc.sourceId === place.id &&
          transitionsById.has(arc.targetId),
      )
      .map((arc) => arc.targetId)
      .sort();

    return {
      id: place.id,
      taskId: taskIdFromTransmissionPlace(place),
      taskName: taskNameFromTransmissionPlace(place),
      placeId: place.id,
      placeName: place.name,
      receiverTransitionIds: [...new Set(receiverTransitionIds)],
    };
  });
}

export function inferDecisionDeterminismGateways(
  net: TypedPetriNet,
): CrossCaseDecisionDeterminismGateway[] {
  const placesById = new Map(net.places.map((place) => [place.id, place]));
  const inputArcs = inputArcsByTransitionId(net);
  const outputArcs = outputArcsByTransitionId(net);
  const groupsByControlFlowPlaceId = new Map<
    string,
    CrossCaseDecisionDeterminismGateway
  >();

  for (const transition of net.transitions.filter(isGatewayBranchTransition)) {
    const transitionInputArcs = inputArcs.get(transition.id) ?? [];

    if (!hasStateAwarenessGuardArc(transitionInputArcs, placesById)) {
      continue;
    }

    const controlFlowInputPlaceIds = transitionInputArcs
      .filter((arc) => isCaseControlFlowPlace(placesById.get(arc.sourceId)))
      .map((arc) => arc.sourceId)
      .sort();
    const controlFlowOutputPlaceIds = (outputArcs.get(transition.id) ?? [])
      .filter((arc) => isCaseControlFlowPlace(placesById.get(arc.targetId)))
      .map((arc) => arc.targetId)
      .sort();

    if (
      controlFlowInputPlaceIds.length !== 1 ||
      controlFlowOutputPlaceIds.length !== 1
    ) {
      continue;
    }

    const controlFlowPlaceId = controlFlowInputPlaceIds[0];
    const gatewayDetails = gatewayDetailsFromBranchTransition(transition);
    const current = groupsByControlFlowPlaceId.get(controlFlowPlaceId) ?? {
      id: gatewayDetails.gatewayId ?? controlFlowPlaceId,
      gatewayId: gatewayDetails.gatewayId,
      gatewayName: gatewayDetails.gatewayName,
      controlFlowPlaceId,
      controlFlowPlaceName: placesById.get(controlFlowPlaceId)?.name,
      branchTransitionIds: [],
    };

    groupsByControlFlowPlaceId.set(controlFlowPlaceId, {
      ...current,
      gatewayId: current.gatewayId ?? gatewayDetails.gatewayId,
      gatewayName: current.gatewayName ?? gatewayDetails.gatewayName,
      branchTransitionIds: [
        ...new Set([...current.branchTransitionIds, transition.id]),
      ].sort(),
    });
  }

  return [...groupsByControlFlowPlaceId.values()]
    .filter((group) => group.branchTransitionIds.length > 1)
    .sort((left, right) => left.id.localeCompare(right.id));
}

const CASE_OPTION_TO_COMPLETE_SEMANTICS =
  "explicit-sink-place: completed cases occur in the typed sink place and must not occur in any non-sink case-control or transmission place";

function analyzeCaseOptionToComplete(args: {
  net: TypedPetriNet;
  stateSpace: TypedStateSpace;
}): CrossCaseObjectAwareRealizabilityReport["caseOptionToComplete"] {
  const executionPlaces = inferCaseExecutionPlaces(args.net);
  const activeCaseIds = new Set<string>();
  let checkedPairCount = 0;

  for (const node of args.stateSpace.nodes) {
    const nodeActiveCaseIds = activeCaseIdsInMarking(node.marking, executionPlaces);
    checkedPairCount += nodeActiveCaseIds.size;
    for (const caseId of nodeActiveCaseIds) {
      activeCaseIds.add(caseId);
    }
  }

  const backwardReachableByCaseId = new Map<string, Set<number>>();
  for (const caseId of activeCaseIds) {
    backwardReachableByCaseId.set(
      caseId,
      reverseReachableFromCompletedCaseNodes({
        stateSpace: args.stateSpace,
        executionPlaces,
        caseId,
      }),
    );
  }

  const violations: CrossCaseCaseOptionToCompleteViolation[] = [];
  for (const node of args.stateSpace.nodes) {
    const nodeActiveCaseIds = activeCaseIdsInMarking(node.marking, executionPlaces);

    for (const caseId of nodeActiveCaseIds) {
      if (backwardReachableByCaseId.get(caseId)?.has(node.id)) {
        continue;
      }

      violations.push({
        kind: "case-option-to-complete",
        message: `Case option-to-complete violation: case ${caseId} is active in reachable marking ${node.id}, but no continuation reaches a marking where that case occurs in the typed sink place and no longer occurs in any non-sink case-control or transmission place.`,
        markingKey: node.markingKey,
        nodeId: node.id,
        caseId,
        witnessPath: reconstructTypedPath(args.stateSpace, node),
      });
    }
  }

  violations.sort(compareCaseOptionToCompleteViolations);

  return {
    holds: violations.length === 0,
    violationCount: violations.length,
    activeCaseCount: activeCaseIds.size,
    checkedPairCount,
    completionSemantics: CASE_OPTION_TO_COMPLETE_SEMANTICS,
    violations,
  };
}

function analyzeCrossCaseProjectedChoreographySoundness(args: {
  net: TypedPetriNet;
  stateSpace: TypedStateSpace;
  caseOptionToComplete: CrossCaseObjectAwareRealizabilityReport["caseOptionToComplete"];
  taskIds?: string[];
}): ProjectedChoreographySoundnessResult {
  const executionPlaces = inferCaseExecutionPlaces(args.net);
  const properCompletionViolatingNodes = args.stateSpace.nodes.filter((node) =>
    hasImproperCaseCompletion({
      marking: node.marking,
      executionPlaces,
    }),
  );
  const firedTransitionIds = new Set(
    args.stateSpace.edges.map((edge) => edge.occurrence.transitionId),
  );
  const completionTransitionsByTaskId =
    completionTransitionsByTaskIdForCrossCaseNet(args.net);
  const taskIds = (args.taskIds ?? [...completionTransitionsByTaskId.keys()])
    .slice()
    .sort();
  const uncoveredTaskIds = taskIds.filter((taskId) => {
    const completionTransitionIds =
      completionTransitionsByTaskId.get(taskId) ?? [];

    return !completionTransitionIds.some((transitionId) =>
      firedTransitionIds.has(transitionId),
    );
  });
  const branches = branchCoverageBranchesForCrossCaseNet(args.net);
  const uncoveredBranchIds = branches
    .filter(
      (branch) =>
        !branch.transitionIds.some((transitionId) =>
          firedTransitionIds.has(transitionId),
        ),
    )
    .map((branch) => branch.id)
    .sort();
  const optionToComplete = {
    holds: args.caseOptionToComplete.holds,
    violatingStateCount: args.caseOptionToComplete.violationCount,
    representativeViolation:
      args.caseOptionToComplete.violations[0]?.nodeId.toString(),
  };
  const properInteractionCompletion = {
    holds: properCompletionViolatingNodes.length === 0,
    violatingStateCount: properCompletionViolatingNodes.length,
    representativeViolation:
      properCompletionViolatingNodes[0]?.id.toString(),
  };
  const taskCoverage = {
    holds: uncoveredTaskIds.length === 0,
    coveredTaskCount: taskIds.length - uncoveredTaskIds.length,
    totalTaskCount: taskIds.length,
    uncoveredTaskIds,
  };
  const branchCoverage = {
    holds: uncoveredBranchIds.length === 0,
    coveredBranchCount: branches.length - uncoveredBranchIds.length,
    totalBranchCount: branches.length,
    uncoveredBranchIds,
  };
  const holds =
    optionToComplete.holds &&
    properInteractionCompletion.holds &&
    taskCoverage.holds &&
    branchCoverage.holds;

  return {
    optionToComplete,
    properInteractionCompletion,
    taskCoverage,
    branchCoverage,
    holds,
  };
}

function hasImproperCaseCompletion(args: {
  marking: TypedMarking;
  executionPlaces: {
    caseTypeId: string;
    controlFlowPlaceIds: Set<string>;
    sinkPlaceIds: Set<string>;
    transmissionPlaceIds: Set<string>;
  };
}): boolean {
  const completedCaseIds = new Set<string>();

  for (const placeId of args.executionPlaces.sinkPlaceIds) {
    for (const token of args.marking.get(placeId) ?? []) {
      const caseId = caseIdFromToken(token, args.executionPlaces.caseTypeId);

      if (caseId) {
        completedCaseIds.add(caseId);
      }
    }
  }

  for (const caseId of completedCaseIds) {
    for (const placeId of [
      ...args.executionPlaces.controlFlowPlaceIds,
      ...args.executionPlaces.transmissionPlaceIds,
    ]) {
      if (
        placeContainsCaseId(
          args.marking,
          placeId,
          caseId,
          args.executionPlaces.caseTypeId,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function completionTransitionsByTaskIdForCrossCaseNet(
  net: TypedPetriNet,
): Map<string, string[]> {
  const completionTransitionsByTaskId = new Map<string, Set<string>>();

  for (const transition of net.transitions) {
    const taskId = taskIdFromReceiveTransitionId(transition.id);

    if (!taskId) {
      continue;
    }

    addCompletionTransition(
      completionTransitionsByTaskId,
      taskId,
      transition.id,
    );
  }

  for (const transition of net.transitions) {
    const taskId = taskIdFromAtomicTransitionId(transition.id);

    if (!taskId || completionTransitionsByTaskId.has(taskId)) {
      continue;
    }

    addCompletionTransition(
      completionTransitionsByTaskId,
      taskId,
      transition.id,
    );
  }

  return new Map(
    [...completionTransitionsByTaskId.entries()]
      .map(
        ([taskId, transitionIds]): [string, string[]] => [
          taskId,
          [...transitionIds].sort(),
        ],
      )
      .sort(([leftTaskId], [rightTaskId]) =>
        leftTaskId.localeCompare(rightTaskId),
      ),
  );
}

function addCompletionTransition(
  transitionsByTaskId: Map<string, Set<string>>,
  taskId: string,
  transitionId: string,
): void {
  const transitionIds = transitionsByTaskId.get(taskId) ?? new Set<string>();
  transitionIds.add(transitionId);
  transitionsByTaskId.set(taskId, transitionIds);
}

function branchCoverageBranchesForCrossCaseNet(
  net: TypedPetriNet,
): Array<{ id: string; transitionIds: string[] }> {
  return net.transitions
    .filter(isGatewayBranchTransition)
    .map((transition) => ({
      id: branchCoverageIdFromTransition(transition),
      transitionIds: [transition.id],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function branchCoverageIdFromTransition(transition: TypedTransition): string {
  const match = /^Transition_gateway_(Gateway_[^_]+)_(.+)$/.exec(transition.id);

  if (!match) {
    return transition.id;
  }

  return `${match[1]}->${match[2]}`;
}

function inferCaseExecutionPlaces(net: TypedPetriNet): {
  caseTypeId: string;
  controlFlowPlaceIds: Set<string>;
  sinkPlaceIds: Set<string>;
  transmissionPlaceIds: Set<string>;
} {
  const placesById = new Map(net.places.map((place) => [place.id, place]));
  const controlFlowPlaceIds = new Set(
    net.places.filter(isCaseControlFlowPlace).map((place) => place.id),
  );
  const sinkPlaceIds = new Set(
    net.places.filter(isCaseSinkPlace).map((place) => place.id),
  );
  const transmissionPlaceIds = new Set(
    net.places.filter(isTransmissionPlace).map((place) => place.id),
  );
  const caseTypeId =
    net.identifierTypes.find((type) => type.id === "DataClass_Case")?.id ??
    net.identifierTypes.find((type) => type.alias === "case")?.id ??
    [...placesById.values()]
      .flatMap((place) => place.tupleType)
      .find((typeId) => /DataClass_Case$/.test(typeId));

  if (!caseTypeId) {
    throw new Error("Cannot infer case identifier type for cross-case analysis");
  }

  return {
    caseTypeId,
    controlFlowPlaceIds,
    sinkPlaceIds,
    transmissionPlaceIds,
  };
}

function activeCaseIdsInMarking(
  marking: TypedMarking,
  executionPlaces: {
    caseTypeId: string;
    controlFlowPlaceIds: Set<string>;
    transmissionPlaceIds: Set<string>;
  },
): Set<string> {
  const active = new Set<string>();

  for (const placeId of [
    ...executionPlaces.controlFlowPlaceIds,
    ...executionPlaces.transmissionPlaceIds,
  ]) {
    for (const token of marking.get(placeId) ?? []) {
      const caseId = caseIdFromToken(token, executionPlaces.caseTypeId);
      if (caseId) {
        active.add(caseId);
      }
    }
  }

  return active;
}

function caseCompleteInMarking(args: {
  marking: TypedMarking;
  caseId: string;
  executionPlaces: {
    caseTypeId: string;
    controlFlowPlaceIds: Set<string>;
    sinkPlaceIds: Set<string>;
    transmissionPlaceIds: Set<string>;
  };
}): boolean {
  for (const placeId of args.executionPlaces.transmissionPlaceIds) {
    if (placeContainsCaseId(args.marking, placeId, args.caseId, args.executionPlaces.caseTypeId)) {
      return false;
    }
  }

  for (const placeId of args.executionPlaces.controlFlowPlaceIds) {
    const contains = placeContainsCaseId(
      args.marking,
      placeId,
      args.caseId,
      args.executionPlaces.caseTypeId,
    );

    if (!contains) {
      continue;
    }

    return false;
  }

  for (const placeId of args.executionPlaces.sinkPlaceIds) {
    if (
      placeContainsCaseId(
        args.marking,
        placeId,
        args.caseId,
        args.executionPlaces.caseTypeId,
      )
    ) {
      return true;
    }
  }

  return false;
}

function reverseReachableFromCompletedCaseNodes(args: {
  stateSpace: TypedStateSpace;
  executionPlaces: {
    caseTypeId: string;
    controlFlowPlaceIds: Set<string>;
    sinkPlaceIds: Set<string>;
    transmissionPlaceIds: Set<string>;
  };
  caseId: string;
}): Set<number> {
  const reverseEdgesByTargetId = new Map<number, number[]>();

  for (const edge of args.stateSpace.edges) {
    const predecessors = reverseEdgesByTargetId.get(edge.targetId) ?? [];
    predecessors.push(edge.sourceId);
    reverseEdgesByTargetId.set(edge.targetId, predecessors);
  }

  const visited = new Set<number>();
  const queue = args.stateSpace.nodes
    .filter((node) =>
      caseCompleteInMarking({
        marking: node.marking,
        caseId: args.caseId,
        executionPlaces: args.executionPlaces,
      }),
    )
    .map((node) => node.id);

  for (const nodeId of queue) {
    visited.add(nodeId);
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (nodeId === undefined) {
      continue;
    }

    for (const predecessorId of reverseEdgesByTargetId.get(nodeId) ?? []) {
      if (visited.has(predecessorId)) {
        continue;
      }

      visited.add(predecessorId);
      queue.push(predecessorId);
    }
  }

  return visited;
}

function caseIdFromToken(token: TypedToken, caseTypeId: string): string | undefined {
  return token.find((value) => value.typeId === caseTypeId)?.value;
}

function placeContainsCaseId(
  marking: TypedMarking,
  placeId: string,
  caseId: string,
  caseTypeId: string,
): boolean {
  return countCaseTokens(marking, placeId, caseId, caseTypeId) > 0;
}

function countCaseTokens(
  marking: TypedMarking,
  placeId: string,
  caseId: string,
  caseTypeId: string,
): number {
  return (marking.get(placeId) ?? []).filter(
    (token) => caseIdFromToken(token, caseTypeId) === caseId,
  ).length;
}

function reconstructTypedPath(
  stateSpace: TypedStateSpace,
  node: TypedStateSpaceNode,
): CrossCaseCaseOptionToCompleteViolation["witnessPath"] {
  const path: NonNullable<CrossCaseCaseOptionToCompleteViolation["witnessPath"]> =
    [];
  let current: TypedStateSpaceNode | undefined = node;

  while (current?.predecessorId !== undefined) {
    if (current.firedOccurrence) {
      path.push({
        transitionId: current.firedOccurrence.transitionId,
        binding: { ...current.firedOccurrence.binding },
      });
    }
    current = stateSpace.nodes.find((candidate) => candidate.id === current?.predecessorId);
  }

  return path.reverse();
}

function checkDecisionDeterminismAtMarking(args: {
  marking: TypedMarking;
  markingKey: string;
  enabledOccurrences: TypedTransitionOccurrence[];
  decisionGateways: CrossCaseDecisionDeterminismGateway[];
  arcsByBranchTransitionId: Map<string, TypedArc[]>;
}): CrossCaseDecisionConsistencyViolation[] {
  const violations: CrossCaseDecisionConsistencyViolation[] = [];

  for (const decision of args.decisionGateways) {
    const tokens = args.marking.get(decision.controlFlowPlaceId) ?? [];

    for (const token of tokens) {
      const caseId = token[0]?.value;

      if (!caseId) {
        continue;
      }

      const enabledBranchTransitionIds = enabledBranchTransitionsForCaseToken({
        decision,
        token,
        enabledOccurrences: args.enabledOccurrences,
        arcsByBranchTransitionId: args.arcsByBranchTransitionId,
      });

      if (enabledBranchTransitionIds.length === 1) {
        continue;
      }

      const classification =
        enabledBranchTransitionIds.length === 0
          ? "no-enabled-branch"
          : "multiple-enabled-branches";

      violations.push({
        kind: "decision-consistency",
        message: `Decision consistency violation for gateway "${
          decision.gatewayName ?? decision.gatewayId ?? decision.id
        }": case ${caseId} reached control-flow place "${
          decision.controlFlowPlaceName ?? decision.controlFlowPlaceId
        }", expected exactly one enabled guarded branch, found ${
          enabledBranchTransitionIds.length
        }. Enabled branches: ${formatList(enabledBranchTransitionIds)}.`,
        markingKey: args.markingKey,
        gatewayId: decision.gatewayId,
        gatewayName: decision.gatewayName,
        controlFlowPlaceId: decision.controlFlowPlaceId,
        controlFlowPlaceName: decision.controlFlowPlaceName,
        caseToken: token.map((value) => ({ ...value })),
        caseTokenKey: typedTokenKey(token),
        caseId,
        branchTransitionIds: decision.branchTransitionIds,
        enabledBranchTransitionIds,
        enabledBranchCount: enabledBranchTransitionIds.length,
        classification,
      });
    }
  }

  return violations.sort(compareDecisionDeterminismViolations);
}

function enabledBranchTransitionsForCaseToken(args: {
  decision: CrossCaseDecisionDeterminismGateway;
  token: TypedToken;
  enabledOccurrences: TypedTransitionOccurrence[];
  arcsByBranchTransitionId: Map<string, TypedArc[]>;
}): string[] {
  const branchTransitionIds = new Set(args.decision.branchTransitionIds);
  const enabledBranchTransitionIds = new Set<string>();

  for (const occurrence of args.enabledOccurrences) {
    if (!branchTransitionIds.has(occurrence.transitionId)) {
      continue;
    }

    const arcs = args.arcsByBranchTransitionId.get(occurrence.transitionId) ?? [];

    if (
      arcs.some(
        (arc) =>
          arc.sourceId === args.decision.controlFlowPlaceId &&
          inscriptionMatchesToken(arc, occurrence, args.token),
      )
    ) {
      enabledBranchTransitionIds.add(occurrence.transitionId);
    }
  }

  return [...enabledBranchTransitionIds].sort();
}

function checkReceiverProgressionAtMarking(args: {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
  marking: TypedMarking;
  markingKey: string;
  enabledOccurrences: TypedTransitionOccurrence[];
  transmissions: CrossCaseReceiverProgressionTransmission[];
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
}): CrossCaseReceiverProgressionViolation[] {
  const arcsByReceiverTransitionId = receiverInputArcsByTransitionId(args.net);
  const violations: CrossCaseReceiverProgressionViolation[] = [];

  for (const transmission of args.transmissions) {
    const tokens = args.marking.get(transmission.placeId) ?? [];

    for (const token of tokens) {
      if (
        receiverCanConsumeTransmissionToken({
          transmission,
          token,
          enabledOccurrences: args.enabledOccurrences,
          arcsByReceiverTransitionId,
        })
      ) {
        continue;
      }

      violations.push({
        kind: "receiver-progression",
        message: `Receiver progression violation for transmission place "${
          transmission.placeName ?? transmission.placeId
        }": pending token ${typedTokenKey(
          token,
        )} cannot be consumed by any receiver-side completion transition in the same reachable marking. Receiver transitions: ${formatList(
          transmission.receiverTransitionIds,
        )}.`,
        markingKey: args.markingKey,
        transmissionPlaceId: transmission.placeId,
        transmissionPlaceName: transmission.placeName,
        transmissionToken: token.map((value) => ({ ...value })),
        transmissionTokenKey: typedTokenKey(token),
        taskId: transmission.taskId,
        taskName: transmission.taskName,
        receiverTransitionIds: transmission.receiverTransitionIds,
      });
    }
  }

  return violations.sort(compareReceiverProgressionViolations);
}

function checkSenderProgressionAtMarking(args: {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
  marking: TypedMarking;
  markingKey: string;
  enabledOccurrences: TypedTransitionOccurrence[];
  senderPositions: CrossCaseSenderProgressionPosition[];
  localTransitionIds: string[];
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
  maxLocalPreparationMarkings?: number;
  caches: CrossCaseObjectAwareRealizabilityCaches;
}): CrossCaseSenderProgressionViolation[] {
  const arcsBySenderTransitionId = senderInputArcsByTransitionId(args.net);
  const violations: CrossCaseSenderProgressionViolation[] = [];

  for (const position of args.senderPositions) {
    const tokens = args.marking.get(position.controlFlowPlaceId) ?? [];

    for (const token of tokens) {
      const caseId = token[0]?.value;

      if (!caseId) {
        continue;
      }

      if (
        senderCanConsumeCaseToken({
          position,
          token,
          enabledOccurrences: args.enabledOccurrences,
          arcsBySenderTransitionId,
        }) ||
        existsTypedLocalPreparationToEnableSender({
          net: args.net,
          domains: args.domains,
          start: args.marking,
          position,
          token,
          localTransitionIds: args.localTransitionIds,
          fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
          maxMarkings: args.maxLocalPreparationMarkings,
          caches: args.caches,
        })
      ) {
        continue;
      }

      violations.push({
        kind: "sender-progression",
        message: `Sender progression violation for control-flow place "${
          position.controlFlowPlaceName ?? position.controlFlowPlaceId
        }": case ${caseId} reached the sender side of task "${
          senderPositionLabel(position)
        }", but no sequence of local lifecycle transitions can enable any corresponding sender transition for that same case. Sender transitions: ${formatList(
          position.senderTransitionIds,
        )}. Local transitions considered: ${formatList(args.localTransitionIds)}.`,
        markingKey: args.markingKey,
        controlFlowPlaceId: position.controlFlowPlaceId,
        controlFlowPlaceName: position.controlFlowPlaceName,
        caseToken: token.map((value) => ({ ...value })),
        caseTokenKey: typedTokenKey(token),
        caseId,
        taskId: position.taskId,
        taskName: position.taskName,
        taskIds: position.taskIds,
        taskNames: position.taskNames,
        senderTransitionIds: position.senderTransitionIds,
        localTransitionIds: args.localTransitionIds,
      });
    }
  }

  return violations.sort(compareSenderProgressionViolations);
}

function senderCanConsumeCaseToken(args: {
  position: CrossCaseSenderProgressionPosition;
  token: TypedToken;
  enabledOccurrences: TypedTransitionOccurrence[];
  arcsBySenderTransitionId: Map<string, TypedArc[]>;
}): boolean {
  const senderTransitionIds = new Set(args.position.senderTransitionIds);

  for (const occurrence of args.enabledOccurrences) {
    if (!senderTransitionIds.has(occurrence.transitionId)) {
      continue;
    }

    const arcs = args.arcsBySenderTransitionId.get(occurrence.transitionId) ?? [];

    if (
      arcs.some(
        (arc) =>
          arc.sourceId === args.position.controlFlowPlaceId &&
          inscriptionMatchesToken(arc, occurrence, args.token),
      )
    ) {
      return true;
    }
  }

  return false;
}

function receiverCanConsumeTransmissionToken(args: {
  transmission: CrossCaseReceiverProgressionTransmission;
  token: TypedToken;
  enabledOccurrences: TypedTransitionOccurrence[];
  arcsByReceiverTransitionId: Map<string, TypedArc[]>;
}): boolean {
  const receiverTransitionIds = new Set(args.transmission.receiverTransitionIds);

  for (const occurrence of args.enabledOccurrences) {
    if (!receiverTransitionIds.has(occurrence.transitionId)) {
      continue;
    }

    const arcs =
      args.arcsByReceiverTransitionId.get(occurrence.transitionId) ?? [];

    if (
      arcs.some(
        (arc) =>
          arc.sourceId === args.transmission.placeId &&
          inscriptionMatchesToken(arc, occurrence, args.token),
      )
    ) {
      return true;
    }
  }

  return false;
}

function receiverInputArcsByTransitionId(net: TypedPetriNet): Map<string, TypedArc[]> {
  return inputArcsByTransitionId(net);
}

function senderInputArcsByTransitionId(net: TypedPetriNet): Map<string, TypedArc[]> {
  return inputArcsByTransitionId(net);
}

function inputArcsByTransitionId(net: TypedPetriNet): Map<string, TypedArc[]> {
  const arcsByTransitionId = new Map<string, TypedArc[]>();
  const transitionIds = new Set(net.transitions.map((transition) => transition.id));

  for (const arc of net.arcs) {
    if (
      arc.kind !== "ordinary" ||
      !transitionIds.has(arc.targetId)
    ) {
      continue;
    }

    const arcs = arcsByTransitionId.get(arc.targetId) ?? [];
    arcs.push(arc);
    arcsByTransitionId.set(arc.targetId, arcs);
  }

  for (const arcs of arcsByTransitionId.values()) {
    arcs.sort((left, right) => left.id.localeCompare(right.id));
  }

  return arcsByTransitionId;
}

function outputArcsByTransitionId(net: TypedPetriNet): Map<string, TypedArc[]> {
  const arcsByTransitionId = new Map<string, TypedArc[]>();
  const transitionIds = new Set(net.transitions.map((transition) => transition.id));

  for (const arc of net.arcs) {
    if (
      arc.kind !== "ordinary" ||
      !transitionIds.has(arc.sourceId)
    ) {
      continue;
    }

    const arcs = arcsByTransitionId.get(arc.sourceId) ?? [];
    arcs.push(arc);
    arcsByTransitionId.set(arc.sourceId, arcs);
  }

  for (const arcs of arcsByTransitionId.values()) {
    arcs.sort((left, right) => left.id.localeCompare(right.id));
  }

  return arcsByTransitionId;
}

interface CrossCaseObjectAwareRealizabilityCaches {
  enabledOccurrencesByMarkingKey: Map<string, TypedTransitionOccurrence[]>;
  localPreparationByKey: Map<string, boolean>;
}

function createCrossCaseObjectAwareRealizabilityCaches(): CrossCaseObjectAwareRealizabilityCaches {
  return {
    enabledOccurrencesByMarkingKey: new Map(),
    localPreparationByKey: new Map(),
  };
}

function existsTypedLocalPreparationToEnableSender(args: {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
  start: TypedMarking;
  position: CrossCaseSenderProgressionPosition;
  token: TypedToken;
  localTransitionIds: string[];
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
  maxMarkings?: number;
  caches: CrossCaseObjectAwareRealizabilityCaches;
}): boolean {
  const maxMarkings = args.maxMarkings ?? 10000;
  const localTransitionKey = stableSetKey(args.localTransitionIds);
  const targetTransitionKey = stableSetKey(args.position.senderTransitionIds);
  const cacheKey = `${typedMarkingKey(args.start)}::${args.position.controlFlowPlaceId}::${typedTokenKey(args.token)}::${localTransitionKey}::${targetTransitionKey}`;
  const cached = args.caches.localPreparationByKey.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const localTransitionIds = new Set(args.localTransitionIds);
  const visited = new Set<string>();
  const queue: TypedMarking[] = [args.start];
  const arcsBySenderTransitionId = senderInputArcsByTransitionId(args.net);

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (!markingContainsToken(current, args.position.controlFlowPlaceId, args.token)) {
      continue;
    }

    const currentKey = typedMarkingKey(current);

    if (visited.has(currentKey)) {
      continue;
    }

    visited.add(currentKey);

    if (visited.size > maxMarkings) {
      throw new Error(
        `Cross-case sender local-preparation search exceeded maximum of ${maxMarkings} markings`,
      );
    }

    const enabledOccurrences = getCachedEnabledOccurrences({
      net: args.net,
      domains: args.domains,
      marking: current,
      markingKey: currentKey,
      enabledOccurrencesByMarkingKey: new Map(),
      fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
      caches: args.caches,
    });

    if (
      senderCanConsumeCaseToken({
        position: args.position,
        token: args.token,
        enabledOccurrences,
        arcsBySenderTransitionId,
      })
    ) {
      args.caches.localPreparationByKey.set(cacheKey, true);
      return true;
    }

    for (const occurrence of enabledOccurrences.filter((occurrence) =>
      localTransitionIds.has(occurrence.transitionId),
    )) {
      queue.push(
        fireTypedTransitionOccurrence({
          net: args.net,
          marking: current,
          occurrence,
        }),
      );
    }
  }

  args.caches.localPreparationByKey.set(cacheKey, false);
  return false;
}

function getCachedEnabledOccurrences(args: {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
  marking: TypedMarking;
  markingKey: string;
  enabledOccurrencesByMarkingKey: Map<string, TypedTransitionOccurrence[]>;
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
  caches: CrossCaseObjectAwareRealizabilityCaches;
}): TypedTransitionOccurrence[] {
  const fromStateSpace = args.enabledOccurrencesByMarkingKey.get(args.markingKey);

  if (fromStateSpace) {
    return fromStateSpace;
  }

  const cached = args.caches.enabledOccurrencesByMarkingKey.get(args.markingKey);

  if (cached) {
    return cached;
  }

  const enabledOccurrences = getEnabledTypedTransitionOccurrences({
    net: args.net,
    marking: args.marking,
    domains: args.domains,
    fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
  });
  args.caches.enabledOccurrencesByMarkingKey.set(args.markingKey, enabledOccurrences);
  return enabledOccurrences;
}

function enabledOccurrencesByMarkingKeyFromStateSpace(
  entries: Array<{ markingKey: string; occurrence: TypedTransitionOccurrence }>,
): Map<string, TypedTransitionOccurrence[]> {
  const enabledOccurrencesByMarkingKey = new Map<
    string,
    TypedTransitionOccurrence[]
  >();

  for (const entry of entries) {
    if (entry.markingKey.length === 0) {
      continue;
    }

    const occurrences = enabledOccurrencesByMarkingKey.get(entry.markingKey) ?? [];
    occurrences.push(entry.occurrence);
    enabledOccurrencesByMarkingKey.set(entry.markingKey, occurrences);
  }

  for (const occurrences of enabledOccurrencesByMarkingKey.values()) {
    occurrences.sort(compareOccurrences);
  }

  return enabledOccurrencesByMarkingKey;
}

function markingContainsToken(
  marking: TypedMarking,
  placeId: string,
  token: TypedToken,
): boolean {
  const tokenKey = typedTokenKey(token);

  return (marking.get(placeId) ?? []).some(
    (candidate) => typedTokenKey(candidate) === tokenKey,
  );
}

function inscriptionMatchesToken(
  arc: TypedArc,
  occurrence: TypedTransitionOccurrence,
  token: TypedToken,
): boolean {
  if (arc.inscription.length !== token.length) {
    return false;
  }

  return arc.inscription.every((element, index) => {
    const tokenValue = token[index];

    return (
      tokenValue?.typeId === element.typeId &&
      occurrence.binding[element.variableId] === tokenValue.value
    );
  });
}

function isTransmissionPlace(place: TypedPlace | undefined): boolean {
  return (
    place !== undefined &&
    (place.id.startsWith("Place_tx_") || /\btransmission\b/i.test(place.name))
  );
}

function isCaseSinkPlace(place: TypedPlace | undefined): boolean {
  return (
    place !== undefined &&
    place.tupleType.length === 1 &&
    caseTypeIdFromNetPlace(place) !== undefined &&
    (place.id === "Place_sink" || /^sink$/i.test(place.name))
  );
}

function isCaseControlFlowPlace(place: TypedPlace | undefined): place is TypedPlace {
  return (
    place !== undefined &&
    place.tupleType.length === 1 &&
    caseTypeIdFromNetPlace(place) !== undefined &&
    !isCaseSinkPlace(place) &&
    !isTransmissionPlace(place) &&
    !/\bparticipation\b/i.test(place.name) &&
    !/\binclusion\b/i.test(place.name)
  );
}

function isParticipantObjectPlace(place: TypedPlace): boolean {
  return (
    place.tupleType.length === 2 &&
    place.tupleType.some(isRoleTypeId) &&
    place.tupleType.some(
      (typeId) =>
        !isRoleTypeId(typeId) && !/DataClass_Case$/.test(typeId),
    )
  );
}

function isRoleTypeId(typeId: string): boolean {
  return /DataClass_Role/.test(typeId);
}

function caseTypeIdFromNetPlace(place: TypedPlace): string | undefined {
  return place.tupleType.find((typeId) => /DataClass_Case$/.test(typeId));
}

function isSenderTransition(transition: { id: string; name: string }): boolean {
  return (
    /^Transition_send_/.test(transition.id) ||
    /\bSend(?:\s|$)/.test(transition.name)
  );
}

function isAtomicTaskTransition(transition: { id: string }): boolean {
  return /^Transition_task_/.test(transition.id);
}

function isGatewayBranchTransition(transition: { id: string; name: string }): boolean {
  return (
    /^Transition_gateway_/.test(transition.id) &&
    /\bBranch\b/.test(transition.name)
  );
}

function hasStateAwarenessGuardArc(
  inputArcs: TypedArc[],
  placesById: Map<string, TypedPlace>,
): boolean {
  return inputArcs.some((arc) => {
    const place = placesById.get(arc.sourceId);

    return place !== undefined && isStateAwarenessPlace(place);
  });
}

function isStateAwarenessPlace(place: TypedPlace): boolean {
  return (
    place.id.startsWith("Place_state_") ||
    /\bstate\b/i.test(place.name)
  ) && isParticipantObjectPlace(place);
}

function gatewayDetailsFromBranchTransition(transition: {
  id: string;
  name: string;
}): {
  gatewayId?: string;
  gatewayName?: string;
} {
  const idMatch = /^Transition_gateway_(Gateway_[^_]+)_/.exec(transition.id);
  const nameMatch = /^(.+?) Branch\b/.exec(transition.name);

  return {
    gatewayId: idMatch?.[1],
    gatewayName: nameMatch?.[1],
  };
}

function inferLocalLifecycleTransitionIds(net: TypedPetriNet): string[] {
  const placesById = new Map(net.places.map((place) => [place.id, place]));

  return net.transitions
    .filter((transition) =>
      isLocalLifecycleTransition({
        net,
        transitionId: transition.id,
        placesById,
      }),
    )
    .map((transition) => transition.id)
    .sort();
}

function isLocalLifecycleTransition(args: {
  net: TypedPetriNet;
  transitionId: string;
  placesById: Map<string, TypedPlace>;
}): boolean {
  if (isExcludedPreparationTransition(args.transitionId)) {
    return false;
  }

  const adjacentPlaceIds = args.net.arcs
    .filter(
      (arc) =>
        arc.sourceId === args.transitionId || arc.targetId === args.transitionId,
    )
    .map((arc) =>
      arc.sourceId === args.transitionId ? arc.targetId : arc.sourceId,
    );
  const adjacentPlaces = adjacentPlaceIds
    .map((placeId) => args.placesById.get(placeId))
    .filter((place): place is TypedPlace => place !== undefined);

  if (adjacentPlaces.some(isTransmissionPlace)) {
    return false;
  }

  if (/^Transition_create_/.test(args.transitionId)) {
    return adjacentPlaces.some(isParticipantObjectPlace);
  }

  if (/^Transition_local_/.test(args.transitionId)) {
    return adjacentPlaces.some(isParticipantObjectPlace);
  }

  return (
    adjacentPlaces.some(isParticipantObjectPlace) &&
    !adjacentPlaces.some(isCaseControlFlowPlace)
  );
}

function isExcludedPreparationTransition(transitionId: string): boolean {
  return (
    /^Transition_send_/.test(transitionId) ||
    /^Transition_task_/.test(transitionId) ||
    /^Transition_receive_/.test(transitionId) ||
    /^Transition_gateway_/.test(transitionId) ||
    /^Transition_parallel_/.test(transitionId) ||
    /^Transition_start_/.test(transitionId) ||
    /^Transition_end_/.test(transitionId)
  );
}

function taskIdFromReceiveTransitionId(transitionId: string): string | undefined {
  const match = /^Transition_receive_(ChoreographyTask_[^_]+)(?:_|$)/.exec(
    transitionId,
  );

  return match?.[1];
}

function taskIdFromTransmissionPlace(place: TypedPlace): string | undefined {
  const match = /^Place_tx_(.+)$/.exec(place.id);

  return match?.[1];
}

function taskNameFromTransmissionPlace(place: TypedPlace): string | undefined {
  const suffix = " Transmission";

  if (!place.name.endsWith(suffix)) {
    return undefined;
  }

  return place.name.slice(0, -suffix.length);
}

function taskIdFromSenderTransitionId(transitionId: string): string | undefined {
  const match = /^Transition_send_(.+?)(?:_(?:bound|bind)(?:_|$).*)?$/.exec(
    transitionId,
  );

  return match?.[1];
}

function taskIdFromAtomicTransitionId(transitionId: string): string | undefined {
  const match = /^Transition_task_(ChoreographyTask_[^_]+)(?:_|$)/.exec(
    transitionId,
  );

  return match?.[1];
}

function taskNameFromSenderTransitionName(name: string): string | undefined {
  const match = /^(.+?) Send(?: Bound| Bind)?$/.exec(name);

  return match?.[1];
}

function taskNameFromAtomicTransitionName(name: string): string | undefined {
  return name.length > 0 ? name : undefined;
}

function senderPositionLabel(position: CrossCaseSenderProgressionPosition): string {
  const names = position.taskNames ?? [];

  if (names.length > 0) {
    return names.join(" / ");
  }

  const ids = position.taskIds ?? [];

  if (ids.length > 0) {
    return ids.join(" / ");
  }

  return position.taskName ?? position.taskId ?? position.id;
}

function compareSenderProgressionViolations(
  left: CrossCaseSenderProgressionViolation,
  right: CrossCaseSenderProgressionViolation,
): number {
  return (
    left.markingKey.localeCompare(right.markingKey) ||
    left.controlFlowPlaceId.localeCompare(right.controlFlowPlaceId) ||
    left.caseTokenKey.localeCompare(right.caseTokenKey) ||
    left.senderTransitionIds.join(",").localeCompare(right.senderTransitionIds.join(","))
  );
}

function firstCrossCaseViolation(args: {
  projectedChoreographySoundness: ProjectedChoreographySoundnessResult;
  senderViolations: CrossCaseSenderProgressionViolation[];
  receiverViolations: CrossCaseReceiverProgressionViolation[];
  decisionViolations: CrossCaseDecisionConsistencyViolation[];
}): CrossCaseObjectAwareRealizabilityReport["objectAwareRealizability"]["firstViolation"] {
  if (!args.projectedChoreographySoundness.holds) {
    return {
      subproperty: "projectedChoreographySoundness",
    };
  }

  const senderViolation = args.senderViolations[0];
  if (senderViolation) {
    return {
      subproperty: "senderProgression",
    };
  }

  const receiverViolation = args.receiverViolations[0];
  if (receiverViolation) {
    return {
      subproperty: "receiverProgression",
    };
  }

  const decisionViolation = args.decisionViolations[0];
  if (decisionViolation) {
    return {
      subproperty: "decisionConsistency",
    };
  }

  return undefined;
}

function compareReceiverProgressionViolations(
  left: CrossCaseReceiverProgressionViolation,
  right: CrossCaseReceiverProgressionViolation,
): number {
  return (
    left.markingKey.localeCompare(right.markingKey) ||
    left.transmissionPlaceId.localeCompare(right.transmissionPlaceId) ||
    left.transmissionTokenKey.localeCompare(right.transmissionTokenKey)
  );
}

function compareDecisionDeterminismViolations(
  left: CrossCaseDecisionConsistencyViolation,
  right: CrossCaseDecisionConsistencyViolation,
): number {
  return (
    left.markingKey.localeCompare(right.markingKey) ||
    left.controlFlowPlaceId.localeCompare(right.controlFlowPlaceId) ||
    left.caseTokenKey.localeCompare(right.caseTokenKey) ||
    left.branchTransitionIds.join(",").localeCompare(right.branchTransitionIds.join(","))
  );
}

function compareCaseOptionToCompleteViolations(
  left: CrossCaseCaseOptionToCompleteViolation,
  right: CrossCaseCaseOptionToCompleteViolation,
): number {
  return (
    left.nodeId - right.nodeId ||
    left.caseId.localeCompare(right.caseId) ||
    left.markingKey.localeCompare(right.markingKey)
  );
}

function compareViolations(
  left:
    | CrossCaseCaseOptionToCompleteViolation
    | CrossCaseSenderProgressionViolation
    | CrossCaseReceiverProgressionViolation
    | CrossCaseDecisionConsistencyViolation,
  right:
    | CrossCaseCaseOptionToCompleteViolation
    | CrossCaseSenderProgressionViolation
    | CrossCaseReceiverProgressionViolation
    | CrossCaseDecisionConsistencyViolation,
): number {
  return (
    (left.markingKey ?? "").localeCompare(right.markingKey ?? "") ||
    left.kind.localeCompare(right.kind) ||
    violationStableKey(left).localeCompare(violationStableKey(right))
  );
}

function violationStableKey(
  violation:
    | CrossCaseCaseOptionToCompleteViolation
    | CrossCaseSenderProgressionViolation
    | CrossCaseReceiverProgressionViolation
    | CrossCaseDecisionConsistencyViolation,
): string {
  if (violation.kind === "case-option-to-complete") {
    return [violation.nodeId.toString(), violation.caseId].join("|");
  }

  if (violation.kind === "sender-progression") {
    return [
      violation.controlFlowPlaceId,
      violation.caseTokenKey,
      violation.senderTransitionIds.join(","),
    ].join("|");
  }

  if (violation.kind === "decision-consistency") {
    return [
      violation.controlFlowPlaceId,
      violation.caseTokenKey,
      violation.branchTransitionIds.join(","),
      violation.enabledBranchTransitionIds.join(","),
    ].join("|");
  }

  return [
    violation.transmissionPlaceId,
    violation.transmissionTokenKey,
    violation.receiverTransitionIds.join(","),
  ].join("|");
}

function compareOccurrences(
  left: TypedTransitionOccurrence,
  right: TypedTransitionOccurrence,
): number {
  return (
    left.transitionId.localeCompare(right.transitionId) ||
    JSON.stringify(left.binding).localeCompare(JSON.stringify(right.binding))
  );
}

function stableSetKey(values: string[]): string {
  return [...new Set(values)].sort().join(",");
}

function formatList(values: string[]): string {
  return values.length === 0 ? "<none>" : values.join(", ");
}
