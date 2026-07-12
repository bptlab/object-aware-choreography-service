import type { CreationDependencies } from "../../source/objectAwareChoreography/dataModel/dependencies.js";
import { computeCreationDependencies } from "../../source/objectAwareChoreography/dataModel/dependencies.js";
import type { Association } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type { PetriNetTransitionSemantics } from "../objectAwareChoreographyToPetriNet/petriNetArtifact.js";
import type {
  TypedIdentifierType,
  TypedPetriNetBuilder,
  TypedPlace,
  TypedTransition,
  TypedTupleElement,
  TypedVariable,
} from "../../targets/typedPetriNet/index.js";
import {
  arcId,
  creationTransitionId,
} from "./ids.js";
import { creationTransitionLabel } from "./labels.js";
import {
  type CrossCasePetriNetMappingContext,
  requireMapValue,
} from "./mappingContext.js";
import type { CrossCasePlaceRegistry } from "./placeMapping.js";

type ObjectCreationTransition = Extract<
  PetriNetTransitionSemantics,
  { kind: "objectCreationTransition" }
>;

type OneToOneObjectCreationTransition = Extract<
  PetriNetTransitionSemantics,
  { kind: "oneToOneObjectCreationTransition" }
>;

export function addObjectCreationTransitions(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  creationTransitions: PetriNetTransitionSemantics[];
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
    dependencyObjectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
}): void {
  const { context } = args;
  const dependencies = computeCreationDependencies(context.source.dataModel);

  rejectUnsupportedMixedOneToOneGroups(context, dependencies);

  for (const creationTransition of args.creationTransitions.filter(
    (transition) => transition.kind === "objectCreationTransition",
  )) {
    if (context.crossCaseClassIds.has(creationTransition.classId)) {
      addCrossCaseCreationTransition({
        ...args,
        dependencies,
        creationTransition,
      });
    } else {
      addCaseSpecificCreationTransition({
        ...args,
        dependencies,
        creationTransition,
      });
    }
  }

  for (const creationTransition of args.creationTransitions.filter(
    (transition) => transition.kind === "oneToOneObjectCreationTransition",
  )) {
    if (creationTransition.entries.every((entry) =>
      context.crossCaseClassIds.has(entry.classId),
    )) {
      addCrossCaseOneToOneCreationTransition({
        ...args,
        dependencies,
        creationTransition,
      });
      continue;
    }

    addCaseSpecificOneToOneCreationTransition({
      ...args,
      dependencies,
      creationTransition,
    });
  }
}

function addCrossCaseOneToOneCreationTransition(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  dependencies: CreationDependencies;
  creationTransition: OneToOneObjectCreationTransition;
}): void {
  const {
    builder,
    context,
    identifierTypes,
    variables,
    places,
    creationTransition,
  } = args;
  const roleId = creationTransition.roleId;
  const roleType = requireMapValue(
    identifierTypes.roleTypeByRole,
    roleId,
    "role identifier type",
  );
  const roleVariable = requireMapValue(
    variables.roleVariableByRole,
    roleId,
    "role variable",
  );
  const transition = builder.addTransition({
    id: creationTransition.isolatedTransitionId,
    name: creationTransition.entries
      .map((entry) => `${entry.className}.${entry.targetStateId}`)
      .join(" + "),
    freshVariables: creationTransition.entries.map((entry) => ({
      variableId: requireMapValue(
        variables.objectVariableByClass,
        entry.classId,
        "created object variable",
      ).id,
      typeId: requireMapValue(
        identifierTypes.objectTypeByClass,
        entry.classId,
        "created object identifier type",
      ).id,
    })),
  });

  addReadArc({
    builder,
    source: requireMapValue(places.poolPlaceByRole, roleId, "pool place"),
    transition,
    inscription: [tupleElement(roleType, roleVariable)],
  });

  addOneToOneCreationStateAndAwarenessOutputs({
    builder,
    identifierTypes,
    variables,
    places,
    transition,
    creationTransition,
    roleId,
    roleType,
    roleVariable,
  });
  addCrossCaseOneToOneRelationOutputs({
    builder,
    context,
    identifierTypes,
    variables,
    places,
    transition,
    creationTransition,
  });
}

function addCaseSpecificOneToOneCreationTransition(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
    dependencyObjectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  dependencies: CreationDependencies;
  creationTransition: OneToOneObjectCreationTransition;
}): void {
  const {
    builder,
    identifierTypes,
    variables,
    places,
    dependencies,
    creationTransition,
  } = args;
  const roleId = creationTransition.roleId;
  const roleType = requireMapValue(
    identifierTypes.roleTypeByRole,
    roleId,
    "role identifier type",
  );
  const roleVariable = requireMapValue(
    variables.roleVariableByRole,
    roleId,
    "role variable",
  );
  const transition = builder.addTransition({
    id: creationTransition.isolatedTransitionId,
    name: creationTransition.entries
      .map((entry) => `${entry.className}.${entry.targetStateId}`)
      .join(" + "),
    freshVariables: creationTransition.entries.map((entry) => ({
      variableId: requireMapValue(
        variables.objectVariableByClass,
        entry.classId,
        "created object variable",
      ).id,
      typeId: requireMapValue(
        identifierTypes.objectTypeByClass,
        entry.classId,
        "created object identifier type",
      ).id,
    })),
  });

  addReadArc({
    builder,
    source: requireMapValue(
      places.participationPlaceByRole,
      roleId,
      "participation place",
    ),
    transition,
    inscription: [
      tupleElement(identifierTypes.caseType, variables.caseVariable),
      tupleElement(roleType, roleVariable),
    ],
  });

  for (const entry of creationTransition.entries) {
    const objectType = requireMapValue(
      identifierTypes.objectTypeByClass,
      entry.classId,
      "created object identifier type",
    );
    const objectVariable = requireMapValue(
      variables.objectVariableByClass,
      entry.classId,
      "created object variable",
    );

    addOrdinaryArc({
      builder,
      source: transition,
      target: requireMapValue(
        places.objectBindingPlaceByClass,
        entry.classId,
        "object binding place",
      ),
      inscription: [
        tupleElement(identifierTypes.caseType, variables.caseVariable),
        tupleElement(objectType, objectVariable, true),
      ],
    });
    addOrdinaryArc({
      builder,
      source: transition,
      target: requireMapValue(
        places.inclusionPlaceByClass,
        entry.classId,
        "inclusion place",
      ),
      inscription: [tupleElement(identifierTypes.caseType, variables.caseVariable)],
    });
    builder.addInhibitorArc({
      id: arcId(
        requireMapValue(
          places.inclusionPlaceByClass,
          entry.classId,
          "inclusion place",
        ).id,
        "inhibits",
        transition.id,
      ),
      sourceId: requireMapValue(
        places.inclusionPlaceByClass,
        entry.classId,
        "inclusion place",
      ).id,
      targetId: transition.id,
      inscription: [tupleElement(identifierTypes.caseType, variables.caseVariable)],
    });
  }

  addOneToOneCreationStateAndAwarenessOutputs({
    builder,
    identifierTypes,
    variables,
    places,
    transition,
    creationTransition,
    roleId,
    roleType,
    roleVariable,
  });

  const groupClassIds = creationTransition.entries.map((entry) => entry.classId);

  const requiredClassIds = [
    ...new Set(
      groupClassIds.flatMap(
        (classId) =>
          dependencies.existentialRequirementsByClass.get(classId) ?? [],
      ),
    ),
  ]
    .filter((requiredClassId) => !groupClassIds.includes(requiredClassId))
    .sort();

  for (const requiredClassId of requiredClassIds) {
    addCaseBindingReadArc({ ...args, transition, requiredClassId });
    addCreatorAwarenessReadArc({
      ...args,
      transition,
      roleId,
      requiredClassId,
    });
  }
}

function addOneToOneCreationStateAndAwarenessOutputs(args: {
  builder: TypedPetriNetBuilder;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
  creationTransition: OneToOneObjectCreationTransition;
  roleId: string;
  roleType: TypedIdentifierType;
  roleVariable: TypedVariable;
}): void {
  const {
    builder,
    identifierTypes,
    variables,
    places,
    transition,
    creationTransition,
    roleId,
    roleType,
    roleVariable,
  } = args;

  for (const stateWrite of creationTransition.stateWrites) {
    if (stateWrite.roleId !== roleId || stateWrite.isVirtualInitial) {
      continue;
    }

    addOrdinaryArc({
      builder,
      source: transition,
      target: requireMapValue(
        places.statePlaceByRoleClassAndState,
        roleClassStateKey(
          stateWrite.roleId,
          stateWrite.classId,
          stateWrite.stateId,
        ),
        "state-awareness place",
      ),
      inscription: [
        tupleElement(roleType, roleVariable),
        tupleElement(
          requireMapValue(
            identifierTypes.objectTypeByClass,
            stateWrite.classId,
            "created object identifier type",
          ),
          requireMapValue(
            variables.objectVariableByClass,
            stateWrite.classId,
            "created object variable",
          ),
          true,
        ),
      ],
    });
  }

  const groupClassIds = creationTransition.entries.map((entry) => entry.classId);

  for (const existenceWrite of creationTransition.existenceWrites) {
    if (
      existenceWrite.roleId !== roleId ||
      !groupClassIds.includes(existenceWrite.classId)
    ) {
      continue;
    }

    addOrdinaryArc({
      builder,
      source: transition,
      target: requireMapValue(
        places.awarenessPlaceByRoleAndClass,
        roleClassKey(existenceWrite.roleId, existenceWrite.classId),
        "awareness place",
      ),
      inscription: [
        tupleElement(roleType, roleVariable),
        tupleElement(
          requireMapValue(
            identifierTypes.objectTypeByClass,
            existenceWrite.classId,
            "created object identifier type",
          ),
          requireMapValue(
            variables.objectVariableByClass,
            existenceWrite.classId,
            "created object variable",
          ),
          true,
        ),
      ],
    });
  }
}

function addCrossCaseOneToOneRelationOutputs(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
  creationTransition: OneToOneObjectCreationTransition;
}): void {
  const groupClassIds = new Set(
    args.creationTransition.entries.map((entry) => entry.classId),
  );

  for (const association of args.context.source.dataModel.associations) {
    if (!association.ends.every((end) => groupClassIds.has(end.classId))) {
      continue;
    }

    const relationPlace = args.places.relationPlaceByAssociation.get(
      association.id,
    );

    if (!relationPlace) {
      continue;
    }

    addOrdinaryArc({
      builder: args.builder,
      source: args.transition,
      target: relationPlace,
      inscription: association.ends.map((end) =>
        tupleElement(
          requireMapValue(
            args.identifierTypes.objectTypeByClass,
            end.classId,
            "created object identifier type",
          ),
          requireMapValue(
            args.variables.objectVariableByClass,
            end.classId,
            "created object variable",
          ),
          true,
        ),
      ),
    });
  }
}

function addCaseSpecificCreationTransition(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
    dependencyObjectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  dependencies: CreationDependencies;
  creationTransition: ObjectCreationTransition;
}): void {
  const {
    builder,
    context,
    identifierTypes,
    variables,
    places,
    dependencies,
    creationTransition,
  } = args;
  const roleId = creationTransition.roleId;
  const objectType = requireMapValue(
    identifierTypes.objectTypeByClass,
    creationTransition.classId,
    "object identifier type",
  );
  const roleType = requireMapValue(
    identifierTypes.roleTypeByRole,
    roleId,
    "role identifier type",
  );
  const roleVariable = requireMapValue(
    variables.roleVariableByRole,
    roleId,
    "role variable",
  );
  const objectVariable = requireMapValue(
    variables.objectVariableByClass,
    creationTransition.classId,
    "object variable",
  );
  const transition = builder.addTransition({
    id: creationTransitionId(
      roleId,
      creationTransition.classId,
      creationTransition.targetStateId,
    ),
    name: creationTransitionLabel(creationTransition.className),
    freshVariables: [
      {
        variableId: objectVariable.id,
        typeId: objectType.id,
      },
    ],
  });

  addReadArc({
    builder,
    source: requireMapValue(
      places.participationPlaceByRole,
      roleId,
      "participation place",
    ),
    transition,
    inscription: [
      tupleElement(identifierTypes.caseType, variables.caseVariable),
      tupleElement(roleType, roleVariable),
    ],
  });

  addCreatedObjectOutputs({
    builder,
    context,
    identifierTypes,
    variables,
    places,
    transition,
    creationTransition,
  });

  addOrdinaryArc({
    builder,
    source: transition,
    target: requireMapValue(
      places.objectBindingPlaceByClass,
      creationTransition.classId,
      "object binding place",
    ),
    inscription: [
      tupleElement(identifierTypes.caseType, variables.caseVariable),
      tupleElement(objectType, objectVariable, true),
    ],
  });
  addOrdinaryArc({
    builder,
    source: transition,
    target: requireMapValue(
      places.inclusionPlaceByClass,
      creationTransition.classId,
      "inclusion place",
    ),
    inscription: [tupleElement(identifierTypes.caseType, variables.caseVariable)],
  });
  builder.addInhibitorArc({
    id: arcId(
      requireMapValue(
        places.inclusionPlaceByClass,
        creationTransition.classId,
        "inclusion place",
      ).id,
      "inhibits",
      transition.id,
    ),
    sourceId: requireMapValue(
      places.inclusionPlaceByClass,
      creationTransition.classId,
      "inclusion place",
    ).id,
    targetId: transition.id,
    inscription: [tupleElement(identifierTypes.caseType, variables.caseVariable)],
  });

  addCaseSpecificDependencyReadArcs({
    builder,
    context,
    identifierTypes,
    variables,
    places,
    dependencies,
    transition,
    roleId,
    classId: creationTransition.classId,
  });
}

function addCrossCaseCreationTransition(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
    dependencyObjectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  dependencies: CreationDependencies;
  creationTransition: ObjectCreationTransition;
}): void {
  const {
    builder,
    context,
    identifierTypes,
    variables,
    places,
    dependencies,
    creationTransition,
  } = args;
  const roleId = creationTransition.roleId;
  const objectType = requireMapValue(
    identifierTypes.objectTypeByClass,
    creationTransition.classId,
    "object identifier type",
  );
  const roleType = requireMapValue(
    identifierTypes.roleTypeByRole,
    roleId,
    "role identifier type",
  );
  const roleVariable = requireMapValue(
    variables.roleVariableByRole,
    roleId,
    "role variable",
  );
  const objectVariable = requireMapValue(
    variables.objectVariableByClass,
    creationTransition.classId,
    "object variable",
  );
  const transition = builder.addTransition({
    id: creationTransitionId(
      roleId,
      creationTransition.classId,
      creationTransition.targetStateId,
    ),
    name: creationTransitionLabel(creationTransition.className),
    freshVariables: [
      {
        variableId: objectVariable.id,
        typeId: objectType.id,
      },
    ],
  });

  addReadArc({
    builder,
    source: requireMapValue(places.poolPlaceByRole, roleId, "pool place"),
    transition,
    inscription: [tupleElement(roleType, roleVariable)],
  });
  addCreatedObjectOutputs({
    builder,
    context,
    identifierTypes,
    variables,
    places,
    transition,
    creationTransition,
  });
  addCrossCaseDependencyReadArcs({
    builder,
    context,
    identifierTypes,
    variables,
    places,
    dependencies,
    transition,
    roleId,
    classId: creationTransition.classId,
  });
}

function addCreatedObjectOutputs(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
  creationTransition: ObjectCreationTransition;
}): void {
  const {
    builder,
    identifierTypes,
    variables,
    places,
    transition,
    creationTransition,
  } = args;
  const createdState = creationTransition.stateWrites.find(
    (state) =>
      state.roleId === creationTransition.roleId &&
      state.classId === creationTransition.classId &&
      state.stateId === creationTransition.targetStateId &&
      !state.isVirtualInitial,
  );
  const createdExistence = creationTransition.existenceWrites.find(
    (existence) =>
      existence.roleId === creationTransition.roleId &&
      existence.classId === creationTransition.classId,
  );

  if (!createdState || !createdExistence) {
    throw new Error(
      `Cannot lift object creation transition without semantic descriptor for ${creationTransition.roleId}.${creationTransition.classId}.${creationTransition.targetStateId}`,
    );
  }

  const roleType = requireMapValue(
    identifierTypes.roleTypeByRole,
    creationTransition.roleId,
    "role identifier type",
  );
  const objectType = requireMapValue(
    identifierTypes.objectTypeByClass,
    creationTransition.classId,
    "object identifier type",
  );
  const roleVariable = requireMapValue(
    variables.roleVariableByRole,
    creationTransition.roleId,
    "role variable",
  );
  const objectVariable = requireMapValue(
    variables.objectVariableByClass,
    creationTransition.classId,
    "object variable",
  );
  const inscription = [
    tupleElement(roleType, roleVariable),
    tupleElement(objectType, objectVariable, true),
  ];

  addOrdinaryArc({
    builder,
    source: transition,
    target: requireMapValue(
      places.awarenessPlaceByRoleAndClass,
      roleClassKey(createdExistence.roleId, createdExistence.classId),
      "awareness place",
    ),
    inscription,
  });
  addOrdinaryArc({
    builder,
    source: transition,
    target: requireMapValue(
      places.statePlaceByRoleClassAndState,
      roleClassStateKey(
        createdState.roleId,
        createdState.classId,
        createdState.stateId,
      ),
      "state-awareness place",
    ),
    inscription,
  });
}

function addCaseSpecificDependencyReadArcs(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
    dependencyObjectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  dependencies: CreationDependencies;
  transition: TypedTransition;
  roleId: string;
  classId: string;
}): void {
  const requiredClassIds =
    args.dependencies.existentialRequirementsByClass.get(args.classId) ?? [];

  for (const requiredClassId of requiredClassIds) {
    addCaseBindingReadArc({ ...args, requiredClassId });
    addCreatorAwarenessReadArc({ ...args, requiredClassId });
  }
}

function addCrossCaseDependencyReadArcs(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
    dependencyObjectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  dependencies: CreationDependencies;
  transition: TypedTransition;
  roleId: string;
  classId: string;
}): void {
  const requiredClassIds = [
    ...new Set([
      ...(args.dependencies.existentialRequirementsByClass.get(args.classId) ?? []),
      ...mandatoryCrossCaseAssociationRequirements(args.context, args.classId),
    ]),
  ].sort();

  for (const requiredClassId of requiredClassIds) {
    if (!args.context.crossCaseClassIds.has(requiredClassId)) {
      throw new Error(
        `Unsupported cross-case creation dependency: cross-case class ${args.classId} depends on case-specific class ${requiredClassId}`,
      );
    }

    addCreatorAwarenessReadArc({ ...args, requiredClassId });
    addRelationProductionArc({ ...args, requiredClassId });
  }
}

function addCaseBindingReadArc(args: {
  builder: TypedPetriNetBuilder;
  identifierTypes: {
    caseType: TypedIdentifierType;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    dependencyObjectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
  requiredClassId: string;
}): void {
  const objectType = requireMapValue(
    args.identifierTypes.objectTypeByClass,
    args.requiredClassId,
    "dependency object identifier type",
  );
  const objectVariable = requireMapValue(
    args.variables.dependencyObjectVariableByClass,
    args.requiredClassId,
    "dependency object variable",
  );

  addReadArc({
    builder: args.builder,
    source: requireMapValue(
      args.places.objectBindingPlaceByClass,
      args.requiredClassId,
      "dependency object binding place",
    ),
    transition: args.transition,
    inscription: [
      tupleElement(args.identifierTypes.caseType, args.variables.caseVariable),
      tupleElement(objectType, objectVariable),
    ],
  });
}

function addCreatorAwarenessReadArc(args: {
  builder: TypedPetriNetBuilder;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    dependencyObjectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
  roleId: string;
  requiredClassId: string;
}): void {
  const roleType = requireMapValue(
    args.identifierTypes.roleTypeByRole,
    args.roleId,
    "role identifier type",
  );
  const objectType = requireMapValue(
    args.identifierTypes.objectTypeByClass,
    args.requiredClassId,
    "dependency object identifier type",
  );
  const roleVariable = requireMapValue(
    args.variables.roleVariableByRole,
    args.roleId,
    "role variable",
  );
  const objectVariable = requireMapValue(
    args.variables.dependencyObjectVariableByClass,
    args.requiredClassId,
    "dependency object variable",
  );

  addReadArc({
    builder: args.builder,
    source: requireMapValue(
      args.places.awarenessPlaceByRoleAndClass,
      roleClassKey(args.roleId, args.requiredClassId),
      "dependency awareness place",
    ),
    transition: args.transition,
    inscription: [
      tupleElement(roleType, roleVariable),
      tupleElement(objectType, objectVariable),
    ],
  });
}

function addRelationProductionArc(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    objectVariableByClass: Map<string, TypedVariable>;
    dependencyObjectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
  classId: string;
  requiredClassId: string;
}): void {
  const association = relationAssociationBetween(
    args.context,
    args.classId,
    args.requiredClassId,
  );

  if (!association) {
    return;
  }

  const relationPlace = args.places.relationPlaceByAssociation.get(association.id);

  if (!relationPlace) {
    return;
  }

  const [left, right] = association.ends;
  const leftElement =
    left.classId === args.classId
      ? tupleElement(
          requireMapValue(
            args.identifierTypes.objectTypeByClass,
            args.classId,
            "created object identifier type",
          ),
          requireMapValue(
            args.variables.objectVariableByClass,
            args.classId,
            "created object variable",
          ),
          true,
        )
      : tupleElement(
          requireMapValue(
            args.identifierTypes.objectTypeByClass,
            left.classId,
            "dependency object identifier type",
          ),
          requireMapValue(
            args.variables.dependencyObjectVariableByClass,
            left.classId,
            "dependency object variable",
          ),
        );
  const rightElement =
    right.classId === args.classId
      ? tupleElement(
          requireMapValue(
            args.identifierTypes.objectTypeByClass,
            args.classId,
            "created object identifier type",
          ),
          requireMapValue(
            args.variables.objectVariableByClass,
            args.classId,
            "created object variable",
          ),
          true,
        )
      : tupleElement(
          requireMapValue(
            args.identifierTypes.objectTypeByClass,
            right.classId,
            "dependency object identifier type",
          ),
          requireMapValue(
            args.variables.dependencyObjectVariableByClass,
            right.classId,
            "dependency object variable",
          ),
        );

  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: relationPlace,
    inscription: [leftElement, rightElement],
  });
}

function addReadArc(args: {
  builder: TypedPetriNetBuilder;
  source: TypedPlace;
  transition: TypedTransition;
  inscription: TypedTupleElement[];
}): void {
  addOrdinaryArc({
    builder: args.builder,
    source: args.source,
    target: args.transition,
    inscription: args.inscription,
  });
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: args.source,
    inscription: args.inscription,
  });
}

function addOrdinaryArc(args: {
  builder: TypedPetriNetBuilder;
  source: TypedPlace | TypedTransition;
  target: TypedPlace | TypedTransition;
  inscription: TypedTupleElement[];
}): void {
  args.builder.addOrdinaryArc({
    id: arcId(args.source.id, "to", args.target.id),
    sourceId: args.source.id,
    targetId: args.target.id,
    inscription: args.inscription,
  });
}

function tupleElement(
  type: TypedIdentifierType,
  variable: TypedVariable,
  isGenerated = false,
): TypedTupleElement {
  return {
    typeId: type.id,
    variableId: variable.id,
    isGenerated,
  };
}

function rejectUnsupportedMixedOneToOneGroups(
  context: CrossCasePetriNetMappingContext,
  dependencies: CreationDependencies,
): void {
  for (const group of dependencies.oneToOneGroups.filter(
    (candidate) => candidate.length > 1,
  )) {
    const crossCaseClassCount = group.filter((classId) =>
      context.crossCaseClassIds.has(classId),
    ).length;

    if (crossCaseClassCount > 0 && crossCaseClassCount < group.length) {
      throw new Error(
        `Unsupported mixed one-to-one creation dependency across cross-case and case-specific classes: [${group.join(
          ", ",
        )}]`,
      );
    }
  }
}

function mandatoryCrossCaseAssociationRequirements(
  context: CrossCasePetriNetMappingContext,
  classId: string,
): string[] {
  return context.source.dataModel.associations
    .filter((association) => association.ends.some((end) => end.classId === classId))
    .filter((association) =>
      association.ends.every((end) => context.crossCaseClassIds.has(end.classId)),
    )
    .filter((association) => {
      const otherEnd = association.ends.find((end) => end.classId !== classId);

      return otherEnd !== undefined && otherEnd.lower >= 1;
    })
    .map((association) => {
      const otherEnd = association.ends.find((end) => end.classId !== classId);

      if (!otherEnd) {
        throw new Error(`Self-association ${association.id} is unsupported`);
      }

      return otherEnd.classId;
    });
}

function relationAssociationBetween(
  context: CrossCasePetriNetMappingContext,
  leftClassId: string,
  rightClassId: string,
): Association | undefined {
  return context.source.dataModel.associations.find((association) => {
    const classIds = association.ends.map((end) => end.classId);

    return classIds.includes(leftClassId) && classIds.includes(rightClassId);
  });
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
