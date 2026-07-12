import type { ObjectAwareChoreographyContext } from "../../context/objectAwareChoreographyContext.js";
import {
  buildPetriNetWithSemantics,
} from "../objectAwareChoreographyToPetriNet/buildPetriNet.js";
import type {
  IsolatedPetriNetArtifact,
  PetriNetTransitionSemantics,
} from "../objectAwareChoreographyToPetriNet/petriNetArtifact.js";
import {
  TypedPetriNetBuilder,
  type TypedIdentifierType,
  type TypedPetriNet,
  type TypedVariable,
} from "../../targets/typedPetriNet/index.js";
import {
  arcId,
  caseTypePart,
  caseVariableId,
  dependencyObjectVariableId,
  endTransitionId,
  objectTypePart,
  objectVariableId,
  roleTypePart,
  roleVariableId,
  startTransitionId,
} from "./ids.js";
import { endTransitionLabel, startTransitionLabel } from "./labels.js";
import {
  createCrossCasePetriNetMappingContext,
  requireMapValue,
  type CrossCasePetriNetMappingContext,
} from "./mappingContext.js";
import {
  addStructuralPlaces,
  type CrossCasePlaceRegistry,
} from "./placeMapping.js";
import { addObjectCreationTransitions } from "./objectCreationMapping.js";
import { addTaskBackboneTransitions } from "./taskBackboneMapping.js";
import { addLocalLifecycleTransitions } from "./localTransitionMapping.js";
import { addGatewayBackboneTransitions } from "./gatewayBackboneMapping.js";
import type { CrossCasePetriNetOptions } from "./types.js";

export function buildCrossCasePetriNet(
  context: ObjectAwareChoreographyContext,
  options: CrossCasePetriNetOptions,
): TypedPetriNet {
  const isolated = buildPetriNetWithSemantics({
    choreography: context.choreography,
    dataModel: context.dataModel,
    lifecycleModel: context.lifecycleModel,
    objectReferences: context.objectReferences,
    taskNameIndex: context.taskNameIndex,
  });

  return liftIsolatedPetriNetToCrossCaseTypedPetriNet(
    isolated,
    context,
    options,
  );
}

export function liftIsolatedPetriNetToCrossCaseTypedPetriNet(
  artifact: IsolatedPetriNetArtifact,
  context: ObjectAwareChoreographyContext,
  options: CrossCasePetriNetOptions,
): TypedPetriNet {
  const mappingContext = createCrossCasePetriNetMappingContext(context, options);
  const builder = new TypedPetriNetBuilder(
    "cross_case_model",
    "Cross-case typed Petri net",
  );
  const identifierTypes = addIdentifierTypes(builder, mappingContext);
  const variables = addVariables(builder, mappingContext, identifierTypes);
  const places = addStructuralPlaces({
    builder,
    context: mappingContext,
    identifierTypes,
    isolatedArtifact: artifact,
  });

  addStartTransitions({
    builder,
    context: mappingContext,
    identifierTypes,
    variables,
    places,
    startTransitions: Object.values(artifact.semantics.transitions).filter(
      (transition) => transition.kind === "startEventTransition",
    ),
  });
  addGatewayBackboneTransitions({
    builder,
    context: mappingContext,
    gatewayTransitions: Object.values(artifact.semantics.transitions).filter(
      (transition) =>
        transition.kind === "gatewayBranchTransition" ||
        transition.kind === "parallelGatewayTransition",
    ),
    identifierTypes,
    variables,
    places,
  });
  addTaskBackboneTransitions({
    builder,
    context: mappingContext,
    taskTransitions: Object.values(artifact.semantics.transitions).filter(
      (transition) =>
        transition.kind === "atomicTaskTransition" ||
        transition.kind === "taskSendTransition" ||
        transition.kind === "taskReceiveTransition",
    ),
    identifierTypes,
    variables,
    places,
  });
  addEndTransitions({
    builder,
    identifierTypes,
    variables,
    places,
    endTransitions: Object.values(artifact.semantics.transitions).filter(
      (transition) => transition.kind === "endEventTransition",
    ),
  });
  addLocalLifecycleTransitions({
    builder,
    localTransitions: Object.values(artifact.semantics.transitions).filter(
      (transition) => transition.kind === "localTransition",
    ),
    identifierTypes,
    variables,
    places,
  });
  addObjectCreationTransitions({
    builder,
    context: mappingContext,
    creationTransitions: Object.values(artifact.semantics.transitions).filter(
      (transition) =>
        transition.kind === "objectCreationTransition" ||
        transition.kind === "oneToOneObjectCreationTransition",
    ),
    identifierTypes,
    variables,
    places,
  });

  return builder.toTypedPetriNet();
}

function addEndTransitions(args: {
  builder: TypedPetriNetBuilder;
  identifierTypes: {
    caseType: TypedIdentifierType;
  };
  variables: {
    caseVariable: TypedVariable;
  };
  places: CrossCasePlaceRegistry;
  endTransitions: PetriNetTransitionSemantics[];
}): void {
  const { builder, identifierTypes, variables, places } = args;

  for (const endEvent of args.endTransitions.filter(
    (transition) => transition.kind === "endEventTransition",
  )) {
    const transition = builder.addTransition({
      id: endTransitionId(endEvent.eventId),
      name: endTransitionLabel(),
    });

    for (const incomingFlowId of endEvent.incomingFlowIds) {
      const controlFlowPlace = requireMapValue(
        places.controlFlowPlaceBySequenceFlow,
        incomingFlowId,
        "end-event incoming control-flow place",
      );

      builder.addOrdinaryArc({
        id: arcId(controlFlowPlace.id, "to", transition.id),
        sourceId: controlFlowPlace.id,
        targetId: transition.id,
        inscription: [
          {
            typeId: identifierTypes.caseType.id,
            variableId: variables.caseVariable.id,
            isGenerated: false,
          },
        ],
      });
    }

    builder.addOrdinaryArc({
      id: arcId(transition.id, "to", places.sinkPlace.id),
      sourceId: transition.id,
      targetId: places.sinkPlace.id,
      inscription: [
        {
          typeId: identifierTypes.caseType.id,
          variableId: variables.caseVariable.id,
          isGenerated: false,
        },
      ],
    });
  }
}

function addIdentifierTypes(
  builder: TypedPetriNetBuilder,
  context: CrossCasePetriNetMappingContext,
): {
  caseType: TypedIdentifierType;
  roleTypeByRole: Map<string, TypedIdentifierType>;
  objectTypeByClass: Map<string, TypedIdentifierType>;
} {
  const caseType = builder.addIdentifierType({
    id: caseTypePart(),
    name: "Case",
    alias: "case",
  });
  const roleTypeByRole = new Map<string, TypedIdentifierType>();
  const objectTypeByClass = new Map<string, TypedIdentifierType>();

  for (const roleId of context.roleIds) {
    const roleType = builder.addIdentifierType({
      id: roleTypePart(roleId),
      name: `Role ${roleId}`,
      alias: roleId,
    });
    roleTypeByRole.set(roleId, roleType);
  }

  for (const dataClass of context.classes) {
    const objectType = builder.addIdentifierType({
      id: objectTypePart(dataClass.id),
      name: `Object ${dataClass.id}`,
      alias: dataClass.id,
    });
    objectTypeByClass.set(dataClass.id, objectType);
  }

  return { caseType, roleTypeByRole, objectTypeByClass };
}

function addVariables(
  builder: TypedPetriNetBuilder,
  context: CrossCasePetriNetMappingContext,
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  },
): {
  caseVariable: TypedVariable;
  roleVariableByRole: Map<string, TypedVariable>;
  objectVariableByClass: Map<string, TypedVariable>;
  dependencyObjectVariableByClass: Map<string, TypedVariable>;
} {
  const caseVariable = builder.addVariable({
    id: caseVariableId(),
    typeId: identifierTypes.caseType.id,
  });
  const roleVariableByRole = new Map<string, TypedVariable>();
  const objectVariableByClass = new Map<string, TypedVariable>();
  const dependencyObjectVariableByClass = new Map<string, TypedVariable>();

  for (const roleId of context.roleIds) {
    roleVariableByRole.set(
      roleId,
      builder.addVariable({
        id: roleVariableId(roleId),
        typeId: requireMapValue(
          identifierTypes.roleTypeByRole,
          roleId,
          "role identifier type",
        ).id,
      }),
    );
  }

  for (const dataClass of context.classes) {
    objectVariableByClass.set(
      dataClass.id,
      builder.addVariable({
        id: objectVariableId(dataClass.id),
        typeId: requireMapValue(
          identifierTypes.objectTypeByClass,
          dataClass.id,
          "object identifier type",
        ).id,
      }),
    );
    dependencyObjectVariableByClass.set(
      dataClass.id,
      builder.addVariable({
        id: dependencyObjectVariableId(dataClass.id),
        typeId: requireMapValue(
          identifierTypes.objectTypeByClass,
          dataClass.id,
          "object identifier type",
        ).id,
      }),
    );
  }

  return {
    caseVariable,
    roleVariableByRole,
    objectVariableByClass,
    dependencyObjectVariableByClass,
  };
}

function addStartTransitions(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
  startTransitions: PetriNetTransitionSemantics[];
}): void {
  const { builder, context, identifierTypes, variables, places } = args;

  for (const startEvent of args.startTransitions.filter(
    (transition) => transition.kind === "startEventTransition",
  )) {
    const transition = builder.addTransition({
      id: startTransitionId(startEvent.eventId),
      name: startTransitionLabel(),
      freshVariables: [
        {
          variableId: variables.caseVariable.id,
          typeId: identifierTypes.caseType.id,
        },
      ],
    });

    for (const roleId of context.roleIds) {
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
      const poolPlace = requireMapValue(places.poolPlaceByRole, roleId, "pool");
      const participationPlace = requireMapValue(
        places.participationPlaceByRole,
        roleId,
        "participation place",
      );

      builder.addOrdinaryArc({
        id: arcId(poolPlace.id, "to", transition.id),
        sourceId: poolPlace.id,
        targetId: transition.id,
        inscription: [
          {
            typeId: roleType.id,
            variableId: roleVariable.id,
            isGenerated: false,
          },
        ],
      });
      builder.addOrdinaryArc({
        id: arcId(transition.id, "to", poolPlace.id),
        sourceId: transition.id,
        targetId: poolPlace.id,
        inscription: [
          {
            typeId: roleType.id,
            variableId: roleVariable.id,
            isGenerated: false,
          },
        ],
      });
      builder.addOrdinaryArc({
        id: arcId(transition.id, "to", participationPlace.id),
        sourceId: transition.id,
        targetId: participationPlace.id,
        inscription: [
          {
            typeId: identifierTypes.caseType.id,
            variableId: variables.caseVariable.id,
            isGenerated: true,
          },
          {
            typeId: roleType.id,
            variableId: roleVariable.id,
            isGenerated: false,
          },
        ],
      });
    }

    for (const outgoingFlowId of startEvent.outgoingFlowIds) {
      const controlFlowPlace = requireMapValue(
        places.controlFlowPlaceBySequenceFlow,
        outgoingFlowId,
        "control-flow place",
      );
      builder.addOrdinaryArc({
        id: arcId(transition.id, "to", controlFlowPlace.id),
        sourceId: transition.id,
        targetId: controlFlowPlace.id,
        inscription: [
          {
            typeId: identifierTypes.caseType.id,
            variableId: variables.caseVariable.id,
            isGenerated: true,
          },
        ],
      });
    }
  }
}
