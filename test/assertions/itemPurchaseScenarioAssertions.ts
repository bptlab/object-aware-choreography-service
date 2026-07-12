import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildObjectAwareChoreographyContext } from "../../src/shared/context/objectAwareChoreographyContext.js";
import {
  buildCrossCasePetriNet,
  computeCrossCaseTypedPetriNetLayout,
  createCrossCasePetriNetMappingContext,
} from "../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import {
  checkCrossCaseObjectAwareRealizability,
  type CrossCaseObjectAwareRealizabilityReport,
} from "../../src/shared/analysis/crossCaseObjectAwareRealizability/index.js";
import { writeScenarioResult } from "../../src/shared/testing/resultWriter.js";
import {
  serializeTypedPetriNet,
  type TypedIdentifierDomains,
  type TypedPetriNet,
} from "../../src/shared/targets/typedPetriNet/index.js";

export async function loadItemPurchaseScenario(args: {
  scenarioDirectory: string;
  lifecycleFileName: string;
}) {
  const [choreography, sharedDataModel, sharedLifecycle] = await Promise.all([
    readFile(path.join(args.scenarioDirectory, "choreography.chor"), "utf8"),
    readFile(
      path.join(args.scenarioDirectory, "shared_data_model.obpt-cd"),
      "utf8"
    ),
    readFile(path.join(args.scenarioDirectory, args.lifecycleFileName), "utf8"),
  ]);

  return {
    context: await buildObjectAwareChoreographyContext({
      choreography,
      shared_data_model: sharedDataModel,
      shared_object_lifecycles: sharedLifecycle,
    }),
  };
}

export async function buildAndWriteCrossCaseTypedPetriNet(args: {
  context: Awaited<ReturnType<typeof loadItemPurchaseScenario>>["context"];
  resultDirectory: string;
  scenarioName: string;
  crossCaseClasses: string[];
  participantIdsByRole?: Record<string, string[]>;
}): Promise<TypedPetriNet> {
  const options = {
    crossCaseClasses: args.crossCaseClasses,
    participantIdsByRole: args.participantIdsByRole,
  };
  const typedPetriNet = buildCrossCasePetriNet(args.context, options);
  const mappingContext = createCrossCasePetriNetMappingContext(
    args.context,
    options
  );

  await writeScenarioResult({
    resultDirectory: args.resultDirectory,
    subdirectory: "scenarios",
    scenarioName: args.scenarioName,
    content: serializeTypedPetriNet(typedPetriNet, {
      layout: computeCrossCaseTypedPetriNetLayout({
        net: typedPetriNet,
        context: mappingContext,
      }),
    }),
    fileExtension: "obpt-typed-pn",
  });

  return typedPetriNet;
}

export function finiteDomainsByAlias(
  net: TypedPetriNet,
  valuesByAliasOrName: Record<string, string[]>
): TypedIdentifierDomains {
  return Object.fromEntries(
    net.identifierTypes.map((type) => {
      const values =
        valuesByAliasOrName[type.alias] ?? valuesByAliasOrName[type.name];

      if (!values) {
        throw new Error(
          `Missing finite identifier domain for ${type.alias} (${type.name})`
        );
      }

      return [type.id, values];
    })
  );
}

export function oneIdentifierPerTypeDomains(
  net: TypedPetriNet
): TypedIdentifierDomains {
  return Object.fromEntries(
    net.identifierTypes.map((type) => [
      type.id,
      [type.alias === "case" ? "case1" : `${compactId(type.alias)}1`],
    ])
  );
}

export function checkCrossCaseObjectAwareRealizabilityForScenario(args: {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
  maxMarkings?: number;
  maxDepth?: number;
}): CrossCaseObjectAwareRealizabilityReport {
  return checkCrossCaseObjectAwareRealizability({
    net: args.net,
    domains: args.domains,
    maxMarkings: args.maxMarkings ?? 300000,
    maxDepth: args.maxDepth ?? 100,
  });
}

export function expectImplementedCrossCasePropertiesHold(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  expectCaseOptionToCompleteHolds(report);
  expectSenderProgressionHolds(report);
  expectReceiverProgressionHolds(report);
  expectDecisionConsistencyHolds(report);
}

export function expectCaseOptionToCompleteHolds(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.stateSpace.truncated, false);
  assert.equal(report.caseOptionToComplete.holds, true);
  assert.equal(report.diagnostics.caseOptionToCompleteViolations, 0);
  assert.deepEqual(report.caseOptionToComplete.violations, []);
}

export function expectReceiverProgressionHolds(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.stateSpace.truncated, false);
  assert.equal(report.receiverProgression.holds, true);
  assert.equal(report.diagnostics.receiverProgressionViolations, 0);
  assert.deepEqual(report.receiverProgression.violations, []);
}

export function expectReceiverProgressionViolated(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.stateSpace.truncated, false);
  assert.equal(report.receiverProgression.holds, false);
  assert.ok(report.diagnostics.receiverProgressionViolations > 0);
  assert.ok(report.receiverProgression.violations.length > 0);
}

export function expectSenderProgressionHolds(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.stateSpace.truncated, false);
  assert.equal(report.senderProgression.holds, true);
  assert.equal(report.diagnostics.senderProgressionViolations, 0);
  assert.deepEqual(report.senderProgression.violations, []);
}

export function expectSenderProgressionViolated(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.stateSpace.truncated, false);
  assert.equal(report.senderProgression.holds, false);
  assert.ok(report.diagnostics.senderProgressionViolations > 0);
  assert.ok(report.senderProgression.violations.length > 0);
}

export function expectDecisionConsistencyHolds(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.stateSpace.truncated, false);
  assert.equal(report.decisionConsistency.holds, true);
  assert.equal(report.diagnostics.decisionConsistencyViolations, 0);
  assert.deepEqual(report.decisionConsistency.violations, []);
}

export function expectOnlyReceiverProgressionViolated(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  expectSenderProgressionHolds(report);
  expectReceiverProgressionViolated(report);
  expectDecisionConsistencyHolds(report);
}

export function expectOnlySenderAndReceiverProgressionViolated(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  expectSenderProgressionViolated(report);
  expectReceiverProgressionViolated(report);
  expectDecisionConsistencyHolds(report);
}

export function expectTextIncludesAll(text: string, fragments: string[]): void {
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `Expected text to include ${fragment}`);
  }
}

function compactId(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "");
}
