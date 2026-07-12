import {
  fireTransition,
  getEnabledTransitions,
  markingKey,
  type AnalysisPetriNet,
  type Marking,
} from "./firing.js";

export interface StateSpaceNode {
  id: number;
  marking: Marking;
  markingKey: string;
  predecessorId?: number;
  firedTransitionId?: string;
}

export interface StateSpaceEdge {
  sourceId: number;
  targetId: number;
  transitionId: string;
}

export interface StateSpace {
  nodes: StateSpaceNode[];
  edges: StateSpaceEdge[];
  nodeByMarkingKey: Map<string, StateSpaceNode>;
}

export function generateStateSpace(args: {
  net: AnalysisPetriNet;
  maxMarkings?: number;
}): StateSpace {
  const { net, maxMarkings = 100000 } = args;
  const initialNode: StateSpaceNode = {
    id: 0,
    marking: net.initialMarking,
    markingKey: markingKey(net.initialMarking),
  };
  const stateSpace: StateSpace = {
    nodes: [initialNode],
    edges: [],
    nodeByMarkingKey: new Map([[initialNode.markingKey, initialNode]]),
  };
  const queue: StateSpaceNode[] = [initialNode];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    for (const transitionId of getEnabledTransitions(net, current.marking).sort()) {
      const nextMarking = fireTransition(net, current.marking, transitionId);
      const nextMarkingKey = markingKey(nextMarking);
      let targetNode = stateSpace.nodeByMarkingKey.get(nextMarkingKey);

      if (!targetNode) {
        if (stateSpace.nodes.length >= maxMarkings) {
          throw new Error(
            `State-space generation exceeded maximum of ${maxMarkings} reachable markings`,
          );
        }

        targetNode = {
          id: stateSpace.nodes.length,
          marking: nextMarking,
          markingKey: nextMarkingKey,
          predecessorId: current.id,
          firedTransitionId: transitionId,
        };
        stateSpace.nodes.push(targetNode);
        stateSpace.nodeByMarkingKey.set(nextMarkingKey, targetNode);
        queue.push(targetNode);
      }

      stateSpace.edges.push({
        sourceId: current.id,
        targetId: targetNode.id,
        transitionId,
      });
    }
  }

  return stateSpace;
}
