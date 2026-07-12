import type { Choreography, ChoreographyTask, SequenceFlow } from "bpmn-moddle";
import type { ObjectAwareChoreographyContext } from "../../context/objectAwareChoreographyContext.js";
import { isBpmnType } from "../../source/objectAwareChoreography/choreography/bpmn.js";
import {
  buildIncomingFlowsByNodeId,
  buildNodesById,
  buildOutgoingFlowsByNodeId,
  determineGatewayDirection,
  getExclusiveGateways,
  getChoreographyTasks,
  getEndEvents,
  getParallelGateways,
  getParticipantNames,
  getSequenceFlows,
  getStartEvents,
  getTaskReceiver,
  getTaskSender,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import type { ObjectReference } from "../../source/objectAwareChoreography/choreography/objectReferences.js";
import { parseObjectReferenceText } from "../../source/objectAwareChoreography/choreography/objectReferences.js";
import {
  compositeOneToOneCreationTransitionId,
  existencePlaceId,
  localLifecycleTransitionId,
  placeIdForSequenceFlow,
  statePlaceId,
  transitionIdForNode,
  transitionIdForExclusiveJoin,
  transitionIdForExclusiveSplit,
  transitionIdForParallelGateway,
  transmissionPlaceId,
} from "../../targets/petriNet/ids.js";
import { computeCreationDependencies } from "../../source/objectAwareChoreography/dataModel/dependencies.js";
import type {
  Bounds,
  PetriNetBuilder,
} from "../../targets/petriNet/petriNetBuilder.js";

export type PetriNetPlaceSemantics =
  | { kind: "sourcePlace"; isolatedPlaceId: string }
  | { kind: "sinkPlace"; isolatedPlaceId: string }
  | {
      kind: "controlFlowPlace";
      isolatedPlaceId: string;
      sequenceFlowId: string;
      label?: string;
    }
  | {
      kind: "transmissionPlace";
      isolatedPlaceId?: string;
      taskId: string;
      taskName: string;
      objectRef?: ObjectReference;
    }
  | {
      kind: "existenceAwarenessPlace";
      isolatedPlaceId: string;
      roleId: string;
      classId: string;
    }
  | {
      kind: "stateAwarenessPlace";
      isolatedPlaceId: string;
      roleId: string;
      classId: string;
      stateId: string;
      isVirtualInitial?: boolean;
    };

export type PetriNetTransitionSemantics =
  | {
      kind: "startEventTransition";
      isolatedTransitionId: string;
      eventId: string;
      outgoingFlowIds: string[];
    }
  | {
      kind: "endEventTransition";
      isolatedTransitionId: string;
      eventId: string;
      incomingFlowIds: string[];
    }
  | {
      kind: "localTransition";
      isolatedTransitionId: string;
      roleId: string;
      classId: string;
      sourceStateId: string;
      targetStateId: string;
      sourceIsVirtualInitial?: boolean;
      stateReads: StateAwarenessReference[];
      stateWrites: StateAwarenessReference[];
      existenceWrites: ExistenceAwarenessReference[];
    }
  | {
      kind: "objectCreationTransition";
      isolatedTransitionId: string;
      roleId: string;
      classId: string;
      className: string;
      sourceStateId: string;
      targetStateId: string;
      stateWrites: StateAwarenessReference[];
      existenceWrites: ExistenceAwarenessReference[];
    }
  | {
      kind: "oneToOneObjectCreationTransition";
      isolatedTransitionId: string;
      roleId: string;
      entries: Array<{
        classId: string;
        className: string;
        sourceStateId: string;
        targetStateId: string;
      }>;
      stateWrites: StateAwarenessReference[];
      existenceWrites: ExistenceAwarenessReference[];
    }
  | {
      kind: "atomicTaskTransition";
      isolatedTransitionId: string;
      taskId: string;
      taskName: string;
      senderRoleId: string;
      receiverRoleId: string;
      incomingFlowIds: string[];
      outgoingFlowIds: string[];
      stateReads: StateAwarenessReference[];
      stateWrites: StateAwarenessReference[];
      objectRef?: ObjectReference;
    }
  | {
      kind: "taskSendTransition";
      isolatedTransitionId?: string;
      taskId: string;
      taskName: string;
      senderRoleId: string;
      receiverRoleId: string;
      incomingFlowIds: string[];
      variantId?: string;
      stateReads: StateAwarenessReference[];
      stateWrites: StateAwarenessReference[];
      objectRef?: ObjectReference;
    }
  | {
      kind: "taskReceiveTransition";
      isolatedTransitionId?: string;
      taskId: string;
      taskName: string;
      senderRoleId: string;
      receiverRoleId: string;
      outgoingFlowIds: string[];
      variantId?: string;
      stateReads: StateAwarenessReference[];
      stateWrites: StateAwarenessReference[];
      existenceWrites: ExistenceAwarenessReference[];
      consumesVirtualInitialState?: boolean;
      objectRef?: ObjectReference;
    }
  | {
      kind: "gatewayBranchTransition";
      isolatedTransitionId: string;
      gatewayId: string;
      gatewayName?: string;
      branchId: string;
      direction: "split" | "join";
      incomingFlowIds: string[];
      outgoingFlowIds: string[];
      stateReads: StateAwarenessReference[];
      guard?: { classId: string; stateId: string };
    }
  | {
      kind: "eventBasedGatewayTransition";
      gatewayId: string;
      gatewayName?: string;
      branchId: string;
      incomingFlowIds: string[];
      outgoingFlowIds: string[];
    }
  | {
      kind: "parallelGatewayTransition";
      isolatedTransitionId: string;
      gatewayId: string;
      gatewayName?: string;
      incomingFlowIds: string[];
      outgoingFlowIds: string[];
    };

export interface PetriNetArcSemantics {
  kind: "ordinaryArc";
  sourceId: string;
  targetId: string;
}

export interface ExistenceAwarenessReference {
  roleId: string;
  classId: string;
}

export interface StateAwarenessReference extends ExistenceAwarenessReference {
  stateId: string;
  isVirtualInitial?: boolean;
}

export interface PetriNetSemanticModel {
  places: Record<string, PetriNetPlaceSemantics>;
  transitions: Record<string, PetriNetTransitionSemantics>;
  arcs: Record<string, PetriNetArcSemantics>;
}

export interface PetriNetLayout {
  nodeBoundsById: Record<string, Bounds>;
}

export interface IsolatedPetriNetArtifact {
  petriNet: PetriNetBuilder;
  semantics: PetriNetSemanticModel;
  layout: PetriNetLayout;
}

export function buildPetriNetArtifact(args: {
  context: ObjectAwareChoreographyContext;
  petriNet: PetriNetBuilder;
}): IsolatedPetriNetArtifact {
  const { context, petriNet } = args;

  return {
    petriNet,
    semantics: buildPetriNetSemanticModel(context, petriNet),
    layout: buildPetriNetLayout(petriNet),
  };
}

function buildPetriNetSemanticModel(
  context: ObjectAwareChoreographyContext,
  petriNet: PetriNetBuilder,
): PetriNetSemanticModel {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(context.choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(context.choreography);
  const places: Record<string, PetriNetPlaceSemantics> = {
    p_source: { kind: "sourcePlace", isolatedPlaceId: "p_source" },
    p_sink: { kind: "sinkPlace", isolatedPlaceId: "p_sink" },
  };
  const transitions: Record<string, PetriNetTransitionSemantics> = {};

  addControlFlowPlaceSemantics(context.choreography, places);
  addLocalStatePlaceSemantics(context, petriNet, places);
  addEventTransitionSemantics(
    context.choreography,
    incomingFlowsByNodeId,
    outgoingFlowsByNodeId,
    petriNet,
    transitions,
  );
  addGatewayTransitionSemantics(
    context,
    incomingFlowsByNodeId,
    outgoingFlowsByNodeId,
    petriNet,
    places,
    transitions,
  );
  addLocalTransitionSemantics(context, petriNet, places, transitions);
  addObjectCreationTransitionSemantics(context, petriNet, places, transitions);
  addOneToOneObjectCreationTransitionSemantics(
    context,
    petriNet,
    places,
    transitions,
  );
  addTaskSemantics(
    context,
    incomingFlowsByNodeId,
    outgoingFlowsByNodeId,
    petriNet,
    places,
    transitions,
  );

  return {
    places,
    transitions,
    arcs: Object.fromEntries(
      petriNet.getArcs().map((arc) => [
        `${arc.sourceId}->${arc.targetId}`,
        {
          kind: "ordinaryArc" as const,
          sourceId: arc.sourceId,
          targetId: arc.targetId,
        },
      ]),
    ),
  };
}

function addOneToOneObjectCreationTransitionSemantics(
  context: ObjectAwareChoreographyContext,
  petriNet: PetriNetBuilder,
  places: Record<string, PetriNetPlaceSemantics>,
  transitions: Record<string, PetriNetTransitionSemantics>,
): void {
  const dependencies = computeCreationDependencies(context.dataModel);
  const participantNames = getParticipantNames(context.choreography);
  const placeSemanticsByIsolatedId = placeSemanticsByIsolatedPlaceId(places);

  for (const group of dependencies.oneToOneGroups.filter(
    (candidate) => candidate.length > 1,
  )) {
    const creationTransitionsByClass = new Map(
      group.map((classId) => {
        const lifecycle = context.lifecycleModel.lifecycles.get(classId);

        return [
          classId,
          lifecycle?.transitions.filter(
            (transition) => transition.source === lifecycle.initialStateId,
          ) ?? [],
        ];
      }),
    );

    for (const roleId of participantNames) {
      const combinations = cartesianProduct(
        group.map((classId) =>
          (creationTransitionsByClass.get(classId) ?? [])
            .filter((transition) => transition.actor === roleId)
            .map((transition) => ({ classId, transition })),
        ),
      );

      for (const entries of combinations) {
        const idEntries = entries.map((entry) => ({
          classId: entry.classId,
          targetStateId: entry.transition.target,
        }));
        const isolatedTransitionId = compositeOneToOneCreationTransitionId(
          roleId,
          idEntries,
        );

        if (!petriNet.hasTransition(isolatedTransitionId)) {
          continue;
        }

        transitions[`creation-1to1:${roleId}:${isolatedTransitionId}`] = {
          kind: "oneToOneObjectCreationTransition",
          isolatedTransitionId,
          roleId,
          entries: entries.map((entry) => ({
            classId: entry.classId,
            className:
              context.dataModel.classes.find(
                (dataClass) => dataClass.id === entry.classId,
              )?.name ?? entry.classId,
            sourceStateId: entry.transition.source,
            targetStateId: entry.transition.target,
          })),
          stateWrites: stateAwarenessPostset(
            petriNet,
            isolatedTransitionId,
            placeSemanticsByIsolatedId,
          ),
          existenceWrites: existenceAwarenessPostset(
            petriNet,
            isolatedTransitionId,
            placeSemanticsByIsolatedId,
          ),
        };
      }
    }
  }
}

function addControlFlowPlaceSemantics(
  choreography: Choreography,
  places: Record<string, PetriNetPlaceSemantics>,
): void {
  for (const sequenceFlow of getSequenceFlows(choreography)) {
    if (isBpmnType(sequenceFlow.sourceRef, "bpmn:EventBasedGateway")) {
      continue;
    }

    const isolatedPlaceId = placeIdForSequenceFlow(sequenceFlow);

    places[`controlFlow:${sequenceFlow.id}`] = {
      kind: "controlFlowPlace",
      isolatedPlaceId,
      sequenceFlowId: sequenceFlow.id,
      label: sequenceFlow.name,
    };
  }
}

function addGatewayTransitionSemantics(
  context: ObjectAwareChoreographyContext,
  incomingFlowsByNodeId: Map<string, SequenceFlow[]>,
  outgoingFlowsByNodeId: Map<string, SequenceFlow[]>,
  petriNet: PetriNetBuilder,
  places: Record<string, PetriNetPlaceSemantics>,
  transitions: Record<string, PetriNetTransitionSemantics>,
): void {
  const nodesById = buildNodesById(context.choreography);
  const placeSemanticsByIsolatedId = placeSemanticsByIsolatedPlaceId(places);

  for (const gateway of getExclusiveGateways(context.choreography)) {
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];
    const direction = determineGatewayDirection(
      gateway,
      incomingFlows,
      outgoingFlows,
    );

    if (direction === "split") {
      for (const outgoingFlow of outgoingFlows) {
        const targetNode = nodesById.get(outgoingFlow.targetRef.id);

        if (!targetNode) {
          throw new Error(
            `Gateway branch ${outgoingFlow.id} targets unknown node ${outgoingFlow.targetRef.id}`,
          );
        }

        const guard = guardFromStateReads(
          stateAwarenessPreset(
            petriNet,
            transitionIdForExclusiveSplit(
              gateway,
              targetNode,
              branchConditionForFlowLabel(outgoingFlow),
            ),
            placeSemanticsByIsolatedId,
          ),
        );
        const isolatedTransitionId = transitionIdForExclusiveSplit(
          gateway,
          targetNode,
          guard,
        );

        if (!petriNet.hasTransition(isolatedTransitionId)) {
          continue;
        }

        transitions[`gatewayBranch:${gateway.id}:${outgoingFlow.id}`] = {
          kind: "gatewayBranchTransition",
          isolatedTransitionId,
          gatewayId: gateway.id,
          gatewayName: gateway.name,
          branchId: outgoingFlow.id,
          direction,
          incomingFlowIds: incomingFlows.map((flow) => flow.id),
          outgoingFlowIds: [outgoingFlow.id],
          stateReads: stateAwarenessPreset(
            petriNet,
            isolatedTransitionId,
            placeSemanticsByIsolatedId,
          ),
          guard,
        };
      }
    }

    if (direction === "join") {
      for (const incomingFlow of incomingFlows) {
        const isolatedTransitionId = transitionIdForExclusiveJoin(
          incomingFlow.sourceRef,
          gateway,
        );

        if (!petriNet.hasTransition(isolatedTransitionId)) {
          continue;
        }

        transitions[`gatewayBranch:${gateway.id}:${incomingFlow.id}`] = {
          kind: "gatewayBranchTransition",
          isolatedTransitionId,
          gatewayId: gateway.id,
          gatewayName: gateway.name,
          branchId: incomingFlow.id,
          direction,
          incomingFlowIds: [incomingFlow.id],
          outgoingFlowIds: outgoingFlows.map((flow) => flow.id),
          stateReads: stateAwarenessPreset(
            petriNet,
            isolatedTransitionId,
            placeSemanticsByIsolatedId,
          ),
        };
      }
    }
  }

  for (const gateway of getParallelGateways(context.choreography)) {
    const isolatedTransitionId = transitionIdForParallelGateway(gateway);

    if (!petriNet.hasTransition(isolatedTransitionId)) {
      continue;
    }

    transitions[`parallelGateway:${gateway.id}`] = {
      kind: "parallelGatewayTransition",
      isolatedTransitionId,
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      incomingFlowIds: (incomingFlowsByNodeId.get(gateway.id) ?? []).map(
        (flow) => flow.id,
      ),
      outgoingFlowIds: (outgoingFlowsByNodeId.get(gateway.id) ?? []).map(
        (flow) => flow.id,
      ),
    };
  }

}

function branchConditionForFlowLabel(
  flow: SequenceFlow,
): { classId: string; stateId: string } | undefined {
  if (!flow.name) {
    return undefined;
  }

  return parseObjectReferenceText(flow.name);
}

function guardFromStateReads(
  stateReads: StateAwarenessReference[],
): { classId: string; stateId: string } | undefined {
  const firstRead = stateReads[0];

  if (!firstRead) {
    return undefined;
  }

  return {
    classId: firstRead.classId,
    stateId: firstRead.stateId,
  };
}

function addLocalTransitionSemantics(
  context: ObjectAwareChoreographyContext,
  petriNet: PetriNetBuilder,
  places: Record<string, PetriNetPlaceSemantics>,
  transitions: Record<string, PetriNetTransitionSemantics>,
): void {
  const placeSemanticsByIsolatedId = placeSemanticsByIsolatedPlaceId(places);

  for (const roleId of getParticipantNames(context.choreography)) {
    for (const dataClass of context.dataModel.classes) {
      const lifecycle = context.lifecycleModel.lifecycles.get(dataClass.id);

      if (!lifecycle) {
        continue;
      }

      for (const lifecycleTransition of lifecycle.transitions.filter(
        (transition) => transition.actor === roleId,
      )) {
        const isolatedTransitionId = localLifecycleTransitionId(
          roleId,
          dataClass.id,
          lifecycleTransition.source,
          lifecycleTransition.target,
        );

        if (!petriNet.hasTransition(isolatedTransitionId)) {
          continue;
        }

        transitions[
          `local:${roleId}:${dataClass.id}:${lifecycleTransition.source}:${lifecycleTransition.target}`
        ] = {
          kind: "localTransition",
          isolatedTransitionId,
          roleId,
          classId: dataClass.id,
          sourceStateId: lifecycleTransition.source,
          targetStateId: lifecycleTransition.target,
          sourceIsVirtualInitial:
            lifecycleTransition.source === lifecycle.initialStateId,
          stateReads: stateAwarenessPreset(
            petriNet,
            isolatedTransitionId,
            placeSemanticsByIsolatedId,
          ),
          stateWrites: stateAwarenessPostset(
            petriNet,
            isolatedTransitionId,
            placeSemanticsByIsolatedId,
          ),
          existenceWrites: existenceAwarenessPostset(
            petriNet,
            isolatedTransitionId,
            placeSemanticsByIsolatedId,
          ),
        };
      }
    }
  }
}

function addObjectCreationTransitionSemantics(
  context: ObjectAwareChoreographyContext,
  petriNet: PetriNetBuilder,
  places: Record<string, PetriNetPlaceSemantics>,
  transitions: Record<string, PetriNetTransitionSemantics>,
): void {
  const placeSemanticsByIsolatedId = placeSemanticsByIsolatedPlaceId(places);

  for (const roleId of getParticipantNames(context.choreography)) {
    for (const dataClass of context.dataModel.classes) {
      const lifecycle = context.lifecycleModel.lifecycles.get(dataClass.id);

      if (!lifecycle) {
        continue;
      }

      for (const lifecycleTransition of lifecycle.transitions.filter(
        (transition) =>
          transition.actor === roleId &&
          transition.source === lifecycle.initialStateId,
      )) {
        const isolatedTransitionId = localLifecycleTransitionId(
          roleId,
          dataClass.id,
          lifecycleTransition.source,
          lifecycleTransition.target,
        );

        if (!petriNet.hasTransition(isolatedTransitionId)) {
          continue;
        }

        transitions[
          `creation:${roleId}:${dataClass.id}:${lifecycleTransition.target}`
        ] = {
          kind: "objectCreationTransition",
          isolatedTransitionId,
          roleId,
          classId: dataClass.id,
          className: dataClass.name,
          sourceStateId: lifecycleTransition.source,
          targetStateId: lifecycleTransition.target,
          stateWrites: stateAwarenessPostset(
            petriNet,
            isolatedTransitionId,
            placeSemanticsByIsolatedId,
          ),
          existenceWrites: existenceAwarenessPostset(
            petriNet,
            isolatedTransitionId,
            placeSemanticsByIsolatedId,
          ),
        };
      }
    }
  }
}

function addLocalStatePlaceSemantics(
  context: ObjectAwareChoreographyContext,
  petriNet: PetriNetBuilder,
  places: Record<string, PetriNetPlaceSemantics>,
): void {
  for (const roleId of getParticipantNames(context.choreography)) {
    for (const dataClass of context.dataModel.classes) {
      const existenceId = existencePlaceId(roleId, dataClass.id);

      if (petriNet.hasPlace(existenceId)) {
        places[`existence:${roleId}:${dataClass.id}`] = {
          kind: "existenceAwarenessPlace",
          isolatedPlaceId: existenceId,
          roleId,
          classId: dataClass.id,
        };
      }

      const lifecycle = context.lifecycleModel.lifecycles.get(dataClass.id);
      for (const state of lifecycle?.states ?? []) {
        const stateId = statePlaceId(roleId, dataClass.id, state.id);

        if (!petriNet.hasPlace(stateId)) {
          continue;
        }

        places[`state:${roleId}:${dataClass.id}:${state.id}`] = {
          kind: "stateAwarenessPlace",
          isolatedPlaceId: stateId,
          roleId,
          classId: dataClass.id,
          stateId: state.id,
          isVirtualInitial: Boolean(state.isInitial),
        };
      }
    }
  }
}

function addEventTransitionSemantics(
  choreography: Choreography,
  incomingFlowsByNodeId: Map<string, Array<{ id: string }>>,
  outgoingFlowsByNodeId: Map<string, Array<{ id: string }>>,
  petriNet: PetriNetBuilder,
  transitions: Record<string, PetriNetTransitionSemantics>,
): void {
  for (const event of getStartEvents(choreography)) {
    const isolatedTransitionId = transitionIdForNode(event);

    if (petriNet.hasTransition(isolatedTransitionId)) {
      transitions[`start:${event.id}`] = {
        kind: "startEventTransition",
        isolatedTransitionId,
        eventId: event.id,
        outgoingFlowIds: (outgoingFlowsByNodeId.get(event.id) ?? []).map(
          (flow) => flow.id,
        ),
      };
    }
  }

  for (const event of getEndEvents(choreography)) {
    const isolatedTransitionId = transitionIdForNode(event);

    if (petriNet.hasTransition(isolatedTransitionId)) {
      transitions[`end:${event.id}`] = {
        kind: "endEventTransition",
        isolatedTransitionId,
        eventId: event.id,
        incomingFlowIds: (incomingFlowsByNodeId.get(event.id) ?? []).map(
          (flow) => flow.id,
        ),
      };
    }
  }
}

function addTaskSemantics(
  context: ObjectAwareChoreographyContext,
  incomingFlowsByNodeId: Map<string, Array<{ id: string }>>,
  outgoingFlowsByNodeId: Map<string, Array<{ id: string }>>,
  petriNet: PetriNetBuilder,
  places: Record<string, PetriNetPlaceSemantics>,
  transitions: Record<string, PetriNetTransitionSemantics>,
): void {
  for (const task of getChoreographyTasks(context.choreography)) {
    const objectRef = context.objectReferences.get(task.id);
    const taskName = task.name ?? task.id;
    const isolatedTaskTransitionId = transitionIdForNode(task);
    const isolatedTransmissionPlaceId = transmissionPlaceId(task.id);
    const placeSemanticsByIsolatedId = placeSemanticsByIsolatedPlaceId(places);
    const isolatedSendTransitionIds = isolatedTransitionIdsProducingPlace(
      petriNet,
      isolatedTransmissionPlaceId,
    );
    const isolatedReceiveTransitionIds = isolatedTransitionIdsConsumingPlace(
      petriNet,
      isolatedTransmissionPlaceId,
    );
    const atomicStateReads = stateAwarenessPreset(
      petriNet,
      isolatedTaskTransitionId,
      placeSemanticsByIsolatedId,
    );
    const atomicStateWrites = stateAwarenessPostset(
      petriNet,
      isolatedTaskTransitionId,
      placeSemanticsByIsolatedId,
    );
    const atomicExistenceWrites = existenceAwarenessPostset(
      petriNet,
      isolatedTaskTransitionId,
      placeSemanticsByIsolatedId,
    );

    if (
      !objectRef &&
      petriNet.hasTransition(isolatedTaskTransitionId) &&
      isolatedSendTransitionIds.length === 0 &&
      isolatedReceiveTransitionIds.length === 0 &&
      atomicStateReads.length === 0 &&
      atomicStateWrites.length === 0 &&
      atomicExistenceWrites.length === 0
    ) {
      transitions[`taskAtomic:${task.id}`] = {
        kind: "atomicTaskTransition",
        isolatedTransitionId: isolatedTaskTransitionId,
        taskId: task.id,
        taskName,
        senderRoleId: getTaskSender(task),
        receiverRoleId: getTaskReceiver(task),
        incomingFlowIds: controlFlowPreset(
          petriNet,
          isolatedTaskTransitionId,
          placeSemanticsByIsolatedId,
        ),
        outgoingFlowIds: controlFlowPostset(
          petriNet,
          isolatedTaskTransitionId,
          placeSemanticsByIsolatedId,
        ),
        stateReads: [],
        stateWrites: [],
        objectRef: undefined,
      };
      continue;
    }

    places[`transmission:${task.id}`] = {
      kind: "transmissionPlace",
      isolatedPlaceId: petriNet.hasPlace(isolatedTransmissionPlaceId)
        ? isolatedTransmissionPlaceId
        : undefined,
      taskId: task.id,
      taskName,
      objectRef,
    };
    const fallbackSendTransitionId = isolatedTransitionIdForTaskSend(
      petriNet,
      task,
      isolatedTaskTransitionId,
    );
    const sendTransitionIds =
      isolatedSendTransitionIds.length > 0
        ? isolatedSendTransitionIds
        : fallbackSendTransitionId
          ? [fallbackSendTransitionId]
          : [];

    if (sendTransitionIds.length === 0) {
      throw new Error(`Missing isolated send transition for task ${task.id}`);
    }

    for (const isolatedSendTransitionId of sendTransitionIds) {
      const suffix =
        sendTransitionIds.length === 1 ? "" : `:${isolatedSendTransitionId}`;
      transitions[`taskSend:${task.id}${suffix}`] = {
        kind: "taskSendTransition",
        isolatedTransitionId: isolatedSendTransitionId,
        taskId: task.id,
        taskName,
        senderRoleId: getTaskSender(task),
        receiverRoleId: getTaskReceiver(task),
        incomingFlowIds: controlFlowPreset(
          petriNet,
          isolatedSendTransitionId,
          placeSemanticsByIsolatedId,
        ),
        ...(sendTransitionIds.length === 1
          ? {}
          : { variantId: isolatedSendTransitionId }),
        stateReads: stateAwarenessPreset(
          petriNet,
          isolatedSendTransitionId,
          placeSemanticsByIsolatedId,
        ),
        stateWrites: stateAwarenessPostset(
          petriNet,
          isolatedSendTransitionId,
          placeSemanticsByIsolatedId,
        ),
        objectRef,
      };
    }

    const receiveTransitionIds =
      isolatedReceiveTransitionIds.length > 0
        ? isolatedReceiveTransitionIds
        : [isolatedTaskTransitionId].filter((transitionId) =>
            petriNet.hasTransition(transitionId),
          );

    for (const isolatedReceiveTransitionId of receiveTransitionIds) {
      const suffix =
        receiveTransitionIds.length === 1
          ? ""
          : `:${isolatedReceiveTransitionId}`;
      const stateReads = stateAwarenessPreset(
        petriNet,
        isolatedReceiveTransitionId,
        placeSemanticsByIsolatedId,
      );

      transitions[`taskReceive:${task.id}${suffix}`] = {
        kind: "taskReceiveTransition",
        isolatedTransitionId: isolatedReceiveTransitionId,
        taskId: task.id,
        taskName,
        senderRoleId: getTaskSender(task),
        receiverRoleId: getTaskReceiver(task),
        outgoingFlowIds: controlFlowPostset(
          petriNet,
          isolatedReceiveTransitionId,
          placeSemanticsByIsolatedId,
        ),
        variantId:
          receiveTransitionIds.length === 1
            ? undefined
            : isolatedReceiveTransitionId,
        stateReads,
        stateWrites: stateAwarenessPostset(
          petriNet,
          isolatedReceiveTransitionId,
          placeSemanticsByIsolatedId,
        ),
        existenceWrites: existenceAwarenessPostset(
          petriNet,
          isolatedReceiveTransitionId,
          placeSemanticsByIsolatedId,
        ),
        consumesVirtualInitialState: stateReads.some(
          (state) => state.isVirtualInitial,
        ),
        objectRef,
      };
    }
  }
}

function placeSemanticsByIsolatedPlaceId(
  places: Record<string, PetriNetPlaceSemantics>,
): Map<string, PetriNetPlaceSemantics> {
  const semanticsById = new Map<string, PetriNetPlaceSemantics>();

  for (const place of Object.values(places)) {
    if ("isolatedPlaceId" in place && place.isolatedPlaceId) {
      semanticsById.set(place.isolatedPlaceId, place);
    }
  }

  return semanticsById;
}

function isolatedTransitionIdsProducingPlace(
  petriNet: PetriNetBuilder,
  placeId: string,
): string[] {
  return petriNet
    .getIncomingArcs(placeId)
    .map((arc) => arc.sourceId)
    .filter((sourceId) => petriNet.hasTransition(sourceId));
}

function isolatedTransitionIdsConsumingPlace(
  petriNet: PetriNetBuilder,
  placeId: string,
): string[] {
  return petriNet
    .getOutgoingArcs(placeId)
    .map((arc) => arc.targetId)
    .filter((targetId) => petriNet.hasTransition(targetId));
}

function stateAwarenessPreset(
  petriNet: PetriNetBuilder,
  transitionId: string,
  placeSemanticsByIsolatedId: Map<string, PetriNetPlaceSemantics>,
): StateAwarenessReference[] {
  return petriNet
    .getIncomingArcs(transitionId)
    .map((arc) => placeSemanticsByIsolatedId.get(arc.sourceId))
    .filter(
      (place): place is Extract<
        PetriNetPlaceSemantics,
        { kind: "stateAwarenessPlace" }
      > => place?.kind === "stateAwarenessPlace",
    )
    .map(toStateAwarenessReference);
}

function controlFlowPreset(
  petriNet: PetriNetBuilder,
  transitionId: string,
  placeSemanticsByIsolatedId: Map<string, PetriNetPlaceSemantics>,
): string[] {
  return petriNet
    .getIncomingArcs(transitionId)
    .map((arc) => placeSemanticsByIsolatedId.get(arc.sourceId))
    .filter(
      (place): place is Extract<
        PetriNetPlaceSemantics,
        { kind: "controlFlowPlace" }
      > => place?.kind === "controlFlowPlace",
    )
    .map((place) => place.sequenceFlowId);
}

function controlFlowPostset(
  petriNet: PetriNetBuilder,
  transitionId: string,
  placeSemanticsByIsolatedId: Map<string, PetriNetPlaceSemantics>,
): string[] {
  return petriNet
    .getOutgoingArcs(transitionId)
    .map((arc) => placeSemanticsByIsolatedId.get(arc.targetId))
    .filter(
      (place): place is Extract<
        PetriNetPlaceSemantics,
        { kind: "controlFlowPlace" }
      > => place?.kind === "controlFlowPlace",
    )
    .map((place) => place.sequenceFlowId);
}

function stateAwarenessPostset(
  petriNet: PetriNetBuilder,
  transitionId: string,
  placeSemanticsByIsolatedId: Map<string, PetriNetPlaceSemantics>,
): StateAwarenessReference[] {
  return petriNet
    .getOutgoingArcs(transitionId)
    .map((arc) => placeSemanticsByIsolatedId.get(arc.targetId))
    .filter(
      (place): place is Extract<
        PetriNetPlaceSemantics,
        { kind: "stateAwarenessPlace" }
      > => place?.kind === "stateAwarenessPlace",
    )
    .map(toStateAwarenessReference);
}

function existenceAwarenessPostset(
  petriNet: PetriNetBuilder,
  transitionId: string,
  placeSemanticsByIsolatedId: Map<string, PetriNetPlaceSemantics>,
): ExistenceAwarenessReference[] {
  return petriNet
    .getOutgoingArcs(transitionId)
    .map((arc) => placeSemanticsByIsolatedId.get(arc.targetId))
    .filter(
      (place): place is Extract<
        PetriNetPlaceSemantics,
        { kind: "existenceAwarenessPlace" }
      > => place?.kind === "existenceAwarenessPlace",
    )
    .map((place) => ({
      roleId: place.roleId,
      classId: place.classId,
    }));
}

function toStateAwarenessReference(
  place: Extract<PetriNetPlaceSemantics, { kind: "stateAwarenessPlace" }>,
): StateAwarenessReference {
  return {
    roleId: place.roleId,
    classId: place.classId,
    stateId: place.stateId,
    isVirtualInitial: place.isVirtualInitial,
  };
}

function isolatedTransitionIdForTaskSend(
  petriNet: PetriNetBuilder,
  task: ChoreographyTask,
  isolatedTaskTransitionId: string,
): string | undefined {
  if (petriNet.hasTransition(isolatedTaskTransitionId)) {
    return isolatedTaskTransitionId;
  }

  const sendPrefix = `t_send_${task.id}`;
  return petriNet
    .getTransitions()
    .find((transition) => transition.id.startsWith(sendPrefix))?.id;
}

function buildPetriNetLayout(petriNet: PetriNetBuilder): PetriNetLayout {
  const nodeBoundsById: Record<string, Bounds> = {};

  for (const place of petriNet.getPlaces()) {
    const bounds = petriNet.getNodeBounds(place.id);
    if (bounds) {
      nodeBoundsById[place.id] = bounds;
    }
  }

  for (const transition of petriNet.getTransitions()) {
    const bounds = petriNet.getNodeBounds(transition.id);
    if (bounds) {
      nodeBoundsById[transition.id] = bounds;
    }
  }

  return { nodeBoundsById };
}

function cartesianProduct<T>(sets: T[][]): T[][] {
  if (sets.length === 0) {
    return [[]];
  }

  return sets.reduce<T[][]>(
    (accumulator, set) =>
      accumulator.flatMap((prefix) =>
        set.map((element) => [...prefix, element]),
      ),
    [[]],
  );
}
