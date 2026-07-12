import assert from "node:assert/strict";
import type { ObjectAwareChoreographyContext } from "../../src/shared/context/objectAwareChoreographyContext.js";
import {
  caseTypeId,
  roleTypeId,
} from "../../src/shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import { getChoreographyTasks } from "../../src/shared/source/objectAwareChoreography/choreography/choreography.js";
import type {
  TypedArc,
  TypedPetriNet,
} from "../../src/shared/targets/typedPetriNet/index.js";
import {
  expectWellFormedTypedPetriNet,
  requireTypedIdentifierType,
} from "../../test/assertions/typedPetriNetAssertions.js";
import type { EvaluationScenarioDefinition } from "../scenarios.js";

export function assertCrossCaseSemanticsForScenario(
  scenario: EvaluationScenarioDefinition,
  net: TypedPetriNet,
  context: ObjectAwareChoreographyContext,
): void {
  expectWellFormedTypedPetriNet(net);
  requireTypedIdentifierType(net, caseTypeId());
  for (const role of net.identifierTypes.filter((type) =>
    type.id.startsWith("role_"),
  )) {
    requireTypedIdentifierType(net, role.id);
  }
  assertVisibleTasksDecomposed(scenario, net, context);
  assertGatewayCaseVariablePreservation(net);

  if (scenario.kind === "integrated") {
    assertIntegratedScenario(scenario, net);
    return;
  }

  switch (scenario.id) {
    case "CS01":
      assertNoObjectSequence(net);
      break;
    case "CS02":
      assertAlternativeCreation(net);
      break;
    case "CS03":
      assertBinaryObjectTyping(net, ["ClassA", "ClassB"]);
      assertNoStandaloneCreationTransition(net);
      assertCaseSpecificOneToOneCreation(net, ["ClassA", "ClassB"]);
      break;
    case "CS04":
      assertBinaryObjectTyping(net, ["ClassA", "ClassB"]);
      assertCaseSpecificCreation(net, "ClassA");
      assertCaseSpecificCreation(net, "ClassB", ["ClassA"]);
      break;
    case "CS05":
    case "CS06":
      assertBinaryObjectTyping(net, ["ClassA", "ClassB"]);
      assertCaseSpecificCreation(net, "ClassA");
      assertCaseSpecificCreation(net, "ClassB");
      assertCreationIndependentOf(net, "ClassB", "ClassA");
      assertNoRelationPlaces(net);
      break;
    case "CS07":
      assertBinaryObjectTyping(net, ["ClassA", "ClassB", "ClassC"]);
      assertCaseSpecificCreation(net, "ClassA");
      assertCaseSpecificOneToOneCreation(net, ["ClassB", "ClassC"], ["ClassA"]);
      break;
    case "CS08":
      assertCommunicationAndForwarding(net);
      break;
    case "CS09":
      assertReceiverVariants(net);
      assertSpecificReceiverVariants(net, "ClassA", ["a_x_a_z", "a_y_a_z"]);
      assertLocalStateChange(net, "RoleB", "ClassA", "a_x", "a_z");
      assertLocalStateChange(net, "RoleB", "ClassA", "a_y", "a_z");
      break;
    case "CS10":
      assertSynchronizedForwarding(net, ["ClassA", "ClassB"]);
      break;
    case "CS11":
      assertReceiverVariants(net);
      assertSynchronizedSourceVariants(net, ["a_x", "a_y"], "a_z");
      break;
    case "CS12":
      assertLocalAndSynchronizedLifting(net);
      break;
    case "CS13":
      assertCombinedTask(net, ["ClassA"]);
      break;
    case "CS14":
      assertCombinedTask(net, ["ClassA", "ClassB"]);
      break;
    case "CS15":
      assertEventBasedDecision(net);
      break;
    case "CS16":
      assertGuardedGateway(net, ["RoleA"]);
      break;
    case "CS17":
      assertGuardedGateway(net, ["RoleA", "RoleB"]);
      break;
    case "CS18":
      assertParallelGateway(net);
      break;
    case "CS19":
      assertEventBasedLoop(net);
      break;
    case "CS20":
      assertExclusiveGatewayLoop(net);
      break;
    default:
      assert.fail(`Missing cross-case semantic assertion for ${scenario.id}`);
  }
}

function assertVisibleTasksDecomposed(
  scenario: EvaluationScenarioDefinition,
  net: TypedPetriNet,
  context: ObjectAwareChoreographyContext,
): void {
  for (const task of getChoreographyTasks(context.choreography)) {
    if (hasTransition(net, ["Transition_task", task.id])) {
      assert.equal(
        hasTransition(net, ["Transition_send", task.id]),
        false,
        `Expected atomic no-object task ${
          task.name ?? task.id
        } not to include a send transition`,
      );
      assert.equal(
        hasTransition(net, ["Transition_receive", task.id]),
        false,
        `Expected atomic no-object task ${
          task.name ?? task.id
        } not to include a receive transition`,
      );
      continue;
    }

    assert.ok(
      hasTransition(net, ["Transition_send", task.id]) ||
        hasTransition(net, ["Transition_gateway", task.id]),
      `Expected cross-case net for ${
        scenario.id
      } to include a send/gateway transition for ${task.name ?? task.id}`,
    );
    assert.ok(
      hasTransition(net, ["Transition_receive", task.id]) ||
        hasTransition(net, ["Transition_gateway", task.id]),
      `Expected cross-case net for ${
        scenario.id
      } to include a receive/gateway transition for ${task.name ?? task.id}`,
    );
  }
}

function assertNoObjectSequence(net: TypedPetriNet): void {
  assert.ok(
    countTransitions(net, "Transition_task") >= 2,
    "Expected no-object tasks to be lifted into atomic typed transitions",
  );
  assert.equal(
    net.places.some((place) => place.id.startsWith("Place_tx_")),
    false,
    "Expected no-object sequence not to introduce transmission places",
  );
}

function assertAlternativeCreation(net: TypedPetriNet): void {
  assertCreationTransition(net, "ClassA_a_x");
  assertCreationTransition(net, "ClassA_a_y");
  assertPlace(net, "Place_state_RoleA_ClassA_a_x");
  assertPlace(net, "Place_state_RoleA_ClassA_a_y");
}

function assertBinaryObjectTyping(
  net: TypedPetriNet,
  classNames: string[],
): void {
  for (const className of classNames) {
    assertPlace(net, `Place_obj_${className}`);
    assertPlace(net, `Place_incl_${className}`);
    requireTypedIdentifierType(net, objectTypeId(className));
  }
}

function assertNoStandaloneCreationTransition(net: TypedPetriNet): void {
  assert.equal(
    countTransitions(net, "Transition_create_RoleA_ClassA"),
    0,
    "Expected one-to-one group not to be represented as independent ClassA creation",
  );
  assert.equal(
    countTransitions(net, "Transition_create_RoleA_ClassB"),
    0,
    "Expected one-to-one group not to be represented as independent ClassB creation",
  );
}

function assertCaseSpecificOneToOneCreation(
  net: TypedPetriNet,
  createdClassNames: string[],
  dependencyClassNames: string[] = [],
): void {
  const transition = requireTransitionByFragments(net, [
    "t_create_1to1",
    ...createdClassNames,
  ]);

  assertOrdinaryArc(
    net,
    "Place_part_RoleA",
    transition.id,
    "Expected one-to-one creation to require the creator's case participation",
  );

  for (const className of createdClassNames) {
    assertOrdinaryArc(
      net,
      transition.id,
      `Place_obj_${className}`,
      `Expected one-to-one creation to bind created ${className} objects to the case`,
    );
    assertOrdinaryArc(
      net,
      transition.id,
      `Place_incl_${className}`,
      `Expected one-to-one creation to mark ${className} as included in the case`,
    );
    assertInhibitorArc(
      net,
      `Place_incl_${className}`,
      transition.id,
      `Expected one-to-one creation to prevent duplicate ${className} creation in one case`,
    );
    assertOrdinaryArc(
      net,
      transition.id,
      `Place_aware_RoleA_${className}`,
      `Expected creator to become aware of created ${className}`,
    );
    assert.ok(
      net.arcs.some(
        (arc) =>
          arc.kind === "ordinary" &&
          arc.sourceId === transition.id &&
          arc.targetId.startsWith(`Place_state_RoleA_${className}_`),
      ),
      `Expected creator to receive the created ${className} state`,
    );
  }

  for (const className of dependencyClassNames) {
    assertOrdinaryArc(
      net,
      `Place_obj_${className}`,
      transition.id,
      `Expected one-to-one creation to require case-bound prerequisite ${className}`,
    );
    assertOrdinaryArc(
      net,
      `Place_aware_RoleA_${className}`,
      transition.id,
      `Expected creator to know prerequisite ${className} before dependent one-to-one creation`,
    );
  }
}

function assertCreationTransition(net: TypedPetriNet, fragment: string): void {
  assert.ok(
    hasTransition(net, ["Transition_create", fragment]),
    `Expected creation transition for ${fragment}`,
  );
}

function assertCaseSpecificCreation(
  net: TypedPetriNet,
  className: string,
  dependencyClassNames: string[] = [],
): void {
  const transition = requireTransitionByFragments(net, [
    "Transition_create",
    "RoleA",
    className,
  ]);

  assertOrdinaryArc(
    net,
    "Place_part_RoleA",
    transition.id,
    `Expected ${className} creation to require creator participation`,
  );
  assertOrdinaryArc(
    net,
    transition.id,
    `Place_obj_${className}`,
    `Expected ${className} creation to bind the object to the case`,
  );
  assertOrdinaryArc(
    net,
    transition.id,
    `Place_incl_${className}`,
    `Expected ${className} creation to mark case inclusion`,
  );
  assertInhibitorArc(
    net,
    `Place_incl_${className}`,
    transition.id,
    `Expected ${className} creation to prevent duplicate case inclusion`,
  );
  assertOrdinaryArc(
    net,
    transition.id,
    `Place_aware_RoleA_${className}`,
    `Expected creator awareness output for ${className}`,
  );
  assert.ok(
    net.arcs.some(
      (arc) =>
        arc.kind === "ordinary" &&
        arc.sourceId === transition.id &&
        arc.targetId.startsWith(`Place_state_RoleA_${className}_`),
    ),
    `Expected creator state output for ${className}`,
  );

  for (const dependencyClassName of dependencyClassNames) {
    assertOrdinaryArc(
      net,
      `Place_obj_${dependencyClassName}`,
      transition.id,
      `Expected ${className} creation to read case-bound ${dependencyClassName}`,
    );
    assertOrdinaryArc(
      net,
      `Place_aware_RoleA_${dependencyClassName}`,
      transition.id,
      `Expected ${className} creation to read creator awareness of ${dependencyClassName}`,
    );
  }
}

function assertNoRelationPlaces(net: TypedPetriNet): void {
  assert.equal(
    net.places.some((place) => /rel|assoc|one_to|many_to/i.test(place.id)),
    false,
    "Expected no mandatory relation places for independent binary creation",
  );
}

function assertCommunicationAndForwarding(net: TypedPetriNet): void {
  assert.ok(
    net.places.some((place) => place.id.startsWith("Place_tx_")),
    "Expected typed transmission places for object communication",
  );
  assert.ok(
    net.transitions.some((transition) =>
      /receive_.*_t_recv_/.test(transition.id),
    ),
    "Expected lifted receiver variants for forwarding/state compatibility",
  );
  const localTransition = requireTransitionByFragments(net, [
    "Transition_local",
    "RoleB",
    "ClassA",
    "a_x",
    "a_y",
  ]);
  assertOrdinaryArc(
    net,
    "Place_state_RoleB_ClassA_a_x",
    localTransition.id,
    "Expected local forwarding scenario to read RoleB.ClassA a-x",
  );
  assertOrdinaryArc(
    net,
    localTransition.id,
    "Place_state_RoleB_ClassA_a_y",
    "Expected local forwarding scenario to write RoleB.ClassA a-y",
  );
  assertTransitionExists(net, ["Transition_receive", "ClassA_initial_a_y"]);
  assertTransitionExists(net, ["Transition_receive", "ClassA_a_x_a_y"]);
}

function assertReceiverVariants(net: TypedPetriNet): void {
  assert.ok(
    net.transitions.filter((transition) =>
      /Transition_receive_.*_t_(?:recv|sync_recv|comb_recv)_/.test(
        transition.id,
      ),
    ).length >= 2,
    "Expected multiple lifted receiver-state variants",
  );
}

function assertSpecificReceiverVariants(
  net: TypedPetriNet,
  className: string,
  sourceTargets: string[],
): void {
  for (const sourceTarget of sourceTargets) {
    assertTransitionExists(net, [
      "Transition_receive",
      `${className}_${sourceTarget}`,
    ]);
  }
}

function assertCreationIndependentOf(
  net: TypedPetriNet,
  createdClassName: string,
  independentClassName: string,
): void {
  const transition = requireTransitionByFragments(net, [
    "Transition_create",
    "RoleA",
    createdClassName,
  ]);
  assertNoOrdinaryArc(
    net,
    `Place_obj_${independentClassName}`,
    transition.id,
    `Expected ${createdClassName} creation not to require case-bound ${independentClassName}`,
  );
  assertNoOrdinaryArc(
    net,
    `Place_aware_RoleA_${independentClassName}`,
    transition.id,
    `Expected ${createdClassName} creation not to require creator awareness of ${independentClassName}`,
  );
}

function assertSynchronizedForwarding(
  net: TypedPetriNet,
  classNames: string[],
): void {
  classNames.forEach((className) => assertPlace(net, `Place_obj_${className}`));
  const syncTransition = requireTransitionByFragments(net, [
    "Transition_send",
    "ChoreographyTask_0vvrsfb",
  ]);
  assertOrdinaryArc(
    net,
    "Place_state_RoleA_ClassA_a_x",
    syncTransition.id,
    "Expected multi-class synchronization to read ClassA source state",
  );
  assertOrdinaryArc(
    net,
    "Place_state_RoleA_ClassB_b_x",
    syncTransition.id,
    "Expected multi-class synchronization to read ClassB source state",
  );
  assertOrdinaryArc(
    net,
    syncTransition.id,
    "Place_state_RoleA_ClassA_a_y",
    "Expected multi-class synchronization to write ClassA target state",
  );
  assertOrdinaryArc(
    net,
    syncTransition.id,
    "Place_state_RoleA_ClassB_b_y",
    "Expected multi-class synchronization to write ClassB target state",
  );
  assert.ok(
    classNames.every((className) =>
      net.places.some((place) =>
        new RegExp(`Place_state_.*_${className}_.*_y`).test(place.id),
      ),
    ),
    "Expected lifted synchronized state effects",
  );
  assertSpecificReceiverVariants(net, "ClassA", ["initial_a_y", "a_x_a_y"]);
  assertSpecificReceiverVariants(net, "ClassB", ["initial_b_y", "b_x_b_y"]);
}

function assertLocalAndSynchronizedLifting(net: TypedPetriNet): void {
  assertLocalStateChange(net, "RoleB", "ClassA", "a_x", "a_y");
  const combinedReceive = requireTransitionByFragments(net, [
    "Transition_receive",
    "t_comb_recv",
    "ClassA_a_x",
    "a_y",
  ]);
  assertOrdinaryArc(
    net,
    combinedReceive.id,
    "Place_state_RoleB_ClassA_a_y",
    "Expected synchronized/combined path to write the same target state",
  );
  assertSpecificReceiverVariants(net, "ClassA", ["initial_a_y", "a_x_a_y"]);
}

function assertCombinedTask(net: TypedPetriNet, classNames: string[]): void {
  classNames.forEach((className) => assertPlace(net, `Place_obj_${className}`));
  if (classNames.length === 1) {
    const combinedReceive = requireTransitionByFragments(net, [
      "Transition_receive",
      "t_comb_recv",
      "ClassA_a_x_a_x_a_y",
    ]);
    assertOrdinaryArc(
      net,
      "Place_state_RoleB_ClassA_a_x",
      combinedReceive.id,
      "Expected combined same-class receive to read synchronized source state",
    );
    assertOrdinaryArc(
      net,
      combinedReceive.id,
      "Place_state_RoleB_ClassA_a_y",
      "Expected combined same-class receive to write synchronized target state",
    );
    return;
  }

  const combinedSend = requireTransitionByFragments(net, [
    "Transition_send",
    "ChoreographyTask_0lk2fye",
  ]);
  assertOrdinaryArc(
    net,
    "Place_obj_ClassB",
    combinedSend.id,
    "Expected combined different-class send to read communicated ClassB binding",
  );
  assertOrdinaryArc(
    net,
    "Place_state_RoleA_ClassA_a_x",
    combinedSend.id,
    "Expected combined different-class send to read synchronized ClassA source state",
  );
  assertOrdinaryArc(
    net,
    combinedSend.id,
    "Place_state_RoleA_ClassA_a_y",
    "Expected combined different-class send to write synchronized ClassA target state",
  );
  const combinedReceive = requireTransitionByFragments(net, [
    "Transition_receive",
    "ChoreographyTask_0lk2fye",
  ]);
  assertOrdinaryArc(
    net,
    "Place_obj_ClassB",
    combinedReceive.id,
    "Expected combined different-class receive to bind communicated ClassB",
  );
  assertOrdinaryArc(
    net,
    "Place_state_RoleB_ClassA_a_x",
    combinedReceive.id,
    "Expected combined different-class receive to read synchronized ClassA source state",
  );
  assertOrdinaryArc(
    net,
    combinedReceive.id,
    "Place_state_RoleB_ClassA_a_y",
    "Expected combined different-class receive to write synchronized ClassA target state",
  );
}

function assertEventBasedDecision(net: TypedPetriNet): void {
  assertTransitionExists(net, ["Transition_gateway", "Flow_0h536ur"]);
  assertTransitionExists(net, ["Transition_gateway", "Flow_0kxe60s"]);
  assertTransitionExists(net, ["Transition_local", "ClassA_a_x_a_y"]);
  assertTransitionExists(net, ["Transition_local", "ClassA_a_x_a_z"]);
}

function assertSynchronizedSourceVariants(
  net: TypedPetriNet,
  sourceStates: string[],
  targetState: string,
): void {
  for (const sourceState of sourceStates) {
    const sendTransition = requireTransitionByFragments(net, [
      "Transition_send",
      "t_sync_send",
      `ClassA_${sourceState}`,
    ]);
    assertOrdinaryArc(
      net,
      `Place_state_RoleA_ClassA_${sourceState}`,
      sendTransition.id,
      `Expected synchronized send variant to read source state ${sourceState}`,
    );
    assertOrdinaryArc(
      net,
      sendTransition.id,
      `Place_state_RoleA_ClassA_${targetState}`,
      `Expected synchronized send variant to write target state ${targetState}`,
    );

    const receiveTransition = requireTransitionByFragments(net, [
      "Transition_receive",
      "t_sync_recv",
      `ClassA_${sourceState}`,
    ]);
    assertOrdinaryArc(
      net,
      `Place_state_RoleB_ClassA_${sourceState}`,
      receiveTransition.id,
      `Expected synchronized receive variant to read source state ${sourceState}`,
    );
    assertOrdinaryArc(
      net,
      receiveTransition.id,
      `Place_state_RoleB_ClassA_${targetState}`,
      `Expected synchronized receive variant to write target state ${targetState}`,
    );
  }
}

function assertGuardedGateway(
  net: TypedPetriNet,
  expectedAffectedRoles: string[],
): void {
  const yBranch = requireTransitionByFragments(net, [
    "Transition_gateway",
    "Gateway_1fcecxd",
    "Flow_1f47s0p",
  ]);
  const xBranch = requireTransitionByFragments(net, [
    "Transition_gateway",
    "Gateway_1fcecxd",
    "Flow_1yuxkqv",
  ]);
  assertOrdinaryArc(
    net,
    "Place_obj_ClassA",
    yBranch.id,
    "Expected guarded branch to read object binding",
  );
  for (const role of expectedAffectedRoles) {
    assertOrdinaryArc(
      net,
      `Place_state_${role}_ClassA_a_y`,
      yBranch.id,
      `Expected guarded branch to read ${role} guard state`,
    );
    assertOrdinaryArc(
      net,
      `Place_state_${role}_ClassA_a_x`,
      xBranch.id,
      `Expected guarded branch to read alternative ${role} guard state`,
    );
  }
  assertNoUnexpectedGuardStateReads(net, yBranch.id, expectedAffectedRoles);
  assertNoUnexpectedGuardStateReads(net, xBranch.id, expectedAffectedRoles);
  assertPlace(net, "Place_state_RoleA_ClassA_a_x");
  assertPlace(net, "Place_state_RoleA_ClassA_a_y");
}

function assertNoUnexpectedGuardStateReads(
  net: TypedPetriNet,
  transitionId: string,
  expectedAffectedRoles: string[],
): void {
  const expected = new Set(expectedAffectedRoles);
  const unexpectedRoles = net.arcs
    .filter(
      (arc) =>
        arc.kind === "ordinary" &&
        arc.targetId === transitionId &&
        /^Place_state_.*_ClassA_a_[xy]$/.test(arc.sourceId),
    )
    .map((arc) => /^Place_state_(.*)_ClassA_a_[xy]$/.exec(arc.sourceId)?.[1])
    .filter((role): role is string => role !== undefined)
    .filter((role) => !expected.has(role));

  assert.deepEqual(
    [...new Set(unexpectedRoles)].sort(),
    [],
    `Expected guarded gateway ${transitionId} not to read unaffected role state`,
  );
}

function assertParallelGateway(net: TypedPetriNet): void {
  assert.equal(
    countTransitions(net, "Transition_parallel"),
    2,
    "Expected parallel split and join transitions to be lifted",
  );
  ["ClassA", "ClassB", "ClassC"].forEach((className) =>
    assertCaseSpecificCreation(net, className),
  );
}

function assertLoopStructure(net: TypedPetriNet): void {
  assert.ok(
    countTransitions(net, "Transition_gateway") >= 1 ||
      countTransitions(net, "Transition_send") >= 1,
    "Expected typed control-flow structure for loop scenario",
  );
  assert.ok(
    net.arcs.some(
      (arc) =>
        arc.kind === "ordinary" &&
        arc.sourceId.startsWith("Transition_gateway") &&
        arc.targetId.startsWith("Place_cf_"),
    ),
    "Expected loop scenario gateway transitions to write typed control-flow",
  );
}

function assertEventBasedLoop(net: TypedPetriNet): void {
  assertLoopStructure(net);
  assert.ok(
    countTransitions(net, "Transition_gateway_Gateway_0ieg9pj") >= 2,
    "Expected event-based loop gateway alternatives to be lifted",
  );
  assert.ok(
    countTransitions(net, "Transition_task") >= 2 ||
      (countTransitions(net, "Transition_send") >= 2 &&
        countTransitions(net, "Transition_receive") >= 2),
    "Expected event-based loop tasks to be lifted into typed task transitions",
  );
}

function assertExclusiveGatewayLoop(net: TypedPetriNet): void {
  assertLoopStructure(net);
  assertTransitionExists(net, ["Transition_gateway", "Gateway_1fcecxd"]);
  assertLocalStateChange(net, "RoleA", "ClassA", "a_z", "a_y");
  assertLocalStateChange(net, "RoleA", "ClassA", "a_z", "a_x");
  assertSynchronizedSourceVariants(net, ["a_x", "a_y"], "a_z");
}

function assertGatewayCaseVariablePreservation(net: TypedPetriNet): void {
  const gatewayTransitions = net.transitions.filter((transition) =>
    isGatewayTransitionId(transition.id),
  );
  const parallelJoins = gatewayTransitions.filter(
    (transition) =>
      transition.id.startsWith("Transition_parallel_") &&
      controlFlowInputArcs(net, transition.id).length > 1,
  );

  for (const transition of gatewayTransitions) {
    assert.equal(
      transition.freshVariables.some(
        (variable) =>
          variable.typeId === caseTypeId() || variable.variableId === "case",
      ),
      false,
      `Expected gateway transition ${transition.id} not to declare a fresh case variable`,
    );

    const controlFlowArcs = [
      ...controlFlowInputArcs(net, transition.id),
      ...controlFlowOutputArcs(net, transition.id),
    ];
    assert.ok(
      controlFlowArcs.length > 0,
      `Expected gateway transition ${transition.id} to have control-flow arcs`,
    );

    for (const arc of controlFlowArcs) {
      assert.deepEqual(
        arc.inscription.map((element) => ({
          typeId: element.typeId,
          variableId: element.variableId,
          isGenerated: Boolean(element.isGenerated),
        })),
        [{ typeId: caseTypeId(), variableId: "case", isGenerated: false }],
        `Expected gateway control-flow arc ${arc.sourceId} -> ${arc.targetId} to preserve the case variable`,
      );
    }
  }

  for (const join of parallelJoins) {
    assert.ok(
      controlFlowInputArcs(net, join.id).every((arc) =>
        arc.inscription.some(
          (element) =>
            element.typeId === caseTypeId() &&
            element.variableId === "case" &&
            !element.isGenerated,
        ),
      ),
      `Expected parallel join ${join.id} to require the same incoming case variable on all branches`,
    );
  }
}

function isGatewayTransitionId(transitionId: string): boolean {
  return (
    transitionId.startsWith("Transition_gateway_") ||
    transitionId.startsWith("Transition_parallel_") ||
    transitionId.startsWith("Transition_event_")
  );
}

function controlFlowInputArcs(
  net: TypedPetriNet,
  transitionId: string,
): TypedArc[] {
  return net.arcs.filter(
    (arc) =>
      arc.kind === "ordinary" &&
      arc.targetId === transitionId &&
      arc.sourceId.startsWith("Place_cf_"),
  );
}

function controlFlowOutputArcs(
  net: TypedPetriNet,
  transitionId: string,
): TypedArc[] {
  return net.arcs.filter(
    (arc) =>
      arc.kind === "ordinary" &&
      arc.sourceId === transitionId &&
      arc.targetId.startsWith("Place_cf_"),
  );
}

function assertIntegratedScenario(
  scenario: EvaluationScenarioDefinition,
  net: TypedPetriNet,
): void {
  requireTypedIdentifierType(net, roleTypeId("Buyer"));
  assert.ok(
    net.places.some((place) => place.id.startsWith("Place_obj_")),
    "Expected integrated typed net to expose object identifier places",
  );

  if (scenario.id === "IS04") {
    assertPessimisticItemPurchaseCreation(net);
  }
}

function assertPessimisticItemPurchaseCreation(net: TypedPetriNet): void {
  const transition = requireTransitionByFragments(net, [
    "t_create_1to1",
    "Item",
    "Reservation",
  ]);

  assert.ok(
    transition.id.includes("Item") && transition.id.includes("Reservation"),
    "Expected pessimistic item purchase to lift grouped Item/Reservation creation",
  );

  const writesCaseSpecificBinding = net.arcs.some(
    (arc) =>
      arc.kind === "ordinary" &&
      arc.sourceId === transition.id &&
      arc.targetId === "Place_obj_Item",
  );

  if (!writesCaseSpecificBinding) {
    assert.ok(
      net.arcs.some(
        (arc) =>
          arc.kind === "ordinary" &&
          arc.sourceId === transition.id &&
          arc.targetId.startsWith("Place_rel_"),
      ),
      "Expected cross-case grouped Item/Reservation creation to produce the association relation",
    );
  }
}

function hasTransition(net: TypedPetriNet, fragments: string[]): boolean {
  return net.transitions.some((transition) =>
    fragments.every((fragment) =>
      transition.id.includes(fragment.replace(/_/g, "_")),
    ),
  );
}

function countTransitions(net: TypedPetriNet, fragment: string): number {
  return net.transitions.filter((transition) =>
    transition.id.includes(fragment),
  ).length;
}

function assertPlace(net: TypedPetriNet, id: string): void {
  assert.ok(
    net.places.some((place) => place.id === id),
    `Expected typed place ${id}`,
  );
}

function requireTransitionByFragments(
  net: TypedPetriNet,
  fragments: string[],
): { id: string } {
  const transition = net.transitions.find((candidate) =>
    fragments.every((fragment) => candidate.id.includes(fragment)),
  );

  assert.ok(
    transition,
    `Expected typed transition containing ${fragments.join(", ")}`,
  );
  return transition;
}

function assertTransitionExists(net: TypedPetriNet, fragments: string[]): void {
  requireTransitionByFragments(net, fragments);
}

function assertLocalStateChange(
  net: TypedPetriNet,
  roleName: string,
  className: string,
  sourceState: string,
  targetState: string,
): void {
  const transition = requireTransitionByFragments(net, [
    "Transition_local",
    roleName,
    `${className}_${sourceState}_${targetState}`,
  ]);
  assertOrdinaryArc(
    net,
    `Place_state_${roleName}_${className}_${sourceState}`,
    transition.id,
    `Expected local transition to read ${roleName}.${className} ${sourceState}`,
  );
  assertOrdinaryArc(
    net,
    transition.id,
    `Place_state_${roleName}_${className}_${targetState}`,
    `Expected local transition to write ${roleName}.${className} ${targetState}`,
  );
}

function assertOrdinaryArc(
  net: TypedPetriNet,
  sourceId: string,
  targetId: string,
  message: string,
): void {
  assert.ok(
    net.arcs.some(
      (arc) =>
        arc.kind === "ordinary" &&
        arc.sourceId === sourceId &&
        arc.targetId === targetId,
    ),
    message,
  );
}

function assertInhibitorArc(
  net: TypedPetriNet,
  sourceId: string,
  targetId: string,
  message: string,
): void {
  assert.ok(
    net.arcs.some(
      (arc) =>
        arc.kind === "inhibitor" &&
        arc.sourceId === sourceId &&
        arc.targetId === targetId,
    ),
    message,
  );
}

function assertNoOrdinaryArc(
  net: TypedPetriNet,
  sourceId: string,
  targetId: string,
  message: string,
): void {
  assert.equal(
    net.arcs.some(
      (arc) =>
        arc.kind === "ordinary" &&
        arc.sourceId === sourceId &&
        arc.targetId === targetId,
    ),
    false,
    message,
  );
}

function objectTypeId(className: string): string {
  return `DataClass_Object_${className}`;
}
