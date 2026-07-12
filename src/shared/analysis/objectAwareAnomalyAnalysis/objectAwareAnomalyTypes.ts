import type { ObjectAwareAnomalyTraceStep } from "./traces.js";

export interface TaskInteractionMetadata {
  taskId: string;
  taskName: string;
  senderRole: string;
  receiverRole: string;
  preControlFlowPlaceId: string;
  postControlFlowPlaceId: string;
  transmissionPlaceId: string;
  senderTransitionIds: string[];
  receiverTransitionIds: string[];
  kind: "communication" | "synchronization" | "combined";
}

export interface SenderProgressionPosition {
  id: string;
  label?: string;
  placeId: string;
  kind: "direct-task" | "event-based-gateway";
  taskIds: string[];
  taskNames?: string[];
  senderTransitionIds: string[];
}

export interface ReceiverProgressionTransmission {
  id: string;
  taskId: string;
  taskName: string;
  placeId: string;
  receiverRole: string;
  receiverTransitionIds: string[];
}

export interface DecisionDeterminismGateway {
  gatewayId: string;
  gatewayName?: string;
  incomingPlaceIds: string[];
  branchTransitionIds: string[];
  affectedRoles: string[];
}

export type BranchKind = "exclusive" | "event-based";

export interface DeadBranchAbsenceBranch {
  id: string;
  kind: BranchKind;
  gatewayId: string;
  gatewayName?: string;
  branchLabel?: string;
  entryPlaceId: string;
  targetNodeId: string;
  targetNodeName?: string;
  transitionIds: string[];
}

export interface ObjectAwareRealizabilityMetadata {
  taskInteractions: TaskInteractionMetadata[];
  senderPositions: SenderProgressionPosition[];
  transmissions: ReceiverProgressionTransmission[];
  decisionGateways: DecisionDeterminismGateway[];
  branches: DeadBranchAbsenceBranch[];
  localTransitionsByRole: Map<string, string[]>;
}

export function createObjectAwareRealizabilityMetadata(): ObjectAwareRealizabilityMetadata {
  return {
    taskInteractions: [],
    senderPositions: [],
    transmissions: [],
    decisionGateways: [],
    branches: [],
    localTransitionsByRole: new Map(),
  };
}

export function registerLocalTransition(
  metadata: ObjectAwareRealizabilityMetadata,
  role: string | undefined,
  transitionId: string,
): void {
  if (!role) {
    throw new Error(
      `Local lifecycle transition ${transitionId} could not be assigned to a role`,
    );
  }

  const transitionIds = metadata.localTransitionsByRole.get(role) ?? [];

  if (!transitionIds.includes(transitionId)) {
    transitionIds.push(transitionId);
    metadata.localTransitionsByRole.set(role, transitionIds);
  }
}

export function getAllLocalTransitionIds(
  metadata: ObjectAwareRealizabilityMetadata,
): string[] {
  return [...new Set([...metadata.localTransitionsByRole.values()].flat())].sort();
}

export interface MarkedPlaceSummary {
  placeId: string;
  placeLabel?: string;
  tokens: number;
}

export type ObjectAwareAnomalyKind =
  | "sender-progression"
  | "receiver-progression"
  | "decision-determinism"
  | "dead-branch-absence";

export interface BaseObjectAwareAnomaly {
  kind: ObjectAwareAnomalyKind;
  message: string;
  markingKey?: string;
  marking?: Record<string, number>;
  markedPlaces?: MarkedPlaceSummary[];
  trace: ObjectAwareAnomalyTraceStep[];
  traceText: string[];
}

export interface SenderProgressionViolation
  extends BaseObjectAwareAnomaly {
  kind: "sender-progression";
  positionId: string;
  positionLabel?: string;
  positionKind: "direct-task" | "event-based-gateway";
  placeId: string;
  placeLabel?: string;
  taskIds: string[];
  taskNames?: string[];
  senderTransitionIds: string[];
  localTransitionIds: string[];
}

export interface ReceiverProgressionViolation
  extends BaseObjectAwareAnomaly {
  kind: "receiver-progression";
  transmissionId: string;
  taskId: string;
  taskName: string;
  receiverRole: string;
  transmissionPlaceId: string;
  transmissionPlaceLabel?: string;
  receiverTransitionIds: string[];
}

export interface DecisionDeterminismViolation
  extends BaseObjectAwareAnomaly {
  kind: "decision-determinism";
  gatewayId: string;
  gatewayName?: string;
  incomingPlaceIds: string[];
  markedIncomingPlaceIds: string[];
  affectedRoles: string[];
  branchTransitionIds: string[];
  enabledBranchTransitionIds: string[];
  enabledBranchCount: number;
}

export interface DeadBranchAbsenceViolation
  extends BaseObjectAwareAnomaly {
  kind: "dead-branch-absence";
  branchId: string;
  branchKind: BranchKind;
  branchLabel?: string;
  gatewayId: string;
  gatewayName?: string;
  entryPlaceId: string;
  entryPlaceLabel?: string;
  targetNodeId: string;
  targetNodeName?: string;
  branchTransitionIds: string[];
  markingsChecked: number;
}

export type ObjectAwareAnomaly =
  | SenderProgressionViolation
  | ReceiverProgressionViolation
  | DecisionDeterminismViolation
  | DeadBranchAbsenceViolation;

export interface ObjectAwareAnomalyReport {
  anomalyFree: boolean;
  assumesInteractionRealizability: true;
  stateSpace: {
    markings: number;
    edges: number;
  };
  metadata: {
    senderPositions: number;
    transmissions: number;
    decisionGateways: number;
    branches: number;
    localTransitions: number;
    localTransitionsByRole: Record<string, number>;
  };
  diagnostics: {
    senderProgressionViolations: number;
    receiverProgressionViolations: number;
    decisionDeterminismViolations: number;
    deadBranchAbsenceViolations: number;
  };
  violations: ObjectAwareAnomaly[];
}
