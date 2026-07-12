import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildBspl } from "../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import { writeScenarioResult } from "../../src/shared/testing/resultWriter.js";
import {
  buildIsolatedCaseSemantics,
  buildIsolatedCaseSemanticsWithObjectAwareRealizability,
} from "../../src/shared/semantics/isolatedCaseSemantics.js";
import {
  expectPetriNetContainsObjectViewPlaces,
  expectPetriNetContainsVisibleTasks,
} from "../assertions/scenarioAssertions.js";
import {
  buildAndWriteCrossCaseTypedPetriNet,
  checkCrossCaseObjectAwareRealizabilityForScenario,
  expectImplementedCrossCasePropertiesHold,
  expectOnlyReceiverProgressionViolated,
  finiteDomainsByAlias,
  loadItemPurchaseScenario,
} from "../assertions/itemPurchaseScenarioHelpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenarioDirectory = path.resolve(
  __dirname,
  "../resources/scenarios/item_purchase_pessimistic"
);
const resultDirectory = "itemPurchasePessimisticScenario";
const visibleTasks = [
  "request item",
  "reserve item",
  "offer item",
  "decline offer",
  "order item",
  "ship item",
  "decline request",
];
const reservationCycleError =
  /BSPL mapping requires acyclic lifecycle for class Reservation; found loop\/cycle free -> reserved -> free/;

describe("Item Purchase Pessimistic Scenario", () => {
  it("IPPS-01P validates and generates isolated-case Petri net", async () => {
    const { context } = await loadPessimisticScenario();
    const { petriNet } = await buildIsolatedCaseSemantics(context);
    const petriNetText = petriNet.toModdleDefinitions().serialize();

    assert.ok(petriNet.getPlaces().length > 0);
    assert.ok(petriNet.getTransitions().length > 0);
    expectPetriNetContainsVisibleTasks(petriNetText, visibleTasks);
    expectPetriNetContainsObjectViewPlaces(petriNetText, {
      roles: ["Buyer", "Seller"],
      classes: ["Item", "Reservation"],
      states: [
        "free",
        "reserved",
        "closed",
        "available",
        "ordered",
        "packed",
        "delivered",
      ],
    });

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName: "IPES-01 item-purchase-pessimistic-petri-net",
      content: petriNetText,
      fileExtension: "obpt-pn",
    });
  });

  it("IPPS-02P generates cross-case typed Petri net", async () => {
    const { context } = await loadPessimisticScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName:
        "IPES-02 item-purchase-pessimistic-cross-case-typed-petri-net",
      crossCaseClasses: ["Item", "Reservation"],
    });

    assert.ok(typedPetriNet.places.length > 0);
    assert.ok(typedPetriNet.transitions.length > 0);
  });

  it("IPPS-03P isolated-case object-aware realizability holds", async () => {
    const { context } = await loadPessimisticScenario();
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
        "IPES-03 item-purchase-pessimistic-object-aware-realizability",
      content: JSON.stringify(objectAwareRealizabilityReport, null, 2),
      fileExtension: "json",
    });
  });

  it("IPPS-04N BSPL generation rejects the deliberate lifecycle cycle", async () => {
    const { context } = await loadPessimisticScenario();

    assert.throws(() => buildBspl(context), reservationCycleError);
  });

  it("IPPS-05N compares choreography and BSPL behavior rejects the lifecycle cycle", async () => {
    const { context } = await loadPessimisticScenario();

    assert.throws(() => buildBspl(context), reservationCycleError);
  });

  it("IPPS-06N discovers and applies relaxation constraints rejects the lifecycle cycle", async () => {
    const { context } = await loadPessimisticScenario();

    assert.throws(() => buildBspl(context), reservationCycleError);
  });

  it("IPPS-07P implemented cross-case checks hold in isolated-like bounded setting", async () => {
    const { context } = await loadPessimisticScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName: "IPES-07 item-purchase-pessimistic-cross-case-ccbp-net",
      crossCaseClasses: ["Item", "Reservation"],
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
        Reservation: ["reservation1"],
      }),
    });

    expectImplementedCrossCasePropertiesHold(report);
  });

  it("IPPS-08P implemented cross-case checks hold for fixed assignments and detect receiver progression violation for unrestricted assignments", async () => {
    const { context } = await loadPessimisticScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName: "IPES-08 item-purchase-pessimistic-cross-case-ccbp-net",
      crossCaseClasses: ["Item", "Reservation"],
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
        Reservation: ["reservation1", "reservation2"],
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
        "IPES-08 item-purchase-pessimistic-receiver-progression-fixed-assignments",
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
        Reservation: ["reservation1", "reservation2"],
      }),
    });

    expectOnlyReceiverProgressionViolated(reportGeneral);

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName:
        "IPES-08 item-purchase-pessimistic-receiver-progression-general-assignments",
      content: JSON.stringify(reportGeneral, null, 2),
      fileExtension: "json",
    });
  });

  it("IPPS-09N implemented cross-case checks detect receiver progression violation under forced reservation contention", async () => {
    const { context } = await loadPessimisticScenario();
    const typedPetriNet = await buildAndWriteCrossCaseTypedPetriNet({
      context,
      resultDirectory,
      scenarioName:
        "IPES-09 item-purchase-pessimistic-forced-reservation-contention-ccbp-net",
      crossCaseClasses: ["Item", "Reservation"],
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
      Reservation: ["reservation1"],
    });

    const reportFixed = checkCrossCaseObjectAwareRealizabilityForScenario({
      net: typedPetriNet,
      domains,
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
        "IPES-09 item-purchase-pessimistic-forced-reservation-contention-fixed-assignments",
      content: JSON.stringify(reportFixed, null, 2),
      fileExtension: "json",
    });

    const reportGeneral = checkCrossCaseObjectAwareRealizabilityForScenario({
      net: typedPetriNet,
      domains,
    });

    expectOnlyReceiverProgressionViolated(reportGeneral);

    await writeScenarioResult({
      resultDirectory,
      subdirectory: "scenarios",
      scenarioName:
        "IPES-09 item-purchase-pessimistic-forced-reservation-contention-general-assignments",
      content: JSON.stringify(reportGeneral, null, 2),
      fileExtension: "json",
    });
  });
});

async function loadPessimisticScenario() {
  return loadItemPurchaseScenario({
    scenarioDirectory,
  });
}
