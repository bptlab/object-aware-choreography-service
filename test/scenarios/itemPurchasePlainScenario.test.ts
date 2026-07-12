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
  expectOnlySenderAndReceiverProgressionViolated,
  expectTextIncludesAll,
  finiteDomainsByAlias,
  loadItemPurchaseScenario,
} from "../assertions/itemPurchaseScenarioHelpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenarioDirectory = path.resolve(
  __dirname,
  "../resources/scenarios/item_purchase_plain"
);
const resultDirectory = "itemPurchasePlainScenario";
const visibleTasks = [
  "request item",
  "offer item",
  "order item",
  "decline offer",
  "ship item",
];
const bsplTasks = visibleTasks.map((task) => task.replaceAll(" ", "-"));

describe("Item Purchase Plain Scenario", () => {
  it("IPLS-01P validates and generates isolated-case Petri net", async () => {
    const { context } = await loadPlainScenario();
    const { petriNet } = await buildIsolatedCaseSemantics(context);
    const petriNetText = petriNet.toModdleDefinitions().serialize();

    assert.ok(petriNet.getPlaces().length > 0);
    assert.ok(petriNet.getTransitions().length > 0);
    expectPetriNetContainsVisibleTasks(petriNetText, visibleTasks);
    expectPetriNetContainsObjectViewPlaces(petriNetText, {
      roles: ["Buyer", "Seller"],
      classes: ["Item"],
      states: ["available", "ordered", "packed", "delivered"],
    });

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPP-01 item-purchase-plain-petri-net",
      content: petriNetText,
      fileExtension: "obpt-pn",
    });
  });

  it("IPLS-02P generates cross-case typed Petri net", async () => {
    const { context } = await loadPlainScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName: "IPP-02 item-purchase-plain-cross-case-typed-petri-net",
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
      ]
    );
  });

  it("IPLS-03P isolated-case object-aware realizability holds", async () => {
    const { context } = await loadPlainScenario();
    const { objectAwareRealizabilityReport } =
      buildIsolatedCaseSemanticsWithObjectAwareRealizability(context);

    assert.equal(
      objectAwareRealizabilityReport.objectAwareRealizability.holds,
      true,
    );

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPP-03 item-purchase-plain-object-aware-realizability",
      content: JSON.stringify(objectAwareRealizabilityReport, null, 2),
      fileExtension: "json",
    });
  });

  it("IPLS-04P generates a well-formed BSPL protocol", async () => {
    const { context } = await loadPlainScenario();
    const { protocol } = buildBspl(context);

    expectMessagesForVisibleTasks(protocol, bsplTasks);
    expectBsplWellFormed(protocol);

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPP-04 item-purchase-plain-bspl",
      content: serializeBspl(protocol),
      fileExtension: "bspl",
    });
  });

  it("IPLS-05P compares choreography and BSPL behavior", async () => {
    const { context } = await loadPlainScenario();
    const { protocol } = buildBspl(context);
    const comparison = compareChoreographyAndBsplBehavior(context, protocol);

    assert.equal(comparison.recall, 1);
    assert.ok(comparison.precision < 1);
    assert.equal(comparison.choreographyTraceCount, 2);
    assert.equal(comparison.sharedTraceCount, 2);
    assert.ok(
      comparison.protocolTraceCount > comparison.choreographyTraceCount
    );

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPP-05 item-purchase-plain-behavior-comparison",
      content: JSON.stringify(comparison, null, 2),
      fileExtension: "json",
    });
  });

  it("IPLS-06P discovers and applies relaxation constraints", async () => {
    const { context } = await loadPlainScenario();
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

    assert.ok(discovery.constraints.length > 0);
    assert.equal(refinedComparison.recall, 1);
    assert.equal(refinedComparison.precision, 1);
    assert.equal(refinedComparison.choreographyTraceCount, 2);
    assert.equal(refinedComparison.protocolTraceCount, 2);
    assert.deepEqual(refinedComparison.protocolOnly, []);

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPP-06 item-purchase-plain-relaxation",
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
      scenarioName: "IPP-06 item-purchase-plain-relaxation",
      content: serializeBspl(refinedProtocol),
      fileExtension: "bspl",
    });
  });

  it("IPLS-07P implemented cross-case checks hold in isolated-like bounded setting", async () => {
    const { context } = await loadPlainScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName: "IPP-07 item-purchase-plain-isolated-like-ccbp-net",
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
      }),
    });

    expectImplementedCrossCasePropertiesHold(report);
  });

  it("IPLS-08N implemented cross-case checks detect receiver progression violation under cross-case item sharing", async () => {
    const { context } = await loadPlainScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName: "IPP-08 item-purchase-plain-cross-case-ccbp-net",
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
      }),
      fixedParticipantsByCaseAndRole: {
        case1: { Buyer: "buyer1", Seller: "seller1" },
        case2: { Buyer: "buyer2", Seller: "seller1" },
      },
    });

    expectOnlyReceiverProgressionViolated(reportFixed);
    assert.ok(
      reportFixed.violations.some(
        (violation) =>
          violation.kind === "receiver-progression" &&
          violation.receiverTransitionIds.length > 0
      ),
      "Expected at least one violation with candidate receiver transitions"
    );

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName:
        "IPP-08 item-purchase-plain-receiver-progression-fixed-assignments",
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
      }),
    });

    expectOnlyReceiverProgressionViolated(reportGeneral);
    assert.ok(
      reportGeneral.violations.some(
        (violation) =>
          violation.kind === "receiver-progression" &&
          violation.receiverTransitionIds.length > 0
      ),
      "Expected at least one violation with candidate receiver transitions"
    );

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName:
        "IPP-08 item-purchase-plain-receiver-progression-general-assignments",
      content: JSON.stringify(reportGeneral, null, 2),
      fileExtension: "json",
    });
  });

  it("IPLS-09N implemented cross-case checks detect sender and receiver progression violations under forced item sharing", async () => {
    const { context } = await loadPlainScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName: "IPP-09 item-purchase-plain-forced-item-sharing-ccbp-net",
      crossCaseClasses: ["Item"],
      participantIdsByRole: {
        Buyer: ["buyer1", "buyer2"],
        Seller: ["seller1"],
      },
    });

    const domains = finiteDomainsByAlias(typedPetriNet, {
      case: ["case1", "case2"],
      Buyer: ["buyer1", "buyer2"],
      Seller: ["seller1"],
      Item: ["item1"],
    });

    const reportFixed = checkCrossCaseObjectAwareRealizabilityForScenario({
      net: typedPetriNet,
      domains,
      fixedParticipantsByCaseAndRole: {
        case1: { Buyer: "buyer1", Seller: "seller1" },
        case2: { Buyer: "buyer2", Seller: "seller1" },
      },
    });

    expectOnlySenderAndReceiverProgressionViolated(reportFixed);
    assert.ok(
      reportFixed.violations.some(
        (violation) =>
          violation.kind === "receiver-progression" &&
          violation.receiverTransitionIds.length > 0
      ),
      "Expected at least one violation with candidate receiver transitions"
    );

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName:
        "IPP-09 item-purchase-plain-forced-item-sharing-fixed-assignments",
      content: JSON.stringify(reportFixed, null, 2),
      fileExtension: "json",
    });

    const reportGeneral = checkCrossCaseObjectAwareRealizabilityForScenario({
      net: typedPetriNet,
      domains,
    });

    expectOnlySenderAndReceiverProgressionViolated(reportGeneral);
    assert.ok(
      reportGeneral.violations.some(
        (violation) =>
          violation.kind === "receiver-progression" &&
          violation.receiverTransitionIds.length > 0
      ),
      "Expected at least one violation with candidate receiver transitions"
    );

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName:
        "IPP-09 item-purchase-plain-forced-item-sharing-general-assignments",
      content: JSON.stringify(reportGeneral, null, 2),
      fileExtension: "json",
    });
  });
});

async function loadPlainScenario() {
  return loadItemPurchaseScenario({
    scenarioDirectory,
  });
}
