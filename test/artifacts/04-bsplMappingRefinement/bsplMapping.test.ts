import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBspl } from "../../../src/shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../../fixtures/fixtureIds.js";
import {
  contextFromFixtures,
  NamedFixtureTriple,
  type FixtureTriple,
} from "../../fixtures/contextFromFixtures.js";
import { allFixturesExist } from "../../fixtures/fixtureLoader.js";
import { writeScenarioResult } from "../../../src/shared/testing/resultWriter.js";
import { parseBspl } from "../../../src/shared/targets/bspl/parser.js";
import { serializeBspl } from "../../../src/shared/targets/bspl/serialization.js";
import {
  expectMessageDoesNotHaveParameter,
  expectWellFormedProtocol,
  expectRolesExactly,
  expectMessageParameterAbsent,
  requireMessage,
  requireMessageParameter,
  requireMessages,
  requirePrivateParameter,
} from "../../assertions/bsplAssertions.js";
import { Role } from "../../assertions/petriNetAssertions.js";

describe("BSPL Mapping Fixtures", () => {
  it("CBPM-00P serializes key annotations in message schemas", () => {
    const serialized = serializeBspl({
      name: "objectawarechoreographyprotocol",
      roles: [Role.A, Role.B],
      parameters: [
        { name: "case_id", adornment: "out", key: true },
        { name: "completed", adornment: "out" },
        { name: "task_task1", adornment: "out", private: true },
      ],
      messages: [
        {
          id: "task1",
          name: "task1",
          sender: Role.A,
          receiver: Role.B,
          taskId: "task1",
          parameters: [
            { name: "task_task1", adornment: "out" },
            { name: "case_id", adornment: "out" },
          ],
        },
        {
          id: "task2",
          name: "task2",
          sender: Role.A,
          receiver: Role.B,
          taskId: "task2",
          parameters: [
            { name: "completed", adornment: "out" },
            { name: "case_id", adornment: "in" },
          ],
        },
      ],
    });

    assert.match(serialized, /parameters out case_id key, out completed/);
    assert.match(serialized, /task1 \[out case_id key, out task_task1\]/);
    assert.match(serialized, /task2 \[in case_id key, out completed\]/);

    const parsed = parseBspl(serialized);
    const task1 = requireMessage(parsed, { name: "task1" });
    const task2 = requireMessage(parsed, { name: "task2" });

    assert.equal(
      requireMessageParameter(task1, { name: "case_id", adornment: "out" }).key,
      true,
    );
    assert.equal(
      requireMessageParameter(task2, { name: "case_id", adornment: "in" }).key,
      true,
    );
  });

  scenario(
    "CBPM-01P basic task without object reference",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      expectRolesExactly(protocol, [Role.A, Role.B]);

      const taskOccurrence = requirePrivateParameter(protocol, /^task_task1$/);

      const message = requireMessage(protocol, {
        name: "task1",
        parameters: [
          { adornment: "out", name: "case_id" },
          { adornment: "out", name: "completed" },
          { adornment: "out", name: taskOccurrence.name },
        ],
      });

      assert.strictEqual(
        message.sender,
        Role.A,
        "Expected sender to be RoleA for local task occurrence",
      );
      assert.strictEqual(
        message.receiver,
        Role.B,
        "Expected receiver to be RoleB for local task occurrence",
      );
    },
  );

  scenario(
    "CBPM-02P single object creation",
    {
      choreography: Choreographies.c04CommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );

      requireMessage(protocol, {
        parameters: [
          { adornment: "out", name: "case_id" },
          { adornment: "out", name: "completed" },
          { adornment: "out", name: identifier.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-03P multiple initial states compute common identifier",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );

      requireMessage(protocol, {
        name: "task2",
        parameters: [
          { adornment: "out", name: identifier.name },
          { adornment: "out", name: "attribute_classa_att1" },
        ],
      });
      requireMessage(protocol, {
        name: "task3",
        parameters: [
          { adornment: "out", name: identifier.name },
          { adornment: "out", name: "attribute_classa_att2" },
        ],
      });

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: "task2" },
        { adornment: "out", name: "attribute_classa_att2" },
      );
      expectMessageDoesNotHaveParameter(
        protocol,
        { name: "task3" },
        { adornment: "out", name: "attribute_classa_att1" },
      );
    },
  );

  scenario(
    "CBPM-04N no common identifier is rejected",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l03CreateMultipleStatesNoCommonAttribute,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        buildBspl(await contextFromFixtures(fixtures));
      }, /identifier|common/i);
    },
  );

  scenario(
    "CBPM-05P many-to-many creation has no cross-object dependency",
    {
      choreography: Choreographies.c07SequenceCommunicationTwoClasses,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const classAIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const classBIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classb_b-id",
      );

      const createClassA = requireMessage(protocol, {
        parameters: [{ adornment: "out", name: classAIdentifier.name }],
      });
      const createClassB = requireMessage(protocol, {
        parameters: [{ adornment: "out", name: classBIdentifier.name }],
      });

      assert.notStrictEqual(
        createClassA.id,
        createClassB.id,
        "Expected separate messages for class creations",
      );

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: createClassA.name },
        { adornment: "in", name: classBIdentifier.name },
      );
      expectMessageDoesNotHaveParameter(
        protocol,
        { name: createClassB.name },
        { adornment: "in", name: classAIdentifier.name },
      );
    },
  );

  scenario(
    "CBPM-06P many-to-one creation requires prerequisite identifier",
    {
      choreography: Choreographies.c07SequenceCommunicationTwoClasses,
      sharedDataModel: SharedDataModels.d03TwoClassesN1,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const classAIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const classBIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classb_b-id",
      );

      requireMessage(protocol, {
        name: "task2",
        parameters: [
          { adornment: "in", name: classAIdentifier.name },
          { adornment: "out", name: classBIdentifier.name },
        ],
      });

      requireMessage(protocol, {
        name: "task1",
        parameters: [{ adornment: "out", name: classAIdentifier.name }],
      });

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: "task1" },
        { adornment: "in", name: classBIdentifier.name },
      );
    },
  );

  scenario(
    "CBPM-07P one-to-one creation remains local consistency constraint",
    {
      choreography: Choreographies.c07SequenceCommunicationTwoClasses,
      sharedDataModel: SharedDataModels.d04TwoClasses11,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const classAIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const classBIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classb_b-id",
      );

      const createClassA = requireMessage(protocol, {
        name: "task1",
        parameters: [{ adornment: "out", name: classAIdentifier.name }],
      });
      const createClassB = requireMessage(protocol, {
        name: "task2",
        parameters: [{ adornment: "out", name: classBIdentifier.name }],
      });

      assert.notStrictEqual(
        createClassA.id,
        createClassB.id,
        "Expected separate BSPL messages for one-to-one object creations",
      );

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: createClassA.name },
        { adornment: "out", name: classBIdentifier.name },
      );
      expectMessageDoesNotHaveParameter(
        protocol,
        { name: createClassB.name },
        { adornment: "out", name: classAIdentifier.name },
      );
      expectMessageDoesNotHaveParameter(
        protocol,
        { name: createClassA.name },
        { adornment: "in", name: classBIdentifier.name },
      );
      expectMessageDoesNotHaveParameter(
        protocol,
        { name: createClassB.name },
        { adornment: "in", name: classAIdentifier.name },
      );
    },
  );

  scenario(
    "CBPM-08P mixed dependencies propagate prerequisite to one-to-one group",
    {
      choreography: Choreographies.c08SequenceCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d06ThreeClasses1NAndNM,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const classAIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const classBIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classb_b-id",
      );
      const classCIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classc_c-id",
      );

      requireMessage(protocol, {
        parameters: [{ adornment: "out", name: classCIdentifier.name }],
      });

      const createClassA = requireMessage(protocol, {
        parameters: [
          { adornment: "in", name: classCIdentifier.name },
          { adornment: "out", name: classAIdentifier.name },
        ],
      });
      const createClassB = requireMessage(protocol, {
        parameters: [
          { adornment: "in", name: classCIdentifier.name },
          { adornment: "out", name: classBIdentifier.name },
        ],
      });

      assert.notStrictEqual(
        createClassA.id,
        createClassB.id,
        "Expected separate BSPL messages for the one-to-one group members",
      );

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: createClassA.name },
        { adornment: "out", name: classBIdentifier.name },
      );
      expectMessageDoesNotHaveParameter(
        protocol,
        { name: createClassB.name },
        { adornment: "out", name: classAIdentifier.name },
      );
    },
  );

  scenario(
    "CBPM-09P local progression before communication becomes information production",
    {
      choreography: Choreographies.c06SequenceCommunicationOneClassThreeTasks,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l11LocalTransitionDifferentRolesThreeStates,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );

      const attribute1 = requirePrivateParameter(
        protocol,
        "attribute_classa_att1",
      );

      const attribute2 = requirePrivateParameter(
        protocol,
        "attribute_classa_att2",
      );

      requireMessage(protocol, {
        name: "task1",
        parameters: [{ adornment: "out", name: identifier.name }],
      });

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: "task1" },
        { adornment: "out", name: attribute1.name },
      );

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: "task1" },
        { adornment: "out", name: attribute2.name },
      );

      requireMessage(protocol, {
        name: "task2",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "out", name: attribute1.name },
        ],
      });

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: "task2" },
        { adornment: "out", name: attribute2.name },
      );

      requireMessage(protocol, {
        name: "task3",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "in", name: attribute1.name },
          { adornment: "out", name: attribute2.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-10P local decision excludes alternative paths",
    {
      choreography:
        Choreographies.c19EventBasedGatewayCommunicationOneClassFollowsCommunication,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l12LocalDecisionSameRole,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );

      const attribute1 = requirePrivateParameter(
        protocol,
        "attribute_classa_att1",
      );

      const attribute2 = requirePrivateParameter(
        protocol,
        "attribute_classa_att2",
      );

      requireMessage(protocol, {
        name: "task1",
        parameters: [{ adornment: "out", name: identifier.name }],
      });

      requireMessage(protocol, {
        name: "task2",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "out", name: attribute1.name },
          { adornment: "nil", name: attribute2.name },
        ],
      });

      requireMessage(protocol, {
        name: "task3",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "nil", name: attribute1.name },
          { adornment: "out", name: attribute2.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-11P synchronized transition produces target state indicator",
    {
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const targetIndicator = requirePrivateParameter(
        protocol,
        "state_classa_a-y",
      );

      requireMessage(protocol, {
        name: "sync-task",
        parameters: [{ adornment: "out", name: targetIndicator.name }],
      });
    },
  );

  scenario(
    "CBPM-12P multi-class synchronization produces all target indicators",
    {
      choreography: Choreographies.c11SequenceSynchronizationTwoClasses,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l17SynchronizedTransitionTwoClasses,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const classATargetIndicator = requirePrivateParameter(
        protocol,
        "state_classa_a-y",
      );
      const classBTargetIndicator = requirePrivateParameter(
        protocol,
        "state_classb_b-y",
      );

      requireMessage(protocol, {
        name: "sync-task",
        parameters: [
          { adornment: "out", name: classATargetIndicator.name },
          { adornment: "out", name: classBTargetIndicator.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-13P synchronized transition excludes competing states",
    {
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l19DecisionViaSynchronizedOrLocalTransition,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const targetIndicator = requirePrivateParameter(
        protocol,
        "state_classa_a-y",
      );

      const competingStateIndicator = requirePrivateParameter(
        protocol,
        "attribute_classa_att2",
      );

      requireMessage(protocol, {
        name: "sync-task",
        parameters: [
          { adornment: "out", name: targetIndicator.name },
          { adornment: "nil", name: competingStateIndicator.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-14P synchronized transition with multiple source states creates variants",
    {
      choreography:
        Choreographies.c18EventBasedGatewayCommunicationOneClassJoinSynchronization,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l18SynchronizedTransitionDifferentSourcesSameTarget,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const targetIndicator = requirePrivateParameter(
        protocol,
        "state_classa_a-z",
      );

      requireMessage(protocol, {
        name: "sync-task",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "in", name: "attribute_classa_att1" },
          { adornment: "out", name: targetIndicator.name },
        ],
      });
      requireMessage(protocol, {
        name: "sync-task",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "in", name: "attribute_classa_att2" },
          { adornment: "out", name: targetIndicator.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-15P combined task on same class communicates state and synchronizes target",
    {
      choreography: Choreographies.c14CombinedSameClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const targetIndicator = requirePrivateParameter(
        protocol,
        "state_classa_a-y",
      );

      requireMessage(protocol, {
        name: "sync-task",
        parameters: [
          { adornment: "out", name: identifier.name },
          { adornment: "out", name: targetIndicator.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-16P combined task across classes communicates one class and synchronizes another",
    {
      choreography: Choreographies.c15CombinedDifferentClasses,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l17SynchronizedTransitionTwoClasses,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const classAIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const classBIdentifier = requirePrivateParameter(
        protocol,
        "attribute_classb_b-id",
      );
      const classATargetIndicator = requirePrivateParameter(
        protocol,
        "state_classa_a-y",
      );
      const classBTargetIndicator = requirePrivateParameter(
        protocol,
        "state_classb_b-y",
      );

      requireMessage(protocol, {
        name: "sync-task",
        parameters: [
          { adornment: "in", name: classAIdentifier.name },
          { adornment: "out", name: classBIdentifier.name },
          { adornment: "out", name: classATargetIndicator.name },
          { adornment: "out", name: classBTargetIndicator.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-17P forwarding requires existing state and produces task occurrence",
    {
      choreography: Choreographies.c09SequenceCommunicationOneClassForwarding,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const taskOccurrence = requirePrivateParameter(protocol, /^task_task2$/);

      requireMessage(protocol, {
        name: "task1",
        parameters: [{ adornment: "out", name: identifier.name }],
      });

      requireMessage(protocol, {
        name: "task2",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "out", name: taskOccurrence.name },
        ],
      });

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: "task2" },
        { adornment: "out", name: identifier.name },
      );
    },
  );

  scenario(
    "CBPM-18P forwarding after sync requires state indicator",
    {
      choreography: Choreographies.c13SequenceForwardAfterSynchronization,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const stateIndicator = requirePrivateParameter(
        protocol,
        "state_classa_a-y",
      );
      const syncTaskOccurrence = requirePrivateParameter(
        protocol,
        "task_sync-task",
      );
      const forwardedTaskOccurrence = requirePrivateParameter(
        protocol,
        "task_task2",
      );

      requireMessage(protocol, {
        name: "task1",
        parameters: [{ adornment: "out", name: identifier.name }],
      });

      requireMessage(protocol, {
        name: "sync-task",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "out", name: stateIndicator.name },
          { adornment: "out", name: syncTaskOccurrence.name },
        ],
      });

      requireMessage(protocol, {
        name: "task2",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "in", name: stateIndicator.name },
          { adornment: "out", name: forwardedTaskOccurrence.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-19P state with attribute and indicator signatures creates alternative forwarding variants",
    {
      choreography:
        Choreographies.c21EventBasedGatewayCommunicationAndSynchronizationOptionOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l15LocalTransitionOrSynchronizedTransitionSameTarget,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const attributeSignature = requirePrivateParameter(
        protocol,
        "attribute_classa_att1",
      );
      const stateIndicator = requirePrivateParameter(
        protocol,
        "state_classa_a-y",
      );
      const taskOccurrence = requirePrivateParameter(protocol, "task_task3");

      const attributeForwarding = requireMessage(protocol, {
        name: "task3",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "in", name: attributeSignature.name },
          { adornment: "out", name: taskOccurrence.name },
        ],
      });
      const indicatorForwarding = requireMessage(protocol, {
        name: "task3",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "in", name: stateIndicator.name },
          { adornment: "out", name: taskOccurrence.name },
        ],
      });

      assert.notStrictEqual(
        attributeForwarding.id,
        indicatorForwarding.id,
        "Expected separate variants for attribute and state-indicator representations",
      );
      expectMessageParameterAbsent(attributeForwarding, {
        adornment: "in",
        name: stateIndicator.name,
      });
      expectMessageParameterAbsent(indicatorForwarding, {
        adornment: "in",
        name: attributeSignature.name,
      });
    },
  );

  scenario(
    "CBPM-20P producing and forwarding variants share task occurrence parameter",
    {
      choreography:
        Choreographies.c21EventBasedGatewayCommunicationAndSynchronizationOptionOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l15LocalTransitionOrSynchronizedTransitionSameTarget,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      const identifier = requirePrivateParameter(
        protocol,
        "attribute_classa_a-id",
      );
      const attributeSignature = requirePrivateParameter(
        protocol,
        "attribute_classa_att1",
      );
      const stateIndicator = requirePrivateParameter(
        protocol,
        "state_classa_a-y",
      );
      const taskOccurrence = requirePrivateParameter(protocol, "task_task3");

      const task3Variants = requireMessages(protocol, { name: "task3" });

      assert.equal(
        task3Variants.length,
        3,
        "Expected one producing variant and two forwarding variants for task3",
      );
      task3Variants.forEach((variant) => {
        requireMessageParameter(variant, {
          adornment: "out",
          name: taskOccurrence.name,
        });
      });

      requireMessage(protocol, {
        name: "task3",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "out", name: attributeSignature.name },
          { adornment: "out", name: taskOccurrence.name },
        ],
      });
      requireMessage(protocol, {
        name: "task3",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "in", name: attributeSignature.name },
          { adornment: "out", name: taskOccurrence.name },
        ],
      });
      requireMessage(protocol, {
        name: "task3",
        parameters: [
          { adornment: "in", name: identifier.name },
          { adornment: "in", name: stateIndicator.name },
          { adornment: "out", name: taskOccurrence.name },
        ],
      });
    },
  );

  scenario(
    "CBPM-21P completion after sequence",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: "task1" },
        { adornment: "out", name: "completed" },
      );

      requireMessage(protocol, {
        name: "task2",
        parameters: [{ adornment: "out", name: "completed" }],
      });
    },
  );

  scenario(
    "CBPM-22P completion after exclusive join",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const { protocol } = await runScenario(fixtures);

      expectMessageDoesNotHaveParameter(
        protocol,
        { name: "task1" },
        { adornment: "out", name: "completed" },
      );

      requireMessage(protocol, {
        name: "task2",
        parameters: [{ adornment: "out", name: "completed" }],
      });

      requireMessage(protocol, {
        name: "task3",
        parameters: [{ adornment: "out", name: "completed" }],
      });
    },
  );

  scenario(
    "CBPM-23N validation rejects one-to-one creation with inconsistent creator roles",
    {
      choreography: Choreographies.c07SequenceCommunicationTwoClasses,
      sharedDataModel: SharedDataModels.d04TwoClasses11,
      sharedLifecycle: SharedLifecycles.l06CreateTwoClassesDifferentRoles,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        buildBspl(await contextFromFixtures(fixtures));
      }, /one-to-one|creator|role/i);
    },
  );

  scenario(
    "CBPM-24N event-based control-flow loop is rejected",
    {
      choreography: Choreographies.c22EventBasedGatewayNoClassLoop,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        buildBspl(await contextFromFixtures(fixtures));
      }, /loop|cycle|acyclic|control[- ]?flow/i);
    },
  );

  scenario(
    "CBPM-25N exclusive control-flow loop is rejected",
    {
      choreography: Choreographies.c27ExclusiveGatewayCommunicationOneClassLoop,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l09LocalTransitionSameRoleTwoStates,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        buildBspl(await contextFromFixtures(fixtures));
      }, /loop|cycle|acyclic|control[- ]?flow/i);
    },
  );

  scenario(
    "CBPM-26N lifecycle loop is rejected",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l21LocalTransitionLoop,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        buildBspl(await contextFromFixtures(fixtures));
      }, /loop|cycle|acyclic|lifecycle/i);
    },
  );

  scenario(
    "CBPM-27N direct completion after parallel join is rejected",
    {
      choreography: Choreographies.c29ParallelGatewayJoinTermination,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        buildBspl(await contextFromFixtures(fixtures));
      }, /parallel|join|completion|unsupported/i);
    },
  );

  scenario(
    "CBPM-28N local transition without produced attribute signature is rejected",
    {
      choreography: Choreographies.c06SequenceCommunicationOneClassThreeTasks,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l23InvalidMissingAttributeSignature,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        buildBspl(await contextFromFixtures(fixtures));
      }, /attribute|signature|local transition|produce|bspl/i);
    },
  );
});

async function runScenario(args: NamedFixtureTriple) {
  const result = buildBspl(await contextFromFixtures(args));
  const text = serializeBspl(result.protocol);
  expectWellFormedProtocol(result.protocol);
  await writeScenarioResult({
    subdirectory: "artifacts/04-bsplMappingRefinement",
    resultDirectory: "bsplMapping",
    scenarioName: args.scenarioName,
    content: text,
    fileExtension: "bspl",
  });
  return result;
}

function scenario(
  name: string,
  fixtures: FixtureTriple,
  run: (fixtures: NamedFixtureTriple) => Promise<void>,
): void {
  if (!allFixturesExist(fixtures)) {
    throw new Error(`Missing fixtures for scenario "${name}"`);
  }
  it(name, () => run({ ...fixtures, scenarioName: name }));
}
