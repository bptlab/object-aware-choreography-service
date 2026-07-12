import assert from "node:assert/strict";
import type { ObjectAwareChoreographyContext } from "../../src/shared/context/objectAwareChoreographyContext.js";
import type { LanguageComparisonResult } from "../../src/shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import { discoverControlFlowConstraints } from "../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";
import type { BsplProtocol } from "../../src/shared/targets/bspl/bsplTypes.js";
import {
  expectMessageParameterAbsent,
  expectWellFormedProtocol,
  requireGuardInformation,
  requireMessageParameter,
  requireMessages,
  requireParameter,
} from "../../test/assertions/bsplAssertions.js";
import type { EvaluationScenarioDefinition } from "../scenarios.js";

export function assertBsplMappingForScenario(
  scenario: EvaluationScenarioDefinition,
  protocol: BsplProtocol,
  context: ObjectAwareChoreographyContext,
  comparison?: LanguageComparisonResult,
): void {
  expectWellFormedProtocol(protocol);

  if (comparison) {
    assert.equal(
      comparison.recall,
      1,
      `Expected BSPL mapping recall 1 for ${scenario.id}`,
    );
    assert.ok(
      comparison.precision > 0 && comparison.precision <= 1,
      `Expected BSPL precision in (0, 1] for ${scenario.id}`,
    );
  }

  if (scenario.kind === "integrated") {
    assertIntegratedScenario(scenario, protocol);
    return;
  }

  switch (scenario.id) {
    case "CS01":
      assertNoObjectSequence(protocol);
      break;
    case "CS02":
      assertAlternativeInitialStates(protocol);
      break;
    case "CS03":
      assertOneToOneCreation(protocol);
      break;
    case "CS04":
      assertDirectedCreationDependency(protocol);
      break;
    case "CS05":
    case "CS06":
      assertIndependentBinaryCreation(protocol);
      break;
    case "CS07":
      assertMixedDependencyPropagation(protocol);
      break;
    case "CS08":
      assertLocalTransitionAndForwarding(protocol);
      break;
    case "CS09":
      assertMultipleCompatibleReceiverStates(protocol);
      break;
    case "CS10":
      assertMultiClassSynchronizationForwarding(protocol);
      break;
    case "CS11":
      assertMultipleSourceSynchronization(protocol);
      break;
    case "CS12":
      assertAlternativeTargetSignatures(protocol);
      break;
    case "CS13":
      assertCombinedSameClass(protocol);
      break;
    case "CS14":
      assertCombinedDifferentClasses(protocol);
      break;
    case "CS15":
      assertLocalNonCreationalDecision(protocol);
      break;
    case "CS16":
      assertGuardedExclusiveConstraints(protocol, context);
      break;
    case "CS18":
      assertParallelBranchConstraints(protocol, context);
      break;
    default:
      assert.fail(`Missing BSPL mapping assertion for ${scenario.id}`);
  }
}

function assertNoObjectSequence(protocol: BsplProtocol): void {
  const task1 = requireFirstMessage(protocol, "task1");
  const task2 = requireFirstMessage(protocol, "task2");

  requireMessageParameter(task1, {
    adornment: "out",
    name: "case_id",
  });
  requireMessageParameter(task1, {
    adornment: "out",
    name: "task_task1",
  });
  requireMessageParameter(task2, {
    adornment: "in",
    name: "case_id",
  });
  requireMessageParameter(task2, {
    adornment: "out",
    name: "completed",
  });
  requireMessageParameter(task2, {
    adornment: "out",
    name: "task_task2",
  });
}

function assertAlternativeInitialStates(protocol: BsplProtocol): void {
  const task2 = requireFirstMessage(protocol, "task2");
  const task3 = requireFirstMessage(protocol, "task3");

  requireMessageParameter(task2, {
    adornment: "out",
    name: "attribute_classa_a-id",
  });
  requireMessageParameter(task3, {
    adornment: "out",
    name: "attribute_classa_a-id",
  });
  requireMessageParameter(task2, {
    adornment: "out",
    name: "attribute_classa_att1",
  });
  requireMessageParameter(task3, {
    adornment: "out",
    name: "attribute_classa_att2",
  });
}

function assertOneToOneCreation(protocol: BsplProtocol): void {
  requireMessageParameter(requireFirstMessage(protocol, "task1"), {
    adornment: "out",
    name: "attribute_classa_a-id",
  });
  requireMessageParameter(requireFirstMessage(protocol, "task2"), {
    adornment: "out",
    name: "attribute_classb_b-id",
  });
  expectMessageParameterAbsent(requireFirstMessage(protocol, "task2"), {
    adornment: "in",
    name: "attribute_classa_a-id",
  });
}

function assertDirectedCreationDependency(protocol: BsplProtocol): void {
  requireMessageParameter(requireFirstMessage(protocol, "task2"), {
    adornment: "in",
    name: "attribute_classa_a-id",
  });
  requireMessageParameter(requireFirstMessage(protocol, "task2"), {
    adornment: "out",
    name: "attribute_classb_b-id",
  });
}

function assertIndependentBinaryCreation(protocol: BsplProtocol): void {
  requireMessageParameter(requireFirstMessage(protocol, "task2"), {
    adornment: "out",
    name: "attribute_classb_b-id",
  });
  expectMessageParameterAbsent(requireFirstMessage(protocol, "task2"), {
    adornment: "in",
    name: "attribute_classa_a-id",
  });
}

function assertMixedDependencyPropagation(protocol: BsplProtocol): void {
  requireMessageWithParameters(protocol, "task1", [
    { adornment: "out", name: "attribute_classa_a-id" },
  ]);
  requireMessageWithParameters(protocol, "task2", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "out", name: "attribute_classb_b-id" },
  ]);
  requireMessageWithParameters(protocol, "task3", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "out", name: "attribute_classc_c-id" },
    { adornment: "out", name: "completed" },
  ]);
}

function assertLocalTransitionAndForwarding(protocol: BsplProtocol): void {
  requireMessageWithParameters(protocol, "task1", [
    { adornment: "out", name: "attribute_classa_a-id" },
  ]);
  requireMessageWithParameters(protocol, "task2", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "out", name: "attribute_classa_att1" },
    { adornment: "out", name: "task_task2" },
  ]);
  requireMessageWithParameters(protocol, "task2", [
    { adornment: "in", name: "attribute_classa_att1" },
    { adornment: "out", name: "task_task2" },
  ]);
  requireMessageWithParameters(protocol, "task3", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "in", name: "attribute_classa_att1" },
    { adornment: "out", name: "task_task3" },
    { adornment: "out", name: "completed" },
  ]);
}

function assertMultipleCompatibleReceiverStates(protocol: BsplProtocol): void {
  requireMessageWithParameters(protocol, "task4", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "in", name: "attribute_classa_att1" },
    { adornment: "out", name: "attribute_classa_att3" },
  ]);
  requireMessageWithParameters(protocol, "task4", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "in", name: "attribute_classa_att2" },
    { adornment: "out", name: "attribute_classa_att3" },
  ]);
}

function assertMultiClassSynchronizationForwarding(
  protocol: BsplProtocol,
): void {
  const syncTask = requireFirstMessage(protocol, "sync-task");

  requireMessageParameter(syncTask, {
    adornment: "out",
    name: "state_classa_a-y",
  });
  requireMessageParameter(syncTask, {
    adornment: "out",
    name: "state_classb_b-y",
  });
}

function assertMultipleSourceSynchronization(protocol: BsplProtocol): void {
  requireMessageWithParameters(protocol, "sync-task", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "in", name: "attribute_classa_att1" },
    { adornment: "out", name: "state_classa_a-z" },
    { adornment: "out", name: "task_sync-task" },
  ]);
  requireMessageWithParameters(protocol, "sync-task", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "in", name: "attribute_classa_att2" },
    { adornment: "out", name: "state_classa_a-z" },
    { adornment: "out", name: "task_sync-task" },
  ]);
}

function assertAlternativeTargetSignatures(protocol: BsplProtocol): void {
  requireParameter(protocol, "state_classa_a-y");
  requireMessageWithParameters(protocol, "sync-task", [
    { adornment: "out", name: "attribute_classa_a-id" },
    { adornment: "out", name: "state_classa_a-y" },
    { adornment: "out", name: "task_sync-task" },
  ]);
  requireMessageWithParameters(protocol, "sync-task", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "out", name: "state_classa_a-y" },
    { adornment: "out", name: "task_sync-task" },
  ]);
  requireMessageWithParameters(protocol, "task2", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "out", name: "task_task2" },
    { adornment: "nil", name: "attribute_classa_att1" },
    { adornment: "nil", name: "state_classa_a-y" },
  ]);
  requireMessageWithParameters(protocol, "task3", [
    { adornment: "in", name: "state_classa_a-y" },
    { adornment: "out", name: "completed" },
  ]);
  requireMessageWithParameters(protocol, "task3", [
    { adornment: "out", name: "attribute_classa_att1" },
    { adornment: "out", name: "completed" },
  ]);
}

function assertCombinedSameClass(protocol: BsplProtocol): void {
  const message = requireFirstMessage(protocol, "sync-task");

  requireMessageParameter(message, {
    adornment: "out",
    name: "state_classa_a-y",
  });
  requireMessageParameter(message, {
    adornment: "out",
    name: "attribute_classa_a-id",
  });
}

function assertCombinedDifferentClasses(protocol: BsplProtocol): void {
  const message = requireFirstMessage(protocol, "sync-task");

  requireMessageParameter(message, {
    adornment: "in",
    name: "attribute_classa_a-id",
  });
  requireMessageParameter(message, {
    adornment: "out",
    name: "attribute_classb_b-id",
  });
  requireMessageParameter(message, {
    adornment: "out",
    name: "state_classa_a-y",
  });
}

function assertLocalNonCreationalDecision(protocol: BsplProtocol): void {
  requireMessageWithParameters(protocol, "task2", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "out", name: "attribute_classa_att1" },
    { adornment: "nil", name: "attribute_classa_att2" },
    { adornment: "out", name: "completed" },
  ]);
  requireMessageWithParameters(protocol, "task3", [
    { adornment: "in", name: "attribute_classa_a-id" },
    { adornment: "out", name: "attribute_classa_att2" },
    { adornment: "nil", name: "attribute_classa_att1" },
    { adornment: "out", name: "completed" },
  ]);
}

function assertGuardedExclusiveConstraints(
  protocol: BsplProtocol,
  context: ObjectAwareChoreographyContext,
): void {
  const discovery = discoverControlFlowConstraints(context, protocol);

  requireGuardInformation(discovery, {
    objectClass: "ClassA",
    objectState: /a-[xy]|a_[xy]/,
  });
}

function assertParallelBranchConstraints(
  protocol: BsplProtocol,
  context: ObjectAwareChoreographyContext,
): void {
  const discovery = discoverControlFlowConstraints(context, protocol);

  assert.ok(
    discovery.constraints.some(
      (constraint) =>
        constraint.kind === "precedence" ||
        constraint.kind === "disjunctivePrecedence",
    ),
    "Expected BSPL comparison to discover branch-completion constraints",
  );
}

function assertIntegratedScenario(
  scenario: EvaluationScenarioDefinition,
  protocol: BsplProtocol,
): void {
  assert.ok(protocol.roles.length >= 2, "Expected integrated protocol roles");
  assert.ok(
    protocol.messages.length >= 3,
    "Expected integrated protocol to include multiple messages",
  );
  assertCaseIdFirstInEveryMessage(protocol);

  if (scenario.id === "IS01") {
    assertOrderFulfillmentSynchronizedEffects(protocol);
  }
}

function assertOrderFulfillmentSynchronizedEffects(
  protocol: BsplProtocol,
): void {
  [
    "state_order_canceled",
    "state_order_fulfilled",
    "state_shipment-request_released",
    "state_shipment_delivered",
  ].forEach((parameterName) => requireParameter(protocol, parameterName));

  requireMessageWithParameters(protocol, "co-cancel-order", [
    { adornment: "in", name: "case_id" },
    { adornment: "in", name: "attribute_order_order-id" },
    { adornment: "in", name: "attribute_order_item" },
    { adornment: "nil", name: "attribute_order_accepted" },
    { adornment: "nil", name: "state_order_fulfilled" },
    { adornment: "out", name: "state_order_canceled" },
    { adornment: "out", name: "completed" },
    { adornment: "out", name: "task_co-cancel-order" },
  ]);
  requireMessageWithParameters(protocol, "co-cancel-order", [
    { adornment: "in", name: "case_id" },
    { adornment: "in", name: "attribute_order_order-id" },
    { adornment: "in", name: "attribute_order_item" },
    { adornment: "in", name: "attribute_order_accepted" },
    { adornment: "nil", name: "state_order_fulfilled" },
    { adornment: "out", name: "state_order_canceled" },
    { adornment: "out", name: "completed" },
    { adornment: "out", name: "task_co-cancel-order" },
  ]);

  requireMessageWithParameters(protocol, "rl-release-shipment", [
    { adornment: "in", name: "case_id" },
    { adornment: "in", name: "attribute_shipment-request_shipment-req-id" },
    { adornment: "in", name: "attribute_shipment-request_on-hold" },
    { adornment: "out", name: "state_shipment-request_released" },
    { adornment: "out", name: "task_rl-release-shipment" },
  ]);

  requireMessageWithParameters(protocol, "dg-deliver-goods", [
    { adornment: "in", name: "case_id" },
    { adornment: "in", name: "attribute_shipment-request_shipment-req-id" },
    { adornment: "in", name: "attribute_order_order-id" },
    { adornment: "in", name: "attribute_order_item" },
    { adornment: "nil", name: "attribute_order_accepted" },
    { adornment: "nil", name: "state_order_canceled" },
    { adornment: "out", name: "attribute_shipment_shipment-id" },
    { adornment: "out", name: "attribute_shipment_weight" },
    { adornment: "out", name: "state_shipment_delivered" },
    { adornment: "out", name: "state_order_fulfilled" },
    { adornment: "out", name: "completed" },
  ]);
  requireMessageWithParameters(protocol, "dg-deliver-goods", [
    { adornment: "in", name: "case_id" },
    { adornment: "in", name: "attribute_shipment-request_shipment-req-id" },
    { adornment: "in", name: "attribute_order_order-id" },
    { adornment: "in", name: "attribute_order_item" },
    { adornment: "in", name: "attribute_order_accepted" },
    { adornment: "nil", name: "state_order_canceled" },
    { adornment: "out", name: "attribute_shipment_shipment-id" },
    { adornment: "out", name: "attribute_shipment_weight" },
    { adornment: "out", name: "state_shipment_delivered" },
    { adornment: "out", name: "state_order_fulfilled" },
    { adornment: "out", name: "completed" },
  ]);

  // Initial BSPL generation intentionally leaves object-based gateway guards
  // relaxed; guard information is added by the constraint-discovery/refinement
  // pipeline.
  requireMessageWithParameters(protocol, "pd-report-planned-delivery", [
    { adornment: "in", name: "case_id" },
    { adornment: "out", name: "task_pd-report-planned-delivery" },
  ]);

  assertNoNilObjectCorrelationParameters(protocol);
}

function assertCaseIdFirstInEveryMessage(protocol: BsplProtocol): void {
  for (const message of protocol.messages) {
    assert.equal(
      message.parameters[0]?.name,
      "case_id",
      `Expected case_id to be the first parameter of ${message.name}`,
    );
  }
}

function assertNoNilObjectCorrelationParameters(protocol: BsplProtocol): void {
  const forbiddenNilParameters = new Set([
    "attribute_order_order-id",
    "attribute_shipment-request_shipment-req-id",
  ]);

  for (const message of protocol.messages) {
    for (const parameter of message.parameters) {
      assert.ok(
        parameter.adornment !== "nil" ||
          !forbiddenNilParameters.has(parameter.name),
        `Expected ${message.name} not to nil object-correlation parameter ${parameter.name}`,
      );
    }
  }
}

function requireFirstMessage(protocol: BsplProtocol, name: string) {
  return requireMessages(protocol, { name })[0];
}

function requireMessageWithParameters(
  protocol: BsplProtocol,
  name: string,
  parameters: Parameters<typeof requireMessageParameter>[1][],
): void {
  const message = requireMessages(protocol, { name }).find((candidate) =>
    parameters.every((parameter) =>
      candidate.parameters.some(
        (candidateParameter) =>
          candidateParameter.name === parameter.name &&
          candidateParameter.adornment === parameter.adornment &&
          (parameter.key === undefined ||
            candidateParameter.key === parameter.key),
      ),
    ),
  );

  assert.ok(
    message,
    `Expected BSPL message ${name} with parameters ${parameters
      .map((parameter) => `${parameter.adornment} ${parameter.name}`)
      .join(", ")}`,
  );
}
