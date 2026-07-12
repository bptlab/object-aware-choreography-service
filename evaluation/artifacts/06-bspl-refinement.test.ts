import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  compareChoreographyAndBsplBehavior,
  type LanguageComparisonResult,
} from "../../src/shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import { buildBspl } from "../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import {
  discoverControlFlowConstraints,
  refineBsplWithControlFlowConstraints,
  type ControlFlowConstraint,
} from "../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";
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

const ARTIFACT_GROUP = "06-bspl-refinement";
const overviewEntries: EvaluationOverviewEntry[] = [];

describe("Evaluation 06 BSPL Refinement", () => {
  after(async () => {
    await writeEvaluationOverview(ARTIFACT_GROUP, overviewEntries);
  });

  for (const scenario of bsplScenarios()) {
    const expectation = bsplExpectation(scenario);

    if (expectation.outcome !== "holds") {
      overviewEntries.push({
        ...baseOverviewEntry({
          artifactGroup: ARTIFACT_GROUP,
          scenario,
          outcome: "skips",
          expectedOutcome: "skips",
          artifactPaths: [],
        }),
        skipReason:
          expectation.outcome === "skip"
            ? expectation.reason
            : expectation.reason ?? "BSPL mapping is expected to reject.",
      });
      it.skip(`${scenario.id} ${scenario.title} skips BSPL refinement`);
      continue;
    }

    it(`${scenario.id} ${scenario.title}`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const { context } = await getScenario(scenario.id);
      const { protocol } = buildBspl(context);
      const discovery = discoverControlFlowConstraints(context, protocol);

      if (discovery.constraints.length === 0) {
        assert.equal(
          discovery.comparison.recall,
          1,
          `Expected no refinement to have recall 1 for ${scenario.id}`,
        );
        assert.equal(
          discovery.comparison.precision,
          1,
          `Expected no refinement to have precision 1 for ${scenario.id}`,
        );
      }

      const refinedProtocol = refineBsplWithControlFlowConstraints(
        protocol,
        discovery.constraints,
      );
      const refinedComparison = compareChoreographyAndBsplBehavior(
        context,
        refinedProtocol,
      );
      const ablation = singleRemovalAblation({
        context,
        protocol,
        constraints: discovery.constraints,
        fullPrecision: refinedComparison.precision,
      });

      expectWellFormedProtocol(refinedProtocol);
      assert.equal(
        refinedComparison.recall,
        1,
        `Expected refinement to preserve recall for ${scenario.id}`,
      );
      assert.equal(
        refinedComparison.precision,
        1,
        `Expected refinement to ensure precision for ${scenario.id}`,
      );

      const refinedProtocolPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: serializeBspl(refinedProtocol),
        extension: "bspl",
        suffix: "refined",
      });
      const refinementReportPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: JSON.stringify(
          {
            discovery,
            refinedComparison,
            singleRemovalDiagnostics: ablation?.runs ?? [],
          },
          null,
          2,
        ),
        extension: "json",
        suffix: "refinement",
      });
      overviewEntries.push({
        ...baseOverviewEntry({
          artifactGroup: ARTIFACT_GROUP,
          scenario,
          outcome: "holds",
          expectedOutcome: "holds",
          artifactPaths: [refinedProtocolPath, refinementReportPath],
          durationMs: durationSince(startedAt),
        }),
        initialRecall: discovery.comparison.recall,
        initialPrecision: discovery.comparison.precision,
        discoveredConstraintCount: discovery.constraints.length,
        discoveredConstraintCategories: constraintCategories(
          discovery.constraints,
        ),
        refinedRecall: refinedComparison.recall,
        refinedPrecision: refinedComparison.precision,
        exactBeforeRefinement:
          discovery.comparison.recall === 1 &&
          discovery.comparison.precision === 1,
        exactAfterRefinement:
          refinedComparison.recall === 1 && refinedComparison.precision === 1,
        noRefinementNeeded: discovery.constraints.length === 0,
        refinedProtocolPath,
        refinementReportPath,
        ablationSummary: ablation?.summary ?? null,
        ablationInterpretation: "diagnostic-flexibility-not-minimality",
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

function constraintCategories(
  constraints: Array<{ kind: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const constraint of constraints) {
    counts[constraint.kind] = (counts[constraint.kind] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort());
}

function singleRemovalAblation(args: {
  context: Awaited<ReturnType<typeof getScenario>>["context"];
  protocol: ReturnType<typeof buildBspl>["protocol"];
  constraints: ControlFlowConstraint[];
  fullPrecision: number;
}): {
  runs: SingleRemovalDiagnostic[];
  summary: SingleRemovalAblationSummary;
} | null {
  if (args.constraints.length === 0) {
    return null;
  }

  const runs = args.constraints.map((constraint, index) => {
    const partiallyRefinedProtocol = refineBsplWithControlFlowConstraints(
      args.protocol,
      args.constraints.filter((_, constraintIndex) => constraintIndex !== index),
    );
    const comparison = compareChoreographyAndBsplBehavior(
      args.context,
      partiallyRefinedProtocol,
    );

    return {
      removedConstraintId: constraint.id,
      removedConstraintKind: constraint.kind,
      recall: comparison.recall,
      precision: comparison.precision,
    };
  });

  return {
    runs,
    summary: summarizeSingleRemovalAblation(runs, args.fullPrecision),
  };
}

type SingleRemovalDiagnostic = {
  removedConstraintId: string;
  removedConstraintKind: ControlFlowConstraint["kind"];
  recall: LanguageComparisonResult["recall"];
  precision: LanguageComparisonResult["precision"];
};

type SingleRemovalAblationSummary = {
  constraintsChecked: number;
  averagePrecisionAfterSingleRemoval: number;
  averagePrecisionReductionFromFull: number;
  minPrecisionAfterSingleRemoval: number;
  maxPrecisionAfterSingleRemoval: number;
  singleRemovalsWithPrecisionLoss: number;
  singleRemovalsWithoutPrecisionLoss: number;
  recallPreservedForAllSingleRemovals: boolean;
};

function summarizeSingleRemovalAblation(
  runs: SingleRemovalDiagnostic[],
  fullPrecision: number,
): SingleRemovalAblationSummary {
  const precisionValues = runs.map((run) => run.precision);
  const averagePrecision = average(precisionValues);
  const precisionLosses = runs.filter(
    (run) => run.precision < fullPrecision,
  ).length;

  return {
    constraintsChecked: runs.length,
    averagePrecisionAfterSingleRemoval: roundMetric(averagePrecision),
    averagePrecisionReductionFromFull: roundMetric(
      fullPrecision - averagePrecision,
    ),
    minPrecisionAfterSingleRemoval: roundMetric(Math.min(...precisionValues)),
    maxPrecisionAfterSingleRemoval: roundMetric(Math.max(...precisionValues)),
    singleRemovalsWithPrecisionLoss: precisionLosses,
    singleRemovalsWithoutPrecisionLoss: runs.length - precisionLosses,
    recallPreservedForAllSingleRemovals: runs.every((run) => run.recall === 1),
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function durationSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}
