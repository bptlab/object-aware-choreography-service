import type { ObjectLifecycle } from "./lifecycleTypes.js";

export function getCompatibleReceiverStates(
  lifecycle: ObjectLifecycle,
  receiverRole: string,
  communicatedStateId: string
): string[] {
  if (!lifecycle.states.some((state) => state.id === communicatedStateId)) {
    throw new Error(
      `Cannot compute receiver compatibility for unknown state ${lifecycle.className}.${communicatedStateId}`
    );
  }

  return lifecycle.states
    .filter((state) =>
      hasAllowedNonEmptyPath(
        lifecycle,
        receiverRole,
        state.id,
        communicatedStateId
      )
    )
    .map((state) => state.id);
}

function hasAllowedNonEmptyPath(
  lifecycle: ObjectLifecycle,
  receiverRole: string,
  sourceStateId: string,
  targetStateId: string
): boolean {
  const visited = new Set<string>();
  const queue = [sourceStateId];

  while (queue.length > 0) {
    const currentStateId = queue.shift();

    if (currentStateId === undefined || visited.has(currentStateId)) {
      continue;
    }

    visited.add(currentStateId);

    for (const transition of lifecycle.transitions) {
      if (transition.source !== currentStateId) {
        continue;
      }

      if (transition.actor === receiverRole) {
        continue;
      }

      if (transition.target === targetStateId) {
        return true;
      }

      if (!visited.has(transition.target)) {
        queue.push(transition.target);
      }
    }
  }

  return false;
}
