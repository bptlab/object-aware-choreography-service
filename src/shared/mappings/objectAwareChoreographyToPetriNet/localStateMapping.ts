import type { Choreography } from "bpmn-moddle";
import {
  registerLocalTransition,
  type ObjectAwareRealizabilityMetadata,
} from "../../analysis/objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";
import {
  getChoreographyTasks,
  getParticipantNames,
  getTaskReceiver,
  getTaskSender,
  type RoleId,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import type { CreationDependencies } from "../../source/objectAwareChoreography/dataModel/dependencies.js";
import { computeCreationDependencies } from "../../source/objectAwareChoreography/dataModel/dependencies.js";
import type { DataModel } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type {
  LifecycleModel,
  LifecycleTransition,
  ObjectLifecycle,
} from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import {
  compositeOneToOneCreationTransitionId,
  existencePlaceId,
  localLifecycleTransitionId,
  statePlaceId,
} from "../../targets/petriNet/ids.js";
import type { LocalStateLayout } from "./mappingContext.js";
import { PetriNetBuilder } from "../../targets/petriNet/petriNetBuilder.js";

type LocalTransition = LifecycleTransition & { actor: RoleId };

export type LocalStateDiagnostics = {
  independentCreationTransitions: number;
  independentCreationDependencyReadArcs: number;
  oneToOneGroups: number;
  compositeOneToOneCreationTransitions: number;
  compositeCreationDependencyReadArcs: number;
  ordinaryStateTransitions: number;
};

export function validateLocalStateInputs(
  choreography: Choreography,
  dataModel: DataModel,
  lifecycleModel: LifecycleModel,
): void {
  const dataClassIds = new Set(
    dataModel.classes.map((dataClass) => dataClass.id),
  );
  const lifecycleClassIds = new Set(lifecycleModel.lifecycles.keys());
  const dependencies = computeCreationDependencies(dataModel);

  for (const lifecycle of lifecycleModel.lifecycles.values()) {
    if (!dataClassIds.has(lifecycle.classId)) {
      throw new Error(
        `Lifecycle class ${lifecycle.className} does not exist in the data model`,
      );
    }
  }

  for (const dataClass of dataModel.classes) {
    if (!lifecycleClassIds.has(dataClass.id)) {
      throw new Error(
        `Data model class ${dataClass.name} does not have an object lifecycle`,
      );
    }
  }

  for (const [
    classId,
    requirements,
  ] of dependencies.existentialRequirementsByClass) {
    if (!dataClassIds.has(classId)) {
      throw new Error(`Creation dependency class ${classId} is unknown`);
    }

    if (!lifecycleClassIds.has(classId)) {
      throw new Error(
        `Creation dependency class ${classId} does not have an object lifecycle`,
      );
    }

    for (const requiredClassId of requirements) {
      if (!dataClassIds.has(requiredClassId)) {
        throw new Error(
          `Creation dependency for ${classId} references unknown class ${requiredClassId}`,
        );
      }

      if (!lifecycleClassIds.has(requiredClassId)) {
        throw new Error(
          `Creation dependency for ${classId} references class ${requiredClassId}, which does not have an object lifecycle`,
        );
      }
    }
  }
}

export function addLocalStateLayer(
  choreography: Choreography,
  dataModel: DataModel,
  lifecycleModel: LifecycleModel,
  builder: PetriNetBuilder,
  layout: LocalStateLayout,
  objectAwareRealizabilityMetadata?: ObjectAwareRealizabilityMetadata,
): LocalStateDiagnostics {
  const participantNames = getActiveParticipantNames(choreography);
  const dependencies = computeCreationDependencies(dataModel);
  const diagnostics: LocalStateDiagnostics = {
    independentCreationTransitions: 0,
    independentCreationDependencyReadArcs: 0,
    oneToOneGroups: dependencies.oneToOneGroups.filter(
      (group) => group.length > 1,
    ).length,
    compositeOneToOneCreationTransitions: 0,
    compositeCreationDependencyReadArcs: 0,
    ordinaryStateTransitions: 0,
  };
  const generatedTransitionIds = new Set<string>();

  addLocalStatePlaces(
    participantNames,
    dataModel,
    lifecycleModel,
    builder,
    layout,
  );
  addIndependentCreationTransitions({
    participantNames,
    dataModel,
    lifecycleModel,
    builder,
    layout,
    dependencies,
    diagnostics,
    generatedTransitionIds,
    objectAwareRealizabilityMetadata,
  });
  addCompositeOneToOneCreationTransitions({
    participantNames,
    dependencies,
    lifecycleModel,
    builder,
    layout,
    diagnostics,
    generatedTransitionIds,
    objectAwareRealizabilityMetadata,
  });
  addOrdinaryStateTransitions({
    participantNames,
    dataModel,
    lifecycleModel,
    builder,
    layout,
    diagnostics,
    generatedTransitionIds,
    objectAwareRealizabilityMetadata,
  });

  return diagnostics;
}

function addLocalStatePlaces(
  participantNames: RoleId[],
  dataModel: DataModel,
  lifecycleModel: LifecycleModel,
  builder: PetriNetBuilder,
  layout: LocalStateLayout,
): void {
  for (const role of participantNames) {
    for (const dataClass of dataModel.classes) {
      const lifecycle = mustGetLifecycle(lifecycleModel, dataClass.id);

      builder.addPlace(
        existencePlaceId(role, dataClass.id),
        `${role}.${dataClass.name}+`,
        0,
        layout.boundsForExistencePlace(role, dataClass.id),
      );

      for (const state of lifecycle.states) {
        builder.addPlace(
          statePlaceId(role, dataClass.id, state.id),
          `${role}.${dataClass.name} [${state.name}]`,
          state.isInitial ? 1 : 0,
          layout.boundsForStatePlace(role, dataClass.id, state.id),
        );
      }
    }
  }
}

function addIndependentCreationTransitions(args: {
  participantNames: RoleId[];
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  builder: PetriNetBuilder;
  layout: LocalStateLayout;
  dependencies: CreationDependencies;
  diagnostics: LocalStateDiagnostics;
  generatedTransitionIds: Set<string>;
  objectAwareRealizabilityMetadata?: ObjectAwareRealizabilityMetadata;
}): void {
  const {
    participantNames,
    dataModel,
    lifecycleModel,
    builder,
    layout,
    dependencies,
    diagnostics,
    generatedTransitionIds,
    objectAwareRealizabilityMetadata,
  } = args;

  for (const dataClass of dataModel.classes) {
    const group = dependencies.oneToOneGroupByClass.get(dataClass.id) ?? [
      dataClass.id,
    ];

    if (group.length > 1) {
      continue;
    }

    const lifecycle = mustGetLifecycle(lifecycleModel, dataClass.id);

    for (const transition of getCreationTransitions(
      lifecycle,
      participantNames,
    )) {
      const transitionId = localLifecycleTransitionId(
        transition.actor,
        lifecycle.classId,
        transition.source,
        transition.target,
      );

      assertUniqueTransitionId(transitionId, generatedTransitionIds);
      addCreationTransition({
        builder,
        layout,
        transition,
        transitionId,
        classId: lifecycle.classId,
      });
      if (objectAwareRealizabilityMetadata) {
        registerLocalTransition(
          objectAwareRealizabilityMetadata,
          transition.actor,
          transitionId,
        );
      }
      diagnostics.independentCreationTransitions += 1;
      diagnostics.independentCreationDependencyReadArcs +=
        addDependencyReadArcs(
          builder,
          transitionId,
          transition.actor,
          dependencies.existentialRequirementsByClass.get(lifecycle.classId) ??
            [],
        );
    }
  }
}

function addCompositeOneToOneCreationTransitions(args: {
  participantNames: RoleId[];
  dependencies: CreationDependencies;
  lifecycleModel: LifecycleModel;
  builder: PetriNetBuilder;
  layout: LocalStateLayout;
  diagnostics: LocalStateDiagnostics;
  generatedTransitionIds: Set<string>;
  objectAwareRealizabilityMetadata?: ObjectAwareRealizabilityMetadata;
}): void {
  const {
    participantNames,
    dependencies,
    lifecycleModel,
    builder,
    layout,
    diagnostics,
    generatedTransitionIds,
    objectAwareRealizabilityMetadata,
  } = args;

  for (const group of dependencies.oneToOneGroups.filter(
    (candidate) => candidate.length > 1,
  )) {
    const creationTransitionsByClass = new Map(
      group.map((classId) => [
        classId,
        getCreationTransitions(
          mustGetLifecycle(lifecycleModel, classId),
          participantNames,
        ),
      ]),
    );
    const hasAnyCreationTransition = [
      ...creationTransitionsByClass.values(),
    ].some((transitions) => transitions.length > 0);

    if (!hasAnyCreationTransition) {
      continue;
    }

    const validRoles = participantNames.filter((role) =>
      group.every((classId) =>
        (creationTransitionsByClass.get(classId) ?? []).some(
          (transition) => transition.actor === role,
        ),
      ),
    );

    if (validRoles.length === 0) {
      throw new Error(
        `One-to-one creation group [${group.join(
          ", ",
        )}] cannot be created because not all classes have creation transitions executable by the same role.`,
      );
    }

    for (const role of validRoles) {
      const transitionCombinations = cartesianProduct(
        group.map((classId) =>
          (creationTransitionsByClass.get(classId) ?? [])
            .filter((transition) => transition.actor === role)
            .map((transition) => ({ classId, transition })),
        ),
      );

      for (const entries of transitionCombinations) {
        const idEntries = entries.map((entry) => ({
          classId: entry.classId,
          targetStateId: entry.transition.target,
        }));
        const transitionId = compositeOneToOneCreationTransitionId(
          role,
          idEntries,
        );

        assertUniqueTransitionId(transitionId, generatedTransitionIds);
        builder.addTransition(
          transitionId,
          idEntries
            .map((entry) => `${entry.classId}.${entry.targetStateId}`)
            .join(" + "),
          true,
          layout.boundsForLocalTransition(
            role,
            entries[0].classId,
            entries[0].transition,
          ),
        );
        if (objectAwareRealizabilityMetadata) {
          registerLocalTransition(objectAwareRealizabilityMetadata, role, transitionId);
        }

        for (const entry of entries) {
          builder.addArc(
            statePlaceId(role, entry.classId, entry.transition.source),
            transitionId,
          );
          builder.addArc(
            transitionId,
            statePlaceId(role, entry.classId, entry.transition.target),
          );
          builder.addArc(transitionId, existencePlaceId(role, entry.classId));
        }

        const requirements = [
          ...new Set(
            entries.flatMap(
              (entry) =>
                dependencies.existentialRequirementsByClass.get(
                  entry.classId,
                ) ?? [],
            ),
          ),
        ]
          .filter((requiredClassId) => !group.includes(requiredClassId))
          .sort();

        diagnostics.compositeOneToOneCreationTransitions += 1;
        diagnostics.compositeCreationDependencyReadArcs +=
          addDependencyReadArcs(builder, transitionId, role, requirements);
      }
    }
  }
}

function addOrdinaryStateTransitions(args: {
  participantNames: RoleId[];
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  builder: PetriNetBuilder;
  layout: LocalStateLayout;
  diagnostics: LocalStateDiagnostics;
  generatedTransitionIds: Set<string>;
  objectAwareRealizabilityMetadata?: ObjectAwareRealizabilityMetadata;
}): void {
  const {
    participantNames,
    dataModel,
    lifecycleModel,
    builder,
    layout,
    diagnostics,
    generatedTransitionIds,
    objectAwareRealizabilityMetadata,
  } = args;

  for (const dataClass of dataModel.classes) {
    const lifecycle = mustGetLifecycle(lifecycleModel, dataClass.id);

    for (const transition of getStateTransitions(lifecycle, participantNames)) {
      const transitionId = localLifecycleTransitionId(
        transition.actor,
        lifecycle.classId,
        transition.source,
        transition.target,
      );

      assertUniqueTransitionId(transitionId, generatedTransitionIds);
      builder.addTransition(
        transitionId,
        transition.rawName ?? transition.id,
        true,
        layout.boundsForLocalTransition(
          transition.actor,
          lifecycle.classId,
          transition,
        ),
      );
      builder.addArc(
        statePlaceId(transition.actor, lifecycle.classId, transition.source),
        transitionId,
      );
      builder.addArc(
        transitionId,
        statePlaceId(transition.actor, lifecycle.classId, transition.target),
      );
      if (objectAwareRealizabilityMetadata) {
        registerLocalTransition(
          objectAwareRealizabilityMetadata,
          transition.actor,
          transitionId,
        );
      }
      diagnostics.ordinaryStateTransitions += 1;
    }
  }
}

function addCreationTransition(args: {
  builder: PetriNetBuilder;
  layout: LocalStateLayout;
  transition: LocalTransition;
  transitionId: string;
  classId: string;
}): void {
  const { builder, layout, transition, transitionId, classId } = args;

  builder.addTransition(
    transitionId,
    transition.rawName ?? transition.id,
    true,
    layout.boundsForLocalTransition(transition.actor, classId, transition),
  );
  builder.addArc(
    statePlaceId(transition.actor, classId, "initial"),
    transitionId,
  );
  builder.addArc(
    transitionId,
    statePlaceId(transition.actor, classId, transition.target),
  );
  builder.addArc(transitionId, existencePlaceId(transition.actor, classId));
}

function addDependencyReadArcs(
  builder: PetriNetBuilder,
  transitionId: string,
  role: RoleId,
  requiredClassIds: string[],
): number {
  let readArcCount = 0;

  for (const requiredClassId of requiredClassIds) {
    const requiredPlaceId = existencePlaceId(role, requiredClassId);

    if (!builder.hasPlace(requiredPlaceId)) {
      throw new Error(
        `Creation dependency read place ${requiredPlaceId} does not exist before adding arcs`,
      );
    }

    builder.addArc(requiredPlaceId, transitionId);
    builder.addArc(transitionId, requiredPlaceId);
    readArcCount += 2;
  }

  return readArcCount;
}

function getCreationTransitions(
  lifecycle: ObjectLifecycle,
  participantNames: RoleId[],
): LocalTransition[] {
  return getLocalLifecycleTransitions(lifecycle).filter(
    (transition) =>
      transition.source === lifecycle.initialStateId &&
      participantNames.includes(transition.actor),
  );
}

function getStateTransitions(
  lifecycle: ObjectLifecycle,
  participantNames: RoleId[],
): LocalTransition[] {
  return getLocalLifecycleTransitions(lifecycle).filter(
    (transition) =>
      transition.source !== lifecycle.initialStateId &&
      participantNames.includes(transition.actor),
  );
}

function getLocalLifecycleTransitions(
  lifecycle: ObjectLifecycle,
): LocalTransition[] {
  return lifecycle.transitions.filter(
    (transition): transition is LocalTransition =>
      transition.actor !== undefined,
  );
}

function getActiveParticipantNames(choreography: Choreography): RoleId[] {
  const activeParticipantNames = new Set<RoleId>();

  for (const task of getChoreographyTasks(choreography)) {
    activeParticipantNames.add(getTaskSender(task));
    activeParticipantNames.add(getTaskReceiver(task));
  }

  return getParticipantNames(choreography).filter((participantName) =>
    activeParticipantNames.has(participantName),
  );
}

function mustGetLifecycle(
  lifecycleModel: LifecycleModel,
  classId: string,
): ObjectLifecycle {
  const lifecycle = lifecycleModel.lifecycles.get(classId);

  if (!lifecycle) {
    throw new Error(
      `Data model class ${classId} does not have an object lifecycle`,
    );
  }

  return lifecycle;
}

function assertUniqueTransitionId(
  transitionId: string,
  generatedTransitionIds: Set<string>,
): void {
  if (generatedTransitionIds.has(transitionId)) {
    throw new Error(
      `Duplicate local-state transition id generated: ${transitionId}`,
    );
  }

  generatedTransitionIds.add(transitionId);
}

function cartesianProduct<T>(sets: T[][]): T[][] {
  return sets.reduce<T[][]>(
    (products, set) =>
      products.flatMap((product) => set.map((value) => [...product, value])),
    [[]],
  );
}
