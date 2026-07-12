import { after, describe, it } from "node:test";
import type { ObjectAwareRealizabilityReport } from "../../src/shared/analysis/objectAwareRealizability/index.js";
import type { ObjectAwareChoreographyContext } from "../../src/shared/context/objectAwareChoreographyContext.js";
import { buildIsolatedCaseSemanticsWithObjectAwareRealizability } from "../../src/shared/semantics/isolatedCaseSemantics.js";
import {
  getConstructScenarios,
  getIntegratedScenarios,
  getScenario,
  getWitnessScenarios,
  type ConstructScenarioDefinition,
  type PropertyLevelIsolatedExpectation,
  type IntegratedScenarioDefinition,
} from "../scenarios.js";
import {
  assertEvaluationFixturesExist,
  baseOverviewEntry,
  expectIsolatedCaseAnalysisProperties,
  type EvaluationOverviewEntry,
  writeEvaluationOverview,
  writeEvaluationResult,
} from "../evaluationHelpers.js";

const ALL_ISOLATED_PROPERTIES_HOLD: PropertyLevelIsolatedExpectation = {
  optionToComplete: true,
  properInteractionCompletion: true,
  taskCoverage: true,
  branchCoverage: true,
  senderProgression: true,
  receiverProgression: true,
  decisionConsistency: true,
};

const ARTIFACT_GROUP = "02-isolated-case-analysis";
const overviewEntries: EvaluationOverviewEntry[] = [];

describe("Evaluation 02 Isolated-Case Analysis", () => {
  after(async () => {
    await writeEvaluationOverview(ARTIFACT_GROUP, overviewEntries);
  });

  for (const scenario of positiveScenarios()) {
    it(`${scenario.id} ${scenario.title} is object-aware realizable`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const { context } = await getScenario(scenario.id);
      const report = runIsolatedAnalysis(context);

      expectIsolatedCaseAnalysisProperties(
        report,
        ALL_ISOLATED_PROPERTIES_HOLD,
      );

      const artifactPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: JSON.stringify(report, null, 2),
        extension: "json",
      });
      overviewEntries.push(
        isolatedAnalysisOverviewEntry({
          scenario,
          report,
          expected: ALL_ISOLATED_PROPERTIES_HOLD,
          artifactPath,
          durationMs: durationSince(startedAt),
        }),
      );
    });
  }

  for (const scenario of getWitnessScenarios()) {
    it(`${scenario.id} ${scenario.title} reports expected violation`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const { context } = await getScenario(scenario.id);
      const report = runIsolatedAnalysis(context);

      if (!scenario.expectedIsolatedCaseAnalysis) {
        throw new Error(
          `Missing isolated-case analysis expectation for ${scenario.id}`,
        );
      }

      expectIsolatedCaseAnalysisProperties(
        report,
        scenario.expectedIsolatedCaseAnalysis,
      );

      const artifactPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: JSON.stringify(report, null, 2),
        extension: "json",
      });
      overviewEntries.push(
        isolatedAnalysisOverviewEntry({
          scenario,
          report,
          expected: scenario.expectedIsolatedCaseAnalysis,
          artifactPath,
          durationMs: durationSince(startedAt),
        }),
      );
    });
  }
});

function positiveScenarios(): Array<
  ConstructScenarioDefinition | IntegratedScenarioDefinition
> {
  return [...getConstructScenarios(), ...getIntegratedScenarios()];
}

function runIsolatedAnalysis(
  context: ObjectAwareChoreographyContext,
): ObjectAwareRealizabilityReport {
  return buildIsolatedCaseSemanticsWithObjectAwareRealizability(context)
    .objectAwareRealizabilityReport;
}

function isolatedAnalysisOverviewEntry(args: {
  scenario: ConstructScenarioDefinition | IntegratedScenarioDefinition | ReturnType<typeof getWitnessScenarios>[number];
  report: ObjectAwareRealizabilityReport;
  expected: PropertyLevelIsolatedExpectation;
  artifactPath: string;
  durationMs: number;
}): EvaluationOverviewEntry {
  const actual = {
    optionToComplete:
      args.report.projectedChoreographySoundness.optionToComplete.holds,
    properInteractionCompletion:
      args.report.projectedChoreographySoundness.properInteractionCompletion
        .holds,
    taskCoverage: args.report.projectedChoreographySoundness.taskCoverage.holds,
    branchCoverage:
      args.report.projectedChoreographySoundness.branchCoverage.holds,
    senderProgression:
      args.report.diagnostics.senderProgressionViolations === 0,
    receiverProgression:
      args.report.diagnostics.receiverProgressionViolations === 0,
    decisionConsistency: args.report.decisionConsistency.holds,
  };
  const violatedProperties = Object.entries(actual)
    .filter(([, holds]) => !holds)
    .map(([property]) => property);
  const projectedActual = {
    optionToComplete:
      args.report.projectedChoreographySoundness.optionToComplete.holds,
    properInteractionCompletion:
      args.report.projectedChoreographySoundness.properInteractionCompletion
        .holds,
    taskCoverage: args.report.projectedChoreographySoundness.taskCoverage.holds,
    branchCoverage:
      args.report.projectedChoreographySoundness.branchCoverage.holds,
    holds: args.report.projectedChoreographySoundness.holds,
  };
  const projectedViolatedProperties = Object.entries(projectedActual)
    .filter(
      ([property, holds]) =>
        property !== "holds" && !holds,
    )
    .map(([property]) => property);

  return {
    ...baseOverviewEntry({
      artifactGroup: ARTIFACT_GROUP,
      scenario: args.scenario,
      outcome: isolatedOutcome(actual, args.expected),
      expectedOutcome:
        Object.values(args.expected).every((holds) => holds)
          ? "holds"
          : "violates",
      artifactPaths: [args.artifactPath],
      durationMs: args.durationMs,
    }),
    expected: args.expected,
    actual,
    projectedActual,
    violatedProperties,
    projectedViolatedProperties,
    projectedViolationCounts: {
      optionToCompleteViolations:
        args.report.projectedChoreographySoundness.optionToComplete
          .violatingStateCount,
      properInteractionCompletionViolations:
        args.report.projectedChoreographySoundness.properInteractionCompletion
          .violatingStateCount,
      uncoveredTasks:
        args.report.projectedChoreographySoundness.taskCoverage.uncoveredTaskIds
          .length,
      uncoveredBranches:
        args.report.projectedChoreographySoundness.branchCoverage
          .uncoveredBranchIds.length,
    },
    taskCoverage: {
      coveredTaskCount:
        args.report.projectedChoreographySoundness.taskCoverage.coveredTaskCount,
      totalTaskCount:
        args.report.projectedChoreographySoundness.taskCoverage.totalTaskCount,
      uncoveredTaskIds:
        args.report.projectedChoreographySoundness.taskCoverage.uncoveredTaskIds,
    },
    branchCoverage: {
      coveredBranchCount:
        args.report.projectedChoreographySoundness.branchCoverage
          .coveredBranchCount,
      totalBranchCount:
        args.report.projectedChoreographySoundness.branchCoverage
          .totalBranchCount,
      uncoveredBranchIds:
        args.report.projectedChoreographySoundness.branchCoverage
          .uncoveredBranchIds,
    },
    violationCounts: {
      senderProgressionViolations:
        args.report.diagnostics.senderProgressionViolations,
      receiverProgressionViolations:
        args.report.diagnostics.receiverProgressionViolations,
      decisionConsistencyViolations:
        args.report.diagnostics.decisionConsistencyViolations,
    },
    stateSpace: {
      markings: args.report.stateSpace.markings,
      edges: args.report.stateSpace.edges,
      truncated: false,
    },
    reportPath: args.artifactPath,
  };
}

function isolatedOutcome(
  actual: PropertyLevelIsolatedExpectation,
  expected: PropertyLevelIsolatedExpectation,
): "holds" | "violates" | "fails" {
  const expectedOutcome = Object.values(expected).every((holds) => holds)
    ? "holds"
    : "violates";
  const matchesExpected = Object.entries(expected).every(
    ([property, expectedHolds]) =>
      actual[property as keyof PropertyLevelIsolatedExpectation] ===
      expectedHolds,
  );

  return matchesExpected ? expectedOutcome : "fails";
}

function durationSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}
