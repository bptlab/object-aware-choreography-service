export type IdentifierTypeId = string;
export type TypedVariableId = string;
export type TypedPlaceId = string;
export type TypedTransitionId = string;
export type TypedArcId = string;

export interface TypedIdentifierType {
  id: IdentifierTypeId;
  name: string;
  alias: string;
  valueType: "ID";
}

export interface TypedVariable {
  id: TypedVariableId;
  name: string;
  typeId: IdentifierTypeId;
}

export interface TypedTokenValue {
  typeId: IdentifierTypeId;
  value: string;
}

export type TypedToken = TypedTokenValue[];

export interface TypedPlace {
  id: TypedPlaceId;
  name: string;
  tupleType: IdentifierTypeId[];
  initialTokens: TypedToken[];
}

export interface TypedFreshVariable {
  variableId: TypedVariableId;
  typeId: IdentifierTypeId;
}

export interface TypedTransition {
  id: TypedTransitionId;
  name: string;
  freshVariables: TypedFreshVariable[];
}

export interface TypedTupleElement {
  typeId: IdentifierTypeId;
  variableId: TypedVariableId;
  isGenerated: boolean;
}

export interface TypedArc {
  id: TypedArcId;
  sourceId: TypedPlaceId | TypedTransitionId;
  targetId: TypedPlaceId | TypedTransitionId;
  kind: "ordinary" | "inhibitor";
  inscription: TypedTupleElement[];
  variableTypeId?: IdentifierTypeId;
}

export interface TypedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TypedPoint {
  x: number;
  y: number;
}

export interface TypedPetriNet {
  id: string;
  name: string;
  identifierTypes: TypedIdentifierType[];
  variables: TypedVariable[];
  places: TypedPlace[];
  transitions: TypedTransition[];
  arcs: TypedArc[];
}
