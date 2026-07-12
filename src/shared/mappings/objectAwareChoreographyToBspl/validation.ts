import type { Choreography, FlowNode } from "bpmn-moddle";
import {
  buildIncomingFlowsByNodeId,
  buildOutgoingFlowsByNodeId,
  determineGatewayDirection,
  getControlFlowNodes,
  getParallelGateways,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import { isBpmnType } from "../../source/objectAwareChoreography/choreography/bpmn.js";
import type {
  LifecycleModel,
  ObjectLifecycle,
} from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";

export function validateBsplMappingPreconditions(args: {
  choreography: Choreography;
  lifecycleModel: LifecycleModel;
}): void {
  validateAcyclicControlFlow(args.choreography);
  validateNoDirectCompletionAfterParallelJoin(args.choreography);
  validateAcyclicLifecycles(args.lifecycleModel);
  validateLocalTransitionTargetAttributes(args.lifecycleModel);
}

function validateAcyclicControlFlow(choreography: Choreography): void {
  const nodes = getControlFlowNodes(choreography).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const graph = new Map<string, string[]>();

  for (const node of nodes) {
    graph.set(
      node.id,
      (outgoingFlowsByNodeId.get(node.id) ?? [])
        .map((flow) => flow.targetRef)
        .filter((target): target is FlowNode => target !== undefined)
        .map((target) => target.id)
        .sort(),
    );
  }

  const cycle = findDirectedCycle(graph);

  if (cycle) {
    throw new Error(
      `BSPL mapping requires acyclic control-flow; found loop/cycle ${cycle.join(
        " -> ",
      )}`,
    );
  }
}

function validateNoDirectCompletionAfterParallelJoin(
  choreography: Choreography,
): void {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);

  for (const gateway of getParallelGateways(choreography).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];
    const direction = determineGatewayDirection(
      gateway,
      incomingFlows,
      outgoingFlows,
    );

    if (direction !== "join") {
      continue;
    }

    const directEndFlow = outgoingFlows.find((flow) =>
      isBpmnType(flow.targetRef, "bpmn:EndEvent"),
    );

    if (directEndFlow) {
      throw new Error(
        `BSPL mapping does not support direct completion after parallel join ${gateway.id}; outgoing flow ${directEndFlow.id} targets an end event directly.`,
      );
    }
  }
}

function validateAcyclicLifecycles(lifecycleModel: LifecycleModel): void {
  for (const lifecycle of [...lifecycleModel.lifecycles.values()].sort(
    (left, right) => left.classId.localeCompare(right.classId),
  )) {
    validateAcyclicLifecycle(lifecycle);
  }
}

function validateAcyclicLifecycle(lifecycle: ObjectLifecycle): void {
  const graph = new Map<string, string[]>();

  for (const state of lifecycle.states) {
    graph.set(state.id, []);
  }

  for (const transition of lifecycle.transitions) {
    graph.get(transition.source)?.push(transition.target);
  }

  for (const targets of graph.values()) {
    targets.sort();
  }

  const cycle = findDirectedCycle(graph);

  if (cycle) {
    throw new Error(
      `BSPL mapping requires acyclic lifecycle for class ${
        lifecycle.className
      }; found loop/cycle ${cycle.join(" -> ")}`,
    );
  }
}

function validateLocalTransitionTargetAttributes(
  lifecycleModel: LifecycleModel,
): void {
  for (const lifecycle of [...lifecycleModel.lifecycles.values()].sort(
    (left, right) => left.classId.localeCompare(right.classId),
  )) {
    const statesById = new Map(lifecycle.states.map((s) => [s.id, s] as const));

    for (const transition of lifecycle.transitions) {
      if (transition.actor === undefined) {
        continue;
      }

      const target = statesById.get(transition.target);

      if (!target) {
        continue;
      }

      if ((target.attributes ?? []).length === 0) {
        throw new Error(
          `BSPL mapping requires states reached by local transitions to declare at least one attribute for class ${lifecycle.className}; state ${target.name} (${target.id}) has no attribute specifications.`,
        );
      }
    }
  }
}

function findDirectedCycle(graph: Map<string, string[]>): string[] | undefined {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];

  function visit(nodeId: string): string[] | undefined {
    if (visiting.has(nodeId)) {
      return stack.slice(stack.indexOf(nodeId)).concat(nodeId);
    }

    if (visited.has(nodeId)) {
      return undefined;
    }

    visiting.add(nodeId);
    stack.push(nodeId);

    for (const targetId of graph.get(nodeId) ?? []) {
      const cycle = visit(targetId);

      if (cycle) {
        return cycle;
      }
    }

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);

    return undefined;
  }

  for (const nodeId of [...graph.keys()].sort()) {
    const cycle = visit(nodeId);

    if (cycle) {
      return cycle;
    }
  }

  return undefined;
}
