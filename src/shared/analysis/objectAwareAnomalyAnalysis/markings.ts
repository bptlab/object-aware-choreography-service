import type {
  AnalysisPetriNet,
  Marking,
} from "../../targets/petriNet/firing.js";
import type { MarkedPlaceSummary } from "./objectAwareAnomalyTypes.js";

export function markingSummary(marking: Marking): Record<string, number> {
  return Object.fromEntries(
    [...marking.entries()]
      .filter(([, tokens]) => tokens > 0)
      .sort(([leftPlaceId], [rightPlaceId]) =>
        leftPlaceId.localeCompare(rightPlaceId),
      ),
  );
}

export function markedPlacesSummary(
  net: AnalysisPetriNet,
  marking: Marking,
): MarkedPlaceSummary[] {
  return [...marking.entries()]
    .filter(([, tokens]) => tokens > 0)
    .sort(([leftPlaceId], [rightPlaceId]) =>
      leftPlaceId.localeCompare(rightPlaceId),
    )
    .map(([placeId, tokens]) => ({
      placeId,
      placeLabel: net.placeLabels.get(placeId),
      tokens,
    }));
}
