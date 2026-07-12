import {
  ModdleArc,
  ModdleDefinitions,
  ModdleModel,
  ModdlePlace,
  ModdleTransition,
} from "pnml-moddle-converter";
import { sideAnchorWaypoints } from "../layout/geometry.js";
import { sanitizeId } from "./ids.js";

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ArcRef = {
  sourceId: string;
  targetId: string;
};

export type PlaceRef = {
  id: string;
  name: string;
  marking: number;
};

export type TransitionRef = {
  id: string;
  name: string;
};

export class PetriNetBuilder {
  private readonly places = new Map<string, ModdlePlace>();
  private readonly transitions = new Map<string, ModdleTransition>();
  private readonly arcs = new Map<string, ModdleArc>();

  addPlace(
    id: string,
    name = id,
    marking = 0,
    bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }
  ): ModdlePlace {
    const sanitizedId = sanitizeId(id);
    const existing = this.places.get(sanitizedId);

    if (existing) {
      return existing;
    }

    const place = new ModdlePlace({
      id: sanitizedId,
      name,
      marking,
      bounds,
    });
    this.places.set(sanitizedId, place);
    return place;
  }

  addTransition(
    id: string,
    name = id,
    isSilent = false,
    bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }
  ): ModdleTransition {
    const sanitizedId = sanitizeId(id);
    const existing = this.transitions.get(sanitizedId);

    if (existing) {
      return existing;
    }

    const transition = new ModdleTransition({
      id: sanitizedId,
      name,
      isSilent,
      bounds,
    });
    this.transitions.set(sanitizedId, transition);
    return transition;
  }

  addArc(sourceId: string, targetId: string): ModdleArc {
    const sanitizedSource = sanitizeId(sourceId);
    const sanitizedTarget = sanitizeId(targetId);
    const key = `${sanitizedSource}->${sanitizedTarget}`;
    const existing = this.arcs.get(key);

    if (existing) {
      return existing;
    }

    const sourceBounds = this.getBounds(sanitizedSource);
    const targetBounds = this.getBounds(sanitizedTarget);

    if (!sourceBounds) {
      throw new Error(
        `Cannot compute waypoints for arc ${key}: source ${sanitizedSource} has no bounds`
      );
    }

    if (!targetBounds) {
      throw new Error(
        `Cannot compute waypoints for arc ${key}: target ${sanitizedTarget} has no bounds`
      );
    }

    const arc = new ModdleArc({
      id: sanitizeId(`a_${sanitizedSource}_${sanitizedTarget}`),
      source: sanitizedSource,
      target: sanitizedTarget,
      waypoints: sideAnchorWaypoints(sourceBounds, targetBounds),
    });
    this.arcs.set(key, arc);
    return arc;
  }

  addArcIfAbsent(sourceId: string, targetId: string): ModdleArc {
    return this.addArc(sourceId, targetId);
  }

  removeTransition(id: string): void {
    this.transitions.delete(sanitizeId(id));
  }

  removeArcsIncidentTo(nodeId: string): void {
    const sanitizedNodeId = sanitizeId(nodeId);

    for (const [key, arc] of this.arcs.entries()) {
      if (arc.source === sanitizedNodeId || arc.target === sanitizedNodeId) {
        this.arcs.delete(key);
      }
    }
  }

  removeArc(sourceId: string, targetId: string): void {
    this.arcs.delete(`${sanitizeId(sourceId)}->${sanitizeId(targetId)}`);
  }

  hasTransition(id: string): boolean {
    return this.transitions.has(sanitizeId(id));
  }

  hasPlace(id: string): boolean {
    return this.places.has(sanitizeId(id));
  }

  hasArc(sourceId: string, targetId: string): boolean {
    return this.arcs.has(`${sanitizeId(sourceId)}->${sanitizeId(targetId)}`);
  }

  getIncomingArcs(nodeId: string): ArcRef[] {
    const sanitizedNodeId = sanitizeId(nodeId);

    return [...this.arcs.values()]
      .filter((arc) => arc.target === sanitizedNodeId)
      .map((arc) => ({
        sourceId: arc.source,
        targetId: arc.target,
      }));
  }

  getOutgoingArcs(nodeId: string): ArcRef[] {
    const sanitizedNodeId = sanitizeId(nodeId);

    return [...this.arcs.values()]
      .filter((arc) => arc.source === sanitizedNodeId)
      .map((arc) => ({
        sourceId: arc.source,
        targetId: arc.target,
      }));
  }

  getNodeBounds(id: string): Bounds | undefined {
    return this.getBounds(sanitizeId(id));
  }

  getPlaces(): PlaceRef[] {
    return [...this.places.values()].map((place) => ({
      id: place.id,
      name: place.name ?? place.id,
      marking: place.marking ?? 0,
    }));
  }

  getTransitions(): TransitionRef[] {
    return [...this.transitions.values()].map((transition) => ({
      id: transition.id,
      name: transition.name ?? transition.id,
    }));
  }

  getArcs(): ArcRef[] {
    return [...this.arcs.values()].map((arc) => ({
      sourceId: arc.source,
      targetId: arc.target,
    }));
  }

  toModdleDefinitions(): ModdleDefinitions {
    return new ModdleDefinitions({
      model: new ModdleModel({
        places: [...this.places.values()],
        transitions: [...this.transitions.values()],
        arcs: [...this.arcs.values()],
      }),
    });
  }

  private getBounds(id: string): Bounds | undefined {
    return this.places.get(id)?.bounds ?? this.transitions.get(id)?.bounds;
  }
}
