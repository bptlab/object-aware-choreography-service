import assert from "node:assert/strict";
import { describe, it } from "node:test";
import run, { dispatchToolInvocation } from "../../src/service.js";
import { ToolIds } from "../../src/shared/service/toolTypes.js";
import { buildCrossCasePetriNet } from "../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import type {
  TypedIdentifierDomains,
  TypedPetriNet,
} from "../../src/shared/targets/typedPetriNet/index.js";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../fixtures/fixtureIds.js";
import {
  contextFromFixtures,
  serializedInputFromFixtures,
  type FixtureTriple,
} from "../fixtures/contextFromFixtures.js";
import {
  allFixturesExist,
  loadFixtureText,
} from "../fixtures/fixtureLoader.js";

describe("Service Infrastructure Fixtures", () => {
  const basicFixtures = {
    choreography: Choreographies.c01TaskNoClass,
    sharedDataModel: SharedDataModels.d01OneClass,
    sharedLifecycle: SharedLifecycles.l01CreateSingleState,
  };

  serviceSmoke(
    "SINF-01P GenerateIsolatedCasePetriNet returns PNML content",
    basicFixtures,
    async (fixtures) => {
      const result = await dispatchToolInvocation({
        toolId: ToolIds.GenerateIsolatedCasePetriNet,
        input: await serializedInputFromFixtures(fixtures),
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "generatedModel");
      assert.equal(output.format, "pnml");
      assert.equal(typeof output.content, "string");
      assert.ok(output.content.length > 0);
    },
  );

  serviceSmoke(
    "SINF-02P IsolatedCaseObjectAwareRealizability returns an analysis report",
    basicFixtures,
    async (fixtures) => {
      const result = await dispatchToolInvocation({
        toolId: ToolIds.IsolatedCaseObjectAwareRealizability,
        input: await serializedInputFromFixtures(fixtures),
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "analysisReport");
      assert.equal(output.format, "json");
      assert.ok(output.content);
    },
  );

  serviceSmoke(
    "SINF-03P GenerateCrossCasePetriNet returns typed Petri-net content",
    basicFixtures,
    async (fixtures) => {
      const result = await dispatchToolInvocation({
        toolId: ToolIds.GenerateCrossCasePetriNet,
        input: await serializedInputFromFixtures(fixtures),
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "generatedModel");
      assert.equal(output.format, "obpt-typed-pn");
      assert.equal(typeof output.content, "string");
      assert.ok(output.content.length > 0);
    },
  );

  serviceSmoke(
    "SINF-04P CrossCaseObjectAwareRealizability returns an analysis report",
    basicFixtures,
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);
      const typedPetriNet = buildCrossCasePetriNet(context, {
        crossCaseClasses: [],
      });
      const result = await dispatchToolInvocation({
        toolId: ToolIds.CrossCaseObjectAwareRealizability,
        input: {
          ...(await serializedInputFromFixtures(fixtures)),
          domains: finiteDomainsFor(typedPetriNet),
          maxMarkings: 20000,
        },
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "analysisReport");
      assert.equal(output.format, "json");
      assert.ok(output.content);
      assert.equal(output.metadata?.truncated, false);
    },
  );

  serviceSmoke(
    "SINF-05P GenerateBspl returns BSPL content with sanitized parameter names",
    {
      choreography: Choreographies.c04CommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const result = await dispatchToolInvocation({
        toolId: ToolIds.GenerateBspl,
        input: await serializedInputFromFixtures(fixtures),
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "generatedModel");
      assert.equal(output.format, "bspl");
      assert.equal(typeof output.content, "string");
      assert.match(output.content, /\bprivate attribute_classa_a-id\b/);
      assert.match(output.content, /\bout attribute_classa_a-id\b/);
    },
  );

  serviceSmoke(
    "SINF-06P CompareSendTraceLanguages returns an analysis report",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const input = await serializedInputFromFixtures(fixtures);
      const bsplResult = await dispatchToolInvocation({
        toolId: ToolIds.GenerateBspl,
        input,
      });
      const [bsplOutput] = bsplResult.outputs;

      assert.equal(bsplOutput.kind, "generatedModel");
      assert.equal(typeof bsplOutput.content, "string");

      const result = await dispatchToolInvocation({
        toolId: ToolIds.CompareSendTraceLanguages,
        input: {
          ...input,
          bspl: bsplOutput.content,
        },
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "analysisReport");
      assert.equal(output.format, "json");
      assert.ok(output.content);
    },
  );

  serviceSmoke(
    "SINF-07P DiscoverControlFlowConstraints returns an analysis report",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const input = await serializedInputFromFixtures(fixtures);
      const bsplResult = await dispatchToolInvocation({
        toolId: ToolIds.GenerateBspl,
        input,
      });
      const [bsplOutput] = bsplResult.outputs;

      assert.equal(bsplOutput.kind, "generatedModel");
      assert.equal(typeof bsplOutput.content, "string");

      const result = await dispatchToolInvocation({
        toolId: ToolIds.DiscoverControlFlowConstraints,
        input: {
          ...input,
          bspl: bsplOutput.content,
        },
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "analysisReport");
      assert.equal(output.format, "json");
      assert.ok(output.content);
    },
  );

  serviceSmoke(
    "SINF-08P RefineBspl returns a refined BSPL protocol",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const input = await serializedInputFromFixtures(fixtures);
      const bsplResult = await dispatchToolInvocation({
        toolId: ToolIds.GenerateBspl,
        input,
      });
      const [bsplOutput] = bsplResult.outputs;

      assert.equal(bsplOutput.kind, "generatedModel");
      assert.equal(typeof bsplOutput.content, "string");

      const discoveryResult = await dispatchToolInvocation({
        toolId: ToolIds.DiscoverControlFlowConstraints,
        input: {
          ...input,
          bspl: bsplOutput.content,
        },
      });
      const [discoveryOutput] = discoveryResult.outputs;

      assert.equal(discoveryOutput.kind, "analysisReport");
      assert.ok(discoveryOutput.content);

      const refinementResult = await dispatchToolInvocation({
        toolId: ToolIds.RefineBspl,
        input: {
          bspl: bsplOutput.content,
          constraints: JSON.stringify(discoveryOutput.content),
        },
      });
      const [refinementOutput] = refinementResult.outputs;

      assert.equal(refinementOutput.kind, "generatedModel");
      assert.equal(refinementOutput.format, "bspl");
      assert.equal(typeof refinementOutput.content, "string");
      assert.match(refinementOutput.content, /\bcf_prec_/);
    },
  );

  it("SINF-09P manifest declares exactly the active tool ids", async () => {
    const manifest = await loadManifest();

    assert.equal("input" in manifest, false);
    assert.equal("output" in manifest, false);
    assert.ok(manifest.lastSeen instanceof Date);
    assert.deepEqual(new Set(manifest.tools.map((tool) => tool.id)), new Set([
      ToolIds.GenerateIsolatedCasePetriNet,
      ToolIds.IsolatedCaseObjectAwareRealizability,
      ToolIds.GenerateCrossCasePetriNet,
      ToolIds.CrossCaseObjectAwareRealizability,
      ToolIds.GenerateBspl,
      ToolIds.CompareSendTraceLanguages,
      ToolIds.DiscoverControlFlowConstraints,
      ToolIds.RefineBspl,
    ]));
    assert.ok(
      manifest.tools.every(
        (tool) =>
          typeof tool.category === "string" &&
          tool.input.length > 0 &&
          tool.output.length > 0,
      ),
    );
  });

  it("SINF-10P every declared manifest tool is routed by the dispatcher", async () => {
    const manifest = await loadManifest();

    for (const tool of manifest.tools) {
      const result = await dispatchToolInvocation({
        toolId: tool.id,
        input: {},
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "toolError");
      assert.doesNotMatch(output.message, /Unknown tool id/);
    }
  });

  it("SINF-11N invalid tool id returns structured error", async () => {
    const result = await dispatchToolInvocation({
      toolId: "invalid-tool-id",
      input: {},
    });
    const [output] = result.outputs;

    assert.equal(output.kind, "toolError");
  });

  it("SINF-12N invalid input returns structured validation error", async () => {
    const result = await dispatchToolInvocation({
      toolId: ToolIds.GenerateIsolatedCasePetriNet,
      input: {},
    });
    const [output] = result.outputs;

    assert.equal(output.kind, "toolError");
    assert.match(output.message, /missing string field/i);
  });

  it("SINF-13N missing fixture is reported clearly by test loader", async () => {
    await assert.rejects(
      () => loadFixtureText("test/resources/fixtures/choreographies/missing.chor"),
      /Missing fixture: test\/resources\/fixtures\/choreographies\/missing\.chor/,
    );
  });

  serviceSmoke(
    "SINF-14P backend service payload returns file output",
    {
      choreography: Choreographies.c04CommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const result = await run({
        toolId: ToolIds.GenerateBspl,
        payload: await serializedInputFromFixtures(fixtures),
      });

      assert.equal(result.error, undefined);
      assert.equal(typeof result.bspl_protocol, "string");
      assert.match(result.bspl_protocol as string, /protocol/i);
    },
  );

  serviceSmoke(
    "SINF-15P backend service payload returns scalar analysis outputs",
    basicFixtures,
    async (fixtures) => {
      const result = await run({
        toolId: ToolIds.IsolatedCaseObjectAwareRealizability,
        payload: await serializedInputFromFixtures(fixtures),
      });

      assert.equal(result.error, undefined);
      assert.equal(result.object_aware_realizable, true);
      assert.equal(result.projected_choreography_soundness, true);
      assert.equal(result.option_to_complete, true);
      assert.equal(result.proper_interaction_completion, true);
      assert.equal(result.task_coverage, true);
      assert.equal(result.branch_coverage, true);
      assert.equal(result.sender_progression, true);
      assert.equal(result.receiver_progression, true);
      assert.equal(result.decision_consistency, true);
      assert.equal(result.truncated, false);
      assert.equal(result.witness_path, "");
    },
  );

  serviceSmoke(
    "SINF-16P backend cross-case config with domain limits is accepted",
    basicFixtures,
    async (fixtures) => {
      const result = await run({
        toolId: ToolIds.CrossCaseObjectAwareRealizability,
        payload: {
          ...(await serializedInputFromFixtures(fixtures)),
          "cross-case_config": JSON.stringify({
            crossCaseClasses: [],
            domainLimits: {
              cases: 1,
              participantsPerRole: {
                RoleA: 1,
                RoleB: 1,
              },
              objectsPerClass: {
                ClassA: 1,
              },
            },
            maxMarkings: 20000,
          }),
        },
      });

      assert.equal(result.error, undefined);
      assert.equal(result.object_aware_realizable, true);
      assert.equal(result.projected_choreography_soundness, true);
      assert.equal(result.option_to_complete, true);
      assert.equal(result.proper_interaction_completion, true);
      assert.equal(result.task_coverage, true);
      assert.equal(result.branch_coverage, true);
      assert.equal(result.sender_progression, true);
      assert.equal(result.receiver_progression, true);
      assert.equal(result.decision_consistency, true);
      assert.equal(result.truncated, false);
    },
  );

  serviceSmoke(
    "SINF-17N backend cross-case config rejects invalid domain limits",
    basicFixtures,
    async (fixtures) => {
      const result = await run({
        toolId: ToolIds.CrossCaseObjectAwareRealizability,
        payload: {
          ...(await serializedInputFromFixtures(fixtures)),
          "cross-case_config": JSON.stringify({
            domainLimits: {
              cases: 1,
              participantsPerRole: {
                RoleA: "one",
              },
              objectsPerClass: {},
            },
          }),
        },
      });

      assert.match(result.error ?? "", /cross-case config|domain/i);
    },
  );

  serviceSmoke(
    "SINF-18P backend witness path is readable",
    {
      choreography: Choreographies.c32ReceiveBlockingCommunication,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l13LocalDecisionDifferentRoles,
    },
    async (fixtures) => {
      const result = await run({
        toolId: ToolIds.IsolatedCaseObjectAwareRealizability,
        payload: await serializedInputFromFixtures(fixtures),
      });

      assert.equal(result.object_aware_realizable, false);
      assert.equal(result.receiver_progression, false);
      assert.equal(typeof result.witness_path, "string");
      assert.match(result.witness_path as string, / -> /);
      assert.doesNotMatch(result.witness_path as string, /\([^()]+\)/);
      assert.doesNotMatch(result.witness_path as string, /\[[^\]]+\]/);
    },
  );
});

function serviceSmoke(
  name: string,
  fixtures: FixtureTriple,
  run: (fixtures: FixtureTriple) => Promise<void>,
): void {
  if (!allFixturesExist(fixtures)) {
    throw new Error(`Missing fixtures for scenario "${name}"`);
  }

  it(name, () => run(fixtures));
}

async function loadManifest(): Promise<typeof import("../../src/manifest.js").manifest> {
  process.env.SERVICE_URL ??= "http://localhost:3000";
  process.env.LOCAL_PORT ??= "3000";
  process.env.SERVICE_MANAGER_URL ??= "http://localhost:4000";
  process.env.BACKEND_API_KEY ??= "test-api-key";
  process.env.BACKEND_API_KEY_HEADER ??= "x-test-api-key";

  return (await import("../../src/manifest.js")).manifest;
}

function finiteDomainsFor(net: TypedPetriNet): TypedIdentifierDomains {
  return Object.fromEntries(
    net.identifierTypes.map((type) => {
      if (type.alias === "case") {
        return [type.id, ["case1"]];
      }

      return [type.id, [`${type.alias}_1`]];
    }),
  );
}
