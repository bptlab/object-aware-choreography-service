import type { Choreography, ChoreographyTask } from "bpmn-moddle";
import type { ObjectAwareRealizabilityMetadata } from "../../analysis/objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";
import type { DataModel } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type { LifecycleModel } from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import { logger } from "../../logger.js";
import {
  communicationReceiveTransitionId,
  communicationSendTransitionId,
  existencePlaceId,
  statePlaceId,
  transmissionPlaceId,
  transitionIdForNode,
} from "../../targets/petriNet/ids.js";
import type { Bounds } from "../../targets/petriNet/petriNetBuilder.js";
import { PetriNetBuilder } from "../../targets/petriNet/petriNetBuilder.js";
import {
  getChoreographyTasks,
  getTaskReceiver,
  getTaskSender,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import {
  getMessages,
  validateObjectReferences,
  type ObjectReference,
} from "../../source/objectAwareChoreography/choreography/objectReferences.js";
import { getCompatibleReceiverStates } from "../../source/objectAwareChoreography/lifecycle/receiverCompatibility.js";
import { getTriggeredTaskIds } from "../../source/objectAwareChoreography/lifecycle/synchronizedTransitions.js";
import type { TaskNameIndex } from "../../source/objectAwareChoreography/choreography/taskNames.js";

export type ObjectStateCommunicationDiagnostics = {
  choreographyTasks: number;
  tasksWithMessageElements: number;
  tasksWithObjectReferences: number;
  replacedTaskTransitions: number;
  senderTransitionsGenerated: number;
  transmissionPlacesGenerated: number;
  receiverTransitionsGenerated: number;
};

export function applyObjectStateCommunicationMapping(args: {
  choreography: Choreography;
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  objectReferences: Map<string, ObjectReference>;
  petriNet: PetriNetBuilder;
  taskNameIndex: TaskNameIndex;
  objectAwareRealizabilityMetadata?: ObjectAwareRealizabilityMetadata;
}): ObjectStateCommunicationDiagnostics {
  const {
    choreography,
    dataModel,
    lifecycleModel,
    objectReferences,
    petriNet,
    taskNameIndex,
    objectAwareRealizabilityMetadata,
  } = args;
  const tasks = getChoreographyTasks(choreography);
  const triggeredTaskIds = getTriggeredTaskIds(lifecycleModel, taskNameIndex);

  validateObjectReferences(objectReferences, dataModel, lifecycleModel);

  const diagnostics: ObjectStateCommunicationDiagnostics = {
    choreographyTasks: tasks.length,
    tasksWithMessageElements: tasks.filter(
      (task) => getMessages(task).length > 0,
    ).length,
    tasksWithObjectReferences: objectReferences.size,
    replacedTaskTransitions: 0,
    senderTransitionsGenerated: 0,
    transmissionPlacesGenerated: 0,
    receiverTransitionsGenerated: 0,
  };

  for (const task of tasks) {
    const objectReference = objectReferences.get(task.id);

    if (!objectReference) {
      continue;
    }

    if (triggeredTaskIds.has(task.id)) {
      continue;
    }

    const lifecycle = lifecycleModel.lifecycles.get(objectReference.classId);

    if (!lifecycle) {
      throw new Error(
        `Task "${objectReference.taskName}" references class ${objectReference.classId}, but that class has no lifecycle`,
      );
    }
    const provisionalTransitionId = transitionIdForNode(task);
    const incomingArcs = petriNet.getIncomingArcs(provisionalTransitionId);
    const outgoingArcs = petriNet.getOutgoingArcs(provisionalTransitionId);

    if (incomingArcs.length !== 1) {
      throw new Error(
        `Object-state communication task "${objectReference.taskName}" expected one incoming control-flow arc, found ${incomingArcs.length}`,
      );
    }

    if (outgoingArcs.length !== 1) {
      throw new Error(
        `Object-state communication task "${objectReference.taskName}" expected one outgoing control-flow arc, found ${outgoingArcs.length}`,
      );
    }

    const preControlFlowPlaceId = incomingArcs[0].sourceId;
    const postControlFlowPlaceId = outgoingArcs[0].targetId;
    const taskBounds = petriNet.getNodeBounds(provisionalTransitionId);
    const senderRole = getTaskSender(task);
    const receiverRole = getTaskReceiver(task);
    const compatibleReceiverStates = getCompatibleReceiverStates(
      lifecycle,
      receiverRole,
      objectReference.stateId,
    );

    if (compatibleReceiverStates.length === 0) {
      logger.warn(
        {
          taskId: task.id,
          taskName: objectReference.taskName,
          receiverRole,
          classId: objectReference.classId,
          stateId: objectReference.stateId,
        },
        `Object-state communication task "${objectReference.taskName}" has no compatible receiver states for ${receiverRole}.${objectReference.classId} [${objectReference.stateId}]`,
      );
    }

    petriNet.removeArcsIncidentTo(provisionalTransitionId);
    petriNet.removeTransition(provisionalTransitionId);
    diagnostics.replacedTaskTransitions += 1;

    const subnetMetadata = addCommunicationSubnet({
      petriNet,
      task,
      taskBounds,
      senderRole,
      receiverRole,
      classId: objectReference.classId,
      stateId: objectReference.stateId,
      compatibleReceiverStates,
      preControlFlowPlaceId,
      postControlFlowPlaceId,
    });

    objectAwareRealizabilityMetadata?.taskInteractions.push({
      taskId: task.id,
      taskName: objectReference.taskName,
      senderRole,
      receiverRole,
      preControlFlowPlaceId,
      postControlFlowPlaceId,
      transmissionPlaceId: subnetMetadata.transmissionPlaceId,
      senderTransitionIds: subnetMetadata.senderTransitionIds,
      receiverTransitionIds: subnetMetadata.receiverTransitionIds,
      kind: "communication",
    });

    diagnostics.senderTransitionsGenerated += 1;
    diagnostics.transmissionPlacesGenerated += 1;
    diagnostics.receiverTransitionsGenerated += compatibleReceiverStates.length;
  }

  return diagnostics;
}

function addCommunicationSubnet(args: {
  petriNet: PetriNetBuilder;
  task: ChoreographyTask;
  taskBounds: Bounds | undefined;
  senderRole: string;
  receiverRole: string;
  classId: string;
  stateId: string;
  compatibleReceiverStates: string[];
  preControlFlowPlaceId: string;
  postControlFlowPlaceId: string;
}): {
  transmissionPlaceId: string;
  senderTransitionIds: string[];
  receiverTransitionIds: string[];
} {
  const {
    petriNet,
    task,
    taskBounds,
    senderRole,
    receiverRole,
    classId,
    stateId,
    compatibleReceiverStates,
    preControlFlowPlaceId,
    postControlFlowPlaceId,
  } = args;
  const sendTransitionId = communicationSendTransitionId(
    task.id,
    classId,
    stateId,
  );
  const transmissionId = transmissionPlaceId(task.id);
  const senderStatePlaceId = statePlaceId(senderRole, classId, stateId);
  const receiverTransitionIds: string[] = [];

  petriNet.addPlace(
    transmissionId,
    `${task.name ?? task.id} transmission`,
    0,
    boundsNearTask(taskBounds, 0, 0, 32, 32),
  );
  petriNet.addTransition(
    sendTransitionId,
    `${task.name ?? task.id} send`,
    false,
    boundsNearTask(taskBounds, -60, -80, 40, 60),
  );

  petriNet.addArc(preControlFlowPlaceId, sendTransitionId);
  petriNet.addArc(senderStatePlaceId, sendTransitionId);
  petriNet.addArc(sendTransitionId, senderStatePlaceId);
  petriNet.addArc(sendTransitionId, transmissionId);

  compatibleReceiverStates.forEach((compatibleStateId, index) => {
    const receiveTransitionId = communicationReceiveTransitionId(
      task.id,
      classId,
      compatibleStateId,
      stateId,
    );
    receiverTransitionIds.push(receiveTransitionId);

    petriNet.addTransition(
      receiveTransitionId,
      `${task.name ?? task.id} receive ${compatibleStateId}`,
      false,
      boundsNearTask(taskBounds, 60 + index * 50, 80, 40, 60),
    );
    petriNet.addArc(transmissionId, receiveTransitionId);
    petriNet.addArc(
      statePlaceId(receiverRole, classId, compatibleStateId),
      receiveTransitionId,
    );
    petriNet.addArc(
      receiveTransitionId,
      statePlaceId(receiverRole, classId, stateId),
    );
    petriNet.addArc(receiveTransitionId, postControlFlowPlaceId);

    if (compatibleStateId === "initial") {
      petriNet.addArc(
        receiveTransitionId,
        existencePlaceId(receiverRole, classId),
      );
    }
  });

  return {
    transmissionPlaceId: transmissionId,
    senderTransitionIds: [sendTransitionId],
    receiverTransitionIds,
  };
}

function boundsNearTask(
  taskBounds: Bounds | undefined,
  deltaX: number,
  deltaY: number,
  width: number,
  height: number,
): Bounds {
  if (!taskBounds) {
    return { x: deltaX, y: deltaY, width, height };
  }

  const centerX = taskBounds.x + taskBounds.width / 2;
  const centerY = taskBounds.y + taskBounds.height / 2;

  return {
    x: centerX + deltaX - width / 2,
    y: centerY + deltaY - height / 2,
    width,
    height,
  };
}
