import { PetriNetBuilder } from "./petriNetBuilder.js";

export type Marking = Map<string, number>;

export interface AnalysisPetriNet {
  places: string[];
  transitions: string[];
  inputPlacesByTransition: Map<string, string[]>;
  outputPlacesByTransition: Map<string, string[]>;
  placeLabels: Map<string, string>;
  transitionLabels: Map<string, string>;
  initialMarking: Marking;
}

export function toAnalysisPetriNet(
  petriNet: PetriNetBuilder,
): AnalysisPetriNet {
  const places = petriNet
    .getPlaces()
    .map((place) => place.id)
    .sort();
  const transitions = petriNet
    .getTransitions()
    .map((transition) => transition.id)
    .sort();
  const placeIds = new Set(places);
  const transitionIds = new Set(transitions);
  const inputPlacesByTransition = new Map<string, string[]>(
    transitions.map((transitionId) => [transitionId, []]),
  );
  const outputPlacesByTransition = new Map<string, string[]>(
    transitions.map((transitionId) => [transitionId, []]),
  );

  for (const arc of petriNet.getArcs()) {
    if (placeIds.has(arc.sourceId) && transitionIds.has(arc.targetId)) {
      inputPlacesByTransition.get(arc.targetId)?.push(arc.sourceId);
    }

    if (transitionIds.has(arc.sourceId) && placeIds.has(arc.targetId)) {
      outputPlacesByTransition.get(arc.sourceId)?.push(arc.targetId);
    }
  }

  for (const inputPlaces of inputPlacesByTransition.values()) {
    inputPlaces.sort();
  }

  for (const outputPlaces of outputPlacesByTransition.values()) {
    outputPlaces.sort();
  }

  return {
    places,
    transitions,
    inputPlacesByTransition,
    outputPlacesByTransition,
    placeLabels: new Map(
      petriNet.getPlaces().map((place) => [place.id, place.name]),
    ),
    transitionLabels: new Map(
      petriNet
        .getTransitions()
        .map((transition) => [transition.id, transition.name]),
    ),
    initialMarking: new Map(
      petriNet
        .getPlaces()
        .filter((place) => place.marking > 0)
        .map((place) => [place.id, place.marking]),
    ),
  };
}

export function isEnabled(
  net: AnalysisPetriNet,
  marking: Marking,
  transitionId: string,
): boolean {
  const inputPlaces = net.inputPlacesByTransition.get(transitionId);

  if (!inputPlaces) {
    throw new Error(`Unknown Petri-net transition ${transitionId}`);
  }

  return inputPlaces.every((placeId) => (marking.get(placeId) ?? 0) > 0);
}

export function fireTransition(
  net: AnalysisPetriNet,
  marking: Marking,
  transitionId: string,
): Marking {
  if (!isEnabled(net, marking, transitionId)) {
    throw new Error(`Cannot fire disabled transition ${transitionId}`);
  }

  const next = cloneMarking(marking);

  for (const inputPlaceId of net.inputPlacesByTransition.get(transitionId) ?? []) {
    setTokenCount(next, inputPlaceId, (next.get(inputPlaceId) ?? 0) - 1);
  }

  for (const outputPlaceId of net.outputPlacesByTransition.get(transitionId) ?? []) {
    setTokenCount(next, outputPlaceId, (next.get(outputPlaceId) ?? 0) + 1);
  }

  return next;
}

export function getEnabledTransitions(
  net: AnalysisPetriNet,
  marking: Marking,
): string[] {
  return net.transitions.filter((transitionId) =>
    isEnabled(net, marking, transitionId),
  );
}

export function markingKey(marking: Marking): string {
  return [...marking.entries()]
    .filter(([, tokenCount]) => tokenCount > 0)
    .sort(([leftPlaceId], [rightPlaceId]) => leftPlaceId.localeCompare(rightPlaceId))
    .map(([placeId, tokenCount]) => `${placeId}:${tokenCount}`)
    .join("|");
}

export function cloneMarking(marking: Marking): Marking {
  return new Map(marking);
}

function setTokenCount(marking: Marking, placeId: string, tokenCount: number): void {
  if (tokenCount <= 0) {
    marking.delete(placeId);
    return;
  }

  marking.set(placeId, tokenCount);
}
