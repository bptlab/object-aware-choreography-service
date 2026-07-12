import assert from "node:assert/strict";
import type { ObjectAwareChoreographyContext } from "../../src/shared/context/objectAwareChoreographyContext.js";
import type {
  IsolatedPetriNetArtifact,
  PetriNetTransitionSemantics,
} from "../../src/shared/mappings/objectAwareChoreographyToPetriNet/petriNetArtifact.js";
import { getChoreographyTasks } from "../../src/shared/source/objectAwareChoreography/choreography/choreography.js";
import type { PetriNetBuilder } from "../../src/shared/targets/petriNet/petriNetBuilder.js";
import {
  expectIsLocalCreatingTransition,
  expectNoReadArc,
  getTransitions,
  requireInteractionTransition,
  requirePlace,
  requireReadArc,
  requireTransition,
  Role,
} from "../../test/assertions/petriNetAssertions.js";
import { expectWellFormedPetriNet } from "../../test/assertions/petriNetAssertions.js";
import type { EvaluationScenarioDefinition } from "../scenarios.js";

export function assertIsolatedCaseSemanticsForScenario(
  scenario: EvaluationScenarioDefinition,
  petriNet: PetriNetBuilder,
  context: ObjectAwareChoreographyContext,
  artifact?: IsolatedPetriNetArtifact,
): void {
  expectWellFormedPetriNet(petriNet);
  assertVisibleTasksRepresented(scenario, petriNet, context);
  if (artifact) {
    assertDescriptorGraphConsistency(scenario, artifact);
    assertSemanticDescriptorsForScenario(scenario, artifact, context);
  }

  if (scenario.kind === "integrated") {
    assertIntegratedScenario(petriNet);
    return;
  }

  switch (scenario.id) {
    case "CS01":
      assertNoObjectSequence(petriNet, context);
      break;
    case "CS02":
      assertAlternativeSingleObjectCreation(petriNet);
      break;
    case "CS03":
      assertOneToOneCreation(petriNet);
      break;
    case "CS04":
      assertDirectedCreationDependency(petriNet);
      break;
    case "CS05":
    case "CS06":
      assertIndependentBinaryCreation(petriNet);
      break;
    case "CS07":
      assertThreeClassMixedCreation(petriNet);
      break;
    case "CS08":
      assertLocalTransitionCommunicationAndForwarding(petriNet);
      break;
    case "CS09":
      assertMultipleCompatibleReceives(petriNet);
      break;
    case "CS10":
      assertMultiClassSynchronizationForwarding(petriNet);
      break;
    case "CS11":
      assertMultipleSourceSynchronization(petriNet);
      break;
    case "CS12":
      assertLocalAndSynchronizedTarget(petriNet);
      break;
    case "CS13":
      assertCombinedSameClass(petriNet);
      break;
    case "CS14":
      assertCombinedDifferentClasses(petriNet);
      break;
    case "CS15":
      assertEventBasedLocalDecision(petriNet);
      break;
    case "CS16":
      assertGuardedExclusiveDecision(petriNet, ["RoleA"]);
      break;
    case "CS17":
      assertGuardedExclusiveDecision(petriNet, ["RoleA", "RoleB"]);
      break;
    case "CS18":
      assertEventBasedLoop(petriNet);
      break;
    case "CS19":
      assertExclusiveLoop(petriNet);
      break;
    case "CS20":
      assertExclusiveLoop(petriNet);
      break;
    default:
      assert.fail(
        `Missing isolated-case semantic assertion for ${scenario.id}`,
      );
  }
}

function assertDescriptorGraphConsistency(
  scenario: EvaluationScenarioDefinition,
  artifact: IsolatedPetriNetArtifact,
): void {
  const placeIds = new Set(
    artifact.petriNet.getPlaces().map((place) => place.id),
  );
  const transitionIds = new Set(
    artifact.petriNet.getTransitions().map((transition) => transition.id),
  );
  const nodeIds = new Set([...placeIds, ...transitionIds]);
  const describedTransitionIds = new Set(
    Object.values(artifact.semantics.transitions)
      .filter(hasIsolatedTransitionId)
      .map((transition) => transition.isolatedTransitionId),
  );

  for (const [descriptorId, place] of Object.entries(
    artifact.semantics.places,
  )) {
    if ("isolatedPlaceId" in place && place.isolatedPlaceId !== undefined) {
      assert.ok(
        placeIds.has(place.isolatedPlaceId),
        `Semantic place ${descriptorId} for ${scenario.id} references missing place ${place.isolatedPlaceId}`,
      );
    }
  }

  for (const [descriptorId, transition] of Object.entries(
    artifact.semantics.transitions,
  )) {
    if (hasIsolatedTransitionId(transition)) {
      assert.ok(
        transitionIds.has(transition.isolatedTransitionId),
        `Semantic transition ${descriptorId} for ${scenario.id} references missing transition ${transition.isolatedTransitionId}`,
      );
    }
  }

  for (const [descriptorId, arc] of Object.entries(artifact.semantics.arcs)) {
    assert.ok(
      nodeIds.has(arc.sourceId),
      `Semantic arc ${descriptorId} for ${scenario.id} references missing source ${arc.sourceId}`,
    );
    assert.ok(
      nodeIds.has(arc.targetId),
      `Semantic arc ${descriptorId} for ${scenario.id} references missing target ${arc.targetId}`,
    );
  }

  for (const transition of artifact.petriNet
    .getTransitions()
    .filter(isSemanticallyRelevantTransition)) {
    assert.ok(
      describedTransitionIds.has(transition.id),
      `Expected semantic descriptor for relevant isolated transition ${transition.id} in ${scenario.id}`,
    );
  }
}

function assertSemanticDescriptorsForScenario(
  scenario: EvaluationScenarioDefinition,
  artifact: IsolatedPetriNetArtifact,
  context: ObjectAwareChoreographyContext,
): void {
  assertHasDescriptorKind(artifact, scenario.id, "startEventTransition");
  assertHasDescriptorKind(artifact, scenario.id, "endEventTransition");

  if (scenario.kind === "integrated") {
    assert.ok(
      descriptorKinds(artifact).some((kind) =>
        [
          "taskSendTransition",
          "taskReceiveTransition",
          "localTransition",
          "objectCreationTransition",
        ].includes(kind),
      ),
      `Expected object-aware descriptors for integrated scenario ${scenario.id}`,
    );
    return;
  }

  assertTaskDescriptorsCoverVisibleTasks(scenario, artifact, context);

  switch (scenario.id) {
    case "CS01":
      assertNoObjectTaskDescriptors(scenario, artifact);
      break;
    case "CS02":
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "objectCreationTransition",
        2,
      );
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "gatewayBranchTransition",
        2,
      );
      break;
    case "CS03":
      assertOneToOneDescriptor(artifact, scenario.id, ["ClassA", "ClassB"]);
      break;
    case "CS04":
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "objectCreationTransition",
        2,
      );
      assertCreationDescriptorHasDependencyRead(
        artifact,
        scenario.id,
        "ClassB",
      );
      break;
    case "CS05":
    case "CS06":
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "objectCreationTransition",
        2,
      );
      assertCreationDescriptorHasNoDependencyRead(
        artifact,
        scenario.id,
        "ClassB",
      );
      break;
    case "CS07":
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "objectCreationTransition",
        1,
      );
      assertOneToOneDescriptor(artifact, scenario.id, ["ClassB", "ClassC"]);
      assertOneToOneDescriptorHasDependencyRead(
        artifact,
        scenario.id,
        "ClassA",
      );
      break;
    case "CS08":
      assertDescriptorCountAtLeast(artifact, scenario.id, "localTransition", 2);
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "taskSendTransition",
        3,
      );
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "taskReceiveTransition",
        4,
      );
      break;
    case "CS09":
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "taskReceiveTransition",
        4,
      );
      break;
    case "CS10":
      assertTaskDescriptorTouchesClasses(artifact, scenario.id, [
        "ClassA",
        "ClassB",
      ]);
      break;
    case "CS11":
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "taskSendTransition",
        4,
      );
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "taskReceiveTransition",
        4,
      );
      assertTaskDescriptorHasStateRead(artifact, scenario.id);
      break;
    case "CS12":
      assertDescriptorCountAtLeast(artifact, scenario.id, "localTransition", 2);
      assertTaskDescriptorHasStateWrite(artifact, scenario.id);
      break;
    case "CS13":
    case "CS14":
      assertCombinedTaskDescriptors(artifact, scenario.id);
      break;
    case "CS15":
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "gatewayBranchTransition",
        2,
      );
      assertDescriptorCountAtLeast(artifact, scenario.id, "localTransition", 3);
      break;
    case "CS16":
      assertGuardedGatewayDescriptor(artifact, scenario.id);
      break;
    case "CS17":
      assertGuardedGatewayDescriptor(artifact, scenario.id);
      break;
    case "CS18":
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "parallelGatewayTransition",
        2,
      );
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "objectCreationTransition",
        3,
      );
      break;
    case "CS19":
      assertDescriptorCountAtLeast(
        artifact,
        scenario.id,
        "gatewayBranchTransition",
        2,
      );
      break;
    case "CS20":
      assertGuardedGatewayDescriptor(artifact, scenario.id);
      assertDescriptorCountAtLeast(artifact, scenario.id, "localTransition", 4);
      break;
    default:
      assert.fail(
        `Missing isolated-case semantic assertion for ${scenario.id}`,
      );
  }
}

function assertVisibleTasksRepresented(
  scenario: EvaluationScenarioDefinition,
  petriNet: PetriNetBuilder,
  context: ObjectAwareChoreographyContext,
): void {
  for (const task of getChoreographyTasks(context.choreography)) {
    assert.ok(
      hasTransitionFragment(petriNet, task.id) ||
        (task.name ? hasTransitionName(petriNet, task.name) : false),
      `Expected isolated Petri net for ${scenario.id} to represent task ${
        task.name ?? task.id
      }`,
    );
  }
}

function assertTaskDescriptorsCoverVisibleTasks(
  scenario: EvaluationScenarioDefinition,
  artifact: IsolatedPetriNetArtifact,
  context: ObjectAwareChoreographyContext,
): void {
  for (const task of getChoreographyTasks(context.choreography)) {
    assert.ok(
      taskDescriptors(artifact, task.id).length > 0,
      `Expected task descriptor for ${scenario.id}.${task.name ?? task.id}`,
    );
  }
}

function assertNoObjectTaskDescriptors(
  scenario: EvaluationScenarioDefinition,
  artifact: IsolatedPetriNetArtifact,
): void {
  assertDescriptorCountAtLeast(
    artifact,
    scenario.id,
    "atomicTaskTransition",
    1,
  );
  assert.equal(
    taskDescriptorsByKind(artifact, "taskSendTransition").length,
    0,
    `Expected no task send descriptors for no-object scenario ${scenario.id}`,
  );
  assert.equal(
    taskDescriptorsByKind(artifact, "taskReceiveTransition").length,
    0,
    `Expected no task receive descriptors for no-object scenario ${scenario.id}`,
  );
  assert.equal(
    Object.values(artifact.semantics.places).filter(
      (descriptor) => descriptor.kind === "transmissionPlace",
    ).length,
    0,
    `Expected no transmission descriptors for no-object scenario ${scenario.id}`,
  );

  for (const descriptor of taskDescriptors(artifact)) {
    assert.equal(descriptor.kind, "atomicTaskTransition");
  }
}

function assertOneToOneDescriptor(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
  classIds: string[],
): void {
  const descriptor = oneToOneDescriptor(artifact, scenarioId);
  const descriptorClassIds = descriptor.entries.map((entry) => entry.classId);

  for (const classId of classIds) {
    assert.ok(
      descriptorClassIds.includes(classId),
      `Expected one-to-one descriptor for ${scenarioId} to include ${classId}`,
    );
  }
  assert.ok(
    descriptor.stateWrites.length >= classIds.length,
    `Expected one-to-one descriptor for ${scenarioId} to expose state writes`,
  );
  assert.ok(
    descriptor.existenceWrites.length >= classIds.length,
    `Expected one-to-one descriptor for ${scenarioId} to expose existence writes`,
  );
}

function assertCreationDescriptorHasDependencyRead(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
  classId: string,
): void {
  const descriptor = creationDescriptor(artifact, scenarioId, classId);
  assert.ok(
    artifact.petriNet
      .getIncomingArcs(descriptor.isolatedTransitionId)
      .some((arc) => arc.sourceId.includes("p_exists_RoleA_ClassA")),
    `Expected ${scenarioId} creation descriptor for ${classId} to point at a transition with prerequisite read arc`,
  );
}

function assertCreationDescriptorHasNoDependencyRead(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
  classId: string,
): void {
  const descriptor = creationDescriptor(artifact, scenarioId, classId);
  assert.equal(
    artifact.petriNet
      .getIncomingArcs(descriptor.isolatedTransitionId)
      .some((arc) => arc.sourceId.includes("p_exists_RoleA_ClassA")),
    false,
    `Expected ${scenarioId} creation descriptor for ${classId} not to require ClassA as prerequisite`,
  );
}

function assertOneToOneDescriptorHasDependencyRead(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
  classId: string,
): void {
  const descriptor = oneToOneDescriptor(artifact, scenarioId);
  assert.ok(
    artifact.petriNet
      .getIncomingArcs(descriptor.isolatedTransitionId)
      .some((arc) => arc.sourceId.includes(`p_exists_RoleA_${classId}`)),
    `Expected one-to-one descriptor for ${scenarioId} to reference a transition with ${classId} prerequisite read`,
  );
}

function assertTaskDescriptorTouchesClasses(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
  classIds: string[],
): void {
  const taskClassIds = new Set(
    taskDescriptors(artifact).flatMap((descriptor) => [
      ...descriptor.stateReads.map((state) => state.classId),
      ...descriptor.stateWrites.map((state) => state.classId),
      descriptor.objectRef?.classId,
    ]),
  );

  for (const classId of classIds) {
    assert.ok(
      taskClassIds.has(classId),
      `Expected task descriptors for ${scenarioId} to expose ${classId}`,
    );
  }
}

function assertTaskDescriptorHasStateRead(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
): void {
  assert.ok(
    taskDescriptors(artifact).some(
      (descriptor) => descriptor.stateReads.length > 0,
    ),
    `Expected task descriptor state reads for ${scenarioId}`,
  );
}

function assertTaskDescriptorHasStateWrite(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
): void {
  assert.ok(
    taskDescriptors(artifact).some(
      (descriptor) => descriptor.stateWrites.length > 0,
    ),
    `Expected task descriptor state writes for ${scenarioId}`,
  );
}

function assertCombinedTaskDescriptors(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
): void {
  assert.ok(
    taskDescriptors(artifact).some(
      (descriptor) =>
        descriptor.kind === "taskSendTransition" &&
        descriptor.objectRef &&
        (descriptor.stateReads.length > 0 || descriptor.stateWrites.length > 0),
    ),
    `Expected combined send descriptor for ${scenarioId}`,
  );
  assert.ok(
    taskDescriptors(artifact).some(
      (descriptor) =>
        descriptor.kind === "taskReceiveTransition" &&
        descriptor.objectRef &&
        descriptor.stateWrites.length > 0,
    ),
    `Expected combined receive descriptor for ${scenarioId}`,
  );
}

function assertGuardedGatewayDescriptor(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
): void {
  assert.ok(
    Object.values(artifact.semantics.transitions).some(
      (descriptor) =>
        descriptor.kind === "gatewayBranchTransition" &&
        descriptor.guard &&
        descriptor.stateReads.length > 0,
    ),
    `Expected guarded gateway branch descriptor for ${scenarioId}`,
  );
}

function assertNoObjectSequence(
  petriNet: PetriNetBuilder,
  context: ObjectAwareChoreographyContext,
): void {
  assert.equal(context.objectReferences.size, 0);
  assert.equal(
    getTransitions(petriNet, /^t_send_/).length,
    0,
    "Expected no object-state send transitions for no-object tasks",
  );
  assert.equal(
    getTransitions(petriNet, /^t_recv_/).length,
    0,
    "Expected no object-state receive transitions for no-object tasks",
  );
}

function assertAlternativeSingleObjectCreation(
  petriNet: PetriNetBuilder,
): void {
  expectIsLocalCreatingTransition(
    petriNet,
    requireTransition(petriNet, "t_local_RoleA_ClassA_initial_a-x"),
    Role.A,
    "ClassA",
  );
  expectIsLocalCreatingTransition(
    petriNet,
    requireTransition(petriNet, "t_local_RoleA_ClassA_initial_a-y"),
    Role.A,
    "ClassA",
  );
  requirePlace(petriNet, "p_state_RoleA_ClassA_a-x");
  requirePlace(petriNet, "p_state_RoleA_ClassA_a-y");
}

function assertOneToOneCreation(petriNet: PetriNetBuilder): void {
  requireTransition(petriNet, /^t_create_1to1_.*ClassA.*ClassB/);
  requirePlace(petriNet, "p_state_RoleA_ClassA_a-x");
  requirePlace(petriNet, "p_state_RoleA_ClassB_b-x");
}

function assertDirectedCreationDependency(petriNet: PetriNetBuilder): void {
  const prerequisite = requirePlace(petriNet, "p_exists_RoleA_ClassA");
  const dependentCreate = requireTransition(
    petriNet,
    "t_local_RoleA_ClassB_initial_b-x",
  );

  requireReadArc(petriNet, prerequisite, dependentCreate);
}

function assertIndependentBinaryCreation(petriNet: PetriNetBuilder): void {
  const classA = requirePlace(petriNet, "p_exists_RoleA_ClassA");
  const classBCreate = requireTransition(
    petriNet,
    "t_local_RoleA_ClassB_initial_b-x",
  );

  expectNoReadArc(petriNet, classA, classBCreate);
  requireTransition(petriNet, "t_local_RoleA_ClassA_initial_a-x");
  requireTransition(petriNet, "t_local_RoleA_ClassB_initial_b-x");
}

function assertThreeClassMixedCreation(petriNet: PetriNetBuilder): void {
  ["ClassA", "ClassB", "ClassC"].forEach((className) =>
    requirePlace(petriNet, new RegExp(`p_exists_RoleA_${className}`)),
  );
  assert.ok(
    getTransitions(petriNet, /ClassA|ClassB|ClassC/).length >= 3,
    "Expected all three object classes to participate in creation semantics",
  );
}

function assertLocalTransitionCommunicationAndForwarding(
  petriNet: PetriNetBuilder,
): void {
  assert.ok(
    getTransitions(petriNet, /^t_local_/).length >= 2,
    "Expected multiple local lifecycle transitions",
  );
  requireInteractionTransition(petriNet, {
    direction: "send",
    kind: "communication",
  });
  requireInteractionTransition(petriNet, {
    direction: "receive",
    kind: "communication",
  });
  assert.ok(
    getTransitions(petriNet, /^t_recv_.*_/).length > 1,
    "Expected forwarding/receiver variants over existing state information",
  );
}

function assertMultipleCompatibleReceives(petriNet: PetriNetBuilder): void {
  assert.ok(
    getTransitions(petriNet, /^t_recv_/).length >= 2,
    "Expected multiple compatible receiver-state variants",
  );
}

function assertMultiClassSynchronizationForwarding(
  petriNet: PetriNetBuilder,
): void {
  requirePlace(petriNet, /p_state_.*ClassA_a-y/);
  requirePlace(petriNet, /p_state_.*ClassB_b-y/);
  assert.ok(
    getTransitions(petriNet, /sync|ClassA.*a-y|ClassB.*b-y/).length >= 2,
    "Expected synchronization effects for both object classes",
  );
}

function assertMultipleSourceSynchronization(petriNet: PetriNetBuilder): void {
  assert.ok(
    getTransitions(petriNet, /sync|a-x_a-y|a-z_a-y/).length >= 2,
    "Expected multiple source-state synchronization variants",
  );
}

function assertLocalAndSynchronizedTarget(petriNet: PetriNetBuilder): void {
  requireTransition(petriNet, /^t_local_.*_a-y/);
  assert.ok(
    getTransitions(petriNet, /sync|a-y/).length >= 2,
    "Expected local and synchronized production paths to the target state",
  );
}

function assertCombinedSameClass(petriNet: PetriNetBuilder): void {
  requireInteractionTransition(petriNet, {
    direction: "send",
    kind: "combined",
  });
  requireInteractionTransition(petriNet, {
    direction: "receive",
    kind: "combined",
  });
  requirePlace(petriNet, /p_state_.*ClassA_a-y/);
}

function assertCombinedDifferentClasses(petriNet: PetriNetBuilder): void {
  requireInteractionTransition(petriNet, {
    direction: "send",
    kind: "combined",
  });
  requirePlace(petriNet, /p_state_.*ClassA_/);
  requirePlace(petriNet, /p_state_.*ClassB_/);
}

function assertEventBasedLocalDecision(petriNet: PetriNetBuilder): void {
  assert.ok(
    getTransitions(petriNet, /^t_local_/).length >= 2,
    "Expected local non-creational decision transitions",
  );
  assert.ok(
    getTransitions(petriNet, /xor|event/i).length >= 2,
    "Expected event-based alternatives in control-flow structure",
  );
}

function assertGuardedExclusiveDecision(
  petriNet: PetriNetBuilder,
  expectedAffectedRoles: string[],
): void {
  const xBranch = requireTransition(petriNet, /t_xor_.*ClassA_a-x/);
  const yBranch = requireTransition(petriNet, /t_xor_.*ClassA_a-y/);

  for (const role of expectedAffectedRoles) {
    requireReadArc(
      petriNet,
      requirePlace(petriNet, `p_state_${role}_ClassA_a-x`),
      xBranch,
    );
    requireReadArc(
      petriNet,
      requirePlace(petriNet, `p_state_${role}_ClassA_a-y`),
      yBranch,
    );
  }

  assertNoUnexpectedGuardStateReads(petriNet, xBranch.id, expectedAffectedRoles);
  assertNoUnexpectedGuardStateReads(petriNet, yBranch.id, expectedAffectedRoles);
}

function assertNoUnexpectedGuardStateReads(
  petriNet: PetriNetBuilder,
  transitionId: string,
  expectedAffectedRoles: string[],
): void {
  const expected = new Set(expectedAffectedRoles);
  const unexpectedRoles = petriNet
    .getArcs()
    .filter(
      (arc) =>
        arc.targetId === transitionId &&
        /^p_state_.*_ClassA_a-[xy]$/.test(arc.sourceId),
    )
    .map((arc) => /^p_state_(.*)_ClassA_a-[xy]$/.exec(arc.sourceId)?.[1])
    .filter((role): role is string => role !== undefined)
    .filter((role) => !expected.has(role));

  assert.deepEqual(
    [...new Set(unexpectedRoles)].sort(),
    [],
    `Expected guarded gateway ${transitionId} not to read unaffected role state`,
  );
}

function assertParallelIndependentBranches(petriNet: PetriNetBuilder): void {
  assert.ok(
    getTransitions(petriNet, /^t_parallel_/).length >= 2,
    "Expected parallel split and join transitions",
  );
  ["ClassA", "ClassB", "ClassC"].forEach((className) =>
    requirePlace(petriNet, new RegExp(`p_exists_RoleA_${className}`)),
  );
}

function assertEventBasedLoop(petriNet: PetriNetBuilder): void {
  assert.ok(
    getTransitions(petriNet, /xor|event|Gateway/i).length >= 1,
    "Expected gateway structure for event-based loop",
  );
}

function assertExclusiveLoop(petriNet: PetriNetBuilder): void {
  assert.ok(
    getTransitions(petriNet, /t_xor_/).length >= 1,
    "Expected exclusive gateway structure for loop",
  );
  requirePlace(petriNet, /p_state_.*ClassA_/);
}

function assertIntegratedScenario(petriNet: PetriNetBuilder): void {
  assert.ok(
    petriNet
      .getTransitions()
      .some((transition) => /^t_send_|^t_sync_|^t_comb_/.test(transition.id)),
    "Expected integrated scenario to include object-aware task semantics",
  );
}

function hasTransitionFragment(
  petriNet: PetriNetBuilder,
  rawFragment: string,
): boolean {
  const fragments = [
    rawFragment,
    rawFragment.replace(/_/g, "-"),
    rawFragment.replace(/_/g, "_"),
  ];

  return petriNet
    .getTransitions()
    .some((transition) =>
      fragments.some((fragment) => transition.id.includes(fragment)),
    );
}

function hasTransitionName(petriNet: PetriNetBuilder, name: string): boolean {
  return petriNet
    .getTransitions()
    .some((transition) => transition.name.includes(name));
}

function isSemanticallyRelevantTransition(transition: { id: string }): boolean {
  return /^(t_start|t_end|t_send|t_recv|t_sync|t_comb|t_local|t_create_1to1|t_xor|t_parallel|t_event)/.test(
    transition.id,
  );
}

function descriptorKinds(artifact: IsolatedPetriNetArtifact): string[] {
  return [
    ...new Set(
      Object.values(artifact.semantics.transitions).map(
        (descriptor) => descriptor.kind,
      ),
    ),
  ];
}

function assertHasDescriptorKind(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
  kind: PetriNetTransitionSemantics["kind"],
): void {
  assert.ok(
    Object.values(artifact.semantics.transitions).some(
      (descriptor) => descriptor.kind === kind,
    ),
    `Expected ${kind} descriptor for ${scenarioId}`,
  );
}

function assertDescriptorCountAtLeast(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
  kind: PetriNetTransitionSemantics["kind"],
  expectedMinimum: number,
): void {
  const actual = Object.values(artifact.semantics.transitions).filter(
    (descriptor) => descriptor.kind === kind,
  ).length;

  assert.ok(
    actual >= expectedMinimum,
    `Expected at least ${expectedMinimum} ${kind} descriptors for ${scenarioId}, got ${actual}`,
  );
}

function taskDescriptors(artifact: IsolatedPetriNetArtifact): Array<
  Extract<
    PetriNetTransitionSemantics,
    {
      kind:
        | "atomicTaskTransition"
        | "taskSendTransition"
        | "taskReceiveTransition";
    }
  >
>;
function taskDescriptors(
  artifact: IsolatedPetriNetArtifact,
  taskId: string,
): Array<
  Extract<
    PetriNetTransitionSemantics,
    {
      kind:
        | "atomicTaskTransition"
        | "taskSendTransition"
        | "taskReceiveTransition";
    }
  >
>;
function taskDescriptors<
  Kind extends
    | "atomicTaskTransition"
    | "taskSendTransition"
    | "taskReceiveTransition",
>(
  artifact: IsolatedPetriNetArtifact,
  taskId: string,
  kind: Kind,
): Array<Extract<PetriNetTransitionSemantics, { kind: Kind }>>;
function taskDescriptors(
  artifact: IsolatedPetriNetArtifact,
  taskId?: string,
  kind?:
    | "atomicTaskTransition"
    | "taskSendTransition"
    | "taskReceiveTransition",
): Array<
  Extract<
    PetriNetTransitionSemantics,
    {
      kind:
        | "atomicTaskTransition"
        | "taskSendTransition"
        | "taskReceiveTransition";
    }
  >
> {
  return Object.values(artifact.semantics.transitions).filter(
    (
      descriptor,
    ): descriptor is Extract<
      PetriNetTransitionSemantics,
      {
        kind:
          | "atomicTaskTransition"
          | "taskSendTransition"
          | "taskReceiveTransition";
      }
    > =>
      (descriptor.kind === "atomicTaskTransition" ||
        descriptor.kind === "taskSendTransition" ||
        descriptor.kind === "taskReceiveTransition") &&
      (taskId === undefined || descriptor.taskId === taskId) &&
      (kind === undefined || descriptor.kind === kind),
  );
}

function hasIsolatedTransitionId(
  descriptor: PetriNetTransitionSemantics,
): descriptor is PetriNetTransitionSemantics & {
  isolatedTransitionId: string;
} {
  return (
    "isolatedTransitionId" in descriptor &&
    typeof descriptor.isolatedTransitionId === "string"
  );
}

function taskDescriptorsByKind<
  Kind extends
    | "atomicTaskTransition"
    | "taskSendTransition"
    | "taskReceiveTransition",
>(
  artifact: IsolatedPetriNetArtifact,
  kind: Kind,
): Array<Extract<PetriNetTransitionSemantics, { kind: Kind }>> {
  return Object.values(artifact.semantics.transitions).filter(
    (
      descriptor,
    ): descriptor is Extract<PetriNetTransitionSemantics, { kind: Kind }> =>
      descriptor.kind === kind,
  );
}

function creationDescriptor(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
  classId: string,
): Extract<PetriNetTransitionSemantics, { kind: "objectCreationTransition" }> {
  const descriptor = Object.values(artifact.semantics.transitions).find(
    (
      candidate,
    ): candidate is Extract<
      PetriNetTransitionSemantics,
      { kind: "objectCreationTransition" }
    > =>
      candidate.kind === "objectCreationTransition" &&
      candidate.classId === classId,
  );

  assert.ok(
    descriptor,
    `Expected object creation descriptor for ${scenarioId}.${classId}`,
  );
  return descriptor;
}

function oneToOneDescriptor(
  artifact: IsolatedPetriNetArtifact,
  scenarioId: string,
): Extract<
  PetriNetTransitionSemantics,
  { kind: "oneToOneObjectCreationTransition" }
> {
  const descriptor = Object.values(artifact.semantics.transitions).find(
    (
      candidate,
    ): candidate is Extract<
      PetriNetTransitionSemantics,
      { kind: "oneToOneObjectCreationTransition" }
    > => candidate.kind === "oneToOneObjectCreationTransition",
  );

  assert.ok(
    descriptor,
    `Expected one-to-one object creation descriptor for ${scenarioId}`,
  );
  return descriptor;
}
