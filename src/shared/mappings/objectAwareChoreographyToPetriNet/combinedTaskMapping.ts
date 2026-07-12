import type { Choreography, ChoreographyTask } from "bpmn-moddle";
import type { ObjectAwareRealizabilityMetadata } from "../../analysis/objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";
import type { DataModel } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type { LifecycleModel } from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import {
  combinedReceiveTransitionId,
  combinedSendTransitionId,
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
import type { ObjectReference } from "../../source/objectAwareChoreography/choreography/objectReferences.js";
import { getCompatibleReceiverStates } from "../../source/objectAwareChoreography/lifecycle/receiverCompatibility.js";
import {
  buildSourceCombinations,
  getSynchronizedTaskSemanticsForTask,
  type SynchronizedTaskSemantics,
} from "../../source/objectAwareChoreography/lifecycle/synchronizedTransitions.js";
import type { TaskNameIndex } from "../../source/objectAwareChoreography/choreography/taskNames.js";

export type CombinedTaskDiagnostics = {
  canonicalTaskGroups: number;
  combinedTasks: number;
  combinedSenderTransitions: number;
  combinedReceiverTransitions: number;
};

export function applyCombinedTaskMapping(args: {
  choreography: Choreography;
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  objectReferences: Map<string, ObjectReference>;
  petriNet: PetriNetBuilder;
  taskNameIndex: TaskNameIndex;
  objectAwareRealizabilityMetadata?: ObjectAwareRealizabilityMetadata;
}): CombinedTaskDiagnostics {
  const {
    choreography,
    lifecycleModel,
    objectReferences,
    petriNet,
    taskNameIndex,
    objectAwareRealizabilityMetadata,
  } = args;
  const diagnostics: CombinedTaskDiagnostics = {
    canonicalTaskGroups: [
      ...taskNameIndex.tasksByCanonicalName.values(),
    ].filter((taskInfos) => taskInfos.length > 1).length,
    combinedTasks: 0,
    combinedSenderTransitions: 0,
    combinedReceiverTransitions: 0,
  };

  for (const task of getChoreographyTasks(choreography)) {
    const objectReference = objectReferences.get(task.id);
    const taskInfo = taskNameIndex.byTaskId.get(task.id);

    if (!objectReference || !taskInfo) {
      continue;
    }

    const synchronizedTask = getSynchronizedTaskSemanticsForTask({
      taskInfo,
      lifecycleModel,
    });

    if (!synchronizedTask) {
      continue;
    }

    validateCombinedTaskWellFormedness(objectReference, synchronizedTask);

    const provisionalTransitionId = transitionIdForNode(task);

    if (!petriNet.hasTransition(provisionalTransitionId)) {
      continue;
    }

    const incomingArcs = petriNet.getIncomingArcs(provisionalTransitionId);
    const outgoingArcs = petriNet.getOutgoingArcs(provisionalTransitionId);

    if (incomingArcs.length !== 1) {
      throw new Error(
        `Combined task "${objectReference.taskName}" expected one incoming control-flow arc, found ${incomingArcs.length}`,
      );
    }

    if (outgoingArcs.length !== 1) {
      throw new Error(
        `Combined task "${objectReference.taskName}" expected one outgoing control-flow arc, found ${outgoingArcs.length}`,
      );
    }

    const senderRole = getTaskSender(task);
    const receiverRole = getTaskReceiver(task);
    const baseCompatibleReceiverStates = getCompatibleReceiverStates(
      mustGetLifecycle(lifecycleModel, objectReference.classId),
      receiverRole,
      objectReference.stateId,
    );
    const compatibleReceiverStates = addCommunicatedSourceStateIfSynchronized(
      baseCompatibleReceiverStates,
      objectReference,
      synchronizedTask,
    );
    const taskBounds = petriNet.getNodeBounds(provisionalTransitionId);

    petriNet.removeArcsIncidentTo(provisionalTransitionId);
    petriNet.removeTransition(provisionalTransitionId);

    const subnetDiagnostics = addCombinedSubnet({
      petriNet,
      task,
      synchronizedTask,
      objectReference,
      senderRole,
      receiverRole,
      compatibleReceiverStates,
      preControlFlowPlaceId: incomingArcs[0].sourceId,
      postControlFlowPlaceId: outgoingArcs[0].targetId,
      taskBounds,
    });

    diagnostics.combinedTasks += 1;
    diagnostics.combinedSenderTransitions +=
      subnetDiagnostics.senderTransitions;
    diagnostics.combinedReceiverTransitions +=
      subnetDiagnostics.receiverTransitions;
    objectAwareRealizabilityMetadata?.taskInteractions.push({
      taskId: task.id,
      taskName: objectReference.taskName,
      senderRole,
      receiverRole,
      preControlFlowPlaceId: incomingArcs[0].sourceId,
      postControlFlowPlaceId: outgoingArcs[0].targetId,
      transmissionPlaceId: subnetDiagnostics.transmissionPlaceId,
      senderTransitionIds: subnetDiagnostics.senderTransitionIds,
      receiverTransitionIds: subnetDiagnostics.receiverTransitionIds,
      kind: "combined",
    });
  }

  return diagnostics;
}

function validateCombinedTaskWellFormedness(
  objectReference: ObjectReference,
  synchronizedTask: SynchronizedTaskSemantics,
): void {
  if (!synchronizedTask.affectedClasses.includes(objectReference.classId)) {
    return;
  }

  const sourceStates =
    synchronizedTask.sourceStatesByClass.get(objectReference.classId) ?? [];

  if (!sourceStates.includes(objectReference.stateId)) {
    throw new Error(
      `Combined task "${objectReference.taskName}" communicates ${objectReference.classId}[${objectReference.stateId}], but this state is not an admissible synchronized source state for the communicated class.`,
    );
  }
}

function addCommunicatedSourceStateIfSynchronized(
  compatibleReceiverStates: string[],
  objectReference: ObjectReference,
  synchronizedTask: SynchronizedTaskSemantics,
): string[] {
  if (!synchronizedTask.affectedClasses.includes(objectReference.classId)) {
    return compatibleReceiverStates;
  }

  return [...new Set([...compatibleReceiverStates, objectReference.stateId])];
}

function addCombinedSubnet(args: {
  petriNet: PetriNetBuilder;
  task: ChoreographyTask;
  synchronizedTask: SynchronizedTaskSemantics;
  objectReference: ObjectReference;
  senderRole: string;
  receiverRole: string;
  compatibleReceiverStates: string[];
  preControlFlowPlaceId: string;
  postControlFlowPlaceId: string;
  taskBounds: Bounds | undefined;
}): {
  senderTransitions: number;
  receiverTransitions: number;
  transmissionPlaceId: string;
  senderTransitionIds: string[];
  receiverTransitionIds: string[];
} {
  const {
    petriNet,
    task,
    synchronizedTask,
    objectReference,
    senderRole,
    receiverRole,
    compatibleReceiverStates,
    preControlFlowPlaceId,
    postControlFlowPlaceId,
    taskBounds,
  } = args;
  const transmissionId = transmissionPlaceId(task.id);
  const communicatedClassAffected = synchronizedTask.affectedClasses.includes(
    objectReference.classId,
  );
  const senderCombinations = synchronizedTask.sourceCombinations.filter(
    (sourceCombination) =>
      !communicatedClassAffected ||
      sourceCombination.get(objectReference.classId) ===
        objectReference.stateId,
  );
  const receiverAffectedClasses = communicatedClassAffected
    ? synchronizedTask.affectedClasses.filter(
        (classId) => classId !== objectReference.classId,
      )
    : synchronizedTask.affectedClasses;
  const receiverCombinations = communicatedClassAffected
    ? senderCombinations
    : buildSourceCombinations(
        receiverAffectedClasses,
        synchronizedTask.sourceStatesByClass,
      );
  const senderTransitionIds: string[] = [];
  const receiverTransitionIds: string[] = [];

  petriNet.addPlace(
    transmissionId,
    `${synchronizedTask.taskName} transmission`,
    0,
    boundsNearTask(taskBounds, 0, 0, 32, 32),
  );

  senderCombinations.forEach((sourceCombination, index) => {
    const sendTransitionId = combinedSendTransitionId(
      task.id,
      objectReference.classId,
      objectReference.stateId,
      sourceCombination,
    );
    senderTransitionIds.push(sendTransitionId);

    petriNet.addTransition(
      sendTransitionId,
      `${synchronizedTask.taskName} combined send`,
      false,
      boundsNearTask(taskBounds, -60 - index * 50, -80, 40, 60),
    );
    petriNet.addArc(preControlFlowPlaceId, sendTransitionId);
    petriNet.addArc(sendTransitionId, transmissionId);

    if (!communicatedClassAffected) {
      const senderStatePlaceId = statePlaceId(
        senderRole,
        objectReference.classId,
        objectReference.stateId,
      );
      petriNet.addArc(senderStatePlaceId, sendTransitionId);
      petriNet.addArc(sendTransitionId, senderStatePlaceId);
    }

    addSynchronizedUpdateArcs(
      petriNet,
      sendTransitionId,
      senderRole,
      synchronizedTask,
      sourceCombination,
      synchronizedTask.affectedClasses,
    );
  });

  let receiverTransitionCount = 0;
  compatibleReceiverStates.forEach((compatibleStateId, compatibleIndex) => {
    receiverCombinations.forEach((sourceCombination, combinationIndex) => {
      const receiveTransitionId = combinedReceiveTransitionId(
        task.id,
        objectReference.classId,
        objectReference.stateId,
        compatibleStateId,
        targetStateForCommunicatedObject(objectReference, synchronizedTask),
        sourceCombination,
      );
      receiverTransitionIds.push(receiveTransitionId);

      petriNet.addTransition(
        receiveTransitionId,
        `${synchronizedTask.taskName} combined receive`,
        false,
        boundsNearTask(
          taskBounds,
          60 +
            (compatibleIndex * receiverCombinations.length + combinationIndex) *
              50,
          80,
          40,
          60,
        ),
      );
      petriNet.addArc(transmissionId, receiveTransitionId);
      petriNet.addArc(receiveTransitionId, postControlFlowPlaceId);
      petriNet.addArc(
        statePlaceId(receiverRole, objectReference.classId, compatibleStateId),
        receiveTransitionId,
      );

      if (communicatedClassAffected) {
        const targetState = synchronizedTask.targetStateByClass.get(
          objectReference.classId,
        );

        if (!targetState) {
          throw new Error(
            `Combined task "${objectReference.taskName}" has no target state for communicated class ${objectReference.classId}`,
          );
        }

        petriNet.addArc(
          receiveTransitionId,
          statePlaceId(receiverRole, objectReference.classId, targetState),
        );
      } else {
        petriNet.addArc(
          receiveTransitionId,
          statePlaceId(
            receiverRole,
            objectReference.classId,
            objectReference.stateId,
          ),
        );
      }

      if (compatibleStateId === "initial") {
        petriNet.addArc(
          receiveTransitionId,
          existencePlaceId(receiverRole, objectReference.classId),
        );
      }

      addSynchronizedUpdateArcs(
        petriNet,
        receiveTransitionId,
        receiverRole,
        synchronizedTask,
        sourceCombination,
        receiverAffectedClasses,
      );
      receiverTransitionCount += 1;
    });
  });

  return {
    senderTransitions: senderCombinations.length,
    receiverTransitions: receiverTransitionCount,
    transmissionPlaceId: transmissionId,
    senderTransitionIds,
    receiverTransitionIds,
  };
}

function addSynchronizedUpdateArcs(
  petriNet: PetriNetBuilder,
  transitionId: string,
  role: string,
  synchronizedTask: SynchronizedTaskSemantics,
  sourceCombination: Map<string, string>,
  affectedClasses: string[],
): void {
  for (const classId of affectedClasses) {
    const sourceStateId = sourceCombination.get(classId);
    const targetStateId = synchronizedTask.targetStateByClass.get(classId);

    if (!sourceStateId || !targetStateId) {
      throw new Error(
        `Could not resolve combined synchronized state update for ${synchronizedTask.taskName}.${classId}`,
      );
    }

    petriNet.addArc(statePlaceId(role, classId, sourceStateId), transitionId);
    petriNet.addArc(transitionId, statePlaceId(role, classId, targetStateId));
  }
}

function targetStateForCommunicatedObject(
  objectReference: ObjectReference,
  synchronizedTask: SynchronizedTaskSemantics,
): string {
  if (!synchronizedTask.affectedClasses.includes(objectReference.classId)) {
    return objectReference.stateId;
  }

  const targetState = synchronizedTask.targetStateByClass.get(
    objectReference.classId,
  );

  if (!targetState) {
    throw new Error(
      `Combined task "${objectReference.taskName}" has no target state for communicated class ${objectReference.classId}`,
    );
  }

  return targetState;
}

function mustGetLifecycle(lifecycleModel: LifecycleModel, classId: string) {
  const lifecycle = lifecycleModel.lifecycles.get(classId);

  if (!lifecycle) {
    throw new Error(`Class ${classId} does not have an object lifecycle`);
  }

  return lifecycle;
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
