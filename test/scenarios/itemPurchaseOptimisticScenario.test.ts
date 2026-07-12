import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { compareChoreographyAndBsplBehavior } from "../../src/shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import { discoverControlFlowConstraints } from "../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";
import { refineBsplWithControlFlowConstraints } from "../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/refineBsplWithControlFlowConstraints.js";
import { buildBspl } from "../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import { writeScenarioResult } from "../../src/shared/testing/resultWriter.js";
import {
  buildIsolatedCaseSemantics,
  buildIsolatedCaseSemanticsWithObjectAwareRealizability,
} from "../../src/shared/semantics/isolatedCaseSemantics.js";
import { serializeBspl } from "../../src/shared/targets/bspl/serialization.js";
import {
  expectBsplWellFormed,
  expectMessagesForVisibleTasks,
  expectPetriNetContainsObjectViewPlaces,
  expectPetriNetContainsVisibleTasks,
} from "../assertions/scenarioAssertions.js";
import {
  buildAndWriteCrossCaseTypedPetriNet,
  checkCrossCaseObjectAwareRealizabilityForScenario,
  expectImplementedCrossCasePropertiesHold,
  expectOnlyReceiverProgressionViolated,
  expectTextIncludesAll,
  finiteDomainsByAlias,
  loadItemPurchaseScenario,
} from "../assertions/itemPurchaseScenarioHelpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenarioDirectory = path.resolve(
  __dirname,
  "../resources/scenarios/item_purchase_optimistic"
);
const resultDirectory = "itemPurchaseOptimisticScenario";
const visibleTasks = [
  "request item",
  "offer item",
  "decline offer",
  "place order",
  "accept order",
  "decline order",
  "ship item",
  "decline request",
];
const bsplTasks = visibleTasks.map((task) => task.replaceAll(" ", "-"));

describe("Item Purchase Optimistic Scenario", () => {
  it("IPOS-01P loads the object-aware choreography context", async () => {
    const { context } = await loadOptimisticScenario();

    assert.ok(context.choreography);
    assert.ok(
      context.dataModel.classes.some((dataClass) => dataClass.id === "Item")
    );
    assert.ok(
      context.dataModel.classes.some((dataClass) => dataClass.id === "Order")
    );
  });

  it("IPOS-02P validates and generates isolated-case Petri net", async () => {
    const { context } = await loadOptimisticScenario();
    const { petriNet } = await buildIsolatedCaseSemantics(context);
    const petriNetText = petriNet.toModdleDefinitions().serialize();

    assert.ok(petriNet.getPlaces().length > 0);
    assert.ok(petriNet.getTransitions().length > 0);
    expectPetriNetContainsVisibleTasks(petriNetText, visibleTasks);
    expectPetriNetContainsObjectViewPlaces(petriNetText, {
      roles: ["Buyer", "Seller"],
      classes: ["Item", "Order"],
      states: [
        "created",
        "accepted",
        "rejected",
        "available",
        "ordered",
        "packed",
        "delivered",
      ],
    });

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPO-01 item-purchase-optimistic-petri-net",
      content: petriNetText,
      fileExtension: "obpt-pn",
    });
  });

  it("IPOS-03P generates cross-case typed Petri net with cross-case Item", async () => {
    const { context } = await loadOptimisticScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName:
        "IPO-02 item-purchase-optimistic-cross-case-typed-petri-net",
      crossCaseClasses: ["Item"],
    });

    assert.ok(typedPetriNet.places.length > 0);
    assert.ok(typedPetriNet.transitions.length > 0);
    expectTextIncludesAll(
      typedPetriNet.places.map((place) => place.name).join("\n"),
      [
        "Buyer Pool",
        "Seller Pool",
        "Item Case Correlation",
        "Item Case Inclusion",
        "Order Case Correlation",
        "Order Case Inclusion",
      ]
    );
  });

  it("IPOS-04P isolated-case object-aware realizability holds", async () => {
    const { context } = await loadOptimisticScenario();
    const { objectAwareRealizabilityReport } =
      buildIsolatedCaseSemanticsWithObjectAwareRealizability(context);

    assert.equal(
      objectAwareRealizabilityReport.objectAwareRealizability.holds,
      true,
    );

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName:
        "IPO-03_item-purchase-optimistic-object-aware-realizability_report",
      content: JSON.stringify(objectAwareRealizabilityReport),
      fileExtension: "json",
    });
  });

  it("IPOS-05P generates a well-formed BSPL protocol", async () => {
    const { context } = await loadOptimisticScenario();
    const { protocol } = buildBspl(context);

    expectMessagesForVisibleTasks(protocol, bsplTasks);
    expectBsplWellFormed(protocol);

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPO-04 item-purchase-optimistic-bspl",
      content: serializeBspl(protocol),
      fileExtension: "bspl",
    });
  });

  it("IPOS-06P compares choreography and BSPL behavior", async () => {
    const { context } = await loadOptimisticScenario();
    const { protocol } = buildBspl(context);
    const comparison = compareChoreographyAndBsplBehavior(context, protocol);

    assert.equal(comparison.recall, 1);
    assert.ok(comparison.precision < 1);
    assert.equal(comparison.choreographyTraceCount, 4);
    assert.equal(comparison.sharedTraceCount, 4);
    assert.ok(
      comparison.protocolTraceCount > comparison.choreographyTraceCount
    );

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPO-05 item-purchase-optimistic-behavior-comparison",
      content: JSON.stringify(comparison, null, 2),
      fileExtension: "json",
    });
  });

  it("IPOS-07P discovers and applies relaxation constraints", async () => {
    const { context } = await loadOptimisticScenario();
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

    assert.equal(discovery.constraints.length, 6);
    assert.equal(refinedComparison.recall, 1);
    assert.equal(refinedComparison.precision, 1);
    assert.equal(refinedComparison.choreographyTraceCount, 4);
    assert.equal(refinedComparison.protocolTraceCount, 4);
    assert.deepEqual(refinedComparison.protocolOnly, []);

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPO-06 item-purchase-optimistic-relaxation",
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
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPO-06 item-purchase-optimistic-relaxation",
      content: serializeBspl(refinedProtocol),
      fileExtension: "bspl",
    });
  });

  it("IPOS-08P implemented cross-case checks hold in isolated-like bounded setting", async () => {
    const { context } = await loadOptimisticScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName: "IPO-07 item-purchase-optimistic-receiver-progression-net",
      crossCaseClasses: ["Item"],
      participantIdsByRole: {
        Buyer: ["buyer1"],
        Seller: ["seller1"],
      },
    });
    const report = checkCrossCaseObjectAwareRealizabilityForScenario({
      net: typedPetriNet,
      domains: finiteDomainsByAlias(typedPetriNet, {
        case: ["case1"],
        Buyer: ["buyer1"],
        Seller: ["seller1"],
        Item: ["item1"],
        Order: ["order1"],
      }),
    });

    expectImplementedCrossCasePropertiesHold(report);
  });

  it("IPOS-09P implemented cross-case checks hold for fixed assignments and detect receiver progression violation for unrestricted assignments", async () => {
    const { context } = await loadOptimisticScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName: "IPES-08 item-purchase-optimistic-cross-case-ccbp-net",
      crossCaseClasses: ["Item"],
      participantIdsByRole: {
        Buyer: ["buyer1", "buyer2"],
        Seller: ["seller1"],
      },
    });

    // Fixed participant case assignments
    const reportFixed = checkCrossCaseObjectAwareRealizabilityForScenario({
      net: typedPetriNet,
      domains: finiteDomainsByAlias(typedPetriNet, {
        case: ["case1", "case2"],
        Buyer: ["buyer1", "buyer2"],
        Seller: ["seller1"],
        Item: ["item1", "item2"],
        Order: ["order1", "order2"],
      }),
      fixedParticipantsByCaseAndRole: {
        case1: { Buyer: "buyer1", Seller: "seller1" },
        case2: { Buyer: "buyer2", Seller: "seller1" },
      },
    });

    expectImplementedCrossCasePropertiesHold(reportFixed);

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName:
        "IPES-08 item-purchase-optimistic-receiver-progression-fixed-assignments",
      content: JSON.stringify(reportFixed, null, 2),
      fileExtension: "json",
    });

    // All participant case assignments
    const reportGeneral = checkCrossCaseObjectAwareRealizabilityForScenario({
      net: typedPetriNet,
      domains: finiteDomainsByAlias(typedPetriNet, {
        case: ["case1", "case2"],
        Buyer: ["buyer1", "buyer2"],
        Seller: ["seller1"],
        Item: ["item1", "item2"],
        Order: ["order1", "order2"],
      }),
    });

    // In the optimistic scenario, unrestricted participant assignments can let the same buyer buy twice from the same seller in parallel.
    expectOnlyReceiverProgressionViolated(reportGeneral);

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName:
        "IPES-08 item-purchase-optimistic-receiver-progression-general-assignments",
      content: JSON.stringify(reportGeneral, null, 2),
      fileExtension: "json",
    });
  });
});

async function loadOptimisticScenario() {
  return loadItemPurchaseScenario({
    scenarioDirectory,
  });
}
