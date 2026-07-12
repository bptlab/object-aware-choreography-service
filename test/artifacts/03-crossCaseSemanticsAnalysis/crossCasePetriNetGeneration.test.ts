import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dispatchToolInvocation } from "../../../src/service.js";
import {
  buildPetriNet,
  buildPetriNetWithSemantics,
} from "../../../src/shared/mappings/objectAwareChoreographyToPetriNet/buildPetriNet.js";
import type {
  IsolatedPetriNetArtifact,
  PetriNetTransitionSemantics,
} from "../../../src/shared/mappings/objectAwareChoreographyToPetriNet/petriNetArtifact.js";
import {
  localLifecycleTransitionId,
  placeIdForSequenceFlow,
  statePlaceId,
  transitionIdForNode,
} from "../../../src/shared/targets/petriNet/ids.js";
import {
  buildCrossCasePetriNet,
  caseTypeId,
  computeCrossCaseTypedPetriNetLayout,
  controlFlowPlaceId,
  creationTransitionId,
  createCrossCasePetriNetMappingContext,
  awarenessPlaceId,
  endTransitionId,
  gatewayBranchTransitionId,
  inclusionPlaceId,
  localTransitionId,
  objectBindingPlaceId,
  parallelGatewayTransitionId,
  objectTypeId,
  participationPlaceId,
  poolPlaceId,
  relationPlaceId,
  roleTypeId,
  sinkPlaceId,
  startTransitionId,
  stateAwarenessPlaceId,
  taskAtomicTransitionId,
  taskBoundSendTransitionId,
  taskFirstBindingSendTransitionId,
  taskReceiveTransitionId,
  taskSendTransitionId,
  transmissionPlaceId,
  type CrossCasePetriNetOptions,
} from "../../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import type { CrossCasePetriNetMappingContext } from "../../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/mappingContext.js";
import { ToolIds } from "../../../src/shared/service/toolTypes.js";
import { writeScenarioResult } from "../../../src/shared/testing/resultWriter.js";
import {
  serializeTypedPetriNet,
  type TypedArc,
  type TypedPetriNet,
} from "../../../src/shared/targets/typedPetriNet/index.js";
import {
  expectWellFormedTypedPetriNet,
  getTypedDiagramEdgesByModelElement,
  getTypedDiagramShapesByModelElement,
  requireTypedIdentifierType,
  requireTypedPlace,
  requireTypedTransition,
  typedPlaceId,
  typedTransitionId,
} from "../../assertions/typedPetriNetAssertions.js";
import { loadItemPurchaseScenario } from "../../assertions/itemPurchaseScenarioHelpers.js";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../../fixtures/fixtureIds.js";
import {
  contextFromFixtures,
  serializedInputFromFixtures,
  type FixtureTriple,
} from "../../fixtures/contextFromFixtures.js";
import { allFixturesExist } from "../../fixtures/fixtureLoader.js";

type CrossCaseFixtureTriple = FixtureTriple & CrossCasePetriNetOptions;
type NamedCrossCaseFixtureTriple = CrossCaseFixtureTriple & {
  scenarioName: string;
};

const MAX_COMPACT_CENTER_DISTANCE = 140;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Cross-case Typed Petri-Net Generation Fixtures", () => {
  const itemPurchaseOptimisticScenarioDirectory = path.resolve(
    __dirname,
    "../../resources/scenarios/item_purchase_optimistic"
  );
  const itemPurchasePessimisticScenarioDirectory = path.resolve(
    __dirname,
    "../../resources/scenarios/item_purchase_pessimistic"
  );

  async function loadOptimisticItemPurchaseContext() {
    return loadItemPurchaseScenario({
      scenarioDirectory: itemPurchaseOptimisticScenarioDirectory,
      lifecycleFileName: "shared_object_lifecycles.obpt-sts",
    });
  }

  async function loadPessimisticItemPurchaseContext() {
    return loadItemPurchaseScenario({
      scenarioDirectory: itemPurchasePessimisticScenarioDirectory,
      lifecycleFileName: "shared_object_lifecycles.obpt-sts",
    });
  }

  scenario(
    "CCPN-01P structural typed places and identifier types",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d04TwoClasses11,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
      crossCaseClasses: ["ClassA", "ClassB"],
      participantIdsByRole: {
        RoleA: ["alice", "anna"],
        RoleB: ["bob"],
      },
    },
    async (fixtures) => {
      const { typedPetriNet, mappingContext } = await runScenario(fixtures);
      const serialized = serializeCrossCaseTypedPetriNet(
        typedPetriNet,
        mappingContext
      );
      const shapes = getTypedDiagramShapesByModelElement(serialized);
      const edges = getTypedDiagramEdgesByModelElement(serialized);

      assert.equal(
        shapes.size,
        typedPetriNet.places.length + typedPetriNet.transitions.length
      );
      for (const place of typedPetriNet.places) {
        assert.ok(
          shapes.has(place.id),
          `Expected diagram shape for ${place.id}`
        );
      }
      for (const transition of typedPetriNet.transitions) {
        assert.ok(
          shapes.has(transition.id),
          `Expected diagram shape for ${transition.id}`
        );
      }
      assert.equal(edges.size, typedPetriNet.arcs.length);
      for (const arc of typedPetriNet.arcs) {
        const edge = edges.get(arc.id);
        assert.ok(edge, `Expected diagram edge for ${arc.id}`);
        assert.ok(
          edge.waypoints.length >= 2,
          `Expected edge ${arc.id} waypoints`
        );
      }

      requireTypedIdentifierType(typedPetriNet, caseTypeId());
      requireTypedIdentifierType(typedPetriNet, roleTypeId("RoleA"));
      requireTypedIdentifierType(typedPetriNet, roleTypeId("RoleB"));
      requireTypedIdentifierType(typedPetriNet, objectTypeId("ClassA"));
      requireTypedIdentifierType(typedPetriNet, objectTypeId("ClassB"));

      const roleAPool = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(poolPlaceId("RoleA"))
      );
      assert.equal(roleAPool.name, "RoleA Pool");
      assert.deepEqual(roleAPool.tupleType, [roleTypeId("RoleA")]);
      assert.deepEqual(roleAPool.initialTokens, [
        [{ typeId: roleTypeId("RoleA"), value: "alice" }],
        [{ typeId: roleTypeId("RoleA"), value: "anna" }],
      ]);
      const roleBPool = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(poolPlaceId("RoleB"))
      );
      assert.deepEqual(roleBPool.initialTokens, [
        [{ typeId: roleTypeId("RoleB"), value: "bob" }],
      ]);

      const roleAParticipation = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(participationPlaceId("RoleA"))
      );
      assert.deepEqual(roleAParticipation.tupleType, [
        caseTypeId(),
        roleTypeId("RoleA"),
      ]);
      assert.equal(roleAParticipation.name, "RoleA Participants");
      assert.deepEqual(roleAParticipation.initialTokens, []);

      const controlFlowPlace = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1"))
      );
      assert.equal(controlFlowPlace.name, "Control Flow Flow_0yu7xi1");
      assert.deepEqual(controlFlowPlace.tupleType, [caseTypeId()]);

      const awarenessPlace = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(awarenessPlaceId("RoleA", "ClassA"))
      );
      assert.equal(awarenessPlace.name, "RoleA.ClassA+");
      assert.deepEqual(awarenessPlace.tupleType, [
        roleTypeId("RoleA"),
        objectTypeId("ClassA"),
      ]);
      const statePlace = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x"))
      );
      assert.equal(statePlace.name, "RoleA.ClassA [a-x]");
      assert.deepEqual(statePlace.tupleType, [
        roleTypeId("RoleA"),
        objectTypeId("ClassA"),
      ]);
      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "initial"))
        ),
        false
      );

      const objectBindingPlace = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(objectBindingPlaceId("ClassA"))
      );
      assert.equal(objectBindingPlace.name, "ClassA Case Correlation");
      assert.deepEqual(objectBindingPlace.tupleType, [
        caseTypeId(),
        objectTypeId("ClassA"),
      ]);
      assert.deepEqual(objectBindingPlace.initialTokens, []);
      const inclusionPlace = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(inclusionPlaceId("ClassA"))
      );
      assert.equal(inclusionPlace.name, "ClassA Case Inclusion");
      assert.deepEqual(inclusionPlace.tupleType, [caseTypeId()]);

      const relationPlace = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(relationPlaceId("Association_c0k9vr5qe334edccic4zgmgpv"))
      );
      assert.equal(relationPlace.name, "ClassA ClassB Association");
      assert.deepEqual(relationPlace.tupleType, [
        objectTypeId("ClassA"),
        objectTypeId("ClassB"),
      ]);
      assert.deepEqual(relationPlace.initialTokens, []);

      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(transmissionPlaceId("ChoreographyTask_1ntuvmx"))
        ),
        false,
        "Expected no-object choreography task not to create a typed transmission place"
      );
      assert.equal(
        requireTypedTransition(
          typedPetriNet,
          typedTransitionId(startTransitionId("Event_0ql5o4b"))
        ).name,
        "Start Case"
      );
      const sinkPlace = requireTypedPlace(
        typedPetriNet,
        typedPlaceId(sinkPlaceId())
      );
      assert.equal(sinkPlace.name, "sink");
      assert.deepEqual(sinkPlace.tupleType, [caseTypeId()]);

      const endTransitionIdValue = typedTransitionId(
        endTransitionId("Event_0tl9qx2")
      );
      assert.equal(
        requireTypedTransition(typedPetriNet, endTransitionIdValue).name,
        "End Case"
      );
      requireArcBetween(
        typedPetriNet,
        typedPlaceId(controlFlowPlaceId("Flow_11rqgkr")),
        endTransitionIdValue
      );
      requireArcBetween(typedPetriNet, endTransitionIdValue, sinkPlace.id);
      assert.deepEqual(
        typedPetriNet.arcs
          .filter((arc) => arc.targetId === sinkPlace.id)
          .map((arc) => arc.sourceId),
        [endTransitionIdValue],
        "Expected only lifted end-event transitions to write to the typed sink"
      );

      assert.deepEqual(
        typedPetriNet.places
          .filter((place) =>
            place.id.startsWith(typedPlaceId("state_RoleA_ClassA_"))
          )
          .map((place) => place.name),
        ["RoleA.ClassA [a-x]"]
      );
      assertNoRawDisplayLabels(typedPetriNet);

      const poolRoleA = requiredShape(
        shapes,
        typedPlaceId(poolPlaceId("RoleA"))
      );
      const partRoleA = requiredShape(
        shapes,
        typedPlaceId(participationPlaceId("RoleA"))
      );
      const awareRoleAClassA = requiredShape(
        shapes,
        typedPlaceId(awarenessPlaceId("RoleA", "ClassA"))
      );
      const stateRoleAClassAX = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x"))
      );
      const awareRoleAClassB = requiredShape(
        shapes,
        typedPlaceId(awarenessPlaceId("RoleA", "ClassB"))
      );
      const stateRoleAClassBX = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassB", "b-x"))
      );
      const poolRoleB = requiredShape(
        shapes,
        typedPlaceId(poolPlaceId("RoleB"))
      );
      const stateRoleBClassAX = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-x"))
      );
      const awareRoleBClassA = requiredShape(
        shapes,
        typedPlaceId(awarenessPlaceId("RoleB", "ClassA"))
      );
      const awareRoleBClassB = requiredShape(
        shapes,
        typedPlaceId(awarenessPlaceId("RoleB", "ClassB"))
      );
      const objClassA = requiredShape(
        shapes,
        typedPlaceId(objectBindingPlaceId("ClassA"))
      );
      const inclClassA = requiredShape(
        shapes,
        typedPlaceId(inclusionPlaceId("ClassA"))
      );
      const objClassB = requiredShape(
        shapes,
        typedPlaceId(objectBindingPlaceId("ClassB"))
      );
      const inclClassB = requiredShape(
        shapes,
        typedPlaceId(inclusionPlaceId("ClassB"))
      );
      const startTransition = requiredShape(
        shapes,
        typedTransitionId(startTransitionId("Event_0ql5o4b"))
      );
      const initialControlFlow = requiredShape(
        shapes,
        typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1"))
      );

      assert.equal(poolRoleA.x, partRoleA.x);
      assert.ok(poolRoleA.y < partRoleA.y);
      assert.ok(awareRoleAClassA.x > poolRoleA.x);
      assertApproxEqual(awareRoleAClassA.x, stateRoleAClassAX.x);
      assert.ok(stateRoleAClassAX.y > awareRoleAClassA.y);
      assert.ok(awareRoleAClassB.x > stateRightX(stateRoleAClassAX));
      assertApproxEqual(stateRoleAClassBX.y, stateRoleAClassAX.y);
      assertApproxEqual(awareRoleBClassA.x, awareRoleAClassA.x);
      assertApproxEqual(awareRoleBClassB.x, awareRoleAClassB.x);
      assertApproxEqual(awareRoleBClassA.x, stateRoleBClassAX.x);
      assert.ok(poolRoleB.y > poolRoleA.y);
      assertApproxEqual(objClassA.x, awareRoleAClassA.x);
      assertApproxEqual(objClassA.y, inclClassA.y);
      assert.ok(inclClassA.x > objClassA.x);
      assert.ok(
        horizontalCenterDistance(objClassA, inclClassA) <=
          MAX_COMPACT_CENTER_DISTANCE
      );
      assert.ok(objClassB.x > inclClassA.x);
      assertApproxEqual(objClassB.y, inclClassB.y);
      assert.ok(inclClassB.x > objClassB.x);
      assert.ok(
        horizontalCenterDistance(objClassB, inclClassB) <=
          MAX_COMPACT_CENTER_DISTANCE
      );
      assert.ok(
        horizontalGap(inclClassA, objClassB) >
          horizontalCenterDistance(objClassA, inclClassA)
      );
      assert.ok(
        horizontalGap(stateRoleAClassAX, stateRoleAClassBX) >
          horizontalCenterDistance(objClassA, inclClassA)
      );
      assert.ok(objClassA.y > poolRoleB.y);
      assert.ok(inclClassA.y > poolRoleB.y);
      assert.ok(startTransition.y > inclClassA.y);
      assert.ok(initialControlFlow.y > inclClassA.y);
    }
  );

  scenario(
    "CCPN-02P default participants and class classification",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
      crossCaseClasses: ["ClassB"],
    },
    async (fixtures) => {
      const { typedPetriNet, mappingContext } = await runScenario(fixtures);

      assert.deepEqual(
        requireTypedPlace(typedPetriNet, typedPlaceId(poolPlaceId("RoleA")))
          .initialTokens,
        [[{ typeId: roleTypeId("RoleA"), value: "RoleA_1" }]]
      );
      assert.deepEqual(mappingContext.metadata.classes, [
        { classId: "ClassA", isCrossCase: false },
        { classId: "ClassB", isCrossCase: true },
      ]);
      assert.equal(
        typedPetriNet.places.some((place) =>
          place.id.includes("Association_c0k9vr5qe334edccic4zgmgpv")
        ),
        false
      );
    }
  );

  scenario(
    "CCPN-03P no-object task is atomic and typed by case",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const transitionId = typedTransitionId(
        taskAtomicTransitionId("ChoreographyTask_1ntuvmx")
      );

      requireTypedTransition(typedPetriNet, transitionId);
      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(transmissionPlaceId("ChoreographyTask_1ntuvmx"))
        ),
        false
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1")),
          transitionId
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          transitionId,
          typedPlaceId(controlFlowPlaceId("Flow_11rqgkr"))
        ),
        [tuple(caseTypeId(), "case")]
      );
    }
  );

  scenario(
    "CCPN-04P control-flow backbone is typed by case",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const controlFlowPlaces = typedPetriNet.places.filter((place) =>
        place.id.startsWith(typedPlaceId("cf_"))
      );

      assert.ok(controlFlowPlaces.length > 0);
      for (const place of controlFlowPlaces) {
        assert.deepEqual(place.tupleType, [caseTypeId()]);

        for (const arc of typedPetriNet.arcs.filter(
          (candidate) =>
            candidate.sourceId === place.id || candidate.targetId === place.id
        )) {
          assert.deepEqual(
            arc.inscription.map((element) => ({
              typeId: element.typeId,
              variableId: element.variableId,
            })),
            [{ typeId: caseTypeId(), variableId: "case" }]
          );
        }
      }
    }
  );

  scenario(
    "CCPN-05P isolated artifact preserves Petri-net compatibility",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);
      const direct = buildPetriNet({
        choreography: context.choreography,
        dataModel: context.dataModel,
        lifecycleModel: context.lifecycleModel,
        objectReferences: context.objectReferences,
        taskNameIndex: context.taskNameIndex,
      });
      const rebuilt = buildPetriNetWithSemantics({
        choreography: context.choreography,
        dataModel: context.dataModel,
        lifecycleModel: context.lifecycleModel,
        objectReferences: context.objectReferences,
        taskNameIndex: context.taskNameIndex,
      });

      assert.deepEqual(
        sortedIds(direct.petriNet.getPlaces()),
        sortedIds(rebuilt.petriNet.getPlaces())
      );
      assert.deepEqual(
        sortedIds(direct.petriNet.getTransitions()),
        sortedIds(rebuilt.petriNet.getTransitions())
      );
      assert.deepEqual(
        sortedArcRefs(direct.petriNet.getArcs()),
        sortedArcRefs(rebuilt.petriNet.getArcs())
      );
    }
  );

  scenario(
    "CCPN-06P isolated artifact exposes semantic descriptors",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);
      const artifact = buildPetriNetWithSemantics({
        choreography: context.choreography,
        dataModel: context.dataModel,
        lifecycleModel: context.lifecycleModel,
        objectReferences: context.objectReferences,
        taskNameIndex: context.taskNameIndex,
      });
      const taskId = "ChoreographyTask_1ntuvmx";
      const task = context.choreography.flowElements?.find(
        (element) => element.id === taskId
      );

      assert.ok(task);
      assert.deepEqual(
        requireSemanticPlace(artifact, "controlFlow:Flow_0yu7xi1"),
        {
          kind: "controlFlowPlace",
          isolatedPlaceId: placeIdForSequenceFlow({
            id: "Flow_0yu7xi1",
          } as never),
          sequenceFlowId: "Flow_0yu7xi1",
          label: undefined,
        }
      );
      assert.deepEqual(
        requireSemanticTransition(artifact, `taskAtomic:${taskId}`),
        {
          kind: "atomicTaskTransition",
          isolatedTransitionId: transitionIdForNode(task),
          taskId,
          taskName: "task1",
          senderRoleId: "RoleA",
          receiverRoleId: "RoleB",
          incomingFlowIds: ["Flow_0yu7xi1"],
          outgoingFlowIds: ["Flow_11rqgkr"],
          stateReads: [],
          stateWrites: [],
          objectRef: undefined,
        }
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(
          artifact.semantics.places,
          `transmission:${taskId}`
        ),
        false
      );
      assert.deepEqual(
        requireSemanticTransition(artifact, "creation:RoleA:ClassA:a-x"),
        {
          kind: "objectCreationTransition",
          isolatedTransitionId: localLifecycleTransitionId(
            "RoleA",
            "ClassA",
            "initial",
            "a-x"
          ),
          roleId: "RoleA",
          classId: "ClassA",
          className: "ClassA",
          sourceStateId: "initial",
          targetStateId: "a-x",
          stateWrites: [
            {
              roleId: "RoleA",
              classId: "ClassA",
              stateId: "a-x",
              isVirtualInitial: false,
            },
          ],
          existenceWrites: [{ roleId: "RoleA", classId: "ClassA" }],
        }
      );
      assert.ok(
        Object.values(artifact.semantics.transitions).some(
          (transition) => transition.kind === "startEventTransition"
        )
      );
      assert.ok(
        Object.values(artifact.semantics.transitions).some(
          (transition) => transition.kind === "endEventTransition"
        )
      );
    }
  );

  scenario(
    "CCPN-07P isolated artifact exposes gateway descriptors",
    {
      choreography: Choreographies.c34MisalignedDecision,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);
      const artifact = buildPetriNetWithSemantics({
        choreography: context.choreography,
        dataModel: context.dataModel,
        lifecycleModel: context.lifecycleModel,
        objectReferences: context.objectReferences,
        taskNameIndex: context.taskNameIndex,
      });
      const guardedBranch = requireSemanticTransition(
        artifact,
        "gatewayBranch:Gateway_1fcecxd:Flow_1yuxkqv"
      );
      const unguardedJoin = requireSemanticTransition(
        artifact,
        "gatewayBranch:Gateway_0hoqfhg:Flow_04lfirh"
      );

      assert.equal(guardedBranch.kind, "gatewayBranchTransition");
      if (guardedBranch.kind !== "gatewayBranchTransition") {
        throw new Error("Expected guarded branch gateway descriptor");
      }
      assert.equal(guardedBranch.direction, "split");
      assert.deepEqual(guardedBranch.incomingFlowIds, ["Flow_0h536ur"]);
      assert.deepEqual(guardedBranch.outgoingFlowIds, ["Flow_1yuxkqv"]);
      assert.deepEqual(guardedBranch.guard, {
        classId: "ClassA",
        stateId: "a-x",
      });
      assert.deepEqual(guardedBranch.stateReads, [
        {
          roleId: "RoleA",
          classId: "ClassA",
          stateId: "a-x",
          isVirtualInitial: false,
        },
        {
          roleId: "RoleB",
          classId: "ClassA",
          stateId: "a-x",
          isVirtualInitial: false,
        },
      ]);
      assert.equal(unguardedJoin.kind, "gatewayBranchTransition");
      if (unguardedJoin.kind !== "gatewayBranchTransition") {
        throw new Error("Expected unguarded join gateway descriptor");
      }
      assert.equal(unguardedJoin.direction, "join");
      assert.deepEqual(unguardedJoin.incomingFlowIds, ["Flow_04lfirh"]);
      assert.deepEqual(unguardedJoin.outgoingFlowIds, ["Flow_1s585tc"]);
      assert.deepEqual(unguardedJoin.stateReads, []);
    }
  );

  scenario(
    "CCPN-08P isolated artifact exposes synchronized task effects",
    {
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);
      const artifact = buildPetriNetWithSemantics({
        choreography: context.choreography,
        dataModel: context.dataModel,
        lifecycleModel: context.lifecycleModel,
        objectReferences: context.objectReferences,
        taskNameIndex: context.taskNameIndex,
      });
      const send = requireSemanticTransition(
        artifact,
        "taskSend:ChoreographyTask_0vvrsfb"
      );
      const receive = requireSemanticTransition(
        artifact,
        "taskReceive:ChoreographyTask_0vvrsfb"
      );

      assert.equal(send.kind, "taskSendTransition");
      if (send.kind !== "taskSendTransition") {
        throw new Error("Expected synchronized send descriptor");
      }
      assert.equal(send.objectRef, undefined);
      assert.deepEqual(send.stateReads, [
        {
          roleId: "RoleA",
          classId: "ClassA",
          stateId: "a-x",
          isVirtualInitial: false,
        },
      ]);
      assert.deepEqual(send.stateWrites, [
        {
          roleId: "RoleA",
          classId: "ClassA",
          stateId: "a-y",
          isVirtualInitial: false,
        },
      ]);
      assert.equal(receive.kind, "taskReceiveTransition");
      if (receive.kind !== "taskReceiveTransition") {
        throw new Error("Expected synchronized receive descriptor");
      }
      assert.equal(receive.objectRef, undefined);
      assert.deepEqual(receive.stateReads, [
        {
          roleId: "RoleB",
          classId: "ClassA",
          stateId: "a-x",
          isVirtualInitial: false,
        },
      ]);
      assert.deepEqual(receive.stateWrites, [
        {
          roleId: "RoleB",
          classId: "ClassA",
          stateId: "a-y",
          isVirtualInitial: false,
        },
      ]);
    }
  );

  scenario(
    "CCPN-09P virtual initial state descriptors are omitted in cross-case net",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);
      const artifact = buildPetriNetWithSemantics({
        choreography: context.choreography,
        dataModel: context.dataModel,
        lifecycleModel: context.lifecycleModel,
        objectReferences: context.objectReferences,
        taskNameIndex: context.taskNameIndex,
      });
      const initialState = requireSemanticPlace(
        artifact,
        "state:RoleA:ClassA:initial"
      );
      const { typedPetriNet } = await runScenario(fixtures);

      assert.equal(initialState.kind, "stateAwarenessPlace");
      assert.equal(initialState.isVirtualInitial, true);
      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "initial"))
        ),
        false
      );
      assert.equal(
        typedPetriNet.places.some((place) =>
          place.id.includes(statePlaceId("RoleA", "ClassA", "initial"))
        ),
        false
      );
    }
  );

  scenario(
    "CCPN-10P no-object task uses an atomic typed transition",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const taskTransitionId = typedTransitionId(
        taskAtomicTransitionId("ChoreographyTask_1ntuvmx")
      );

      assert.equal(
        requireTypedTransition(typedPetriNet, taskTransitionId).name,
        "task1"
      );
      assert.equal(
        typedPetriNet.transitions.some((transition) =>
          transition.id.includes("Transition_send_ChoreographyTask_1ntuvmx")
        ),
        false,
        "Expected no-object choreography task not to create a send transition"
      );
      assert.equal(
        typedPetriNet.transitions.some((transition) =>
          transition.id.includes("Transition_receive_ChoreographyTask_1ntuvmx")
        ),
        false,
        "Expected no-object choreography task not to create a receive transition"
      );
      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(transmissionPlaceId("ChoreographyTask_1ntuvmx"))
        ),
        false,
        "Expected no-object choreography task not to create a transmission place"
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1")),
          taskTransitionId
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(participationPlaceId("RoleA")),
          taskTransitionId
        ),
        [tuple(caseTypeId(), "case"), tuple(roleTypeId("RoleA"), "role_RoleA")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(participationPlaceId("RoleB")),
          taskTransitionId
        ),
        [tuple(caseTypeId(), "case"), tuple(roleTypeId("RoleB"), "role_RoleB")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          taskTransitionId,
          typedPlaceId(controlFlowPlaceId("Flow_11rqgkr"))
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertNoArcTouches(typedPetriNet, taskTransitionId, [
        typedPlaceId(awarenessPlaceId("RoleA", "ClassA")),
        typedPlaceId(awarenessPlaceId("RoleB", "ClassA")),
        typedPlaceId(objectBindingPlaceId("ClassA")),
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
    }
  );

  scenario(
    "CCPN-11P layout shifts lifted control-flow below binding layer",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet, mappingContext } = await runScenario(fixtures);
      const serialized = serializeCrossCaseTypedPetriNet(
        typedPetriNet,
        mappingContext
      );
      const shapes = getTypedDiagramShapesByModelElement(serialized);
      const pool = requiredShape(shapes, typedPlaceId(poolPlaceId("RoleA")));
      const participation = requiredShape(
        shapes,
        typedPlaceId(participationPlaceId("RoleA"))
      );
      const awareness = requiredShape(
        shapes,
        typedPlaceId(awarenessPlaceId("RoleA", "ClassA"))
      );
      const state = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x"))
      );
      const binding = requiredShape(
        shapes,
        typedPlaceId(objectBindingPlaceId("ClassA"))
      );
      const controlFlowBeforeTask = requiredShape(
        shapes,
        typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1"))
      );
      const controlFlowAfterTask = requiredShape(
        shapes,
        typedPlaceId(controlFlowPlaceId("Flow_11rqgkr"))
      );

      assert.equal(pool.x, participation.x);
      assert.ok(awareness.x > pool.x);
      assert.ok(state.x > participation.x);
      assert.ok(binding.y > state.y);
      assert.ok(controlFlowBeforeTask.y > binding.y);
      assert.ok(controlFlowAfterTask.y > binding.y);
      assert.ok(
        controlFlowBeforeTask.x < controlFlowAfterTask.x,
        "Expected lifted control-flow x-order to follow isolated layout"
      );
    }
  );

  scenario(
    "CCPN-12P sequential no-object tasks preserve control-flow order",
    {
      choreography: Choreographies.c02SequenceNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const taskTransitions = typedPetriNet.transitions.filter((transition) =>
        transition.id.startsWith(typedTransitionId("task_"))
      );
      const transmissionPlaces = typedPetriNet.places.filter((place) =>
        place.id.startsWith(typedPlaceId("tx_"))
      );

      assert.ok(
        taskTransitions.length >= 2,
        "Expected at least two no-object atomic task transitions"
      );
      assert.equal(
        transmissionPlaces.length,
        0,
        "Expected no-object tasks not to create transmission places"
      );

      const producedControlFlow = new Set(
        typedPetriNet.arcs
          .filter((arc) =>
            taskTransitions.some((transition) => transition.id === arc.sourceId)
          )
          .filter((arc) => arc.targetId.startsWith(typedPlaceId("cf_")))
          .map((arc) => arc.targetId)
      );
      const consumedControlFlow = new Set(
        typedPetriNet.arcs
          .filter((arc) =>
            taskTransitions.some((transition) => transition.id === arc.targetId)
          )
          .filter((arc) => arc.sourceId.startsWith(typedPlaceId("cf_")))
          .map((arc) => arc.sourceId)
      );
      const intermediateControlFlowPlaces = [
        ...producedControlFlow,
      ].filter((placeId) => consumedControlFlow.has(placeId));

      assert.ok(
        intermediateControlFlowPlaces.length > 0,
        "Expected at least one control-flow place produced by one atomic task and consumed by a later atomic task"
      );
      for (const placeId of intermediateControlFlowPlaces) {
        assert.deepEqual(requireTypedPlace(typedPetriNet, placeId).tupleType, [
          caseTypeId(),
        ]);
      }
      for (const arc of typedPetriNet.arcs.filter(
        (candidate) =>
          candidate.sourceId.startsWith(typedPlaceId("cf_")) ||
          candidate.targetId.startsWith(typedPlaceId("cf_"))
      )) {
        assert.deepEqual(
          arc.inscription.map((element) => ({
            typeId: element.typeId,
            variableId: element.variableId,
          })),
          [{ typeId: caseTypeId(), variableId: "case" }]
        );
      }

      for (const transition of taskTransitions) {
        assertNoArcTouches(typedPetriNet, transition.id, [
          typedPlaceId(awarenessPlaceId("RoleA", "ClassA")),
          typedPlaceId(awarenessPlaceId("RoleB", "ClassA")),
          typedPlaceId(objectBindingPlaceId("ClassA")),
          typedPlaceId(inclusionPlaceId("ClassA")),
        ]);
      }
    }
  );

  scenario(
    "CCPN-13P every no-object choreography task is represented by one atomic transition",
    {
      choreography: Choreographies.c02SequenceNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const taskTransitions = typedPetriNet.transitions.filter((transition) =>
        transition.id.startsWith(typedTransitionId("task_"))
      );
      const transmissionPlaces = typedPetriNet.places.filter((place) =>
        place.id.startsWith(typedPlaceId("tx_"))
      );

      assert.ok(taskTransitions.length >= 2);
      assert.equal(transmissionPlaces.length, 0);
      assert.equal(new Set(taskTransitions.map((transition) => transition.id)).size, taskTransitions.length);

      for (const taskTransition of taskTransitions) {
        const incomingControlFlowArcs = typedPetriNet.arcs.filter(
          (arc) =>
            arc.targetId === taskTransition.id &&
            arc.sourceId.startsWith(typedPlaceId("cf_"))
        );
        const outgoingControlFlowArcs = typedPetriNet.arcs.filter(
          (arc) =>
            arc.sourceId === taskTransition.id &&
            arc.targetId.startsWith(typedPlaceId("cf_"))
        );
        assert.ok(incomingControlFlowArcs.length > 0);
        assert.ok(outgoingControlFlowArcs.length > 0);
      }
    }
  );

  scenario(
    "CCPN-14P case-specific object task transmission carries case and object",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const sendTransitionId = typedTransitionId(
        taskSendTransitionId("ChoreographyTask_1ntuvmx")
      );
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_1ntuvmx")
      );
      const transmissionId = typedPlaceId(
        transmissionPlaceId("ChoreographyTask_1ntuvmx")
      );

      assert.deepEqual(
        requireTypedPlace(typedPetriNet, transmissionId).tupleType,
        [caseTypeId(), objectTypeId("ClassA")]
      );
      assertArcInscription(
        requireArcBetween(typedPetriNet, sendTransitionId, transmissionId),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(typedPetriNet, transmissionId, receiveTransitionId),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
    }
  );

  scenario(
    "CCPN-15P sender reads binding and communicated local state",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const sendTransitionId = typedTransitionId(
        taskSendTransitionId("ChoreographyTask_1ntuvmx")
      );

      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(participationPlaceId("RoleA")),
          sendTransitionId
        ),
        [tuple(caseTypeId(), "case"), tuple(roleTypeId("RoleA"), "role_RoleA")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(objectBindingPlaceId("ClassA")),
          sendTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(awarenessPlaceId("RoleA", "ClassA")),
          sendTransitionId
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x")),
          sendTransitionId
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertNoArcTouches(typedPetriNet, sendTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
    }
  );

  scenario(
    "CCPN-16P receiver reads binding and produces outgoing control-flow",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_1ntuvmx")
      );

      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(participationPlaceId("RoleB")),
          receiveTransitionId
        ),
        [tuple(caseTypeId(), "case"), tuple(roleTypeId("RoleB"), "role_RoleB")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(objectBindingPlaceId("ClassA")),
          receiveTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          receiveTransitionId,
          typedPlaceId(controlFlowPlaceId("Flow_0wx5elb"))
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertNoArcTouches(typedPetriNet, receiveTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
    }
  );

  scenario(
    "CCPN-17P receiver non-awareness uses inhibitor instead of virtual state",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_1ntuvmx")
      );

      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "initial"))
        ),
        false
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(awarenessPlaceId("RoleB", "ClassA")),
          receiveTransitionId,
          "inhibitor"
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          receiveTransitionId,
          typedPlaceId(awarenessPlaceId("RoleB", "ClassA"))
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          receiveTransitionId,
          typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-x"))
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
    }
  );

  scenario(
    "CCPN-18P compatible receiver state variant reads existing state",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_0vvrsfb")
      );

      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x")),
          receiveTransitionId
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          receiveTransitionId,
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-y"))
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assert.equal(
        typedPetriNet.arcs.some(
          (arc) =>
            arc.kind === "inhibitor" &&
            arc.sourceId ===
              typedPlaceId(awarenessPlaceId("RoleA", "ClassA")) &&
            arc.targetId === receiveTransitionId
        ),
        false
      );
    }
  );

  scenario(
    "CCPN-19P pure synchronized task effects use bound case objects",
    {
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const sendTransitionId = typedTransitionId(
        taskSendTransitionId("ChoreographyTask_0vvrsfb")
      );
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_0vvrsfb")
      );

      assert.deepEqual(
        requireTypedTransition(typedPetriNet, sendTransitionId).freshVariables,
        []
      );
      assert.deepEqual(
        requireTypedTransition(typedPetriNet, receiveTransitionId)
          .freshVariables,
        []
      );
      assertSynchronizedStateEffect(typedPetriNet, {
        transitionId: sendTransitionId,
        roleId: "RoleA",
        classId: "ClassA",
        sourceStateId: "a-x",
        targetStateId: "a-y",
      });
      assertSynchronizedStateEffect(typedPetriNet, {
        transitionId: receiveTransitionId,
        roleId: "RoleB",
        classId: "ClassA",
        sourceStateId: "a-x",
        targetStateId: "a-y",
      });
      assertNoArcFromPlaceToTransition(
        typedPetriNet,
        typedPlaceId(participationPlaceId("RoleB")),
        sendTransitionId
      );
      assertNoArcFromPlaceToTransition(
        typedPetriNet,
        typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-x")),
        sendTransitionId
      );
      assertNoArcFromPlaceToTransition(
        typedPetriNet,
        typedPlaceId(participationPlaceId("RoleA")),
        receiveTransitionId
      );
      assertNoArcFromPlaceToTransition(
        typedPetriNet,
        typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x")),
        receiveTransitionId
      );
      assertReadOnlyBindingPlace(typedPetriNet, {
        transitionId: sendTransitionId,
        classId: "ClassA",
      });
      assertReadOnlyBindingPlace(typedPetriNet, {
        transitionId: receiveTransitionId,
        classId: "ClassA",
      });
      assertNoArcTouches(typedPetriNet, sendTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
      assertNoArcTouches(typedPetriNet, receiveTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "initial"))
        ),
        false
      );
      assertNoDuplicateEquivalentArcs(typedPetriNet, sendTransitionId);
      assertNoDuplicateEquivalentArcs(typedPetriNet, receiveTransitionId);
    }
  );

  scenario(
    "CCPN-20P combined task synchronizes an additional case-specific object",
    {
      choreography: Choreographies.c15CombinedDifferentClasses,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle:
        SharedLifecycles.l20SynchronizedTransitionOneOfTwoClasses,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const sendTransitionId = typedTransitionId(
        taskSendTransitionId("ChoreographyTask_0lk2fye")
      );
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_0lk2fye")
      );

      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(objectBindingPlaceId("ClassB")),
          sendTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassB"), "object_ClassB"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(objectBindingPlaceId("ClassA")),
          sendTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(objectBindingPlaceId("ClassA")),
          receiveTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          sendTransitionId,
          typedPlaceId(transmissionPlaceId("ChoreographyTask_0lk2fye"))
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassB"), "object_ClassB"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(transmissionPlaceId("ChoreographyTask_0lk2fye")),
          receiveTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassB"), "object_ClassB"),
        ]
      );
      assertSynchronizedStateEffect(typedPetriNet, {
        transitionId: sendTransitionId,
        roleId: "RoleA",
        classId: "ClassA",
        sourceStateId: "a-x",
        targetStateId: "a-y",
      });
      assertSynchronizedStateEffect(typedPetriNet, {
        transitionId: receiveTransitionId,
        roleId: "RoleB",
        classId: "ClassA",
        sourceStateId: "a-x",
        targetStateId: "a-y",
      });
      assertStateArcDoesNotUseObjectVariable(typedPetriNet, {
        transitionId: sendTransitionId,
        roleId: "RoleA",
        classId: "ClassA",
        stateId: "a-x",
        direction: "input",
        forbiddenVariableId: "object_ClassB",
      });
      assertStateArcDoesNotUseObjectVariable(typedPetriNet, {
        transitionId: sendTransitionId,
        roleId: "RoleA",
        classId: "ClassA",
        stateId: "a-y",
        direction: "output",
        forbiddenVariableId: "object_ClassB",
      });
      assertStateArcDoesNotUseObjectVariable(typedPetriNet, {
        transitionId: receiveTransitionId,
        roleId: "RoleB",
        classId: "ClassA",
        stateId: "a-x",
        direction: "input",
        forbiddenVariableId: "object_ClassB",
      });
      assertStateArcDoesNotUseObjectVariable(typedPetriNet, {
        transitionId: receiveTransitionId,
        roleId: "RoleB",
        classId: "ClassA",
        stateId: "a-y",
        direction: "output",
        forbiddenVariableId: "object_ClassB",
      });
      assertReadOnlyBindingPlace(typedPetriNet, {
        transitionId: sendTransitionId,
        classId: "ClassA",
      });
      assertReadOnlyBindingPlace(typedPetriNet, {
        transitionId: receiveTransitionId,
        classId: "ClassA",
      });
      assertReadOnlyBindingPlace(typedPetriNet, {
        transitionId: sendTransitionId,
        classId: "ClassB",
      });
      assertReadOnlyBindingPlace(typedPetriNet, {
        transitionId: receiveTransitionId,
        classId: "ClassB",
      });
      assertNoArcTouches(typedPetriNet, sendTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
        typedPlaceId(inclusionPlaceId("ClassB")),
      ]);
      assertNoArcTouches(typedPetriNet, receiveTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
        typedPlaceId(inclusionPlaceId("ClassB")),
      ]);
      assertNoDuplicateEquivalentArcs(typedPetriNet, sendTransitionId);
      assertNoDuplicateEquivalentArcs(typedPetriNet, receiveTransitionId);
    }
  );

  scenario(
    "CCPN-21P synchronized descriptors are covered by typed task transitions",
    {
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);
      const typedPetriNet = buildCrossCasePetriNet(
        context,
        crossCaseOptionsFromScenario(fixtures)
      );
      const artifact = buildPetriNetWithSemantics({
        choreography: context.choreography,
        dataModel: context.dataModel,
        lifecycleModel: context.lifecycleModel,
        objectReferences: context.objectReferences,
        taskNameIndex: context.taskNameIndex,
      });
      const crossCaseClassIds = new Set(fixtures.crossCaseClasses);

      expectWellFormedTypedPetriNet(typedPetriNet);

      for (const descriptor of Object.values(
        artifact.semantics.transitions
      ).filter(
        (transition) =>
          (transition.kind === "taskSendTransition" ||
            transition.kind === "taskReceiveTransition") &&
          (transition.stateReads.length > 0 ||
            transition.stateWrites.length > 0)
      )) {
        const transitionId = typedTransitionId(
          descriptor.kind === "taskSendTransition"
            ? taskSendTransitionId(descriptor.taskId, descriptor.variantId)
            : taskReceiveTransitionId(descriptor.taskId, descriptor.variantId)
        );

        requireTypedTransition(typedPetriNet, transitionId);

        for (const state of [
          ...descriptor.stateReads,
          ...descriptor.stateWrites,
        ].filter((candidate) => !crossCaseClassIds.has(candidate.classId))) {
          assertArcTouchesPlace(
            typedPetriNet,
            transitionId,
            typedPlaceId(objectBindingPlaceId(state.classId)),
            [
              tuple(caseTypeId(), "case"),
              tuple(objectTypeId(state.classId), `object_${state.classId}`),
            ]
          );

          if (!state.isVirtualInitial) {
            assertArcTouchesPlace(
              typedPetriNet,
              transitionId,
              typedPlaceId(
                stateAwarenessPlaceId(
                  state.roleId,
                  state.classId,
                  state.stateId
                )
              ),
              [
                tuple(roleTypeId(state.roleId), `role_${state.roleId}`),
                tuple(objectTypeId(state.classId), `object_${state.classId}`),
              ]
            );
          }
        }
      }
    }
  );

  scenario(
    "CCPN-22P cross-case synchronized state effects use bound shared objects",
    {
      choreography: Choreographies.c15CombinedDifferentClasses,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle:
        SharedLifecycles.l20SynchronizedTransitionOneOfTwoClasses,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const sendTransitionId = typedTransitionId(
        taskSendTransitionId("ChoreographyTask_0lk2fye")
      );
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_0lk2fye")
      );

      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(objectBindingPlaceId("ClassA")),
          sendTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(objectBindingPlaceId("ClassA")),
          receiveTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertSynchronizedStateEffect(typedPetriNet, {
        transitionId: sendTransitionId,
        roleId: "RoleA",
        classId: "ClassA",
        sourceStateId: "a-x",
        targetStateId: "a-y",
      });
      assertSynchronizedStateEffect(typedPetriNet, {
        transitionId: receiveTransitionId,
        roleId: "RoleB",
        classId: "ClassA",
        sourceStateId: "a-x",
        targetStateId: "a-y",
      });
      assertNoArcTouches(typedPetriNet, sendTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
      assertNoArcTouches(typedPetriNet, receiveTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
      assertNoDuplicateEquivalentArcs(typedPetriNet, sendTransitionId);
      assertNoDuplicateEquivalentArcs(typedPetriNet, receiveTransitionId);
    }
  );

  scenario(
    "CCPN-23P task send and receive descriptor variants are lifted",
    {
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l18SynchronizedTransitionDifferentSourcesSameTarget,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const artifact = await buildSemanticArtifact(fixtures);
      const syncTaskId = "ChoreographyTask_0vvrsfb";
      const sendDescriptors = taskDescriptors(artifact, "taskSendTransition", {
        taskId: syncTaskId,
      });
      const receiveDescriptors = taskDescriptors(
        artifact,
        "taskReceiveTransition",
        { taskId: syncTaskId }
      );

      assert.equal(sendDescriptors.length, 2);
      assert.equal(receiveDescriptors.length, 2);
      assert.deepEqual(
        sendDescriptors
          .map((descriptor) =>
            descriptor.stateReads.map((state) => state.stateId).join("+")
          )
          .sort(),
        ["a-x", "a-y"]
      );
      assert.deepEqual(
        receiveDescriptors
          .map((descriptor) =>
            descriptor.stateReads.map((state) => state.stateId).join("+")
          )
          .sort(),
        ["a-x", "a-y"]
      );

      for (const descriptor of sendDescriptors) {
        const transitionId = typedTransitionId(
          taskSendTransitionId(descriptor.taskId, descriptor.variantId)
        );

        requireTypedTransition(typedPetriNet, transitionId);
        assertDescriptorStateEffectsLifted(typedPetriNet, descriptor);
        assertArcInscription(
          requireArcBetween(
            typedPetriNet,
            transitionId,
            typedPlaceId(transmissionPlaceId(syncTaskId))
          ),
          [tuple(caseTypeId(), "case")]
        );
      }

      for (const descriptor of receiveDescriptors) {
        const transitionId = typedTransitionId(
          taskReceiveTransitionId(descriptor.taskId, descriptor.variantId)
        );

        requireTypedTransition(typedPetriNet, transitionId);
        assertDescriptorStateEffectsLifted(typedPetriNet, descriptor);
        assertArcInscription(
          requireArcBetween(
            typedPetriNet,
            typedPlaceId(transmissionPlaceId(syncTaskId)),
            transitionId
          ),
          [tuple(caseTypeId(), "case")]
        );
      }
    }
  );

  scenario(
    "CCPN-24P receiver-compatible descriptor variants are lifted",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const artifact = await buildSemanticArtifact(fixtures);
      const initialReceiveDescriptors = taskDescriptors(
        artifact,
        "taskReceiveTransition",
        { taskId: "ChoreographyTask_1ntuvmx" }
      );
      const concreteReceiveDescriptors = taskDescriptors(
        artifact,
        "taskReceiveTransition",
        { taskId: "ChoreographyTask_0vvrsfb" }
      );

      assert.equal(initialReceiveDescriptors.length, 1);
      assert.equal(concreteReceiveDescriptors.length, 1);
      assert.equal(
        initialReceiveDescriptors.some((descriptor) =>
          descriptor.stateReads.some((state) => state.isVirtualInitial)
        ),
        true
      );
      assert.equal(
        concreteReceiveDescriptors.some((descriptor) =>
          descriptor.stateReads.some((state) => state.stateId === "a-x")
        ),
        true
      );

      for (const descriptor of [
        ...initialReceiveDescriptors,
        ...concreteReceiveDescriptors,
      ]) {
        const transitionId = typedTransitionId(
          taskReceiveTransitionId(descriptor.taskId, descriptor.variantId)
        );

        requireTypedTransition(typedPetriNet, transitionId);
        assertDescriptorStateEffectsLifted(typedPetriNet, descriptor);
      }
    }
  );

  scenario(
    "CCPN-25P combined task receiver variants preserve virtual-initial compatibility",
    {
      choreography: Choreographies.c14CombinedSameClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l18SynchronizedTransitionDifferentSourcesSameTarget,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const artifact = await buildSemanticArtifact(fixtures);
      const taskId = "ChoreographyTask_0lk2fye";
      const receiveDescriptors = taskDescriptors(
        artifact,
        "taskReceiveTransition",
        { taskId }
      );

      assert.equal(receiveDescriptors.length, 2);
      assert.equal(
        receiveDescriptors.some((descriptor) =>
          descriptor.stateReads.some((state) => state.isVirtualInitial)
        ),
        true
      );

      for (const descriptor of receiveDescriptors) {
        const transitionId = typedTransitionId(
          taskReceiveTransitionId(descriptor.taskId, descriptor.variantId)
        );

        requireTypedTransition(typedPetriNet, transitionId);
        assertDescriptorStateEffectsLifted(typedPetriNet, descriptor);
      }
    }
  );

  scenario(
    "CCPN-26P cross-case object task has bound and first-binding send variants",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const taskId = "ChoreographyTask_1ntuvmx";
      const boundSendTransitionId = typedTransitionId(
        taskBoundSendTransitionId(taskId)
      );
      const firstBindingSendTransitionId = typedTransitionId(
        taskFirstBindingSendTransitionId(taskId)
      );
      const transmissionId = typedPlaceId(transmissionPlaceId(taskId));
      const expectedTransmissionInscription = [
        tuple(caseTypeId(), "case"),
        tuple(objectTypeId("ClassA"), "object_ClassA"),
      ];

      assert.deepEqual(
        requireTypedPlace(typedPetriNet, transmissionId).tupleType,
        [caseTypeId(), objectTypeId("ClassA")]
      );
      assert.deepEqual(
        requireTypedTransition(typedPetriNet, boundSendTransitionId)
          .freshVariables,
        []
      );
      assert.deepEqual(
        requireTypedTransition(typedPetriNet, firstBindingSendTransitionId)
          .freshVariables,
        []
      );
      assertArcInscription(
        requireArcBetween(typedPetriNet, boundSendTransitionId, transmissionId),
        expectedTransmissionInscription
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          firstBindingSendTransitionId,
          transmissionId
        ),
        expectedTransmissionInscription
      );
    }
  );

  scenario(
    "CCPN-27P already-bound cross-case send reads existing binding",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const sendTransitionId = typedTransitionId(
        taskBoundSendTransitionId("ChoreographyTask_1ntuvmx")
      );

      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1")),
          sendTransitionId
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(participationPlaceId("RoleA")),
          sendTransitionId
        ),
        [tuple(caseTypeId(), "case"), tuple(roleTypeId("RoleA"), "role_RoleA")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(awarenessPlaceId("RoleA", "ClassA")),
          sendTransitionId
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x")),
          sendTransitionId
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertReadOnlyBindingPlace(typedPetriNet, {
        transitionId: sendTransitionId,
        classId: "ClassA",
      });
      assertNoArcTouches(typedPetriNet, sendTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
    }
  );

  scenario(
    "CCPN-28P first-binding cross-case send establishes binding",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const sendTransitionId = typedTransitionId(
        taskFirstBindingSendTransitionId("ChoreographyTask_1ntuvmx")
      );

      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1")),
          sendTransitionId
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(participationPlaceId("RoleA")),
          sendTransitionId
        ),
        [tuple(caseTypeId(), "case"), tuple(roleTypeId("RoleA"), "role_RoleA")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(awarenessPlaceId("RoleA", "ClassA")),
          sendTransitionId
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x")),
          sendTransitionId
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertNoArcFromPlaceToTransition(
        typedPetriNet,
        typedPlaceId(objectBindingPlaceId("ClassA")),
        sendTransitionId
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(inclusionPlaceId("ClassA")),
          sendTransitionId,
          "inhibitor"
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          sendTransitionId,
          typedPlaceId(objectBindingPlaceId("ClassA"))
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          sendTransitionId,
          typedPlaceId(inclusionPlaceId("ClassA"))
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          sendTransitionId,
          typedPlaceId(transmissionPlaceId("ChoreographyTask_1ntuvmx"))
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
    }
  );

  scenario(
    "CCPN-29P cross-case receiver consumes transmission and reads binding",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_1ntuvmx")
      );

      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(transmissionPlaceId("ChoreographyTask_1ntuvmx")),
          receiveTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(participationPlaceId("RoleB")),
          receiveTransitionId
        ),
        [tuple(caseTypeId(), "case"), tuple(roleTypeId("RoleB"), "role_RoleB")]
      );
      assertReadOnlyBindingPlace(typedPetriNet, {
        transitionId: receiveTransitionId,
        classId: "ClassA",
      });
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          receiveTransitionId,
          typedPlaceId(controlFlowPlaceId("Flow_0wx5elb"))
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertNoArcTouches(typedPetriNet, receiveTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
    }
  );

  scenario(
    "CCPN-30P cross-case receiver non-awareness uses inhibitor",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_1ntuvmx")
      );

      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "initial"))
        ),
        false
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(awarenessPlaceId("RoleB", "ClassA")),
          receiveTransitionId,
          "inhibitor"
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          receiveTransitionId,
          typedPlaceId(awarenessPlaceId("RoleB", "ClassA"))
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          receiveTransitionId,
          typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-x"))
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
    }
  );

  scenario(
    "CCPN-31P cross-case compatible receiver state variant reads existing state",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const receiveTransitionId = typedTransitionId(
        taskReceiveTransitionId("ChoreographyTask_0vvrsfb")
      );

      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x")),
          receiveTransitionId
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          receiveTransitionId,
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-y"))
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assert.equal(
        typedPetriNet.arcs.some(
          (arc) =>
            arc.kind === "inhibitor" &&
            arc.sourceId ===
              typedPlaceId(awarenessPlaceId("RoleA", "ClassA")) &&
            arc.targetId === receiveTransitionId
        ),
        false
      );
    }
  );

  it("CCPN-32P case-specific creation depending on cross-case object reads prior binding", async () => {
    const { context } = await loadOptimisticItemPurchaseContext();
    const typedPetriNet = buildCrossCasePetriNet(context, {
      crossCaseClasses: ["Item"],
      participantIdsByRole: {
        Buyer: ["buyer1", "buyer2"],
        Seller: ["seller1"],
      },
    });
    expectWellFormedTypedPetriNet(typedPetriNet);

    const orderCreationTransitions = typedPetriNet.transitions.filter(
      (transition) =>
        /Order/i.test(`${transition.id} ${transition.name}`) &&
        /create/i.test(`${transition.id} ${transition.name}`)
    );

    assert.ok(
      orderCreationTransitions.length > 0,
      "Expected at least one Order creation transition"
    );
    assert.ok(
      orderCreationTransitions.some((transition) => {
        const transitionId = transition.id;
        const itemBindingRead = typedPetriNet.arcs.find(
          (arc) =>
            arc.kind === "ordinary" &&
            arc.sourceId === typedPlaceId(objectBindingPlaceId("Item")) &&
            arc.targetId === transitionId &&
            arc.inscription.length === 2 &&
            arc.inscription[0].typeId === caseTypeId() &&
            arc.inscription[0].variableId === "case" &&
            arc.inscription[1].typeId === objectTypeId("Item")
        );
        const itemVariableId = itemBindingRead?.inscription[1].variableId;

        return (
          itemVariableId !== undefined &&
          hasArcWithInscription(
            typedPetriNet,
            typedPlaceId(participationPlaceId("Buyer")),
            transitionId,
            [
              tuple(caseTypeId(), "case"),
              tuple(roleTypeId("Buyer"), "role_Buyer"),
            ]
          ) &&
          hasArcWithInscription(
            typedPetriNet,
            typedPlaceId(awarenessPlaceId("Buyer", "Item")),
            transitionId,
            [
              tuple(roleTypeId("Buyer"), "role_Buyer"),
              tuple(objectTypeId("Item"), itemVariableId),
            ]
          ) &&
          hasArcWithInscription(
            typedPetriNet,
            transitionId,
            typedPlaceId(objectBindingPlaceId("Order")),
            [
              tuple(caseTypeId(), "case"),
              tuple(objectTypeId("Order"), "object_Order", true),
            ]
          ) &&
          hasArcWithInscription(
            typedPetriNet,
            transitionId,
            typedPlaceId(inclusionPlaceId("Order")),
            [tuple(caseTypeId(), "case")]
          ) &&
          hasArcWithInscription(
            typedPetriNet,
            typedPlaceId(inclusionPlaceId("Order")),
            transitionId,
            [tuple(caseTypeId(), "case")],
            "inhibitor"
          )
        );
      }),
      "Expected Order creation to read Buyer participation, Item binding and Buyer awareness, then create Order binding/inclusion with an inclusion inhibitor"
    );
  });

  it("CCPN-33P first binding enforces association consistency for related cross-case objects", async () => {
    const { context } = await loadPessimisticItemPurchaseContext();
    const typedPetriNet = buildCrossCasePetriNet(context, {
      crossCaseClasses: ["Item", "Reservation"],
      participantIdsByRole: {
        Buyer: ["buyer1", "buyer2"],
        Seller: ["seller1"],
      },
    });
    expectWellFormedTypedPetriNet(typedPetriNet);

    const itemBindingPlaceId = typedPlaceId(objectBindingPlaceId("Item"));
    const itemInclusionPlaceId = typedPlaceId(inclusionPlaceId("Item"));
    const reservationBindingPlaceId = typedPlaceId(
      objectBindingPlaceId("Reservation")
    );
    const reservationInclusionPlaceId = typedPlaceId(
      inclusionPlaceId("Reservation")
    );
    const itemFirstBindingTransitions = typedPetriNet.transitions.filter(
      (transition) =>
        /Item/i.test(`${transition.id} ${transition.name}`) &&
        /bind/i.test(`${transition.id} ${transition.name}`) &&
        hasArcWithInscription(
          typedPetriNet,
          transition.id,
          itemBindingPlaceId,
          [
            tuple(caseTypeId(), "case"),
            tuple(objectTypeId("Item"), "object_Item"),
          ]
        )
    );
    const relationPlace = typedPetriNet.places.find(
      (place) =>
        place.tupleType.includes(objectTypeId("Reservation")) &&
        place.tupleType.includes(objectTypeId("Item"))
    );

    assert.ok(
      itemFirstBindingTransitions.length > 0,
      "Expected at least one Item first-binding transition"
    );
    assert.ok(relationPlace, "Expected a Reservation-Item relation place");
    assert.ok(
      itemFirstBindingTransitions.some((transition) =>
        hasArcWithInscription(
          typedPetriNet,
          itemInclusionPlaceId,
          transition.id,
          [tuple(caseTypeId(), "case")],
          "inhibitor"
        )
      ),
      "Expected at least one Item first-binding transition to inhibit Item inclusion"
    );
    assert.ok(
      itemFirstBindingTransitions.some((transition) =>
        hasArcWithInscription(
          typedPetriNet,
          transition.id,
          itemBindingPlaceId,
          [
            tuple(caseTypeId(), "case"),
            tuple(objectTypeId("Item"), "object_Item"),
          ]
        )
      ),
      "Expected at least one Item first-binding transition to produce Item binding"
    );
    assert.ok(
      itemFirstBindingTransitions.some((transition) =>
        hasArcWithInscription(
          typedPetriNet,
          transition.id,
          itemInclusionPlaceId,
          [tuple(caseTypeId(), "case")]
        )
      ),
      "Expected at least one Item first-binding transition to produce Item inclusion"
    );
    assert.ok(
      itemFirstBindingTransitions.some(
        (transition) =>
          hasArcWithInscription(
            typedPetriNet,
            reservationInclusionPlaceId,
            transition.id,
            [tuple(caseTypeId(), "case")]
          ) &&
          hasArcWithInscription(
            typedPetriNet,
            reservationBindingPlaceId,
            transition.id,
            [
              tuple(caseTypeId(), "case"),
              tuple(objectTypeId("Reservation"), "object_Reservation"),
            ]
          ) &&
          hasRelationReadForReservationAndItem(
            typedPetriNet,
            relationPlace.id,
            transition.id
          )
      ),
      "Expected at least one Item first-binding association-consistency variant to read Reservation inclusion, Reservation binding, and the Reservation-Item relation"
    );
    assert.ok(
      itemFirstBindingTransitions.some((transition) =>
        hasArcWithInscription(
          typedPetriNet,
          reservationInclusionPlaceId,
          transition.id,
          [tuple(caseTypeId(), "case")],
          "inhibitor"
        )
      ),
      "Expected at least one Item first-binding lazy variant to inhibit Reservation inclusion"
    );
  });

  scenario(
    "CCPN-34P guarded exclusive gateway branches are lifted over case-specific objects",
    {
      choreography: Choreographies.c34MisalignedDecision,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const branchTransitionId = typedTransitionId(
        gatewayBranchTransitionId("Gateway_1fcecxd", "Flow_1yuxkqv")
      );
      const branchTransition = requireTypedTransition(
        typedPetriNet,
        branchTransitionId
      );

      assert.deepEqual(branchTransition.freshVariables, []);
      assertGatewayPreservesCaseVariable(typedPetriNet, branchTransitionId);
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(controlFlowPlaceId("Flow_0h536ur")),
          branchTransitionId
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          branchTransitionId,
          typedPlaceId(controlFlowPlaceId("Flow_1yuxkqv"))
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(objectBindingPlaceId("ClassA")),
          branchTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          branchTransitionId,
          typedPlaceId(objectBindingPlaceId("ClassA"))
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );

      for (const roleId of ["RoleA", "RoleB"]) {
        assertArcInscription(
          requireArcBetween(
            typedPetriNet,
            typedPlaceId(participationPlaceId(roleId)),
            branchTransitionId
          ),
          [
            tuple(caseTypeId(), "case"),
            tuple(roleTypeId(roleId), `role_${roleId}`),
          ]
        );
        assertArcInscription(
          requireArcBetween(
            typedPetriNet,
            branchTransitionId,
            typedPlaceId(participationPlaceId(roleId))
          ),
          [
            tuple(caseTypeId(), "case"),
            tuple(roleTypeId(roleId), `role_${roleId}`),
          ]
        );
        assertArcInscription(
          requireArcBetween(
            typedPetriNet,
            typedPlaceId(stateAwarenessPlaceId(roleId, "ClassA", "a-x")),
            branchTransitionId
          ),
          [
            tuple(roleTypeId(roleId), `role_${roleId}`),
            tuple(objectTypeId("ClassA"), "object_ClassA"),
          ]
        );
        assertArcInscription(
          requireArcBetween(
            typedPetriNet,
            branchTransitionId,
            typedPlaceId(stateAwarenessPlaceId(roleId, "ClassA", "a-x"))
          ),
          [
            tuple(roleTypeId(roleId), `role_${roleId}`),
            tuple(objectTypeId("ClassA"), "object_ClassA"),
          ]
        );
      }

      assertNoArcTouches(typedPetriNet, branchTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "initial"))
        ),
        false
      );
    }
  );

  scenario(
    "CCPN-35P unguarded gateway transitions are lifted with case arcs",
    {
      choreography: Choreographies.c34MisalignedDecision,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const joinTransitionId = typedTransitionId(
        gatewayBranchTransitionId("Gateway_0hoqfhg", "Flow_04lfirh")
      );
      const joinTransition = requireTypedTransition(
        typedPetriNet,
        joinTransitionId
      );

      assert.deepEqual(joinTransition.freshVariables, []);
      assertGatewayPreservesCaseVariable(typedPetriNet, joinTransitionId);
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(controlFlowPlaceId("Flow_04lfirh")),
          joinTransitionId
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          joinTransitionId,
          typedPlaceId(controlFlowPlaceId("Flow_1s585tc"))
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertNoArcTouches(typedPetriNet, joinTransitionId, [
        typedPlaceId(objectBindingPlaceId("ClassA")),
        typedPlaceId(inclusionPlaceId("ClassA")),
        typedPlaceId(participationPlaceId("RoleA")),
        typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x")),
      ]);
    }
  );

  scenario(
    "CCPN-36P parallel gateway transitions are lifted with case arcs",
    {
      choreography: Choreographies.c28ParallelGatewayCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const transitionId = typedTransitionId(
        parallelGatewayTransitionId("Gateway_10n552e")
      );
      const transition = requireTypedTransition(typedPetriNet, transitionId);

      assert.deepEqual(transition.freshVariables, []);
      assertGatewayPreservesCaseVariable(typedPetriNet, transitionId);
      const parallelTransitions = typedPetriNet.transitions.filter(
        (candidate) =>
          candidate.id.startsWith(typedTransitionId("parallel_"))
      );
      const parallelJoinTransitions = parallelTransitions.filter(
        (candidate) =>
          controlFlowInputArcs(typedPetriNet, candidate.id).length > 1
      );

      assert.ok(
        parallelTransitions.length >= 2,
        "Expected parallel split and join transitions"
      );
      assert.ok(
        parallelJoinTransitions.length >= 1,
        "Expected at least one parallel join with multiple control-flow inputs"
      );
      for (const parallelTransition of parallelTransitions) {
        assertGatewayPreservesCaseVariable(
          typedPetriNet,
          parallelTransition.id
        );
      }
    }
  );

  scenario(
    "CCPN-37P event-based gateway successor descriptors use pre-gateway flow",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);
      const artifact = buildPetriNetWithSemantics({
        choreography: context.choreography,
        dataModel: context.dataModel,
        lifecycleModel: context.lifecycleModel,
        objectReferences: context.objectReferences,
        taskNameIndex: context.taskNameIndex,
      });

      assert.equal(
        Object.values(artifact.semantics.transitions).some(
          (transition) => transition.kind === "eventBasedGatewayTransition"
        ),
        false
      );
      assert.equal(
        artifact.semantics.places["controlFlow:Flow_11ezvm1"],
        undefined
      );
      assert.equal(
        artifact.semantics.places["controlFlow:Flow_1mngx1a"],
        undefined
      );

      const typedPetriNet = buildCrossCasePetriNet(context, {
        crossCaseClasses: [],
      });

      assert.equal(
        typedPetriNet.transitions.some((transition) =>
          /^Transition_event_/.test(transition.id)
        ),
        false
      );

      for (const taskId of [
        "ChoreographyTask_1ntuvmx",
        "ChoreographyTask_18vbtgq",
      ]) {
        const sendTransition = requireSemanticTransition(
          artifact,
          `taskSend:${taskId}`
        );

        assert.equal(sendTransition.kind, "taskSendTransition");
        if (sendTransition.kind !== "taskSendTransition") {
          throw new Error("Expected task send descriptor");
        }
        assert.deepEqual(sendTransition.incomingFlowIds, ["Flow_0v6yqir"]);
      }
    }
  );

  scenario(
    "CCPN-38P event-based successor sends read pre-gateway control-flow place",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);

      assertNoTypedPlace(
        typedPetriNet,
        typedPlaceId(controlFlowPlaceId("Flow_11ezvm1"))
      );
      assertNoTypedPlace(
        typedPetriNet,
        typedPlaceId(controlFlowPlaceId("Flow_1mngx1a"))
      );
      assertNoTransitionWithIdPart(typedPetriNet, "event_Gateway_10n552e");

      for (const taskId of [
        "ChoreographyTask_1ntuvmx",
        "ChoreographyTask_18vbtgq",
      ]) {
        const transitionId = typedTransitionId(taskSendTransitionId(taskId));

        requireTypedTransition(typedPetriNet, transitionId);
        assertArcInscription(
          requireArcBetween(
            typedPetriNet,
            typedPlaceId(controlFlowPlaceId("Flow_0v6yqir")),
            transitionId
          ),
          [tuple(caseTypeId(), "case", false)]
        );
      }
    }
  );

  scenario(
    "CCPN-39P event-based gateway lift has no branch routing transitions",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);

      assertNoTransitionWithIdPart(typedPetriNet, "event_Gateway_10n552e");
      assert.equal(
        typedPetriNet.arcs.some(
          (arc) =>
            arc.sourceId.includes("Flow_11ezvm1") ||
            arc.targetId.includes("Flow_11ezvm1") ||
            arc.sourceId.includes("Flow_1mngx1a") ||
            arc.targetId.includes("Flow_1mngx1a")
        ),
        false
      );
    }
  );

  scenario(
    "CCPN-40P cross-case guarded gateway branches read existing binding",
    {
      choreography: Choreographies.c34MisalignedDecision,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const typedPetriNet = buildCrossCasePetriNet(
        await contextFromFixtures(fixtures),
        crossCaseOptionsFromScenario(fixtures)
      );
      const branchTransitionId = typedTransitionId(
        gatewayBranchTransitionId("Gateway_1fcecxd", "Flow_1yuxkqv")
      );

      requireTypedTransition(typedPetriNet, branchTransitionId);
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(objectBindingPlaceId("ClassA")),
          branchTransitionId
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          branchTransitionId,
          typedPlaceId(objectBindingPlaceId("ClassA"))
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertNoArcTouches(typedPetriNet, branchTransitionId, [
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
    }
  );

  scenario(
    "CCPN-41P serializes to visible typed PN XML",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
      crossCaseClasses: ["ClassA", "ClassB"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const serialized = serializeCrossCaseTypedPetriNet(
        typedPetriNet,
        await mappingContextFromScenario(fixtures)
      );

      assert.match(serialized, /<tpn:definitions /);
      assert.match(serialized, /<tpn:dataClass id="DataClass_Case" /);
      assert.match(
        serialized,
        /<tpn:place id="Place_pool_RoleA" name="RoleA Pool" /
      );
      assert.match(serialized, /name="RoleA\.ClassA\+"/);
      assert.match(serialized, /name="ClassA Case Correlation"/);
      assert.match(serialized, /<tpnDi:diagramShape /);
      assert.match(serialized, /<tpnDi:diagramEdge /);
      assert.match(serialized, /isGenerated="true"/);
    }
  );

  scenario(
    "CCPN-42P tool returns typed PN content",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
      crossCaseClasses: ["ClassA", "ClassB"],
    },
    async (fixtures) => {
      const input = await serializedInputFromFixtures(fixtures);
      const result = await dispatchToolInvocation({
        toolId: ToolIds.GenerateCrossCasePetriNet,
        input: {
          ...input,
          crossCaseClasses: fixtures.crossCaseClasses,
          participantIdsByRole: fixtures.participantIdsByRole,
        },
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "generatedModel");
      assert.equal(output.format, "obpt-typed-pn");
      assert.match(output.content, /<tpn:definitions /);
      assert.match(output.content, /name="RoleA Pool"/);
    }
  );

  scenario(
    "CCPN-43P real states in one class group are horizontal",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l11LocalTransitionDifferentRolesThreeStates,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet, mappingContext } = await runScenario(fixtures);
      const serialized = serializeCrossCaseTypedPetriNet(
        typedPetriNet,
        mappingContext
      );
      const shapes = getTypedDiagramShapesByModelElement(serialized);

      const awareRoleAClassA = requiredShape(
        shapes,
        typedPlaceId(awarenessPlaceId("RoleA", "ClassA"))
      );
      const stateRoleAClassAX = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x"))
      );
      const stateRoleAClassAY = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-y"))
      );
      const stateRoleAClassAZ = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-z"))
      );
      const awareRoleBClassA = requiredShape(
        shapes,
        typedPlaceId(awarenessPlaceId("RoleB", "ClassA"))
      );
      const stateRoleBClassAX = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-x"))
      );
      const stateRoleBClassAY = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-y"))
      );
      const stateRoleBClassAZ = requiredShape(
        shapes,
        typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-z"))
      );

      assertApproxEqual(awareRoleAClassA.x, stateRoleAClassAX.x);
      assertApproxEqual(stateRoleAClassAX.y, stateRoleAClassAY.y);
      assertApproxEqual(stateRoleAClassAY.y, stateRoleAClassAZ.y);
      assert.ok(stateRoleAClassAY.x > stateRoleAClassAX.x);
      assert.ok(stateRoleAClassAZ.x > stateRoleAClassAY.x);
      assert.ok(
        horizontalCenterDistance(stateRoleAClassAX, stateRoleAClassAY) <=
          MAX_COMPACT_CENTER_DISTANCE
      );
      assert.ok(
        horizontalCenterDistance(stateRoleAClassAY, stateRoleAClassAZ) <=
          MAX_COMPACT_CENTER_DISTANCE
      );
      assertApproxEqual(awareRoleBClassA.x, awareRoleAClassA.x);
      assertApproxEqual(awareRoleBClassA.x, stateRoleBClassAX.x);
      assertApproxEqual(stateRoleBClassAX.y, stateRoleBClassAY.y);
      assertApproxEqual(stateRoleBClassAY.y, stateRoleBClassAZ.y);
      assert.ok(stateRoleBClassAY.x > stateRoleBClassAX.x);
      assert.ok(stateRoleBClassAZ.x > stateRoleBClassAY.x);
      assert.ok(
        horizontalCenterDistance(stateRoleBClassAX, stateRoleBClassAY) <=
          MAX_COMPACT_CENTER_DISTANCE
      );
      assert.ok(
        horizontalCenterDistance(stateRoleBClassAY, stateRoleBClassAZ) <=
          MAX_COMPACT_CENTER_DISTANCE
      );
      assert.equal(
        typedPetriNet.places.some(
          (place) =>
            place.id ===
            typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "initial"))
        ),
        false
      );
    }
  );

  scenario(
    "CCPN-44P real local transition is lifted over role and object",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l11LocalTransitionDifferentRolesThreeStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const transitionId = typedTransitionId(
        localTransitionId("RoleB", "ClassA", "a-x", "a-y")
      );
      const transition = requireTypedTransition(typedPetriNet, transitionId);

      assert.equal(transition.name, "RoleB.ClassA a-x -> a-y");
      assert.deepEqual(transition.freshVariables, []);
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-x")),
          transitionId
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          transitionId,
          typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-y"))
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertNoArcTouches(typedPetriNet, transitionId, [
        typedPlaceId(controlFlowPlaceId("Flow_0yu7xi1")),
        typedPlaceId(transmissionPlaceId("ChoreographyTask_1ntuvmx")),
        typedPlaceId(objectBindingPlaceId("ClassA")),
        typedPlaceId(inclusionPlaceId("ClassA")),
        typedPlaceId(participationPlaceId("RoleB")),
        typedPlaceId(poolPlaceId("RoleB")),
      ]);
    }
  );

  scenario(
    "CCPN-45P virtual-initial local transition is not lifted",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l11LocalTransitionDifferentRolesThreeStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const transitionId = typedTransitionId(
        localTransitionId("RoleA", "ClassA", "initial", "a-x")
      );
      const virtualInitialPlaceId = typedPlaceId(
        stateAwarenessPlaceId("RoleA", "ClassA", "initial")
      );

      assert.equal(
        typedPetriNet.transitions.some(
          (transition) => transition.id === transitionId
        ),
        false,
        `Expected no typed transition ${transitionId}`
      );
      assertNoTypedPlace(typedPetriNet, virtualInitialPlaceId);
      assert.equal(
        typedPetriNet.arcs.some(
          (arc) =>
            arc.sourceId === virtualInitialPlaceId ||
            arc.targetId === virtualInitialPlaceId ||
            arc.sourceId === transitionId ||
            arc.targetId === transitionId
        ),
        false,
        "Expected no typed arc to reference the omitted virtual-initial transition or place"
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedTransitionId(creationTransitionId("RoleA", "ClassA", "a-x")),
          typedPlaceId(awarenessPlaceId("RoleA", "ClassA"))
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA", true),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedTransitionId(creationTransitionId("RoleA", "ClassA", "a-x")),
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x"))
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA", true),
        ]
      );
    }
  );

  scenario(
    "CCPN-46P local transition lifting does not introduce case variables",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l11LocalTransitionDifferentRolesThreeStates,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const localTransitions = typedPetriNet.transitions.filter((transition) =>
        transition.id.startsWith(typedTransitionId("local_"))
      );

      assert.ok(localTransitions.length > 0);
      for (const transition of localTransitions) {
        assert.deepEqual(transition.freshVariables, []);
        assertNoArcTouches(typedPetriNet, transition.id, [
          typedPlaceId(objectBindingPlaceId("ClassA")),
          typedPlaceId(inclusionPlaceId("ClassA")),
        ]);

        for (const arc of typedPetriNet.arcs.filter(
          (candidate) =>
            candidate.sourceId === transition.id ||
            candidate.targetId === transition.id
        )) {
          assert.equal(
            arc.inscription.some((element) => element.variableId === "case"),
            false
          );
        }
      }
    }
  );

  scenario(
    "CCPN-47P cross-case class local transition remains local",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l11LocalTransitionDifferentRolesThreeStates,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const transitionId = typedTransitionId(
        localTransitionId("RoleB", "ClassA", "a-x", "a-y")
      );

      requireTypedTransition(typedPetriNet, transitionId);
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-x")),
          transitionId
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          transitionId,
          typedPlaceId(stateAwarenessPlaceId("RoleB", "ClassA", "a-y"))
        ),
        [
          tuple(roleTypeId("RoleB"), "role_RoleB"),
          tuple(objectTypeId("ClassA"), "object_ClassA"),
        ]
      );
      assertNoArcTouches(typedPetriNet, transitionId, [
        typedPlaceId(objectBindingPlaceId("ClassA")),
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
    }
  );

  scenario(
    "CCPN-48P case-specific creation binds object to case",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const transitionId = typedTransitionId(
        creationTransitionId("RoleA", "ClassA", "a-x")
      );
      const transition = requireTypedTransition(typedPetriNet, transitionId);

      assert.equal(transition.name, "Create ClassA");
      assert.deepEqual(transition.freshVariables, [
        { variableId: "object_ClassA", typeId: objectTypeId("ClassA") },
      ]);
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(participationPlaceId("RoleA")),
          transitionId
        ),
        [tuple(caseTypeId(), "case"), tuple(roleTypeId("RoleA"), "role_RoleA")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          transitionId,
          typedPlaceId(awarenessPlaceId("RoleA", "ClassA"))
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA", true),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          transitionId,
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x"))
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA", true),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          transitionId,
          typedPlaceId(objectBindingPlaceId("ClassA"))
        ),
        [
          tuple(caseTypeId(), "case"),
          tuple(objectTypeId("ClassA"), "object_ClassA", true),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          transitionId,
          typedPlaceId(inclusionPlaceId("ClassA"))
        ),
        [tuple(caseTypeId(), "case")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(inclusionPlaceId("ClassA")),
          transitionId,
          "inhibitor"
        ),
        [tuple(caseTypeId(), "case")]
      );
    }
  );

  scenario(
    "CCPN-49P cross-case creation is independent of case",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
      crossCaseClasses: ["ClassA"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);
      const transitionId = typedTransitionId(
        creationTransitionId("RoleA", "ClassA", "a-x")
      );
      const transition = requireTypedTransition(typedPetriNet, transitionId);

      assert.equal(transition.name, "Create ClassA");
      assert.deepEqual(transition.freshVariables, [
        { variableId: "object_ClassA", typeId: objectTypeId("ClassA") },
      ]);
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(poolPlaceId("RoleA")),
          transitionId
        ),
        [tuple(roleTypeId("RoleA"), "role_RoleA")]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          transitionId,
          typedPlaceId(awarenessPlaceId("RoleA", "ClassA"))
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA", true),
        ]
      );
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          transitionId,
          typedPlaceId(stateAwarenessPlaceId("RoleA", "ClassA", "a-x"))
        ),
        [
          tuple(roleTypeId("RoleA"), "role_RoleA"),
          tuple(objectTypeId("ClassA"), "object_ClassA", true),
        ]
      );
      assertNoArcTouches(typedPetriNet, transitionId, [
        typedPlaceId(participationPlaceId("RoleA")),
        typedPlaceId(objectBindingPlaceId("ClassA")),
        typedPlaceId(inclusionPlaceId("ClassA")),
      ]);
      assert.equal(
        typedPetriNet.arcs
          .filter(
            (arc) =>
              arc.sourceId === transitionId || arc.targetId === transitionId
          )
          .some((arc) =>
            arc.inscription.some((element) => element.variableId === "case")
          ),
        false
      );
    }
  );

  scenario(
    "CCPN-50P case-specific creation invariants hold for every case-specific class",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
      crossCaseClasses: [],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);

      assertCaseSpecificCreationInvariant(typedPetriNet, {
        roleId: "RoleA",
        classId: "ClassA",
        initialStateId: "a-x",
      });
      assertCaseSpecificCreationInvariant(typedPetriNet, {
        roleId: "RoleA",
        classId: "ClassB",
        initialStateId: "b-x",
      });
    }
  );

  scenario(
    "CCPN-51P cross-case creation invariants hold for every cross-case class",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
      crossCaseClasses: ["ClassA", "ClassB"],
    },
    async (fixtures) => {
      const { typedPetriNet } = await runScenario(fixtures);

      assertCrossCaseCreationInvariant(typedPetriNet, {
        roleId: "RoleA",
        classId: "ClassA",
        initialStateId: "a-x",
      });
      assertCrossCaseCreationInvariant(typedPetriNet, {
        roleId: "RoleA",
        classId: "ClassB",
        initialStateId: "b-x",
      });
    }
  );

  scenario(
    "CCPN-52N reject cross-case class depending on case-specific class",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d03TwoClassesN1,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
      crossCaseClasses: ["ClassB"],
    },
    async (fixtures) => {
      await assert.rejects(
        async () =>
          buildCrossCasePetriNet(
            await contextFromFixtures(fixtures),
            crossCaseOptionsFromScenario(fixtures)
          ),
        /Unsupported cross-case creation dependency|cross-case.*case-specific/i
      );
    }
  );

  scenario(
    "CCPN-53N reject unsupported mixed one-to-one dependency",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d04TwoClasses11,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
      crossCaseClasses: ["ClassB"],
    },
    async (fixtures) => {
      await assert.rejects(
        async () =>
          buildCrossCasePetriNet(
            await contextFromFixtures(fixtures),
            crossCaseOptionsFromScenario(fixtures)
          ),
        /Unsupported mixed one-to-one creation dependency/
      );
    }
  );
});

async function runScenario(args: NamedCrossCaseFixtureTriple): Promise<{
  typedPetriNet: TypedPetriNet;
  mappingContext: CrossCasePetriNetMappingContext;
}> {
  const context = await contextFromFixtures(args);
  const options = crossCaseOptionsFromScenario(args);
  const typedPetriNet = buildCrossCasePetriNet(context, options);
  const mappingContext = createCrossCasePetriNetMappingContext(
    context,
    options
  );

  expectWellFormedTypedPetriNet(typedPetriNet);
  await writeScenarioResult({
    subdirectory: "artifacts/03-crossCaseSemanticsAnalysis",
    resultDirectory: "crossCasePetriNetGeneration",
    scenarioName: args.scenarioName,
    content: serializeCrossCaseTypedPetriNet(typedPetriNet, mappingContext),
    fileExtension: "obpt-typed-pn",
  });

  return { typedPetriNet, mappingContext };
}

function scenario(
  name: string,
  fixtures: CrossCaseFixtureTriple,
  run: (fixtures: NamedCrossCaseFixtureTriple) => Promise<void>
): void {
  if (!allFixturesExist(fixtures)) {
    throw new Error(`Missing fixtures for scenario "${name}"`);
  }

  it(name, () => run({ ...fixtures, scenarioName: name }));
}

function crossCaseOptionsFromScenario(
  args: CrossCaseFixtureTriple
): CrossCasePetriNetOptions {
  return {
    crossCaseClasses: args.crossCaseClasses,
    participantIdsByRole: args.participantIdsByRole,
  };
}

async function mappingContextFromScenario(
  args: CrossCaseFixtureTriple
): Promise<CrossCasePetriNetMappingContext> {
  return createCrossCasePetriNetMappingContext(
    await contextFromFixtures(args),
    crossCaseOptionsFromScenario(args)
  );
}

function serializeCrossCaseTypedPetriNet(
  typedPetriNet: TypedPetriNet,
  mappingContext: CrossCasePetriNetMappingContext
): string {
  return serializeTypedPetriNet(typedPetriNet, {
    layout: computeCrossCaseTypedPetriNetLayout({
      net: typedPetriNet,
      context: mappingContext,
    }),
  });
}

function requiredShape(
  shapes: ReturnType<typeof getTypedDiagramShapesByModelElement>,
  modelElementId: string
) {
  const shape = shapes.get(modelElementId);

  assert.ok(shape, `Expected diagram shape for ${modelElementId}`);
  return shape.bounds;
}

function stateRightX(shape: { x: number; width: number }): number {
  return shape.x + shape.width;
}

function horizontalCenterDistance(
  left: { x: number; width: number },
  right: { x: number; width: number }
): number {
  return Math.abs(shapeCenterX(right) - shapeCenterX(left));
}

function horizontalGap(
  left: { x: number; width: number },
  right: { x: number }
): number {
  return right.x - stateRightX(left);
}

function shapeCenterX(shape: { x: number; width: number }): number {
  return shape.x + shape.width / 2;
}

function requireSemanticPlace(artifact: IsolatedPetriNetArtifact, id: string) {
  const place = artifact.semantics.places[id];

  assert.ok(place, `Expected semantic place ${id}`);
  return place;
}

function requireSemanticTransition(
  artifact: IsolatedPetriNetArtifact,
  id: string
) {
  const transition = artifact.semantics.transitions[id];

  assert.ok(transition, `Expected semantic transition ${id}`);
  return transition;
}

async function buildSemanticArtifact(
  fixtures: FixtureTriple
): Promise<IsolatedPetriNetArtifact> {
  const context = await contextFromFixtures(fixtures);

  return buildPetriNetWithSemantics({
    choreography: context.choreography,
    dataModel: context.dataModel,
    lifecycleModel: context.lifecycleModel,
    objectReferences: context.objectReferences,
    taskNameIndex: context.taskNameIndex,
  });
}

function taskDescriptors<
  Kind extends "taskSendTransition" | "taskReceiveTransition"
>(
  artifact: IsolatedPetriNetArtifact,
  kind: Kind,
  args: { taskId: string }
): Array<Extract<PetriNetTransitionSemantics, { kind: Kind }>> {
  return Object.values(artifact.semantics.transitions)
    .filter(
      (
        transition
      ): transition is Extract<PetriNetTransitionSemantics, { kind: Kind }> =>
        transition.kind === kind && transition.taskId === args.taskId
    )
    .sort((left, right) =>
      (left.variantId ?? "").localeCompare(right.variantId ?? "")
    );
}

function assertDescriptorStateEffectsLifted(
  typedPetriNet: TypedPetriNet,
  descriptor: Extract<
    PetriNetTransitionSemantics,
    { kind: "taskSendTransition" | "taskReceiveTransition" }
  >
): void {
  const transitionId = typedTransitionId(
    descriptor.kind === "taskSendTransition"
      ? taskSendTransitionId(descriptor.taskId, descriptor.variantId)
      : taskReceiveTransitionId(descriptor.taskId, descriptor.variantId)
  );
  const states = [...descriptor.stateReads, ...descriptor.stateWrites];
  const classIds = [...new Set(states.map((state) => state.classId))];

  for (const classId of classIds) {
    assertArcTouchesPlace(
      typedPetriNet,
      transitionId,
      typedPlaceId(objectBindingPlaceId(classId)),
      [
        tuple(caseTypeId(), "case"),
        tuple(objectTypeId(classId), `object_${classId}`),
      ]
    );
  }

  for (const state of descriptor.stateReads) {
    if (state.isVirtualInitial) {
      assertArcInscription(
        requireArcBetween(
          typedPetriNet,
          typedPlaceId(awarenessPlaceId(state.roleId, state.classId)),
          transitionId,
          "inhibitor"
        ),
        [
          tuple(roleTypeId(state.roleId), `role_${state.roleId}`),
          tuple(objectTypeId(state.classId), `object_${state.classId}`),
        ]
      );
      assertNoArcTouches(typedPetriNet, transitionId, [
        typedPlaceId(
          stateAwarenessPlaceId(state.roleId, state.classId, state.stateId)
        ),
      ]);
      continue;
    }

    assertArcTouchesPlace(
      typedPetriNet,
      transitionId,
      typedPlaceId(
        stateAwarenessPlaceId(state.roleId, state.classId, state.stateId)
      ),
      [
        tuple(roleTypeId(state.roleId), `role_${state.roleId}`),
        tuple(objectTypeId(state.classId), `object_${state.classId}`),
      ]
    );
  }

  for (const state of descriptor.stateWrites.filter(
    (candidate) => !candidate.isVirtualInitial
  )) {
    assertArcTouchesPlace(
      typedPetriNet,
      transitionId,
      typedPlaceId(
        stateAwarenessPlaceId(state.roleId, state.classId, state.stateId)
      ),
      [
        tuple(roleTypeId(state.roleId), `role_${state.roleId}`),
        tuple(objectTypeId(state.classId), `object_${state.classId}`),
      ]
    );
  }
}

function assertNoTypedPlace(
  typedPetriNet: TypedPetriNet,
  placeId: string
): void {
  assert.equal(
    typedPetriNet.places.some((place) => place.id === placeId),
    false,
    `Expected no typed place ${placeId}`
  );
}

function assertNoTransitionWithIdPart(
  typedPetriNet: TypedPetriNet,
  idPart: string
): void {
  assert.equal(
    typedPetriNet.transitions.some((transition) =>
      transition.id.includes(idPart)
    ),
    false,
    `Expected no typed transition whose id includes ${idPart}`
  );
}

function sortedIds(elements: Array<{ id: string }>): string[] {
  return elements.map((element) => element.id).sort();
}

function sortedArcRefs(
  arcs: Array<{ sourceId: string; targetId: string }>
): string[] {
  return arcs.map((arc) => `${arc.sourceId}->${arc.targetId}`).sort();
}

function requireArcBetween(
  typedPetriNet: TypedPetriNet,
  sourceId: string,
  targetId: string,
  kind: "ordinary" | "inhibitor" = "ordinary"
): TypedArc {
  const arc = typedPetriNet.arcs.find(
    (candidate) =>
      candidate.sourceId === sourceId &&
      candidate.targetId === targetId &&
      candidate.kind === kind
  );

  assert.ok(arc, `Expected ${kind} arc from ${sourceId} to ${targetId}`);
  return arc;
}

function hasArcWithInscription(
  net: TypedPetriNet,
  sourceId: string,
  targetId: string,
  expectedInscription: ReturnType<typeof tuple>[],
  kind: TypedArc["kind"] = "ordinary"
): boolean {
  return net.arcs.some(
    (arc) =>
      arc.sourceId === sourceId &&
      arc.targetId === targetId &&
      arc.kind === kind &&
      arc.inscription.length === expectedInscription.length &&
      arc.inscription.every(
        (element, index) =>
          element.typeId === expectedInscription[index].typeId &&
          element.variableId === expectedInscription[index].variableId &&
          Boolean(element.isGenerated) ===
            Boolean(expectedInscription[index].isGenerated)
      )
  );
}

function assertGatewayPreservesCaseVariable(
  net: TypedPetriNet,
  transitionId: string
): void {
  const transition = requireTypedTransition(net, transitionId);

  assert.equal(
    transition.freshVariables.some(
      (variable) =>
        variable.typeId === caseTypeId() || variable.id === "case"
    ),
    false,
    `Expected gateway transition ${transitionId} not to declare a fresh case variable`
  );

  const controlFlowArcs = [
    ...controlFlowInputArcs(net, transitionId),
    ...controlFlowOutputArcs(net, transitionId),
  ];

  assert.ok(
    controlFlowArcs.length > 0,
    `Expected gateway transition ${transitionId} to have control-flow arcs`
  );

  for (const arc of controlFlowArcs) {
    assertArcInscription(arc, [tuple(caseTypeId(), "case")]);
  }
}

function controlFlowInputArcs(
  net: TypedPetriNet,
  transitionId: string
): TypedArc[] {
  return net.arcs.filter(
    (arc) =>
      arc.kind === "ordinary" &&
      arc.targetId === transitionId &&
      arc.sourceId.startsWith(typedPlaceId("cf_"))
  );
}

function controlFlowOutputArcs(
  net: TypedPetriNet,
  transitionId: string
): TypedArc[] {
  return net.arcs.filter(
    (arc) =>
      arc.kind === "ordinary" &&
      arc.sourceId === transitionId &&
      arc.targetId.startsWith(typedPlaceId("cf_"))
  );
}

function hasRelationReadForReservationAndItem(
  net: TypedPetriNet,
  relationPlaceId: string,
  transitionId: string
): boolean {
  return net.arcs.some(
    (arc) =>
      arc.sourceId === relationPlaceId &&
      arc.targetId === transitionId &&
      arc.kind === "ordinary" &&
      arc.inscription.length === 2 &&
      arc.inscription.some(
        (element) =>
          element.typeId === objectTypeId("Reservation") &&
          element.variableId === "object_Reservation"
      ) &&
      arc.inscription.some(
        (element) =>
          element.typeId === objectTypeId("Item") &&
          element.variableId === "object_Item"
      )
  );
}

function assertNoArcTouches(
  typedPetriNet: TypedPetriNet,
  transitionId: string,
  placeIds: string[]
): void {
  for (const placeId of placeIds) {
    assert.equal(
      typedPetriNet.arcs.some(
        (arc) =>
          (arc.sourceId === transitionId && arc.targetId === placeId) ||
          (arc.sourceId === placeId && arc.targetId === transitionId)
      ),
      false,
      `Expected no arc between ${transitionId} and ${placeId}`
    );
  }
}

function assertNoArcFromPlaceToTransition(
  typedPetriNet: TypedPetriNet,
  placeId: string,
  transitionId: string
): void {
  assert.equal(
    typedPetriNet.arcs.some(
      (arc) =>
        arc.kind === "ordinary" &&
        arc.sourceId === placeId &&
        arc.targetId === transitionId
    ),
    false,
    `Expected no ordinary arc from ${placeId} to ${transitionId}`
  );
}

function assertOnlyControlFlowPlacesTouched(
  typedPetriNet: TypedPetriNet,
  transitionId: string
): void {
  const placesById = new Map(
    typedPetriNet.places.map((place) => [place.id, place])
  );
  const arcs = typedPetriNet.arcs.filter(
    (arc) => arc.sourceId === transitionId || arc.targetId === transitionId
  );

  assert.ok(arcs.length > 0, `Expected arcs touching ${transitionId}`);
  for (const arc of arcs) {
    const placeId = arc.sourceId === transitionId ? arc.targetId : arc.sourceId;
    const place = placesById.get(placeId);

    assert.ok(place, `Expected ${placeId} to be a typed place`);
    assert.ok(
      place.id.startsWith(typedPlaceId("cf_")),
      `Expected ${transitionId} to touch only control-flow places, found ${place.id}`
    );
    assertArcInscription(arc, [tuple(caseTypeId(), "case", true)]);
  }
}

function assertReadOnlyBindingPlace(
  typedPetriNet: TypedPetriNet,
  args: { transitionId: string; classId: string }
): void {
  const bindingPlaceId = typedPlaceId(objectBindingPlaceId(args.classId));
  const expectedInscription = [
    tuple(caseTypeId(), "case"),
    tuple(objectTypeId(args.classId), `object_${args.classId}`),
  ];

  assertArcInscription(
    requireArcBetween(typedPetriNet, bindingPlaceId, args.transitionId),
    expectedInscription
  );

  const outputArc = typedPetriNet.arcs.find(
    (arc) =>
      arc.kind === "ordinary" &&
      arc.sourceId === args.transitionId &&
      arc.targetId === bindingPlaceId
  );

  if (outputArc) {
    assertArcInscription(outputArc, expectedInscription);
  }
}

function assertArcTouchesPlace(
  typedPetriNet: TypedPetriNet,
  transitionId: string,
  placeId: string,
  expectedInscription: Array<{
    typeId: string;
    variableId: string;
    isGenerated: boolean;
  }>
): void {
  const arc = typedPetriNet.arcs.find(
    (candidate) =>
      candidate.kind === "ordinary" &&
      ((candidate.sourceId === placeId &&
        candidate.targetId === transitionId) ||
        (candidate.sourceId === transitionId && candidate.targetId === placeId))
  );

  assert.ok(
    arc,
    `Expected ordinary arc between ${placeId} and ${transitionId}`
  );
  assertArcInscription(arc, expectedInscription);
}

function assertStateArcDoesNotUseObjectVariable(
  typedPetriNet: TypedPetriNet,
  args: {
    transitionId: string;
    roleId: string;
    classId: string;
    stateId: string;
    direction: "input" | "output";
    forbiddenVariableId: string;
  }
): void {
  const statePlaceId = typedPlaceId(
    stateAwarenessPlaceId(args.roleId, args.classId, args.stateId)
  );
  const arc =
    args.direction === "input"
      ? requireArcBetween(typedPetriNet, statePlaceId, args.transitionId)
      : requireArcBetween(typedPetriNet, args.transitionId, statePlaceId);

  assert.equal(
    arc.inscription.some(
      (element) => element.variableId === args.forbiddenVariableId
    ),
    false,
    `Expected state arc ${arc.id} not to use ${args.forbiddenVariableId}`
  );
}

function assertSynchronizedStateEffect(
  typedPetriNet: TypedPetriNet,
  args: {
    transitionId: string;
    roleId: string;
    classId: string;
    sourceStateId: string;
    targetStateId: string;
  }
): void {
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      typedPlaceId(objectBindingPlaceId(args.classId)),
      args.transitionId
    ),
    [
      tuple(caseTypeId(), "case"),
      tuple(objectTypeId(args.classId), `object_${args.classId}`),
    ]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      typedPlaceId(participationPlaceId(args.roleId)),
      args.transitionId
    ),
    [
      tuple(caseTypeId(), "case"),
      tuple(roleTypeId(args.roleId), `role_${args.roleId}`),
    ]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      typedPlaceId(
        stateAwarenessPlaceId(args.roleId, args.classId, args.sourceStateId)
      ),
      args.transitionId
    ),
    [
      tuple(roleTypeId(args.roleId), `role_${args.roleId}`),
      tuple(objectTypeId(args.classId), `object_${args.classId}`),
    ]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      args.transitionId,
      typedPlaceId(
        stateAwarenessPlaceId(args.roleId, args.classId, args.targetStateId)
      )
    ),
    [
      tuple(roleTypeId(args.roleId), `role_${args.roleId}`),
      tuple(objectTypeId(args.classId), `object_${args.classId}`),
    ]
  );
}

function assertNoDuplicateEquivalentArcs(
  typedPetriNet: TypedPetriNet,
  transitionId: string
): void {
  const arcKeys = typedPetriNet.arcs
    .filter(
      (arc) => arc.sourceId === transitionId || arc.targetId === transitionId
    )
    .map((arc) =>
      JSON.stringify({
        sourceId: arc.sourceId,
        targetId: arc.targetId,
        kind: arc.kind,
        inscription: arc.inscription,
      })
    );

  assert.equal(new Set(arcKeys).size, arcKeys.length);
}

function assertCaseSpecificCreationInvariant(
  typedPetriNet: TypedPetriNet,
  args: { roleId: string; classId: string; initialStateId: string }
): void {
  const transitionId = typedTransitionId(
    creationTransitionId(args.roleId, args.classId, args.initialStateId)
  );
  const transition = requireTypedTransition(typedPetriNet, transitionId);

  assert.equal(transition.name, `Create ${args.classId}`);
  assert.deepEqual(transition.freshVariables, [
    {
      variableId: `object_${args.classId}`,
      typeId: objectTypeId(args.classId),
    },
  ]);
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      typedPlaceId(participationPlaceId(args.roleId)),
      transitionId
    ),
    [
      tuple(caseTypeId(), "case"),
      tuple(roleTypeId(args.roleId), `role_${args.roleId}`),
    ]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      transitionId,
      typedPlaceId(awarenessPlaceId(args.roleId, args.classId))
    ),
    [
      tuple(roleTypeId(args.roleId), `role_${args.roleId}`),
      tuple(objectTypeId(args.classId), `object_${args.classId}`, true),
    ]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      transitionId,
      typedPlaceId(
        stateAwarenessPlaceId(args.roleId, args.classId, args.initialStateId)
      )
    ),
    [
      tuple(roleTypeId(args.roleId), `role_${args.roleId}`),
      tuple(objectTypeId(args.classId), `object_${args.classId}`, true),
    ]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      transitionId,
      typedPlaceId(objectBindingPlaceId(args.classId))
    ),
    [
      tuple(caseTypeId(), "case"),
      tuple(objectTypeId(args.classId), `object_${args.classId}`, true),
    ]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      transitionId,
      typedPlaceId(inclusionPlaceId(args.classId))
    ),
    [tuple(caseTypeId(), "case")]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      typedPlaceId(inclusionPlaceId(args.classId)),
      transitionId,
      "inhibitor"
    ),
    [tuple(caseTypeId(), "case")]
  );
}

function assertCrossCaseCreationInvariant(
  typedPetriNet: TypedPetriNet,
  args: { roleId: string; classId: string; initialStateId: string }
): void {
  const transitionId = typedTransitionId(
    creationTransitionId(args.roleId, args.classId, args.initialStateId)
  );
  const transition = requireTypedTransition(typedPetriNet, transitionId);

  assert.equal(transition.name, `Create ${args.classId}`);
  assert.deepEqual(transition.freshVariables, [
    {
      variableId: `object_${args.classId}`,
      typeId: objectTypeId(args.classId),
    },
  ]);
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      typedPlaceId(poolPlaceId(args.roleId)),
      transitionId
    ),
    [tuple(roleTypeId(args.roleId), `role_${args.roleId}`)]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      transitionId,
      typedPlaceId(awarenessPlaceId(args.roleId, args.classId))
    ),
    [
      tuple(roleTypeId(args.roleId), `role_${args.roleId}`),
      tuple(objectTypeId(args.classId), `object_${args.classId}`, true),
    ]
  );
  assertArcInscription(
    requireArcBetween(
      typedPetriNet,
      transitionId,
      typedPlaceId(
        stateAwarenessPlaceId(args.roleId, args.classId, args.initialStateId)
      )
    ),
    [
      tuple(roleTypeId(args.roleId), `role_${args.roleId}`),
      tuple(objectTypeId(args.classId), `object_${args.classId}`, true),
    ]
  );
  assertNoArcTouches(typedPetriNet, transitionId, [
    typedPlaceId(participationPlaceId(args.roleId)),
    typedPlaceId(objectBindingPlaceId(args.classId)),
    typedPlaceId(inclusionPlaceId(args.classId)),
  ]);
  assert.equal(
    typedPetriNet.arcs
      .filter(
        (arc) => arc.sourceId === transitionId || arc.targetId === transitionId
      )
      .some((arc) =>
        arc.inscription.some((element) => element.variableId === "case")
      ),
    false
  );
}

function assertArcInscription(
  arc: TypedArc,
  expected: Array<{
    typeId: string;
    variableId: string;
    isGenerated: boolean;
  }>
): void {
  assert.deepEqual(
    arc.inscription.map((element) => ({
      typeId: element.typeId,
      variableId: element.variableId,
      isGenerated: element.isGenerated,
    })),
    expected
  );
}

function tuple(
  typeId: string,
  variableId: string,
  isGenerated = false
): { typeId: string; variableId: string; isGenerated: boolean } {
  return { typeId, variableId, isGenerated };
}

function assertApproxEqual(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) <= 0.01,
    `Expected ${actual} to be approximately ${expected}`
  );
}

function assertNoRawDisplayLabels(typedPetriNet: TypedPetriNet): void {
  const rawLabels = new Set([
    "pool_RoleA",
    "part_RoleA",
    "aware_RoleA_ClassA",
    "obj_ClassA",
    "incl_ClassA",
  ]);
  const displayLabels = new Set([
    ...typedPetriNet.places.map((place) => place.name),
    ...typedPetriNet.transitions.map((transition) => transition.name),
  ]);

  for (const rawLabel of rawLabels) {
    assert.equal(displayLabels.has(rawLabel), false);
  }
}
