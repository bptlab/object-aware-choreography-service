import type { Choreography, ChoreographyTask, FlowNode } from "bpmn-moddle";
import type {
  BsplBuildResult,
  BsplMessageSchema,
  BsplProtocol,
  BsplProtocolParameter,
  BsplWarning,
} from "../../targets/bspl/bsplTypes.js";
import type { ObjectAwareChoreographyContext } from "../../context/objectAwareChoreographyContext.js";
import {
  buildIncomingFlowsByNodeId,
  buildOutgoingFlowsByNodeId,
  getChoreographyTasks,
  getParticipantNames,
  getTaskReceiver,
  getTaskSender,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import type { ObjectReference } from "../../source/objectAwareChoreography/choreography/objectReferences.js";
import type {
  LifecycleTransition,
  ObjectLifecycle,
} from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import {
  buildSynchronizedTaskSemantics,
  type TriggerTransitionEntry,
  type SynchronizedTaskSemantics,
} from "../../source/objectAwareChoreography/lifecycle/synchronizedTransitions.js";
import {
  normalizeLabel,
  type TaskNameInfo,
} from "../../source/objectAwareChoreography/choreography/taskNames.js";
import { buildBsplKeyMapping, type BsplKeyMapping } from "./keyMapping.js";
import {
  BsplMessageVariantBuilder,
  deduplicateMessageSchemas,
  expandByAlternativeSignatures,
} from "./messageMapping.js";
import {
  buildBsplParameterMapping,
  bsplMessageName,
  sanitizeBsplIdentifier,
  taskOccurrenceParameterName,
  type BsplParameterMapping,
} from "./parameterMapping.js";
import { validateBsplMappingPreconditions } from "./validation.js";

const CASE_ID_PARAMETER = "case_id";
const COMPLETED_PARAMETER = "completed";

export function buildBspl(
  context: ObjectAwareChoreographyContext,
): BsplBuildResult {
  validateBsplMappingPreconditions({
    choreography: context.choreography,
    lifecycleModel: context.lifecycleModel,
  });

  const warnings: BsplWarning[] = [];
  const parameterMapping = buildBsplParameterMapping({
    dataModel: context.dataModel,
    lifecycleModel: context.lifecycleModel,
  });
  warnings.push(...parameterMapping.warnings);
  const keyMapping = buildBsplKeyMapping({
    dataModel: context.dataModel,
    lifecycleModel: context.lifecycleModel,
    parameterMapping,
  });
  validateMandatoryOneToOneCreationGroups(context, keyMapping);

  const tasks = getChoreographyTasks(context.choreography).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const taskOccurrenceParameters = buildTaskOccurrenceParameters(tasks);
  const forwardingTaskIds = computeForwardingTaskIds(context);
  let skippedVariants = 0;
  const messages: BsplMessageSchema[] = [];

  for (const task of tasks) {
    const result = buildTaskMessages({
      context,
      task,
      parameterMapping,
      keyMapping,
      taskOccurrenceParameters,
      forwardingTaskIds,
      warnings,
    });
    skippedVariants += result.skippedVariants;
    messages.push(...result.messages);
  }

  const deduplicatedMessages = deduplicateMessageSchemas(messages);
  validateEveryTaskHasMessageSchema(tasks, deduplicatedMessages);
  const usedPrivateParameters = collectPrivateParameters(deduplicatedMessages);
  const protocol: BsplProtocol = {
    name: protocolName(context.choreography),
    roles: getTaskParticipantNames(context.choreography),
    parameters: [
      { name: CASE_ID_PARAMETER, adornment: "out", key: true },
      { name: COMPLETED_PARAMETER, adornment: "out" },
      ...usedPrivateParameters.map<BsplProtocolParameter>((name) => ({
        name,
        adornment: "out",
        private: true,
      })),
    ],
    messages: deduplicatedMessages,
  };

  return {
    protocol,
    warnings,
    summary: {
      roles: protocol.roles.length,
      parameters: protocol.parameters.length,
      privateParameters: usedPrivateParameters.length,
      messages: protocol.messages.length,
      skippedVariants,
    },
  };
}

function getTaskParticipantNames(choreography: Choreography): string[] {
  const taskRoles = new Set<string>();

  for (const task of getChoreographyTasks(choreography)) {
    taskRoles.add(getTaskSender(task));
    taskRoles.add(getTaskReceiver(task));
  }

  const orderedParticipantRoles = getParticipantNames(choreography).filter(
    (role) => taskRoles.has(role),
  );
  const knownParticipantRoles = new Set(orderedParticipantRoles);
  const taskOnlyRoles = [...taskRoles].filter(
    (role) => !knownParticipantRoles.has(role),
  );

  return [...orderedParticipantRoles, ...taskOnlyRoles];
}

function validateMandatoryOneToOneCreationGroups(
  context: ObjectAwareChoreographyContext,
  keyMapping: BsplKeyMapping,
): void {
  for (const group of keyMapping.oneToOneGroups) {
    const creatorRoles = new Map<string, string>();

    for (const classId of group) {
      creatorRoles.set(
        classId,
        determineLifecycleCreatorRole(context, classId, group),
      );
    }

    const distinctCreatorRoles = new Set(creatorRoles.values());

    if (distinctCreatorRoles.size !== 1) {
      throw new Error(
        `Mandatory one-to-one creation group requires a common creator role: [${group.join(", ")}] has creators ${[...creatorRoles.entries()]
          .map(([classId, role]) => `${classId}:${role}`)
          .join(", ")}`,
      );
    }

    const [creatorRole] = distinctCreatorRoles;

    for (const task of getChoreographyTasks(context.choreography)) {
      const objectReference = context.objectReferences.get(task.id);

      if (!objectReference || !group.includes(objectReference.classId)) {
        continue;
      }

      const sender = getTaskSender(task);

      if (sender !== creatorRole) {
        throw new Error(
          `One-to-one creation group identifier bound by non-creator role: task "${task.name ?? task.id}" sends ${objectReference.classId} as ${sender}, but group [${group.join(", ")}] requires ${creatorRole}`,
        );
      }
    }
  }
}

function determineLifecycleCreatorRole(
  context: ObjectAwareChoreographyContext,
  classId: string,
  group: string[],
): string {
  const lifecycle = context.lifecycleModel.lifecycles.get(classId);

  if (!lifecycle) {
    throw new Error(
      `Mandatory one-to-one creation group requires lifecycle for class ${classId} in [${group.join(", ")}]`,
    );
  }

  const creatorRoles = new Set(
    lifecycle.transitions
      .filter((transition) => transition.source === lifecycle.initialStateId)
      .map((transition) => transition.actor)
      .filter((actor): actor is string => actor !== undefined),
  );

  if (creatorRoles.size !== 1) {
    throw new Error(
      `Mandatory one-to-one creation group requires a common creator role: class ${classId} has creator roles [${[...creatorRoles].join(", ")}] in group [${group.join(", ")}]`,
    );
  }

  return [...creatorRoles][0];
}

function buildTaskOccurrenceParameters(
  tasks: ChoreographyTask[],
): Map<string, string> {
  const baseNamesByTaskId = new Map<string, string>();
  const taskIdsByBaseName = new Map<string, string[]>();

  for (const task of tasks) {
    const baseName = taskOccurrenceParameterName(task.name ?? "", task.id);
    baseNamesByTaskId.set(task.id, baseName);
    taskIdsByBaseName.set(baseName, [
      ...(taskIdsByBaseName.get(baseName) ?? []),
      task.id,
    ]);
  }

  return new Map(
    tasks.map((task) => {
      const baseName = mustGetMapValue(baseNamesByTaskId, task.id);
      const collidingTaskIds = taskIdsByBaseName.get(baseName) ?? [];

      if (collidingTaskIds.length <= 1) {
        return [task.id, baseName];
      }

      return [task.id, `${baseName}_${shortTaskIdSuffix(task.id)}`];
    }),
  );
}

function mustGetTaskOccurrenceParameter(
  taskOccurrenceParameters: Map<string, string>,
  task: ChoreographyTask,
): string {
  return mustGetMapValue(taskOccurrenceParameters, task.id);
}

function mustGetMapValue(
  map: Map<string, string>,
  key: string,
): string {
  const value = map.get(key);

  if (!value) {
    throw new Error(`Missing BSPL task occurrence parameter for task ${key}`);
  }

  return value;
}

function shortTaskIdSuffix(taskId: string): string {
  const sanitized = sanitizeBsplIdentifier(taskId);
  const parts = sanitized.split("-").filter((part) => part.length > 0);
  const suffix = parts.at(-1) ?? sanitized;

  return suffix.slice(0, 8);
}

function buildTaskMessages(args: {
  context: ObjectAwareChoreographyContext;
  task: ChoreographyTask;
  parameterMapping: BsplParameterMapping;
  keyMapping: BsplKeyMapping;
  taskOccurrenceParameters: Map<string, string>;
  forwardingTaskIds: Set<string>;
  warnings: BsplWarning[];
}): { messages: BsplMessageSchema[]; skippedVariants: number } {
  const {
    context,
    task,
    parameterMapping,
    keyMapping,
    taskOccurrenceParameters,
    forwardingTaskIds,
    warnings,
  } = args;
  const taskName = task.name ?? task.id;
  const taskInfo = context.taskNameIndex.byTaskId.get(task.id);
  const synchronizedSemantics = taskInfo
    ? getBsplSynchronizedTaskSemanticsForTask({
        taskInfo,
        lifecycleModel: context.lifecycleModel,
      })
    : undefined;
  const objectReference = context.objectReferences.get(task.id);
  const base = new BsplMessageVariantBuilder(
    `m_${sanitizeBsplIdentifier(task.id)}`,
    bsplMessageName(taskName, task.id),
    getTaskSender(task),
    getTaskReceiver(task),
    task.id,
  );

  base.add(
    CASE_ID_PARAMETER,
    canStartTask(context.choreography, task) ? "out" : "in",
  );

  if (canConcludeTask(context.choreography, task)) {
    base.add(COMPLETED_PARAMETER, "out");
  }

  const built = objectReference
    ? buildObjectCommunicatingTaskVariants({
        context,
        task,
        objectReference,
        base,
        parameterMapping,
        keyMapping,
        taskOccurrenceParameter: mustGetTaskOccurrenceParameter(
          taskOccurrenceParameters,
          task,
        ),
        isForwardingTask:
          forwardingTaskIds.has(task.id) &&
          !canStartTask(context.choreography, task),
        synchronizedTargetStateId: synchronizedSemantics?.targetStateByClass.get(
          objectReference.classId,
        ),
        warnings,
      })
    : buildNonObjectTaskVariants({
        task,
        base,
        taskOccurrenceParameter: mustGetTaskOccurrenceParameter(
          taskOccurrenceParameters,
          task,
        ),
      });
  const refined = refineWithSynchronizedEffects({
    builders: built.builders,
    objectReference,
    synchronizedSemantics,
    parameterMapping,
    context,
    warnings,
  });
  const messages = refined.builders
    .map((builder) => builder.build())
    .filter((message): message is BsplMessageSchema => message !== undefined);

  return {
    messages,
    skippedVariants: built.skippedVariants + refined.skippedVariants,
  };
}

function buildObjectCommunicatingTaskVariants(args: {
  context: ObjectAwareChoreographyContext;
  task: ChoreographyTask;
  objectReference: ObjectReference;
  base: BsplMessageVariantBuilder;
  parameterMapping: BsplParameterMapping;
  keyMapping: BsplKeyMapping;
  taskOccurrenceParameter: string;
  isForwardingTask: boolean;
  synchronizedTargetStateId: string | undefined;
  warnings: BsplWarning[];
}): { builders: BsplMessageVariantBuilder[]; skippedVariants: number } {
  const {
    context,
    task,
    objectReference,
    base,
    parameterMapping,
    keyMapping,
    taskOccurrenceParameter,
    isForwardingTask,
    synchronizedTargetStateId,
    warnings,
  } = args;
  const lifecycle = mustGetLifecycle(context, objectReference.classId);
  const builders: BsplMessageVariantBuilder[] = [];
  let skippedVariants = 0;
  const targetAttributeSignature = parameterMapping.attributeSignature(
    objectReference.classId,
    objectReference.stateId,
  );

  if (
    keyMapping.initialConcreteStatesByClass
      .get(objectReference.classId)
      ?.includes(objectReference.stateId) &&
    lifecycle.transitions.some(
      (transition) =>
        transition.source === lifecycle.initialStateId &&
        transition.target === objectReference.stateId &&
        transition.actor === getTaskSender(task),
    )
  ) {
    if (targetAttributeSignature.length === 0) {
      skippedVariants += warnSkippedVariant({
        warnings,
        code: "bspl.missingCreationSignature",
        task,
        message: `Creation variant for task "${task.name ?? task.id}" and ${objectReference.classId} [${objectReference.stateId}] was skipped because the target state has no attribute signature.`,
      });
    } else {
      const builder = base.clone(`${base.id}_create`);
      builder.addMany(
        parameterMapping.objectIdentifier(objectReference.classId),
        "out",
      );
      builder.addMany(targetAttributeSignature, "out");
      addCreationDependencyInputs({
        builder,
        classId: objectReference.classId,
        keyMapping,
      });

      if (isForwardingTask) {
        builder.add(taskOccurrenceParameter, "out");
      }

      builders.push(builder);
    }
  }

  for (const transition of directLocalPredecessorTransitions({
    lifecycle,
    targetStateId: objectReference.stateId,
    actor: getTaskSender(task),
  })) {
    const sourceAlternatives = parameterMapping.stateSignature(
      objectReference.classId,
      transition.source,
    );

    if (sourceAlternatives.length === 0 || targetAttributeSignature.length === 0) {
      skippedVariants += warnSkippedVariant({
        warnings,
        code: "bspl.missingLocalProgressionSignature",
        task,
        message: `Local progression variant for task "${task.name ?? task.id}" and transition ${transition.id} was skipped because a source or target state signature is empty.`,
        details: { lifecycleTransitionId: transition.id },
      });
      continue;
    }

    for (const [alternativeIndex, sourceAlternative] of sourceAlternatives.entries()) {
      const builder = base.clone(
        `${base.id}_local_${sanitizeBsplIdentifier(transition.id)}_${alternativeIndex}`,
      );
      builder.addMany(
        parameterMapping.objectIdentifier(objectReference.classId),
        "in",
      );
      builder.addMany(sourceAlternative, "in");
      builder.addMany(targetAttributeSignature, "out");
      addAlternativeSuccessorNils({
        builder,
        lifecycle,
        sourceStateId: transition.source,
        selectedTargetStateId: objectReference.stateId,
        parameterMapping,
      });

      if (isForwardingTask) {
        builder.add(taskOccurrenceParameter, "out");
      }

      builders.push(builder);
    }
  }

  if (isForwardingTask) {
    const stateAlternatives = parameterMapping.stateSignature(
      objectReference.classId,
      objectReference.stateId,
    );

    if (stateAlternatives.length === 0) {
      skippedVariants += warnSkippedVariant({
        warnings,
        code: "bspl.missingForwardingSignature",
        task,
        message: `Forwarding variant for task "${task.name ?? task.id}" and ${objectReference.classId} [${objectReference.stateId}] was skipped because the communicated state has no signature.`,
      });
    }

    for (const [alternativeIndex, stateAlternative] of stateAlternatives.entries()) {
      const builder = base.clone(`${base.id}_forward_${alternativeIndex}`);
      builder.addMany(
        parameterMapping.objectIdentifier(objectReference.classId),
        "in",
      );
      builder.addMany(stateAlternative, "in");
      builder.add(taskOccurrenceParameter, "out");
      addSuccessorNils({
        builder,
        lifecycle,
        sourceStateId: objectReference.stateId,
        selectedTargetStateId: synchronizedTargetStateId,
        parameterMapping,
      });
      builders.push(builder);
    }
  }

  if (builders.length === 0) {
    const stateAlternatives = parameterMapping.stateSignature(
      objectReference.classId,
      objectReference.stateId,
    );

    if (stateAlternatives.length === 0) {
      skippedVariants += warnSkippedVariant({
        warnings,
        code: "bspl.missingStateRequirementSignature",
        task,
        message: `State-requiring variant for task "${task.name ?? task.id}" and ${objectReference.classId} [${objectReference.stateId}] was skipped because the communicated state has no signature.`,
      });
    }

    for (const [alternativeIndex, stateAlternative] of stateAlternatives.entries()) {
      const builder = base.clone(`${base.id}_require_${alternativeIndex}`);
      builder.addMany(
        parameterMapping.objectIdentifier(objectReference.classId),
        "in",
      );
      builder.addMany(stateAlternative, "in");
      builder.add(taskOccurrenceParameter, "out");
      builders.push(builder);
    }
  }

  return { builders, skippedVariants };
}

function buildNonObjectTaskVariants(args: {
  task: ChoreographyTask;
  base: BsplMessageVariantBuilder;
  taskOccurrenceParameter: string;
}): { builders: BsplMessageVariantBuilder[]; skippedVariants: number } {
  const builder = args.base.clone();
  builder.add(args.taskOccurrenceParameter, "out");

  return { builders: [builder], skippedVariants: 0 };
}

function refineWithSynchronizedEffects(args: {
  builders: BsplMessageVariantBuilder[];
  objectReference: ObjectReference | undefined;
  synchronizedSemantics: SynchronizedTaskSemantics | undefined;
  parameterMapping: BsplParameterMapping;
  context: ObjectAwareChoreographyContext;
  warnings: BsplWarning[];
}): { builders: BsplMessageVariantBuilder[]; skippedVariants: number } {
  const {
    builders,
    objectReference,
    synchronizedSemantics,
    parameterMapping,
    context,
    warnings,
  } = args;

  if (!synchronizedSemantics || synchronizedSemantics.affectedClasses.length === 0) {
    return {
      builders: builders.filter((builder) => !builder.hasConflict()),
      skippedVariants: builders.filter((builder) => builder.hasConflict()).length,
    };
  }

  const communicatedClassId = objectReference?.classId;
  const communicatedStateId = objectReference?.stateId;
  const communicatedClassIsSynchronized =
    communicatedClassId !== undefined &&
    synchronizedSemantics.affectedClasses.includes(communicatedClassId);
  const refinedBuilders: BsplMessageVariantBuilder[] = [];
  let skippedVariants = 0;

  for (const builder of builders) {
    for (const [combinationIndex, sourceCombination] of synchronizedSemantics.sourceCombinations.entries()) {
      if (
        communicatedClassIsSynchronized &&
        communicatedClassId &&
        communicatedStateId &&
        sourceCombination.get(communicatedClassId) !== communicatedStateId
      ) {
        continue;
      }

      const sourceAlternativesByClass: string[][][] = [];
      const synchronizedClasses = synchronizedSemantics.affectedClasses.filter(
        (classId) => !(communicatedClassIsSynchronized && classId === communicatedClassId),
      );
      let combinationHasEmptySignature = false;

      for (const classId of synchronizedClasses) {
        const sourceStateId = sourceCombination.get(classId);

        if (!sourceStateId) {
          continue;
        }

        const alternatives = parameterMapping.stateSignature(classId, sourceStateId);

        if (alternatives.length === 0) {
          combinationHasEmptySignature = true;
          break;
        }

        sourceAlternativesByClass.push(alternatives);
      }

      if (combinationHasEmptySignature) {
        skippedVariants += warnSkippedVariant({
          warnings,
          code: "bspl.missingSynchronizedSourceSignature",
          message: `Synchronized variant for task "${synchronizedSemantics.taskName}" was skipped because at least one synchronized source state has no signature.`,
          details: {
            taskId: synchronizedSemantics.taskId,
            combination: Object.fromEntries(sourceCombination),
          },
        });
        continue;
      }

      const expandedBuilders = expandByAlternativeSignatures(
        [builder.clone(`${builder.id}_sync_${combinationIndex}`)],
        sourceAlternativesByClass,
        "in",
        "sync",
      );

      for (const expandedBuilder of expandedBuilders) {
        for (const classId of synchronizedClasses) {
          expandedBuilder.addMany(parameterMapping.objectIdentifier(classId), "in");
        }

        for (const classId of synchronizedSemantics.affectedClasses) {
          const targetStateId = synchronizedSemantics.targetStateByClass.get(classId);

          if (!targetStateId) {
            continue;
          }

          const targetIndicator = parameterMapping.stateIndicatorSignature(
            classId,
            targetStateId,
          );

          expandedBuilder.addMany(targetIndicator, "out");

          const lifecycle = mustGetLifecycle(context, classId);
          const sourceStateId =
            communicatedClassIsSynchronized && classId === communicatedClassId
              ? communicatedStateId
              : sourceCombination.get(classId);

          if (sourceStateId) {
            addAlternativeSuccessorNils({
              builder: expandedBuilder,
              lifecycle,
              sourceStateId,
              selectedTargetStateId: targetStateId,
              parameterMapping,
            });
          }
        }

        if (expandedBuilder.hasConflict()) {
          skippedVariants += 1;
          continue;
        }

        refinedBuilders.push(expandedBuilder);
      }
    }
  }

  return { builders: refinedBuilders, skippedVariants };
}

function getBsplSynchronizedTaskSemanticsForTask(args: {
  taskInfo: TaskNameInfo;
  lifecycleModel: ObjectAwareChoreographyContext["lifecycleModel"];
}): SynchronizedTaskSemantics | undefined {
  const transitionEntries = triggerTransitionEntriesForTask(args);

  if (transitionEntries.length === 0) {
    return undefined;
  }

  return buildSynchronizedTaskSemantics(
    args.taskInfo,
    transitionEntries,
    args.lifecycleModel,
  );
}

function triggerTransitionEntriesForTask(args: {
  taskInfo: TaskNameInfo;
  lifecycleModel: ObjectAwareChoreographyContext["lifecycleModel"];
}): TriggerTransitionEntry[] {
  const entries: TriggerTransitionEntry[] = [];

  for (const lifecycle of args.lifecycleModel.lifecycles.values()) {
    for (const transition of lifecycle.transitions) {
      if (
        transition.triggerName &&
        triggerMatchesBsplTaskName(transition.triggerName, args.taskInfo)
      ) {
        entries.push({
          classId: lifecycle.classId,
          lifecycle,
          transition,
        });
      }
    }
  }

  return entries;
}

function triggerMatchesBsplTaskName(
  triggerName: string,
  taskInfo: TaskNameInfo,
): boolean {
  const normalizedTrigger = normalizeLabel(triggerName);
  const taskNames = [
    taskInfo.canonicalName,
    taskInfo.normalizedName,
    stripTaskPrefix(taskInfo.canonicalName),
    stripTaskPrefix(taskInfo.normalizedName),
  ].map(normalizeLabel);

  return taskNames.includes(normalizedTrigger);
}

function stripTaskPrefix(taskName: string): string {
  const prefixMatch = /^[^:]+:\s*(.+)$/.exec(taskName);

  return prefixMatch ? prefixMatch[1] : taskName;
}

function addCreationDependencyInputs(args: {
  builder: BsplMessageVariantBuilder;
  classId: string;
  keyMapping: BsplKeyMapping;
}): void {
  for (const requiredClassId of
    args.keyMapping.directedCreationDependenciesByClass.get(args.classId) ?? []) {
    args.builder.addMany(
      args.keyMapping.objectIdentifiersByClass.get(requiredClassId) ?? [],
      "in",
    );
  }
}

function addAlternativeSuccessorNils(args: {
  builder: BsplMessageVariantBuilder;
  lifecycle: ObjectLifecycle;
  sourceStateId: string;
  selectedTargetStateId: string;
  parameterMapping: BsplParameterMapping;
}): void {
  for (const transition of args.lifecycle.transitions) {
    if (
      transition.source !== args.sourceStateId ||
      transition.target === args.selectedTargetStateId
    ) {
      continue;
    }

    for (const alternativeSignature of args.parameterMapping.stateSignature(
      args.lifecycle.classId,
      transition.target,
    )) {
      addDistinguishingNils(args.builder, alternativeSignature);
    }
  }
}

function addSuccessorNils(args: {
  builder: BsplMessageVariantBuilder;
  lifecycle: ObjectLifecycle;
  sourceStateId: string;
  selectedTargetStateId?: string;
  parameterMapping: BsplParameterMapping;
}): void {
  for (const transition of args.lifecycle.transitions) {
    if (
      transition.source !== args.sourceStateId ||
      transition.target === args.selectedTargetStateId
    ) {
      continue;
    }

    for (const alternativeSignature of args.parameterMapping.stateSignature(
      args.lifecycle.classId,
      transition.target,
    )) {
      addDistinguishingNils(args.builder, alternativeSignature);
    }
  }
}

function addDistinguishingNils(
  builder: BsplMessageVariantBuilder,
  alternativeRepresentation: string[],
): void {
  builder.addMany(
    getDistinguishingNilParameters(
      alternativeRepresentation,
      builder.parametersWithAdornments(["in", "out"]),
    ),
    "nil",
  );
}

function getDistinguishingNilParameters(
  alternativeRepresentation: Iterable<string>,
  alreadyRequiredOrProduced: Iterable<string>,
): string[] {
  const alreadyKnown = new Set(alreadyRequiredOrProduced);

  return [...new Set(alternativeRepresentation)]
    .filter((parameter) => !alreadyKnown.has(parameter))
    .sort();
}

function directLocalPredecessorTransitions(args: {
  lifecycle: ObjectLifecycle;
  targetStateId: string;
  actor: string;
}): LifecycleTransition[] {
  return args.lifecycle.transitions
    .filter(
      (transition) =>
        transition.target === args.targetStateId &&
        transition.source !== args.lifecycle.initialStateId &&
        transition.actor === args.actor,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function computeForwardingTaskIds(
  context: ObjectAwareChoreographyContext,
): Set<string> {
  const forwardingTaskIds = new Set<string>();
  const objectReferenceCounts = new Map<string, number>();

  for (const objectReference of context.objectReferences.values()) {
    const key = objectReferenceKey(objectReference.classId, objectReference.stateId);
    objectReferenceCounts.set(key, (objectReferenceCounts.get(key) ?? 0) + 1);
  }

  for (const objectReference of context.objectReferences.values()) {
    const key = objectReferenceKey(objectReference.classId, objectReference.stateId);

    if ((objectReferenceCounts.get(key) ?? 0) > 1) {
      forwardingTaskIds.add(objectReference.taskId);
    }
  }

  for (const lifecycle of context.lifecycleModel.lifecycles.values()) {
    for (const transition of lifecycle.transitions) {
      if (!transition.triggerName) {
        continue;
      }

      const taskInfos = context.taskNameIndex.tasksByCanonicalName.get(
        transition.triggerName,
      ) ?? [];

      for (const objectReference of context.objectReferences.values()) {
        if (
          objectReference.classId !== lifecycle.classId ||
          objectReference.stateId !== transition.target
        ) {
          continue;
        }

        if (taskInfos.some((taskInfo) => taskInfo.taskId !== objectReference.taskId)) {
          forwardingTaskIds.add(objectReference.taskId);
        }
      }
    }
  }

  return forwardingTaskIds;
}

function canStartTask(choreography: Choreography, task: ChoreographyTask): boolean {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const visitedNodeIds = new Set<string>();

  return (incomingFlowsByNodeId.get(task.id) ?? []).some((flow) =>
    canReachStartWithoutTask(flow.sourceRef, visitedNodeIds),
  );
}

function canReachStartWithoutTask(
  node: FlowNode,
  visitedNodeIds: Set<string>,
): boolean {
  if (visitedNodeIds.has(node.id)) {
    return false;
  }

  if (node.$type === "bpmn:StartEvent") {
    return true;
  }

  if (node.$type === "bpmn:ChoreographyTask") {
    return false;
  }

  visitedNodeIds.add(node.id);

  return (node.incoming ?? []).some((flow) =>
    canReachStartWithoutTask(flow.sourceRef, visitedNodeIds),
  );
}

function canConcludeTask(
  choreography: Choreography,
  task: ChoreographyTask,
): boolean {
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const visitedNodeIds = new Set<string>();

  return (outgoingFlowsByNodeId.get(task.id) ?? []).some((flow) =>
    canReachEndWithoutTask(flow.targetRef, visitedNodeIds),
  );
}

function canReachEndWithoutTask(
  node: FlowNode,
  visitedNodeIds: Set<string>,
): boolean {
  if (visitedNodeIds.has(node.id)) {
    return false;
  }

  if (node.$type === "bpmn:EndEvent") {
    return true;
  }

  if (node.$type === "bpmn:ChoreographyTask") {
    return false;
  }

  visitedNodeIds.add(node.id);

  return (node.outgoing ?? []).some((flow) =>
    canReachEndWithoutTask(flow.targetRef, visitedNodeIds),
  );
}

function collectPrivateParameters(messages: BsplMessageSchema[]): string[] {
  return [
    ...new Set(
      messages.flatMap((message) =>
        message.parameters
          .map((parameter) => parameter.name)
          .filter(
            (parameter) =>
              parameter !== CASE_ID_PARAMETER && parameter !== COMPLETED_PARAMETER,
          ),
      ),
    ),
  ].sort();
}

function validateEveryTaskHasMessageSchema(
  tasks: ChoreographyTask[],
  messages: BsplMessageSchema[],
): void {
  const taskIdsWithMessages = new Set(messages.map((message) => message.taskId));
  const omittedTasks = tasks.filter((task) => !taskIdsWithMessages.has(task.id));

  if (omittedTasks.length === 0) {
    return;
  }

  throw new Error(
    `No BSPL message schema could be generated for choreography task(s): ${omittedTasks
      .map((task) => `"${task.name ?? task.id}" (${task.id})`)
      .join(", ")}`,
  );
}

function mustGetLifecycle(
  context: ObjectAwareChoreographyContext,
  classId: string,
): ObjectLifecycle {
  const lifecycle = context.lifecycleModel.lifecycles.get(classId);

  if (!lifecycle) {
    throw new Error(`Missing lifecycle for class ${classId}`);
  }

  return lifecycle;
}

function objectReferenceKey(classId: string, stateId: string): string {
  return `${classId}\u0000${stateId}`;
}

function protocolName(choreography: Choreography): string {
  return sanitizeBsplIdentifier(
    choreography.name ?? "ObjectAwareChoreographyProtocol",
  );
}

function warnSkippedVariant(args: {
  warnings: BsplWarning[];
  code: string;
  task?: ChoreographyTask;
  message: string;
  details?: Record<string, unknown>;
}): number {
  args.warnings.push({
    code: args.code,
    message: args.message,
    details: {
      ...(args.task ? { taskId: args.task.id, taskName: args.task.name } : {}),
      ...args.details,
    },
  });

  return 1;
}
