import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  awarenessPlaceId,
  buildCrossCasePetriNet,
  caseTypeId,
  controlFlowPlaceId,
  inclusionPlaceId,
  objectBindingPlaceId,
  objectTypeId,
  participationPlaceId,
  poolPlaceId,
  roleTypeId,
  startTransitionId,
  stateAwarenessPlaceId,
  taskReceiveTransitionId,
  transmissionPlaceId,
} from "../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import {
  createInitialTypedMarking,
  fireTypedTransitionOccurrence,
  generateTypedStateSpace,
  getEnabledTypedTransitionOccurrences,
  normalizeTypedMarking,
  typedMarkingKey,
  typedTokenKey,
  TypedPetriNetBuilder,
  type TypedIdentifierDomains,
  type TypedMarking,
  type TypedPetriNet,
  type TypedToken,
} from "../../src/shared/targets/typedPetriNet/index.js";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../fixtures/fixtureIds.js";
import { contextFromFixtures } from "../fixtures/contextFromFixtures.js";
import {
  typedPlaceId,
  typedTransitionId,
} from "../assertions/typedPetriNetAssertions.js";

describe("Typed Petri-net state-space exploration", () => {
  it("TPSS-01P starts one case from a finite case domain", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    });
    const domains = domainsFor({
      cases: ["case1"],
      roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
      objects: { ClassA: ["item1"] },
    });
    const startId = typedTransitionId(startTransitionId("Event_0ql5o4b"));
    const initial = createInitialTypedMarking(net);

    assert.ok(
      getEnabledTypedTransitionOccurrences({
        net,
        marking: initial,
        domains,
      }).some((occurrence) => occurrence.transitionId === startId)
    );

    const stateSpace = generateTypedStateSpace({
      net,
      domains,
      maxMarkings: 1000,
    });

    assert.ok(
      stateSpace.nodes.some((node) =>
        hasTokens(node.marking, [
          tokenSpec(typedPlaceId(participationPlaceId("RoleA")), [
            [caseTypeId(), "case1"],
            [roleTypeId("RoleA"), "RoleA_1"],
          ]),
          tokenSpec(typedPlaceId(participationPlaceId("RoleB")), [
            [caseTypeId(), "case1"],
            [roleTypeId("RoleB"), "RoleB_1"],
          ]),
          tokenSpec(typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1")), [
            [caseTypeId(), "case1"],
          ]),
        ])
      ),
      "Expected a marking after start with participants and initial control flow"
    );
    assertNoCaseOutside(
      stateSpace.nodes.map((node) => node.marking),
      ["case1"]
    );

    const afterStart = stateSpace.nodes.find((node) =>
      hasToken(node.marking, typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1")), [
        [caseTypeId(), "case1"],
      ])
    );
    assert.ok(afterStart, "Expected a started case marking");
    assert.equal(
      getEnabledTypedTransitionOccurrences({
        net,
        marking: afterStart.marking,
        domains,
      }).some((occurrence) => occurrence.transitionId === startId),
      false,
      "Start must not create a second case when the finite case domain is exhausted"
    );
  });

  it("TPSS-02P starts two cases when the case domain allows it", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    });
    const stateSpace = generateTypedStateSpace({
      net,
      domains: domainsFor({
        cases: ["case1", "case2"],
        roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
        objects: { ClassA: ["item1"] },
      }),
      maxMarkings: 5000,
    });

    assert.ok(
      stateSpace.nodes.some((node) =>
        hasTokens(node.marking, [
          tokenSpec(typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1")), [
            [caseTypeId(), "case1"],
          ]),
          tokenSpec(typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1")), [
            [caseTypeId(), "case2"],
          ]),
        ])
      ),
      "Expected a reachable marking containing both started cases"
    );
  });

  it("TPSS-03P case-specific object creation binds one object per case", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    });
    const stateSpace = generateTypedStateSpace({
      net,
      domains: domainsFor({
        cases: ["case1"],
        roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
        objects: { ClassA: ["item1", "item2"] },
      }),
      maxMarkings: 5000,
    });

    assert.ok(
      stateSpace.nodes.some((node) =>
        hasTokens(node.marking, [
          tokenSpec(typedPlaceId(awarenessPlaceId("RoleA", "ClassA")), [
            [roleTypeId("RoleA"), "RoleA_1"],
            [objectTypeId("ClassA"), "item1"],
          ]),
          tokenSpec(
            typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x")),
            [
              [roleTypeId("RoleA"), "RoleA_1"],
              [objectTypeId("ClassA"), "item1"],
            ]
          ),
          tokenSpec(typedPlaceId(objectBindingPlaceId("ClassA")), [
            [caseTypeId(), "case1"],
            [objectTypeId("ClassA"), "item1"],
          ]),
          tokenSpec(typedPlaceId(inclusionPlaceId("ClassA")), [
            [caseTypeId(), "case1"],
          ]),
        ])
      ),
      "Expected reachable marking with created case-specific object"
    );

    for (const node of stateSpace.nodes) {
      const bindings = tokensAt(
        node.marking,
        typedPlaceId(objectBindingPlaceId("ClassA"))
      ).filter((token) => token[0]?.value === "case1");

      assert.ok(
        new Set(bindings.map((token) => token[1]?.value)).size <= 1,
        "Expected at most one ClassA binding for case1 in each marking"
      );
    }
  });

  it("TPSS-04P object communication produces and consumes transmission", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: [],
    });
    const stateSpace = generateTypedStateSpace({
      net,
      domains: domainsFor({
        cases: ["case1"],
        roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
        objects: { ClassA: ["item1"] },
      }),
      maxMarkings: 10000,
    });

    assert.ok(
      stateSpace.nodes.some((node) =>
        hasToken(
          node.marking,
          typedPlaceId(transmissionPlaceId("ChoreographyTask_1ntuvmx")),
          [
            [caseTypeId(), "case1"],
            [objectTypeId("ClassA"), "item1"],
          ]
        )
      ),
      "Expected a reachable marking with the task transmission token"
    );
    assert.ok(
      stateSpace.nodes.some(
        (node) =>
          !hasToken(
            node.marking,
            typedPlaceId(transmissionPlaceId("ChoreographyTask_1ntuvmx")),
            [
              [caseTypeId(), "case1"],
              [objectTypeId("ClassA"), "item1"],
            ]
          ) &&
          hasToken(
            node.marking,
            typedPlaceId(controlFlowPlaceId("Flow_0wx5elb")),
            [[caseTypeId(), "case1"]]
          )
      ),
      "Expected a later marking with consumed transmission and outgoing control flow"
    );
  });

  it("TPSS-05P receiver non-awareness inhibitor enables first receive", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: [],
    });
    const domains = domainsFor({
      cases: ["case1"],
      roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
      objects: { ClassA: ["item1"] },
    });
    const stateSpace = generateTypedStateSpace({
      net,
      domains,
      maxMarkings: 10000,
    });
    const receiveId = typedTransitionId(
      taskReceiveTransitionId("ChoreographyTask_1ntuvmx")
    );
    const beforeReceive = stateSpace.nodes.find(
      (node) =>
        hasToken(
          node.marking,
          typedPlaceId(transmissionPlaceId("ChoreographyTask_1ntuvmx")),
          [
            [caseTypeId(), "case1"],
            [objectTypeId("ClassA"), "item1"],
          ]
        ) &&
        !hasToken(
          node.marking,
          typedPlaceId(awarenessPlaceId("RoleB", "ClassA")),
          [
            [roleTypeId("RoleB"), "RoleB_1"],
            [objectTypeId("ClassA"), "item1"],
          ]
        )
    );

    assert.ok(
      beforeReceive,
      "Expected marking before first receiver awareness"
    );
    assert.ok(
      getEnabledTypedTransitionOccurrences({
        net,
        marking: beforeReceive.marking,
        domains,
      }).some((occurrence) => occurrence.transitionId === receiveId),
      "Expected receive to be enabled while receiver awareness is absent"
    );
    assert.ok(
      stateSpace.nodes.some((node) =>
        hasTokens(node.marking, [
          tokenSpec(typedPlaceId(awarenessPlaceId("RoleB", "ClassA")), [
            [roleTypeId("RoleB"), "RoleB_1"],
            [objectTypeId("ClassA"), "item1"],
          ]),
          tokenSpec(
            typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-x")),
            [
              [roleTypeId("RoleB"), "RoleB_1"],
              [objectTypeId("ClassA"), "item1"],
            ]
          ),
        ])
      ),
      "Expected receive to create receiver awareness and state awareness"
    );
  });

  it("TPSS-06P hand-built inhibitor disables after inhibited token exists", () => {
    const builder = new TypedPetriNetBuilder(
      "inhibitor_test",
      "Inhibitor Test"
    );
    const itemType = builder.addIdentifierType({ id: "Item", name: "Item" });
    const itemVariable = builder.addVariable({
      id: "item",
      typeId: itemType.id,
    });
    const place = builder.addPlace({ id: "p", tupleType: [itemType.id] });
    const transition = builder.addTransition({
      id: "t",
      freshVariables: [{ variableId: itemVariable.id, typeId: itemType.id }],
    });
    builder.addInhibitorArc({
      sourceId: place.id,
      targetId: transition.id,
      inscription: [
        {
          typeId: itemType.id,
          variableId: itemVariable.id,
          isGenerated: false,
        },
      ],
    });
    builder.addOrdinaryArc({
      sourceId: transition.id,
      targetId: place.id,
      inscription: [
        { typeId: itemType.id, variableId: itemVariable.id, isGenerated: true },
      ],
    });

    const net = builder.toTypedPetriNet();
    const domains = { [itemType.id]: ["item1"] };
    const initial = createInitialTypedMarking(net);
    const enabled = getEnabledTypedTransitionOccurrences({
      net,
      marking: initial,
      domains,
    });

    assert.equal(enabled.length, 1);
    const afterFire = fireTypedTransitionOccurrence({
      net,
      marking: initial,
      occurrence: enabled[0],
    });
    assert.equal(
      getEnabledTypedTransitionOccurrences({
        net,
        marking: afterFire,
        domains,
      }).length,
      0
    );
  });

  it("TPSS-07P cross-case first binding reuses one object across two cases", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: ["ClassA"],
    });
    const stateSpace = generateTypedStateSpace({
      net,
      domains: domainsFor({
        cases: ["case1", "case2"],
        roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
        objects: { ClassA: ["item1"] },
      }),
      maxMarkings: 20000,
    });

    assert.ok(
      stateSpace.nodes.some((node) =>
        hasTokens(node.marking, [
          tokenSpec(typedPlaceId(objectBindingPlaceId("ClassA")), [
            [caseTypeId(), "case1"],
            [objectTypeId("ClassA"), "item1"],
          ]),
          tokenSpec(typedPlaceId(objectBindingPlaceId("ClassA")), [
            [caseTypeId(), "case2"],
            [objectTypeId("ClassA"), "item1"],
          ]),
          tokenSpec(typedPlaceId(inclusionPlaceId("ClassA")), [
            [caseTypeId(), "case1"],
          ]),
          tokenSpec(typedPlaceId(inclusionPlaceId("ClassA")), [
            [caseTypeId(), "case2"],
          ]),
        ])
      ),
      "Expected one cross-case object to be bound to both cases"
    );
  });

  it("TPSS-08P cross-case first binding enforces one object per case", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: ["ClassA"],
    });
    const stateSpace = generateTypedStateSpace({
      net,
      domains: domainsFor({
        cases: ["case1"],
        roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
        objects: { ClassA: ["item1", "item2"] },
      }),
      maxMarkings: 20000,
    });

    for (const node of stateSpace.nodes) {
      const bindings = tokensAt(
        node.marking,
        typedPlaceId(objectBindingPlaceId("ClassA"))
      ).filter((token) => token[0]?.value === "case1");

      assert.ok(
        new Set(bindings.map((token) => token[1]?.value)).size <= 1,
        "Expected at most one cross-case ClassA binding for case1 in each marking"
      );
    }
  });

  it("TPSS-09P preserves pool and participation tokens across two cases", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    });
    const stateSpace = generateTypedStateSpace({
      net,
      domains: domainsFor({
        cases: ["case1", "case2"],
        roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
        objects: { ClassA: ["item1"] },
      }),
      maxMarkings: 5000,
    });

    assert.ok(
      stateSpace.nodes.some((node) =>
        hasTokens(node.marking, [
          tokenSpec(typedPlaceId(poolPlaceId("RoleA")), [
            [roleTypeId("RoleA"), "RoleA_1"],
          ]),
          tokenSpec(typedPlaceId(poolPlaceId("RoleB")), [
            [roleTypeId("RoleB"), "RoleB_1"],
          ]),
          tokenSpec(typedPlaceId(participationPlaceId("RoleA")), [
            [caseTypeId(), "case1"],
            [roleTypeId("RoleA"), "RoleA_1"],
          ]),
          tokenSpec(typedPlaceId(participationPlaceId("RoleA")), [
            [caseTypeId(), "case2"],
            [roleTypeId("RoleA"), "RoleA_1"],
          ]),
          tokenSpec(typedPlaceId(participationPlaceId("RoleB")), [
            [caseTypeId(), "case1"],
            [roleTypeId("RoleB"), "RoleB_1"],
          ]),
          tokenSpec(typedPlaceId(participationPlaceId("RoleB")), [
            [caseTypeId(), "case2"],
            [roleTypeId("RoleB"), "RoleB_1"],
          ]),
        ])
      ),
      "Expected both cases to reuse the same participants while preserving pool tokens"
    );
  });

  it("TPSS-10P synchronized task execution moves state-awareness tokens", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
      crossCaseClasses: [],
    });
    const stateSpace = generateTypedStateSpace({
      net,
      domains: domainsFor({
        cases: ["case1"],
        roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
        objects: { ClassA: ["item1"] },
      }),
      maxMarkings: 10000,
    });

    assert.ok(
      stateSpace.nodes.some(
        (node) =>
          hasToken(node.marking, typedPlaceId(objectBindingPlaceId("ClassA")), [
            [caseTypeId(), "case1"],
            [objectTypeId("ClassA"), "item1"],
          ]) &&
          !hasToken(
            node.marking,
            typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x")),
            [
              [roleTypeId("RoleA"), "RoleA_1"],
              [objectTypeId("ClassA"), "item1"],
            ]
          ) &&
          !hasToken(
            node.marking,
            typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-x")),
            [
              [roleTypeId("RoleB"), "RoleB_1"],
              [objectTypeId("ClassA"), "item1"],
            ]
          ) &&
          hasToken(
            node.marking,
            typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-y")),
            [
              [roleTypeId("RoleA"), "RoleA_1"],
              [objectTypeId("ClassA"), "item1"],
            ]
          ) &&
          hasToken(
            node.marking,
            typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-y")),
            [
              [roleTypeId("RoleB"), "RoleB_1"],
              [objectTypeId("ClassA"), "item1"],
            ]
          ) &&
          hasToken(
            node.marking,
            typedPlaceId(controlFlowPlaceId("Flow_1gcowfd")),
            [[caseTypeId(), "case1"]]
          )
      ),
      "Expected synchronized task execution to move both participant views from a-x to a-y"
    );
  });

  it("TPSS-11P generated fresh variables of the same type are distinct", () => {
    const builder = new TypedPetriNetBuilder(
      "fresh_distinct_test",
      "Fresh Distinct Test"
    );
    const itemType = builder.addIdentifierType({ id: "Item", name: "Item" });
    const leftVariable = builder.addVariable({
      id: "left_item",
      typeId: itemType.id,
    });
    const rightVariable = builder.addVariable({
      id: "right_item",
      typeId: itemType.id,
    });
    const leftPlace = builder.addPlace({
      id: "left_place",
      tupleType: [itemType.id],
    });
    const rightPlace = builder.addPlace({
      id: "right_place",
      tupleType: [itemType.id],
    });
    const transition = builder.addTransition({
      id: "create_two_items",
      freshVariables: [
        { variableId: leftVariable.id, typeId: itemType.id },
        { variableId: rightVariable.id, typeId: itemType.id },
      ],
    });

    builder.addOrdinaryArc({
      sourceId: transition.id,
      targetId: leftPlace.id,
      inscription: [
        { typeId: itemType.id, variableId: leftVariable.id, isGenerated: true },
      ],
    });
    builder.addOrdinaryArc({
      sourceId: transition.id,
      targetId: rightPlace.id,
      inscription: [
        {
          typeId: itemType.id,
          variableId: rightVariable.id,
          isGenerated: true,
        },
      ],
    });

    const enabled = getEnabledTypedTransitionOccurrences({
      net: builder.toTypedPetriNet(),
      marking: createInitialTypedMarking(builder.toTypedPetriNet()),
      domains: { [itemType.id]: ["item1", "item2"] },
    });

    assert.ok(enabled.length > 0, "Expected at least one enabled occurrence");
    assert.ok(
      enabled.every(
        (occurrence) =>
          occurrence.binding[leftVariable.id] !==
          occurrence.binding[rightVariable.id]
      ),
      "Expected generated variables of the same type to receive distinct values"
    );
  });

  it("TPSS-12P exploration order is deterministic", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: [],
    });
    const domains = domainsFor({
      cases: ["case1"],
      roles: { RoleA: ["RoleA_1"], RoleB: ["RoleB_1"] },
      objects: { ClassA: ["item1"] },
    });
    const left = generateTypedStateSpace({ net, domains, maxMarkings: 10000 });
    const right = generateTypedStateSpace({ net, domains, maxMarkings: 10000 });

    assert.deepEqual(
      left.nodes.map((node) => node.markingKey),
      right.nodes.map((node) => node.markingKey)
    );
    assert.deepEqual(left.edges.map(edgeKey), right.edges.map(edgeKey));
  });

  it("TPSS-13P fixed participant assignments restrict start occurrences", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
      participantIdsByRole: {
        RoleA: ["roleA1", "roleA2"],
        RoleB: ["roleB1"],
      },
    });
    const stateSpace = generateTypedStateSpace({
      net,
      domains: domainsFor({
        cases: ["case1", "case2"],
        roles: {
          RoleA: ["roleA1", "roleA2"],
          RoleB: ["roleB1"],
        },
        objects: { ClassA: ["item1"] },
      }),
      fixedParticipantsByCaseAndRole: {
        case1: { RoleA: "roleA1", RoleB: "roleB1" },
        case2: { RoleA: "roleA2", RoleB: "roleB1" },
      },
      maxMarkings: 5000,
    });
    const roleAParticipationPlaceId = typedPlaceId(
      participationPlaceId("RoleA")
    );

    assert.ok(
      stateSpace.nodes.some((node) =>
        hasToken(node.marking, roleAParticipationPlaceId, [
          [caseTypeId(), "case1"],
          [roleTypeId("RoleA"), "roleA1"],
        ])
      ),
      "Expected case1 to be reachable with the configured RoleA assignment"
    );
    assert.ok(
      stateSpace.nodes.some((node) =>
        hasToken(node.marking, roleAParticipationPlaceId, [
          [caseTypeId(), "case2"],
          [roleTypeId("RoleA"), "roleA2"],
        ])
      ),
      "Expected case2 to be reachable with the configured RoleA assignment"
    );

    for (const node of stateSpace.nodes) {
      assert.equal(
        hasToken(node.marking, roleAParticipationPlaceId, [
          [caseTypeId(), "case1"],
          [roleTypeId("RoleA"), "roleA2"],
        ]),
        false,
        "case1 must not start with the unassigned RoleA participant"
      );
      assert.equal(
        hasToken(node.marking, roleAParticipationPlaceId, [
          [caseTypeId(), "case2"],
          [roleTypeId("RoleA"), "roleA1"],
        ]),
        false,
        "case2 must not start with the unassigned RoleA participant"
      );
    }
  });

  it("TPSS-14N fixed participant assignments validate finite domains", async () => {
    const net = await buildScenarioNet({
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    });

    assert.throws(
      () =>
        generateTypedStateSpace({
          net,
          domains: domainsFor({
            cases: ["case1"],
            roles: {
              RoleA: ["roleA1"],
              RoleB: ["roleB1"],
            },
            objects: { ClassA: ["item1"] },
          }),
          fixedParticipantsByCaseAndRole: {
            case1: { RoleA: "roleA2", RoleB: "roleB1" },
          },
          maxMarkings: 100,
        }),
      /Fixed participant assignment for case "case1" role "RoleA" uses participant "roleA2", which is not in the finite domain for role "RoleA"/
    );
  });
});

async function buildScenarioNet(args: {
  choreography: string;
  sharedDataModel: string;
  sharedLifecycle: string;
  crossCaseClasses: string[];
  participantIdsByRole?: Record<string, string[]>;
}): Promise<TypedPetriNet> {
  return buildCrossCasePetriNet(await contextFromFixtures(args), {
    crossCaseClasses: args.crossCaseClasses,
    participantIdsByRole: args.participantIdsByRole,
  });
}

function domainsFor(args: {
  cases: string[];
  roles: Record<string, string[]>;
  objects: Record<string, string[]>;
}): TypedIdentifierDomains {
  return {
    [caseTypeId()]: args.cases,
    ...Object.fromEntries(
      Object.entries(args.roles).map(([roleId, values]) => [
        roleTypeId(roleId),
        values,
      ])
    ),
    ...Object.fromEntries(
      Object.entries(args.objects).map(([classId, values]) => [
        objectTypeId(classId),
        values,
      ])
    ),
  };
}

function tokenSpec(
  placeId: string,
  values: Array<[typeId: string, value: string]>
): { placeId: string; token: TypedToken } {
  return {
    placeId,
    token: values.map(([typeId, value]) => ({ typeId, value })),
  };
}

function hasTokens(
  marking: TypedMarking,
  specs: Array<{ placeId: string; token: TypedToken }>
): boolean {
  return specs.every((spec) =>
    hasToken(
      marking,
      spec.placeId,
      spec.token.map((value) => [value.typeId, value.value])
    )
  );
}

function hasToken(
  marking: TypedMarking,
  placeId: string,
  values: Array<[typeId: string, value: string]>
): boolean {
  const key = typedTokenKey(
    values.map(([typeId, value]) => ({ typeId, value }))
  );

  return tokensAt(marking, placeId).some(
    (token) => typedTokenKey(token) === key
  );
}

function tokensAt(marking: TypedMarking, placeId: string): TypedToken[] {
  return normalizeTypedMarking(marking).get(placeId) ?? [];
}

function assertNoCaseOutside(
  markings: TypedMarking[],
  allowedCases: string[]
): void {
  const allowed = new Set(allowedCases);

  for (const marking of markings) {
    for (const tokens of marking.values()) {
      for (const token of tokens) {
        for (const value of token) {
          if (value.typeId === caseTypeId()) {
            assert.ok(
              allowed.has(value.value),
              `Unexpected case id ${value.value} in ${typedMarkingKey(marking)}`
            );
          }
        }
      }
    }
  }
}

function edgeKey(edge: {
  sourceId: number;
  targetId: number;
  occurrence: { transitionId: string; binding: Record<string, string> };
}): string {
  return `${edge.sourceId}->${edge.targetId}:${
    edge.occurrence.transitionId
  }:${Object.entries(edge.occurrence.binding)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([variableId, value]) => `${variableId}=${value}`)
    .join(",")}`;
}
