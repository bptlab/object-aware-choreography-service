import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareChoreographyAndBsplBehavior,
  compareTraceLanguages,
  computePetriNetSendLanguage,
  computeBsplMessageEmissionLanguage,
  type LanguageComparisonResult,
} from "../../../src/shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import { buildBspl } from "../../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import type { BsplProtocol } from "../../../src/shared/targets/bspl/bsplTypes.js";
import { PetriNetBuilder } from "../../../src/shared/targets/petriNet/petriNetBuilder.js";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../../fixtures/fixtureIds.js";
import {
  contextFromFixtures,
  type FixtureTriple,
  type NamedFixtureTriple,
} from "../../fixtures/contextFromFixtures.js";
import { allFixturesExist } from "../../fixtures/fixtureLoader.js";

describe("BSPL Behavior Comparison", () => {
  it("CPBC-01P compares trace languages with precision and recall", () => {
    const result = compareTraceLanguages(
      { traces: [["a", "b"]] },
      {
        traces: [
          ["a", "b"],
          ["b", "a"],
        ],
      }
    );

    assert.equal(result.recall, 1);
    assert.equal(result.precision, 0.5);
    assert.deepEqual(result.choreographyOnly, []);
    assert.deepEqual(result.protocolOnly, [["b", "a"]]);
    assert.deepEqual(result.shared, [["a", "b"]]);
  });

  it("CPBC-02P requires in parameters to be known by the sender role", () => {
    const protocol: BsplProtocol = {
      name: "role-local-in",
      roles: ["RoleA", "RoleB", "RoleC", "RoleD"],
      parameters: [
        { name: "x", adornment: "out", private: true },
        { name: "completed", adornment: "out" },
      ],
      messages: [
        {
          id: "m1",
          name: "m1",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "m1",
          parameters: [{ adornment: "out", name: "x" }],
        },
        {
          id: "m2",
          name: "m2",
          sender: "RoleC",
          receiver: "RoleD",
          taskId: "m2",
          parameters: [
            { adornment: "in", name: "x" },
            { adornment: "out", name: "completed" },
          ],
        },
      ],
    };

    const language = computeBsplMessageEmissionLanguage(protocol);

    assert.deepEqual(language.traces, [["m1"]]);
  });

  it("CPBC-03P lets the receiver learn emitted parameters", () => {
    const protocol: BsplProtocol = {
      name: "receiver-learning",
      roles: ["RoleA", "RoleB", "RoleC"],
      parameters: [
        { name: "x", adornment: "out", private: true },
        { name: "completed", adornment: "out" },
      ],
      messages: [
        {
          id: "m1",
          name: "m1",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "m1",
          parameters: [{ adornment: "out", name: "x" }],
        },
        {
          id: "m2",
          name: "m2",
          sender: "RoleB",
          receiver: "RoleC",
          taskId: "m2",
          parameters: [
            { adornment: "in", name: "x" },
            { adornment: "out", name: "completed" },
          ],
        },
      ],
    };

    const language = computeBsplMessageEmissionLanguage(protocol);

    assert.deepEqual(language.traces, [["m1", "m2"]]);
  });

  it("CPBC-04P enforces global single assignment for out parameters", () => {
    const protocol: BsplProtocol = {
      name: "single-assignment",
      roles: ["RoleA", "RoleB"],
      parameters: [
        { name: "x", adornment: "out", private: true },
        { name: "completed", adornment: "out" },
      ],
      messages: [
        {
          id: "m1",
          name: "m1",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "m1",
          parameters: [
            { adornment: "out", name: "x" },
            { adornment: "out", name: "completed" },
          ],
        },
        {
          id: "m2",
          name: "m2",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "m2",
          parameters: [
            { adornment: "out", name: "x" },
            { adornment: "out", name: "completed" },
          ],
        },
      ],
    };

    const language = computeBsplMessageEmissionLanguage(protocol);

    assert.deepEqual(language.traces, [["m1"], ["m2"]]);
  });

  it("CPBC-05P treats nil as globally unbound", () => {
    const protocol: BsplProtocol = {
      name: "global-nil",
      roles: ["RoleA", "RoleB"],
      parameters: [
        { name: "x", adornment: "out", private: true },
        { name: "completed", adornment: "out" },
      ],
      messages: [
        {
          id: "m1",
          name: "m1",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "m1",
          parameters: [{ adornment: "out", name: "x" }],
        },
        {
          id: "m2",
          name: "m2",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "m2",
          parameters: [
            { adornment: "nil", name: "x" },
            { adornment: "out", name: "completed" },
          ],
        },
      ],
    };

    const language = computeBsplMessageEmissionLanguage(protocol);

    assert.deepEqual(language.traces, [["m1"], ["m2"]]);
  });

  it("CPBC-06P stops BSPL message-emission traces once completed is bound", () => {
    const protocol: BsplProtocol = {
      name: "terminal-completion",
      roles: ["RoleA", "RoleB"],
      parameters: [
        { name: "completed", adornment: "out" },
        { name: "x", adornment: "out", private: true },
      ],
      messages: [
        {
          id: "finish",
          name: "finish",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "finish",
          parameters: [{ adornment: "out", name: "completed" }],
        },
        {
          id: "later",
          name: "later",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "later",
          parameters: [{ adornment: "out", name: "x" }],
        },
      ],
    };

    const language = computeBsplMessageEmissionLanguage(protocol);

    assert.deepEqual(language.traces, [["finish"], ["later", "finish"]]);
    assert.equal(
      language.traces.some(
        (trace) => trace.join("\u0000") === "finish\u0000later"
      ),
      false,
      "Expected no BSPL trace to continue after completed"
    );
  });

  it("CPBC-07P projects BSPL schema variants to originating task labels", () => {
    const protocol: BsplProtocol = {
      name: "variant-projection",
      roles: ["RoleA", "RoleB"],
      parameters: [
        { name: "case_id", adornment: "out", key: true },
        { name: "completed", adornment: "out" },
        { name: "x", adornment: "out", private: true },
        { name: "y", adornment: "out", private: true },
      ],
      messages: [
        {
          id: "task2_variant_a",
          name: "task2",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "Task_2",
          parameters: [
            { adornment: "out", name: "case_id" },
            { adornment: "out", name: "x" },
          ],
        },
        {
          id: "task2_variant_b",
          name: "task2",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "Task_2",
          parameters: [
            { adornment: "out", name: "case_id" },
            { adornment: "out", name: "y" },
          ],
        },
        {
          id: "task3_after_x",
          name: "task3",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "Task_3",
          parameters: [
            { adornment: "in", name: "x" },
            { adornment: "out", name: "completed" },
          ],
        },
        {
          id: "task3_after_y",
          name: "task3",
          sender: "RoleA",
          receiver: "RoleB",
          taskId: "Task_3",
          parameters: [
            { adornment: "in", name: "y" },
            { adornment: "out", name: "completed" },
          ],
        },
      ],
    };

    const language = computeBsplMessageEmissionLanguage(protocol);

    assert.deepEqual(language.traces, [["task2", "task3"]]);
  });

  it("CPBC-08P normalizes Petri-net visible task labels to BSPL message labels", () => {
    const petriNet = new PetriNetBuilder();
    petriNet.addPlace("p_source", "source", 1);
    petriNet.addPlace("p_sink", "sink", 0);
    petriNet.addTransition(
      "t_send_ChoreographyTask_1_ClassA_initial",
      "place order send"
    );
    petriNet.addArc("p_source", "t_send_ChoreographyTask_1_ClassA_initial");
    petriNet.addArc("t_send_ChoreographyTask_1_ClassA_initial", "p_sink");

    const language = computePetriNetSendLanguage(petriNet);

    assert.deepEqual(language.traces, [["place-order"]]);
  });

  scenario(
    "CPBC-09P no-object single task matches exactly",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      expectExactMatch(result, [["task1"]]);
    }
  );

  scenario(
    "CPBC-10P object-state sequence matches exactly",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      expectExactMatch(result, [["task1", "task2"]]);
    }
  );

  scenario(
    "CPBC-11P independent sequence preserves choreography behavior but admits relaxation",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      expectFullRecall(result);
      expectAdditionalProtocolBehavior(result);
    }
  );

  scenario(
    "CPBC-12P event-based decision preserves branch behavior",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      expectFullRecall(result);
      assert.ok(
        result.choreographyTraceCount >= 2,
        "Expected at least two choreography traces for the decision branches"
      );
      assert.ok(
        result.shared.some((trace) => trace.includes("task2")),
        "Expected a shared trace containing task2"
      );
      assert.ok(
        result.shared.some((trace) => trace.includes("task3")),
        "Expected a shared trace containing task3"
      );
    }
  );

  scenario(
    "CPBC-13P exclusive object-based decision preserves deterministic branches",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      expectFullRecall(result);
      expectAdditionalProtocolBehavior(result);
      expectNoTraceContinuesAfter(
        { traces: [...result.protocolOnly, ...result.shared] },
        ["task6"]
      );
      assert.ok(
        result.shared.some(
          (trace) =>
            trace.join("\u0000") === "task1\u0000task2\u0000task4\u0000task6"
        ),
        "Expected shared trace for the task2/task4 branch"
      );
      assert.ok(
        result.shared.some(
          (trace) =>
            trace.join("\u0000") === "task1\u0000task3\u0000task5\u0000task6"
        ),
        "Expected shared trace for the task3/task5 branch"
      );
      assert.ok(
        result.choreographyTraceCount === 2,
        "Expected exactly two choreography traces for the exclusive branches"
      );
    }
  );

  scenario(
    "CPBC-14P supported parallel behavior preserves all choreography traces",
    {
      choreography: Choreographies.c28ParallelGatewayCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      expectFullRecall(result);
      assert.equal(
        result.choreographyTraceCount,
        2,
        "Expected four choreography traces for the parallel interleavings"
      );
      assert.ok(
        result.protocolTraceCount >= result.choreographyTraceCount,
        "Expected the protocol to admit at least all choreography send traces"
      );
    }
  );
});

async function runScenario(
  fixtures: NamedFixtureTriple
): Promise<LanguageComparisonResult> {
  const context = await contextFromFixtures(fixtures);
  const { protocol } = buildBspl(context);

  return compareChoreographyAndBsplBehavior(context, protocol);
}

function expectExactMatch(
  result: LanguageComparisonResult,
  expectedShared?: string[][]
): void {
  assert.equal(result.recall, 1);
  assert.equal(result.precision, 1);
  assert.equal(result.choreographyTraceCount, result.protocolTraceCount);
  assert.deepEqual(result.choreographyOnly, []);
  assert.deepEqual(result.protocolOnly, []);

  if (expectedShared) {
    assert.deepEqual(result.shared, expectedShared);
  }
}

function expectFullRecall(result: LanguageComparisonResult): void {
  assert.equal(result.recall, 1);
  assert.deepEqual(result.choreographyOnly, []);
}

function expectAdditionalProtocolBehavior(
  result: LanguageComparisonResult
): void {
  assert.ok(
    result.precision < 1,
    `Expected precision below 1, got ${result.precision}`
  );
  assert.ok(result.protocolOnly.length > 0, "Expected protocol-only traces");
}

function expectNoTraceContinuesAfter(
  language: { traces: readonly (readonly string[])[] },
  terminalLabels: string[]
): void {
  for (const trace of language.traces) {
    const firstTerminalIndex = trace.findIndex((label) =>
      terminalLabels.includes(label)
    );

    if (firstTerminalIndex >= 0) {
      assert.deepEqual(
        trace.slice(firstTerminalIndex + 1),
        [],
        `Expected no events after terminal message in trace ${JSON.stringify(
          trace
        )}`
      );
    }
  }
}

function scenario(
  name: string,
  fixtures: FixtureTriple,
  run: (fixtures: NamedFixtureTriple) => Promise<void>
): void {
  if (!allFixturesExist(fixtures)) {
    throw new Error(`Missing fixtures for scenario "${name}"`);
  }

  it(name, () => run({ ...fixtures, scenarioName: name }));
}
