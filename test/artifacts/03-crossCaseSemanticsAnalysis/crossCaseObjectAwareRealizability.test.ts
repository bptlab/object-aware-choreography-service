import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkCrossCaseObjectAwareRealizability,
  inferSenderProgressionPositions,
  type CrossCaseObjectAwareRealizabilityReport,
} from "../../../src/shared/analysis/crossCaseObjectAwareRealizability/index.js";
import { buildCrossCasePetriNet } from "../../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import {
  TypedPetriNetBuilder,
  type TypedIdentifierDomains,
  type TypedPetriNet,
} from "../../../src/shared/targets/typedPetriNet/index.js";
import { writeScenarioResult } from "../../../src/shared/testing/resultWriter.js";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../../fixtures/fixtureIds.js";
import {
  contextFromFixtures,
  type FixtureTriple,
  type NamedFixtureTriple,
} from "../../fixtures/contextFromFixtures.js";
import { allFixturesExist } from "../../fixtures/fixtureLoader.js";

describe("Cross-case Object-Aware Realizability Fixtures", () => {
  scenario(
    "CCOAR-01P no-object task receiver progression holds",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const { net, report } = await runScenario(fixtures);
      const senderPositions = inferSenderProgressionPositions(net);

      expectReceiverProgressionHolds(report);
      expectSenderProgressionHolds(report);
      assert.equal(
        report.metadata.senderPositions,
        1,
        "Expected the atomic no-object task to contribute a sender progression position"
      );
      assert.ok(
        senderPositions.some((position) =>
          position.senderTransitionIds.some((transitionId) =>
            transitionId.startsWith("Transition_task_")
          )
        ),
        "Expected sender progression inference to include the atomic task transition"
      );
    }
  );

  scenario(
    "CCOAR-02P communication task sequence receiver progression holds",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
    },
    async (fixtures) => {
      const { report } = await runScenario(fixtures);

      expectReceiverProgressionHolds(report);
      expectSenderProgressionHolds(report);
    }
  );

  scenario(
    "CCOAR-03P synchronized task receiver progression holds",
    {
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { report } = await runScenario(fixtures);

      expectReceiverProgressionHolds(report);
    }
  );

  scenario(
    "CCOAR-04P combined task receiver progression holds",
    {
      choreography: Choreographies.c14CombinedSameClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { report } = await runScenario(fixtures);

      expectReceiverProgressionHolds(report);
    }
  );

  scenario(
    "CCOAR-05P exclusive decision receiver progression holds",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const { report } = await runScenario(fixtures);

      expectReceiverProgressionHolds(report);
    }
  );

  scenario(
    "CCOAR-06P parallel receiver progression holds",
    {
      choreography: Choreographies.c28ParallelGatewayCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const { report } = await runScenario(fixtures);

      expectReceiverProgressionHolds(report);
    }
  );

  scenario(
    "CCOAR-07N receive blocking via communication is reported",
    {
      choreography: Choreographies.c32ReceiveBlockingCommunication,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l13LocalDecisionDifferentRoles,
    },
    async (fixtures) => {
      const { report } = await runScenario(fixtures);

      expectReceiverProgressionViolated(report);
      assert.ok(
        report.violations.some((violation) =>
          /receive/i.test(violation.message)
        ),
        "Expected a receiver progression violation for a pending transmission"
      );
    }
  );

  scenario(
    "CCOAR-08N receive blocking via synchronized transition is reported",
    {
      choreography: Choreographies.c33ReceiveBlockingSynchronization,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { report } = await runScenario(fixtures);

      expectReceiverProgressionViolated(report);
      assert.ok(
        report.violations.some(
          (violation) =>
            violation.kind === "receiver-progression" &&
            /Transition_receive_/.test(violation.receiverTransitionIds.join(","))
        ),
        "Expected the violation to list receiver-side completion transitions"
      );
    }
  );

  it("CCOAR-09N reports a hand-built pending transmission without receiver", () => {
    const builder = new TypedPetriNetBuilder(
      "missing_receiver",
      "Missing Receiver"
    );
    const caseType = builder.addIdentifierType({
      id: "Case",
      name: "Case",
      alias: "case",
    });
    builder.addPlace({
      id: "tx_Task_1",
      name: "Task 1 Transmission",
      tupleType: [caseType.id],
      initialTokens: [[{ typeId: caseType.id, value: "case1" }]],
    });
    const report = checkCrossCaseObjectAwareRealizability({
      net: builder.toTypedPetriNet(),
      domains: { [caseType.id]: ["case1"] },
    });

    expectReceiverProgressionViolated(report);
    const receiverViolations = report.violations.filter(
      (violation) => violation.kind === "receiver-progression"
    );
    assert.equal(receiverViolations.length, 1);
    assert.equal(receiverViolations[0].transmissionPlaceId, "Place_tx_Task_1");
    assert.deepEqual(receiverViolations[0].receiverTransitionIds, []);
  });

  scenario(
    "CCOAR-10P receiver progression report is deterministic",
    {
      choreography: Choreographies.c32ReceiveBlockingCommunication,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l13LocalDecisionDifferentRoles,
    },
    async (fixtures) => {
      const net = await buildScenarioNet(fixtures);
      const domains = finiteDomainsFor(net);
      const left = checkCrossCaseObjectAwareRealizability({
        net,
        domains,
        maxMarkings: 20000,
      });
      const right = checkCrossCaseObjectAwareRealizability({
        net,
        domains,
        maxMarkings: 20000,
      });

      assert.deepEqual(
        left.violations.map(violationKey),
        right.violations.map(violationKey)
      );
    }
  );

  scenario(
    "CCOAR-10aN maxDepth truncation is reported",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const net = await buildScenarioNet(fixtures);
      const report = checkCrossCaseObjectAwareRealizability({
        net,
        domains: finiteDomainsFor(net),
        maxDepth: 0,
      });

      assert.equal(report.stateSpace.truncated, true);
      assert.ok(report.stateSpace.truncationReasons.includes("maxDepth"));
      assert.equal(report.stateSpace.limits.maxDepth, 0);
    }
  );

  scenario(
    "CCOAR-10bN maxMarkings truncation is reported",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const net = await buildScenarioNet(fixtures);
      const report = checkCrossCaseObjectAwareRealizability({
        net,
        domains: finiteDomainsFor(net),
        maxMarkings: 1,
      });

      assert.equal(report.stateSpace.truncated, true);
      assert.ok(report.stateSpace.truncationReasons.includes("maxMarkings"));
      assert.equal(report.stateSpace.limits.maxMarkings, 1);
    }
  );

  scenario(
    "CCOAR-11N send blocking via synchronized transition is reported",
    {
      choreography: Choreographies.c31SendBlockingSynchronization,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { report } = await runScenario(fixtures);

      expectSenderProgressionViolated(report);
      assert.ok(
        report.senderProgression.violations.some(
          (violation) =>
            violation.kind === "sender-progression" &&
            violation.taskName === "sync-task" &&
            violation.controlFlowPlaceId.startsWith("Place_cf_") &&
            violation.caseId === "case1" &&
            violation.senderTransitionIds.some((transitionId) =>
              transitionId.startsWith("Transition_send_")
            )
        ),
        "Expected a sender progression violation for the blocked sync-task send position"
      );
    }
  );

  it("CCOAR-12P case-specific object communication sender progression holds when object state is available", () => {
    const { net, domains } = buildHandBuiltSenderNet({
      senderTransitionId: "send_Task_1",
      senderTransitionName: "task1 Send",
      transmissionTuple: "case-object",
      includeSenderObjectInput: true,
      includeInitialSenderObject: true,
    });
    const report = checkCrossCaseObjectAwareRealizability({ net, domains });

    expectSenderProgressionHolds(report);
  });

  it("CCOAR-13P sender progression allows local object creation before send", () => {
    const { net, domains } = buildHandBuiltSenderNet({
      senderTransitionId: "send_Task_1",
      senderTransitionName: "task1 Send",
      transmissionTuple: "case-object",
      includeSenderObjectInput: true,
      includeInitialSenderObject: false,
      includeCreationPreparation: true,
    });
    const report = checkCrossCaseObjectAwareRealizability({ net, domains });

    expectSenderProgressionHolds(report);
    assert.ok(
      report.metadata.localTransitions > 0,
      "Expected creation to be counted as a local lifecycle preparation transition"
    );
  });

  it("CCOAR-14P event-based sender alternatives are grouped by pre-place", () => {
    const { net, domains } = buildHandBuiltEventBasedSenderNet();
    const report = checkCrossCaseObjectAwareRealizability({ net, domains });

    expectSenderProgressionHolds(report);
    assert.equal(
      report.metadata.senderPositions,
      1,
      "Expected both outgoing send alternatives to form one sender obligation"
    );
  });

  it("CCOAR-15P cross-case first binding send variant satisfies sender progression", () => {
    const { net, domains } = buildHandBuiltSenderNet({
      senderTransitionId: "send_Task_1_bind",
      senderTransitionName: "task1 Send Bind",
      transmissionTuple: "case-object",
      includeSenderObjectInput: false,
      includeInitialSenderObject: false,
    });
    const report = checkCrossCaseObjectAwareRealizability({ net, domains });

    expectSenderProgressionHolds(report);
  });

  it("CCOAR-16P association-consistent first binding variant is grouped as sender candidate", () => {
    const { net, domains } = buildHandBuiltSenderNet({
      senderTransitionId: "send_Task_1_bind_assoc_Reservation",
      senderTransitionName: "task1 Send Bind",
      transmissionTuple: "case-object",
      includeSenderObjectInput: false,
      includeInitialSenderObject: false,
    });
    const report = checkCrossCaseObjectAwareRealizability({ net, domains });

    expectSenderProgressionHolds(report);
    assert.deepEqual(
      report.metadata.senderPositions,
      1,
      "Expected the assoc_* first-binding variant to create one sender obligation"
    );
  });

  it("CCOAR-17P cross-case guarded decision holds for an already-bound object", () => {
    const { net, domains } = buildHandBuiltDecisionNet({
      includeObjectBinding: true,
      enabledStateIds: ["approved"],
    });
    const report = checkCrossCaseObjectAwareRealizability({ net, domains });

    assertDecisionConsistencyHoldsWithDetails(report);
  });

  it("CCOAR-18N cross-case guarded decision without binding is blocked", () => {
    const { net, domains } = buildHandBuiltDecisionNet({
      includeObjectBinding: false,
      enabledStateIds: ["approved"],
    });
    const report = checkCrossCaseObjectAwareRealizability({ net, domains });

    assertDecisionConsistencyViolatedWithDetails(report);
    assert.equal(
      report.decisionConsistency.violations[0].classification,
      "no-enabled-branch"
    );
  });

  scenario(
    "CCOAR-19N shared cross-case object causes synchronized receiver blocking",
    {
      choreography:
        Choreographies.c12SequenceSynchronizationOneClassDifferentRoles,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const net = buildCrossCasePetriNet(await contextFromFixtures(fixtures), {
        crossCaseClasses: ["ClassA"],
        participantIdsByRole: {
          RoleA: ["roleA1"],
          RoleB: ["roleB1", "roleB2"],
        },
      });
      const report = checkCrossCaseObjectAwareRealizability({
        net,
        domains: finiteDomainsByAlias(net, {
          case: ["case1", "case2"],
          RoleA: ["roleA1"],
          RoleB: ["roleB1", "roleB2"],
          ClassA: ["classA1", "classA2"],
        }),
        maxMarkings: 100000,
        maxDepth: 40,
      });

      expectReceiverProgressionViolated(report);
      assert.equal(
        report.stateSpace.truncated,
        false,
        "Expected bounded exploration to finish without truncation"
      );

      const syncViolation = report.violations.find(
        (violation) =>
          violation.kind === "receiver-progression" &&
          violation.receiverTransitionIds.length > 0 &&
          (violation.taskName === "sync-task" ||
            violation.receiverTransitionIds.some((transitionId) =>
              transitionId.includes("ChoreographyTask_0vvrsfb")
            ))
      );

      assert.ok(
        syncViolation,
        "Expected a receiver progression violation for sync-task with candidate receiver transitions"
      );
      assert.notDeepEqual(
        syncViolation.receiverTransitionIds,
        [],
        "Expected the violation to be caused by disabled receiver occurrences, not by missing receiver transitions"
      );
    }
  );
});

describe("Cross-case object-aware realizability agrees with isolated sender/receiver fixtures", () => {
  const positiveFixtures: Array<{
    name: string;
    fixtures: FixtureTriple;
  }> = [
    {
      name: "BPP-01 no-object holds",
      fixtures: {
        choreography: Choreographies.c01TaskNoClass,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      },
    },
    {
      name: "BPP-02 communication task sequence holds",
      fixtures: {
        choreography: Choreographies.c05SequenceCommunicationOneClass,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle:
          SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      },
    },
    {
      name: "BPP-03 synchronized task holds",
      fixtures: {
        choreography: Choreographies.c10SequenceSynchronizationOneClass,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
      },
    },
    {
      name: "BPP-04 combined task holds",
      fixtures: {
        choreography: Choreographies.c14CombinedSameClass,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
      },
    },
    {
      name: "BPP-05 event-based local decision holds",
      fixtures: {
        choreography:
          Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
      },
    },
    {
      name: "BPP-06 exclusive decision holds",
      fixtures: {
        choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
      },
    },
    {
      name: "BPP-07 parallel holds",
      fixtures: {
        choreography:
          Choreographies.c28ParallelGatewayCommunicationThreeClasses,
        sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
        sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
      },
    },
    {
      name: "BPP-08 Event-based loop holds",
      fixtures: {
        choreography: Choreographies.c22EventBasedGatewayNoClassLoop,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      },
    },
    {
      name: "BPP-09 Exclusive loop holds",
      fixtures: {
        choreography:
          Choreographies.c27ExclusiveGatewayCommunicationOneClassLoop,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l22LocalDecisionSynchronizedLoop,
      },
    },
  ];

  for (const [index, { name, fixtures }] of positiveFixtures.entries()) {
    if (!allFixturesExist(fixtures)) {
      throw new Error(`Missing fixtures for scenario "${name}"`);
    }

    it(`CCOAR-${String(index + 20).padStart(2, "0")}P ${name.replace(
      /^(?:BPP|BPN)-\d+\s+/,
      ""
    )} matches cross-case sender/receiver progression`, async () => {
      const report = await runDegenerateCrossCaseScenario(fixtures);

      assertCrossCaseStateSpaceNotTruncated(report);
      assertSenderProgressionHoldsWithDetails(report);
      assertReceiverProgressionHoldsWithDetails(report);
      assertDecisionConsistencyHoldsWithDetails(report);
    });
  }

  const senderNegativeFixtures: Array<{
    name: string;
    fixtures: FixtureTriple;
  }> = [
    {
      name: "BPN-01 send blocking via communication",
      fixtures: {
        choreography: Choreographies.c30SendBlockingCommunication,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      },
    },
    {
      name: "BPN-02 send blocking via synchronized transition",
      fixtures: {
        choreography: Choreographies.c31SendBlockingSynchronization,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
      },
    },
  ];

  for (const [index, { name, fixtures }] of senderNegativeFixtures.entries()) {
    if (!allFixturesExist(fixtures)) {
      throw new Error(`Missing fixtures for scenario "${name}"`);
    }

    it(`CCOAR-${String(index + 29).padStart(2, "0")}N ${name.replace(
      /^(?:BPP|BPN)-\d+\s+/,
      ""
    )} matches cross-case sender progression violation`, async () => {
      const report = await runDegenerateCrossCaseScenario(fixtures);

      assertCrossCaseStateSpaceNotTruncated(report);
      assertSenderProgressionViolatedWithDetails(report);
      assertDecisionConsistencyHoldsWithDetails(report);
    });
  }

  const receiverNegativeFixtures: Array<{
    name: string;
    fixtures: FixtureTriple;
  }> = [
    {
      name: "BPN-03 receive blocking via communication",
      fixtures: {
        choreography: Choreographies.c32ReceiveBlockingCommunication,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l13LocalDecisionDifferentRoles,
      },
    },
    {
      name: "BPN-04 receive blocking via synchronized transition",
      fixtures: {
        choreography: Choreographies.c33ReceiveBlockingSynchronization,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
      },
    },
  ];

  for (const [
    index,
    { name, fixtures },
  ] of receiverNegativeFixtures.entries()) {
    if (!allFixturesExist(fixtures)) {
      throw new Error(`Missing fixtures for scenario "${name}"`);
    }

    it(`CCOAR-${String(index + 31).padStart(2, "0")}N ${name.replace(
      /^(?:BPP|BPN)-\d+\s+/,
      ""
    )} matches cross-case receiver progression violation`, async () => {
      const report = await runDegenerateCrossCaseScenario(fixtures);

      assertCrossCaseStateSpaceNotTruncated(report);
      assertReceiverProgressionViolatedWithDetails(report);
      assertDecisionConsistencyHoldsWithDetails(report);
    });
  }

  const decisionNegativeFixtures: Array<{
    name: string;
    fixtures: FixtureTriple;
  }> = [
    {
      name: "BPN-05 misaligned decision",
      fixtures: {
        choreography: Choreographies.c34MisalignedDecision,
        sharedDataModel: SharedDataModels.d01OneClass,
        sharedLifecycle:
          SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      },
    },
  ];

  for (const [
    index,
    { name, fixtures },
  ] of decisionNegativeFixtures.entries()) {
    if (!allFixturesExist(fixtures)) {
      throw new Error(`Missing fixtures for scenario "${name}"`);
    }

    it(`CCOAR-${String(index + 33).padStart(2, "0")}N ${name.replace(
      /^(?:BPP|BPN)-\d+\s+/,
      ""
    )} matches cross-case decision consistency violation`, async () => {
      const report = await runDegenerateCrossCaseScenario(fixtures);

      assertCrossCaseStateSpaceNotTruncated(report);
      assertSenderProgressionHoldsWithDetails(report);
      assertReceiverProgressionHoldsWithDetails(report);
      assertDecisionConsistencyViolatedWithDetails(report);
      assert.ok(
        report.violations.some(
          (violation) => violation.kind === "decision-consistency"
        ),
        "Expected a decision-consistency violation"
      );
    });
  }
});

async function runScenario(args: NamedFixtureTriple): Promise<{
  net: TypedPetriNet;
  report: CrossCaseObjectAwareRealizabilityReport;
}> {
  const net = await buildScenarioNet(args);
  const report = checkCrossCaseObjectAwareRealizability({
    net,
    domains: finiteDomainsFor(net),
    maxMarkings: 20000,
  });

  await writeScenarioResult({
    subdirectory: "artifacts/03-crossCaseSemanticsAnalysis",
    resultDirectory: "crossCaseObjectAwareRealizability",
    scenarioName: args.scenarioName,
    content: JSON.stringify(report, null, 2),
    fileExtension: "json",
  });

  return { net, report };
}

async function buildScenarioNet(args: FixtureTriple): Promise<TypedPetriNet> {
  return buildCrossCasePetriNet(await contextFromFixtures(args), {
    crossCaseClasses: [],
  });
}

async function runDegenerateCrossCaseScenario(
  fixtures: FixtureTriple
): Promise<CrossCaseObjectAwareRealizabilityReport> {
  const net = await buildScenarioNet(fixtures);

  return checkCrossCaseObjectAwareRealizability({
    net,
    domains: finiteDomainsFor(net),
    maxMarkings: 50000,
    maxDepth: 100,
  });
}

function finiteDomainsFor(net: TypedPetriNet): TypedIdentifierDomains {
  return Object.fromEntries(
    net.identifierTypes.map((type) => {
      if (type.alias === "case") {
        return [type.id, ["case1"]];
      }

      return [type.id, [`${type.alias}_1`]];
    })
  );
}

function finiteDomainsByAlias(
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

function buildHandBuiltSenderNet(args: {
  senderTransitionId: string;
  senderTransitionName: string;
  transmissionTuple: "case" | "case-object";
  includeSenderObjectInput: boolean;
  includeInitialSenderObject: boolean;
  includeCreationPreparation?: boolean;
}): {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
} {
  const builder = new TypedPetriNetBuilder(
    "sender_progression",
    "Sender Progression"
  );
  const caseType = builder.addIdentifierType({
    id: "Case",
    name: "Case",
    alias: "case",
  });
  const objectType = builder.addIdentifierType({
    id: "ClassA",
    name: "ClassA",
    alias: "ClassA",
  });
  const roleType = builder.addIdentifierType({
    id: "RoleA",
    name: "RoleA",
    alias: "RoleA",
  });
  const caseVariable = builder.addVariable({
    id: "case",
    typeId: caseType.id,
  });
  const objectVariable = builder.addVariable({
    id: "classA",
    typeId: objectType.id,
  });
  const roleVariable = builder.addVariable({
    id: "roleA",
    typeId: roleType.id,
  });
  const prePlace = builder.addPlace({
    id: "cf_before_Task_1",
    name: "Control Flow before Task 1",
    tupleType: [caseType.id],
    initialTokens: [[{ typeId: caseType.id, value: "case1" }]],
  });
  const senderObjectPlace = builder.addPlace({
    id: "state_RoleA_ClassA_ready",
    name: "RoleA ClassA ready",
    tupleType: [roleType.id, objectType.id],
    initialTokens: args.includeInitialSenderObject
      ? [
          [
            { typeId: roleType.id, value: "roleA1" },
            { typeId: objectType.id, value: "classA1" },
          ],
        ]
      : [],
  });
  const transmissionPlace = builder.addPlace({
    id: "tx_Task_1",
    name: "task1 Transmission",
    tupleType:
      args.transmissionTuple === "case"
        ? [caseType.id]
        : [caseType.id, objectType.id],
  });
  const senderTransition = builder.addTransition({
    id: args.senderTransitionId,
    name: args.senderTransitionName,
    freshVariables: args.includeSenderObjectInput
      ? []
      : [{ variableId: objectVariable.id, typeId: objectType.id }],
  });

  if (args.includeCreationPreparation) {
    const poolPlace = builder.addPlace({
      id: "pool_RoleA",
      name: "RoleA Pool",
      tupleType: [roleType.id],
      initialTokens: [[{ typeId: roleType.id, value: "roleA1" }]],
    });
    const creationTransition = builder.addTransition({
      id: "create_RoleA_ClassA_ready",
      name: "Create ClassA",
      freshVariables: [
        { variableId: objectVariable.id, typeId: objectType.id },
      ],
    });

    builder.addOrdinaryArc({
      sourceId: poolPlace.id,
      targetId: creationTransition.id,
      inscription: [
        {
          typeId: roleType.id,
          variableId: roleVariable.id,
          isGenerated: false,
        },
      ],
    });
    builder.addOrdinaryArc({
      sourceId: creationTransition.id,
      targetId: senderObjectPlace.id,
      inscription: [
        {
          typeId: roleType.id,
          variableId: roleVariable.id,
          isGenerated: false,
        },
        {
          typeId: objectType.id,
          variableId: objectVariable.id,
          isGenerated: true,
        },
      ],
    });
  }

  builder.addOrdinaryArc({
    sourceId: prePlace.id,
    targetId: senderTransition.id,
    inscription: [
      { typeId: caseType.id, variableId: caseVariable.id, isGenerated: false },
    ],
  });

  if (args.includeSenderObjectInput) {
    builder.addOrdinaryArc({
      sourceId: senderObjectPlace.id,
      targetId: senderTransition.id,
      inscription: [
        {
          typeId: roleType.id,
          variableId: roleVariable.id,
          isGenerated: false,
        },
        {
          typeId: objectType.id,
          variableId: objectVariable.id,
          isGenerated: false,
        },
      ],
    });
  }

  builder.addOrdinaryArc({
    sourceId: senderTransition.id,
    targetId: transmissionPlace.id,
    inscription:
      args.transmissionTuple === "case"
        ? [
            {
              typeId: caseType.id,
              variableId: caseVariable.id,
              isGenerated: false,
            },
          ]
        : [
            {
              typeId: caseType.id,
              variableId: caseVariable.id,
              isGenerated: false,
            },
            {
              typeId: objectType.id,
              variableId: objectVariable.id,
              isGenerated: !args.includeSenderObjectInput,
            },
          ],
  });

  return {
    net: builder.toTypedPetriNet(),
    domains: {
      [caseType.id]: ["case1"],
      [objectType.id]: ["classA1"],
      [roleType.id]: ["roleA1"],
    },
  };
}

function buildHandBuiltEventBasedSenderNet(): {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
} {
  const builder = new TypedPetriNetBuilder(
    "event_sender_progression",
    "Event Sender Progression"
  );
  const caseType = builder.addIdentifierType({
    id: "Case",
    name: "Case",
    alias: "case",
  });
  const objectType = builder.addIdentifierType({
    id: "ClassA",
    name: "ClassA",
    alias: "ClassA",
  });
  const caseVariable = builder.addVariable({
    id: "case",
    typeId: caseType.id,
  });
  const objectVariable = builder.addVariable({
    id: "classA",
    typeId: objectType.id,
  });
  const prePlace = builder.addPlace({
    id: "cf_before_EventGateway",
    name: "Control Flow before Event Gateway",
    tupleType: [caseType.id],
    initialTokens: [[{ typeId: caseType.id, value: "case1" }]],
  });
  const missingObjectPlace = builder.addPlace({
    id: "state_RoleA_ClassA_ready",
    name: "RoleA ClassA ready",
    tupleType: [objectType.id],
  });
  const firstTransmissionPlace = builder.addPlace({
    id: "tx_Task_A",
    name: "taskA Transmission",
    tupleType: [caseType.id, objectType.id],
  });
  const secondTransmissionPlace = builder.addPlace({
    id: "tx_Task_B",
    name: "taskB Transmission",
    tupleType: [caseType.id],
  });
  const blockedSend = builder.addTransition({
    id: "send_Task_A",
    name: "taskA Send",
  });
  const enabledSend = builder.addTransition({
    id: "send_Task_B",
    name: "taskB Send",
  });

  for (const transition of [blockedSend, enabledSend]) {
    builder.addOrdinaryArc({
      sourceId: prePlace.id,
      targetId: transition.id,
      inscription: [
        {
          typeId: caseType.id,
          variableId: caseVariable.id,
          isGenerated: false,
        },
      ],
    });
  }

  builder.addOrdinaryArc({
    sourceId: missingObjectPlace.id,
    targetId: blockedSend.id,
    inscription: [
      {
        typeId: objectType.id,
        variableId: objectVariable.id,
        isGenerated: false,
      },
    ],
  });
  builder.addOrdinaryArc({
    sourceId: blockedSend.id,
    targetId: firstTransmissionPlace.id,
    inscription: [
      { typeId: caseType.id, variableId: caseVariable.id, isGenerated: false },
      {
        typeId: objectType.id,
        variableId: objectVariable.id,
        isGenerated: false,
      },
    ],
  });
  builder.addOrdinaryArc({
    sourceId: enabledSend.id,
    targetId: secondTransmissionPlace.id,
    inscription: [
      { typeId: caseType.id, variableId: caseVariable.id, isGenerated: false },
    ],
  });

  return {
    net: builder.toTypedPetriNet(),
    domains: {
      [caseType.id]: ["case1"],
      [objectType.id]: ["classA1"],
    },
  };
}

function buildHandBuiltDecisionNet(args: {
  includeObjectBinding: boolean;
  enabledStateIds: string[];
}): {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
} {
  const builder = new TypedPetriNetBuilder(
    "decision_determinism",
    "Decision Determinism"
  );
  const caseType = builder.addIdentifierType({
    id: "DataClass_Case",
    name: "Case",
    alias: "case",
  });
  const objectType = builder.addIdentifierType({
    id: "DataClass_Object_ClassA",
    name: "ClassA",
    alias: "ClassA",
  });
  const roleType = builder.addIdentifierType({
    id: "DataClass_Role_RoleA",
    name: "RoleA",
    alias: "RoleA",
  });
  const caseVariable = builder.addVariable({
    id: "case",
    typeId: caseType.id,
  });
  const objectVariable = builder.addVariable({
    id: "object_ClassA",
    typeId: objectType.id,
  });
  const roleVariable = builder.addVariable({
    id: "role_RoleA",
    typeId: roleType.id,
  });
  const prePlace = builder.addPlace({
    id: "cf_Flow_before_gateway",
    name: "Before Gateway",
    tupleType: [caseType.id],
    initialTokens: [[{ typeId: caseType.id, value: "case1" }]],
  });
  const objectBindingPlace = builder.addPlace({
    id: "obj_ClassA",
    name: "ClassA Binding",
    tupleType: [caseType.id, objectType.id],
    initialTokens: args.includeObjectBinding
      ? [
          [
            { typeId: caseType.id, value: "case1" },
            { typeId: objectType.id, value: "classA1" },
          ],
        ]
      : [],
  });
  const participationPlace = builder.addPlace({
    id: "part_RoleA",
    name: "RoleA Participation",
    tupleType: [caseType.id, roleType.id],
    initialTokens: [
      [
        { typeId: caseType.id, value: "case1" },
        { typeId: roleType.id, value: "roleA1" },
      ],
    ],
  });
  const states = Object.fromEntries(
    ["approved", "rejected"].map((stateId) => [
      stateId,
      builder.addPlace({
        id: `state_RoleA_ClassA_${stateId}`,
        name: `RoleA ClassA ${stateId}`,
        tupleType: [roleType.id, objectType.id],
        initialTokens: args.enabledStateIds.includes(stateId)
          ? [
              [
                { typeId: roleType.id, value: "roleA1" },
                { typeId: objectType.id, value: "classA1" },
              ],
            ]
          : [],
      }),
    ])
  );

  for (const [stateId, branchId] of [
    ["approved", "Flow_approved"],
    ["rejected", "Flow_rejected"],
  ] as const) {
    const branch = builder.addTransition({
      id: `gateway_Gateway_decision_${branchId}`,
      name: `Decision Branch ${branchId}`,
    });
    const postPlace = builder.addPlace({
      id: `cf_${branchId}`,
      name: branchId,
      tupleType: [caseType.id],
    });

    builder.addOrdinaryArc({
      sourceId: prePlace.id,
      targetId: branch.id,
      inscription: [
        {
          typeId: caseType.id,
          variableId: caseVariable.id,
          isGenerated: false,
        },
      ],
    });
    addDecisionReadArc(builder, objectBindingPlace.id, branch.id, [
      { typeId: caseType.id, variableId: caseVariable.id, isGenerated: false },
      {
        typeId: objectType.id,
        variableId: objectVariable.id,
        isGenerated: false,
      },
    ]);
    addDecisionReadArc(builder, participationPlace.id, branch.id, [
      { typeId: caseType.id, variableId: caseVariable.id, isGenerated: false },
      { typeId: roleType.id, variableId: roleVariable.id, isGenerated: false },
    ]);
    addDecisionReadArc(builder, states[stateId].id, branch.id, [
      { typeId: roleType.id, variableId: roleVariable.id, isGenerated: false },
      {
        typeId: objectType.id,
        variableId: objectVariable.id,
        isGenerated: false,
      },
    ]);
    builder.addOrdinaryArc({
      sourceId: branch.id,
      targetId: postPlace.id,
      inscription: [
        {
          typeId: caseType.id,
          variableId: caseVariable.id,
          isGenerated: false,
        },
      ],
    });
  }

  return {
    net: builder.toTypedPetriNet(),
    domains: {
      [caseType.id]: ["case1"],
      [objectType.id]: ["classA1"],
      [roleType.id]: ["roleA1"],
    },
  };
}

function addDecisionReadArc(
  builder: TypedPetriNetBuilder,
  placeId: string,
  transitionId: string,
  inscription: Parameters<
    TypedPetriNetBuilder["addOrdinaryArc"]
  >[0]["inscription"]
): void {
  builder.addOrdinaryArc({
    sourceId: placeId,
    targetId: transitionId,
    inscription,
  });
  builder.addOrdinaryArc({
    sourceId: transitionId,
    targetId: placeId,
    inscription,
  });
}

function expectReceiverProgressionHolds(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.receiverProgression.holds, true);
  assert.equal(report.diagnostics.receiverProgressionViolations, 0);
  assert.deepEqual(report.receiverProgression.violations, []);
}

function expectReceiverProgressionViolated(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.receiverProgression.holds, false);
  assert.ok(report.diagnostics.receiverProgressionViolations > 0);
  assert.ok(report.receiverProgression.violations.length > 0);
}

function expectSenderProgressionHolds(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.senderProgression.holds, true);
  assert.equal(report.diagnostics.senderProgressionViolations, 0);
  assert.deepEqual(report.senderProgression.violations, []);
}

function expectSenderProgressionViolated(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(report.senderProgression.holds, false);
  assert.ok(report.diagnostics.senderProgressionViolations > 0);
  assert.ok(report.senderProgression.violations.length > 0);
}

function assertCrossCaseStateSpaceNotTruncated(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(
    report.stateSpace.truncated,
    false,
    `Expected cross-case state space not to be truncated. Report: ${formatReportSummary(
      report
    )}`
  );
}

function assertSenderProgressionHoldsWithDetails(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(
    report.senderProgression.holds,
    true,
    `Expected sender progression to hold. First violation: ${formatFirstViolation(
      report
    )}`
  );
  assert.equal(report.diagnostics.senderProgressionViolations, 0);
}

function assertReceiverProgressionHoldsWithDetails(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(
    report.receiverProgression.holds,
    true,
    `Expected receiver progression to hold. First violation: ${formatFirstViolation(
      report
    )}`
  );
  assert.equal(report.diagnostics.receiverProgressionViolations, 0);
}

function assertSenderProgressionViolatedWithDetails(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(
    report.senderProgression.holds,
    false,
    `Expected sender progression to be violated. Report: ${formatReportSummary(
      report
    )}`
  );
  assert.ok(report.diagnostics.senderProgressionViolations > 0);
  assert.ok(report.senderProgression.violations.length > 0);
}

function assertReceiverProgressionViolatedWithDetails(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(
    report.receiverProgression.holds,
    false,
    `Expected receiver progression to be violated. Report: ${formatReportSummary(
      report
    )}`
  );
  assert.ok(report.diagnostics.receiverProgressionViolations > 0);
  assert.ok(report.receiverProgression.violations.length > 0);
}

function assertDecisionConsistencyHoldsWithDetails(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(
    report.decisionConsistency.holds,
    true,
    `Expected decision consistency to hold. First violation: ${formatFirstViolation(
      report
    )}`
  );
  assert.equal(report.diagnostics.decisionConsistencyViolations, 0);
  assert.deepEqual(report.decisionConsistency.violations, []);
}

function assertDecisionConsistencyViolatedWithDetails(
  report: CrossCaseObjectAwareRealizabilityReport
): void {
  assert.equal(
    report.decisionConsistency.holds,
    false,
    `Expected decision consistency to be violated. Report: ${formatReportSummary(
      report
    )}`
  );
  assert.ok(report.diagnostics.decisionConsistencyViolations > 0);
  assert.ok(report.decisionConsistency.violations.length > 0);
}

function formatFirstViolation(
  report: CrossCaseObjectAwareRealizabilityReport
): string {
  return JSON.stringify(report.violations[0] ?? null, null, 2);
}

function formatReportSummary(
  report: CrossCaseObjectAwareRealizabilityReport
): string {
  return JSON.stringify(
    {
      stateSpace: report.stateSpace,
      diagnostics: report.diagnostics,
      firstViolation: report.violations[0] ?? null,
    },
    null,
    2
  );
}

function violationKey(
  violation: CrossCaseObjectAwareRealizabilityReport["violations"][number]
): string {
  if (violation.kind === "sender-progression") {
    return [
      violation.kind,
      violation.markingKey,
      violation.controlFlowPlaceId,
      violation.caseTokenKey,
      violation.senderTransitionIds.join(","),
    ].join("|");
  }

  if (violation.kind === "decision-consistency") {
    return [
      violation.kind,
      violation.markingKey,
      violation.controlFlowPlaceId,
      violation.caseTokenKey,
      violation.branchTransitionIds.join(","),
      violation.enabledBranchTransitionIds.join(","),
    ].join("|");
  }

  if (violation.kind === "case-option-to-complete") {
    return [
      violation.kind,
      violation.markingKey,
      violation.nodeId,
      violation.caseId,
    ].join("|");
  }

  return [
    violation.kind,
    violation.markingKey,
    violation.transmissionPlaceId,
    violation.transmissionTokenKey,
    violation.receiverTransitionIds.join(","),
  ].join("|");
}

function scenario(
  name: string,
  fixtures: FixtureTriple,
  run: (fixtures: NamedFixtureTriple) => Promise<void>
): void {
  if (!allFixturesExist(fixtures)) {
    throw new Error(`Missing fixtures for scenario "${name}"`);
  }

  it(name, () => run({ ...fixtures, scenarioName: name }));
}
