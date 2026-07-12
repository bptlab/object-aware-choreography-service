import assert from "node:assert/strict";
export function requireProtocolName(protocol) {
    assert.ok(protocol.name, "Expected BSPL protocol name");
    return protocol.name;
}
export function requireRole(protocol, role) {
    const found = protocol.roles.find((candidate) => matches(role, candidate));
    assert.ok(found, `Expected BSPL role matching: ${matcherLabel(role)}`);
    return found;
}
export function expectRolesExactly(protocol, expected) {
    assert.deepEqual(protocol.roles, expected);
}
export function requirePublicParameter(protocol, parameterName) {
    const parameter = protocol.parameters.find((candidate) => !candidate.private && matches(parameterName, candidate.name));
    assert.ok(parameter, `Expected public BSPL parameter matching: ${matcherLabel(parameterName)}`);
    return parameter;
}
export function requirePrivateParameter(protocol, parameterName) {
    const parameter = protocol.parameters.find((candidate) => candidate.private && matches(parameterName, candidate.name));
    assert.ok(parameter, `Expected private BSPL parameter matching: ${matcherLabel(parameterName)}`);
    return parameter;
}
export function requireParameter(protocol, parameterName) {
    const parameter = protocol.parameters.find((candidate) => matches(parameterName, candidate.name));
    assert.ok(parameter, `Expected BSPL parameter matching: ${matcherLabel(parameterName)}`);
    return parameter;
}
export function expectNoParameter(protocol, parameterName) {
    const parameter = protocol.parameters.find((candidate) => matches(parameterName, candidate.name));
    assert.equal(parameter, undefined, `Expected no BSPL parameter matching: ${matcherLabel(parameterName)}`);
}
export function requireMessages(protocol, query) {
    const messages = getMessages(protocol, query);
    assert.ok(messages.length > 0, `Expected at least one BSPL message matching: ${messageQueryLabel(query)}`);
    return messages;
}
export function requireMessage(protocol, query) {
    const messages = requireMessages(protocol, query);
    assert.ok(messages.length === 1, `Expected exactly one BSPL message matching: ${messageQueryLabel(query)}`);
    return messages[0];
}
export function requireOnlyMessage(protocol, query) {
    const messages = getMessages(protocol, query);
    assert.equal(messages.length, 1, `Expected exactly one BSPL message matching ${messageQueryLabel(query)}, found ${messages.length}`);
    return messages[0];
}
export function expectNoMessage(protocol, query) {
    const messages = getMessages(protocol, query);
    assert.equal(messages.length, 0, `Expected no BSPL message matching: ${messageQueryLabel(query)}`);
}
export function expectMessageHasParameter(protocol, query, parameter) {
    const message = requireMessage(protocol, query);
    assert.ok(hasMessageParameter(message, parameter), `Expected message ${message.name} to contain ${parameter.adornment} ${parameter.name}`);
}
export function requireMessageParameter(message, parameter) {
    const found = message.parameters.find((candidate) => candidate.name === parameter.name &&
        candidate.adornment === parameter.adornment);
    assert.ok(found, `Expected message ${message.name} to contain ${parameter.adornment} ${parameter.name}`);
    return found;
}
export function expectMessageParameterAbsent(message, parameter) {
    const found = message.parameters.find((candidate) => candidate.name === parameter.name &&
        candidate.adornment === parameter.adornment);
    assert.equal(found, undefined, `Expected message ${message.name} not to contain ${parameter.adornment} ${parameter.name}`);
}
export function expectMessageDoesNotHaveParameter(protocol, query, parameter) {
    const message = requireMessage(protocol, query);
    assert.equal(hasMessageParameter(message, parameter), false, `Expected message ${message.name} not to contain ${parameter.adornment} ${parameter.name}`);
}
export function expectOnlyPublicParameters(protocol, expected) {
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
export function expectAllUsedParametersDeclared(protocol) {
    const declared = new Set(protocol.parameters.map((parameter) => parameter.name));
    const used = new Set(protocol.messages.flatMap((message) => message.parameters.map((parameter) => parameter.name)));
    const missing = [...used].filter((parameter) => !declared.has(parameter));
    assert.deepEqual(missing, [], "Expected every used BSPL parameter declared");
}
export function expectEveryRoleUsedInMessage(protocol) {
    const usedRoles = new Set(protocol.messages.flatMap((message) => [message.sender, message.receiver]));
    const unusedRoles = protocol.roles.filter((role) => !usedRoles.has(role));
    assert.deepEqual(unusedRoles, [], "Expected every BSPL role to be used");
}
export function expectProtocolDoesNotContainRawBpmnIds(protocol) {
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
        assert.doesNotMatch(value, /\b(?:ChoreographyTask|Participant|MessageFlow|Flow|Gateway|Event)_[A-Za-z0-9]+\b/);
    }
}
export function expectNoUnqualifiedAttributeParameters(protocol, attributeNames) {
    const allParameterNames = new Set([
        ...protocol.parameters.map((parameter) => parameter.name),
        ...protocol.messages.flatMap((message) => message.parameters.map((parameter) => parameter.name)),
    ]);
    const unqualified = attributeNames.filter((name) => allParameterNames.has(name));
    assert.deepEqual(unqualified, [], "Expected no unqualified BSPL attribute parameters");
}
export function expectParameterNamingScheme(protocol) {
    const ignored = new Set(["case_id", "completed"]);
    const invalid = protocol.parameters
        .map((parameter) => parameter.name)
        .filter((name) => !ignored.has(name))
        .filter((name) => !isGeneratedParameterName(name));
    assert.deepEqual(invalid, [], "Expected generated BSPL parameters to use the naming scheme");
}
export function expectCompletionParameterProducedByTerminalMessage(protocol, messageName) {
    expectMessageHasParameter(protocol, { name: messageName }, { adornment: "out", name: "completed" });
}
export function expectProtocolHasMessage(protocol, messageName) {
    requireMessage(protocol, { name: messageName });
}
export function expectProtocolHasParameter(protocol, parameterName) {
    requireParameter(protocol, parameterName);
}
function getMessages(protocol, query) {
    return protocol.messages.filter((message) => matchesMessageQuery(message, query));
}
function matchesMessageQuery(message, query) {
    return ((query.name === undefined || matches(query.name, message.name)) &&
        (query.sender === undefined || matches(query.sender, message.sender)) &&
        (query.receiver === undefined ||
            matches(query.receiver, message.receiver)) &&
        (query.parameters ?? []).every((parameter) => hasMessageParameter(message, parameter)));
}
export function hasMessageParameter(message, parameter) {
    return message.parameters.some((candidate) => candidate.name === parameter.name &&
        candidate.adornment === parameter.adornment);
}
function isGeneratedParameterName(name) {
    return (/^task_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
        /^attribute_[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
        /^state_[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
        /^cf_(?:prec|excl)_[a-z0-9]+(?:-[a-z0-9]+)*(?:_(?:before_)?[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(name));
}
function matches(matcher, value) {
    return typeof matcher === "string" ? value === matcher : matcher.test(value);
}
function matcherLabel(matcher) {
    return typeof matcher === "string" ? matcher : matcher.toString();
}
function messageQueryLabel(query) {
    return JSON.stringify({
        name: query.name ? matcherLabel(query.name) : undefined,
        sender: query.sender ? matcherLabel(query.sender) : undefined,
        receiver: query.receiver ? matcherLabel(query.receiver) : undefined,
        parameters: query.parameters,
    });
}
export function expectWellFormedProtocol(protocol) {
    expectAllUsedParametersDeclared(protocol);
    expectEveryRoleUsedInMessage(protocol);
    expectParameterNamingScheme(protocol);
    expectOnlyPublicParameters(protocol, [
        { name: "case_id", key: true },
        { name: "completed", key: false },
    ]);
    getMessages(protocol, {}).forEach((message) => {
        assert.ok(hasMessageParameter(message, { adornment: "out", name: "case_id" }) ||
            hasMessageParameter(message, { adornment: "in", name: "case_id" }), `Expected message ${message.name} to contain case_id parameter with in or out adornment`);
    });
    requireMessages(protocol, {
        parameters: [{ adornment: "out", name: "completed" }],
    });
}
export function expectHasViolatingTrace(constraint) {
    assert.ok(constraint.violatingTraces.length > 0, `Expected ${constraint.kind} constraint to reference at least one violating trace`);
}
export function requirePrecedence(result, predecessor, constrained) {
    const constraint = result.constraints.find((candidate) => candidate.kind === "precedence" &&
        candidate.predecessor === predecessor &&
        candidate.constrained === constrained);
    assert.ok(constraint, `Expected precedence constraint ${predecessor} before ${constrained}`);
    return constraint;
}
export function expectNoPrecedence(result, predecessor, constrained) {
    const constraint = result.constraints.find((candidate) => candidate.kind === "precedence" &&
        candidate.predecessor === predecessor &&
        candidate.constrained === constrained);
    assert.equal(constraint, undefined, `Expected no precedence constraint ${predecessor} before ${constrained}`);
}
export function requireDisjunctivePrecedence(result, alternatives, constrained) {
    const expected = new Set(alternatives);
    const constraint = result.constraints.find((candidate) => {
        if (candidate.kind !== "disjunctivePrecedence") {
            return false;
        }
        return (candidate.constrained === constrained &&
            candidate.alternatives.length === alternatives.length &&
            candidate.alternatives.every((task) => expected.has(task)));
    });
    assert.ok(constraint, `Expected disjunctive precedence ${alternatives.join(" or ")} before ${constrained}`);
    return constraint;
}
export function requireExclusion(result, taskA, taskB) {
    const expected = new Set([taskA, taskB]);
    const constraint = result.constraints.find((candidate) => {
        if (candidate.kind !== "exclusion") {
            return false;
        }
        return (candidate.tasks.length === 2 &&
            candidate.tasks.every((task) => expected.has(task)));
    });
    assert.ok(constraint, `Expected exclusion constraint between ${taskA} and ${taskB}`);
    return constraint;
}
export function expectNoExclusion(result, taskA, taskB) {
    const expected = new Set([taskA, taskB]);
    const constraint = result.constraints.find((candidate) => {
        if (candidate.kind !== "exclusion") {
            return false;
        }
        return (candidate.tasks.length === 2 &&
            candidate.tasks.every((task) => expected.has(task)));
    });
    assert.equal(constraint, undefined, `Expected no exclusion constraint between ${taskA} and ${taskB}`);
}
export function requireGuardInformation(result, query) {
    const constraint = result.constraints.find((candidate) => {
        if (candidate.kind !== "guardInformation") {
            return false;
        }
        return ((query.guardedTask === undefined ||
            candidate.guardedTask === query.guardedTask) &&
            (query.objectClass === undefined ||
                candidate.objectClass === query.objectClass) &&
            (query.objectState === undefined ||
                matches(query.objectState, candidate.objectState)));
    });
    assert.ok(constraint, `Expected guard-information constraint matching ${JSON.stringify(query)}`);
    return constraint;
}
export function createIndependentProtocol(tasks) {
    return {
        name: "refinement-test",
        roles: ["RoleA", "RoleB"],
        parameters: tasks.map((task) => ({
            name: `${task.toLowerCase()}_done`,
            adornment: "out",
            private: true,
        })),
        messages: tasks.map((task) => ({
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
        })),
    };
}
export function createPrecedenceConstraint(predecessor, constrained) {
    return {
        kind: "precedence",
        id: `precedence:${predecessor}->${constrained}`,
        predecessor,
        constrained,
        source: createConstraintSource("sequence"),
        violatingTraces: [],
    };
}
export function createDisjunctivePrecedenceConstraint(alternatives, constrained) {
    return {
        kind: "disjunctivePrecedence",
        id: `disjunctivePrecedence:${alternatives.join("|")}->${constrained}`,
        alternatives,
        constrained,
        source: createConstraintSource("exclusiveJoin"),
        violatingTraces: [],
    };
}
export function createExclusionConstraint(taskA, taskB) {
    return {
        kind: "exclusion",
        id: `exclusion:${taskA}!${taskB}`,
        tasks: [taskA, taskB],
        source: createConstraintSource("exclusiveSplit"),
        violatingTraces: [],
    };
}
export function createGuardInformationConstraint(guardedTask, args) {
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
export function expectNoTraceContainsBoth(traces, taskA, taskB) {
    assert.ok(traces.every((trace) => !(trace.includes(taskA) && trace.includes(taskB))), `Expected no trace to contain both ${taskA} and ${taskB}`);
}
function createConstraintSource(reason) {
    return {
        reason,
        explanation: "test constraint",
    };
}
