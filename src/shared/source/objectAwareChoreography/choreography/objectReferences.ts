import type { Choreography, ChoreographyTask, Message } from "bpmn-moddle";
import type { DataModel } from "../dataModel/dataModelTypes.js";
import type { LifecycleModel } from "../lifecycle/lifecycleTypes.js";
import { getChoreographyTasks } from "./choreography.js";

export interface ObjectReference {
  taskId: string;
  taskName: string;
  messageId: string;
  messageName: string;
  classId: string;
  stateId: string;
}

export function getMessages(choreographyTask: ChoreographyTask): Message[] {
  return (choreographyTask.messageFlowRef ?? [])
    .map((messageFlow) => messageFlow.messageRef)
    .filter((message): message is Message => message !== undefined);
}

export function parseObjectReferenceText(
  text: string
): { classId: string; stateId: string } | undefined {
  const normalizedText = normalizeWhitespace(text);
  const bracketMatches = [...normalizedText.matchAll(/\[[^\]]*\]/g)];

  if (bracketMatches.length === 0) {
    return undefined;
  }

  if (bracketMatches.length > 1) {
    throw new Error(
      `Object reference "${normalizedText}" contains more than one bracketed state`
    );
  }

  const match = /^(.*)\[([^\]]*)\]$/.exec(normalizedText);

  if (!match) {
    return undefined;
  }

  const classId = normalizeWhitespace(match[1]);
  const stateId = normalizeWhitespace(match[2]);

  if (!classId) {
    throw new Error(
      `Object reference "${normalizedText}" has empty class name`
    );
  }

  if (!stateId) {
    throw new Error(
      `Object reference "${normalizedText}" has empty state name`
    );
  }

  return { classId, stateId };
}

export function getObjectReferenceForTask(
  task: ChoreographyTask
): ObjectReference | undefined {
  const namedMessages = getMessages(task).filter(
    (message) => typeof message.name === "string" && message.name.trim() !== ""
  );

  if (namedMessages.length > 1) {
    throw new Error(
      `Task "${
        task.name ?? task.id
      }" has more than one message element; object-aware mapping expects at most one.`
    );
  }

  const message = namedMessages[0];

  if (!message) {
    return undefined;
  }

  const messageName = normalizeWhitespace(message.name);
  const parsedReference = parseObjectReferenceText(messageName);

  if (!parsedReference) {
    return undefined;
  }

  return {
    taskId: task.id,
    taskName: task.name ?? task.id,
    messageId: message.id,
    messageName,
    classId: parsedReference.classId,
    stateId: parsedReference.stateId,
  };
}

export function getObjectReferences(
  choreography: Choreography
): Map<string, ObjectReference> {
  const objectReferences = new Map<string, ObjectReference>();

  for (const task of getChoreographyTasks(choreography)) {
    const objectReference = getObjectReferenceForTask(task);

    if (objectReference) {
      objectReferences.set(task.id, objectReference);
    }
  }

  return objectReferences;
}

export function validateObjectReferences(
  objectReferences: Map<string, ObjectReference>,
  dataModel: DataModel,
  lifecycleModel: LifecycleModel
): void {
  const classIds = new Set(dataModel.classes.map((dataClass) => dataClass.id));

  for (const objectReference of objectReferences.values()) {
    if (!classIds.has(objectReference.classId)) {
      throw new Error(
        `Task "${objectReference.taskName}" message "${objectReference.messageName}" references unknown class ${objectReference.classId}`
      );
    }

    const lifecycle = lifecycleModel.lifecycles.get(objectReference.classId);

    if (!lifecycle) {
      throw new Error(
        `Task "${objectReference.taskName}" message "${objectReference.messageName}" references class ${objectReference.classId}, but that class has no lifecycle`
      );
    }

    if (
      !lifecycle.states.some((state) => state.id === objectReference.stateId)
    ) {
      throw new Error(
        `Task "${objectReference.taskName}" message "${objectReference.messageName}" references unknown state ${objectReference.classId} [${objectReference.stateId}]`
      );
    }
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
