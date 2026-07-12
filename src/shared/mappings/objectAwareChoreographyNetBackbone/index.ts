import type { Choreography } from "bpmn-moddle";
import {
  buildIncomingFlowsByNodeId,
  buildOutgoingFlowsByNodeId,
  getChoreographyTasks,
  getEndEvents,
  getSequenceFlows,
  getStartEvents,
  getTaskReceiver,
  getTaskSender,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import type { ObjectReference } from "../../source/objectAwareChoreography/choreography/objectReferences.js";

export interface ControlFlowPlaceDescriptor {
  kind: "controlFlowPlace";
  sequenceFlowId: string;
  label?: string;
}

export interface StartEventDescriptor {
  kind: "startEvent";
  eventId: string;
  outgoingFlowIds: string[];
}

export interface EndEventDescriptor {
  kind: "endEvent";
  eventId: string;
  incomingFlowIds: string[];
}

export interface TaskDescriptor {
  kind: "task";
  taskId: string;
  taskName: string;
  senderRole: string;
  receiverRole: string;
  incomingFlowIds: string[];
  outgoingFlowIds: string[];
  objectReference?: ObjectReference;
}

export type BackboneDescriptor =
  | ControlFlowPlaceDescriptor
  | StartEventDescriptor
  | EndEventDescriptor
  | TaskDescriptor;

export function buildChoreographyBackboneDescriptors(args: {
  choreography: Choreography;
  objectReferences?: Map<string, ObjectReference>;
}): BackboneDescriptor[] {
  const { choreography, objectReferences } = args;
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);

  return [
    ...getSequenceFlows(choreography)
      .map((flow): ControlFlowPlaceDescriptor => ({
        kind: "controlFlowPlace",
        sequenceFlowId: flow.id,
        label: flow.name,
      })),
    ...getStartEvents(choreography)
      .map((event): StartEventDescriptor => ({
        kind: "startEvent",
        eventId: event.id,
        outgoingFlowIds: (outgoingFlowsByNodeId.get(event.id) ?? [])
          .map((flow) => flow.id)
          .sort(),
      })),
    ...getEndEvents(choreography)
      .map((event): EndEventDescriptor => ({
        kind: "endEvent",
        eventId: event.id,
        incomingFlowIds: (incomingFlowsByNodeId.get(event.id) ?? [])
          .map((flow) => flow.id)
          .sort(),
      })),
    ...getChoreographyTasks(choreography)
      .map((task): TaskDescriptor => ({
        kind: "task",
        taskId: task.id,
        taskName: task.name ?? task.id,
        senderRole: getTaskSender(task),
        receiverRole: getTaskReceiver(task),
        incomingFlowIds: (incomingFlowsByNodeId.get(task.id) ?? [])
          .map((flow) => flow.id)
          .sort(),
        outgoingFlowIds: (outgoingFlowsByNodeId.get(task.id) ?? [])
          .map((flow) => flow.id)
          .sort(),
        objectReference: objectReferences?.get(task.id),
      })),
  ];
}
