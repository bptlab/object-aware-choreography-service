import type { Choreography, ExclusiveGateway, SequenceFlow } from "bpmn-moddle";
import type { DataModel } from "../dataModel/dataModelTypes.js";
import type { LifecycleModel } from "../lifecycle/lifecycleTypes.js";
import {
  buildIncomingFlowsByNodeId,
  buildOutgoingFlowsByNodeId,
  determineGatewayDirection,
  getExclusiveGateways,
} from "../choreography/choreography.js";
import { parseObjectReferenceText } from "../choreography/objectReferences.js";

export interface DecisionGuard {
  gatewayId: string;
  gatewayName?: string;
  sequenceFlowId: string;
  targetNodeId: string;
  classId: string;
  stateId: string;
  rawText: string;
}

export function getDecisionGuardsForGateway(
  gateway: ExclusiveGateway
): DecisionGuard[] {
  const outgoingFlows = gateway.outgoing ?? [];

  return outgoingFlows.map((flow) => parseDecisionGuard(gateway, flow));
}

export function getDecisionGuards(
  choreography: Choreography
): Map<string, DecisionGuard> {
  const guards = new Map<string, DecisionGuard>();
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);

  for (const gateway of getExclusiveGateways(choreography)) {
    if (
      determineGatewayDirection(
        gateway,
        incomingFlowsByNodeId.get(gateway.id) ?? [],
        outgoingFlowsByNodeId.get(gateway.id) ?? []
      ) !== "split"
    ) {
      continue;
    }

    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];

    for (const guard of outgoingFlows.map((flow) =>
      parseDecisionGuard(gateway, flow)
    )) {
      guards.set(guard.sequenceFlowId, guard);
    }
  }

  return guards;
}

export function validateDecisionGuards(args: {
  gateway: ExclusiveGateway;
  guards: DecisionGuard[];
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
}): void {
  const { gateway, guards, dataModel, lifecycleModel } = args;
  const gatewayLabel = gateway.name ?? gateway.id;
  const classIds = new Set(dataModel.classes.map((dataClass) => dataClass.id));
  const guardClassIds = [...new Set(guards.map((guard) => guard.classId))].sort();

  if (guardClassIds.length !== 1) {
    throw new Error(
      `Exclusive gateway "${gatewayLabel}" has guards over multiple classes: ${guardClassIds.join(
        ", "
      )}. Decisions must refer to exactly one class.`
    );
  }

  for (const guard of guards) {
    if (!classIds.has(guard.classId)) {
      throw new Error(
        `Outgoing sequence flow "${guard.sequenceFlowId}" of exclusive gateway "${gatewayLabel}" references unknown class ${guard.classId}.`
      );
    }

    const lifecycle = lifecycleModel.lifecycles.get(guard.classId);

    if (!lifecycle) {
      throw new Error(
        `Outgoing sequence flow "${guard.sequenceFlowId}" of exclusive gateway "${gatewayLabel}" references class ${guard.classId}, but that class has no lifecycle.`
      );
    }

    if (!lifecycle.states.some((state) => state.id === guard.stateId)) {
      throw new Error(
        `Outgoing sequence flow "${guard.sequenceFlowId}" of exclusive gateway "${gatewayLabel}" references unknown state ${guard.classId} [${guard.stateId}].`
      );
    }
  }

  const seenStates = new Set<string>();

  for (const guard of guards) {
    if (seenStates.has(guard.stateId)) {
      throw new Error(
        `Exclusive gateway "${gatewayLabel}" has multiple outgoing guards for state "${guard.stateId}" of class "${guard.classId}". Guards must be mutually exclusive.`
      );
    }

    seenStates.add(guard.stateId);
  }
}

export function isExclusiveGatewaySplit(
  choreography: Choreography,
  gateway: ExclusiveGateway
): boolean {
  const incomingFlows = gateway.incoming ?? [];
  const outgoingFlows = gateway.outgoing ?? [];

  return (
    determineGatewayDirection(gateway, incomingFlows, outgoingFlows) === "split"
  );
}

function parseDecisionGuard(
  gateway: ExclusiveGateway,
  flow: SequenceFlow
): DecisionGuard {
  const gatewayLabel = gateway.name ?? gateway.id;
  const rawText = normalizeWhitespace(flow.name ?? "");

  if (!rawText) {
    throw new Error(
      `Outgoing sequence flow "${flow.id}" of exclusive gateway "${gatewayLabel}" has no object-state guard.`
    );
  }

  const bracketMatches = [...rawText.matchAll(/\[[^\]]*\]/g)];

  if (bracketMatches.length > 1) {
    throw new Error(
      `Outgoing sequence flow "${flow.id}" of exclusive gateway "${gatewayLabel}" has more than one bracketed guard state.`
    );
  }

  const parsedReference = parseObjectReferenceText(rawText);

  if (!parsedReference) {
    throw new Error(
      `Outgoing sequence flow "${flow.id}" of exclusive gateway "${gatewayLabel}" has no object-state guard.`
    );
  }

  if (!flow.targetRef?.id) {
    throw new Error(
      `Outgoing sequence flow "${flow.id}" of exclusive gateway "${gatewayLabel}" has no target node.`
    );
  }

  return {
    gatewayId: gateway.id,
    gatewayName: gateway.name,
    sequenceFlowId: flow.id,
    targetNodeId: flow.targetRef.id,
    classId: parsedReference.classId,
    stateId: parsedReference.stateId,
    rawText,
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
