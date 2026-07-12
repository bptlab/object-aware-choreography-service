import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { buildObjectAwareChoreographyContext } from "../../src/shared/context/objectAwareChoreographyContext.js";
import { buildBspl } from "../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import {
  getValidationScenarios,
  loadScenarioInput,
  type ValidationScenarioDefinition,
} from "../scenarios.js";
import {
  assertEvaluationFixturesExist,
  baseOverviewEntry,
  type EvaluationOverviewEntry,
  writeEvaluationOverview,
  writeEvaluationResult,
} from "../evaluationHelpers.js";

const ARTIFACT_GROUP = "00-validation";
const overviewEntries: EvaluationOverviewEntry[] = [];

describe("Evaluation 00 Validation", () => {
  after(async () => {
    await writeEvaluationOverview(ARTIFACT_GROUP, overviewEntries);
  });

  for (const scenario of getValidationScenarios()) {
    it(`${scenario.id} ${scenario.title}`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const message =
        scenario.kind === "validation" && scenario.validation.target === "bspl"
          ? await expectBsplRejection(scenario)
          : await expectContextRejection(scenario);

      assert.match(message, scenario.validation.rejection);

      const artifactPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: JSON.stringify({ error: message }, null, 2),
        extension: "json",
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
        rejectionCategory: scenario.validation.category,
        validationTarget: scenario.validation.target,
        expectedRejectionRegex: String(scenario.validation.rejection),
        actualRejected: true,
        actualErrorMessage: message,
      });
    });
  }
});

async function expectContextRejection(
  scenario: ValidationScenarioDefinition,
): Promise<string> {
  try {
    const input = await loadScenarioInput(scenario);
    await buildObjectAwareChoreographyContext(input);
  } catch (error) {
    return error instanceof Error ? error.message : "Unknown validation error";
  }

  throw new Error(`Expected ${scenario.id} to reject context construction`);
}

async function expectBsplRejection(
  scenario: ValidationScenarioDefinition,
): Promise<string> {
  try {
    const input = await loadScenarioInput(scenario);
    const context = await buildObjectAwareChoreographyContext(input);
    buildBspl(context);
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Unknown BSPL validation error";
  }

  throw new Error(`Expected ${scenario.id} to reject BSPL mapping`);
}

function durationSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}
