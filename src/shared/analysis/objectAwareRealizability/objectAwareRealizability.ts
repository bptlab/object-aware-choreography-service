import type {
  ObjectAwareAnomalyReport,
  ObjectAwareAnomaly,
  DecisionDeterminismViolation,
} from "../objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";
import type { ProjectedChoreographySoundnessResult } from "../projectedChoreographySoundness/index.js";

type SenderProgressionViolation = Extract<
  ObjectAwareAnomaly,
  { kind: "sender-progression" }
>;
type ReceiverProgressionViolation = Extract<
  ObjectAwareAnomaly,
  { kind: "receiver-progression" }
>;

export interface DecisionConsistencyViolation
  extends Omit<DecisionDeterminismViolation, "kind" | "message"> {
  kind: "decision-consistency";
  message: string;
  classification: "noneEnabled" | "multipleEnabled";
}

export type ObjectAwareRealizabilityViolation =
  | SenderProgressionViolation
  | ReceiverProgressionViolation
  | DecisionConsistencyViolation;

export interface ObjectAwareRealizabilityReport {
  objectAwareRealizability: {
    holds: boolean;
    assumptions: {
      controlFlowSoundness: "assumedExternal";
      controlFlowRealizability: "assumedExternal";
    };
    subproperties: {
      projectedChoreographySoundness: ProjectedChoreographySoundnessResult;
      senderProgression: boolean;
      receiverProgression: boolean;
      decisionConsistency: boolean;
    };
    firstViolation?: {
      subproperty:
        | "projectedChoreographySoundness"
        | "senderProgression"
        | "receiverProgression"
        | "decisionConsistency";
      witnessPath?: string[];
    };
  };
  stateSpace: {
    markings: number;
    edges: number;
  };
  metadata: {
    senderPositions: number;
    transmissions: number;
    decisionGateways: number;
    branchAlternatives: number;
    localTransitions: number;
    localTransitionsByRole: Record<string, number>;
  };
  diagnostics: {
    senderProgressionViolations: number;
    receiverProgressionViolations: number;
    decisionConsistencyViolations: number;
    optionToCompleteViolations: number;
    properInteractionCompletionViolations: number;
    uncoveredTasks: number;
    uncoveredBranches: number;
  };
  projectedChoreographySoundness: ProjectedChoreographySoundnessResult;
  senderProgression: {
    holds: boolean;
    violationCount: number;
    violations: SenderProgressionViolation[];
  };
  receiverProgression: {
    holds: boolean;
    violationCount: number;
    violations: ReceiverProgressionViolation[];
  };
  decisionConsistency: {
    holds: boolean;
    violationCount: number;
    violations: DecisionConsistencyViolation[];
  };
  violations: ObjectAwareRealizabilityViolation[];
}

export function buildObjectAwareRealizabilityReport(args: {
  anomalyReport: ObjectAwareAnomalyReport;
  projectedChoreographySoundness: ProjectedChoreographySoundnessResult;
}): ObjectAwareRealizabilityReport {
  const senderViolations = args.anomalyReport.violations.filter(
    (violation): violation is SenderProgressionViolation =>
      violation.kind === "sender-progression",
  );
  const receiverViolations = args.anomalyReport.violations.filter(
    (violation): violation is ReceiverProgressionViolation =>
      violation.kind === "receiver-progression",
  );
  const decisionViolations = args.anomalyReport.violations
    .filter(
      (violation): violation is DecisionDeterminismViolation =>
        violation.kind === "decision-determinism",
    )
    .map(toDecisionConsistencyViolation);
  const violations = [
    ...senderViolations,
    ...receiverViolations,
    ...decisionViolations,
  ];
  const senderProgressionHolds = senderViolations.length === 0;
  const receiverProgressionHolds = receiverViolations.length === 0;
  const decisionConsistencyHolds = decisionViolations.length === 0;
  const holds =
    args.projectedChoreographySoundness.holds &&
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
        projectedChoreographySoundness: args.projectedChoreographySoundness,
        senderProgression: senderProgressionHolds,
        receiverProgression: receiverProgressionHolds,
        decisionConsistency: decisionConsistencyHolds,
      },
      firstViolation: firstViolation({
        projectedChoreographySoundness: args.projectedChoreographySoundness,
        senderViolations,
        receiverViolations,
        decisionViolations,
      }),
    },
    stateSpace: args.anomalyReport.stateSpace,
    metadata: {
      senderPositions: args.anomalyReport.metadata.senderPositions,
      transmissions: args.anomalyReport.metadata.transmissions,
      decisionGateways: args.anomalyReport.metadata.decisionGateways,
      branchAlternatives: args.anomalyReport.metadata.branches,
      localTransitions: args.anomalyReport.metadata.localTransitions,
      localTransitionsByRole: args.anomalyReport.metadata.localTransitionsByRole,
    },
    diagnostics: {
      senderProgressionViolations: senderViolations.length,
      receiverProgressionViolations: receiverViolations.length,
      decisionConsistencyViolations: decisionViolations.length,
      optionToCompleteViolations:
        args.projectedChoreographySoundness.optionToComplete.violatingStateCount,
      properInteractionCompletionViolations:
        args.projectedChoreographySoundness.properInteractionCompletion
          .violatingStateCount,
      uncoveredTasks:
        args.projectedChoreographySoundness.taskCoverage.uncoveredTaskIds.length,
      uncoveredBranches:
        args.projectedChoreographySoundness.branchCoverage.uncoveredBranchIds
          .length,
    },
    projectedChoreographySoundness: args.projectedChoreographySoundness,
    senderProgression: {
      holds: senderProgressionHolds,
      violationCount: senderViolations.length,
      violations: senderViolations,
    },
    receiverProgression: {
      holds: receiverProgressionHolds,
      violationCount: receiverViolations.length,
      violations: receiverViolations,
    },
    decisionConsistency: {
      holds: decisionConsistencyHolds,
      violationCount: decisionViolations.length,
      violations: decisionViolations,
    },
    violations,
  };
}

function toDecisionConsistencyViolation(
  violation: DecisionDeterminismViolation,
): DecisionConsistencyViolation {
  return {
    ...violation,
    kind: "decision-consistency",
    message: violation.message.replace(
      "Decision determinism violation",
      "Decision consistency violation",
    ),
    classification:
      violation.enabledBranchCount === 0 ? "noneEnabled" : "multipleEnabled",
  };
}

function firstViolation(args: {
  projectedChoreographySoundness: ProjectedChoreographySoundnessResult;
  senderViolations: SenderProgressionViolation[];
  receiverViolations: ReceiverProgressionViolation[];
  decisionViolations: DecisionConsistencyViolation[];
}): ObjectAwareRealizabilityReport["objectAwareRealizability"]["firstViolation"] {
  if (!args.projectedChoreographySoundness.holds) {
    return {
      subproperty: "projectedChoreographySoundness",
    };
  }

  const senderViolation = args.senderViolations[0];
  if (senderViolation) {
    return {
      subproperty: "senderProgression",
      witnessPath: senderViolation.traceText,
    };
  }

  const receiverViolation = args.receiverViolations[0];
  if (receiverViolation) {
    return {
      subproperty: "receiverProgression",
      witnessPath: receiverViolation.traceText,
    };
  }

  const decisionViolation = args.decisionViolations[0];
  if (decisionViolation) {
    return {
      subproperty: "decisionConsistency",
      witnessPath: decisionViolation.traceText,
    };
  }

  return undefined;
}
