import { describe, it } from "node:test";
import { buildIsolatedCaseSemantics } from "../../../src/shared/semantics/isolatedCaseSemantics.js";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../../fixtures/fixtureIds.js";
import {
  contextFromFixtures,
  type FixtureTriple,
} from "../../fixtures/contextFromFixtures.js";
import { allFixturesExist } from "../../fixtures/fixtureLoader.js";
import { writeScenarioResult } from "../../../src/shared/testing/resultWriter.js";
import {
  Class,
  requireExistencePlace,
  Role,
  expectNoReadArc,
  requireReadArc,
  expectWellFormedPetriNet,
  requireLocalTransition,
  expectNoTransition,
  requireCompositeOneToOneCreationTransition,
  requireTransition,
  expectNoPlace,
  requireVirtualInitialStatePlace,
  requireStatePlace,
  requireLocalCreationTransition,
  requireArc,
  requireInteractionTransition,
  expectNoArc,
  requireBranchGuardReadArc,
  requireGatewayBranchTransition,
  expectNoBranchGuardReadArc,
  expectControlFlowCycleThroughTransition,
  expectControlFlowPath,
  expectNoControlFlowPath,
  getPreset,
  requirePlace,
  getPostset,
} from "../../assertions/petriNetAssertions.js";
import assert from "node:assert";

type NamedFixtureTriple = FixtureTriple & {
  scenarioName: string;
};

describe("Petri-Net Generation Fixtures", () => {
  scenario(
    "ICPN-01P Basic control-flow backbone without object reference",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      const task = requireTransition(petriNet, /task1/);
      const sourcePlace = requirePlace(petriNet, /p_source/);
      const sinkPlace = requirePlace(petriNet, /p_sink/);

      const sourcePostset = getPostset(petriNet, sourcePlace);
      const sourcePreset = getPreset(petriNet, sourcePlace);
      const sinkPostset = getPostset(petriNet, sinkPlace);
      const sinkPreset = getPreset(petriNet, sinkPlace);

      assert.equal(
        sourcePreset.length,
        0,
        `Expected source place to have no incoming arcs, but found ${sourcePreset.length}`
      );
      assert.equal(
        sourcePostset.length,
        1,
        `Expected source place to have exactly one outgoing arc, but found ${sourcePostset.length}`
      );
      assert.equal(
        sinkPreset.length,
        1,
        `Expected sink place to have exactly one incoming arc, but found ${sinkPreset.length}`
      );
      assert.equal(
        sinkPostset.length,
        0,
        `Expected sink place to have no outgoing arcs, but found ${sinkPostset.length}`
      );

      const [startEvent] = sourcePostset;
      const [endEvent] = sinkPreset;

      expectControlFlowPath(petriNet, startEvent, task);
      expectControlFlowPath(petriNet, task, endEvent);

      expectNoTransition(petriNet, /^t_send_.*/);
      expectNoTransition(petriNet, /^t_comb_send_.*/);
      expectNoTransition(petriNet, /^t_sync_send_.*/);
      expectNoTransition(petriNet, /^t_recv_.*/);
      expectNoTransition(petriNet, /^t_comb_recv_.*/);
      expectNoTransition(petriNet, /^t_sync_recv_.*/);
      expectNoPlace(petriNet, /^p_trans_/);
    }
  );

  scenario(
    "ICPN-02P Local state structure",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      const classStateCombinations = [
        { className: Class.A, stateName: "a-x" },
        { className: Class.B, stateName: "b-x" },
        { className: Class.C, stateName: "c-x" },
      ];
      for (const { className, stateName } of classStateCombinations) {
        for (const role of [Role.A, Role.B]) {
          requireExistencePlace(petriNet, role, className);
          requireVirtualInitialStatePlace(petriNet, role, className);
          requireStatePlace(petriNet, role, className, stateName);
        }
        requireLocalCreationTransition(petriNet, Role.A, className, stateName);
        expectNoTransition(
          petriNet,
          new RegExp(`^t_local_${Role.B}_${className}_initial_${stateName}$`)
        );
      }
    }
  );

  scenario(
    "ICPN-03P Many-to-many creation",
    {
      choreography: Choreographies.c07SequenceCommunicationTwoClasses,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, both ClassA and ClassB are created locally by RoleA.
      const classAExistence = requireExistencePlace(petriNet, Role.A, Class.A);
      const classBExistence = requireExistencePlace(petriNet, Role.A, Class.B);

      const classACreationTransition = requireLocalCreationTransition(
        petriNet,
        Role.A,
        Class.A,
        "a-x"
      );

      const classBCreationTransition = requireLocalCreationTransition(
        petriNet,
        Role.A,
        Class.B,
        "b-x"
      );

      expectNoReadArc(petriNet, classAExistence, classBCreationTransition);
      expectNoReadArc(petriNet, classBExistence, classACreationTransition);
    }
  );

  scenario(
    "ICPN-04P Many-to-one creation dependency",
    {
      choreography: Choreographies.c07SequenceCommunicationTwoClasses,
      sharedDataModel: SharedDataModels.d03TwoClassesN1,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);
      // In this fixture, ClassB creation depends on prior ClassA existence.
      const classAExistence = requireExistencePlace(petriNet, Role.A, Class.A);
      const classBExistence = requireExistencePlace(petriNet, Role.A, Class.B);

      const classACreationTransition = requireLocalCreationTransition(
        petriNet,
        Role.A,
        Class.A,
        "a-x"
      );

      const classBCreationTransition = requireLocalCreationTransition(
        petriNet,
        Role.A,
        Class.B,
        "b-x"
      );

      requireReadArc(petriNet, classAExistence, classBCreationTransition);
      expectNoReadArc(petriNet, classBExistence, classACreationTransition);
    }
  );

  scenario(
    "ICPN-05P One-to-one creation",
    {
      choreography: Choreographies.c07SequenceCommunicationTwoClasses,
      sharedDataModel: SharedDataModels.d04TwoClasses11,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);
      // In this fixture, ClassA and ClassB have a one-to-one association.
      requireCompositeOneToOneCreationTransition(petriNet, Role.A, [
        { className: Class.A, targetState: "a-x" },
        { className: Class.B, targetState: "b-x" },
      ]);

      expectNoTransition(
        petriNet,
        new RegExp(`^t_local_${Role.A}_${Class.A}_initial_.*`)
      );
      expectNoTransition(
        petriNet,
        new RegExp(`^t_local_${Role.A}_${Class.B}_initial_.*`)
      );
    }
  );

  scenario(
    "ICPN-06P No association",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, ClassA, ClassB, and ClassC are independently created by RoleA.
      const classAExistence = requireExistencePlace(petriNet, Role.A, Class.A);
      const classBExistence = requireExistencePlace(petriNet, Role.A, Class.B);
      const classCExistence = requireExistencePlace(petriNet, Role.A, Class.C);

      const classACreationTransition = requireLocalCreationTransition(
        petriNet,
        Role.A,
        Class.A,
        "a-x"
      );

      const classBCreationTransition = requireLocalCreationTransition(
        petriNet,
        Role.A,
        Class.B,
        "b-x"
      );

      const classCCreationTransition = requireLocalCreationTransition(
        petriNet,
        Role.A,
        Class.C,
        "c-x"
      );

      expectNoReadArc(petriNet, classAExistence, classBCreationTransition);
      expectNoReadArc(petriNet, classAExistence, classCCreationTransition);
      expectNoReadArc(petriNet, classBExistence, classACreationTransition);
      expectNoReadArc(petriNet, classBExistence, classCCreationTransition);
      expectNoReadArc(petriNet, classCExistence, classACreationTransition);
      expectNoReadArc(petriNet, classCExistence, classBCreationTransition);
    }
  );

  scenario(
    "ICPN-07P Mixed dependencies",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d06ThreeClasses1NAndNM,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, ClassC is created independently, while ClassA and ClassB
      // are created jointly by a one-to-one composite creation transition that
      // depends on prior ClassC existence.
      const classAExistence = requireExistencePlace(petriNet, Role.A, Class.A);
      const classBExistence = requireExistencePlace(petriNet, Role.A, Class.B);
      const classCExistence = requireExistencePlace(petriNet, Role.A, Class.C);

      const classCCreationTransition = requireLocalCreationTransition(
        petriNet,
        Role.A,
        Class.C,
        "c-x"
      );

      expectNoReadArc(petriNet, classAExistence, classCCreationTransition);
      expectNoReadArc(petriNet, classBExistence, classCCreationTransition);

      const compositeCreationTransition =
        requireCompositeOneToOneCreationTransition(petriNet, Role.A, [
          { className: Class.A, targetState: "a-x" },
          { className: Class.B, targetState: "b-x" },
        ]);

      requireReadArc(petriNet, classCExistence, compositeCreationTransition);

      expectNoTransition(
        petriNet,
        new RegExp(`^t_local_${Role.A}_${Class.A}_initial_.*`)
      );
      expectNoTransition(
        petriNet,
        new RegExp(`^t_local_${Role.A}_${Class.B}_initial_.*`)
      );
    }
  );

  scenario(
    "ICPN-08P Local transitions by roles",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, ClassA is created by RoleA.
      requireLocalCreationTransition(petriNet, Role.A, Class.A, "a-x");

      // RoleB can locally evolve ClassA from a-x to a-y.
      requireLocalTransition(petriNet, Role.B, Class.A, "a-x", "a-y");

      // The same local lifecycle transitions must not be available to the wrong role.
      expectNoTransition(
        petriNet,
        new RegExp(`^t_local_${Role.B}_${Class.A}_initial_a-x$`)
      );
      expectNoTransition(
        petriNet,
        new RegExp(`^t_local_${Role.A}_${Class.A}_a-x_a-y$`)
      );
    }
  );

  scenario(
    "ICPN-09P Object-state communication",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, RoleA communicates ClassA in state a-x to RoleB.
      const senderState = requireStatePlace(petriNet, Role.A, Class.A, "a-x");
      const receiverCompatibleState = requireVirtualInitialStatePlace(
        petriNet,
        Role.B,
        Class.A
      );
      const receiverState = requireStatePlace(petriNet, Role.B, Class.A, "a-x");

      const sendTransition = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "communication",
        role: Role.A,
        fragments: [Class.A, "a-x"],
      });

      const receiveTransition = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "communication",
        role: Role.B,
        fragments: [Class.A, "initial", "a-x"],
      });

      requireReadArc(petriNet, senderState, sendTransition);
      requireArc(petriNet, receiverCompatibleState, receiveTransition);
      requireArc(petriNet, receiveTransition, receiverState);
    }
  );

  scenario(
    "ICPN-10P Object-state communication with multiple compatible receiver states",
    {
      choreography:
        Choreographies.c17EventBasedGatewayCommunicationOneClassJoinCommunication,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l14LocalTransitionDifferentSourcesSameTarget,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, RoleA communicates ClassA in state a-z to RoleB.
      // RoleB can incorporate the communicated state from either local state a-x or a-y.
      const senderState = requireStatePlace(petriNet, Role.A, Class.A, "a-z");

      const receiverSourceX = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-x"
      );
      const receiverSourceY = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-y"
      );
      const receiverTargetZ = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-z"
      );

      const sendTransition = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "communication",
        role: Role.A,
        fragments: [Class.A, "a-z"],
      });

      const receiveFromX = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "communication",
        role: Role.B,
        fragments: [Class.A, "a-x", "a-z"],
      });

      const receiveFromY = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "communication",
        role: Role.B,
        fragments: [Class.A, "a-y", "a-z"],
      });

      requireReadArc(petriNet, senderState, sendTransition);

      requireArc(petriNet, receiverSourceX, receiveFromX);
      requireArc(petriNet, receiveFromX, receiverTargetZ);

      requireArc(petriNet, receiverSourceY, receiveFromY);
      requireArc(petriNet, receiveFromY, receiverTargetZ);
    }
  );

  scenario(
    "ICPN-11P Synchronized transition, one class",
    {
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      const roleASource = requireStatePlace(petriNet, Role.A, Class.A, "a-x");
      const roleATarget = requireStatePlace(petriNet, Role.A, Class.A, "a-y");
      const roleBSource = requireStatePlace(petriNet, Role.B, Class.A, "a-x");
      const roleBTarget = requireStatePlace(petriNet, Role.B, Class.A, "a-y");

      const sendTransition = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "synchronized",
        role: Role.A,
        fragments: [Class.A, "a-x"],
      });

      const receiveTransition = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "synchronized",
        role: Role.B,
        fragments: [Class.A, "a-x"],
      });

      requireArc(petriNet, roleASource, sendTransition);
      requireArc(petriNet, sendTransition, roleATarget);

      requireArc(petriNet, roleBSource, receiveTransition);
      requireArc(petriNet, receiveTransition, roleBTarget);

      expectNoArc(petriNet, roleASource, receiveTransition);
      expectNoArc(petriNet, receiveTransition, roleATarget);
      expectNoArc(petriNet, roleBSource, sendTransition);
      expectNoArc(petriNet, sendTransition, roleBTarget);
    }
  );

  scenario(
    "ICPN-12P Synchronized transition, multiple classes",
    {
      choreography: Choreographies.c11SequenceSynchronizationTwoClasses,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l17SynchronizedTransitionTwoClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      const roleAClassASource = requireStatePlace(
        petriNet,
        Role.A,
        Class.A,
        "a-x"
      );
      const roleAClassATarget = requireStatePlace(
        petriNet,
        Role.A,
        Class.A,
        "a-y"
      );
      const roleAClassBSource = requireStatePlace(
        petriNet,
        Role.A,
        Class.B,
        "b-x"
      );
      const roleAClassBTarget = requireStatePlace(
        petriNet,
        Role.A,
        Class.B,
        "b-y"
      );

      const roleBClassASource = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-x"
      );
      const roleBClassATarget = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-y"
      );
      const roleBClassBSource = requireStatePlace(
        petriNet,
        Role.B,
        Class.B,
        "b-x"
      );
      const roleBClassBTarget = requireStatePlace(
        petriNet,
        Role.B,
        Class.B,
        "b-y"
      );

      const sendTransition = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "synchronized",
        role: Role.A,
        fragments: [Class.A, "a-x", Class.B, "b-x"],
      });

      const receiveTransition = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "synchronized",
        role: Role.B,
        fragments: [Class.A, "a-x", Class.B, "b-x"],
      });

      requireArc(petriNet, roleAClassASource, sendTransition);
      requireArc(petriNet, sendTransition, roleAClassATarget);
      requireArc(petriNet, roleAClassBSource, sendTransition);
      requireArc(petriNet, sendTransition, roleAClassBTarget);

      requireArc(petriNet, roleBClassASource, receiveTransition);
      requireArc(petriNet, receiveTransition, roleBClassATarget);
      requireArc(petriNet, roleBClassBSource, receiveTransition);
      requireArc(petriNet, receiveTransition, roleBClassBTarget);
    }
  );

  scenario(
    "ICPN-13P Synchronized transition, multiple source states",
    {
      choreography:
        Choreographies.c18EventBasedGatewayCommunicationOneClassJoinSynchronization,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l18SynchronizedTransitionDifferentSourcesSameTarget,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      const roleASourceX = requireStatePlace(petriNet, Role.A, Class.A, "a-x");
      const roleASourceY = requireStatePlace(petriNet, Role.A, Class.A, "a-y");
      const roleATargetZ = requireStatePlace(petriNet, Role.A, Class.A, "a-z");

      const roleBSourceX = requireStatePlace(petriNet, Role.B, Class.A, "a-x");
      const roleBSourceY = requireStatePlace(petriNet, Role.B, Class.A, "a-y");
      const roleBTargetZ = requireStatePlace(petriNet, Role.B, Class.A, "a-z");

      const sendFromX = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "synchronized",
        role: Role.A,
        fragments: [Class.A, "a-x"],
      });

      const sendFromY = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "synchronized",
        role: Role.A,
        fragments: [Class.A, "a-y"],
      });

      const receiveFromX = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "synchronized",
        role: Role.B,
        fragments: [Class.A, "a-x"],
      });

      const receiveFromY = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "synchronized",
        role: Role.B,
        fragments: [Class.A, "a-y"],
      });

      requireArc(petriNet, roleASourceX, sendFromX);
      requireArc(petriNet, sendFromX, roleATargetZ);

      requireArc(petriNet, roleASourceY, sendFromY);
      requireArc(petriNet, sendFromY, roleATargetZ);

      requireArc(petriNet, roleBSourceX, receiveFromX);
      requireArc(petriNet, receiveFromX, roleBTargetZ);

      requireArc(petriNet, roleBSourceY, receiveFromY);
      requireArc(petriNet, receiveFromY, roleBTargetZ);
    }
  );

  scenario(
    "ICPN-14P Combined task, same class",
    {
      choreography: Choreographies.c14CombinedSameClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, RoleA communicates ClassA in state a-x to RoleB,
      // while the same task synchronizes ClassA from a-x to a-y.
      const senderSource = requireStatePlace(petriNet, Role.A, Class.A, "a-x");
      const senderTarget = requireStatePlace(petriNet, Role.A, Class.A, "a-y");
      const receiverCompatibleState = requireVirtualInitialStatePlace(
        petriNet,
        Role.B,
        Class.A
      );
      const receiverTarget = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-y"
      );

      const sendTransition = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "combined",
        role: Role.A,
        fragments: [Class.A, "a-x"],
      });

      const receiveTransition1 = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "combined",
        role: Role.B,
        fragments: [Class.A, "initial", "a-x"],
      });

      const receiveTransition2 = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "combined",
        role: Role.B,
        fragments: [Class.A, "a-x", "a-x"],
      });

      requireArc(petriNet, senderSource, sendTransition);
      requireArc(petriNet, sendTransition, senderTarget);

      requireArc(petriNet, receiverCompatibleState, receiveTransition1);
      requireArc(petriNet, receiveTransition1, receiverTarget);

      requireArc(petriNet, receiverCompatibleState, receiveTransition2);
      requireArc(petriNet, receiveTransition2, receiverTarget);
    }
  );

  scenario(
    "ICPN-15P Combined task, communicate one class and synchronize another",
    {
      choreography: Choreographies.c15CombinedDifferentClasses,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle:
        SharedLifecycles.l20SynchronizedTransitionOneOfTwoClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, RoleA communicates ClassB in state b-x to RoleB,
      // while the same task synchronizes ClassA.
      const senderClassASource = requireStatePlace(
        petriNet,
        Role.A,
        Class.A,
        "a-x"
      );
      const senderClassATarget = requireStatePlace(
        petriNet,
        Role.A,
        Class.A,
        "a-y"
      );
      const senderClassB = requireStatePlace(petriNet, Role.A, Class.B, "b-x");

      const receiverCompatibleClassBState = requireVirtualInitialStatePlace(
        petriNet,
        Role.B,
        Class.B
      );
      const receiverClassBTarget = requireStatePlace(
        petriNet,
        Role.B,
        Class.B,
        "b-x"
      );
      const receiverClassASource = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-x"
      );
      const receiverClassATarget = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-y"
      );

      const sendTransition = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "combined",
        role: Role.A,
        fragments: [Class.B, "b-x", Class.A, "a-x"],
      });

      const receiveTransition = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "combined",
        role: Role.B,
        fragments: [Class.B, "initial", Class.A, "a-x"],
      });

      requireArc(petriNet, senderClassASource, sendTransition);
      requireArc(petriNet, sendTransition, senderClassATarget);
      requireReadArc(petriNet, senderClassB, sendTransition);

      requireArc(petriNet, receiverCompatibleClassBState, receiveTransition);
      requireArc(petriNet, receiveTransition, receiverClassBTarget);
      requireArc(petriNet, receiverClassASource, receiveTransition);
      requireArc(petriNet, receiveTransition, receiverClassATarget);
    }
  );

  scenario(
    "ICPN-16P Combined task, synchronize multiple classes",
    {
      choreography: Choreographies.c15CombinedDifferentClasses,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l17SynchronizedTransitionTwoClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, RoleA communicates ClassB in state b-x to RoleB,
      // while the same task synchronizes ClassA and ClassB.
      const senderClassASource = requireStatePlace(
        petriNet,
        Role.A,
        Class.A,
        "a-x"
      );
      const senderClassATarget = requireStatePlace(
        petriNet,
        Role.A,
        Class.A,
        "a-y"
      );
      const senderClassBSource = requireStatePlace(
        petriNet,
        Role.A,
        Class.B,
        "b-x"
      );
      const senderClassBTarget = requireStatePlace(
        petriNet,
        Role.A,
        Class.B,
        "b-y"
      );
      const receiverCompatibleClassBState = requireVirtualInitialStatePlace(
        petriNet,
        Role.B,
        Class.B
      );
      const receiverClassBTarget = requireStatePlace(
        petriNet,
        Role.B,
        Class.B,
        "b-y"
      );
      const receiverClassASource = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-x"
      );
      const receiverClassATarget = requireStatePlace(
        petriNet,
        Role.B,
        Class.A,
        "a-y"
      );

      const sendTransition = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "combined",
        role: Role.A,
        fragments: [Class.A, "a-x", Class.B, "b-x"],
      });

      const receiveTransition = requireInteractionTransition(petriNet, {
        direction: "receive",
        kind: "combined",
        role: Role.B,
        fragments: [Class.A, "initial", "a-x", Class.B, "b-x"],
      });

      requireArc(petriNet, senderClassASource, sendTransition);
      requireArc(petriNet, sendTransition, senderClassATarget);
      requireArc(petriNet, senderClassBSource, sendTransition);
      requireArc(petriNet, sendTransition, senderClassBTarget);

      requireArc(petriNet, receiverCompatibleClassBState, receiveTransition);
      requireArc(petriNet, receiveTransition, receiverClassBTarget);
      requireArc(petriNet, receiverClassASource, receiveTransition);
      requireArc(petriNet, receiveTransition, receiverClassATarget);
    }
  );

  scenario(
    "ICPN-17P Event-based gateway split",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // Event-based gateways do not introduce guard transitions. The sequence-flow
      // place before the gateway is connected directly to the succeeding tasks.
      const task2 = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "communication",
        role: Role.A,
        fragments: [Class.A, "a-x"],
      });
      const task3 = requireInteractionTransition(petriNet, {
        direction: "send",
        kind: "communication",
        role: Role.A,
        fragments: [Class.A, "a-y"],
      });

      const presetSequenceFlowPlacesA = getPreset(petriNet, task2).filter(
        (element) => element.id.startsWith("p_sf_")
      );

      assert.equal(
        presetSequenceFlowPlacesA.length,
        1,
        `Expected task2 to have exactly one sequence-flow preset place, but found ${presetSequenceFlowPlacesA.length}`
      );

      const presetSequenceFlowPlacesB = getPreset(petriNet, task3).filter(
        (element) => element.id.startsWith("p_sf_")
      );

      assert.equal(
        presetSequenceFlowPlacesB.length,
        1,
        `Expected task3 to have exactly one sequence-flow preset place, but found ${presetSequenceFlowPlacesB.length}`
      );

      assert.equal(
        presetSequenceFlowPlacesA[0].id,
        presetSequenceFlowPlacesB[0].id,
        "Expected task2 and task3 to share the same sequence-flow preset place"
      );
    }
  );

  scenario(
    "ICPN-18P Exclusive gateways",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      const branchAX = requireGatewayBranchTransition(petriNet, ["a-x"]);
      const branchAY = requireGatewayBranchTransition(petriNet, ["a-y"]);

      requireBranchGuardReadArc(petriNet, branchAX, Role.A, Class.A, "a-x");
      requireBranchGuardReadArc(petriNet, branchAY, Role.A, Class.A, "a-y");

      const firstTask = requireTransition(petriNet, /task1/);
      const lastTask = requireTransition(petriNet, /task6/);

      expectControlFlowPath(petriNet, firstTask, branchAX);
      expectControlFlowPath(petriNet, firstTask, branchAY);
      expectControlFlowPath(petriNet, branchAX, lastTask);
      expectControlFlowPath(petriNet, branchAY, lastTask);
      expectNoControlFlowPath(petriNet, branchAX, branchAY);
    }
  );

  scenario(
    "ICPN-19P Affected participants",
    {
      choreography:
        Choreographies.c24ExclusiveGatewayMultipleAffectedParticipants,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      const branchAX = requireGatewayBranchTransition(petriNet, ["a-x"]);
      const branchAY = requireGatewayBranchTransition(petriNet, ["a-y"]);

      requireBranchGuardReadArc(petriNet, branchAX, Role.A, Class.A, "a-x");
      requireBranchGuardReadArc(petriNet, branchAX, Role.B, Class.A, "a-x");
      expectNoBranchGuardReadArc(petriNet, branchAX, Role.C, Class.A, "a-x");

      requireBranchGuardReadArc(petriNet, branchAY, Role.A, Class.A, "a-y");
      requireBranchGuardReadArc(petriNet, branchAY, Role.B, Class.A, "a-y");
      expectNoBranchGuardReadArc(petriNet, branchAY, Role.C, Class.A, "a-y");
    }
  );

  scenario(
    "ICPN-20P Affected participants include post-join initiator after empty branch",
    {
      choreography: Choreographies.c26ExclusiveGatewayNoTaskBranch,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      const branchAX = requireGatewayBranchTransition(petriNet, ["a-x"]);
      const branchAY = requireGatewayBranchTransition(petriNet, ["a-y"]);

      requireBranchGuardReadArc(petriNet, branchAX, Role.A, Class.A, "a-x");
      requireBranchGuardReadArc(petriNet, branchAX, Role.B, Class.A, "a-x");

      requireBranchGuardReadArc(petriNet, branchAY, Role.A, Class.A, "a-y");
      requireBranchGuardReadArc(petriNet, branchAY, Role.B, Class.A, "a-y");

      const postJoinTask = requireTransition(petriNet, /task5/);
      expectControlFlowPath(petriNet, branchAX, postJoinTask);
      expectControlFlowPath(petriNet, branchAY, postJoinTask);
    }
  );

  scenario(
    "ICPN-21P Parallel behavior",
    {
      choreography: Choreographies.c28ParallelGatewayCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      const task1 = requireTransition(petriNet, /task1/);
      const task2 = requireTransition(petriNet, /task2/);
      const task3 = requireTransition(petriNet, /task3/);
      const task4 = requireTransition(petriNet, /task4/);

      expectControlFlowPath(petriNet, task1, task2);
      expectControlFlowPath(petriNet, task1, task3);
      expectControlFlowPath(petriNet, task2, task4);
      expectControlFlowPath(petriNet, task3, task4);

      expectNoControlFlowPath(petriNet, task2, task3);
      expectNoControlFlowPath(petriNet, task3, task2);
    }
  );

  scenario(
    "ICPN-22P Event-based loop",
    {
      choreography: Choreographies.c22EventBasedGatewayNoClassLoop,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);

      // In this fixture, task3 is the task on the event-based loop branch.
      const loopTransition = requireTransition(petriNet, /task3/);
      expectControlFlowCycleThroughTransition(petriNet, loopTransition);
    }
  );

  scenario(
    "ICPN-23P Exclusive loop",
    {
      choreography: Choreographies.c27ExclusiveGatewayCommunicationOneClassLoop,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l09LocalTransitionSameRoleTwoStates,
    },
    async (fixtures) => {
      const { petriNet } = await runScenario(fixtures);
      // In this fixture, task5 is the task on the exclusive loop branch.
      const loopTransition = requireTransition(petriNet, /task5/);
      expectControlFlowCycleThroughTransition(petriNet, loopTransition);
    }
  );
});

async function runScenario(args: NamedFixtureTriple) {
  const { petriNet } = await buildIsolatedCaseSemantics(
    await contextFromFixtures(args)
  );
  expectWellFormedPetriNet(petriNet);
  await writeScenarioResult({
    subdirectory: "artifacts/01-isolatedCaseSemantics",
    resultDirectory: "petriNetGeneration",
    scenarioName: args.scenarioName,
    content: petriNet.toModdleDefinitions().serialize(),
    fileExtension: "obpt-pn",
  });
  return { petriNet };
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
