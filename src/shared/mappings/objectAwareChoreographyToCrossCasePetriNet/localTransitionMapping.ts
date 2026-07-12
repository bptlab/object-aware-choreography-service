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
  localTransitionId,
} from "./ids.js";
import { requireMapValue } from "./mappingContext.js";
import type { CrossCasePlaceRegistry } from "./placeMapping.js";

export function addLocalLifecycleTransitions(args: {
  builder: TypedPetriNetBuilder;
  localTransitions: PetriNetTransitionSemantics[];
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
}): void {
  for (const transition of args.localTransitions) {
    if (transition.kind !== "localTransition") {
      continue;
    }
    if (transition.sourceIsVirtualInitial) {
      continue;
    }

    addLocalLifecycleTransition({
      ...args,
      localTransition: transition,
    });
  }
}

function addLocalLifecycleTransition(args: {
  builder: TypedPetriNetBuilder;
  localTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "localTransition" }
  >;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
}): void {
  const {
    builder,
    localTransition,
    identifierTypes,
    variables,
    places,
  } = args;
  const transition = builder.addTransition({
    id: localTransitionId(
      localTransition.roleId,
      localTransition.classId,
      localTransition.sourceStateId,
      localTransition.targetStateId,
    ),
    name: `${localTransition.roleId}.${localTransition.classId} ${localTransition.sourceStateId} -> ${localTransition.targetStateId}`,
  });
  const inscriptionFor = (reference: {
    roleId: string;
    classId: string;
  }): TypedTupleElement[] => [
    roleTupleElement(identifierTypes, variables, reference.roleId),
    objectTupleElement(identifierTypes, variables, reference.classId),
  ];

  if (localTransition.sourceIsVirtualInitial) {
    const existenceReference = {
      roleId: localTransition.roleId,
      classId: localTransition.classId,
    };
    addInhibitorArc({
      builder,
      source: existenceAwarenessPlace(places, existenceReference),
      target: transition,
      inscription: inscriptionFor(existenceReference),
    });
  } else {
    const writtenStateKeys = new Set(
      localTransition.stateWrites.map((state) =>
        roleClassStateKey(state.roleId, state.classId, state.stateId),
      ),
    );

    for (const stateRead of localTransition.stateReads.filter(
      (state) => !state.isVirtualInitial,
    )) {
      const source = stateAwarenessPlace(places, stateRead);
      const inscription = inscriptionFor(stateRead);

      addOrdinaryArc({
        builder,
        source,
        target: transition,
        inscription,
      });

      if (
        writtenStateKeys.has(
          roleClassStateKey(
            stateRead.roleId,
            stateRead.classId,
            stateRead.stateId,
          ),
        )
      ) {
        addOrdinaryArc({
          builder,
          source: transition,
          target: source,
          inscription,
        });
      }
    }
  }

  for (const existenceWrite of localTransition.existenceWrites) {
    addOrdinaryArc({
      builder,
      source: transition,
      target: existenceAwarenessPlace(places, existenceWrite),
      inscription: inscriptionFor(existenceWrite),
    });
  }

  for (const stateWrite of localTransition.stateWrites.filter(
    (state) => !state.isVirtualInitial,
  )) {
    addOrdinaryArc({
      builder,
      source: transition,
      target: stateAwarenessPlace(places, stateWrite),
      inscription: inscriptionFor(stateWrite),
    });
  }
}

function existenceAwarenessPlace(
  places: CrossCasePlaceRegistry,
  reference: { roleId: string; classId: string },
): TypedPlace {
  return requireMapValue(
    places.awarenessPlaceByRoleAndClass,
    roleClassKey(reference.roleId, reference.classId),
    "existence-awareness place",
  );
}

function stateAwarenessPlace(
  places: CrossCasePlaceRegistry,
  reference: { roleId: string; classId: string; stateId: string },
): TypedPlace {
  return requireMapValue(
    places.statePlaceByRoleClassAndState,
    roleClassStateKey(reference.roleId, reference.classId, reference.stateId),
    "state-awareness place",
  );
}

function roleTupleElement(
  identifierTypes: { roleTypeByRole: Map<string, TypedIdentifierType> },
  variables: { roleVariableByRole: Map<string, TypedVariable> },
  roleId: string,
): TypedTupleElement {
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

  return {
    typeId: roleType.id,
    variableId: roleVariable.id,
    isGenerated: false,
  };
}

function objectTupleElement(
  identifierTypes: { objectTypeByClass: Map<string, TypedIdentifierType> },
  variables: { objectVariableByClass: Map<string, TypedVariable> },
  classId: string,
): TypedTupleElement {
  const objectType = requireMapValue(
    identifierTypes.objectTypeByClass,
    classId,
    "object identifier type",
  );
  const objectVariable = requireMapValue(
    variables.objectVariableByClass,
    classId,
    "object variable",
  );

  return {
    typeId: objectType.id,
    variableId: objectVariable.id,
    isGenerated: false,
  };
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

function addInhibitorArc(args: {
  builder: TypedPetriNetBuilder;
  source: TypedPlace;
  target: TypedTransition;
  inscription: TypedTupleElement[];
}): void {
  args.builder.addInhibitorArc({
    id: arcId(args.source.id, "inhibits", args.target.id),
    sourceId: args.source.id,
    targetId: args.target.id,
    inscription: args.inscription,
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
