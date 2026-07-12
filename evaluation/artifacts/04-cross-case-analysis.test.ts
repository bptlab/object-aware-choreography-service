import { after, describe, it } from "node:test";
import {
  checkCrossCaseObjectAwareRealizability,
  type CrossCaseObjectAwareRealizabilityReport,
} from "../../src/shared/analysis/crossCaseObjectAwareRealizability/index.js";
import { buildCrossCasePetriNet } from "../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import { getChoreographyTasks } from "../../src/shared/source/objectAwareChoreography/choreography/choreography.js";
import {
  getConstructScenarios,
  getCrossCaseAnalysisVariants,
  getIntegratedScenarios,
  getScenario,
  getWitnessScenarios,
  type CrossCaseAnalysisVariant,
  type ConstructScenarioDefinition,
  type EvaluationScenarioDefinition,
  type PropertyLevelCrossCaseExpectation,
  type IntegratedScenarioDefinition,
} from "../scenarios.js";
import {
  assertEvaluationFixturesExist,
  baseOverviewEntry,
  expectCrossCaseAnalysisProperties,
  type EvaluationOverviewEntry,
  finiteDomainsByAlias,
  finiteDomainsFor,
  writeEvaluationOverview,
  writeEvaluationResult,
} from "../evaluationHelpers.js";

const ALL_CROSS_CASE_PROPERTIES_HOLD: PropertyLevelCrossCaseExpectation = {
  caseOptionToComplete: true,
  properInteractionCompletion: true,
  taskCoverage: true,
  branchCoverage: true,
  senderProgression: true,
  receiverProgression: true,
  decisionConsistency: true,
};

const ARTIFACT_GROUP = "04-cross-case-analysis";
const overviewEntries: EvaluationOverviewEntry[] = [];

describe("Evaluation 04 Cross-Case Analysis", () => {
  after(async () => {
    await writeEvaluationOverview(ARTIFACT_GROUP, overviewEntries);
  });

  for (const scenario of positiveScenarios()) {
    it(`${scenario.id} ${scenario.title} is cross-case object-aware realizable`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const { report, domainSizes } = await runScenario(scenario);

      expectCrossCaseAnalysisProperties(report, ALL_CROSS_CASE_PROPERTIES_HOLD);

      const artifactPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: JSON.stringify(report, null, 2),
        extension: "json",
      });
      overviewEntries.push(
        crossCaseAnalysisOverviewEntry({
          scenario,
          report,
          expected: ALL_CROSS_CASE_PROPERTIES_HOLD,
          artifactPath,
          durationMs: durationSince(startedAt),
          crossCaseClasses: [],
          domainSizes,
          variantId: "default",
        }),
      );
    });
  }

  for (const { scenario, variant } of getCrossCaseAnalysisVariants()) {
    it(`${scenario.id} ${scenario.title} ${variant.id}`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const { context } = await getScenario(scenario.id);
      const net = buildCrossCasePetriNet(context, {
        crossCaseClasses: variant.crossCaseClasses,
        participantIdsByRole: variant.participantIdsByRole,
      });
      const domains = finiteDomainsByAlias(net, variant.domainsByAlias);
      const report = checkCrossCaseObjectAwareRealizability({
        net,
        domains,
        fixedParticipantsByCaseAndRole: variant.fixedParticipantsByCaseAndRole,
        maxDepth: variant.maxDepth,
        maxMarkings: variant.maxMarkings,
        taskIds: getChoreographyTasks(context.choreography).map((task) => task.id),
      });

      expectCrossCaseAnalysisProperties(
        report,
        variant.expectedCrossCaseAnalysis,
      );

      const artifactPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: JSON.stringify(report, null, 2),
        extension: "json",
        suffix: variant.slug,
      });
      overviewEntries.push(
        crossCaseAnalysisOverviewEntry({
          scenario,
          report,
          expected: variant.expectedCrossCaseAnalysis,
          artifactPath,
          durationMs: durationSince(startedAt),
          crossCaseClasses: variant.crossCaseClasses,
          domainSizes: crossCaseDomainSizesByType(net.identifierTypes, domains),
          rawDomainSizes: rawDomainSizesByAlias(variant.domainsByAlias),
          variant,
          variantId: variant.id,
        }),
      );
    });
  }

  for (const scenario of getWitnessScenarios()) {
    it(`${scenario.id} ${scenario.title} has configured cross-case outcome`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const expected = crossCaseExpectationFromIsolatedWitness(scenario);
      if (!expected) {
        overviewEntries.push(
          {
            ...baseOverviewEntry({
              artifactGroup: ARTIFACT_GROUP,
              scenario,
              outcome: "skips",
              expectedOutcome: "skips",
              durationMs: durationSince(startedAt),
              variantId: "default",
            }),
            reason: crossCaseWitnessSkipReason(scenario),
            crossCaseClasses: [],
            domainSizes: null,
          },
        );
        return;
      }

      const { report, domainSizes } = await runScenario(scenario);

      expectCrossCaseAnalysisProperties(report, expected);

      const artifactPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: JSON.stringify(report, null, 2),
        extension: "json",
      });
      overviewEntries.push(
        crossCaseAnalysisOverviewEntry({
          scenario,
          report,
          expected,
          artifactPath,
          durationMs: durationSince(startedAt),
          crossCaseClasses: [],
          domainSizes,
          variantId: "default",
        }),
      );
    });
  }
});

async function runScenario(scenario: EvaluationScenarioDefinition) {
  const { context } = await getScenario(scenario.id);
  const net = buildCrossCasePetriNet(context, {
    crossCaseClasses: [],
  });
  const domains = finiteDomainsFor(net);

  return {
    report: checkCrossCaseObjectAwareRealizability({
      net,
      domains,
      maxDepth: 100,
      maxMarkings: 50000,
      taskIds: getChoreographyTasks(context.choreography).map((task) => task.id),
    }),
    domainSizes: crossCaseDomainSizesByType(net.identifierTypes, domains),
  };
}

function positiveScenarios(): Array<
  ConstructScenarioDefinition | IntegratedScenarioDefinition
> {
  return [...getConstructScenarios(), ...getIntegratedScenarios()];
}

function crossCaseAnalysisOverviewEntry(args: {
  scenario: EvaluationScenarioDefinition;
  report: CrossCaseObjectAwareRealizabilityReport;
  expected: PropertyLevelCrossCaseExpectation;
  artifactPath: string;
  durationMs: number;
  crossCaseClasses: string[];
  domainSizes: unknown;
  rawDomainSizes?: Record<string, number>;
  variantId: string;
  variant?: CrossCaseAnalysisVariant;
}): EvaluationOverviewEntry {
  const actual = {
    caseOptionToComplete: args.report.caseOptionToComplete.holds,
    properInteractionCompletion:
      args.report.projectedChoreographySoundness.properInteractionCompletion
        .holds,
    taskCoverage: args.report.projectedChoreographySoundness.taskCoverage.holds,
    branchCoverage:
      args.report.projectedChoreographySoundness.branchCoverage.holds,
    senderProgression: args.report.senderProgression.holds,
    receiverProgression: args.report.receiverProgression.holds,
    decisionConsistency: args.report.decisionConsistency.holds,
  };
  const expected = {
    caseOptionToComplete: args.expected.caseOptionToComplete,
    properInteractionCompletion: args.expected.properInteractionCompletion,
    taskCoverage: args.expected.taskCoverage,
    branchCoverage: args.expected.branchCoverage,
    senderProgression: args.expected.senderProgression,
    receiverProgression: args.expected.receiverProgression,
    decisionConsistency: args.expected.decisionConsistency,
  };
  const violatedProperties = Object.entries(actual)
    .filter(([, holds]) => !holds)
    .map(([property]) => property);
  const expectedOutcome = Object.values(expected).every((holds) => holds)
    ? "holds"
    : "violates";
  const matchesExpected = Object.entries(expected).every(
    ([property, expectedHolds]) =>
      actual[property as keyof typeof actual] === expectedHolds,
  );

  return {
    ...baseOverviewEntry({
      artifactGroup: ARTIFACT_GROUP,
      scenario: args.scenario,
      outcome: matchesExpected ? expectedOutcome : "fails",
      expectedOutcome,
      artifactPaths: [args.artifactPath],
      durationMs: args.durationMs,
      variantId: args.variantId,
    }),
    crossCaseClasses: args.crossCaseClasses,
    domainSizes: args.domainSizes,
    rawDomainSizes: args.rawDomainSizes,
    assignmentMode: assignmentMode(args.variant),
    expected,
    actual,
    violatedProperties,
    violationCounts: {
      caseOptionToCompleteViolations:
        args.report.diagnostics.caseOptionToCompleteViolations,
      properInteractionCompletionViolations:
        args.report.diagnostics.properInteractionCompletionViolations,
      uncoveredTasks: args.report.diagnostics.uncoveredTasks,
      uncoveredBranches: args.report.diagnostics.uncoveredBranches,
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
      truncated: args.report.stateSpace.truncated,
      maxDepth: args.report.stateSpace.limits.maxDepth,
      maxMarkings: args.report.stateSpace.limits.maxMarkings,
    },
    projectedChoreographySoundness: args.report.projectedChoreographySoundness,
    reportPath: args.artifactPath,
  };
}

function crossCaseExpectationFromIsolatedWitness(
  scenario: ReturnType<typeof getWitnessScenarios>[number],
): PropertyLevelCrossCaseExpectation | null {
  const isolated = scenario.expectedIsolatedCaseAnalysis;

  return {
    caseOptionToComplete: isolated.optionToComplete,
    properInteractionCompletion: isolated.properInteractionCompletion,
    taskCoverage: isolated.taskCoverage,
    branchCoverage: isolated.branchCoverage,
    senderProgression: isolated.senderProgression,
    receiverProgression: isolated.receiverProgression,
    decisionConsistency: isolated.decisionConsistency,
  };
}

function crossCaseWitnessSkipReason(
  scenario: ReturnType<typeof getWitnessScenarios>[number],
): string {
  const isolated = scenario.expectedIsolatedCaseAnalysis;
  const projectedFailures = [
    !isolated.properInteractionCompletion
      ? "proper interaction completion"
      : null,
    !isolated.taskCoverage ? "task coverage" : null,
    !isolated.branchCoverage ? "branch coverage" : null,
  ].filter(Boolean);

  if (projectedFailures.length === 0) {
    return "The witness is not configured for cross-case analysis.";
  }

  return `${projectedFailures.join(", ")} ${
    projectedFailures.length === 1 ? "is" : "are"
  } not part of cross-case analysis.`;
}

function rawDomainSizesByAlias(
  domainsByAlias: Record<string, string[]>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(domainsByAlias)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([alias, values]) => [alias, values.length]),
  );
}

function crossCaseDomainSizesByType(
  identifierTypes: Array<{ id: string; alias: string; name: string }>,
  domains: Record<string, string[]>,
): {
  cases: number;
  participantsPerRole: Record<string, number>;
  objectsPerClass: Record<string, number>;
} {
  const participantsPerRole: Record<string, number> = {};
  const objectsPerClass: Record<string, number> = {};
  let cases = 0;

  for (const type of identifierTypes) {
    const size = domains[type.id]?.length ?? 0;
    if (type.alias === "case") {
      cases = size;
    } else if (type.name.startsWith("Role ")) {
      participantsPerRole[type.alias] = size;
    } else if (type.name.startsWith("Object ")) {
      objectsPerClass[type.alias] = size;
    }
  }

  return {
    cases,
    participantsPerRole: Object.fromEntries(
      Object.entries(participantsPerRole).sort(),
    ),
    objectsPerClass: Object.fromEntries(Object.entries(objectsPerClass).sort()),
  };
}

function assignmentMode(variant?: CrossCaseAnalysisVariant): string {
  if (!variant) {
    return "default";
  }
  if (variant.fixedParticipantsByCaseAndRole) {
    return "fixed";
  }
  return variant.id.includes("unique") ? "unique" : "unrestricted";
}

function durationSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}
