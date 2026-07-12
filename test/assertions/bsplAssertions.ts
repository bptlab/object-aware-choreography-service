import assert from "node:assert/strict";
import type { SendTrace } from "../../src/shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import type {
  BsplMessageParameter,
  BsplMessageSchema,
  BsplProtocol,
  BsplProtocolParameter,
} from "../../src/shared/targets/bspl/bsplTypes.js";
import type {
  ControlFlowConstraint,
  ControlFlowConstraintDiscoveryResult,
} from "../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";

type DiscoveryResult = ControlFlowConstraintDiscoveryResult;
type DiscoveredConstraint = ControlFlowConstraint;
type PrecedenceConstraint = Extract<
  DiscoveredConstraint,
  { kind: "precedence" }
>;
type DisjunctivePrecedenceConstraint = Extract<
  DiscoveredConstraint,
  { kind: "disjunctivePrecedence" }
>;
type ExclusionConstraint = Extract<DiscoveredConstraint, { kind: "exclusion" }>;
type GuardInformationConstraint = Extract<
  DiscoveredConstraint,
  { kind: "guardInformation" }
>;
export type Matcher = string | RegExp;

type MessageQuery = {
  name?: Matcher;
  sender?: Matcher;
  receiver?: Matcher;
  parameters?: BsplMessageParameter[];
};

type ExpectedPublicParameter = {
  name: string;
  adornment?: "out";
  key?: boolean;
};

export function requireProtocolName(protocol: BsplProtocol): string {
  assert.ok(protocol.name, "Expected BSPL protocol name");
  return protocol.name;
}

export function requireRole(protocol: BsplProtocol, role: Matcher): string {
  const found = protocol.roles.find((candidate) => matches(role, candidate));

  assert.ok(found, `Expected BSPL role matching: ${matcherLabel(role)}`);
  return found;
}

export function expectRolesExactly(
  protocol: BsplProtocol,
  expected: string[],
): void {
  assert.deepEqual(protocol.roles, expected);
}

export function requirePublicParameter(
  protocol: BsplProtocol,
  parameterName: Matcher,
): BsplProtocolParameter {
  const parameter = protocol.parameters.find(
    (candidate) => !candidate.private && matches(parameterName, candidate.name),
  );

  assert.ok(
    parameter,
    `Expected public BSPL parameter matching: ${matcherLabel(parameterName)}`,
  );
  return parameter;
}

export function requirePrivateParameter(
  protocol: BsplProtocol,
  parameterName: Matcher,
): BsplProtocolParameter {
  const parameter = protocol.parameters.find(
    (candidate) => candidate.private && matches(parameterName, candidate.name),
  );

  assert.ok(
    parameter,
    `Expected private BSPL parameter matching: ${matcherLabel(parameterName)}`,
  );
  return parameter;
}

export function requireParameter(
  protocol: BsplProtocol,
  parameterName: Matcher,
): BsplProtocolParameter {
  const parameter = protocol.parameters.find((candidate) =>
    matches(parameterName, candidate.name),
  );

  assert.ok(
    parameter,
    `Expected BSPL parameter matching: ${matcherLabel(parameterName)}`,
  );
  return parameter;
}

export function expectNoParameter(
  protocol: BsplProtocol,
  parameterName: Matcher,
): void {
  const parameter = protocol.parameters.find((candidate) =>
    matches(parameterName, candidate.name),
  );

  assert.equal(
    parameter,
    undefined,
    `Expected no BSPL parameter matching: ${matcherLabel(parameterName)}`,
  );
}

export function requireMessages(
  protocol: BsplProtocol,
  query: MessageQuery,
): BsplMessageSchema[] {
  const messages = getMessages(protocol, query);

  assert.ok(
    messages.length > 0,
    `Expected at least one BSPL message matching: ${messageQueryLabel(query)}`,
  );

  return messages;
}

export function requireMessage(
  protocol: BsplProtocol,
  query: MessageQuery,
): BsplMessageSchema {
  const messages = requireMessages(protocol, query);

  assert.ok(
    messages.length === 1,
    `Expected exactly one BSPL message matching: ${messageQueryLabel(query)}`,
  );

  return messages[0];
}

export function requireOnlyMessage(
  protocol: BsplProtocol,
  query: MessageQuery,
): BsplMessageSchema {
  const messages = getMessages(protocol, query);

  assert.equal(
    messages.length,
    1,
    `Expected exactly one BSPL message matching ${messageQueryLabel(
      query,
    )}, found ${messages.length}`,
  );
  return messages[0];
}

export function expectNoMessage(
  protocol: BsplProtocol,
  query: MessageQuery,
): void {
  const messages = getMessages(protocol, query);

  assert.equal(
    messages.length,
    0,
    `Expected no BSPL message matching: ${messageQueryLabel(query)}`,
  );
}

export function expectMessageHasParameter(
  protocol: BsplProtocol,
  query: MessageQuery,
  parameter: BsplMessageParameter,
): void {
  const message = requireMessage(protocol, query);

  assert.ok(
    hasMessageParameter(message, parameter),
    `Expected message ${message.name} to contain ${parameter.adornment} ${parameter.name}`,
  );
}

export function requireMessageParameter(
  message: BsplMessageSchema,
  parameter: BsplMessageParameter,
): BsplMessageParameter {
  const found = message.parameters.find(
    (candidate) =>
      candidate.name === parameter.name &&
      candidate.adornment === parameter.adornment,
  );

  assert.ok(
    found,
    `Expected message ${message.name} to contain ${parameter.adornment} ${parameter.name}`,
  );
  return found;
}

export function expectMessageParameterAbsent(
  message: BsplMessageSchema,
  parameter: BsplMessageParameter,
): void {
  const found = message.parameters.find(
    (candidate) =>
      candidate.name === parameter.name &&
      candidate.adornment === parameter.adornment,
  );

  assert.equal(
    found,
    undefined,
    `Expected message ${message.name} not to contain ${parameter.adornment} ${parameter.name}`,
  );
}

export function expectMessageDoesNotHaveParameter(
  protocol: BsplProtocol,
  query: MessageQuery,
  parameter: BsplMessageParameter,
): void {
  const message = requireMessage(protocol, query);

  assert.equal(
    hasMessageParameter(message, parameter),
    false,
    `Expected message ${message.name} not to contain ${parameter.adornment} ${parameter.name}`,
  );
}

export function expectOnlyPublicParameters(
  protocol: BsplProtocol,
  expected: ExpectedPublicParameter[],
): void {
  const publicParameters = protocol.parameters
    .filter((parameter) => !parameter.private)
    .map((parameter) => ({
      name: parameter.name,
      adornment: parameter.adornment,
      key: parameter.key === true,
    }));
  const normalizedExpected = expected.map((parameter) => ({
    name: parameter.name,
    adornment: parameter.adornment ?? "out",
    key: parameter.key === true,
  }));

  assert.deepEqual(publicParameters, normalizedExpected);
}

export function expectAllUsedParametersDeclared(protocol: BsplProtocol): void {
  const declared = new Set(
    protocol.parameters.map((parameter) => parameter.name),
  );
  const used = new Set(
    protocol.messages.flatMap((message) =>
      message.parameters.map((parameter) => parameter.name),
    ),
  );
  const missing = [...used].filter((parameter) => !declared.has(parameter));

  assert.deepEqual(missing, [], "Expected every used BSPL parameter declared");
}

export function expectEveryRoleUsedInMessage(protocol: BsplProtocol): void {
  const usedRoles = new Set(
    protocol.messages.flatMap((message) => [message.sender, message.receiver]),
  );
  const unusedRoles = protocol.roles.filter((role) => !usedRoles.has(role));

  assert.deepEqual(unusedRoles, [], "Expected every BSPL role to be used");
}

export function expectProtocolDoesNotContainRawBpmnIds(
  protocol: BsplProtocol,
): void {
  const values = [
    protocol.name,
    ...protocol.roles,
    ...protocol.parameters.map((parameter) => parameter.name),
    ...protocol.messages.flatMap((message) => [
      message.id,
      message.name,
      message.sender,
      message.receiver,
      message.taskId,
      ...message.parameters.map((parameter) => parameter.name),
    ]),
  ];

  for (const value of values) {
    assert.doesNotMatch(
      value,
      /\b(?:ChoreographyTask|Participant|MessageFlow|Flow|Gateway|Event)_[A-Za-z0-9]+\b/,
    );
  }
}

export function expectNoUnqualifiedAttributeParameters(
  protocol: BsplProtocol,
  attributeNames: string[],
): void {
  const allParameterNames = new Set([
    ...protocol.parameters.map((parameter) => parameter.name),
    ...protocol.messages.flatMap((message) =>
      message.parameters.map((parameter) => parameter.name),
    ),
  ]);
  const unqualified = attributeNames.filter((name) =>
    allParameterNames.has(name),
  );

  assert.deepEqual(
    unqualified,
    [],
    "Expected no unqualified BSPL attribute parameters",
  );
}

export function expectParameterNamingScheme(protocol: BsplProtocol): void {
  const ignored = new Set(["case_id", "completed"]);
  const invalid = protocol.parameters
    .map((parameter) => parameter.name)
    .filter((name) => !ignored.has(name))
    .filter((name) => !isGeneratedParameterName(name));

  assert.deepEqual(
    invalid,
    [],
    "Expected generated BSPL parameters to use the naming scheme",
  );
}

export function expectCompletionParameterProducedByTerminalMessage(
  protocol: BsplProtocol,
  messageName: Matcher,
): void {
  expectMessageHasParameter(
    protocol,
    { name: messageName },
    { adornment: "out", name: "completed" },
  );
}

export function expectProtocolHasMessage(
  protocol: BsplProtocol,
  messageName: string,
): void {
  requireMessage(protocol, { name: messageName });
}

export function expectProtocolHasParameter(
  protocol: BsplProtocol,
  parameterName: string,
): void {
  requireParameter(protocol, parameterName);
}

function getMessages(
  protocol: BsplProtocol,
  query: MessageQuery,
): BsplMessageSchema[] {
  return protocol.messages.filter((message) =>
    matchesMessageQuery(message, query),
  );
}

function matchesMessageQuery(
  message: BsplMessageSchema,
  query: MessageQuery,
): boolean {
  return (
    (query.name === undefined || matches(query.name, message.name)) &&
    (query.sender === undefined || matches(query.sender, message.sender)) &&
    (query.receiver === undefined ||
      matches(query.receiver, message.receiver)) &&
    (query.parameters ?? []).every((parameter) =>
      hasMessageParameter(message, parameter),
    )
  );
}

export function hasMessageParameter(
  message: BsplMessageSchema,
  parameter: BsplMessageParameter,
): boolean {
  return message.parameters.some(
    (candidate) =>
      candidate.name === parameter.name &&
      candidate.adornment === parameter.adornment,
  );
}

function isGeneratedParameterName(name: string): boolean {
  return (
    /^task_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
    /^attribute_[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      name,
    ) ||
    /^state_[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
    /^cf_(?:prec|excl)_[a-z0-9]+(?:-[a-z0-9]+)*(?:_(?:before_)?[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(
      name,
    )
  );
}

function matches(matcher: Matcher, value: string): boolean {
  return typeof matcher === "string" ? value === matcher : matcher.test(value);
}

function matcherLabel(matcher: Matcher): string {
  return typeof matcher === "string" ? matcher : matcher.toString();
}

function messageQueryLabel(query: MessageQuery): string {
  return JSON.stringify({
    name: query.name ? matcherLabel(query.name) : undefined,
    sender: query.sender ? matcherLabel(query.sender) : undefined,
    receiver: query.receiver ? matcherLabel(query.receiver) : undefined,
    parameters: query.parameters,
  });
}

export function expectWellFormedProtocol(protocol: BsplProtocol): void {
  expectAllUsedParametersDeclared(protocol);
  expectEveryRoleUsedInMessage(protocol);
  expectParameterNamingScheme(protocol);
  expectOnlyPublicParameters(protocol, [
    { name: "case_id", key: true },
    { name: "completed", key: false },
  ]);
  getMessages(protocol, {}).forEach((message) => {
    assert.ok(
      hasMessageParameter(message, { adornment: "out", name: "case_id" }) ||
        hasMessageParameter(message, { adornment: "in", name: "case_id" }),
      `Expected message ${message.name} to contain case_id parameter with in or out adornment`,
    );
  });
  requireMessages(protocol, {
    parameters: [{ adornment: "out", name: "completed" }],
  });
}

export function expectHasViolatingTrace(
  constraint: DiscoveredConstraint,
): void {
  assert.ok(
    constraint.violatingTraces.length > 0,
    `Expected ${constraint.kind} constraint to reference at least one violating trace`,
  );
}

export function requirePrecedence(
  result: DiscoveryResult,
  predecessor: string,
  constrained: string,
): PrecedenceConstraint {
  const constraint = result.constraints.find(
    (candidate): candidate is PrecedenceConstraint =>
      candidate.kind === "precedence" &&
      candidate.predecessor === predecessor &&
      candidate.constrained === constrained,
  );

  assert.ok(
    constraint,
    `Expected precedence constraint ${predecessor} before ${constrained}`,
  );
  return constraint;
}

export function expectNoPrecedence(
  result: DiscoveryResult,
  predecessor: string,
  constrained: string,
): void {
  const constraint = result.constraints.find(
    (candidate): candidate is PrecedenceConstraint =>
      candidate.kind === "precedence" &&
      candidate.predecessor === predecessor &&
      candidate.constrained === constrained,
  );

  assert.equal(
    constraint,
    undefined,
    `Expected no precedence constraint ${predecessor} before ${constrained}`,
  );
}

export function requireDisjunctivePrecedence(
  result: DiscoveryResult,
  alternatives: string[],
  constrained: string,
): DisjunctivePrecedenceConstraint {
  const expected = new Set(alternatives);
  const constraint = result.constraints.find(
    (candidate): candidate is DisjunctivePrecedenceConstraint => {
      if (candidate.kind !== "disjunctivePrecedence") {
        return false;
      }

      return (
        candidate.constrained === constrained &&
        candidate.alternatives.length === alternatives.length &&
        candidate.alternatives.every((task) => expected.has(task))
      );
    },
  );

  assert.ok(
    constraint,
    `Expected disjunctive precedence ${alternatives.join(
      " or ",
    )} before ${constrained}`,
  );
  return constraint;
}

export function requireExclusion(
  result: DiscoveryResult,
  taskA: string,
  taskB: string,
): ExclusionConstraint {
  const expected = new Set([taskA, taskB]);
  const constraint = result.constraints.find(
    (candidate): candidate is ExclusionConstraint => {
      if (candidate.kind !== "exclusion") {
        return false;
      }

      return (
        candidate.tasks.length === 2 &&
        candidate.tasks.every((task) => expected.has(task))
      );
    },
  );

  assert.ok(
    constraint,
    `Expected exclusion constraint between ${taskA} and ${taskB}`,
  );
  return constraint;
}

export function expectNoExclusion(
  result: DiscoveryResult,
  taskA: string,
  taskB: string,
): void {
  const expected = new Set([taskA, taskB]);
  const constraint = result.constraints.find((candidate) => {
    if (candidate.kind !== "exclusion") {
      return false;
    }

    return (
      candidate.tasks.length === 2 &&
      candidate.tasks.every((task) => expected.has(task))
    );
  });

  assert.equal(
    constraint,
    undefined,
    `Expected no exclusion constraint between ${taskA} and ${taskB}`,
  );
}

export function requireGuardInformation(
  result: DiscoveryResult,
  query: {
    guardedTask?: string;
    objectClass?: string;
    objectState?: string | RegExp;
  },
): GuardInformationConstraint {
  const constraint = result.constraints.find(
    (candidate): candidate is GuardInformationConstraint => {
      if (candidate.kind !== "guardInformation") {
        return false;
      }

      return (
        (query.guardedTask === undefined ||
          candidate.guardedTask === query.guardedTask) &&
        (query.objectClass === undefined ||
          candidate.objectClass === query.objectClass) &&
        (query.objectState === undefined ||
          matches(query.objectState, candidate.objectState))
      );
    },
  );

  assert.ok(
    constraint,
    `Expected guard-information constraint matching ${JSON.stringify(query)}`,
  );
  return constraint;
}

export function createIndependentProtocol(tasks: string[]): BsplProtocol {
  return {
    name: "refinement-test",
    roles: ["RoleA", "RoleB"],
    parameters: tasks.map((task) => ({
      name: `${task.toLowerCase()}_done`,
      adornment: "out",
      private: true,
    })),
    messages: tasks.map(
      (task): BsplMessageSchema => ({
        id: `m_${task}`,
        name: task,
        sender: "RoleA",
        receiver: "RoleB",
        taskId: task,
        parameters: [
          {
            adornment: "out",
            name: `${task.toLowerCase()}_done`,
          },
        ],
      }),
    ),
  };
}

export function createPrecedenceConstraint(
  predecessor: string,
  constrained: string,
): ControlFlowConstraint {
  return {
    kind: "precedence",
    id: `precedence:${predecessor}->${constrained}`,
    predecessor,
    constrained,
    source: createConstraintSource("sequence"),
    violatingTraces: [],
  };
}

export function createDisjunctivePrecedenceConstraint(
  alternatives: string[],
  constrained: string,
): ControlFlowConstraint {
  return {
    kind: "disjunctivePrecedence",
    id: `disjunctivePrecedence:${alternatives.join("|")}->${constrained}`,
    alternatives,
    constrained,
    source: createConstraintSource("exclusiveJoin"),
    violatingTraces: [],
  };
}

export function createExclusionConstraint(
  taskA: string,
  taskB: string,
): ControlFlowConstraint {
  return {
    kind: "exclusion",
    id: `exclusion:${taskA}!${taskB}`,
    tasks: [taskA, taskB],
    source: createConstraintSource("exclusiveSplit"),
    violatingTraces: [],
  };
}

export function createGuardInformationConstraint(
  guardedTask: string,
  args: { requiredIn: string[]; requiredNil: string[] },
): ControlFlowConstraint {
  return {
    kind: "guardInformation",
    id: `guardInformation:${guardedTask}`,
    guardedTask,
    objectClass: "ClassA",
    objectState: "a-x",
    requiredIn: args.requiredIn,
    requiredNil: args.requiredNil,
    source: createConstraintSource("guardedExclusiveSplit"),
    violatingTraces: [],
  };
}

export function expectNoTraceContainsBoth(
  traces: readonly SendTrace[],
  taskA: string,
  taskB: string,
): void {
  assert.ok(
    traces.every((trace) => !(trace.includes(taskA) && trace.includes(taskB))),
    `Expected no trace to contain both ${taskA} and ${taskB}`,
  );
}

function createConstraintSource(
  reason: ControlFlowConstraint["source"]["reason"],
): ControlFlowConstraint["source"] {
  return {
    reason,
    explanation: "test constraint",
  };
}
