import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { compareChoreographyAndBsplBehavior } from "../../src/shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import { buildBspl } from "../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import { serializeBspl } from "../../src/shared/targets/bspl/serialization.js";
import { expectWellFormedProtocol } from "../../test/assertions/bsplAssertions.js";
import {
  getConstructScenarios,
  getIntegratedScenarios,
  getScenario,
  type BsplExpectation,
  type ConstructScenarioDefinition,
  type IntegratedScenarioDefinition,
} from "../scenarios.js";
import {
  assertEvaluationFixturesExist,
  baseOverviewEntry,
  type EvaluationOverviewEntry,
  writeEvaluationOverview,
  writeEvaluationResult,
} from "../evaluationHelpers.js";
import { assertBsplMappingForScenario } from "../assertions/bsplMappingEvaluationAssertions.js";

const ARTIFACT_GROUP = "05-bspl-mapping";
const overviewEntries: EvaluationOverviewEntry[] = [];

describe("Evaluation 05 BSPL Mapping", () => {
  after(async () => {
    await writeEvaluationOverview(ARTIFACT_GROUP, overviewEntries);
  });

  for (const scenario of bsplScenarios()) {
    const expectation = bsplExpectation(scenario);

    if (expectation.outcome === "skip") {
      overviewEntries.push({
        ...baseOverviewEntry({
          artifactGroup: ARTIFACT_GROUP,
          scenario,
          outcome: "skips",
          expectedOutcome: "skips",
          artifactPaths: [],
        }),
        expectedBsplOutcome: expectation.outcome,
        actualOutcome: "skips",
        skipReason: expectation.reason,
      });
      it.skip(
        `${scenario.id} ${scenario.title} skips BSPL mapping: ${
          expectation.reason ?? "not applicable"
        }`,
      );
      continue;
    }

    if (expectation.outcome === "rejects") {
      it(`${scenario.id} ${scenario.title} rejects BSPL mapping`, async () => {
        const startedAt = performance.now();
        assertEvaluationFixturesExist(scenario);

        let rejectionMessage = "";
        await assert.rejects(async () => {
          const { context } = await getScenario(scenario.id);
          try {
            buildBspl(context);
          } catch (error) {
            rejectionMessage =
              error instanceof Error ? error.message : String(error);
            throw error;
          }
        }, expectation.rejection);
        const artifactPath = await writeEvaluationResult({
          artifactGroup: ARTIFACT_GROUP,
          scenario,
          content: JSON.stringify({ error: rejectionMessage }, null, 2),
          extension: "json",
          suffix: "rejection",
        });
        overviewEntries.push({
          ...baseOverviewEntry({
            artifactGroup: ARTIFACT_GROUP,
            scenario,
            outcome: "rejects",
            expectedOutcome: "rejects",
            artifactPaths: [artifactPath],
            durationMs: durationSince(startedAt),
          }),
          expectedBsplOutcome: expectation.outcome,
          actualOutcome: "rejects",
          rejectionMessage,
        });
      });
      continue;
    }

    it(`${scenario.id} ${scenario.title}`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const { context } = await getScenario(scenario.id);
      const { protocol } = buildBspl(context);
      const serialized = serializeBspl(protocol);
      const comparison = compareChoreographyAndBsplBehavior(context, protocol);

      expectWellFormedProtocol(protocol);
      assertBsplMappingForScenario(scenario, protocol, context, comparison);
      assert.equal(
        comparison.recall,
        1,
        `Expected BSPL mapping to capture all choreography behavior for ${scenario.id}`,
      );
      assert.ok(
        comparison.precision <= 1,
        `Expected BSPL mapping to have precision <= 1 for ${scenario.id}`,
      );
      assert.ok(
        comparison.precision > 0,
        `Expected BSPL mapping to have precision > 0 for ${scenario.id}`,
      );

      const protocolPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: serialized,
        extension: "bspl",
      });
      const comparisonPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: JSON.stringify(comparison, null, 2),
        extension: "json",
        suffix: "comparison",
      });
      overviewEntries.push({
        ...baseOverviewEntry({
          artifactGroup: ARTIFACT_GROUP,
          scenario,
          outcome: "holds",
          expectedOutcome: "holds",
          artifactPaths: [protocolPath, comparisonPath],
          durationMs: durationSince(startedAt),
        }),
        expectedBsplOutcome: expectation.outcome,
        actualOutcome: "holds",
        protocolPath,
        comparisonReportPath: comparisonPath,
        protocolMetrics: protocolMetrics(protocol),
        languageComparison: {
          choreographyTraceCount: comparison.choreographyTraceCount,
          bsplTraceCount: comparison.protocolTraceCount,
          commonTraceCount: comparison.sharedTraceCount,
          recall: comparison.recall,
          precision: comparison.precision,
          exactBeforeRefinement:
            comparison.precision === 1 && comparison.recall === 1,
        },
      });
    });
  }
});

type BsplEvaluationScenario =
  | ConstructScenarioDefinition
  | IntegratedScenarioDefinition;

function bsplScenarios(): BsplEvaluationScenario[] {
  return [...getConstructScenarios(), ...getIntegratedScenarios()];
}

function bsplExpectation(scenario: BsplEvaluationScenario): BsplExpectation {
  return scenario.bspl ?? { outcome: "holds" };
}

function protocolMetrics(protocol: ReturnType<typeof buildBspl>["protocol"]): {
  roleCount: number;
  messageCount: number;
  parameterCount: number;
  inParameterCount: number;
  outParameterCount: number;
  nilParameterCount: number;
} {
  const messageParameters = protocol.messages.flatMap(
    (message) => message.parameters,
  );

  return {
    roleCount: protocol.roles.length,
    messageCount: protocol.messages.length,
    parameterCount: protocol.parameters.length,
    inParameterCount: messageParameters.filter(
      (parameter) => parameter.adornment === "in",
    ).length,
    outParameterCount: messageParameters.filter(
      (parameter) => parameter.adornment === "out",
    ).length,
    nilParameterCount: messageParameters.filter(
      (parameter) => parameter.adornment === "nil",
    ).length,
  };
}

function durationSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}
