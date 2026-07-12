import type { Choreography } from "bpmn-moddle";
import type { ObjectAwareRealizabilityMetadata } from "../../analysis/objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";
import {
  buildIncomingFlowsByNodeId,
  buildNodesById,
  buildOutgoingFlowsByNodeId,
  determineGatewayDirection,
  getExclusiveGateways,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import type { DataModel } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type { LifecycleModel } from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import { logger } from "../../logger.js";
import {
  placeIdForSequenceFlow,
  statePlaceId,
  transitionIdForExclusiveSplit,
} from "../../targets/petriNet/ids.js";
import type { PetriNetBuilder } from "../../targets/petriNet/petriNetBuilder.js";
import { computeAffectedRoles } from "../../source/objectAwareChoreography/decision/affectedRoles.js";
import {
  getDecisionGuards,
  validateDecisionGuards,
} from "../../source/objectAwareChoreography/decision/decisionGuards.js";

export type DecisionMappingDiagnostics = {
  exclusiveGatewaySplits: number;
  guardedOutgoingBranches: number;
  decisionGatewaysMapped: number;
  guardReadArcsAdded: number;
  affectedRolesByGateway: Array<{
    gatewayId: string;
    gatewayName?: string;
    affectedRoles: string[];
  }>;
};

export function applyDecisionMapping(args: {
  choreography: Choreography;
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  petriNet: PetriNetBuilder;
  objectAwareRealizabilityMetadata?: ObjectAwareRealizabilityMetadata;
}): DecisionMappingDiagnostics {
  const {
    choreography,
    dataModel,
    lifecycleModel,
    petriNet,
    objectAwareRealizabilityMetadata,
  } = args;
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const nodesById = buildNodesById(choreography);
  const decisionGuardsByFlowId = getDecisionGuards(choreography);
  const diagnostics: DecisionMappingDiagnostics = {
    exclusiveGatewaySplits: 0,
    guardedOutgoingBranches: 0,
    decisionGatewaysMapped: 0,
    guardReadArcsAdded: 0,
    affectedRolesByGateway: [],
  };

  for (const gateway of getExclusiveGateways(choreography)) {
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];

    if (
      determineGatewayDirection(gateway, incomingFlows, outgoingFlows) !==
      "split"
    ) {
      continue;
    }

    diagnostics.exclusiveGatewaySplits += 1;

    const guards = outgoingFlows.map((flow) => {
      const guard = decisionGuardsByFlowId.get(flow.id);

      if (!guard) {
        throw new Error(
          `Outgoing sequence flow "${flow.id}" of exclusive gateway "${
            gateway.name ?? gateway.id
          }" has no object-state guard.`
        );
      }

      return guard;
    });

    validateDecisionGuards({
      gateway,
      guards,
      dataModel,
      lifecycleModel,
    });

    const affectedRoles = computeAffectedRoles({ choreography, gateway });

    if (affectedRoles.length === 0) {
      throw new Error(
        `Exclusive gateway "${
          gateway.name ?? gateway.id
        }" has no affected roles; decision semantics requires at least one affected role.`
      );
    }

    logger.info(
      {
        gatewayId: gateway.id,
        gatewayName: gateway.name,
        affectedRoles,
      },
      `Decision ${gateway.name ?? gateway.id}: affected roles = ${affectedRoles.join(
        ", "
      )}`
    );

    diagnostics.guardedOutgoingBranches += guards.length;
    diagnostics.decisionGatewaysMapped += 1;
    diagnostics.affectedRolesByGateway.push({
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      affectedRoles,
    });
    const branchTransitionIds = outgoingFlows.map((flow, index) => {
      const targetNode = nodesById.get(flow.targetRef.id);

      if (!targetNode) {
        throw new Error(
          `Decision branch sequence flow "${flow.id}" targets unknown node ${flow.targetRef.id}.`,
        );
      }

      return transitionIdForExclusiveSplit(gateway, targetNode, guards[index]);
    });

    const incomingPlaceIds = incomingFlows.map(placeIdForSequenceFlow);

    objectAwareRealizabilityMetadata?.decisionGateways.push({
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      incomingPlaceIds,
      branchTransitionIds,
      affectedRoles,
    });
    objectAwareRealizabilityMetadata?.branches.push(
      ...outgoingFlows.map((flow, index) => ({
        id: `branch_${gateway.id}_${flow.targetRef.id}`,
        kind: "exclusive" as const,
        gatewayId: gateway.id,
        gatewayName: gateway.name,
        branchLabel: flow.name,
        entryPlaceId: incomingPlaceIds[0],
        targetNodeId: flow.targetRef.id,
        targetNodeName: flow.targetRef.name,
        transitionIds: [branchTransitionIds[index]],
      })),
    );

    for (const guard of guards) {
      const targetNode = nodesById.get(guard.targetNodeId);

      if (!targetNode) {
        throw new Error(
          `Decision guard on sequence flow "${guard.sequenceFlowId}" targets unknown node ${guard.targetNodeId}.`
        );
      }

      const branchTransitionId = transitionIdForExclusiveSplit(
        gateway,
        targetNode,
        guard,
      );

      if (!petriNet.hasTransition(branchTransitionId)) {
        throw new Error(
          `Decision guard on sequence flow "${guard.sequenceFlowId}" expected branch transition ${branchTransitionId} to exist.`
        );
      }

      for (const roleId of affectedRoles) {
        const stateAwarenessPlaceId = statePlaceId(
          roleId,
          guard.classId,
          guard.stateId
        );

        if (!petriNet.hasPlace(stateAwarenessPlaceId)) {
          throw new Error(
            `Decision guard on sequence flow "${guard.sequenceFlowId}" expected state-awareness place ${stateAwarenessPlaceId} to exist.`
          );
        }

        diagnostics.guardReadArcsAdded += addReadPatternIfAbsent(
          petriNet,
          stateAwarenessPlaceId,
          branchTransitionId
        );
      }
    }
  }

  return diagnostics;
}

function addReadPatternIfAbsent(
  petriNet: PetriNetBuilder,
  placeId: string,
  transitionId: string
): number {
  let addedArcs = 0;

  if (!petriNet.hasArc(placeId, transitionId)) {
    petriNet.addArcIfAbsent(placeId, transitionId);
    addedArcs += 1;
  }

  if (!petriNet.hasArc(transitionId, placeId)) {
    petriNet.addArcIfAbsent(transitionId, placeId);
    addedArcs += 1;
  }

  return addedArcs;
}
