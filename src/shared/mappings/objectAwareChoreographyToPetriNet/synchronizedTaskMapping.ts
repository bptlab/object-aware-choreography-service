import type { Choreography, ChoreographyTask } from "bpmn-moddle";
import type { ObjectAwareRealizabilityMetadata } from "../../analysis/objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";
import type { LifecycleModel } from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import { logger } from "../../logger.js";
import {
  statePlaceId,
  synchronizedReceiveTransitionId,
  synchronizedSendTransitionId,
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
import type { ObjectReference } from "../../source/objectAwareChoreography/choreography/objectReferences.js";
import {
  getLifecycleTriggerNames,
  getPureSynchronizedTasks,
  getTriggeredTaskIds,
  type SynchronizedTaskSemantics,
} from "../../source/objectAwareChoreography/lifecycle/synchronizedTransitions.js";
import type { TaskNameIndex } from "../../source/objectAwareChoreography/choreography/taskNames.js";

export type PureSynchronizedTaskDiagnostics = {
  lifecycleTriggerNames: number;
  pureSynchronizedTasks: number;
  combinedTasksSkipped: number;
  synchronizedTaskTransitionsReplaced: number;
  transmissionPlacesGenerated: number;
  synchronizedSenderTransitionsGenerated: number;
  synchronizedReceiverTransitionsGenerated: number;
};

export function applyPureSynchronizedTaskMapping(args: {
  choreography: Choreography;
  lifecycleModel: LifecycleModel;
  objectReferences: Map<string, ObjectReference>;
  petriNet: PetriNetBuilder;
  taskNameIndex: TaskNameIndex;
  objectAwareRealizabilityMetadata?: ObjectAwareRealizabilityMetadata;
}): PureSynchronizedTaskDiagnostics {
  const {
    choreography,
    lifecycleModel,
    objectReferences,
    petriNet,
    taskNameIndex,
    objectAwareRealizabilityMetadata,
  } = args;
  const triggeredTaskIds = getTriggeredTaskIds(lifecycleModel, taskNameIndex);
  const combinedTaskIds = [...triggeredTaskIds].filter((taskId) =>
    objectReferences.has(taskId),
  );
  const combinedTasksSkipped = combinedTaskIds.filter((taskId) =>
    petriNet.hasTransition(
      transitionIdForNode(getTaskById(choreography, taskId)),
    ),
  );
  const synchronizedTasks = getPureSynchronizedTasks({
    lifecycleModel,
    objectReferences,
    taskNameIndex,
  });
  const diagnostics: PureSynchronizedTaskDiagnostics = {
    lifecycleTriggerNames: getLifecycleTriggerNames(lifecycleModel).length,
    pureSynchronizedTasks: synchronizedTasks.length,
    combinedTasksSkipped: combinedTasksSkipped.length,
    synchronizedTaskTransitionsReplaced: 0,
    transmissionPlacesGenerated: 0,
    synchronizedSenderTransitionsGenerated: 0,
    synchronizedReceiverTransitionsGenerated: 0,
  };

  for (const task of getChoreographyTasks(choreography)) {
    if (combinedTasksSkipped.includes(task.id)) {
      logger.warn(
        { taskId: task.id, taskName: task.name ?? task.id },
        `Task "${
          task.name ?? task.id
        }" has both object reference and synchronized triggers, but was not replaced by combined mapping; leaving provisional transition unchanged.`,
      );
    }
  }

  for (const synchronizedTask of synchronizedTasks) {
    const task = getTaskById(choreography, synchronizedTask.taskId);
    const provisionalTransitionId = transitionIdForNode(task);

    if (!petriNet.hasTransition(provisionalTransitionId)) {
      continue;
    }

    const incomingArcs = petriNet.getIncomingArcs(provisionalTransitionId);
    const outgoingArcs = petriNet.getOutgoingArcs(provisionalTransitionId);

    if (incomingArcs.length !== 1) {
      throw new Error(
        `Pure synchronized task "${synchronizedTask.taskName}" expected one incoming control-flow arc, found ${incomingArcs.length}`,
      );
    }

    if (outgoingArcs.length !== 1) {
      throw new Error(
        `Pure synchronized task "${synchronizedTask.taskName}" expected one outgoing control-flow arc, found ${outgoingArcs.length}`,
      );
    }

    const preControlFlowPlaceId = incomingArcs[0].sourceId;
    const postControlFlowPlaceId = outgoingArcs[0].targetId;
    const taskBounds = petriNet.getNodeBounds(provisionalTransitionId);
    const senderRole = getTaskSender(task);
    const receiverRole = getTaskReceiver(task);

    petriNet.removeArcsIncidentTo(provisionalTransitionId);
    petriNet.removeTransition(provisionalTransitionId);
    diagnostics.synchronizedTaskTransitionsReplaced += 1;

    const subnetMetadata = addPureSynchronizedSubnet({
      petriNet,
      task,
      synchronizedTask,
      taskBounds,
      senderRole,
      receiverRole,
      preControlFlowPlaceId,
      postControlFlowPlaceId,
    });

    objectAwareRealizabilityMetadata?.taskInteractions.push({
      taskId: task.id,
      taskName: synchronizedTask.taskName,
      senderRole,
      receiverRole,
      preControlFlowPlaceId,
      postControlFlowPlaceId,
      transmissionPlaceId: subnetMetadata.transmissionPlaceId,
      senderTransitionIds: subnetMetadata.senderTransitionIds,
      receiverTransitionIds: subnetMetadata.receiverTransitionIds,
      kind: "synchronization",
    });

    diagnostics.transmissionPlacesGenerated += 1;
    diagnostics.synchronizedSenderTransitionsGenerated +=
      synchronizedTask.sourceCombinations.length;
    diagnostics.synchronizedReceiverTransitionsGenerated +=
      synchronizedTask.sourceCombinations.length;
  }

  return diagnostics;
}

function addPureSynchronizedSubnet(args: {
  petriNet: PetriNetBuilder;
  task: ChoreographyTask;
  synchronizedTask: SynchronizedTaskSemantics;
  taskBounds: Bounds | undefined;
  senderRole: string;
  receiverRole: string;
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
    synchronizedTask,
    taskBounds,
    senderRole,
    receiverRole,
    preControlFlowPlaceId,
    postControlFlowPlaceId,
  } = args;
  const transmissionId = transmissionPlaceId(task.id);
  const senderTransitionIds: string[] = [];
  const receiverTransitionIds: string[] = [];

  petriNet.addPlace(
    transmissionId,
    `${synchronizedTask.taskName} transmission`,
    0,
    boundsNearTask(taskBounds, 0, 0, 32, 32),
  );

  synchronizedTask.sourceCombinations.forEach((sourceCombination, index) => {
    const sendTransitionId = synchronizedSendTransitionId(
      task.id,
      sourceCombination,
    );
    const receiveTransitionId = synchronizedReceiveTransitionId(
      task.id,
      sourceCombination,
    );
    senderTransitionIds.push(sendTransitionId);
    receiverTransitionIds.push(receiveTransitionId);

    petriNet.addTransition(
      sendTransitionId,
      `${synchronizedTask.taskName} sync send`,
      false,
      boundsNearTask(taskBounds, -60 - index * 50, -80, 40, 60),
    );
    petriNet.addArc(preControlFlowPlaceId, sendTransitionId);
    petriNet.addArc(sendTransitionId, transmissionId);
    addSynchronizationStateUpdateArcs(
      petriNet,
      sendTransitionId,
      senderRole,
      synchronizedTask,
      sourceCombination,
    );

    petriNet.addTransition(
      receiveTransitionId,
      `${synchronizedTask.taskName} sync receive`,
      false,
      boundsNearTask(taskBounds, 60 + index * 50, 80, 40, 60),
    );
    petriNet.addArc(transmissionId, receiveTransitionId);
    petriNet.addArc(receiveTransitionId, postControlFlowPlaceId);
    addSynchronizationStateUpdateArcs(
      petriNet,
      receiveTransitionId,
      receiverRole,
      synchronizedTask,
      sourceCombination,
    );
  });

  return {
    transmissionPlaceId: transmissionId,
    senderTransitionIds,
    receiverTransitionIds,
  };
}

function addSynchronizationStateUpdateArcs(
  petriNet: PetriNetBuilder,
  transitionId: string,
  role: string,
  synchronizedTask: SynchronizedTaskSemantics,
  sourceCombination: Map<string, string>,
): void {
  for (const classId of synchronizedTask.affectedClasses) {
    const sourceStateId = sourceCombination.get(classId);
    const targetStateId = synchronizedTask.targetStateByClass.get(classId);

    if (!sourceStateId || !targetStateId) {
      throw new Error(
        `Could not resolve synchronized state update for ${synchronizedTask.taskName}.${classId}`,
      );
    }

    petriNet.addArc(statePlaceId(role, classId, sourceStateId), transitionId);
    petriNet.addArc(transitionId, statePlaceId(role, classId, targetStateId));
  }
}

function getTaskById(
  choreography: Choreography,
  taskId: string,
): ChoreographyTask {
  const task = getChoreographyTasks(choreography).find(
    (candidate) => candidate.id === taskId,
  );

  if (!task) {
    throw new Error(`Could not find choreography task ${taskId}`);
  }

  return task;
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
