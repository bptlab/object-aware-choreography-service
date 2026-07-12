import { typedPetriNetId } from "./ids.js";
import type {
  IdentifierTypeId,
  TypedArc,
  TypedArcId,
  TypedFreshVariable,
  TypedIdentifierType,
  TypedPetriNet,
  TypedPlace,
  TypedPlaceId,
  TypedToken,
  TypedTransition,
  TypedTransitionId,
  TypedTupleElement,
  TypedVariable,
  TypedVariableId,
} from "./typedPetriNetTypes.js";

export class TypedPetriNetBuilder {
  private readonly identifierTypes = new Map<IdentifierTypeId, TypedIdentifierType>();
  private readonly variables = new Map<TypedVariableId, TypedVariable>();
  private readonly places = new Map<TypedPlaceId, TypedPlace>();
  private readonly transitions = new Map<TypedTransitionId, TypedTransition>();
  private readonly arcs = new Map<TypedArcId, TypedArc>();

  constructor(
    private readonly id = "model_1",
    private readonly name = "Model 1",
  ) {}

  addIdentifierType(args: {
    id: string;
    name?: string;
    alias?: string;
  }): TypedIdentifierType {
    const id = typedPetriNetId("DataClass", args.id);
    const existing = this.identifierTypes.get(id);

    if (existing) {
      throw new Error(`Duplicate typed Petri-net identifier type ${id}`);
    }

    const identifierType: TypedIdentifierType = {
      id,
      name: args.name ?? args.id,
      alias: args.alias ?? defaultAlias(args.name ?? args.id),
      valueType: "ID",
    };
    this.identifierTypes.set(id, identifierType);
    return identifierType;
  }

  addVariable(args: {
    id: string;
    typeId: IdentifierTypeId;
    name?: string;
  }): TypedVariable {
    this.requireIdentifierType(args.typeId);

    const id = sanitizeVariableId(args.id);
    const existing = this.variables.get(id);

    if (existing) {
      throw new Error(`Duplicate typed Petri-net variable ${id}`);
    }

    const variable: TypedVariable = {
      id,
      name: args.name ?? args.id,
      typeId: args.typeId,
    };
    this.variables.set(id, variable);
    return variable;
  }

  addPlace(args: {
    id: string;
    name?: string;
    tupleType: IdentifierTypeId[];
    initialTokens?: TypedToken[];
  }): TypedPlace {
    for (const typeId of args.tupleType) {
      this.requireIdentifierType(typeId);
    }

    for (const token of args.initialTokens ?? []) {
      this.validateToken(args.tupleType, token);
    }

    const id = typedPetriNetId("Place", args.id);
    const existing = this.places.get(id);

    if (existing) {
      throw new Error(`Duplicate typed Petri-net place ${id}`);
    }

    const place: TypedPlace = {
      id,
      name: args.name ?? args.id,
      tupleType: [...args.tupleType],
      initialTokens: (args.initialTokens ?? []).map((token) => [...token]),
    };
    this.places.set(id, place);
    return place;
  }

  addTransition(args: {
    id: string;
    name?: string;
    freshVariables?: TypedFreshVariable[];
  }): TypedTransition {
    for (const freshVariable of args.freshVariables ?? []) {
      this.requireIdentifierType(freshVariable.typeId);
      this.requireVariable(freshVariable.variableId, freshVariable.typeId);
    }

    const id = typedPetriNetId("Transition", args.id);
    const existing = this.transitions.get(id);

    if (existing) {
      throw new Error(`Duplicate typed Petri-net transition ${id}`);
    }

    const transition: TypedTransition = {
      id,
      name: args.name ?? args.id,
      freshVariables: (args.freshVariables ?? []).map((freshVariable) => ({
        ...freshVariable,
      })),
    };
    this.transitions.set(id, transition);
    return transition;
  }

  addOrdinaryArc(args: {
    id?: string;
    sourceId: TypedPlaceId | TypedTransitionId;
    targetId: TypedPlaceId | TypedTransitionId;
    inscription: TypedTupleElement[];
    variableTypeId?: IdentifierTypeId;
  }): TypedArc {
    return this.addArc({ ...args, kind: "ordinary" });
  }

  addInhibitorArc(args: {
    id?: string;
    sourceId: TypedPlaceId;
    targetId: TypedTransitionId;
    inscription: TypedTupleElement[];
    variableTypeId?: IdentifierTypeId;
  }): TypedArc {
    return this.addArc({ ...args, kind: "inhibitor" });
  }

  hasArc(id: TypedArcId): boolean {
    return this.arcs.has(id);
  }

  toTypedPetriNet(): TypedPetriNet {
    return {
      id: this.id,
      name: this.name,
      identifierTypes: [...this.identifierTypes.values()],
      variables: [...this.variables.values()],
      places: [...this.places.values()],
      transitions: [...this.transitions.values()],
      arcs: [...this.arcs.values()],
    };
  }

  private addArc(args: {
    id?: string;
    sourceId: TypedPlaceId | TypedTransitionId;
    targetId: TypedPlaceId | TypedTransitionId;
    kind: "ordinary" | "inhibitor";
    inscription: TypedTupleElement[];
    variableTypeId?: IdentifierTypeId;
  }): TypedArc {
    this.requireNode(args.sourceId);
    this.requireNode(args.targetId);

    if (args.variableTypeId) {
      this.requireIdentifierType(args.variableTypeId);
    }

    for (const element of args.inscription) {
      this.requireIdentifierType(element.typeId);
      this.requireVariable(element.variableId, element.typeId);
    }

    const id =
      args.id === undefined
        ? typedPetriNetId("Arc", `${args.sourceId}_to_${args.targetId}`)
        : typedPetriNetId("Arc", args.id);
    const existing = this.arcs.get(id);

    if (existing) {
      throw new Error(`Duplicate typed Petri-net arc ${id}`);
    }

    const arc: TypedArc = {
      id,
      sourceId: args.sourceId,
      targetId: args.targetId,
      kind: args.kind,
      inscription: args.inscription.map((element) => ({ ...element })),
      variableTypeId: args.variableTypeId,
    };
    this.arcs.set(id, arc);
    return arc;
  }

  private validateToken(tupleType: IdentifierTypeId[], token: TypedToken): void {
    if (token.length !== tupleType.length) {
      throw new Error(
        `Typed token arity ${token.length} does not match place tuple arity ${tupleType.length}`,
      );
    }

    token.forEach((value, index) => {
      if (value.typeId !== tupleType[index]) {
        throw new Error(
          `Typed token value at index ${index} has type ${value.typeId}, expected ${tupleType[index]}`,
        );
      }
    });
  }

  private requireIdentifierType(typeId: IdentifierTypeId): void {
    if (!this.identifierTypes.has(typeId)) {
      throw new Error(`Unknown typed Petri-net identifier type ${typeId}`);
    }
  }

  private requireVariable(variableId: TypedVariableId, typeId: IdentifierTypeId): void {
    const variable = this.variables.get(variableId);

    if (!variable) {
      throw new Error(`Unknown typed Petri-net variable ${variableId}`);
    }

    if (variable.typeId !== typeId) {
      throw new Error(
        `Typed Petri-net variable ${variableId} has type ${variable.typeId}, expected ${typeId}`,
      );
    }
  }

  private requireNode(id: TypedPlaceId | TypedTransitionId): void {
    if (!this.places.has(id) && !this.transitions.has(id)) {
      throw new Error(`Unknown typed Petri-net node ${id}`);
    }
  }
}

function sanitizeVariableId(id: string): string {
  return typedPetriNetId("Variable", id).replace(/^Variable_/, "");
}

function defaultAlias(name: string): string {
  const match = name.match(/[A-Za-z0-9]/);
  return match ? match[0].toUpperCase() : "I";
}
