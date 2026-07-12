import { joinIdParts, sanitizeIdPart } from "../../ids/sanitization.js";

export function caseTypeId(): string {
  return "DataClass_Case";
}

export function caseTypePart(): string {
  return "Case";
}

export function roleTypeId(roleId: string): string {
  return `DataClass_${joinIdParts("Role", roleId)}`;
}

export function roleTypePart(roleId: string): string {
  return joinIdParts("Role", roleId);
}

export function objectTypeId(classId: string): string {
  return `DataClass_${joinIdParts("Object", classId)}`;
}

export function objectTypePart(classId: string): string {
  return joinIdParts("Object", classId);
}

export function caseVariableId(): string {
  return "case";
}

export function roleVariableId(roleId: string): string {
  return `role_${sanitizeIdPart(roleId)}`;
}

export function objectVariableId(classId: string): string {
  return `object_${sanitizeIdPart(classId)}`;
}

export function dependencyObjectVariableId(classId: string): string {
  return `object_${sanitizeIdPart(classId)}_dep`;
}

export function poolPlaceId(roleId: string): string {
  return joinIdParts("pool", roleId);
}

export function participationPlaceId(roleId: string): string {
  return joinIdParts("part", roleId);
}

export function controlFlowPlaceId(sequenceFlowId: string): string {
  return joinIdParts("cf", sequenceFlowId);
}

export function sinkPlaceId(): string {
  return "sink";
}

export function awarenessPlaceId(roleId: string, classId: string): string {
  return joinIdParts("aware", roleId, classId);
}

export function stateAwarenessPlaceId(
  roleId: string,
  classId: string,
  stateId: string,
): string {
  return joinIdParts("state", roleId, classId, stateId);
}

export function objectBindingPlaceId(classId: string): string {
  return joinIdParts("obj", classId);
}

export function inclusionPlaceId(classId: string): string {
  return joinIdParts("incl", classId);
}

export function relationPlaceId(associationId: string): string {
  return joinIdParts("rel", associationId);
}

export function transmissionPlaceId(taskId: string): string {
  return joinIdParts("tx", taskId);
}

export function startTransitionId(startEventId: string): string {
  return joinIdParts("start", startEventId);
}

export function endTransitionId(endEventId: string): string {
  return joinIdParts("end", endEventId);
}

export function creationTransitionId(
  roleId: string,
  classId: string,
  targetStateId: string,
): string {
  return joinIdParts("create", roleId, classId, targetStateId);
}

export function localTransitionId(
  roleId: string,
  classId: string,
  sourceStateId: string,
  targetStateId: string,
  variantId?: string,
): string {
  return variantId
    ? joinIdParts("local", roleId, classId, sourceStateId, targetStateId, variantId)
    : joinIdParts("local", roleId, classId, sourceStateId, targetStateId);
}

export function gatewayBranchTransitionId(
  gatewayId: string,
  branchId: string,
): string {
  return joinIdParts("gateway", gatewayId, branchId);
}

export function parallelGatewayTransitionId(gatewayId: string): string {
  return joinIdParts("parallel", gatewayId);
}

export function taskSendTransitionId(taskId: string, variantId?: string): string {
  return variantId
    ? joinIdParts("send", taskId, variantId)
    : joinIdParts("send", taskId);
}

export function taskAtomicTransitionId(
  taskId: string,
  variantId?: string,
): string {
  return variantId
    ? joinIdParts("task", taskId, variantId)
    : joinIdParts("task", taskId);
}

export function taskBoundSendTransitionId(
  taskId: string,
  variantId?: string,
): string {
  return variantId
    ? joinIdParts("send", taskId, "bound", variantId)
    : joinIdParts("send", taskId, "bound");
}

export function taskFirstBindingSendTransitionId(
  taskId: string,
  variantId?: string,
): string {
  return variantId
    ? joinIdParts("send", taskId, "bind", variantId)
    : joinIdParts("send", taskId, "bind");
}

export function taskReceiveTransitionId(
  taskId: string,
  variantId?: string,
): string {
  return variantId
    ? joinIdParts("receive", taskId, variantId)
    : joinIdParts("receive", taskId);
}

export function arcId(...parts: string[]): string {
  return joinIdParts(...parts);
}
