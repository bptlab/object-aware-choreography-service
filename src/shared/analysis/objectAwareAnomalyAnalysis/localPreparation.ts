import {
  fireTransition,
  getEnabledTransitions,
  markingKey,
  type AnalysisPetriNet,
  type Marking,
} from "../../targets/petriNet/firing.js";

export interface ObjectAwareAnalysisCaches {
  enabledTransitionsByMarkingKey: Map<string, string[]>;
  localPreparationByKey: Map<string, boolean>;
}

export function createObjectAwareAnalysisCaches(): ObjectAwareAnalysisCaches {
  return {
    enabledTransitionsByMarkingKey: new Map(),
    localPreparationByKey: new Map(),
  };
}

export function existsLocalPreparationToEnableAny(args: {
  net: AnalysisPetriNet;
  start: Marking;
  localTransitionIds: string[];
  targetTransitionIds: string[];
  maxMarkings?: number;
  caches?: ObjectAwareAnalysisCaches;
}): boolean {
  const {
    net,
    start,
    localTransitionIds,
    targetTransitionIds,
    maxMarkings = 10000,
    caches = createObjectAwareAnalysisCaches(),
  } = args;
  const localTransitionKey = stableSetKey(localTransitionIds);
  const targetTransitionKey = stableSetKey(targetTransitionIds);
  const cacheKey = `${markingKey(start)}::${localTransitionKey}::${targetTransitionKey}`;
  const cached = caches.localPreparationByKey.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const localTransitionSet = new Set(localTransitionIds);
  const targetTransitionSet = new Set(targetTransitionIds);
  const visited = new Set<string>();
  const queue: Marking[] = [start];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const currentKey = markingKey(current);

    if (visited.has(currentKey)) {
      continue;
    }

    visited.add(currentKey);

    if (visited.size > maxMarkings) {
      throw new Error(
        `Local object-aware preparation search exceeded maximum of ${maxMarkings} markings`,
      );
    }

    const enabledTransitions = getCachedEnabledTransitions(
      net,
      current,
      caches,
    );

    if (
      enabledTransitions.some((transitionId) =>
        targetTransitionSet.has(transitionId),
      )
    ) {
      caches.localPreparationByKey.set(cacheKey, true);
      return true;
    }

    for (const localTransitionId of enabledTransitions.filter((transitionId) =>
      localTransitionSet.has(transitionId),
    )) {
      queue.push(fireTransition(net, current, localTransitionId));
    }
  }

  caches.localPreparationByKey.set(cacheKey, false);
  return false;
}

function getCachedEnabledTransitions(
  net: AnalysisPetriNet,
  marking: Marking,
  caches: ObjectAwareAnalysisCaches,
): string[] {
  const key = markingKey(marking);
  const cached = caches.enabledTransitionsByMarkingKey.get(key);

  if (cached) {
    return cached;
  }

  const enabledTransitions = getEnabledTransitions(net, marking).sort();
  caches.enabledTransitionsByMarkingKey.set(key, enabledTransitions);
  return enabledTransitions;
}

function stableSetKey(values: string[]): string {
  return [...new Set(values)].sort().join(",");
}
