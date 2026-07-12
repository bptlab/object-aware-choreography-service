import type { Association } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type {
  IsolatedPetriNetArtifact,
  PetriNetPlaceSemantics,
  PetriNetTransitionSemantics,
} from "../objectAwareChoreographyToPetriNet/petriNetArtifact.js";
import type {
  TypedIdentifierType,
  TypedPetriNetBuilder,
  TypedPlace,
} from "../../targets/typedPetriNet/index.js";
import {
  awarenessPlaceId,
  controlFlowPlaceId,
  inclusionPlaceId,
  objectBindingPlaceId,
  participationPlaceId,
  poolPlaceId,
  relationPlaceId,
  sinkPlaceId,
  transmissionPlaceId,
  stateAwarenessPlaceId,
} from "./ids.js";
import {
  awarenessPlaceLabel,
  inclusionPlaceLabel,
  objectBindingPlaceLabel,
  participationPlaceLabel,
  poolPlaceLabel,
  realLifecycleStates,
  relationPlaceLabel,
  sinkPlaceLabel,
  stateAwarenessPlaceLabel,
} from "./labels.js";
import {
  type CrossCasePetriNetMappingContext,
  requireMapValue,
} from "./mappingContext.js";

export interface CrossCasePlaceRegistry {
  poolPlaceByRole: Map<string, TypedPlace>;
  participationPlaceByRole: Map<string, TypedPlace>;
  sinkPlace: TypedPlace;
  controlFlowPlaceBySequenceFlow: Map<string, TypedPlace>;
  awarenessPlaceByRoleAndClass: Map<string, TypedPlace>;
  statePlaceByRoleClassAndState: Map<string, TypedPlace>;
  objectBindingPlaceByClass: Map<string, TypedPlace>;
  inclusionPlaceByClass: Map<string, TypedPlace>;
  relationPlaceByAssociation: Map<string, TypedPlace>;
  transmissionPlaceByTask: Map<string, TypedPlace>;
}

export function addStructuralPlaces(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  isolatedArtifact: IsolatedPetriNetArtifact;
}): CrossCasePlaceRegistry {
  const { builder, context, identifierTypes, isolatedArtifact } = args;
  const registry: CrossCasePlaceRegistry = {
    poolPlaceByRole: new Map(),
    participationPlaceByRole: new Map(),
    sinkPlace: builder.addPlace({
      id: sinkPlaceId(),
      name: sinkPlaceLabel(),
      tupleType: [identifierTypes.caseType.id],
    }),
    controlFlowPlaceBySequenceFlow: new Map(),
    awarenessPlaceByRoleAndClass: new Map(),
    statePlaceByRoleClassAndState: new Map(),
    objectBindingPlaceByClass: new Map(),
    inclusionPlaceByClass: new Map(),
    relationPlaceByAssociation: new Map(),
    transmissionPlaceByTask: new Map(),
  };

  addParticipantPlaces(builder, context, identifierTypes, registry);
  addControlFlowPlaces(
    builder,
    isolatedArtifact,
    identifierTypes.caseType,
    registry,
  );
  addAwarenessPlaces(builder, context, identifierTypes, registry);
  addBindingAndInclusionPlaces(builder, context, identifierTypes, registry);
  addRelationPlaces(builder, context, identifierTypes, registry);
  addTransmissionPlaces(
    builder,
    isolatedArtifact,
    identifierTypes,
    registry,
  );

  return registry;
}

function addParticipantPlaces(
  builder: TypedPetriNetBuilder,
  context: CrossCasePetriNetMappingContext,
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
  },
  registry: CrossCasePlaceRegistry,
): void {
  for (const roleId of context.roleIds) {
    const roleType = requireMapValue(
      identifierTypes.roleTypeByRole,
      roleId,
      "role identifier type",
    );
    const participantIds =
      context.options.participantIdsByRole?.[roleId] ?? [`${roleId}_1`];

    registry.poolPlaceByRole.set(
      roleId,
      builder.addPlace({
        id: poolPlaceId(roleId),
        name: poolPlaceLabel(roleId),
        tupleType: [roleType.id],
        initialTokens: participantIds.map((participantId) => [
          { typeId: roleType.id, value: participantId },
        ]),
      }),
    );
    registry.participationPlaceByRole.set(
      roleId,
      builder.addPlace({
        id: participationPlaceId(roleId),
        name: participationPlaceLabel(roleId),
        tupleType: [identifierTypes.caseType.id, roleType.id],
      }),
    );
  }
}

function addControlFlowPlaces(
  builder: TypedPetriNetBuilder,
  isolatedArtifact: IsolatedPetriNetArtifact,
  caseType: TypedIdentifierType,
  registry: CrossCasePlaceRegistry,
): void {
  for (const descriptor of semanticPlaces(
    isolatedArtifact,
    "controlFlowPlace",
  )) {
    registry.controlFlowPlaceBySequenceFlow.set(
      descriptor.sequenceFlowId,
      builder.addPlace({
        id: controlFlowPlaceId(descriptor.sequenceFlowId),
        name: descriptor.label || `Control Flow ${descriptor.sequenceFlowId}`,
        tupleType: [caseType.id],
      }),
    );
  }
}

function addAwarenessPlaces(
  builder: TypedPetriNetBuilder,
  context: CrossCasePetriNetMappingContext,
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  },
  registry: CrossCasePlaceRegistry,
): void {
  for (const roleId of context.roleIds) {
    const roleType = requireMapValue(
      identifierTypes.roleTypeByRole,
      roleId,
      "role identifier type",
    );

    for (const dataClass of context.classes) {
      const objectType = requireMapValue(
        identifierTypes.objectTypeByClass,
        dataClass.id,
        "object identifier type",
      );
      registry.awarenessPlaceByRoleAndClass.set(
        roleClassKey(roleId, dataClass.id),
        builder.addPlace({
          id: awarenessPlaceId(roleId, dataClass.id),
          name: awarenessPlaceLabel(roleId, dataClass.name),
          tupleType: [roleType.id, objectType.id],
        }),
      );

      const lifecycle = context.source.lifecycleModel.lifecycles.get(dataClass.id);
      for (const state of realLifecycleStates(lifecycle?.states ?? [])) {
        registry.statePlaceByRoleClassAndState.set(
          roleClassStateKey(roleId, dataClass.id, state.id),
          builder.addPlace({
            id: stateAwarenessPlaceId(roleId, dataClass.id, state.id),
            name: stateAwarenessPlaceLabel(roleId, dataClass.name, state.name),
            tupleType: [roleType.id, objectType.id],
          }),
        );
      }
    }
  }
}

function addBindingAndInclusionPlaces(
  builder: TypedPetriNetBuilder,
  context: CrossCasePetriNetMappingContext,
  identifierTypes: {
    caseType: TypedIdentifierType;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  },
  registry: CrossCasePlaceRegistry,
): void {
  for (const dataClass of context.classes) {
    const objectType = requireMapValue(
      identifierTypes.objectTypeByClass,
      dataClass.id,
      "object identifier type",
    );

    registry.objectBindingPlaceByClass.set(
      dataClass.id,
      builder.addPlace({
        id: objectBindingPlaceId(dataClass.id),
        name: objectBindingPlaceLabel(dataClass.name),
        tupleType: [identifierTypes.caseType.id, objectType.id],
      }),
    );
    registry.inclusionPlaceByClass.set(
      dataClass.id,
      builder.addPlace({
        id: inclusionPlaceId(dataClass.id),
        name: inclusionPlaceLabel(dataClass.name),
        tupleType: [identifierTypes.caseType.id],
      }),
    );
  }
}

function addRelationPlaces(
  builder: TypedPetriNetBuilder,
  context: CrossCasePetriNetMappingContext,
  identifierTypes: {
    objectTypeByClass: Map<string, TypedIdentifierType>;
  },
  registry: CrossCasePlaceRegistry,
): void {
  for (const association of context.source.dataModel.associations.filter(
    (candidate) => shouldCreateRelationPlace(candidate, context),
  )) {
    const [left, right] = association.ends;
    const leftType = requireMapValue(
      identifierTypes.objectTypeByClass,
      left.classId,
      "object identifier type",
    );
    const rightType = requireMapValue(
      identifierTypes.objectTypeByClass,
      right.classId,
      "object identifier type",
    );

    registry.relationPlaceByAssociation.set(
      association.id,
      builder.addPlace({
        id: relationPlaceId(association.id),
        name: relationPlaceLabel(association, context),
        tupleType: [leftType.id, rightType.id],
      }),
    );
  }
}

function addTransmissionPlaces(
  builder: TypedPetriNetBuilder,
  isolatedArtifact: IsolatedPetriNetArtifact,
  identifierTypes: {
    caseType: TypedIdentifierType;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  },
  registry: CrossCasePlaceRegistry,
): void {
  for (const descriptor of semanticPlaces(
    isolatedArtifact,
    "transmissionPlace",
  )) {
    if (!descriptor.objectRef && isNoObjectTransmission(isolatedArtifact, descriptor.taskId)) {
      continue;
    }

    const tupleType = descriptor.objectRef
      ? [
          identifierTypes.caseType.id,
          requireMapValue(
            identifierTypes.objectTypeByClass,
            descriptor.objectRef.classId,
            "object identifier type",
          ).id,
        ]
      : [identifierTypes.caseType.id];

    registry.transmissionPlaceByTask.set(
      descriptor.taskId,
      builder.addPlace({
        id: transmissionPlaceId(descriptor.taskId),
        name: `${descriptor.taskName} Transmission`,
        tupleType,
      }),
    );
  }
}

function isNoObjectTransmission(
  isolatedArtifact: IsolatedPetriNetArtifact,
  taskId: string,
): boolean {
  const taskTransitions = Object.values(isolatedArtifact.semantics.transitions).filter(
    (
      transition,
    ): transition is Extract<
      PetriNetTransitionSemantics,
      { kind: "taskSendTransition" | "taskReceiveTransition" }
    > =>
      (transition.kind === "taskSendTransition" ||
        transition.kind === "taskReceiveTransition") &&
      transition.taskId === taskId,
  );

  return taskTransitions.every((transition) => {
    if (transition.objectRef) {
      return false;
    }

    if (transition.stateReads.length > 0 || transition.stateWrites.length > 0) {
      return false;
    }

    return (
      transition.kind !== "taskReceiveTransition" ||
      transition.existenceWrites.length === 0
    );
  });
}

function semanticPlaces<K extends PetriNetPlaceSemantics["kind"]>(
  artifact: IsolatedPetriNetArtifact,
  kind: K,
): Array<Extract<PetriNetPlaceSemantics, { kind: K }>> {
  return Object.values(artifact.semantics.places).filter(
    (place): place is Extract<PetriNetPlaceSemantics, { kind: K }> =>
      place.kind === kind,
  );
}

function shouldCreateRelationPlace(
  association: Association,
  context: CrossCasePetriNetMappingContext,
): boolean {
  const [left, right] = association.ends;

  if (
    !context.crossCaseClassIds.has(left.classId) ||
    !context.crossCaseClassIds.has(right.classId)
  ) {
    return false;
  }

  return (
    left.lower >= 1 ||
    right.lower >= 1 ||
    left.upper === 1 ||
    right.upper === 1
  );
}

function roleClassKey(roleId: string, classId: string): string {
  return `${roleId}::${classId}`;
}

function roleClassStateKey(
  roleId: string,
  classId: string,
  stateId: string,
): string {
  return `${roleId}::${classId}::${stateId}`;
}
