import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeProjectedChoreographySoundness } from "../../src/shared/analysis/projectedChoreographySoundness/index.js";
import type { BehaviorStateSpace } from "../../src/shared/analysis/objectAwareAnomalyAnalysis/stateSpace.js";
import { generateBehaviorStateSpace } from "../../src/shared/analysis/objectAwareAnomalyAnalysis/stateSpace.js";
import { buildPetriNetWithSemantics } from "../../src/shared/mappings/objectAwareChoreographyToPetriNet/buildPetriNet.js";
import type { PetriNetSemanticModel } from "../../src/shared/mappings/objectAwareChoreographyToPetriNet/petriNetArtifact.js";
import {
  markingKey,
  toAnalysisPetriNet,
  type AnalysisPetriNet,
  type Marking,
} from "../../src/shared/targets/petriNet/firing.js";
import { getChoreographyTasks } from "../../src/shared/source/objectAwareChoreography/choreography/choreography.js";
import { contextFromFixtures } from "../fixtures/contextFromFixtures.js";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../fixtures/fixtureIds.js";

describe("Projected choreography soundness spike", () => {
  it("PCS-01P generated linear no-object choreography passes all checks", async () => {
    const context = await contextFromFixtures({
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    });
    const artifact = buildPetriNetWithSemantics({
      choreography: context.choreography,
      dataModel: context.dataModel,
      lifecycleModel: context.lifecycleModel,
      objectReferences: context.objectReferences,
      taskNameIndex: context.taskNameIndex,
    });
    const net = toAnalysisPetriNet(artifact.petriNet);
    const stateSpace = generateBehaviorStateSpace({ net });
    const result = analyzeProjectedChoreographySoundness({
      net,
      stateSpace,
      taskIds: getChoreographyTasks(context.choreography).map((task) => task.id),
      semantics: artifact.semantics,
    });

    assert.equal(result.optionToComplete.holds, true);
    assert.equal(result.properInteractionCompletion.holds, true);
    assert.equal(result.taskCoverage.holds, true);
    assert.equal(result.holds, true);
  });

  it("PCS-02N reachable deadlock before sink violates option to complete", () => {
    const result = analyzeProjectedChoreographySoundness(
      syntheticAnalysis({
        nodes: [{ id: 0, marking: { p_cf_1: 1 } }],
        taskIds: [],
      }),
    );

    assert.equal(result.optionToComplete.holds, false);
    assert.equal(result.optionToComplete.violatingStateCount, 1);
    assert.equal(result.optionToComplete.representativeViolation, "0");
  });

  it("PCS-03N sink with residual control-flow token violates proper completion", () => {
    const result = analyzeProjectedChoreographySoundness(
      syntheticAnalysis({
        nodes: [{ id: 0, marking: { p_sink: 1, p_cf_1: 1 } }],
        taskIds: [],
      }),
    );

    assert.equal(result.properInteractionCompletion.holds, false);
    assert.equal(result.properInteractionCompletion.violatingStateCount, 1);
    assert.equal(
      result.properInteractionCompletion.representativeViolation,
      "0",
    );
  });

  it("PCS-04N sink with pending transmission token violates proper completion", () => {
    const result = analyzeProjectedChoreographySoundness(
      syntheticAnalysis({
        nodes: [{ id: 0, marking: { p_sink: 1, p_trans_task_a: 1 } }],
        transmissionTaskIds: ["task_a"],
        taskIds: [],
      }),
    );

    assert.equal(result.properInteractionCompletion.holds, false);
    assert.equal(result.properInteractionCompletion.violatingStateCount, 1);
  });

  it("PCS-05N sink with two tokens violates proper completion", () => {
    const result = analyzeProjectedChoreographySoundness(
      syntheticAnalysis({
        nodes: [{ id: 0, marking: { p_sink: 2 } }],
        taskIds: [],
      }),
    );

    assert.equal(result.properInteractionCompletion.holds, false);
    assert.equal(result.properInteractionCompletion.violatingStateCount, 1);
  });

  it("PCS-06P sink with only object-state tokens is properly complete", () => {
    const result = analyzeProjectedChoreographySoundness(
      syntheticAnalysis({
        nodes: [{ id: 0, marking: { p_sink: 1, p_state_role_a_class_a_x: 1 } }],
        taskIds: [],
      }),
    );

    assert.equal(result.properInteractionCompletion.holds, true);
    assert.equal(result.properInteractionCompletion.violatingStateCount, 0);
  });

  it("PCS-07N initiated object-aware task without receiver completion is uncovered", () => {
    const result = analyzeProjectedChoreographySoundness(
      syntheticAnalysis({
        nodes: [
          { id: 0, marking: { p_cf_1: 1 } },
          { id: 1, marking: { p_trans_task_a: 1 } },
        ],
        edges: [{ sourceId: 0, targetId: 1, transitionId: "t_send_task_a" }],
        transmissionTaskIds: ["task_a"],
        taskIds: ["task_a"],
        taskReceiveTransitions: [{ taskId: "task_a", transitionId: "t_recv_task_a" }],
        extraTransitionIds: ["t_send_task_a"],
      }),
    );

    assert.equal(result.taskCoverage.holds, false);
    assert.deepEqual(result.taskCoverage.uncoveredTaskIds, ["task_a"]);
  });

  it("PCS-08P non-object-aware task coverage uses the atomic task transition", () => {
    const result = analyzeProjectedChoreographySoundness(
      syntheticAnalysis({
        nodes: [
          { id: 0, marking: { p_cf_1: 1 } },
          { id: 1, marking: { p_sink: 1 } },
        ],
        edges: [{ sourceId: 0, targetId: 1, transitionId: "t_task_a" }],
        taskIds: ["task_a"],
        atomicTaskTransitions: [{ taskId: "task_a", transitionId: "t_task_a" }],
      }),
    );

    assert.equal(result.taskCoverage.holds, true);
    assert.equal(result.taskCoverage.coveredTaskCount, 1);
    assert.equal(result.taskCoverage.totalTaskCount, 1);
  });

  it("PCS-09P one reachable receiver variant covers the original task", () => {
    const result = analyzeProjectedChoreographySoundness(
      syntheticAnalysis({
        nodes: [
          { id: 0, marking: { p_trans_task_a: 1 } },
          { id: 1, marking: { p_sink: 1 } },
        ],
        edges: [{ sourceId: 0, targetId: 1, transitionId: "t_recv_task_a_x" }],
        transmissionTaskIds: ["task_a"],
        taskIds: ["task_a"],
        taskReceiveTransitions: [
          { taskId: "task_a", transitionId: "t_recv_task_a_x" },
          { taskId: "task_a", transitionId: "t_recv_task_a_y" },
        ],
      }),
    );

    assert.equal(result.taskCoverage.holds, true);
    assert.deepEqual(result.taskCoverage.uncoveredTaskIds, []);
  });

  it("PCS-10N missing completion descriptor keeps original task uncovered", () => {
    const result = analyzeProjectedChoreographySoundness(
      syntheticAnalysis({
        nodes: [{ id: 0, marking: { p_sink: 1 } }],
        taskIds: ["task_without_descriptor"],
      }),
    );

    assert.equal(result.taskCoverage.holds, false);
    assert.deepEqual(result.taskCoverage.uncoveredTaskIds, [
      "task_without_descriptor",
    ]);
  });
});

function syntheticAnalysis(args: {
  nodes: Array<{ id: number; marking: Record<string, number> }>;
  edges?: Array<{ sourceId: number; targetId: number; transitionId: string }>;
  taskIds: string[];
  transmissionTaskIds?: string[];
  taskReceiveTransitions?: Array<{ taskId: string; transitionId: string }>;
  atomicTaskTransitions?: Array<{ taskId: string; transitionId: string }>;
  extraTransitionIds?: string[];
}): {
  net: AnalysisPetriNet;
  stateSpace: BehaviorStateSpace;
  taskIds: string[];
  semantics: PetriNetSemanticModel;
} {
  const controlFlowPlaceIds = ["p_cf_1", "p_cf_2"];
  const transmissionPlaceIds = (args.transmissionTaskIds ?? []).map(
    (taskId) => `p_trans_${taskId}`,
  );
  const dataPlaceIds = ["p_state_role_a_class_a_x"];
  const places = [
    "p_sink",
    ...controlFlowPlaceIds,
    ...transmissionPlaceIds,
    ...dataPlaceIds,
  ].sort();
  const transitionIds = [
    ...(args.edges ?? []).map((edge) => edge.transitionId),
    ...(args.taskReceiveTransitions ?? []).map(
      (transition) => transition.transitionId,
    ),
    ...(args.atomicTaskTransitions ?? []).map(
      (transition) => transition.transitionId,
    ),
    ...(args.extraTransitionIds ?? []),
  ].sort();
  const nodes = args.nodes.map((node) => ({
    id: node.id,
    marking: markingFromRecord(node.marking),
    markingKey: markingKey(markingFromRecord(node.marking)),
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const stateSpace: BehaviorStateSpace = {
    nodes,
    edges: (args.edges ?? []).map((edge) => {
      const source = requiredNode(nodeById, edge.sourceId);
      const target = requiredNode(nodeById, edge.targetId);

      return {
        from: source.markingKey,
        to: target.markingKey,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        transitionId: edge.transitionId,
      };
    }),
    nodeByMarkingKey: new Map(nodes.map((node) => [node.markingKey, node])),
    nodeById,
  };

  return {
    net: {
      places,
      transitions: [...new Set(transitionIds)],
      inputPlacesByTransition: new Map(),
      outputPlacesByTransition: new Map(),
      placeLabels: new Map(places.map((placeId) => [placeId, placeId])),
      transitionLabels: new Map(
        transitionIds.map((transitionId) => [transitionId, transitionId]),
      ),
      initialMarking: nodes[0]?.marking ?? new Map(),
    },
    stateSpace,
    taskIds: args.taskIds,
    semantics: syntheticSemantics({
      controlFlowPlaceIds,
      transmissionTaskIds: args.transmissionTaskIds ?? [],
      taskReceiveTransitions: args.taskReceiveTransitions ?? [],
      atomicTaskTransitions: args.atomicTaskTransitions ?? [],
    }),
  };
}

function syntheticSemantics(args: {
  controlFlowPlaceIds: string[];
  transmissionTaskIds: string[];
  taskReceiveTransitions: Array<{ taskId: string; transitionId: string }>;
  atomicTaskTransitions: Array<{ taskId: string; transitionId: string }>;
}): PetriNetSemanticModel {
  return {
    places: {
      p_sink: { kind: "sinkPlace", isolatedPlaceId: "p_sink" },
      p_state_role_a_class_a_x: {
        kind: "stateAwarenessPlace",
        isolatedPlaceId: "p_state_role_a_class_a_x",
        roleId: "role_a",
        classId: "class_a",
        stateId: "x",
      },
      ...Object.fromEntries(
        args.controlFlowPlaceIds.map((placeId) => [
          placeId,
          {
            kind: "controlFlowPlace" as const,
            isolatedPlaceId: placeId,
            sequenceFlowId: placeId,
          },
        ]),
      ),
      ...Object.fromEntries(
        args.transmissionTaskIds.map((taskId) => [
          `p_trans_${taskId}`,
          {
            kind: "transmissionPlace" as const,
            isolatedPlaceId: `p_trans_${taskId}`,
            taskId,
            taskName: taskId,
          },
        ]),
      ),
    },
    transitions: {
      ...Object.fromEntries(
        args.taskReceiveTransitions.map(({ taskId, transitionId }) => [
          transitionId,
          {
            kind: "taskReceiveTransition" as const,
            isolatedTransitionId: transitionId,
            taskId,
            taskName: taskId,
            senderRoleId: "role_a",
            receiverRoleId: "role_b",
            outgoingFlowIds: [],
            stateReads: [],
            stateWrites: [],
            existenceWrites: [],
          },
        ]),
      ),
      ...Object.fromEntries(
        args.atomicTaskTransitions.map(({ taskId, transitionId }) => [
          transitionId,
          {
            kind: "atomicTaskTransition" as const,
            isolatedTransitionId: transitionId,
            taskId,
            taskName: taskId,
            senderRoleId: "role_a",
            receiverRoleId: "role_b",
            incomingFlowIds: [],
            outgoingFlowIds: [],
            stateReads: [],
            stateWrites: [],
          },
        ]),
      ),
    },
    arcs: {},
  };
}

function markingFromRecord(record: Record<string, number>): Marking {
  return new Map(
    Object.entries(record).filter(([, tokenCount]) => tokenCount > 0),
  );
}

function requiredNode(
  nodesById: Map<number, BehaviorStateSpace["nodes"][number]>,
  nodeId: number,
): BehaviorStateSpace["nodes"][number] {
  const node = nodesById.get(nodeId);

  if (!node) {
    throw new Error(`Missing synthetic state-space node ${nodeId}`);
  }

  return node;
}
