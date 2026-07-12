import assert from "node:assert/strict";
import type {
  BsplMessageSchema,
  BsplProtocol,
} from "../../src/shared/targets/bspl/bsplTypes.js";
import * as bsplAssertions from "./bsplAssertions.js";

export function expectMessagesForVisibleTasks(
  protocol: { messages: Array<{ name: string }> } & BsplProtocol,
  taskNames: string[],
): void {
  for (const taskName of taskNames) {
    // requireMessages asserts at least one matching message (allows duplicates)
    bsplAssertions.requireMessages(protocol, { name: taskName });
  }
}

export function requireMessage(
  protocol: { messages: Array<BsplMessageSchema> } & BsplProtocol,
  messageName: string,
): BsplMessageSchema {
  // Return the first matching message (original test expected this behavior)
  const messages = bsplAssertions.requireMessages(protocol, {
    name: messageName,
  });
  return messages[0];
}

export function requireMessages(
  protocol: { messages: Array<BsplMessageSchema> } & BsplProtocol,
  messageName: string,
): BsplMessageSchema[] {
  return bsplAssertions.requireMessages(protocol, { name: messageName });
}

export function requirePrivateProtocolParameter(
  protocol: BsplProtocol,
  parameterName: string,
): void {
  bsplAssertions.requirePrivateParameter(protocol, parameterName);
}

export function requireDiscoveredExclusion(
  constraints: Array<any>,
  taskA: string,
  taskB: string,
) {
  const expected = new Set([taskA, taskB]);
  const exclusion = constraints.find(
    (constraint) =>
      constraint.kind === "exclusion" &&
      constraint.tasks?.every((task: string) => expected.has(task)),
  );

  assert.ok(exclusion, `Expected exclusion between ${taskA} and ${taskB}`);
  return exclusion;
}

export function requireDiscoveredPrecedence(
  constraints: Array<any>,
  predecessor: string,
  constrained: string,
): void {
  assert.ok(
    constraints.some(
      (constraint) =>
        constraint.kind === "precedence" &&
        constraint.predecessor === predecessor &&
        constraint.constrained === constrained,
    ),
    `Expected precedence ${predecessor} before ${constrained}`,
  );
}

export function expectNoDiscoveredPrecedence(
  constraints: Array<any>,
  predecessor: string,
  constrained: string,
): void {
  assert.equal(
    constraints.some(
      (constraint) =>
        constraint.kind === "precedence" &&
        constraint.predecessor === predecessor &&
        constraint.constrained === constrained,
    ),
    false,
    `Expected no precedence ${predecessor} before ${constrained}`,
  );
}

export function expectMessageParameter(
  message: BsplMessageSchema,
  adornment: string,
  name: string,
): void {
  bsplAssertions.requireMessageParameter(message, {
    adornment: adornment as any,
    name,
  });
}

export function expectNoMessageParameter(
  message: BsplMessageSchema,
  adornment: string,
  name: string,
): void {
  bsplAssertions.expectMessageParameterAbsent(message, {
    adornment: adornment as any,
    name,
  });
}

export function expectBsplWellFormed(protocol: BsplProtocol): void {
  bsplAssertions.expectWellFormedProtocol(protocol);
}

export function expectPetriNetContainsVisibleTasks(
  petriNetText: string,
  taskNames: string[],
): void {
  for (const taskName of taskNames) {
    assert.ok(
      petriNetText.includes(taskName),
      `Expected Petri net to contain visible task ${taskName}`,
    );
  }
}

export function expectPetriNetContainsObjectViewPlaces(
  petriNetText: string,
  expected: {
    roles: string[];
    classes: string[];
    states: string[];
  },
): void {
  for (const role of expected.roles) {
    assert.ok(
      petriNetText.includes(role),
      `Expected Petri net to contain local view information for role ${role}`,
    );
  }
  for (const objectClass of expected.classes) {
    assert.ok(
      petriNetText.includes(objectClass),
      `Expected Petri net to contain object-view places for class ${objectClass}`,
    );
  }
  for (const state of expected.states) {
    assert.ok(
      petriNetText.includes(state),
      `Expected Petri net to contain object-state awareness for state ${state}`,
    );
  }
}
