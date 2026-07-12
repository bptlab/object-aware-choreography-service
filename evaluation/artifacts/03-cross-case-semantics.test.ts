import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  buildCrossCasePetriNet,
  caseTypeId,
  computeCrossCaseTypedPetriNetLayout,
  createCrossCasePetriNetMappingContext,
  roleTypeId,
} from "../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import { serializeTypedPetriNet } from "../../src/shared/targets/typedPetriNet/index.js";
import {
  expectWellFormedTypedPetriNet,
  requireTypedIdentifierType,
} from "../../test/assertions/typedPetriNetAssertions.js";
import {
  getConstructScenarios,
  getIntegratedScenarios,
  getScenario,
  getWitnessScenarios,
  type EvaluationScenarioDefinition,
  type IntegratedScenarioDefinition,
} from "../scenarios.js";
import {
  assertEvaluationFixturesExist,
  baseOverviewEntry,
  type EvaluationOverviewEntry,
  writeEvaluationOverview,
  writeEvaluationResult,
} from "../evaluationHelpers.js";
import { assertCrossCaseSemanticsForScenario } from "../assertions/crossCaseSemanticsEvaluationAssertions.js";

const ARTIFACT_GROUP = "03-cross-case-semantics";
const overviewEntries: EvaluationOverviewEntry[] = [];

describe("Evaluation 03 Cross-Case Semantics", () => {
  after(async () => {
    await writeEvaluationOverview(ARTIFACT_GROUP, overviewEntries);
  });

  for (const scenario of applicableScenarios()) {
    it(`${scenario.id} ${scenario.title}`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const { context } = await getScenario(scenario.id);
      const options = { crossCaseClasses: [] };
      const net = buildCrossCasePetriNet(context, options);
      const mappingContext = createCrossCasePetriNetMappingContext(
        context,
        options,
      );
      const serialized = serializeTypedPetriNet(net, {
        layout: computeCrossCaseTypedPetriNetLayout({
          net,
          context: mappingContext,
        }),
      });

      expectWellFormedTypedPetriNet(net);
      if (scenario.kind !== "witness") {
        assertCrossCaseSemanticsForScenario(scenario, net, context);
      }
      requireTypedIdentifierType(net, caseTypeId());
      for (const roleId of mappingContext.roleIds) {
        requireTypedIdentifierType(net, roleTypeId(roleId));
      }
      assert.match(serialized, /typedPetriNet|tpn/i);

      const artifactPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: serialized,
        extension: "obpt-typed-pn",
      });
      overviewEntries.push(
        crossCaseSemanticsOverviewEntry({
          scenario,
          net,
          artifactPath,
          durationMs: durationSince(startedAt),
          crossCaseClasses: [],
          variantId: "case_specific",
        }),
      );
    });
  }

  for (const { scenario, variant } of structuralCrossCaseVariants()) {
    it(`${scenario.id} ${scenario.title} ${variant.id}`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const { context } = await getScenario(scenario.id);
      const options = {
        crossCaseClasses: variant.crossCaseClasses,
      };
      const net = buildCrossCasePetriNet(context, options);
      const mappingContext = createCrossCasePetriNetMappingContext(
        context,
        options,
      );
      const serialized = serializeTypedPetriNet(net, {
        layout: computeCrossCaseTypedPetriNetLayout({
          net,
          context: mappingContext,
        }),
      });

      expectWellFormedTypedPetriNet(net);
      assertCrossCaseSemanticsForScenario(scenario, net, context);
      requireTypedIdentifierType(net, caseTypeId());
      for (const roleId of mappingContext.roleIds) {
        requireTypedIdentifierType(net, roleTypeId(roleId));
      }
      assert.match(serialized, /typedPetriNet|tpn/i);

      const artifactPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: serialized,
        extension: "obpt-typed-pn",
        suffix: variant.id,
      });
      overviewEntries.push(
        crossCaseSemanticsOverviewEntry({
          scenario,
          net,
          artifactPath,
          durationMs: durationSince(startedAt),
          crossCaseClasses: variant.crossCaseClasses,
          variantId: variant.id,
        }),
      );
    });
  }
});

function applicableScenarios(): EvaluationScenarioDefinition[] {
  return [
    ...getConstructScenarios(),
    ...getIntegratedScenarios(),
    ...getWitnessScenarios(),
  ];
}

interface StructuralCrossCaseVariant {
  id: string;
  crossCaseClasses: string[];
}

function structuralCrossCaseVariants(): Array<{
  scenario: IntegratedScenarioDefinition;
  variant: StructuralCrossCaseVariant;
}> {
  return getIntegratedScenarios()
    .flatMap((scenario) =>
      distinctCrossCaseClassSets(scenario).map((crossCaseClasses) => ({
        scenario,
        variant: {
          id: structuralVariantId(crossCaseClasses),
          crossCaseClasses,
        },
      })),
    )
    .filter(({ variant }) => variant.crossCaseClasses.length > 0);
}

function distinctCrossCaseClassSets(
  scenario: IntegratedScenarioDefinition,
): string[][] {
  const byKey = new Map<string, string[]>();

  for (const variant of scenario.crossCaseVariants ?? []) {
    const crossCaseClasses = variant.crossCaseClasses.slice().sort();
    byKey.set(crossCaseClasses.join("\u0000"), crossCaseClasses);
  }

  return [...byKey.values()].sort((left, right) =>
    structuralVariantId(left).localeCompare(structuralVariantId(right)),
  );
}

function structuralVariantId(crossCaseClasses: string[]): string {
  if (crossCaseClasses.length === 0) {
    return "case_specific";
  }

  return `cross_case_${crossCaseClasses
    .map((classId) => classId.replace(/([a-z0-9])([A-Z])/g, "$1_$2"))
    .map((classId) => classId.toLowerCase())
    .join("_")}`;
}

function crossCaseSemanticsOverviewEntry(args: {
  scenario: EvaluationScenarioDefinition;
  net: ReturnType<typeof buildCrossCasePetriNet>;
  artifactPath: string;
  durationMs: number;
  crossCaseClasses: string[];
  variantId: string;
}): EvaluationOverviewEntry {
  return {
    ...baseOverviewEntry({
      artifactGroup: ARTIFACT_GROUP,
      scenario: args.scenario,
      outcome: "holds",
      expectedOutcome: "holds",
      artifactPaths: [args.artifactPath],
      durationMs: args.durationMs,
      variantId: args.variantId,
    }),
    crossCaseClasses: args.crossCaseClasses,
    domainSizes: null,
    assignmentMode: null,
    typedPlaces: args.net.places.length,
    typedTransitions: args.net.transitions.length,
    typedArcs: args.net.arcs.length,
    identifierTypes: args.net.identifierTypes.length,
    outputPath: args.artifactPath,
  };
}

function durationSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}
