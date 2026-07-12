import type {
  TypedMarking,
  TypedToken,
} from "../../targets/typedPetriNet/index.js";
import type { ProjectedChoreographySoundnessResult } from "../projectedChoreographySoundness/index.js";

export interface CrossCaseReceiverProgressionTransmission {
  id: string;
  taskId?: string;
  taskName?: string;
  placeId: string;
  placeName?: string;
  receiverTransitionIds: string[];
}

export interface CrossCaseSenderProgressionPosition {
  id: string;
  taskId?: string;
  taskName?: string;
  taskIds?: string[];
  taskNames?: string[];
  controlFlowPlaceId: string;
  controlFlowPlaceName?: string;
  senderTransitionIds: string[];
}

export interface CrossCaseDecisionDeterminismGateway {
  id: string;
  gatewayId?: string;
  gatewayName?: string;
  controlFlowPlaceId: string;
  controlFlowPlaceName?: string;
  branchTransitionIds: string[];
}

export type CrossCaseObjectAwareRealizabilityViolation =
  | CrossCaseSenderProgressionViolation
  | CrossCaseReceiverProgressionViolation
  | CrossCaseDecisionConsistencyViolation
  | CrossCaseCaseOptionToCompleteViolation;

export interface CrossCaseSenderProgressionViolation {
  kind: "sender-progression";
  message: string;
  markingKey: string;
  controlFlowPlaceId: string;
  controlFlowPlaceName?: string;
  caseToken: TypedToken;
  caseTokenKey: string;
  caseId: string;
  taskId?: string;
  taskName?: string;
  taskIds?: string[];
  taskNames?: string[];
  senderTransitionIds: string[];
  localTransitionIds: string[];
}

export interface CrossCaseReceiverProgressionViolation {
  kind: "receiver-progression";
  message: string;
  markingKey: string;
  transmissionPlaceId: string;
  transmissionPlaceName?: string;
  transmissionToken: TypedToken;
  transmissionTokenKey: string;
  taskId?: string;
  taskName?: string;
  receiverTransitionIds: string[];
}

export type CrossCaseDecisionDeterminismViolationClassification =
  | "no-enabled-branch"
  | "multiple-enabled-branches";

export interface CrossCaseDecisionConsistencyViolation {
  kind: "decision-consistency";
  message: string;
  markingKey: string;
  gatewayId?: string;
  gatewayName?: string;
  controlFlowPlaceId: string;
  controlFlowPlaceName?: string;
  caseToken: TypedToken;
  caseTokenKey: string;
  caseId: string;
  branchTransitionIds: string[];
  enabledBranchTransitionIds: string[];
  enabledBranchCount: number;
  classification: CrossCaseDecisionDeterminismViolationClassification;
}

export interface CrossCaseCaseOptionToCompleteViolation {
  kind: "case-option-to-complete";
  message: string;
  markingKey: string;
  nodeId: number;
  caseId: string;
  witnessPath?: Array<{
    transitionId: string;
    binding: Record<string, string>;
  }>;
}

export interface CrossCaseObjectAwareRealizabilityReport {
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
      witnessPath?: Array<{
        transitionId: string;
        binding: Record<string, string>;
      }>;
    };
  };
  crossCaseAnalysis: {
    holds: boolean;
    subproperties: {
      caseOptionToComplete: boolean;
      projectedChoreographySoundness: boolean;
      properInteractionCompletion: boolean;
      taskCoverage: boolean;
      branchCoverage: boolean;
      senderProgression: boolean;
      receiverProgression: boolean;
      decisionConsistency: boolean;
    };
  };
  stateSpace: {
    markings: number;
    edges: number;
    truncated: boolean;
    truncationReasons: Array<"maxMarkings" | "maxDepth">;
    limits: {
      maxMarkings: number;
      maxDepth: number;
    };
  };
  metadata: {
    caseOptionToCompleteSemantics: string;
    activeCases: number;
    checkedCaseStatePairs: number;
    taskCoverageTasks: number;
    branchCoverageBranches: number;
    senderPositions: number;
    transmissions: number;
    decisionGateways: number;
    localTransitions: number;
  };
  diagnostics: {
    optionToCompleteViolations: number;
    caseOptionToCompleteViolations: number;
    properInteractionCompletionViolations: number;
    uncoveredTasks: number;
    uncoveredBranches: number;
    senderProgressionViolations: number;
    receiverProgressionViolations: number;
    decisionConsistencyViolations: number;
  };
  projectedChoreographySoundness: ProjectedChoreographySoundnessResult;
  caseOptionToComplete: {
    holds: boolean;
    violationCount: number;
    activeCaseCount: number;
    checkedPairCount: number;
    completionSemantics: string;
    violations: CrossCaseCaseOptionToCompleteViolation[];
  };
  senderProgression: {
    holds: boolean;
    violations: CrossCaseSenderProgressionViolation[];
  };
  receiverProgression: {
    holds: boolean;
    violations: CrossCaseReceiverProgressionViolation[];
  };
  decisionConsistency: {
    holds: boolean;
    violations: CrossCaseDecisionConsistencyViolation[];
  };
  violations: CrossCaseObjectAwareRealizabilityViolation[];
}

export interface CrossCaseObjectAwareRealizabilityStateSpaceNode {
  marking: TypedMarking;
  markingKey: string;
}
