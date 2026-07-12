import type {
  Choreography,
  ChoreographyTask,
  EventBasedGateway,
  ExclusiveGateway,
  FlowElement,
  FlowNode,
  ParallelGateway,
  Participant,
  SequenceFlow,
} from "bpmn-moddle";
import { compareFlowById, isBpmnType } from "./bpmn.js";

export type GatewayDirection = "split" | "join";
export type RoleId = string;
export type TaskId = string;

export function getFlowElements(choreography: Choreography): FlowElement[] {
  return choreography.flowElements ?? [];
}

export function getChoreographyTasks(
  choreography: Choreography
): ChoreographyTask[] {
  return getFlowElements(choreography).filter((element: FlowElement) =>
    isBpmnType<ChoreographyTask>(element, "bpmn:ChoreographyTask")
  );
}

export function getStartEvents(choreography: Choreography): FlowNode[] {
  return getFlowElements(choreography).filter((element: FlowElement) =>
    isBpmnType<FlowNode>(element, "bpmn:StartEvent")
  );
}

export function getEndEvents(choreography: Choreography): FlowNode[] {
  return getFlowElements(choreography).filter((element: FlowElement) =>
    isBpmnType<FlowNode>(element, "bpmn:EndEvent")
  );
}

export function getExclusiveGateways(
  choreography: Choreography
): ExclusiveGateway[] {
  return getFlowElements(choreography).filter((element: FlowElement) =>
    isBpmnType<ExclusiveGateway>(element, "bpmn:ExclusiveGateway")
  );
}

export function getParallelGateways(
  choreography: Choreography
): ParallelGateway[] {
  return getFlowElements(choreography).filter((element: FlowElement) =>
    isBpmnType<ParallelGateway>(element, "bpmn:ParallelGateway")
  );
}

export function getEventBasedGateways(
  choreography: Choreography
): EventBasedGateway[] {
  return getFlowElements(choreography).filter((element: FlowElement) =>
    isBpmnType<EventBasedGateway>(element, "bpmn:EventBasedGateway")
  );
}

export function getSequenceFlows(choreography: Choreography): SequenceFlow[] {
  return getFlowElements(choreography).filter((element: FlowElement) =>
    isBpmnType<SequenceFlow>(element, "bpmn:SequenceFlow")
  );
}

export function getParticipants(choreography: Choreography): Participant[] {
  return choreography.participants ?? [];
}

export function getParticipantNames(choreography: Choreography): RoleId[] {
  return getParticipants(choreography).map((participant) => {
    if (!participant.name) {
      throw new Error(
        `Choreography participant ${participant.id} must have name`
      );
    }

    return participant.name;
  });
}

export function getTaskSender(task: ChoreographyTask): RoleId {
  validateBinaryTaskParticipants(task);

  const sender = task.initiatingParticipantRef;

  if (!sender?.name) {
    throw new Error(
      `Could not determine initiating participant for task "${
        task.name ?? task.id
      }"`
    );
  }

  return sender.name;
}

export function getTaskReceiver(task: ChoreographyTask): RoleId {
  validateBinaryTaskParticipants(task);

  const sender = task.initiatingParticipantRef;

  if (!sender?.id) {
    throw new Error(
      `Could not determine initiating participant for task "${
        task.name ?? task.id
      }"`
    );
  }

  const receiver = task.participantRef.find(
    (participant) => participant.id !== sender.id
  );

  if (!receiver?.name) {
    throw new Error(
      `Could not determine receiving participant for task "${
        task.name ?? task.id
      }"`
    );
  }

  return receiver.name;
}

function validateBinaryTaskParticipants(task: ChoreographyTask): void {
  if ((task.participantRef ?? []).length !== 2) {
    throw new Error(
      `Task "${task.name ?? task.id}" must have exactly two participants`
    );
  }
}

export function getControlFlowNodes(choreography: Choreography): FlowNode[] {
  return [
    ...getChoreographyTasks(choreography),
    ...getStartEvents(choreography),
    ...getEndEvents(choreography),
    ...getExclusiveGateways(choreography),
    ...getParallelGateways(choreography),
    ...getEventBasedGateways(choreography),
  ];
}

export function buildNodesById(
  choreography: Choreography
): Map<string, FlowNode> {
  const nodes = getControlFlowNodes(choreography);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  if (nodesById.size !== nodes.length) {
    throw new Error("Duplicate BPMN node IDs found in choreography");
  }

  return nodesById;
}

export function buildSequenceFlowsById(
  choreography: Choreography
): Map<string, SequenceFlow> {
  const sequenceFlows = getSequenceFlows(choreography);
  const sequenceFlowsById = new Map(
    sequenceFlows.map((flow) => [flow.id, flow])
  );

  if (sequenceFlowsById.size !== sequenceFlows.length) {
    throw new Error("Duplicate BPMN sequence flow IDs found in choreography");
  }

  return sequenceFlowsById;
}

export function buildIncomingFlowsByNodeId(
  choreography: Choreography
): Map<string, SequenceFlow[]> {
  return buildFlowMaps(choreography).incomingFlowsByNodeId;
}

export function buildOutgoingFlowsByNodeId(
  choreography: Choreography
): Map<string, SequenceFlow[]> {
  return buildFlowMaps(choreography).outgoingFlowsByNodeId;
}

export function determineGatewayDirection(
  gateway: FlowNode,
  incomingFlows: SequenceFlow[],
  outgoingFlows: SequenceFlow[]
): GatewayDirection {
  if (isBpmnType(gateway, "bpmn:ExclusiveGateway") && outgoingFlows.length > 1) {
    return "split";
  }

  if (outgoingFlows.length > 1 && incomingFlows.length <= 1) {
    return "split";
  }

  if (incomingFlows.length > 1 && outgoingFlows.length <= 1) {
    return "join";
  }

  throw new Error(
    `Gateway ${gateway.id} must be a proper split or join, found ${incomingFlows.length} incoming and ${outgoingFlows.length} outgoing sequence flows`
  );
}

export function buildExclusiveGatewayDirections(
  choreography: Choreography
): Map<string, GatewayDirection> {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const exclusiveGatewayDirections = new Map<string, GatewayDirection>();

  for (const gateway of getExclusiveGateways(choreography)) {
    exclusiveGatewayDirections.set(
      gateway.id,
      determineGatewayDirection(
        gateway,
        incomingFlowsByNodeId.get(gateway.id) ?? [],
        outgoingFlowsByNodeId.get(gateway.id) ?? []
      )
    );
  }

  return exclusiveGatewayDirections;
}

export function validateNormalizedControlFlow(
  choreography: Choreography
): void {
  const startEvents = getStartEvents(choreography);
  const endEvents = getEndEvents(choreography);
  const nodes = getControlFlowNodes(choreography);
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);

  buildSequenceFlowsById(choreography);

  if (startEvents.length !== 1) {
    throw new Error(
      `Expected exactly one start event, found ${startEvents.length}`
    );
  }

  if (endEvents.length === 0) {
    throw new Error("Expected at least one end event");
  }

  for (const node of nodes) {
    const incomingFlows = incomingFlowsByNodeId.get(node.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(node.id) ?? [];

    if (isBpmnType(node, "bpmn:ChoreographyTask")) {
      const hasEventBasedGatewayPredecessor = incomingFlows.some((flow) =>
        isBpmnType(flow.sourceRef, "bpmn:EventBasedGateway")
      );

      if (
        !hasEventBasedGatewayPredecessor &&
        (incomingFlows.length !== 1 || outgoingFlows.length !== 1)
      ) {
        throw new Error(
          `Intermediate node ${node.id} must have exactly one incoming and one outgoing sequence flow, found ${incomingFlows.length} incoming and ${outgoingFlows.length} outgoing`
        );
      }
    }
  }

  for (const gateway of getExclusiveGateways(choreography)) {
    determineGatewayDirection(
      gateway,
      incomingFlowsByNodeId.get(gateway.id) ?? [],
      outgoingFlowsByNodeId.get(gateway.id) ?? []
    );
  }

  for (const gateway of getParallelGateways(choreography)) {
    determineGatewayDirection(
      gateway,
      incomingFlowsByNodeId.get(gateway.id) ?? [],
      outgoingFlowsByNodeId.get(gateway.id) ?? []
    );
  }

  for (const gateway of getEventBasedGateways(choreography)) {
    const direction = determineGatewayDirection(
      gateway,
      incomingFlowsByNodeId.get(gateway.id) ?? [],
      outgoingFlowsByNodeId.get(gateway.id) ?? []
    );

    if (direction !== "split") {
      throw new Error(`Event-based gateway ${gateway.id} must be a split`);
    }

    for (const outgoingFlow of outgoingFlowsByNodeId.get(gateway.id) ?? []) {
      if (!isBpmnType(outgoingFlow.targetRef, "bpmn:ChoreographyTask")) {
        throw new Error(
          `Event-based gateway ${gateway.id} outgoing flow ${outgoingFlow.id} must target a choreography task`
        );
      }
    }
  }
}

function buildFlowMaps(choreography: Choreography) {
  const nodes = getControlFlowNodes(choreography);
  const nodesById = buildNodesById(choreography);
  const incomingFlowsByNodeId = new Map<string, SequenceFlow[]>();
  const outgoingFlowsByNodeId = new Map<string, SequenceFlow[]>();

  for (const node of nodes) {
    incomingFlowsByNodeId.set(node.id, []);
    outgoingFlowsByNodeId.set(node.id, []);
  }

  for (const flow of getSequenceFlows(choreography)) {
    const source = flow.sourceRef;
    const target = flow.targetRef;

    if (!source || !nodesById.has(source.id)) {
      throw new Error(
        `Sequence flow ${flow.id} sourceRef points to an unknown node`
      );
    }

    if (!target || !nodesById.has(target.id)) {
      throw new Error(
        `Sequence flow ${flow.id} targetRef points to an unknown node`
      );
    }

    outgoingFlowsByNodeId.get(source.id)?.push(flow);
    incomingFlowsByNodeId.get(target.id)?.push(flow);
  }

  for (const flows of incomingFlowsByNodeId.values()) {
    flows.sort(compareFlowById);
  }

  for (const flows of outgoingFlowsByNodeId.values()) {
    flows.sort(compareFlowById);
  }

  return {
    incomingFlowsByNodeId,
    outgoingFlowsByNodeId,
  };
}
