import {
  fireTransition,
  getEnabledTransitions,
  markingKey,
  type AnalysisPetriNet,
  type Marking,
} from "../../targets/petriNet/firing.js";

export interface BehaviorStateSpaceNode {
  id: number;
  marking: Marking;
  markingKey: string;
  predecessorId?: number;
  firedTransitionId?: string;
}

export interface BehaviorStateSpaceEdge {
  from: string;
  to: string;
  sourceId: number;
  targetId: number;
  transitionId: string;
}

export interface BehaviorStateSpace {
  nodes: BehaviorStateSpaceNode[];
  edges: BehaviorStateSpaceEdge[];
  nodeByMarkingKey: Map<string, BehaviorStateSpaceNode>;
  nodeById: Map<number, BehaviorStateSpaceNode>;
}

export function generateBehaviorStateSpace(args: {
  net: AnalysisPetriNet;
  maxMarkings?: number;
}): BehaviorStateSpace {
  const {
    net,
    maxMarkings = 100000,
  } = args;
  const initialNode: BehaviorStateSpaceNode = {
    id: 0,
    marking: net.initialMarking,
    markingKey: markingKey(net.initialMarking),
  };
  const stateSpace: BehaviorStateSpace = {
    nodes: [initialNode],
    edges: [],
    nodeByMarkingKey: new Map([[initialNode.markingKey, initialNode]]),
    nodeById: new Map([[initialNode.id, initialNode]]),
  };
  const queue: BehaviorStateSpaceNode[] = [initialNode];

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
            `Object-aware anomaly-analysis state-space generation exceeded maximum of ${maxMarkings} reachable markings`,
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
        stateSpace.nodeById.set(targetNode.id, targetNode);
        queue.push(targetNode);
      }

      stateSpace.edges.push({
        from: current.markingKey,
        to: targetNode.markingKey,
        sourceId: current.id,
        targetId: targetNode.id,
        transitionId,
      });
    }
  }

  return stateSpace;
}
