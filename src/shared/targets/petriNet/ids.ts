import type {
  BaseElement,
  ExclusiveGateway,
  FlowNode,
  SequenceFlow,
} from "bpmn-moddle";
import { joinIdParts, sanitizeIdPart } from "../../ids/sanitization.js";

type RoleId = string;
type ClassId = string;
type StateId = string;

type BranchCondition = {
  classId: ClassId;
  stateId: StateId;
};

export function sanitizeId(id: string): string {
  const sanitized = id.replace(/[^A-Za-z0-9_.-]/g, "_");

  if (/^[A-Za-z_]/.test(sanitized)) {
    return sanitized;
  }

  return `_${sanitized}`;
}

export function placeIdForSequenceFlow(flow: SequenceFlow): string {
  return `p_sf_${sanitizeIdPart(flow.id)}`;
}

export function transitionIdForNode(node: BaseElement): string {
  return `t_${sanitizeIdPart(node.id)}`;
}

export function transitionIdForExclusiveSplit(
  gateway: ExclusiveGateway,
  targetNode: FlowNode,
  branchCondition?: BranchCondition,
): string {
  const branchConditionSuffix = branchCondition
    ? `_${joinIdParts(branchCondition.classId, branchCondition.stateId)}`
    : "";

  return `t_xor_${joinIdParts(gateway.id, targetNode.id)}${branchConditionSuffix}`;
}

export function transitionIdForExclusiveJoin(
  sourceNode: FlowNode,
  gateway: ExclusiveGateway,
): string {
  return `t_xor_${joinIdParts(sourceNode.id, gateway.id)}`;
}

export function transitionIdForParallelGateway(gateway: BaseElement): string {
  return `t_parallel_${sanitizeIdPart(gateway.id)}`;
}

export function existencePlaceId(role: RoleId, classId: ClassId): string {
  return `p_exists_${joinIdParts(role, classId)}`;
}

export function statePlaceId(
  role: RoleId,
  classId: ClassId,
  stateId: StateId,
): string {
  return `p_state_${joinIdParts(role, classId, stateId)}`;
}

export function localLifecycleTransitionId(
  role: RoleId,
  classId: ClassId,
  sourceStateId: StateId,
  targetStateId: StateId,
): string {
  return `t_local_${joinIdParts(role, classId, sourceStateId, targetStateId)}`;
}

export function compositeOneToOneCreationTransitionId(
  role: RoleId,
  entries: Array<{ classId: ClassId; targetStateId: StateId }>,
): string {
  const serializedEntries = normalizeCompositeCreationEntries(entries)
    .map((entry) => joinIdParts(entry.classId, entry.targetStateId))
    .join("__");

  return `t_create_1to1_${sanitizeIdPart(role)}_${serializedEntries}`;
}

function normalizeCompositeCreationEntries(
  entries: Array<{ classId: ClassId; targetStateId: StateId }>,
): Array<{ classId: ClassId; targetStateId: StateId }> {
  return [...entries].sort((left, right) => {
    const leftKey = joinIdParts(left.classId, left.targetStateId);
    const rightKey = joinIdParts(right.classId, right.targetStateId);
    return leftKey.localeCompare(rightKey);
  });
}

export function transmissionPlaceId(taskId: string): string {
  return `p_trans_${sanitizeIdPart(taskId)}`;
}

export function communicationSendTransitionId(
  taskId: string,
  classId: ClassId,
  stateId: StateId,
): string {
  return `t_send_${joinIdParts(taskId, classId, stateId)}`;
}

export function communicationReceiveTransitionId(
  taskId: string,
  classId: ClassId,
  compatibleStateId: StateId,
  targetStateId: StateId,
): string {
  return `t_recv_${joinIdParts(
    taskId,
    classId,
    compatibleStateId,
    targetStateId,
  )}`;
}

export function synchronizedSendTransitionId(
  taskId: string,
  sourceCombination: Map<string, StateId>,
): string {
  return `t_sync_send_${sanitizeIdPart(taskId)}_${serializeSourceCombination(sourceCombination)}`;
}

export function synchronizedReceiveTransitionId(
  taskId: string,
  sourceCombination: Map<string, StateId>,
): string {
  return `t_sync_recv_${sanitizeIdPart(taskId)}_${serializeSourceCombination(sourceCombination)}`;
}

export function combinedSendTransitionId(
  taskId: string,
  communicatedClassId: ClassId,
  communicatedStateId: StateId,
  sourceCombination: Map<string, StateId>,
): string {
  return `t_comb_send_${joinIdParts(
    taskId,
    communicatedClassId,
    communicatedStateId,
  )}_${serializeSourceCombination(sourceCombination)}`;
}

export function combinedReceiveTransitionId(
  taskId: string,
  communicatedClassId: ClassId,
  communicatedStateId: StateId,
  compatibleStateId: StateId,
  targetStateId: StateId,
  sourceCombination: Map<string, StateId>,
): string {
  return `t_comb_recv_${joinIdParts(
    taskId,
    communicatedClassId,
    communicatedStateId,
    compatibleStateId,
    targetStateId,
  )}_${serializeSourceCombination(
    sourceCombination,
  )}`;
}

function serializeSourceCombination(
  sourceCombination: Map<string, StateId>,
): string {
  return [...sourceCombination.entries()]
    .sort(([leftClassId], [rightClassId]) =>
      leftClassId.localeCompare(rightClassId),
    )
    .map(([classId, sourceStateId]) => joinIdParts(classId, sourceStateId))
    .join("__");
}
