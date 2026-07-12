import assert from "node:assert/strict";
import type {
  TypedBounds,
  TypedArc,
  TypedPetriNet,
  TypedPoint,
  TypedPlace,
  TypedTransition,
} from "../../src/shared/targets/typedPetriNet/index.js";

export function expectWellFormedTypedPetriNet(net: TypedPetriNet): void {
  assert.ok(
    net.places.length > 0 || net.transitions.length > 0,
    "Expected non-empty typed Petri net",
  );

  expectUniqueTypedIds(
    net.identifierTypes.map((identifierType) => identifierType.id),
    "identifier type",
  );
  expectUniqueTypedIds(
    net.variables.map((variable) => variable.id),
    "variable",
  );
  expectUniqueTypedIds(
    net.places.map((place) => place.id),
    "place",
  );
  expectUniqueTypedIds(
    net.transitions.map((transition) => transition.id),
    "transition",
  );
  expectUniqueTypedIds(
    net.arcs.map((arc) => arc.id),
    "arc",
  );

  const typeIds = new Set(net.identifierTypes.map((type) => type.id));
  const variableTypeById = new Map(
    net.variables.map((variable) => [variable.id, variable.typeId]),
  );
  const nodeIds = new Set([
    ...net.places.map((place) => place.id),
    ...net.transitions.map((transition) => transition.id),
  ]);

  for (const place of net.places) {
    for (const typeId of place.tupleType) {
      assert.ok(typeIds.has(typeId), `Place ${place.id} uses unknown type ${typeId}`);
    }

    for (const token of place.initialTokens) {
      assert.equal(
        token.length,
        place.tupleType.length,
        `Place ${place.id} has token with wrong arity`,
      );
    }
  }

  for (const arc of net.arcs) {
    assert.ok(nodeIds.has(arc.sourceId), `Arc ${arc.id} has unknown source`);
    assert.ok(nodeIds.has(arc.targetId), `Arc ${arc.id} has unknown target`);

    for (const element of arc.inscription) {
      assert.ok(
        typeIds.has(element.typeId),
        `Arc ${arc.id} uses unknown inscription type ${element.typeId}`,
      );
      assert.equal(
        variableTypeById.get(element.variableId),
        element.typeId,
        `Arc ${arc.id} variable ${element.variableId} has incompatible type`,
      );
    }
  }
}

export function requireTypedIdentifierType(
  net: TypedPetriNet,
  id: string,
): void {
  assert.ok(
    net.identifierTypes.some((identifierType) => identifierType.id === id),
    `Expected typed identifier type ${id}`,
  );
}

export function requireTypedPlace(
  net: TypedPetriNet,
  id: string,
): TypedPlace {
  const place = net.places.find((candidate) => candidate.id === id);

  assert.ok(place, `Expected typed place ${id}`);
  return place;
}

export function requireTypedTransition(
  net: TypedPetriNet,
  id: string,
): TypedTransition {
  const transition = net.transitions.find((candidate) => candidate.id === id);

  assert.ok(transition, `Expected typed transition ${id}`);
  return transition;
}

export function requireTypedArc(net: TypedPetriNet, id: string): TypedArc {
  const arc = net.arcs.find((candidate) => candidate.id === id);

  assert.ok(arc, `Expected typed arc ${id}`);
  return arc;
}

export function typedPlaceId(rawId: string): string {
  return `Place_${rawId.replace(/-/g, "_")}`;
}

export function typedTransitionId(rawId: string): string {
  return `Transition_${rawId.replace(/-/g, "_")}`;
}

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

export function getTypedDiagramShapesByModelElement(
  serialized: string,
): Map<string, TypedDiagramShapeAssertion> {
  return new Map(
    [...serialized.matchAll(
      /<tpnDi:diagramShape id="([^"]+)" modelElement="([^"]+)">([\s\S]*?)<\/tpnDi:diagramShape>/g,
    )].map((match) => [
      match[2],
      {
        id: match[1],
        modelElement: match[2],
        bounds: parseTypedBounds(match[3], `diagram shape ${match[1]}`),
      },
    ]),
  );
}

export function getTypedDiagramEdgesByModelElement(
  serialized: string,
): Map<string, TypedDiagramEdgeAssertion> {
  return new Map(
    [...serialized.matchAll(
      /<tpnDi:diagramEdge id="([^"]+)" modelElement="([^"]+)">([\s\S]*?)<\/tpnDi:diagramEdge>/g,
    )].map((match) => [
      match[2],
      {
        id: match[1],
        modelElement: match[2],
        waypoints: [...match[3].matchAll(
          /<tpnDi:waypoint x="(-?\d+(?:\.\d+)?)" y="(-?\d+(?:\.\d+)?)" \/>/g,
        )].map((waypointMatch) => ({
          x: Number(waypointMatch[1]),
          y: Number(waypointMatch[2]),
        })),
      },
    ]),
  );
}

function parseTypedBounds(serialized: string, context: string): TypedBounds {
  const match =
    /<dc:Bounds x="(-?\d+(?:\.\d+)?)" y="(-?\d+(?:\.\d+)?)" width="(-?\d+(?:\.\d+)?)" height="(-?\d+(?:\.\d+)?)" \/>/.exec(
      serialized,
    );

  assert.ok(match, `Expected ${context} to have dc:Bounds`);
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
  };
}

function expectUniqueTypedIds(ids: string[], elementKind: string): void {
  assert.equal(
    new Set(ids).size,
    ids.length,
    `Expected unique typed Petri-net ${elementKind} IDs`,
  );
}
