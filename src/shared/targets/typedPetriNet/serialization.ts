import type {
  IdentifierTypeId,
  TypedArc,
  TypedBounds,
  TypedPetriNet,
  TypedPoint,
  TypedToken,
  TypedTupleElement,
} from "./typedPetriNetTypes.js";
import {
  computeTypedPetriNetLayout,
  type TypedPetriNetLayoutOverrides,
} from "./layout.js";

const TPN_NAMESPACE = "http://bpt-lab.org/schemas/tpn";
const TPN_DI_NAMESPACE = "http://bpt-lab.org/schemas/tpnDi";
const DC_NAMESPACE = "https://www.omg.org/spec/BPMN/20100501/DC.xsd";

export interface TypedPetriNetSerializationOptions {
  layout?: TypedPetriNetLayoutOverrides;
}

export function serializeTypedPetriNet(
  net: TypedPetriNet,
  options: TypedPetriNetSerializationOptions = {},
): string {
  validateTypedPetriNet(net);

  const modelElements = [
    ...net.places.map((place) => {
      const attributes = [
        attr("id", place.id),
        attr("name", place.name),
        attr("color", place.tupleType.join(" ")),
        attr("type", "tpn:Place"),
      ].join(" ");
      const tokens = place.initialTokens
        .map((token, index) => serializeToken(place.id, index, token))
        .join("");

      return tokens.length > 0
        ? `<tpn:place ${attributes}>${tokens}</tpn:place>`
        : `<tpn:place ${attributes} />`;
    }),
    ...net.transitions.map((transition) => {
      const attributes = [
        attr("id", transition.id),
        attr("name", transition.name),
        attr("type", "tpn:Transition"),
      ].join(" ");

      return `<tpn:transition ${attributes} />`;
    }),
    ...net.arcs.map(serializeArc),
    ...net.identifierTypes.map((identifierType) => {
      const attributes = [
        attr("id", identifierType.id),
        attr("name", identifierType.name),
        attr("alias", identifierType.alias),
        attr("valueType", identifierType.valueType),
      ].join(" ");

      return `<tpn:dataClass ${attributes} />`;
    }),
  ].join("");
  const diagram = serializeDiagram(net, options);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<tpn:definitions xmlns:tpn="${TPN_NAMESPACE}" xmlns:tpnDi="${TPN_DI_NAMESPACE}" xmlns:dc="${DC_NAMESPACE}">`,
    `<tpn:model ${attr("id", net.id)} ${attr("name", net.name)}>${modelElements}</tpn:model>`,
    diagram,
    "</tpn:definitions>",
  ].join("");
}

function serializeArc(arc: TypedArc): string {
  const attributes = [
    attr("id", arc.id),
    attr("source", arc.sourceId),
    attr("target", arc.targetId),
    arc.kind === "inhibitor" ? attr("isInhibitorArc", "true") : undefined,
    arc.variableTypeId ? attr("variableType", arc.variableTypeId) : undefined,
    attr("type", "tpn:Arc"),
  ]
    .filter((attribute): attribute is string => attribute !== undefined)
    .join(" ");
  const inscription = serializeInscription(arc.id, arc.inscription);

  return `<tpn:arc ${attributes}>${inscription}</tpn:arc>`;
}

function serializeInscription(
  arcId: string,
  inscription: TypedTupleElement[],
): string {
  const elements = inscription
    .map((element, index) => {
      const attributes = [
        attr("id", `${arcId}_inscriptionElement_${index + 1}`),
        attr("dataClass", element.typeId),
        attr("variableName", element.variableId),
        attr("isGenerated", String(element.isGenerated)),
      ].join(" ");

      return `<tpn:inscriptionElement ${attributes} />`;
    })
    .join("");

  return `<tpn:inscription ${attr("id", `${arcId}_inscription`)}>${elements}</tpn:inscription>`;
}

function serializeToken(placeId: string, tokenIndex: number, token: TypedToken): string {
  const values = token
    .map((tokenValue, valueIndex) => {
      const attributes = [
        attr("id", `${placeId}_token_${tokenIndex + 1}_value_${valueIndex + 1}`),
        attr("dataClass", tokenValue.typeId),
        attr("value", tokenValue.value),
      ].join(" ");

      return `<tpn:tokenValue ${attributes} />`;
    })
    .join("");

  return `<tpn:token ${attr("id", `${placeId}_token_${tokenIndex + 1}`)}>${values}</tpn:token>`;
}

function serializeDiagram(
  net: TypedPetriNet,
  options: TypedPetriNetSerializationOptions,
): string {
  const layout = computeTypedPetriNetLayout(net, options.layout);
  const shapes = [
    ...net.places.map((place) =>
      serializeShape({
        elementId: place.id,
        bounds: layout.nodeBoundsById.get(place.id),
        labelBounds: layout.labelBoundsByElementId.get(place.id),
        includeLabel: true,
      }),
    ),
    ...net.transitions.map((transition) =>
      serializeShape({
        elementId: transition.id,
        bounds: layout.nodeBoundsById.get(transition.id),
        labelBounds: layout.labelBoundsByElementId.get(transition.id),
        includeLabel: false,
      }),
    ),
  ].join("");
  const edges = net.arcs
    .map((arc) =>
      serializeEdge({
        arcId: arc.id,
        waypoints: layout.edgeWaypointsByArcId.get(arc.id) ?? [],
        labelBounds: layout.labelBoundsByElementId.get(arc.id),
      }),
    )
    .join("");

  return [
    `<tpnDi:diagram ${attr("id", `${net.id}_di`)}>`,
    `<tpnDi:plane ${attr("id", `${net.id}_plane`)} ${attr("modelElement", net.id)}>`,
    shapes,
    edges,
    "</tpnDi:plane>",
    "</tpnDi:diagram>",
  ].join("");
}

function serializeShape(args: {
  elementId: string;
  bounds: TypedBounds | undefined;
  labelBounds: TypedBounds | undefined;
  includeLabel: boolean;
}): string {
  if (!args.bounds) {
    throw new Error(`Missing diagram bounds for typed Petri-net node ${args.elementId}`);
  }

  const label =
    args.includeLabel && args.labelBounds
      ? `<tpnDi:diagramLabel>${serializeBounds(args.labelBounds)}</tpnDi:diagramLabel>`
      : "";

  return [
    `<tpnDi:diagramShape ${attr("id", `${args.elementId}_di`)} ${attr("modelElement", args.elementId)}>`,
    serializeBounds(args.bounds),
    label,
    "</tpnDi:diagramShape>",
  ].join("");
}

function serializeEdge(args: {
  arcId: string;
  waypoints: TypedPoint[];
  labelBounds: TypedBounds | undefined;
}): string {
  if (args.waypoints.length < 2) {
    throw new Error(
      `Typed Petri-net diagram edge ${args.arcId} must have at least two waypoints`,
    );
  }

  const waypoints = args.waypoints.map(serializeWaypoint).join("");
  const label = args.labelBounds
    ? `<tpnDi:diagramLabel>${serializeBounds(args.labelBounds)}</tpnDi:diagramLabel>`
    : "";

  return [
    `<tpnDi:diagramEdge ${attr("id", `${args.arcId}_di`)} ${attr("modelElement", args.arcId)}>`,
    waypoints,
    label,
    "</tpnDi:diagramEdge>",
  ].join("");
}

function serializeBounds(bounds: TypedBounds): string {
  return `<dc:Bounds ${attrNumber("x", bounds.x)} ${attrNumber("y", bounds.y)} ${attrNumber("width", bounds.width)} ${attrNumber("height", bounds.height)} />`;
}

function serializeWaypoint(point: TypedPoint): string {
  return `<tpnDi:waypoint ${attrNumber("x", point.x)} ${attrNumber("y", point.y)} />`;
}

function validateTypedPetriNet(net: TypedPetriNet): void {
  const typeIds = new Set(net.identifierTypes.map((type) => type.id));
  const variableTypeById = new Map(
    net.variables.map((variable) => [variable.id, variable.typeId]),
  );
  const placeIds = new Set(net.places.map((place) => place.id));
  const transitionIds = new Set(net.transitions.map((transition) => transition.id));

  for (const place of net.places) {
    for (const typeId of place.tupleType) {
      requireType(typeIds, typeId);
    }

    for (const token of place.initialTokens) {
      if (token.length !== place.tupleType.length) {
        throw new Error(
          `Typed place ${place.id} has a token with arity ${token.length}, expected ${place.tupleType.length}`,
        );
      }
    }
  }

  for (const arc of net.arcs) {
    if (!placeIds.has(arc.sourceId) && !transitionIds.has(arc.sourceId)) {
      throw new Error(`Typed arc ${arc.id} has unknown source ${arc.sourceId}`);
    }

    if (!placeIds.has(arc.targetId) && !transitionIds.has(arc.targetId)) {
      throw new Error(`Typed arc ${arc.id} has unknown target ${arc.targetId}`);
    }

    if (arc.kind === "inhibitor") {
      if (!placeIds.has(arc.sourceId) || !transitionIds.has(arc.targetId)) {
        throw new Error(
          `Typed inhibitor arc ${arc.id} must connect a place to a transition`,
        );
      }
    }

    if (arc.variableTypeId) {
      requireType(typeIds, arc.variableTypeId);
    }

    for (const element of arc.inscription) {
      requireType(typeIds, element.typeId);
      const variableTypeId = variableTypeById.get(element.variableId);

      if (!variableTypeId) {
        throw new Error(
          `Typed arc ${arc.id} references unknown variable ${element.variableId}`,
        );
      }

      if (variableTypeId !== element.typeId) {
        throw new Error(
          `Typed arc ${arc.id} references variable ${element.variableId} with type ${variableTypeId}, expected ${element.typeId}`,
        );
      }
    }
  }
}

function requireType(typeIds: Set<IdentifierTypeId>, typeId: IdentifierTypeId): void {
  if (!typeIds.has(typeId)) {
    throw new Error(`Unknown typed Petri-net identifier type ${typeId}`);
  }
}

function attr(name: string, value: string): string {
  return `${name}="${escapeXmlAttribute(value)}"`;
}

function attrNumber(name: string, value: number): string {
  return attr(name, String(value));
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
