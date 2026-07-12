import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareChoreographyAndBsplBehavior,
  computeBsplMessageEmissionLanguage,
  type LanguageComparisonResult,
} from "../../../src/shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import { buildBspl } from "../../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import {
  discoverControlFlowConstraints,
  refineBsplWithControlFlowConstraints,
  type ControlFlowConstraint,
  type ControlFlowConstraintDiscoveryResult,
} from "../../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";
import type { BsplProtocol } from "../../../src/shared/targets/bspl/bsplTypes.js";
import { serializeBspl } from "../../../src/shared/targets/bspl/serialization.js";
import {
  createDisjunctivePrecedenceConstraint,
  createExclusionConstraint,
  createGuardInformationConstraint,
  createIndependentProtocol,
  createPrecedenceConstraint,
  expectNoTraceContainsBoth,
  expectNoExclusion,
  expectNoPrecedence,
  expectWellFormedProtocol,
  requireDisjunctivePrecedence,
  requireExclusion,
  requireGuardInformation,
  requireMessageParameter,
  requireMessages,
  requirePrecedence,
  requirePrivateParameter,
} from "../../assertions/bsplAssertions.js";
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
import { writeScenarioResult } from "../../../src/shared/testing/resultWriter.js";

describe("BSPL Refinement Fixtures", () => {
  it("PREF-01P encodes precedence constraints with a private control-flow parameter", () => {
    const protocol = createIndependentProtocol(["task1", "task2"]);
    const constraint = createPrecedenceConstraint("task1", "task2");
    const refined = refineBsplWithControlFlowConstraints(protocol, [
      constraint,
    ]);
    const refinedAgain = refineBsplWithControlFlowConstraints(refined, [
      constraint,
    ]);

    requirePrivateParameter(refined, "cf_prec_task1_before_task2");
    requireMessages(refined, { name: "task1" }).forEach((message) =>
      requireMessageParameter(message, {
        adornment: "out",
        name: "cf_prec_task1_before_task2",
      }),
    );
    requireMessages(refined, { name: "task2" }).forEach((message) =>
      requireMessageParameter(message, {
        adornment: "in",
        name: "cf_prec_task1_before_task2",
      }),
    );
    assert.deepEqual(refinedAgain, refined);
    assert.deepEqual(computeBsplMessageEmissionLanguage(refined).traces, [
      ["task1", "task2"],
    ]);
  });

  it("PREF-02P encodes exclusion constraints with one shared private parameter", () => {
    const protocol = createIndependentProtocol(["task2", "task3"]);
    const refined = refineBsplWithControlFlowConstraints(protocol, [
      createExclusionConstraint("task2", "task3"),
    ]);
    const traces = computeBsplMessageEmissionLanguage(refined).traces;

    requirePrivateParameter(refined, "cf_excl_task2_task3");
    for (const task of ["task2", "task3"]) {
      requireMessages(refined, { name: task }).forEach((message) =>
        requireMessageParameter(message, {
          adornment: "out",
          name: "cf_excl_task2_task3",
        }),
      );
    }
    expectNoTraceContainsBoth(traces, "task2", "task3");
  });

  it("PREF-03P replicates constrained variants for disjunctive precedence", () => {
    const protocol = createIndependentProtocol(["taskA", "taskB", "taskC"]);
    const refined = refineBsplWithControlFlowConstraints(protocol, [
      createDisjunctivePrecedenceConstraint(["taskA", "taskB"], "taskC"),
    ]);
    const taskCVariants = requireMessages(refined, { name: "taskC" });

    requirePrivateParameter(refined, "cf_prec_taska_before_taskc");
    requirePrivateParameter(refined, "cf_prec_taskb_before_taskc");
    requireMessages(refined, { name: "taskA" }).forEach((message) =>
      requireMessageParameter(message, {
        adornment: "out",
        name: "cf_prec_taska_before_taskc",
      }),
    );
    requireMessages(refined, { name: "taskB" }).forEach((message) =>
      requireMessageParameter(message, {
        adornment: "out",
        name: "cf_prec_taskb_before_taskc",
      }),
    );
    assert.equal(taskCVariants.length, 2);
    assert.ok(taskCVariants.every((message) => message.name === "taskC"));
    assert.ok(
      taskCVariants.some((message) =>
        message.parameters.some(
          (parameter) =>
            parameter.adornment === "in" &&
            parameter.name === "cf_prec_taska_before_taskc",
        ),
      ),
    );

    assert.ok(
      taskCVariants.some((message) =>
        message.parameters.some(
          (parameter) =>
            parameter.adornment === "in" &&
            parameter.name === "cf_prec_taskb_before_taskc",
        ),
      ),
    );
  });

  it("PREF-04P encodes guard-information constraints as in and nil parameters", () => {
    const protocol = createIndependentProtocol(["guardedTask"]);
    const refined = refineBsplWithControlFlowConstraints(protocol, [
      createGuardInformationConstraint("guardedTask", {
        requiredIn: ["attribute_classa_a-id", "attribute_classa_att1"],
        requiredNil: ["attribute_classa_att2"],
      }),
    ]);
    const [guardedMessage] = requireMessages(refined, { name: "guardedTask" });

    requirePrivateParameter(refined, "attribute_classa_a-id");
    requirePrivateParameter(refined, "attribute_classa_att1");
    requirePrivateParameter(refined, "attribute_classa_att2");
    requireMessageParameter(guardedMessage, {
      adornment: "in",
      name: "attribute_classa_a-id",
    });
    requireMessageParameter(guardedMessage, {
      adornment: "in",
      name: "attribute_classa_att1",
    });
    requireMessageParameter(guardedMessage, {
      adornment: "nil",
      name: "attribute_classa_att2",
    });
  });

  it("PREF-04aP encodes alternative guard-information signatures as message variants", () => {
    const protocol = createIndependentProtocol(["guardedTask"]);
    const refined = refineBsplWithControlFlowConstraints(protocol, [
      {
        kind: "guardInformation",
        id: "guardInformation:guardedTask",
        guardedTask: "guardedTask",
        objectClass: "ClassA",
        objectState: "a-x",
        requiredInAlternatives: [
          ["attribute_classa_a-id", "attribute_classa_att1"],
          ["attribute_classa_a-id", "state_classa_a-x"],
        ],
        requiredIn: [
          "attribute_classa_a-id",
          "attribute_classa_att1",
          "state_classa_a-x",
        ],
        requiredNil: ["attribute_classa_att2"],
        source: {
          reason: "guardedExclusiveSplit",
          explanation: "test constraint",
        },
        violatingTraces: [],
      },
    ]);
    const guardedMessages = requireMessages(refined, { name: "guardedTask" });

    assert.equal(guardedMessages.length, 2);
    requirePrivateParameter(refined, "attribute_classa_a-id");
    requirePrivateParameter(refined, "attribute_classa_att1");
    requirePrivateParameter(refined, "state_classa_a-x");
    requirePrivateParameter(refined, "attribute_classa_att2");
    assert.ok(
      guardedMessages.some((message) =>
        message.parameters.some(
          (parameter) =>
            parameter.adornment === "in" &&
            parameter.name === "attribute_classa_att1",
        ),
      ),
    );
    assert.ok(
      guardedMessages.some((message) =>
        message.parameters.some(
          (parameter) =>
            parameter.adornment === "in" &&
            parameter.name === "state_classa_a-x",
        ),
      ),
    );
    guardedMessages.forEach((message) =>
      requireMessageParameter(message, {
        adornment: "nil",
        name: "attribute_classa_att2",
      }),
    );
  });

  it("PREF-05N rejects constraints that reference unknown tasks", () => {
    assert.throws(
      () =>
        refineBsplWithControlFlowConstraints(
          createIndependentProtocol(["task1"]),
          [createPrecedenceConstraint("missing", "task1")],
        ),
      /unknown|task|message/i,
    );
  });

  scenario(
    "PREF-06P discovered sequence precedence improves precision",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const { discovery, refinedComparison } = await runScenario(fixtures);

      requirePrecedence(discovery, "task2", "task3");

      assert.equal(refinedComparison.recall, 1);
      assert.ok(
        refinedComparison.precision > discovery.comparison.precision,
        `Expected refined precision ${refinedComparison.precision} to exceed initial precision ${discovery.comparison.precision}`,
      );
      assert.equal(refinedComparison.precision, 1);
    },
  );

  scenario(
    "PREF-07P discovered exclusions remove event-based alternative co-occurrence",
    {
      choreography:
        Choreographies.c20EventBasedGatewayCommunicationTwoClassesCreate,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      const { refinedProtocol } = await runScenario(fixtures);
      const traces = computeBsplMessageEmissionLanguage(refinedProtocol).traces;

      expectNoTraceContainsBoth(traces, "task2", "task3");
    },
  );

  scenario(
    "PREF-08P discovered guard information is added to guarded tasks",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l19DecisionViaSynchronizedOrLocalTransition,
    },
    async (fixtures) => {
      const {
        discovery,
        selectedConstraints,
        refinedProtocol,
        refinedComparison,
      } = await runScenario(fixtures, selectGuardInformationConstraints);

      assert.ok(selectedConstraints.length > 0, "Expected guard constraints");
      assert.equal(refinedComparison.recall, 1);
      assert.ok(
        refinedComparison.precision > discovery.comparison.precision,
        `Expected guard-only precision ${refinedComparison.precision} to exceed initial precision ${discovery.comparison.precision}`,
      );
      assert.ok(
        refinedComparison.precision < 1,
        `Expected guard-only refinement to remain relaxed, got precision ${refinedComparison.precision}`,
      );
      for (const constraint of selectedConstraints) {
        assert.equal(constraint.kind, "guardInformation");
        for (const message of requireMessages(refinedProtocol, {
          name: constraint.guardedTask,
        })) {
          constraint.requiredIn.forEach((parameterName) =>
            requireMessageParameter(message, {
              adornment: "in",
              name: parameterName,
            }),
          );
          constraint.requiredNil.forEach((parameterName) =>
            requireMessageParameter(message, {
              adornment: "nil",
              name: parameterName,
            }),
          );
        }
      }
    },
  );

  scenario(
    "PREF-09P selected constraints improve precision without full reconstruction",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l19DecisionViaSynchronizedOrLocalTransition,
    },
    async (fixtures) => {
      const partial = await runScenario(
        {
          ...fixtures,
          scenarioName: `${fixtures.scenarioName} partial`,
        },
        selectGuardInformationConstraints,
      );
      const full = await runScenario({
        ...fixtures,
        scenarioName: `${fixtures.scenarioName} full`,
      });

      assert.equal(partial.refinedComparison.recall, 1);
      assert.equal(full.refinedComparison.recall, 1);
      assert.ok(
        partial.refinedComparison.precision >
          partial.discovery.comparison.precision,
        `Expected partial precision ${partial.refinedComparison.precision} to exceed initial precision ${partial.discovery.comparison.precision}`,
      );
      assert.ok(
        partial.refinedComparison.precision < 1,
        `Expected partial refinement to remain below full precision, got ${partial.refinedComparison.precision}`,
      );
      assert.equal(full.refinedComparison.precision, 1);
      assert.ok(
        full.refinedComparison.precision > partial.refinedComparison.precision,
        `Expected full precision ${full.refinedComparison.precision} to exceed partial precision ${partial.refinedComparison.precision}`,
      );
    },
  );

  scenario(
    "PREF-10P discovered exclusive-gateway constraints restore precision",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l19DecisionViaSynchronizedOrLocalTransition,
    },
    async (fixtures) => {
      const { discovery, selectedConstraints, refinedComparison } =
        await runScenario(fixtures);

      assert.equal(refinedComparison.recall, 1);
      assert.equal(refinedComparison.precision, 1);

      const selectedResult = {
        ...discovery,
        constraints: selectedConstraints,
      };

      requireGuardInformation(selectedResult, {
        guardedTask: "task5",
        objectClass: "ClassA",
        objectState: "a-x",
      });
      requireGuardInformation(selectedResult, {
        guardedTask: "task4",
        objectClass: "ClassA",
        objectState: "a-y",
      });
      requireExclusion(selectedResult, "task4", "task5");
      expectExclusionsExactly(selectedConstraints, [["task4", "task5"]]);
      requireDisjunctivePrecedence(selectedResult, ["task4", "task5"], "task6");

      expectNoExclusion(selectedResult, "task1", "task4");
      expectNoExclusion(selectedResult, "task3", "task4");
      expectNoExclusion(selectedResult, "task4", "task6");
      expectNoPrecedence(selectedResult, "task4", "task6");
      expectNoPrecedence(selectedResult, "task5", "task6");
    },
  );
});

async function runScenario(
  fixtures: NamedFixtureTriple,
  selectConstraints: (
    constraints: ControlFlowConstraint[],
  ) => ControlFlowConstraint[] = (constraints) => constraints,
): Promise<{
  discovery: ControlFlowConstraintDiscoveryResult;
  selectedConstraints: ControlFlowConstraint[];
  refinedProtocol: BsplProtocol;
  refinedComparison: LanguageComparisonResult;
}> {
  const context = await contextFromFixtures(fixtures);
  const { protocol } = buildBspl(context);
  const discovery = discoverControlFlowConstraints(context, protocol);
  const selectedConstraints = selectConstraints(discovery.constraints);
  const refinedProtocol = refineBsplWithControlFlowConstraints(
    protocol,
    selectedConstraints,
  );
  const refinedComparison = compareChoreographyAndBsplBehavior(
    context,
    refinedProtocol,
  );

  expectWellFormedProtocol(refinedProtocol);
  await writeScenarioResult({
    subdirectory: "artifacts/04-bsplMappingRefinement",
    resultDirectory: "bsplRefinement",
    scenarioName: fixtures.scenarioName,
    content: serializeBspl(refinedProtocol),
    fileExtension: "bspl",
  });

  await writeScenarioResult({
    subdirectory: "artifacts/04-bsplMappingRefinement",
    resultDirectory: "bsplRefinement",
    scenarioName: fixtures.scenarioName,
    content: JSON.stringify(
      {
        selectedConstraints,
        comparison: refinedComparison,
      },
      null,
      2,
    ),
    fileExtension: "json",
  });

  return {
    discovery,
    selectedConstraints,
    refinedProtocol,
    refinedComparison,
  };
}

function expectExclusionsExactly(
  constraints: ControlFlowConstraint[],
  expectedPairs: Array<[string, string]>,
): void {
  const actual = constraints
    .filter((constraint) => constraint.kind === "exclusion")
    .map((constraint) => normalizedPairKey(constraint.tasks))
    .sort();
  const expected = expectedPairs.map(normalizedPairKey).sort();

  assert.deepEqual(actual, expected);
}

function normalizedPairKey(pair: readonly [string, string]): string {
  return [...pair].sort().join("#");
}

function selectGuardInformationConstraints(
  constraints: ControlFlowConstraint[],
): ControlFlowConstraint[] {
  return constraints.filter(
    (constraint) => constraint.kind === "guardInformation",
  );
}

function scenario(
  name: string,
  fixtures: FixtureTriple,
  run: (fixtures: NamedFixtureTriple) => Promise<void>,
): void {
  if (!allFixturesExist(fixtures)) {
    throw new Error(`Missing fixtures for scenario "${name}"`);
  }

  it(name, () => run({ ...fixtures, scenarioName: name }));
}
