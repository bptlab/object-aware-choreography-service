import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildObjectAwareChoreographyContext } from "../../src/shared/context/objectAwareChoreographyContext.js";
import { checkCrossCaseObjectAwareRealizability } from "../../src/shared/analysis/crossCaseObjectAwareRealizability/index.js";
import { buildBspl } from "../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import { compareChoreographyAndBsplBehavior } from "../../src/shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import { discoverControlFlowConstraints } from "../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";
import { refineBsplWithControlFlowConstraints } from "../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/refineBsplWithControlFlowConstraints.js";
import {
  buildCrossCasePetriNet,
  computeCrossCaseTypedPetriNetLayout,
  createCrossCasePetriNetMappingContext,
} from "../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import { writeScenarioResult } from "../../src/shared/testing/resultWriter.js";
import {
  buildIsolatedCaseSemantics,
  buildIsolatedCaseSemanticsWithObjectAwareRealizability,
} from "../../src/shared/semantics/isolatedCaseSemantics.js";
import { serializeBspl } from "../../src/shared/targets/bspl/serialization.js";
import { serializeTypedPetriNet } from "../../src/shared/targets/typedPetriNet/index.js";
import {
  expectImplementedCrossCasePropertiesHold,
  oneIdentifierPerTypeDomains,
} from "../assertions/itemPurchaseScenarioHelpers.js";
import {
  expectMessagesForVisibleTasks,
  requireMessage,
  requireMessages,
  requirePrivateProtocolParameter,
  requireDiscoveredExclusion,
  requireDiscoveredPrecedence,
  expectNoDiscoveredPrecedence,
  expectMessageParameter,
  expectNoMessageParameter,
  expectBsplWellFormed,
  expectPetriNetContainsVisibleTasks,
  expectPetriNetContainsObjectViewPlaces,
} from "../assertions/scenarioAssertions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenarioDirectory = path.resolve(
  __dirname,
  "../resources/scenarios/order_fulfillment"
);

describe("Order Fulfillment Scenario", () => {
  it("OFS-01P validates and generates isolated-case Petri net", async () => {
    const { context } = await loadOrderFulfillmentScenario();
    const { petriNet } = await buildIsolatedCaseSemantics(context);
    const petriNetText = petriNet.toModdleDefinitions().serialize();

    assert.ok(petriNet.getPlaces().length > 0, "Expected generated places");
    assert.ok(
      petriNet.getTransitions().length > 0,
      "Expected generated transitions"
    );

    expectPetriNetContainsVisibleTasks(petriNetText, [
      "place order",
      "send invoice",
      "cancel order",
      "send payment proof",
      "request shipment 1",
      "request shipment 2",
      "request shipment 3",
      "release shipment",
      "send tracking link",
      "deliver goods 1",
      "deliver goods 2",
    ]);
    expectPetriNetContainsObjectViewPlaces(petriNetText, {
      roles: ["Buyer", "Seller", "Warehouse"],
      classes: ["Order", "Invoice", "Shipment"],
      states: [
        "created",
        "open",
        "paid",
        "approved",
        "approved_priority",
        "canceled",
        "prepared",
        "released",
        "delivered",
        "completed",
      ],
    });

    await writeScenarioResult({
      resultDirectory: "orderFulfillmentScenario",
      subdirectory: "scenarios",
      scenarioName: "OF-01 order-fulfillment-petri-net",
      content: petriNetText,
      fileExtension: "obpt-pn",
    });
  });

  it("OFS-02P generates cross-case typed Petri net for case-specific order fulfillment", async () => {
    const { context } = await loadOrderFulfillmentScenario();
    const options = { crossCaseClasses: [] };
    const typedPetriNet = buildCrossCasePetriNet(context, options);
    const mappingContext = createCrossCasePetriNetMappingContext(
      context,
      options
    );

    const typedPetriNetText = serializeTypedPetriNet(typedPetriNet, {
      layout: computeCrossCaseTypedPetriNetLayout({
        net: typedPetriNet,
        context: mappingContext,
      }),
    });

    assert.ok(
      typedPetriNet.places.length > 0,
      "Expected generated typed places"
    );
    assert.ok(
      typedPetriNet.transitions.length > 0,
      "Expected generated typed transitions"
    );

    expectTextIncludesAll(typedPetriNetText, [
      "tpn:definitions",
      "Case",
      "Buyer",
      "Seller",
      "Warehouse",
      "Order",
      "Invoice",
      "Shipment",
      "diagramShape",
      "diagramEdge",
      "place order",
      "send invoice",
      "cancel order",
      "send payment proof",
      "request shipment 1",
      "request shipment 2",
      "request shipment 3",
      "release shipment",
      "send tracking link",
      "deliver goods 1",
      "deliver goods 2",
      "Buyer Pool",
      "Seller Pool",
      "Warehouse Pool",
      "Buyer Participants",
      "Seller Participants",
      "Warehouse Participants",
      "Order Case Correlation",
      "Invoice Case Correlation",
      "Shipment Case Correlation",
      "Order Case Inclusion",
      "Invoice Case Inclusion",
      "Shipment Case Inclusion",
    ]);

    assert.equal(
      typedPetriNetText.includes("virtual initial"),
      false,
      "Cross-case typed PN must not serialize virtual initial state places"
    );
    assert.equal(
      typedPetriNetText.includes("Virtual Initial"),
      false,
      "Cross-case typed PN must not serialize virtual initial state places"
    );

    await writeScenarioResult({
      resultDirectory: "orderFulfillmentScenario",
      subdirectory: "scenarios",
      scenarioName: "OF-01a order-fulfillment-cross-case-typed-petri-net",
      content: typedPetriNetText,
      fileExtension: "obpt-typed-pn",
    });
  });

  it("OFS-03P object-aware realizability holds", async () => {
    const { context } = await loadOrderFulfillmentScenario();
    const { objectAwareRealizabilityReport } =
      buildIsolatedCaseSemanticsWithObjectAwareRealizability(context);

    assert.equal(
      objectAwareRealizabilityReport.objectAwareRealizability.holds,
      true,
    );

    await writeScenarioResult({
      resultDirectory: "orderFulfillmentScenario",
      subdirectory: "scenarios",
      scenarioName: "OF-02 order-fulfillment-object-aware-realizability",
      content: JSON.stringify(objectAwareRealizabilityReport, null, 2),
      fileExtension: "json",
    });
  });

  it("OFS-04P implemented cross-case checks hold with case-specific objects", async () => {
    const { context } = await loadOrderFulfillmentScenario();
    const typedPetriNet = buildCrossCasePetriNet(context, {
      crossCaseClasses: [],
    });
    const report = checkCrossCaseObjectAwareRealizability({
      net: typedPetriNet,
      domains: oneIdentifierPerTypeDomains(typedPetriNet),
      maxMarkings: 300000,
      maxDepth: 100,
    });

    expectImplementedCrossCasePropertiesHold(report);

    await writeScenarioResult({
      resultDirectory: "orderFulfillmentScenario",
      subdirectory: "scenarios",
      scenarioName: "OF-02a order-fulfillment-cross-case-receiver-progression",
      content: JSON.stringify(report, null, 2),
      fileExtension: "json",
    });
  });

  it("OFS-05P generates a well-formed BSPL protocol", async () => {
    const { context } = await loadOrderFulfillmentScenario();
    const { protocol } = buildBspl(context);
    const text = serializeBspl(protocol);

    assert.ok(text.includes("roles "), "Expected BSPL roles declaration");
    assert.ok(
      text.includes("parameters out case_id key, out completed"),
      "Expected public case/completion parameters"
    );
    assert.ok(protocol.messages.length > 0, "Expected BSPL messages");
    expectMessagesForVisibleTasks(protocol, [
      "place-order",
      "send-invoice",
      "cancel-order",
      "send-payment-proof",
      "request-shipment-1",
      "request-shipment-2",
      "request-shipment-3",
      "release-shipment",
      "send-tracking-link",
      "deliver-goods-1",
      "deliver-goods-2",
    ]);
    expectBsplWellFormed(protocol);

    await writeScenarioResult({
      resultDirectory: "orderFulfillmentScenario",
      subdirectory: "scenarios",
      scenarioName: "OF-03 order-fulfillment-bspl",
      content: text,
      fileExtension: "bspl",
    });
  });

  it("OFS-06P supports overlapping order state signatures", async () => {
    const { context } = await loadOrderFulfillmentScenario(
      withOverlappingApprovedSignatures
    );
    const { protocol } = buildBspl(context);

    expectMessagesForVisibleTasks(protocol, [
      "request-shipment-1",
      "request-shipment-2",
      "request-shipment-3",
    ]);

    const approvedMessage = requireMessage(protocol, "request-shipment-1");
    expectMessageParameter(approvedMessage, "out", "attribute_order_approved");
    expectMessageParameter(approvedMessage, "out", "attribute_order_regular");
    expectMessageParameter(approvedMessage, "nil", "attribute_order_priority");
    expectNoMessageParameter(
      approvedMessage,
      "nil",
      "attribute_order_approved"
    );

    const priorityMessage = requireMessage(protocol, "request-shipment-2");
    expectMessageParameter(priorityMessage, "out", "attribute_order_approved");
    expectMessageParameter(priorityMessage, "out", "attribute_order_priority");
    expectMessageParameter(priorityMessage, "nil", "attribute_order_regular");
    expectNoMessageParameter(
      priorityMessage,
      "nil",
      "attribute_order_approved"
    );
  });

  it("OFS-07P compares choreography and BSPL behavior", async () => {
    const { context } = await loadOrderFulfillmentScenario();
    const { protocol } = buildBspl(context);
    const comparison = compareChoreographyAndBsplBehavior(context, protocol);

    assert.ok(comparison.choreographyTraceCount > 0);
    assert.ok(comparison.protocolTraceCount > 0);
    assert.ok(
      comparison.sharedTraceCount > 0,
      "Expected at least one shared choreography/BSPL trace"
    );
    assert.ok(comparison.recall > 0, "Expected positive behavior recall");
    assert.equal(
      comparison.recall,
      1,
      "Expected BSPL behavior to cover all choreography traces"
    );
    assert.equal(
      comparison.choreographyTraceCount,
      3,
      "Expected exactly the three complete order-fulfillment choreography paths"
    );
    assert.equal(
      comparison.sharedTraceCount,
      3,
      "Expected all choreography traces to be admitted by the initial BSPL protocol"
    );
    assert.ok(
      comparison.protocolTraceCount > comparison.choreographyTraceCount,
      "Expected initial BSPL protocol to admit relaxed behavior before refinement"
    );
    assert.ok(
      comparison.precision < 1,
      "Expected initial BSPL protocol to be less precise than the choreography"
    );

    await writeScenarioResult({
      resultDirectory: "orderFulfillmentScenario",
      subdirectory: "scenarios",
      scenarioName: "OF-04 order-fulfillment-behavior-comparison",
      content: JSON.stringify(comparison, null, 2),
      fileExtension: "json",
    });
  });

  it("OFS-08P discovers and applies relaxation constraints", async () => {
    const { context } = await loadOrderFulfillmentScenario();
    const { protocol } = buildBspl(context);
    const discovery = discoverControlFlowConstraints(context, protocol);

    const refinedProtocol = refineBsplWithControlFlowConstraints(
      protocol,
      discovery.constraints
    );
    const refinedComparison = compareChoreographyAndBsplBehavior(
      context,
      refinedProtocol
    );
    const exclusionParameter = "cf_excl_cancel-order_send-payment-proof";

    assert.ok(refinedProtocol.messages.length > 0);
    assert.ok(refinedComparison.protocolTraceCount > 0);
    const paymentCancelExclusion = requireDiscoveredExclusion(
      discovery.constraints,
      "cancel-order",
      "send-payment-proof"
    );
    assert.equal(paymentCancelExclusion.source.reason, "eventBasedSplit");
    for (const taskName of ["request-shipment-1", "request-shipment-2"]) {
      requireDiscoveredPrecedence(
        discovery.constraints,
        "send-payment-proof",
        taskName
      );
      expectNoDiscoveredPrecedence(
        discovery.constraints,
        "send-invoice",
        taskName
      );
    }
    requirePrivateProtocolParameter(refinedProtocol, exclusionParameter);
    for (const taskName of ["cancel-order", "send-payment-proof"]) {
      for (const message of requireMessages(refinedProtocol, taskName)) {
        expectMessageParameter(message, "out", exclusionParameter);
      }
    }
    assert.equal(refinedComparison.recall, 1);
    assert.equal(refinedComparison.precision, 1);
    assert.deepEqual(refinedComparison.protocolOnly, []);
    assert.equal(refinedComparison.choreographyTraceCount, 3);
    assert.equal(refinedComparison.protocolTraceCount, 3);
    assert.equal(refinedComparison.sharedTraceCount, 3);

    await writeScenarioResult({
      resultDirectory: "orderFulfillmentScenario",
      subdirectory: "scenarios",
      scenarioName: "OF-05 order-fulfillment-relaxation",
      content: JSON.stringify(
        {
          discoveredConstraints: discovery.constraints,
          initialComparison: discovery.comparison,
          refinedComparison,
        },
        null,
        2
      ),
      fileExtension: "json",
    });

    await writeScenarioResult({
      resultDirectory: "orderFulfillmentScenario",
      subdirectory: "scenarios",
      scenarioName: "OF-05 order-fulfillment-relaxation",
      content: serializeBspl(refinedProtocol),
      fileExtension: "bspl",
    });
  });
});

async function loadOrderFulfillmentScenario(
  transformLifecycle: (text: string) => string = (text) => text
) {
  const [choreography, sharedDataModel, sharedLifecycle] = await Promise.all([
    readScenarioFile("choreography.chor"),
    readScenarioFile("shared_data_model.obpt-cd"),
    readScenarioFile("shared_object_lifecycles.obpt-sts"),
  ]);

  return {
    context: await buildObjectAwareChoreographyContext({
      choreography,
      shared_data_model: sharedDataModel,
      shared_object_lifecycles: transformLifecycle(sharedLifecycle),
    }),
  };
}

async function readScenarioFile(fileName: string): Promise<string> {
  return readFile(path.join(scenarioDirectory, fileName), "utf8");
}

function expectTextIncludesAll(
  text: string,
  expectedFragments: string[]
): void {
  for (const expectedFragment of expectedFragments) {
    assert.ok(
      text.includes(expectedFragment),
      `Expected generated typed Petri net to include ${expectedFragment}`
    );
  }
}

function withOverlappingApprovedSignatures(lifecycleText: string): string {
  return lifecycleText
    .replace(
      /name="approved&#10;&#10;\{regular\}"/,
      'name="approved&#10;&#10;{approved, regular}"'
    )
    .replace(
      /name="approved_priority&#10;&#10;\{priority\}"/,
      'name="approved_priority&#10;&#10;{approved, priority}"'
    );
}
