import { centerOf, sideAnchorWaypoints } from "../layout/geometry.js";
import type {
  TypedBounds,
  TypedPetriNet,
  TypedPoint,
} from "./typedPetriNetTypes.js";

export const NODE_WIDTH = 50;
export const NODE_HEIGHT = 50;
export const COLUMN_SPACING = 130;
export const ROW_SPACING = 110;
export const START_X = 0;
export const START_Y = 0;

const DEFAULT_COLUMNS = 3;

export interface TypedPetriNetLayout {
  nodeBoundsById: Map<string, TypedBounds>;
  edgeWaypointsByArcId: Map<string, TypedPoint[]>;
  labelBoundsByElementId: Map<string, TypedBounds>;
}

export interface TypedPetriNetLayoutOverrides {
  nodeBoundsById?: Record<string, TypedBounds>;
  edgeWaypointsByArcId?: Record<string, TypedPoint[]>;
  labelBoundsByElementId?: Record<string, TypedBounds>;
}

export function computeDefaultTypedPetriNetLayout(
  net: TypedPetriNet,
): TypedPetriNetLayout {
  return computeTypedPetriNetLayout(net);
}

export function computeTypedPetriNetLayout(
  net: TypedPetriNet,
  overrides: TypedPetriNetLayoutOverrides = {},
): TypedPetriNetLayout {
  const nodeBoundsById = new Map<string, TypedBounds>();
  const edgeWaypointsByArcId = new Map<string, TypedPoint[]>();
  const labelBoundsByElementId = new Map<string, TypedBounds>();
  const nodeEntries = [
    ...net.places.map((place) => ({
      id: place.id,
      name: place.name,
      includeLabel: true,
    })),
    ...net.transitions.map((transition) => ({
      id: transition.id,
      name: transition.name,
      includeLabel: false,
    })),
  ];

  nodeEntries.forEach((node, index) => {
    const bounds =
      overrides.nodeBoundsById?.[node.id] ?? defaultNodeBounds(index);
    nodeBoundsById.set(node.id, bounds);

    const labelBounds =
      overrides.labelBoundsByElementId?.[node.id] ??
      (node.includeLabel ? defaultNodeLabelBounds(bounds, node.name) : undefined);
    if (labelBounds) {
      labelBoundsByElementId.set(node.id, labelBounds);
    }
  });

  for (const arc of net.arcs) {
    const sourceBounds = nodeBoundsById.get(arc.sourceId);
    const targetBounds = nodeBoundsById.get(arc.targetId);

    if (!sourceBounds || !targetBounds) {
      throw new Error(`Cannot lay out typed Petri-net arc ${arc.id}`);
    }

    const waypoints =
      overrides.edgeWaypointsByArcId?.[arc.id] ??
      sideAnchorWaypoints(sourceBounds, targetBounds);
    edgeWaypointsByArcId.set(arc.id, waypoints);
    labelBoundsByElementId.set(
      arc.id,
      overrides.labelBoundsByElementId?.[arc.id] ??
        defaultArcLabelBounds(waypoints),
    );
  }

  return {
    nodeBoundsById,
    edgeWaypointsByArcId,
    labelBoundsByElementId,
  };
}

function defaultNodeBounds(index: number): TypedBounds {
  return {
    x: START_X + (index % DEFAULT_COLUMNS) * COLUMN_SPACING,
    y: START_Y + Math.floor(index / DEFAULT_COLUMNS) * ROW_SPACING,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  };
}

function defaultNodeLabelBounds(bounds: TypedBounds, label: string): TypedBounds {
  const width = Math.max(40, Math.min(180, label.length * 7));

  return {
    x: centerOf(bounds).x - width / 2,
    y: bounds.y + bounds.height + 7,
    width,
    height: 16,
  };
}

function defaultArcLabelBounds(waypoints: TypedPoint[]): TypedBounds {
  const [source, target] = waypoints;

  return {
    x: (source.x + target.x) / 2 - 10,
    y: (source.y + target.y) / 2 - 16,
    width: 20,
    height: 16,
  };
}
