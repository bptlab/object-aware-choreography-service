import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { buildPetriNetWithSemantics } from "../../src/shared/mappings/objectAwareChoreographyToPetriNet/buildPetriNet.js";
import { expectWellFormedPetriNet } from "../../test/assertions/petriNetAssertions.js";
import {
  getConstructScenarios,
  getIntegratedScenarios,
  getScenario,
  getWitnessScenarios,
  type EvaluationScenarioDefinition,
} from "../scenarios.js";
import {
  assertEvaluationFixturesExist,
  baseOverviewEntry,
  type EvaluationOverviewEntry,
  writeEvaluationOverview,
  writeEvaluationResult,
} from "../evaluationHelpers.js";
import { assertIsolatedCaseSemanticsForScenario } from "../assertions/isolatedCaseSemanticsEvaluationAssertions.js";

const ARTIFACT_GROUP = "01-isolated-case-semantics";
const overviewEntries: EvaluationOverviewEntry[] = [];

describe("Evaluation 01 Isolated-Case Semantics", () => {
  after(async () => {
    await writeEvaluationOverview(ARTIFACT_GROUP, overviewEntries);
  });

  for (const scenario of applicableScenarios()) {
    it(`${scenario.id} ${scenario.title}`, async () => {
      const startedAt = performance.now();
      assertEvaluationFixturesExist(scenario);

      const { context } = await getScenario(scenario.id);
      const isolated = buildPetriNetWithSemantics({
        choreography: context.choreography,
        dataModel: context.dataModel,
        lifecycleModel: context.lifecycleModel,
        objectReferences: context.objectReferences,
        taskNameIndex: context.taskNameIndex,
      });
      const { petriNet } = isolated;
      const serialized = petriNet.toModdleDefinitions().serialize();

      expectWellFormedPetriNet(petriNet);
      if (scenario.kind !== "witness") {
        assertIsolatedCaseSemanticsForScenario(
          scenario,
          petriNet,
          context,
          isolated,
        );
      }
      assert.ok(serialized.length > 0, "Expected serialized isolated Petri net");

      const artifactPath = await writeEvaluationResult({
        artifactGroup: ARTIFACT_GROUP,
        scenario,
        content: serialized,
        extension: "obpt-pn",
      });
      overviewEntries.push({
        ...baseOverviewEntry({
          artifactGroup: ARTIFACT_GROUP,
          scenario,
          outcome: "holds",
          expectedOutcome: "holds",
          artifactPaths: [artifactPath],
          durationMs: durationSince(startedAt),
        }),
        places: petriNet.getPlaces().length,
        transitions: petriNet.getTransitions().length,
        arcs: petriNet.getArcs().length,
        semanticDescriptorCount:
          Object.keys(isolated.semantics.places).length +
          Object.keys(isolated.semantics.transitions).length,
        descriptorKinds: descriptorKindCounts(isolated.semantics),
        outputPath: artifactPath,
      });
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

function descriptorKindCounts(semantics: {
  places: Record<string, { kind: string }>;
  transitions: Record<string, { kind: string }>;
}): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const descriptor of [
    ...Object.values(semantics.places),
    ...Object.values(semantics.transitions),
  ]) {
    counts[descriptor.kind] = (counts[descriptor.kind] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort());
}

function durationSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 1000) / 1000;
}
