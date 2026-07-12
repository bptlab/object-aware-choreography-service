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
  gatewayBranchTransitionId,
  parallelGatewayTransitionId,
} from "./ids.js";
import {
  gatewayBranchTransitionLabel,
  parallelGatewayTransitionLabel,
} from "./labels.js";
import {
  type CrossCasePetriNetMappingContext,
  requireMapValue,
} from "./mappingContext.js";
import type { CrossCasePlaceRegistry } from "./placeMapping.js";

type GatewayBranchTransition = Extract<
  PetriNetTransitionSemantics,
  { kind: "gatewayBranchTransition" }
>;

type ParallelGatewayTransition = Extract<
  PetriNetTransitionSemantics,
  { kind: "parallelGatewayTransition" }
>;

export function addGatewayBackboneTransitions(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  gatewayTransitions: PetriNetTransitionSemantics[];
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
}): void {
  for (const gatewayTransition of args.gatewayTransitions) {
    if (gatewayTransition.kind === "gatewayBranchTransition") {
      addGatewayBranchTransition({ ...args, gatewayTransition });
    }

    if (gatewayTransition.kind === "parallelGatewayTransition") {
      addParallelGatewayTransition({ ...args, gatewayTransition });
    }
  }
}

function addGatewayBranchTransition(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  gatewayTransition: GatewayBranchTransition;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
}): void {
  const { builder, gatewayTransition } = args;

  const transition = builder.addTransition({
    id: gatewayBranchTransitionId(
      gatewayTransition.gatewayId,
      gatewayTransition.branchId,
    ),
    name: gatewayBranchTransitionLabel({
      gatewayName: gatewayTransition.gatewayName,
      branchId: gatewayTransition.branchId,
      direction: gatewayTransition.direction,
    }),
  });

  addControlFlowReadArcs({ ...args, transition, gatewayTransition });
  addControlFlowWriteArcs({ ...args, transition, gatewayTransition });
  addGuardReadArcs({ ...args, transition, gatewayTransition });
}

function addParallelGatewayTransition(args: {
  builder: TypedPetriNetBuilder;
  gatewayTransition: ParallelGatewayTransition;
  identifierTypes: {
    caseType: TypedIdentifierType;
  };
  variables: {
    caseVariable: TypedVariable;
  };
  places: CrossCasePlaceRegistry;
}): void {
  const { builder, gatewayTransition } = args;
  const transition = builder.addTransition({
    id: parallelGatewayTransitionId(gatewayTransition.gatewayId),
    name: parallelGatewayTransitionLabel(gatewayTransition.gatewayName),
  });

  addControlFlowReadArcs({ ...args, transition, gatewayTransition });
  addControlFlowWriteArcs({ ...args, transition, gatewayTransition });
}

function addControlFlowReadArcs(args: {
  builder: TypedPetriNetBuilder;
  gatewayTransition: {
    incomingFlowIds: string[];
  };
  identifierTypes: {
    caseType: TypedIdentifierType;
  };
  variables: {
    caseVariable: TypedVariable;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
}): void {
  const { builder, gatewayTransition, identifierTypes, variables, places } =
    args;

  for (const incomingFlowId of gatewayTransition.incomingFlowIds) {
    const controlFlowPlace = controlFlowPlaceFor(places, incomingFlowId);

    builder.addOrdinaryArc({
      id: arcId(controlFlowPlace.id, "to", args.transition.id),
      sourceId: controlFlowPlace.id,
      targetId: args.transition.id,
      inscription: [caseTuple(identifierTypes, variables)],
    });
  }
}

function addControlFlowWriteArcs(args: {
  builder: TypedPetriNetBuilder;
  gatewayTransition: {
    outgoingFlowIds: string[];
  };
  identifierTypes: {
    caseType: TypedIdentifierType;
  };
  variables: {
    caseVariable: TypedVariable;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
}): void {
  const { builder, gatewayTransition, identifierTypes, variables, places } =
    args;

  for (const outgoingFlowId of gatewayTransition.outgoingFlowIds) {
    const controlFlowPlace = controlFlowPlaceFor(places, outgoingFlowId);

    builder.addOrdinaryArc({
      id: arcId(args.transition.id, "to", controlFlowPlace.id),
      sourceId: args.transition.id,
      targetId: controlFlowPlace.id,
      inscription: [caseTuple(identifierTypes, variables)],
    });
  }
}

function addGuardReadArcs(args: {
  builder: TypedPetriNetBuilder;
  gatewayTransition: GatewayBranchTransition;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
}): void {
  const stateReadsByClass = groupStateReadsByClass(args.gatewayTransition);

  for (const [classId, stateReads] of stateReadsByClass) {
    addObjectBindingReadArc({ ...args, classId });

    for (const stateRead of stateReads) {
      addParticipationReadArc({ ...args, roleId: stateRead.roleId });

      if (stateRead.isVirtualInitial) {
        addNonAwarenessInhibitorArc({
          ...args,
          roleId: stateRead.roleId,
          classId: stateRead.classId,
        });
      } else {
        addStateReadArc({ ...args, stateRead });
      }
    }
  }
}

function addObjectBindingReadArc(args: {
  builder: TypedPetriNetBuilder;
  classId: string;
  identifierTypes: {
    caseType: TypedIdentifierType;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    objectVariableByClass: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
}): void {
  const objectBindingPlace = requireMapValue(
    args.places.objectBindingPlaceByClass,
    args.classId,
    "object binding place",
  );

  args.builder.addOrdinaryArc({
    id: arcId(objectBindingPlace.id, "to", args.transition.id),
    sourceId: objectBindingPlace.id,
    targetId: args.transition.id,
    inscription: [
      caseTuple(args.identifierTypes, args.variables),
      objectTuple(args.identifierTypes, args.variables, args.classId),
    ],
  });
  args.builder.addOrdinaryArc({
    id: arcId(args.transition.id, "to", objectBindingPlace.id),
    sourceId: args.transition.id,
    targetId: objectBindingPlace.id,
    inscription: [
      caseTuple(args.identifierTypes, args.variables),
      objectTuple(args.identifierTypes, args.variables, args.classId),
    ],
  });
}

function addParticipationReadArc(args: {
  builder: TypedPetriNetBuilder;
  roleId: string;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  transition: TypedTransition;
}): void {
  const participationPlace = requireMapValue(
    args.places.participationPlaceByRole,
    args.roleId,
    "participation place",
  );

  args.builder.addOrdinaryArc({
    id: arcId(participationPlace.id, "to", args.transition.id),
    sourceId: participationPlace.id,
    targetId: args.transition.id,
    inscription: [
      caseTuple(args.identifierTypes, args.variables),
      roleTuple(args.identifierTypes, args.variables, args.roleId),
    ],
  });
  args.builder.addOrdinaryArc({
    id: arcId(args.transition.id, "to", participationPlace.id),
    sourceId: args.transition.id,
    targetId: participationPlace.id,
    inscription: [
      caseTuple(args.identifierTypes, args.variables),
      roleTuple(args.identifierTypes, args.variables, args.roleId),
    ],
  });
}

function addStateReadArc(args: {
  builder: TypedPetriNetBuilder;
  stateRead: {
    roleId: string;
    classId: string;
    stateId: string;
  };
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
}): void {
  const statePlace = requireMapValue(
    args.places.statePlaceByRoleClassAndState,
    roleClassStateKey(
      args.stateRead.roleId,
      args.stateRead.classId,
      args.stateRead.stateId,
    ),
    "state-awareness place",
  );

  args.builder.addOrdinaryArc({
    id: arcId(statePlace.id, "to", args.transition.id),
    sourceId: statePlace.id,
    targetId: args.transition.id,
    inscription: [
      roleTuple(args.identifierTypes, args.variables, args.stateRead.roleId),
      objectTuple(args.identifierTypes, args.variables, args.stateRead.classId),
    ],
  });
  args.builder.addOrdinaryArc({
    id: arcId(args.transition.id, "to", statePlace.id),
    sourceId: args.transition.id,
    targetId: statePlace.id,
    inscription: [
      roleTuple(args.identifierTypes, args.variables, args.stateRead.roleId),
      objectTuple(args.identifierTypes, args.variables, args.stateRead.classId),
    ],
  });
}

function addNonAwarenessInhibitorArc(args: {
  builder: TypedPetriNetBuilder;
  roleId: string;
  classId: string;
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
}): void {
  const awarenessPlace = requireMapValue(
    args.places.awarenessPlaceByRoleAndClass,
    roleClassKey(args.roleId, args.classId),
    "awareness place",
  );

  args.builder.addInhibitorArc({
    id: arcId(awarenessPlace.id, "inhibits", args.transition.id),
    sourceId: awarenessPlace.id,
    targetId: args.transition.id,
    inscription: [
      roleTuple(args.identifierTypes, args.variables, args.roleId),
      objectTuple(args.identifierTypes, args.variables, args.classId),
    ],
  });
}

function groupStateReadsByClass(
  gatewayTransition: GatewayBranchTransition,
): Map<string, GatewayBranchTransition["stateReads"]> {
  const readsByClass = new Map<string, GatewayBranchTransition["stateReads"]>();

  for (const stateRead of gatewayTransition.stateReads) {
    readsByClass.set(stateRead.classId, [
      ...(readsByClass.get(stateRead.classId) ?? []),
      stateRead,
    ]);
  }

  return readsByClass;
}

function controlFlowPlaceFor(
  places: CrossCasePlaceRegistry,
  sequenceFlowId: string,
): TypedPlace {
  return requireMapValue(
    places.controlFlowPlaceBySequenceFlow,
    sequenceFlowId,
    "control-flow place",
  );
}

function caseTuple(
  identifierTypes: { caseType: TypedIdentifierType },
  variables: { caseVariable: TypedVariable },
): TypedTupleElement {
  return {
    typeId: identifierTypes.caseType.id,
    variableId: variables.caseVariable.id,
    isGenerated: false,
  };
}

function roleTuple(
  identifierTypes: { roleTypeByRole: Map<string, TypedIdentifierType> },
  variables: { roleVariableByRole: Map<string, TypedVariable> },
  roleId: string,
): TypedTupleElement {
  return {
    typeId: requireMapValue(
      identifierTypes.roleTypeByRole,
      roleId,
      "role identifier type",
    ).id,
    variableId: requireMapValue(
      variables.roleVariableByRole,
      roleId,
      "role variable",
    ).id,
    isGenerated: false,
  };
}

function objectTuple(
  identifierTypes: { objectTypeByClass: Map<string, TypedIdentifierType> },
  variables: { objectVariableByClass: Map<string, TypedVariable> },
  classId: string,
): TypedTupleElement {
  return {
    typeId: requireMapValue(
      identifierTypes.objectTypeByClass,
      classId,
      "object identifier type",
    ).id,
    variableId: requireMapValue(
      variables.objectVariableByClass,
      classId,
      "object variable",
    ).id,
    isGenerated: false,
  };
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
