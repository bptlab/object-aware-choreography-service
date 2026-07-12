import type {
  LifecycleModel,
  LifecycleTransition,
  ObjectLifecycle,
} from "./lifecycleTypes.js";
import { logger } from "../../../logger.js";
import type { ObjectReference } from "../choreography/objectReferences.js";
import {
  normalizeLabel,
  type TaskNameIndex,
  type TaskNameInfo,
} from "../choreography/taskNames.js";

export interface SynchronizedTransition {
  classId: string;
  sourceStateId: string;
  targetStateId: string;
  lifecycleTransitionId: string;
}

export interface SynchronizedTaskSemantics {
  taskId: string;
  taskName: string;
  affectedClasses: string[];
  sourceStatesByClass: Map<string, string[]>;
  targetStateByClass: Map<string, string>;
  sourceCombinations: Array<Map<string, string>>;
  transitions: SynchronizedTransition[];
}

export type TriggerTransitionEntry = {
  classId: string;
  lifecycle: ObjectLifecycle;
  transition: LifecycleTransition;
};

export function getLifecycleTriggerNames(
  lifecycleModel: LifecycleModel
): string[] {
  return [
    ...new Set(
      [...lifecycleModel.lifecycles.values()].flatMap((lifecycle) =>
        lifecycle.transitions
          .map((transition) => transition.triggerName)
          .filter(
            (triggerName): triggerName is string => triggerName !== undefined
          )
          .map(normalizeLabel)
      )
    ),
  ].sort();
}

export function getTriggeredTaskIds(
  lifecycleModel: LifecycleModel,
  taskNameIndex: TaskNameIndex
): Set<string> {
  const taskIds = new Set<string>();

  for (const triggerName of getLifecycleTriggerNames(lifecycleModel)) {
    const taskInfos = taskNameIndex.tasksByCanonicalName.get(triggerName);

    if (!taskInfos || taskInfos.length === 0) {
      logger.warn(
        { triggerName },
        `Lifecycle trigger "${triggerName}" does not match any choreography task name.`
      );
      continue;
    }

    for (const taskInfo of taskInfos) {
      taskIds.add(taskInfo.taskId);
    }
  }

  return taskIds;
}

export function getPureSynchronizedTasks(args: {
  lifecycleModel: LifecycleModel;
  objectReferences: Map<string, ObjectReference>;
  taskNameIndex: TaskNameIndex;
}): SynchronizedTaskSemantics[] {
  const { lifecycleModel, objectReferences, taskNameIndex } = args;
  const triggerTransitionsByName =
    buildTriggerTransitionsByName(lifecycleModel);
  const semantics: SynchronizedTaskSemantics[] = [];

  for (const triggerName of [...triggerTransitionsByName.keys()].sort()) {
    const taskInfos = taskNameIndex.tasksByCanonicalName.get(triggerName);

    if (!taskInfos || taskInfos.length === 0) {
      logger.warn(
        { triggerName },
        `Lifecycle trigger "${triggerName}" does not match any choreography task name.`
      );
      continue;
    }

    for (const taskInfo of taskInfos) {
      if (objectReferences.has(taskInfo.taskId)) {
        continue;
      }

      semantics.push(
        buildSynchronizedTaskSemantics(
          taskInfo,
          triggerTransitionsByName.get(triggerName) ?? [],
          lifecycleModel
        )
      );
    }
  }

  return semantics.sort((left, right) =>
    left.taskName.localeCompare(right.taskName)
  );
}

export function getSynchronizedTaskSemanticsForTask(args: {
  taskInfo: TaskNameInfo;
  lifecycleModel: LifecycleModel;
}): SynchronizedTaskSemantics | undefined {
  const triggerTransitionsByName = buildTriggerTransitionsByName(
    args.lifecycleModel
  );
  const transitionEntries = triggerTransitionsByName.get(
    args.taskInfo.canonicalName
  );

  if (!transitionEntries || transitionEntries.length === 0) {
    return undefined;
  }

  return buildSynchronizedTaskSemantics(
    args.taskInfo,
    transitionEntries,
    args.lifecycleModel
  );
}

export function buildSynchronizedTaskSemantics(
  taskInfo: TaskNameInfo,
  transitionEntries: TriggerTransitionEntry[],
  lifecycleModel: LifecycleModel
): SynchronizedTaskSemantics {
  const transitionsByClass = new Map<string, LifecycleTransition[]>();

  for (const { classId, transition } of transitionEntries) {
    if (transition.source === "initial") {
      throw new Error(
        `Synchronized transition "${transition.id}" for task "${taskInfo.taskName}" originates from initial; synchronized transitions may not create objects.`
      );
    }

    const transitions = transitionsByClass.get(classId) ?? [];
    transitions.push(transition);
    transitionsByClass.set(classId, transitions);
  }

  const affectedClasses = [...transitionsByClass.keys()].sort();
  const sourceStatesByClass = new Map<string, string[]>();
  const targetStateByClass = new Map<string, string>();
  const synchronizedTransitions: SynchronizedTransition[] = [];

  for (const classId of affectedClasses) {
    const lifecycle = lifecycleModel.lifecycles.get(classId);
    const transitions = transitionsByClass.get(classId) ?? [];
    const targetStates = new Set(
      transitions.map((transition) => transition.target)
    );

    if (targetStates.size !== 1) {
      throw new Error(
        `Triggered transitions for task "${taskInfo.taskName}" and class "${classId}" do not share a common target state.`
      );
    }

    if (!lifecycle) {
      throw new Error(`Lifecycle for synchronized class ${classId} is missing`);
    }

    const sourceStateSet = new Set(
      transitions.map((transition) => transition.source)
    );
    sourceStatesByClass.set(
      classId,
      lifecycle.states
        .map((state) => state.id)
        .filter((stateId) => sourceStateSet.has(stateId))
    );
    targetStateByClass.set(classId, transitions[0].target);
    synchronizedTransitions.push(
      ...transitions.map((transition) => ({
        classId,
        sourceStateId: transition.source,
        targetStateId: transition.target,
        lifecycleTransitionId: transition.id,
      }))
    );
  }

  return {
    taskId: taskInfo.taskId,
    taskName: taskInfo.taskName,
    affectedClasses,
    sourceStatesByClass,
    targetStateByClass,
    sourceCombinations: buildSourceCombinations(
      affectedClasses,
      sourceStatesByClass
    ),
    transitions: synchronizedTransitions,
  };
}

export function buildSourceCombinations(
  affectedClasses: string[],
  sourceStatesByClass: Map<string, string[]>
): Array<Map<string, string>> {
  return affectedClasses.reduce<Array<Map<string, string>>>(
    (combinations, classId) => {
      const sourceStates = sourceStatesByClass.get(classId) ?? [];

      return combinations.flatMap((combination) =>
        sourceStates.map((sourceStateId) => {
          const nextCombination = new Map(combination);
          nextCombination.set(classId, sourceStateId);
          return nextCombination;
        })
      );
    },
    [new Map<string, string>()]
  );
}

function buildTriggerTransitionsByName(lifecycleModel: LifecycleModel) {
  const transitionsByName = new Map<string, TriggerTransitionEntry[]>();

  for (const lifecycle of lifecycleModel.lifecycles.values()) {
    for (const transition of lifecycle.transitions) {
      if (!transition.triggerName) {
        continue;
      }

      const triggerName = normalizeLabel(transition.triggerName);
      const transitions = transitionsByName.get(triggerName) ?? [];
      transitions.push({
        classId: lifecycle.classId,
        lifecycle,
        transition,
      });
      transitionsByName.set(triggerName, transitions);
    }
  }

  return transitionsByName;
}
