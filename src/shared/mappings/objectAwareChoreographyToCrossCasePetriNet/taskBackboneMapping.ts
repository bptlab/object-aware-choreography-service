import type { PetriNetTransitionSemantics } from "../objectAwareChoreographyToPetriNet/petriNetArtifact.js";
import type { Association } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type {
  TypedIdentifierType,
  TypedPetriNetBuilder,
  TypedPlace,
  TypedTransition,
  TypedTupleElement,
  TypedVariable,
} from "../../targets/typedPetriNet/index.js";
import { typedPetriNetId } from "../../targets/typedPetriNet/ids.js";
import {
  arcId,
  taskAtomicTransitionId,
  taskBoundSendTransitionId,
  taskFirstBindingSendTransitionId,
  taskReceiveTransitionId,
  taskSendTransitionId,
} from "./ids.js";
import {
  taskAtomicTransitionLabel,
  taskReceiveTransitionLabel,
  taskSendTransitionLabel,
} from "./labels.js";
import {
  type CrossCasePetriNetMappingContext,
  requireMapValue,
} from "./mappingContext.js";
import type { CrossCasePlaceRegistry } from "./placeMapping.js";

export function addTaskBackboneTransitions(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  taskTransitions: PetriNetTransitionSemantics[];
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
  for (const atomicTransition of args.taskTransitions.filter(
    (transition) => transition.kind === "atomicTaskTransition",
  )) {
    addAtomicTaskBackbone({
      ...args,
      atomicTransition,
    });
  }

  const receiveTransitionsByTaskId = groupReceiveTransitions(
    args.taskTransitions,
  );
  const taskIdsWithReceives = new Set<string>();

  for (const sendTransition of args.taskTransitions.filter(
    (transition) => transition.kind === "taskSendTransition",
  )) {
    const receiveTransitions =
      receiveTransitionsByTaskId.get(sendTransition.taskId) ?? [];
    const includeReceives = !taskIdsWithReceives.has(sendTransition.taskId);

    if (isNoObjectTask(sendTransition, receiveTransitions)) {
      addNoObjectTaskBackbone({
        ...args,
        sendTransition,
        receiveTransitions,
        includeReceives,
      });
      taskIdsWithReceives.add(sendTransition.taskId);
      continue;
    }

    if (!sendTransition.objectRef) {
      addCaseOnlyObjectAwareTaskBackbone({
        ...args,
        sendTransition,
        receiveTransitions,
        includeReceives,
      });
      taskIdsWithReceives.add(sendTransition.taskId);
      continue;
    }

    if (args.context.crossCaseClassIds.has(sendTransition.objectRef.classId)) {
      addCrossCaseObjectTaskBackbone({
        ...args,
        sendTransition,
        receiveTransitions,
        includeReceives,
      });
      taskIdsWithReceives.add(sendTransition.taskId);
      continue;
    }

    addCaseSpecificObjectTaskBackbone({
      ...args,
      sendTransition,
      receiveTransitions,
      includeReceives,
    });
    taskIdsWithReceives.add(sendTransition.taskId);
  }
}

function addAtomicTaskBackbone(args: {
  builder: TypedPetriNetBuilder;
  atomicTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "atomicTaskTransition" }
  >;
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
  const {
    builder,
    atomicTransition,
    identifierTypes,
    variables,
    places,
  } = args;
  const typedTransition = builder.addTransition({
    id: taskAtomicTransitionId(atomicTransition.taskId),
    name: taskAtomicTransitionLabel(atomicTransition.taskName),
  });

  for (const incomingFlowId of atomicTransition.incomingFlowIds) {
    addOrdinaryArc({
      builder,
      source: controlFlowPlace(places, incomingFlowId),
      target: typedTransition,
      inscription: [caseTupleElement(identifierTypes, variables, false)],
    });
  }
  addParticipationReadArcs({
    builder,
    transition: typedTransition,
    roleId: atomicTransition.senderRoleId,
    places,
    identifierTypes,
    variables,
  });
  addParticipationReadArcs({
    builder,
    transition: typedTransition,
    roleId: atomicTransition.receiverRoleId,
    places,
    identifierTypes,
    variables,
  });
  for (const outgoingFlowId of atomicTransition.outgoingFlowIds) {
    addOrdinaryArc({
      builder,
      source: typedTransition,
      target: controlFlowPlace(places, outgoingFlowId),
      inscription: [caseTupleElement(identifierTypes, variables, false)],
    });
  }
}

function addCaseOnlyObjectAwareTaskBackbone(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  sendTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" }
  >;
  includeReceives: boolean;
  receiveTransitions: Array<
    Extract<PetriNetTransitionSemantics, { kind: "taskReceiveTransition" }>
  >;
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
  const {
    builder,
    sendTransition,
    receiveTransitions,
    identifierTypes,
    variables,
    places,
  } = args;
  const senderTransition = builder.addTransition({
    id: taskSendTransitionId(sendTransition.taskId, sendTransition.variantId),
    name: taskSendTransitionLabel(sendTransition.taskName),
  });
  const transmissionPlace = requireMapValue(
    places.transmissionPlaceByTask,
    sendTransition.taskId,
    "transmission place",
  );

  for (const incomingFlowId of sendTransition.incomingFlowIds) {
    addOrdinaryArc({
      builder,
      source: controlFlowPlace(places, incomingFlowId),
      target: senderTransition,
      inscription: [caseTupleElement(identifierTypes, variables, false)],
    });
  }
  addParticipationReadArcs({
    builder,
    transition: senderTransition,
    roleId: sendTransition.senderRoleId,
    places,
    identifierTypes,
    variables,
  });
  addTaskStateEffects({
    builder,
    context: args.context,
    transition: senderTransition,
    taskTransition: sendTransition,
    places,
    identifierTypes,
    variables,
  });
  addOrdinaryArc({
    builder,
    source: senderTransition,
    target: transmissionPlace,
    inscription: [caseTupleElement(identifierTypes, variables, false)],
  });

  if (!args.includeReceives) {
    return;
  }

  for (const receiveTransition of receiveTransitions) {
    const receiverTransition = builder.addTransition({
      id: taskReceiveTransitionId(
        receiveTransition.taskId,
        receiveTransition.variantId,
      ),
      name: taskReceiveTransitionLabel(receiveTransition.taskName),
    });

    addOrdinaryArc({
      builder,
      source: transmissionPlace,
      target: receiverTransition,
      inscription: [caseTupleElement(identifierTypes, variables, false)],
    });
    addParticipationReadArcs({
      builder,
      transition: receiverTransition,
      roleId: receiveTransition.receiverRoleId,
      places,
      identifierTypes,
      variables,
    });
    addTaskStateEffects({
      builder,
      context: args.context,
      transition: receiverTransition,
      taskTransition: receiveTransition,
      places,
      identifierTypes,
      variables,
    });
    for (const outgoingFlowId of receiveTransition.outgoingFlowIds) {
      addOrdinaryArc({
        builder,
        source: receiverTransition,
        target: controlFlowPlace(places, outgoingFlowId),
        inscription: [caseTupleElement(identifierTypes, variables, false)],
      });
    }
  }
}

function isNoObjectTask(
  sendTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" }
  >,
  receiveTransitions: Array<
    Extract<PetriNetTransitionSemantics, { kind: "taskReceiveTransition" }>
  >,
): boolean {
  return (
    !sendTransition.objectRef &&
    sendTransition.stateReads.length === 0 &&
    sendTransition.stateWrites.length === 0 &&
    receiveTransitions.every(
      (receiveTransition) =>
        !receiveTransition.objectRef &&
        receiveTransition.stateReads.length === 0 &&
        receiveTransition.stateWrites.length === 0 &&
        receiveTransition.existenceWrites.length === 0,
    )
  );
}

function groupReceiveTransitions(
  taskTransitions: PetriNetTransitionSemantics[],
): Map<
  string,
  Array<Extract<PetriNetTransitionSemantics, { kind: "taskReceiveTransition" }>>
> {
  const receiveTransitionsByTaskId = new Map<
    string,
    Array<
      Extract<PetriNetTransitionSemantics, { kind: "taskReceiveTransition" }>
    >
  >();

  for (const transition of taskTransitions) {
    if (transition.kind !== "taskReceiveTransition") {
      continue;
    }

    const transitions = receiveTransitionsByTaskId.get(transition.taskId) ?? [];
    transitions.push(transition);
    receiveTransitionsByTaskId.set(transition.taskId, transitions);
  }

  return receiveTransitionsByTaskId;
}

function addNoObjectTaskBackbone(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  sendTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" }
  >;
  includeReceives: boolean;
  receiveTransitions: Array<
    Extract<PetriNetTransitionSemantics, { kind: "taskReceiveTransition" }>
  >;
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
  const {
    builder,
    sendTransition,
    receiveTransitions,
    identifierTypes,
    variables,
    places,
  } = args;

  if (!args.includeReceives) {
    return;
  }

  if (receiveTransitions.length === 0) {
    throw new Error(
      `No receive descriptor found while lifting no-object task ${sendTransition.taskName} (${sendTransition.taskId})`,
    );
  }

  for (const [index, receiveTransition] of receiveTransitions.entries()) {
    if (
      index > 0 &&
      receiveTransition.variantId === undefined &&
      sendTransition.variantId === undefined
    ) {
      throw new Error(
        `Multiple unqualified receive descriptors found while lifting no-object task ${sendTransition.taskName} (${sendTransition.taskId})`,
      );
    }

    const atomicTransition = builder.addTransition({
      id: taskAtomicTransitionId(
        sendTransition.taskId,
        receiveTransition.variantId ?? sendTransition.variantId,
      ),
      name: taskAtomicTransitionLabel(sendTransition.taskName),
    });

    for (const incomingFlowId of sendTransition.incomingFlowIds) {
      addOrdinaryArc({
        builder,
        source: controlFlowPlace(places, incomingFlowId),
        target: atomicTransition,
        inscription: [caseTupleElement(identifierTypes, variables, false)],
      });
    }
    addParticipationReadArcs({
      builder,
      transition: atomicTransition,
      roleId: sendTransition.senderRoleId,
      places,
      identifierTypes,
      variables,
    });
    addParticipationReadArcs({
      builder,
      transition: atomicTransition,
      roleId: receiveTransition.receiverRoleId,
      places,
      identifierTypes,
      variables,
    });
    for (const outgoingFlowId of receiveTransition.outgoingFlowIds) {
      addOrdinaryArc({
        builder,
        source: atomicTransition,
        target: controlFlowPlace(places, outgoingFlowId),
        inscription: [caseTupleElement(identifierTypes, variables, false)],
      });
    }
  }
}

function addCaseSpecificObjectTaskBackbone(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  sendTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" }
  >;
  includeReceives: boolean;
  receiveTransitions: Array<
    Extract<PetriNetTransitionSemantics, { kind: "taskReceiveTransition" }>
  >;
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
  const {
    builder,
    sendTransition,
    receiveTransitions,
    identifierTypes,
    variables,
    places,
  } = args;
  const objectRef = sendTransition.objectRef;

  if (!objectRef) {
    throw new Error(`Missing object reference for task ${sendTransition.taskId}`);
  }

  const senderTransition = builder.addTransition({
    id: taskSendTransitionId(sendTransition.taskId, sendTransition.variantId),
    name: taskSendTransitionLabel(sendTransition.taskName),
  });
  const transmissionPlace = requireMapValue(
    places.transmissionPlaceByTask,
    sendTransition.taskId,
    "transmission place",
  );

  for (const incomingFlowId of sendTransition.incomingFlowIds) {
    addOrdinaryArc({
      builder,
      source: controlFlowPlace(places, incomingFlowId),
      target: senderTransition,
      inscription: [caseTupleElement(identifierTypes, variables, false)],
    });
  }
  addParticipationReadArcs({
    builder,
    transition: senderTransition,
    roleId: sendTransition.senderRoleId,
    places,
    identifierTypes,
    variables,
  });
  addObjectBindingReadArcs({
    builder,
    transition: senderTransition,
    classId: objectRef.classId,
    places,
    identifierTypes,
    variables,
  });
  addTaskStateEffects({
    builder,
    context: args.context,
    transition: senderTransition,
    taskTransition: sendTransition,
    communicatedClassId: objectRef.classId,
    places,
    identifierTypes,
    variables,
  });
  addOrdinaryArc({
    builder,
    source: senderTransition,
    target: transmissionPlace,
    inscription: [
      caseTupleElement(identifierTypes, variables, false),
      objectTupleElement(identifierTypes, variables, objectRef.classId, false),
    ],
  });

  if (!args.includeReceives) {
    return;
  }

  for (const receiveTransition of receiveTransitions) {
    addCaseSpecificObjectReceiveVariant({
      ...args,
      objectRef,
      transmissionPlace,
      receiveTransition,
    });
  }
}

function addCrossCaseObjectTaskBackbone(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  sendTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" }
  >;
  includeReceives: boolean;
  receiveTransitions: Array<
    Extract<PetriNetTransitionSemantics, { kind: "taskReceiveTransition" }>
  >;
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
  const { builder, sendTransition, receiveTransitions, places } = args;
  const objectRef = sendTransition.objectRef;

  if (!objectRef) {
    throw new Error(`Missing object reference for task ${sendTransition.taskId}`);
  }

  const transmissionPlace = requireMapValue(
    places.transmissionPlaceByTask,
    sendTransition.taskId,
    "transmission place",
  );
  const boundSendTransition = builder.addTransition({
    id: taskBoundSendTransitionId(
      sendTransition.taskId,
      sendTransition.variantId,
    ),
    name: `${taskSendTransitionLabel(sendTransition.taskName)} Bound`,
  });

  addCrossCaseObjectBoundSendVariant({
    ...args,
    objectRef,
    transition: boundSendTransition,
    transmissionPlace,
  });
  for (const bindingVariant of crossCaseFirstBindingVariants(
    args.context,
    objectRef.classId,
  )) {
    const firstBindingSendTransition = builder.addTransition({
      id: taskFirstBindingSendTransitionId(
        sendTransition.taskId,
        firstBindingVariantId(sendTransition.variantId, bindingVariant),
      ),
      name: `${taskSendTransitionLabel(sendTransition.taskName)} Bind`,
    });

    addCrossCaseObjectFirstBindingSendVariant({
      ...args,
      objectRef,
      transition: firstBindingSendTransition,
      transmissionPlace,
      bindingVariant,
    });
  }

  if (!args.includeReceives) {
    return;
  }

  for (const receiveTransition of receiveTransitions) {
    addCaseSpecificObjectReceiveVariant({
      ...args,
      objectRef,
      transmissionPlace,
      receiveTransition,
    });
  }
}

function addCrossCaseObjectBoundSendVariant(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  sendTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" }
  >;
  objectRef: NonNullable<
    Extract<
      PetriNetTransitionSemantics,
      { kind: "taskSendTransition" }
    >["objectRef"]
  >;
  transition: TypedTransition;
  transmissionPlace: TypedPlace;
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
  addCrossCaseObjectCommonSendInputs(args);
  addObjectBindingReadArcs({
    builder: args.builder,
    transition: args.transition,
    classId: args.objectRef.classId,
    places: args.places,
    identifierTypes: args.identifierTypes,
    variables: args.variables,
  });
  addTaskStateEffects({
    builder: args.builder,
    context: args.context,
    transition: args.transition,
    taskTransition: args.sendTransition,
    communicatedClassId: args.objectRef.classId,
    places: args.places,
    identifierTypes: args.identifierTypes,
    variables: args.variables,
  });
  addTransmissionWriteArc(args);
}

function addCrossCaseObjectFirstBindingSendVariant(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  sendTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" }
  >;
  objectRef: NonNullable<
    Extract<
      PetriNetTransitionSemantics,
      { kind: "taskSendTransition" }
    >["objectRef"]
  >;
  transition: TypedTransition;
  transmissionPlace: TypedPlace;
  bindingVariant: CrossCaseFirstBindingVariant;
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
  addCrossCaseObjectCommonSendInputs(args);
  addCrossCaseAssociationConsistencyInputs({
    ...args,
    classId: args.objectRef.classId,
    bindingVariant: args.bindingVariant,
  });
  addTaskStateEffects({
    builder: args.builder,
    context: args.context,
    transition: args.transition,
    taskTransition: args.sendTransition,
    communicatedClassId: args.objectRef.classId,
    skipBindingClassIds: new Set([args.objectRef.classId]),
    places: args.places,
    identifierTypes: args.identifierTypes,
    variables: args.variables,
  });
  addInhibitorArc({
    builder: args.builder,
    source: requireMapValue(
      args.places.inclusionPlaceByClass,
      args.objectRef.classId,
      "inclusion place",
    ),
    target: args.transition,
    inscription: [caseTupleElement(args.identifierTypes, args.variables, false)],
  });
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: requireMapValue(
      args.places.objectBindingPlaceByClass,
      args.objectRef.classId,
      "object binding place",
    ),
    inscription: [
      caseTupleElement(args.identifierTypes, args.variables, false),
      objectTupleElement(
        args.identifierTypes,
        args.variables,
        args.objectRef.classId,
        false,
      ),
    ],
  });
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: requireMapValue(
      args.places.inclusionPlaceByClass,
      args.objectRef.classId,
      "inclusion place",
    ),
    inscription: [caseTupleElement(args.identifierTypes, args.variables, false)],
  });
  addTransmissionWriteArc(args);
}

function addCrossCaseObjectCommonSendInputs(args: {
  builder: TypedPetriNetBuilder;
  sendTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" }
  >;
  transition: TypedTransition;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
  };
  places: CrossCasePlaceRegistry;
}): void {
  for (const incomingFlowId of args.sendTransition.incomingFlowIds) {
    addOrdinaryArc({
      builder: args.builder,
      source: controlFlowPlace(args.places, incomingFlowId),
      target: args.transition,
      inscription: [
        caseTupleElement(args.identifierTypes, args.variables, false),
      ],
    });
  }
  addParticipationReadArcs({
    builder: args.builder,
    transition: args.transition,
    roleId: args.sendTransition.senderRoleId,
    places: args.places,
    identifierTypes: args.identifierTypes,
    variables: args.variables,
  });
}

function addTransmissionWriteArc(args: {
  builder: TypedPetriNetBuilder;
  objectRef: {
    classId: string;
  };
  transition: TypedTransition;
  transmissionPlace: TypedPlace;
  identifierTypes: {
    caseType: TypedIdentifierType;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    objectVariableByClass: Map<string, TypedVariable>;
  };
}): void {
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: args.transmissionPlace,
    inscription: [
      caseTupleElement(args.identifierTypes, args.variables, false),
      objectTupleElement(
        args.identifierTypes,
        args.variables,
        args.objectRef.classId,
        false,
      ),
    ],
  });
}

interface CrossCaseFirstBindingRequirement {
  association: Association;
  relatedClassId: string;
}

interface CrossCaseFirstBindingVariant {
  requirements: CrossCaseFirstBindingRequirement[];
  checkedRelatedClassIds: Set<string>;
}

function crossCaseFirstBindingVariants(
  context: CrossCasePetriNetMappingContext,
  classId: string,
): CrossCaseFirstBindingVariant[] {
  const requirements = mandatoryCrossCaseAssociationRequirements(
    context,
    classId,
  );
  const variants: CrossCaseFirstBindingVariant[] = [];
  const count = requirements.length;

  for (let mask = 0; mask < 2 ** count; mask += 1) {
    variants.push({
      requirements,
      checkedRelatedClassIds: new Set(
        requirements
          .filter((_, index) => (mask & (1 << index)) !== 0)
          .map((requirement) => requirement.relatedClassId),
      ),
    });
  }

  return variants.sort(compareFirstBindingVariants);
}

function firstBindingVariantId(
  baseVariantId: string | undefined,
  variant: CrossCaseFirstBindingVariant,
): string | undefined {
  const checkedIds = [...variant.checkedRelatedClassIds].sort();

  if (checkedIds.length === 0) {
    return baseVariantId;
  }

  const suffix = `assoc_${checkedIds.join("_")}`;

  return baseVariantId ? `${baseVariantId}_${suffix}` : suffix;
}

function compareFirstBindingVariants(
  left: CrossCaseFirstBindingVariant,
  right: CrossCaseFirstBindingVariant,
): number {
  return firstBindingVariantKey(left).localeCompare(firstBindingVariantKey(right));
}

function firstBindingVariantKey(variant: CrossCaseFirstBindingVariant): string {
  return [...variant.checkedRelatedClassIds].sort().join(",");
}

function addCrossCaseAssociationConsistencyInputs(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  transition: TypedTransition;
  classId: string;
  bindingVariant: CrossCaseFirstBindingVariant;
  places: CrossCasePlaceRegistry;
  identifierTypes: {
    caseType: TypedIdentifierType;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    objectVariableByClass: Map<string, TypedVariable>;
  };
}): void {
  for (const requirement of args.bindingVariant.requirements) {
    if (
      args.bindingVariant.checkedRelatedClassIds.has(requirement.relatedClassId)
    ) {
      addInclusionReadArcs({
        ...args,
        classId: requirement.relatedClassId,
      });
      addObjectBindingReadArcs({
        ...args,
        classId: requirement.relatedClassId,
      });
      addRelationReadArcs({
        ...args,
        association: requirement.association,
      });
      continue;
    }

    addInhibitorArc({
      builder: args.builder,
      source: requireMapValue(
        args.places.inclusionPlaceByClass,
        requirement.relatedClassId,
        "inclusion place",
      ),
      target: args.transition,
      inscription: [
        caseTupleElement(args.identifierTypes, args.variables, false),
      ],
    });
  }
}

function addCaseSpecificObjectReceiveVariant(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  receiveTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskReceiveTransition" }
  >;
  objectRef: NonNullable<
    Extract<
      PetriNetTransitionSemantics,
      { kind: "taskSendTransition" }
    >["objectRef"]
  >;
  transmissionPlace: TypedPlace;
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
  const {
    builder,
    receiveTransition,
    objectRef,
    transmissionPlace,
    identifierTypes,
    variables,
    places,
  } = args;

  const receiverTransition = builder.addTransition({
    id: taskReceiveTransitionId(
      receiveTransition.taskId,
      receiveTransition.variantId,
    ),
    name: taskReceiveTransitionLabel(receiveTransition.taskName),
  });

  addOrdinaryArc({
    builder,
    source: transmissionPlace,
    target: receiverTransition,
    inscription: [
      caseTupleElement(identifierTypes, variables, false),
      objectTupleElement(identifierTypes, variables, objectRef.classId, false),
    ],
  });
  addParticipationReadArcs({
    builder,
    transition: receiverTransition,
    roleId: receiveTransition.receiverRoleId,
    places,
    identifierTypes,
    variables,
  });
  addObjectBindingReadArcs({
    builder,
    transition: receiverTransition,
    classId: objectRef.classId,
    places,
    identifierTypes,
    variables,
  });
  addTaskStateEffects({
    builder,
    context: args.context,
    transition: receiverTransition,
    taskTransition: receiveTransition,
    communicatedClassId: objectRef.classId,
    places,
    identifierTypes,
    variables,
  });
  for (const outgoingFlowId of receiveTransition.outgoingFlowIds) {
    addOrdinaryArc({
      builder,
      source: receiverTransition,
      target: controlFlowPlace(places, outgoingFlowId),
      inscription: [caseTupleElement(identifierTypes, variables, false)],
    });
  }
}

function addParticipationReadArcs(args: {
  builder: TypedPetriNetBuilder;
  transition: TypedTransition;
  roleId: string;
  places: CrossCasePlaceRegistry;
  identifierTypes: {
    caseType: TypedIdentifierType;
    roleTypeByRole: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    roleVariableByRole: Map<string, TypedVariable>;
  };
}): void {
  const roleType = requireMapValue(
    args.identifierTypes.roleTypeByRole,
    args.roleId,
    "role identifier type",
  );
  const roleVariable = requireMapValue(
    args.variables.roleVariableByRole,
    args.roleId,
    "role variable",
  );
  const participationPlace = requireMapValue(
    args.places.participationPlaceByRole,
    args.roleId,
    "participation place",
  );
  const inscription = [
    caseTupleElement(args.identifierTypes, args.variables, false),
    {
      typeId: roleType.id,
      variableId: roleVariable.id,
      isGenerated: false,
    },
  ];

  addOrdinaryArc({
    builder: args.builder,
    source: participationPlace,
    target: args.transition,
    inscription,
  });
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: participationPlace,
    inscription,
  });
}

function addTaskStateEffects(args: {
  builder: TypedPetriNetBuilder;
  context: CrossCasePetriNetMappingContext;
  transition: TypedTransition;
  taskTransition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" | "taskReceiveTransition" }
  >;
  communicatedClassId?: string;
  skipBindingClassIds?: Set<string>;
  places: CrossCasePlaceRegistry;
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
}): void {
  const effectClassIds = stateEffectClassIds(args.taskTransition);

  for (const classId of effectClassIds) {
    if (args.skipBindingClassIds?.has(classId)) {
      continue;
    }

    addObjectBindingReadArcs({
      builder: args.builder,
      transition: args.transition,
      classId,
      places: args.places,
      identifierTypes: args.identifierTypes,
      variables: args.variables,
    });
  }

  const writtenStateKeys = new Set(args.taskTransition.stateWrites.map(stateKey));

  for (const state of args.taskTransition.stateReads) {
    if (state.isVirtualInitial) {
      addInhibitorArc({
        builder: args.builder,
        source: existenceAwarenessPlace(args.places, state),
        target: args.transition,
        inscription: [
          roleTupleElementForState(args.identifierTypes, args.variables, state),
          objectTupleElement(
            args.identifierTypes,
            args.variables,
            state.classId,
            false,
          ),
        ],
      });
      continue;
    }

    addExistenceAwarenessReadArcs({
      builder: args.builder,
      transition: args.transition,
      roleId: state.roleId,
      classId: state.classId,
      places: args.places,
      identifierTypes: args.identifierTypes,
      variables: args.variables,
    });

    if (writtenStateKeys.has(stateKey(state))) {
      addStateAwarenessReadArcs({
        builder: args.builder,
        transition: args.transition,
        state,
        places: args.places,
        identifierTypes: args.identifierTypes,
        variables: args.variables,
      });
    } else {
      addStateAwarenessConsumeArc({
        builder: args.builder,
        transition: args.transition,
        state,
        places: args.places,
        identifierTypes: args.identifierTypes,
        variables: args.variables,
      });
    }
  }

  if (args.taskTransition.kind === "taskReceiveTransition") {
    for (const existence of args.taskTransition.existenceWrites) {
      addOrdinaryArc({
        builder: args.builder,
        source: args.transition,
        target: existenceAwarenessPlace(args.places, existence),
        inscription: [
          roleTupleElementForExistence(
            args.identifierTypes,
            args.variables,
            existence,
          ),
          objectTupleElement(
            args.identifierTypes,
            args.variables,
            existence.classId,
            false,
          ),
        ],
      });
    }
  }

  for (const state of args.taskTransition.stateWrites.filter(
    (state) => !state.isVirtualInitial,
  )) {
    addOrdinaryArc({
      builder: args.builder,
      source: args.transition,
      target: stateAwarenessPlace(args.places, state),
      inscription: [
        roleTupleElementForState(args.identifierTypes, args.variables, state),
        objectTupleElement(
          args.identifierTypes,
          args.variables,
          state.classId,
          false,
        ),
      ],
    });
  }
}

function addObjectBindingReadArcs(args: {
  builder: TypedPetriNetBuilder;
  transition: TypedTransition;
  classId: string;
  places: CrossCasePlaceRegistry;
  identifierTypes: {
    caseType: TypedIdentifierType;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    caseVariable: TypedVariable;
    objectVariableByClass: Map<string, TypedVariable>;
  };
}): void {
  const bindingPlace = requireMapValue(
    args.places.objectBindingPlaceByClass,
    args.classId,
    "object binding place",
  );
  const inscription = [
    caseTupleElement(args.identifierTypes, args.variables, false),
    objectTupleElement(
      args.identifierTypes,
      args.variables,
      args.classId,
      false,
    ),
  ];

  addOrdinaryArc({
    builder: args.builder,
    source: bindingPlace,
    target: args.transition,
    inscription,
  });
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: bindingPlace,
    inscription,
  });
}

function addInclusionReadArcs(args: {
  builder: TypedPetriNetBuilder;
  transition: TypedTransition;
  classId: string;
  places: CrossCasePlaceRegistry;
  identifierTypes: {
    caseType: TypedIdentifierType;
  };
  variables: {
    caseVariable: TypedVariable;
  };
}): void {
  const inclusionPlace = requireMapValue(
    args.places.inclusionPlaceByClass,
    args.classId,
    "inclusion place",
  );
  const inscription = [
    caseTupleElement(args.identifierTypes, args.variables, false),
  ];

  addOrdinaryArc({
    builder: args.builder,
    source: inclusionPlace,
    target: args.transition,
    inscription,
  });
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: inclusionPlace,
    inscription,
  });
}

function addRelationReadArcs(args: {
  builder: TypedPetriNetBuilder;
  transition: TypedTransition;
  association: Association;
  places: CrossCasePlaceRegistry;
  identifierTypes: {
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    objectVariableByClass: Map<string, TypedVariable>;
  };
}): void {
  const relationPlace = requireMapValue(
    args.places.relationPlaceByAssociation,
    args.association.id,
    "relation place",
  );
  const inscription = relationPlace.tupleType.map((typeId) =>
    relationTupleElementForTypeId({
      association: args.association,
      typeId,
      identifierTypes: args.identifierTypes,
      variables: args.variables,
    }),
  );

  addOrdinaryArc({
    builder: args.builder,
    source: relationPlace,
    target: args.transition,
    inscription,
  });
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: relationPlace,
    inscription,
  });
}

function relationTupleElementForTypeId(args: {
  association: Association;
  typeId: string;
  identifierTypes: {
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    objectVariableByClass: Map<string, TypedVariable>;
  };
}): TypedTupleElement {
  for (const end of args.association.ends) {
    const objectType = requireMapValue(
      args.identifierTypes.objectTypeByClass,
      end.classId,
      "object identifier type",
    );

    if (objectType.id !== args.typeId) {
      continue;
    }

    return objectTupleElement(
      args.identifierTypes,
      args.variables,
      end.classId,
      false,
    );
  }

  throw new Error(
    `Relation place for association ${args.association.id} references unknown object type ${args.typeId}`,
  );
}

function addExistenceAwarenessReadArcs(args: {
  builder: TypedPetriNetBuilder;
  transition: TypedTransition;
  roleId: string;
  classId: string;
  places: CrossCasePlaceRegistry;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
}): void {
  const inscription = [
    roleTupleElement(
      args.identifierTypes,
      args.variables,
      args.roleId,
      false,
    ),
    objectTupleElement(
      args.identifierTypes,
      args.variables,
      args.classId,
      false,
    ),
  ];

  addOrdinaryArc({
    builder: args.builder,
    source: existenceAwarenessPlace(args.places, {
      roleId: args.roleId,
      classId: args.classId,
    }),
    target: args.transition,
    inscription,
  });
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: existenceAwarenessPlace(args.places, {
      roleId: args.roleId,
      classId: args.classId,
    }),
    inscription,
  });
}

function addStateAwarenessReadArcs(args: {
  builder: TypedPetriNetBuilder;
  transition: TypedTransition;
  state: { roleId: string; classId: string; stateId: string };
  places: CrossCasePlaceRegistry;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
}): void {
  const inscription = [
    roleTupleElementForState(args.identifierTypes, args.variables, args.state),
    objectTupleElement(
      args.identifierTypes,
      args.variables,
      args.state.classId,
      false,
    ),
  ];
  const place = stateAwarenessPlace(args.places, args.state);

  addOrdinaryArc({
    builder: args.builder,
    source: place,
    target: args.transition,
    inscription,
  });
  addOrdinaryArc({
    builder: args.builder,
    source: args.transition,
    target: place,
    inscription,
  });
}

function addStateAwarenessConsumeArc(args: {
  builder: TypedPetriNetBuilder;
  transition: TypedTransition;
  state: { roleId: string; classId: string; stateId: string };
  places: CrossCasePlaceRegistry;
  identifierTypes: {
    roleTypeByRole: Map<string, TypedIdentifierType>;
    objectTypeByClass: Map<string, TypedIdentifierType>;
  };
  variables: {
    roleVariableByRole: Map<string, TypedVariable>;
    objectVariableByClass: Map<string, TypedVariable>;
  };
}): void {
  addOrdinaryArc({
    builder: args.builder,
    source: stateAwarenessPlace(args.places, args.state),
    target: args.transition,
    inscription: [
      roleTupleElementForState(args.identifierTypes, args.variables, args.state),
      objectTupleElement(
        args.identifierTypes,
        args.variables,
        args.state.classId,
        false,
      ),
    ],
  });
}

function controlFlowPlace(
  places: CrossCasePlaceRegistry,
  sequenceFlowId: string,
): TypedPlace {
  return requireMapValue(
    places.controlFlowPlaceBySequenceFlow,
    sequenceFlowId,
    "control-flow place",
  );
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

function caseTupleElement(
  identifierTypes: { caseType: TypedIdentifierType },
  variables: { caseVariable: TypedVariable },
  isGenerated: boolean,
): TypedTupleElement {
  return {
    typeId: identifierTypes.caseType.id,
    variableId: variables.caseVariable.id,
    isGenerated,
  };
}

function roleTupleElementForExistence(
  identifierTypes: { roleTypeByRole: Map<string, TypedIdentifierType> },
  variables: { roleVariableByRole: Map<string, TypedVariable> },
  reference: { roleId: string },
): TypedTupleElement {
  return roleTupleElement(identifierTypes, variables, reference.roleId, false);
}

function roleTupleElementForState(
  identifierTypes: { roleTypeByRole: Map<string, TypedIdentifierType> },
  variables: { roleVariableByRole: Map<string, TypedVariable> },
  reference: { roleId: string },
): TypedTupleElement {
  return roleTupleElement(identifierTypes, variables, reference.roleId, false);
}

function roleTupleElement(
  identifierTypes: { roleTypeByRole: Map<string, TypedIdentifierType> },
  variables: { roleVariableByRole: Map<string, TypedVariable> },
  roleId: string,
  isGenerated: boolean,
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
    isGenerated,
  };
}

function objectTupleElement(
  identifierTypes: { objectTypeByClass: Map<string, TypedIdentifierType> },
  variables: { objectVariableByClass: Map<string, TypedVariable> },
  classId: string,
  isGenerated: boolean,
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
    isGenerated,
  };
}

function addOrdinaryArc(args: {
  builder: TypedPetriNetBuilder;
  source: TypedPlace | TypedTransition;
  target: TypedPlace | TypedTransition;
  inscription: TypedTupleElement[];
}): void {
  const id = arcId(args.source.id, "to", args.target.id);
  if (args.builder.hasArc(typedPetriNetId("Arc", id))) {
    return;
  }

  args.builder.addOrdinaryArc({
    id,
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
  const id = arcId(args.source.id, "inhibits", args.target.id);
  if (args.builder.hasArc(typedPetriNetId("Arc", id))) {
    return;
  }

  args.builder.addInhibitorArc({
    id,
    sourceId: args.source.id,
    targetId: args.target.id,
    inscription: args.inscription,
  });
}

function stateEffectClassIds(
  transition: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" | "taskReceiveTransition" }
  >,
): Set<string> {
  return new Set(
    [
      ...transition.stateReads,
      ...transition.stateWrites,
      ...(transition.kind === "taskReceiveTransition"
        ? transition.existenceWrites
        : []),
    ].map((effect) => effect.classId),
  );
}

function mandatoryCrossCaseAssociationRequirements(
  context: CrossCasePetriNetMappingContext,
  classId: string,
): CrossCaseFirstBindingRequirement[] {
  return context.source.dataModel.associations
    .filter((association) =>
      association.ends.some((end) => end.classId === classId),
    )
    .filter((association) =>
      association.ends.every((end) => context.crossCaseClassIds.has(end.classId)),
    )
    .map((association) => {
      const relatedEnd = association.ends.find((end) => end.classId !== classId);

      if (!relatedEnd) {
        throw new Error(`Self-association ${association.id} is unsupported`);
      }

      return { association, relatedClassId: relatedEnd.classId, relatedEnd };
    })
    .filter(({ relatedEnd }) => relatedEnd.lower >= 1)
    .map(({ association, relatedClassId }) => ({
      association,
      relatedClassId,
    }))
    .sort((left, right) =>
      left.relatedClassId.localeCompare(right.relatedClassId) ||
      left.association.id.localeCompare(right.association.id),
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

function stateKey(reference: {
  roleId: string;
  classId: string;
  stateId: string;
}): string {
  return roleClassStateKey(
    reference.roleId,
    reference.classId,
    reference.stateId,
  );
}
