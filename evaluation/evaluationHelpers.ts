import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CrossCaseObjectAwareRealizabilityReport,
} from "../src/shared/analysis/crossCaseObjectAwareRealizability/index.js";
import type {
  TypedIdentifierDomains,
  TypedPetriNet,
} from "../src/shared/targets/typedPetriNet/index.js";
import type { EvaluationScenarioDefinition } from "./scenarios.js";
import { missingFixturePaths } from "./scenarios.js";

export interface ExpectedIsolatedCaseAnalysis {
  optionToComplete: boolean;
  properInteractionCompletion: boolean;
  taskCoverage: boolean;
  branchCoverage: boolean;
  senderProgression: boolean;
  receiverProgression: boolean;
  decisionConsistency: boolean;
}

export interface ExpectedCrossCaseAnalysis {
  caseOptionToComplete: boolean;
  properInteractionCompletion: boolean;
  taskCoverage: boolean;
  branchCoverage: boolean;
  senderProgression: boolean;
  receiverProgression: boolean;
  decisionConsistency: boolean;
}

export type EvaluationResultGroup =
  | "00-validation"
  | "01-isolated-case-semantics"
  | "02-isolated-case-analysis"
  | "03-cross-case-semantics"
  | "04-cross-case-analysis"
  | "05-bspl-mapping"
  | "06-bspl-refinement";

export type EvaluationOutcome =
  | "holds"
  | "violates"
  | "rejects"
  | "skips"
  | "fails";

export interface EvaluationOverviewEntry {
  runId: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioKind: string;
  scenarioSlug: string;
  artifactGroup: EvaluationResultGroup;
  outcome: EvaluationOutcome;
  expectedOutcome?: unknown;
  artifactPaths: string[];
  durationMs?: number;
  variantId?: string;
  [key: string]: unknown;
}

type CsvColumn = {
  header: string;
  value: (row: EvaluationOverviewEntry) => unknown;
};

export async function writeEvaluationResult(args: {
  artifactGroup: EvaluationResultGroup;
  scenario: EvaluationScenarioDefinition;
  content: string;
  extension: string;
  suffix?: string;
}): Promise<string> {
  const resultDir = evaluationResultDirectory(args.artifactGroup);
  const suffix = args.suffix ? `_${args.suffix}` : "";
  const relativePath = join(
    "evaluation",
    "results",
    args.artifactGroup,
    `${args.scenario.id.toLowerCase()}_${args.scenario.slug}${suffix}.${args.extension}`,
  );

  await mkdir(resultDir, { recursive: true });
  await writeFile(join(process.cwd(), relativePath), args.content, "utf8");
  return relativePath;
}

export async function writeEvaluationOverview(
  artifactGroup: EvaluationResultGroup,
  entries: EvaluationOverviewEntry[],
): Promise<string> {
  const resultDir = evaluationResultDirectory(artifactGroup);
  const relativePath = join(
    "evaluation",
    "results",
    artifactGroup,
    "overview.json",
  );
  const sorted = entries.slice().sort(compareOverviewEntries);

  await mkdir(resultDir, { recursive: true });
  await writeFile(
    join(process.cwd(), relativePath),
    `${JSON.stringify(sorted, null, 2)}\n`,
    "utf8",
  );
  await writeEvaluationOverviewCsv(artifactGroup, sorted);
  return relativePath;
}

export function baseOverviewEntry(args: {
  artifactGroup: EvaluationResultGroup;
  scenario: EvaluationScenarioDefinition;
  outcome: EvaluationOutcome;
  expectedOutcome?: unknown;
  artifactPaths?: string[];
  durationMs?: number;
  variantId?: string;
}): EvaluationOverviewEntry {
  const variantId = args.variantId ?? "default";

  return {
    runId: `${args.scenario.id.toLowerCase()}_${variantId}`,
    scenarioId: args.scenario.id,
    scenarioTitle: args.scenario.title,
    scenarioKind: args.scenario.kind,
    scenarioSlug: args.scenario.slug,
    artifactGroup: args.artifactGroup,
    outcome: args.outcome,
    expectedOutcome: args.expectedOutcome,
    artifactPaths: args.artifactPaths ?? [],
    durationMs: args.durationMs,
    variantId,
  };
}

function evaluationResultDirectory(group: EvaluationResultGroup): string {
  return join(process.cwd(), "evaluation", "results", group);
}

async function writeEvaluationOverviewCsv(
  artifactGroup: EvaluationResultGroup,
  entries: EvaluationOverviewEntry[],
): Promise<string> {
  const resultDir = evaluationResultDirectory(artifactGroup);
  const relativePath = join(
    "evaluation",
    "results",
    artifactGroup,
    "overview.csv",
  );
  const columns = overviewCsvColumns(artifactGroup);
  const lines = [
    columns.map((column) => csvEscape(column.header)).join(","),
    ...entries.map((entry) =>
      columns
        .map((column) => csvEscape(formatCsvValue(column.value(entry))))
        .join(","),
    ),
  ];

  await mkdir(resultDir, { recursive: true });
  await writeFile(join(process.cwd(), relativePath), `${lines.join("\n")}\n`);
  return relativePath;
}

function overviewCsvColumns(
  artifactGroup: EvaluationResultGroup,
): CsvColumn[] {
  switch (artifactGroup) {
    case "00-validation":
      return [
        column("ID", "scenarioId"),
        column("Scenario", "scenarioTitle"),
        column("Target", "validationTarget"),
        column("Rejection category", "rejectionCategory"),
        column("Outcome", "outcome"),
        column("Rejected", "actualRejected"),
        column("Error message", "actualErrorMessage"),
      ];
    case "01-isolated-case-semantics":
      return [
        column("ID", "scenarioId"),
        column("Scenario", "scenarioTitle"),
        column("Kind", "scenarioKind"),
        column("Outcome", "outcome"),
        column("Places", "places"),
        column("Transitions", "transitions"),
        column("Arcs", "arcs"),
        column("Descriptors", "semanticDescriptorCount"),
        column("Descriptor kinds", "descriptorKinds"),
        column("Duration ms", (row) => formatDuration(row.durationMs)),
      ];
    case "02-isolated-case-analysis":
      return [
        column("ID", "scenarioId"),
        column("Scenario", "scenarioTitle"),
        column("Kind", "scenarioKind"),
        column("Expected", "expectedOutcome"),
        column("Outcome", "outcome"),
        column("COTC", "actual.caseOptionToComplete"),
        column("Sender progression", "actual.senderProgression"),
        column("Receiver progression", "actual.receiverProgression"),
        column("Decision consistency", "actual.decisionConsistency"),
        column("Option to complete", "projectedActual.optionToComplete"),
        column(
          "Proper completion",
          "projectedActual.properInteractionCompletion",
        ),
        column("Task coverage", "projectedActual.taskCoverage"),
        column("Branch coverage", "projectedActual.branchCoverage"),
        column(
          "Projected soundness",
          "projectedActual.holds",
        ),
        column("Violated properties", "violatedProperties"),
        column("Projected violations", "projectedViolatedProperties"),
        column(
          "COTC violations",
          "violationCounts.caseOptionToCompleteViolations",
        ),
        column(
          "Sender violations",
          "violationCounts.senderProgressionViolations",
        ),
        column(
          "Receiver violations",
          "violationCounts.receiverProgressionViolations",
        ),
        column(
          "Decision violations",
          "violationCounts.decisionConsistencyViolations",
        ),
        column("Uncovered branches", "projectedViolationCounts.uncoveredBranches"),
        column(
          "Option violations",
          "projectedViolationCounts.optionToCompleteViolations",
        ),
        column(
          "Proper completion violations",
          "projectedViolationCounts.properInteractionCompletionViolations",
        ),
        column("Uncovered tasks", "projectedViolationCounts.uncoveredTasks"),
        column("Markings", "stateSpace.markings"),
        column("Edges", "stateSpace.edges"),
        column("Truncated", "stateSpace.truncated"),
        column("Duration ms", (row) => formatDuration(row.durationMs)),
      ];
    case "03-cross-case-semantics":
      return [
        column("ID", "scenarioId"),
        column("Variant", "variantId"),
        column("Scenario", "scenarioTitle"),
        column("Kind", "scenarioKind"),
        column("Cross-case classes", "crossCaseClasses"),
        column("Outcome", "outcome"),
        column("Typed places", "typedPlaces"),
        column("Typed transitions", "typedTransitions"),
        column("Typed arcs", "typedArcs"),
        column("Identifier types", "identifierTypes"),
        column("Duration ms", (row) => formatDuration(row.durationMs)),
      ];
    case "04-cross-case-analysis":
      return [
        column("ID", "scenarioId"),
        column("Variant", "variantId"),
        column("Scenario", "scenarioTitle"),
        column("Kind", "scenarioKind"),
        column("Cross-case classes", "crossCaseClasses"),
        column("Assignment", "assignmentMode"),
        column("Cases", "domainSizes.cases"),
        column("Participants", "domainSizes.participantsPerRole"),
        column("Objects", "domainSizes.objectsPerClass"),
        column("Expected", "expectedOutcome"),
        column("Outcome", "outcome"),
        column("COTC", "actual.caseOptionToComplete"),
        column(
          "Proper completion",
          "actual.properInteractionCompletion",
        ),
        column("Task coverage", "actual.taskCoverage"),
        column("Branch coverage", "actual.branchCoverage"),
        column("Sender progression", "actual.senderProgression"),
        column("Receiver progression", "actual.receiverProgression"),
        column("Decision consistency", "actual.decisionConsistency"),
        column("Violated properties", "violatedProperties"),
        column(
          "COTC violations",
          "violationCounts.caseOptionToCompleteViolations",
        ),
        column(
          "Proper completion violations",
          "violationCounts.properInteractionCompletionViolations",
        ),
        column("Uncovered tasks", "violationCounts.uncoveredTasks"),
        column("Uncovered branches", "violationCounts.uncoveredBranches"),
        column(
          "Sender violations",
          "violationCounts.senderProgressionViolations",
        ),
        column(
          "Receiver violations",
          "violationCounts.receiverProgressionViolations",
        ),
        column(
          "Decision violations",
          "violationCounts.decisionConsistencyViolations",
        ),
        column("Markings", "stateSpace.markings"),
        column("Edges", "stateSpace.edges"),
        column("Truncated", "stateSpace.truncated"),
        column("Max markings", "stateSpace.maxMarkings"),
        column("Max depth", "stateSpace.maxDepth"),
        column("Duration ms", (row) => formatDuration(row.durationMs)),
        column("Reason", "reason"),
      ];
    case "05-bspl-mapping":
      return [
        column("ID", "scenarioId"),
        column("Scenario", "scenarioTitle"),
        column("Kind", "scenarioKind"),
        column("Expected", "expectedOutcome"),
        column("Outcome", "outcome"),
        column("Roles", "protocolMetrics.roleCount"),
        column("Messages", "protocolMetrics.messageCount"),
        column("Parameters", "protocolMetrics.parameterCount"),
        column("In parameters", "protocolMetrics.inParameterCount"),
        column("Out parameters", "protocolMetrics.outParameterCount"),
        column("Nil parameters", "protocolMetrics.nilParameterCount"),
        column(
          "Choreography traces",
          "languageComparison.choreographyTraceCount",
        ),
        column("BSPL traces", (row) =>
          getPath(row, "languageComparison.bsplTraceCount") ??
          getPath(row, "languageComparison.protocolTraceCount"),
        ),
        column("Common traces", (row) =>
          getPath(row, "languageComparison.commonTraceCount") ??
          getPath(row, "languageComparison.sharedTraceCount"),
        ),
        column("Recall", (row) =>
          formatMetric(getPath(row, "languageComparison.recall")),
        ),
        column("Precision", (row) =>
          formatMetric(getPath(row, "languageComparison.precision")),
        ),
        column(
          "Exact before refinement",
          "languageComparison.exactBeforeRefinement",
        ),
        column("Rejection category", "rejectionCategory"),
        column("Reason", (row) => row.skipReason ?? row.rejectionMessage),
        column("Duration ms", (row) => formatDuration(row.durationMs)),
      ];
    case "06-bspl-refinement":
      return [
        column("ID", "scenarioId"),
        column("Scenario", "scenarioTitle"),
        column("Kind", "scenarioKind"),
        column("Expected", "expectedOutcome"),
        column("Outcome", "outcome"),
        column("Initial recall", (row) => formatMetric(row.initialRecall)),
        column("Initial precision", (row) => formatMetric(row.initialPrecision)),
        column("Constraints", "discoveredConstraintCount"),
        column("Constraint categories", "discoveredConstraintCategories"),
        column("Refined recall", (row) => formatMetric(row.refinedRecall)),
        column("Refined precision", (row) => formatMetric(row.refinedPrecision)),
        column("Exact before", "exactBeforeRefinement"),
        column("Exact after", "exactAfterRefinement"),
        column("No refinement needed", "noRefinementNeeded"),
        column("Ablation avg precision", (row) =>
          formatMetric(
            getPath(row, "ablationSummary.averagePrecisionAfterSingleRemoval"),
          ),
        ),
        column("Ablation avg precision reduction", (row) =>
          formatMetric(
            getPath(row, "ablationSummary.averagePrecisionReductionFromFull"),
          ),
        ),
        column("Ablation min precision", (row) =>
          formatMetric(
            getPath(row, "ablationSummary.minPrecisionAfterSingleRemoval"),
          ),
        ),
        column("Ablation max precision", (row) =>
          formatMetric(
            getPath(row, "ablationSummary.maxPrecisionAfterSingleRemoval"),
          ),
        ),
        column(
          "Ablation removals with loss",
          "ablationSummary.singleRemovalsWithPrecisionLoss",
        ),
        column(
          "Ablation removals without loss",
          "ablationSummary.singleRemovalsWithoutPrecisionLoss",
        ),
        column(
          "Ablation recall preserved",
          "ablationSummary.recallPreservedForAllSingleRemovals",
        ),
        column("Ablation interpretation", "ablationInterpretation"),
        column("Reason", "skipReason"),
        column("Duration ms", (row) => formatDuration(row.durationMs)),
      ];
  }
}

function column(
  header: string,
  pathOrValue: string | ((row: EvaluationOverviewEntry) => unknown),
): CsvColumn {
  return {
    header,
    value:
      typeof pathOrValue === "string"
        ? (row) => getPath(row, pathOrValue)
        : pathOrValue,
  };
}

function getPath(row: EvaluationOverviewEntry, path: string): unknown {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (!isRecord(value)) {
      return undefined;
    }
    return value[segment];
  }, row);
}

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  if (Array.isArray(value)) {
    return value.map(formatCsvValue).filter(Boolean).join("; ");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${key}=${formatCsvValue(entryValue)}`)
      .join("; ");
  }
  return String(value);
}

function formatMetric(value: unknown): string {
  if (typeof value !== "number") {
    return "";
  }
  if (value === 0 || value === 1) {
    return String(value);
  }
  return value.toFixed(4);
}

function formatDuration(value: unknown): string {
  if (typeof value !== "number") {
    return "";
  }
  return value.toFixed(1);
}

function csvEscape(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareOverviewEntries(
  left: EvaluationOverviewEntry,
  right: EvaluationOverviewEntry,
): number {
  return (
    left.runId.localeCompare(right.runId) ||
    left.scenarioId.localeCompare(right.scenarioId) ||
    String(left.variantId ?? "default").localeCompare(
      String(right.variantId ?? "default"),
    )
  );
}

export function assertEvaluationFixturesExist(
  scenario: EvaluationScenarioDefinition,
): void {
  const missing = missingFixturePaths(scenario);

  if (missing.length > 0) {
    throw new Error(
      `Missing evaluation fixture(s) for ${scenario.id} (${scenario.title}): ${missing.join(", ")}`,
    );
  }
}

export function finiteDomainsFor(net: TypedPetriNet): TypedIdentifierDomains {
  return Object.fromEntries(
    net.identifierTypes.map((type) => {
      if (type.alias === "case") {
        return [type.id, ["case1"]];
      }

      return [type.id, [`${type.alias}_1`]];
    }),
  );
}

export function finiteDomainsByAlias(
  net: TypedPetriNet,
  valuesByAliasOrName: Record<string, string[]>,
): TypedIdentifierDomains {
  return Object.fromEntries(
    net.identifierTypes.map((type) => {
      const values =
        valuesByAliasOrName[type.alias] ?? valuesByAliasOrName[type.name];

      if (!values) {
        throw new Error(
          `Missing finite identifier domain for ${type.alias} (${type.name})`,
        );
      }

      return [type.id, values];
    }),
  );
}

export function expectIsolatedCaseAnalysisProperties(
  report: unknown,
  expected: ExpectedIsolatedCaseAnalysis,
): void {
  const parsed = report as {
    objectAwareRealizability?: { holds?: unknown };
    senderProgression?: { holds?: unknown };
    receiverProgression?: { holds?: unknown };
    decisionConsistency?: { holds?: unknown };
    projectedChoreographySoundness?: {
      optionToComplete?: { holds?: unknown };
      properInteractionCompletion?: { holds?: unknown };
      taskCoverage?: { holds?: unknown };
      branchCoverage?: { holds?: unknown };
      holds?: unknown;
    };
  };

  assert.equal(
    parsed.projectedChoreographySoundness?.optionToComplete?.holds,
    expected.optionToComplete,
  );
  assert.equal(
    parsed.projectedChoreographySoundness?.properInteractionCompletion?.holds,
    expected.properInteractionCompletion,
  );
  assert.equal(
    parsed.projectedChoreographySoundness?.taskCoverage?.holds,
    expected.taskCoverage,
  );
  assert.equal(
    parsed.projectedChoreographySoundness?.branchCoverage?.holds,
    expected.branchCoverage,
  );
  assert.equal(parsed.senderProgression?.holds, expected.senderProgression);
  assert.equal(
    parsed.receiverProgression?.holds,
    expected.receiverProgression,
  );
  assert.equal(
    parsed.decisionConsistency?.holds,
    expected.decisionConsistency,
  );
  assert.equal(
    parsed.objectAwareRealizability?.holds,
    expected.optionToComplete &&
      expected.properInteractionCompletion &&
      expected.taskCoverage &&
      expected.branchCoverage &&
      expected.senderProgression &&
      expected.receiverProgression &&
      expected.decisionConsistency,
  );
}

export function expectCrossCaseAnalysisProperties(
  report: CrossCaseObjectAwareRealizabilityReport,
  expected: ExpectedCrossCaseAnalysis,
): void {
  assert.equal(report.stateSpace.truncated, false);
  assert.equal(
    report.caseOptionToComplete.holds,
    expected.caseOptionToComplete,
  );
  assert.equal(
    report.projectedChoreographySoundness.properInteractionCompletion.holds,
    expected.properInteractionCompletion,
  );
  assert.equal(
    report.projectedChoreographySoundness.taskCoverage.holds,
    expected.taskCoverage,
  );
  assert.equal(
    report.projectedChoreographySoundness.branchCoverage.holds,
    expected.branchCoverage,
  );
  assert.equal(report.senderProgression.holds, expected.senderProgression);
  assert.equal(report.receiverProgression.holds, expected.receiverProgression);
  assert.equal(
    report.decisionConsistency.holds,
    expected.decisionConsistency,
  );
}

export function expectCrossCaseImplementedPropertiesHold(
  report: CrossCaseObjectAwareRealizabilityReport,
): void {
  assert.equal(report.caseOptionToComplete.holds, true);
  assert.equal(
    report.projectedChoreographySoundness.properInteractionCompletion.holds,
    true,
  );
  assert.equal(report.projectedChoreographySoundness.taskCoverage.holds, true);
  assert.equal(report.projectedChoreographySoundness.branchCoverage.holds, true);
  assert.equal(report.senderProgression.holds, true);
  assert.equal(report.receiverProgression.holds, true);
  assert.equal(report.decisionConsistency.holds, true);
  assert.equal(report.diagnostics.caseOptionToCompleteViolations, 0);
  assert.equal(report.diagnostics.properInteractionCompletionViolations, 0);
  assert.equal(report.diagnostics.uncoveredTasks, 0);
  assert.equal(report.diagnostics.uncoveredBranches, 0);
  assert.equal(report.diagnostics.senderProgressionViolations, 0);
  assert.equal(report.diagnostics.receiverProgressionViolations, 0);
  assert.equal(report.diagnostics.decisionConsistencyViolations, 0);
}

export function expectCrossCaseViolation(
  report: CrossCaseObjectAwareRealizabilityReport,
  kind: "sender" | "receiver" | "decision",
): void {
  if (kind === "sender") {
    assert.equal(report.senderProgression.holds, false);
    assert.ok(report.diagnostics.senderProgressionViolations > 0);
    return;
  }

  if (kind === "receiver") {
    assert.equal(report.receiverProgression.holds, false);
    assert.ok(report.diagnostics.receiverProgressionViolations > 0);
    return;
  }

  assert.equal(report.decisionConsistency.holds, false);
  assert.ok(report.diagnostics.decisionConsistencyViolations > 0);
}
