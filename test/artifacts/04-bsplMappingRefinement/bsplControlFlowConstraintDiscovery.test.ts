import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildObjectAwareChoreographyContext } from "../../../src/shared/context/objectAwareChoreographyContext.js";
import {
  discoverControlFlowConstraints,
  findFirstDeviation,
} from "../../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";
import { buildBspl } from "../../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import type { BsplProtocol } from "../../../src/shared/targets/bspl/bsplTypes.js";
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
import { serializeBspl } from "../../../src/shared/targets/bspl/serialization.js";
import {
  expectHasViolatingTrace,
  expectNoExclusion,
  expectNoPrecedence,
  requireDisjunctivePrecedence,
  requireExclusion,
  requireGuardInformation,
  requirePrecedence,
} from "../../assertions/bsplAssertions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const orderFulfillmentDirectory = path.resolve(
  __dirname,
  "../../resources/scenarios/order_fulfillment"
);

describe("BSPL Control-Flow Constraint Discovery", () => {
  it("CFCD-01N finds the first deviating task in a protocol-only trace", () => {
    const deviation = findFirstDeviation({ traces: [["task1", "task2"]] }, [
      "task2",
      "task1",
    ]);

    assert.deepEqual(deviation, {
      trace: ["task2", "task1"],
      prefix: [],
      task: "task2",
      position: 0,
    });
  });

  it("CFCD-02P does not report a deviation for a choreography trace", () => {
    const deviation = findFirstDeviation({ traces: [["task1", "task2"]] }, [
      "task1",
      "task2",
    ]);

    assert.equal(deviation, undefined);
  });

  it("CFCD-03P discovers concrete precedence for a manually relaxed sequence", async () => {
    const context = await contextFromFixtures({
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
    });
    const { protocol } = buildBspl(context);
    const relaxedProtocol: BsplProtocol = {
      ...protocol,
      messages: protocol.messages.map((message) =>
        message.name === "task2"
          ? {
              ...message,
              parameters: message.parameters.filter(
                (parameter) => parameter.adornment !== "in"
              ),
            }
          : message
      ),
    };
    const result = discoverControlFlowConstraints(context, relaxedProtocol);

    const precedence = requirePrecedence(result, "task1", "task2");

    expectHasViolatingTrace(precedence);
  });

  scenario(
    "CFCD-04P exact behavior yields no constraints",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      assert.equal(result.comparison.recall, 1);
      assert.equal(result.comparison.precision, 1);
      assert.deepEqual(result.constraints, []);
    }
  );

  scenario(
    "CFCD-05P independent sequence relaxation yields concrete precedence",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      assert.equal(result.comparison.recall, 1);
      assert.ok(result.comparison.precision < 1);

      const task2BeforeTask3 = requirePrecedence(result, "task2", "task3");

      assert.equal(task2BeforeTask3.source.reason, "sequence");
      expectHasViolatingTrace(task2BeforeTask3);
    }
  );

  scenario(
    "CFCD-06P exclusive alternatives yield concrete exclusions",
    {
      choreography:
        Choreographies.c20EventBasedGatewayCommunicationTwoClassesCreate,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      const exclusion = requireExclusion(result, "task2", "task3");

      assert.match(exclusion.source.reason, /eventBasedSplit/);
      expectHasViolatingTrace(exclusion);
      expectNoExclusion(result, "task1", "task2");
      expectNoExclusion(result, "task1", "task3");
      expectNoExclusion(result, "task2", "task4");
      expectNoExclusion(result, "task3", "task4");
    }
  );

  scenario(
    "CFCD-07P exclusive join yields disjunctive branch-completion precedence",
    {
      choreography:
        Choreographies.c20EventBasedGatewayCommunicationTwoClassesCreate,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      const disjunctivePrecedence = requireDisjunctivePrecedence(
        result,
        ["task2", "task3"],
        "task4"
      );

      assert.equal(disjunctivePrecedence.source.reason, "exclusiveJoin");
      expectHasViolatingTrace(disjunctivePrecedence);
    }
  );

  scenario(
    "CFCD-08P guarded exclusive branch yields guard-information constraint",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      const guard = requireGuardInformation(result, {
        objectClass: "ClassA",
        objectState: /a-[xy]|a_[xy]/,
      });

      assert.equal(guard.source.reason, "guardedExclusiveSplit");
      assert.ok(
        guard.requiredIn.includes("attribute_classa_a-id"),
        "Expected guarded branch to require the ClassA identifier"
      );
      assert.ok(
        guard.requiredIn.some((parameter) =>
          /^attribute_classa_/.test(parameter)
        ),
        "Expected requiredIn to contain ClassA state information"
      );
      expectHasViolatingTrace(guard);
    }
  );

  scenario(
    "CFCD-09P data-based exclusive branch yields guard-information constraint",
    {
      choreography: Choreographies.c34MisalignedDecision,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      const guard = requireGuardInformation(result, {
        guardedTask: "task3",
        objectClass: "ClassA",
        objectState: "a-y",
      });

      assert.equal(guard.source.reason, "guardedExclusiveSplit");
      expectNoExclusion(result, "task1", "task3");
      expectHasViolatingTrace(guard);
    }
  );

  scenario(
    "CFCD-10P parallel join yields branch-completion precedence",
    {
      choreography: Choreographies.c28ParallelGatewayCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      assert.equal(result.comparison.recall, 1);
      assert.ok(result.comparison.precision < 1);

      const task2BeforeJoinContinuation = requirePrecedence(
        result,
        "task2",
        "task4"
      );
      const task3BeforeJoinContinuation = requirePrecedence(
        result,
        "task3",
        "task4"
      );

      assert.equal(task2BeforeJoinContinuation.source.reason, "parallelJoin");
      assert.equal(task3BeforeJoinContinuation.source.reason, "parallelJoin");
      expectHasViolatingTrace(task2BeforeJoinContinuation);
      expectHasViolatingTrace(task3BeforeJoinContinuation);
    }
  );

  scenario(
    "CFCD-11P local decision encoded by nil parameters yields no constraints",
    {
      choreography:
        Choreographies.c19EventBasedGatewayCommunicationOneClassFollowsCommunication,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l12LocalDecisionSameRole,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      assert.equal(result.comparison.recall, 1);
      assert.equal(result.comparison.precision, 1);
      assert.deepEqual(result.constraints, []);
    }
  );

  scenario(
    "CFCD-12P guarded exclusive branch includes successor-state nil parameters",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l19DecisionViaSynchronizedOrLocalTransition,
    },
    async (fixtures) => {
      const result = await runScenario(fixtures);

      const task5Guard = requireGuardInformation(result, {
        guardedTask: "task5",
        objectClass: "ClassA",
        objectState: "a-x",
      });
      const task4Guard = requireGuardInformation(result, {
        guardedTask: "task4",
        objectClass: "ClassA",
        objectState: "a-y",
      });
      const guardedBranchExclusion = requireExclusion(result, "task4", "task5");
      const afterGuardedJoin = requireDisjunctivePrecedence(
        result,
        ["task4", "task5"],
        "task6"
      );

      assert.equal(task5Guard.source.reason, "guardedExclusiveSplit");
      assert.equal(task4Guard.source.reason, "guardedExclusiveSplit");
      assert.equal(
        guardedBranchExclusion.source.reason,
        "guardedExclusiveSplit"
      );
      assert.equal(afterGuardedJoin.source.reason, "exclusiveJoin");
      assert.ok(
        task5Guard.requiredIn.includes("attribute_classa_a-id"),
        "Expected guarded branch to require the ClassA identifier"
      );
      assert.ok(
        task5Guard.requiredNil.includes("attribute_classa_att2"),
        "Expected guarded branch to exclude successor attribute representation"
      );
      assert.ok(
        task5Guard.requiredNil.includes("state_classa_a-y"),
        "Expected guarded branch to exclude successor state indicator"
      );
      assert.ok(
        task4Guard.requiredIn.includes("attribute_classa_a-id"),
        "Expected guarded branch to require the ClassA identifier"
      );
      assert.ok(
        task4Guard.requiredIn.includes("state_classa_a-y"),
        "Expected guarded branch to require the ClassA guarded state indicator"
      );

      expectNoExclusion(result, "task1", "task4");
      expectNoExclusion(result, "task3", "task4");
      expectNoExclusion(result, "task4", "task6");
      expectNoPrecedence(result, "task1", "task2");
      expectNoPrecedence(result, "task1", "task3");
      expectNoPrecedence(result, "task4", "task6");
      expectNoPrecedence(result, "task5", "task6");

      [
        task5Guard,
        task4Guard,
        guardedBranchExclusion,
        afterGuardedJoin,
      ].forEach(expectHasViolatingTrace);
    }
  );

  it("CFCD-13P terminal event-based branch yields first-task exclusion", async () => {
    const context = await loadOrderFulfillmentScenario();
    const { protocol } = buildBspl(context);
    const result = discoverControlFlowConstraints(context, protocol);

    const exclusion = requireExclusion(
      result,
      "cancel-order",
      "send-payment-proof"
    );

    assert.equal(exclusion.source.reason, "eventBasedSplit");
    expectHasViolatingTrace(exclusion);
  });

  scenario(
    "CFCD-14N empty exclusive branch is unsupported for constraint discovery",
    {
      choreography: Choreographies.c26ExclusiveGatewayNoTaskBranch,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);
      const { protocol } = buildBspl(context);

      assert.throws(
        () => discoverControlFlowConstraints(context, protocol),
        /empty branch|exclusive|constraint discovery|unsupported/i
      );
    }
  );
});

async function loadOrderFulfillmentScenario() {
  const [choreography, sharedDataModel, sharedLifecycle] = await Promise.all([
    readOrderFulfillmentFile("choreography.chor"),
    readOrderFulfillmentFile("shared_data_model.obpt-cd"),
    readOrderFulfillmentFile("shared_object_lifecycles.obpt-sts"),
  ]);

  return buildObjectAwareChoreographyContext({
    choreography,
    shared_data_model: sharedDataModel,
    shared_object_lifecycles: sharedLifecycle,
  });
}

function readOrderFulfillmentFile(fileName: string): Promise<string> {
  return readFile(path.join(orderFulfillmentDirectory, fileName), "utf8");
}

async function runScenario(fixtures: NamedFixtureTriple) {
  const context = await contextFromFixtures(fixtures);
  const { protocol } = buildBspl(context);
  const constraints = discoverControlFlowConstraints(context, protocol);
  await writeScenarioResult({
    subdirectory: "artifacts/04-bsplMappingRefinement",
    resultDirectory: "bsplControlFlowConstraintDiscovery",
    scenarioName: fixtures.scenarioName,
    content: JSON.stringify(constraints, null, 2),
    fileExtension: "json",
  });
  await writeScenarioResult({
    subdirectory: "artifacts/04-bsplMappingRefinement",
    resultDirectory: "bsplControlFlowConstraintDiscovery",
    scenarioName: fixtures.scenarioName,
    content: serializeBspl(protocol),
    fileExtension: "bspl",
  });
  return constraints;
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
