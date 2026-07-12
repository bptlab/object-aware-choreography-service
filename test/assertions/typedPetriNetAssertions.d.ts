import type { TypedBounds, TypedArc, TypedPetriNet, TypedPoint, TypedPlace, TypedTransition } from "../../src/shared/targets/typedPetriNet/index.js";
export declare function expectWellFormedTypedPetriNet(net: TypedPetriNet): void;
export declare function requireTypedIdentifierType(net: TypedPetriNet, id: string): void;
export declare function requireTypedPlace(net: TypedPetriNet, id: string): TypedPlace;
export declare function requireTypedTransition(net: TypedPetriNet, id: string): TypedTransition;
export declare function requireTypedArc(net: TypedPetriNet, id: string): TypedArc;
export declare function typedPlaceId(rawId: string): string;
export declare function typedTransitionId(rawId: string): string;
export interface TypedDiagramShapeAssertion {
    id: string;
    modelElement: string;
    bounds: TypedBounds;
}
export interface TypedDiagramEdgeAssertion {
    id: string;
    modelElement: string;
    waypoints: TypedPoint[];
}
export declare function getTypedDiagramShapesByModelElement(serialized: string): Map<string, TypedDiagramShapeAssertion>;
export declare function getTypedDiagramEdgesByModelElement(serialized: string): Map<string, TypedDiagramEdgeAssertion>;
