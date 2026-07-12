import { sanitizeBsplIdentifierPart } from "../../../ids/sanitization.js";
import type {
  BsplMessageParameter,
  BsplMessageSchema,
  BsplProtocol,
} from "../../../targets/bspl/bsplTypes.js";
import type { ControlFlowConstraint } from "./index.js";

export function refineBsplWithControlFlowConstraints(
  protocol: BsplProtocol,
  constraints: ControlFlowConstraint[],
): BsplProtocol {
  const refined: BsplProtocol = {
    ...protocol,
    roles: [...protocol.roles],
    parameters: protocol.parameters.map((parameter) => ({ ...parameter })),
    messages: protocol.messages.map(cloneMessage),
  };

  for (const constraint of constraints) {
    switch (constraint.kind) {
      case "precedence":
        applyPrecedence(
          refined,
          constraint.predecessor,
          constraint.constrained,
        );
        break;
      case "disjunctivePrecedence":
        applyDisjunctivePrecedence(
          refined,
          constraint.alternatives,
          constraint.constrained,
        );
        break;
      case "exclusion":
        applyExclusion(refined, constraint.tasks);
        break;
      case "guardInformation":
        applyGuardInformation(refined, constraint);
        break;
    }
  }

  return refined;
}

function applyPrecedence(
  protocol: BsplProtocol,
  predecessor: string,
  constrained: string,
): void {
  const parameterName = precedenceParameterName(predecessor, constrained);
  const predecessorMessages = requireTaskMessages(protocol, predecessor);
  const constrainedMessages = requireTaskMessages(protocol, constrained);

  addPrivateProtocolParameter(protocol, parameterName);
  predecessorMessages.forEach((message) =>
    addMessageParameter(message, { adornment: "out", name: parameterName }),
  );
  constrainedMessages.forEach((message) =>
    addMessageParameter(message, { adornment: "in", name: parameterName }),
  );
}

function applyDisjunctivePrecedence(
  protocol: BsplProtocol,
  alternatives: string[],
  constrained: string,
): void {
  const constrainedMessages = requireTaskMessages(protocol, constrained);
  const alternativeParameters = alternatives
    .slice()
    .sort()
    .map((alternative) => ({
      task: alternative,
      parameterName: precedenceParameterName(alternative, constrained),
    }));

  for (const { task, parameterName } of alternativeParameters) {
    const messages = requireTaskMessages(protocol, task);

    addPrivateProtocolParameter(protocol, parameterName);
    messages.forEach((message) =>
      addMessageParameter(message, { adornment: "out", name: parameterName }),
    );
  }

  const alternativeParameterNames = new Set(
    alternativeParameters.map((alternative) => alternative.parameterName),
  );
  const replacementMessages: BsplMessageSchema[] = [];

  for (const message of protocol.messages) {
    if (!constrainedMessages.includes(message)) {
      replacementMessages.push(message);
      continue;
    }

    if (hasAnyMessageParameter(message, alternativeParameterNames)) {
      replacementMessages.push(message);
      continue;
    }

    for (const { task, parameterName } of alternativeParameters) {
      const replicated = cloneMessage(message);
      replicated.id = `${message.id}_cf_alt_${sanitizeControlFlowPart(task)}`;
      addMessageParameter(replicated, {
        adornment: "in",
        name: parameterName,
      });
      replacementMessages.push(replicated);
    }
  }

  protocol.messages = replacementMessages;
}

function applyExclusion(
  protocol: BsplProtocol,
  tasks: readonly [string, string],
): void {
  const [taskA, taskB] = [...tasks].sort();
  const parameterName = exclusionParameterName(taskA, taskB);
  const taskAMessages = requireTaskMessages(protocol, taskA);
  const taskBMessages = requireTaskMessages(protocol, taskB);

  addPrivateProtocolParameter(protocol, parameterName);
  [...taskAMessages, ...taskBMessages].forEach((message) =>
    addMessageParameter(message, { adornment: "out", name: parameterName }),
  );
}

function applyGuardInformation(
  protocol: BsplProtocol,
  constraint: Extract<ControlFlowConstraint, { kind: "guardInformation" }>,
): void {
  const guardedMessages = requireTaskMessages(protocol, constraint.guardedTask);
  const requiredInAlternatives = normalizeGuardInformationAlternatives(
    constraint,
  );

  for (const parameterName of [
    ...new Set(requiredInAlternatives.flat()),
    ...constraint.requiredNil,
  ]) {
    addPrivateProtocolParameter(protocol, parameterName);
  }

  if (requiredInAlternatives.length > 1) {
    const guardedMessageSet = new Set(guardedMessages);
    const replacementMessages: BsplMessageSchema[] = [];

    for (const message of protocol.messages) {
      if (!guardedMessageSet.has(message)) {
        replacementMessages.push(message);
        continue;
      }

      requiredInAlternatives.forEach((requiredIn, index) => {
        const replicated = cloneMessage(message);
        replicated.id = `${message.id}_guard_${index + 1}`;
        addGuardInformationToMessage(replicated, requiredIn, constraint.requiredNil);
        replacementMessages.push(replicated);
      });
    }

    protocol.messages = replacementMessages;
    return;
  }

  for (const message of guardedMessages) {
    addGuardInformationToMessage(
      message,
      requiredInAlternatives[0] ?? [],
      constraint.requiredNil,
    );
  }
}

function normalizeGuardInformationAlternatives(
  constraint: Extract<ControlFlowConstraint, { kind: "guardInformation" }>,
): string[][] {
  const alternatives =
    constraint.requiredInAlternatives && constraint.requiredInAlternatives.length > 0
      ? constraint.requiredInAlternatives
      : [constraint.requiredIn];

  const normalized = alternatives
    .map((alternative) => [...new Set(alternative)].sort())
    .filter((alternative) => alternative.length > 0);

  return normalized.length > 0 ? normalized : [[]];
}

function addGuardInformationToMessage(
  message: BsplMessageSchema,
  requiredIn: string[],
  requiredNil: string[],
): void {
  requiredIn.forEach((parameterName) =>
    addMessageParameter(message, { adornment: "in", name: parameterName }),
  );
  requiredNil.forEach((parameterName) =>
    addMessageParameter(message, { adornment: "nil", name: parameterName }),
  );
}

function requireTaskMessages(
  protocol: BsplProtocol,
  taskLabel: string,
): BsplMessageSchema[] {
  const messages = protocol.messages.filter(
    (message) => message.name === taskLabel || message.taskId === taskLabel,
  );

  if (messages.length === 0) {
    throw new Error(
      `Unknown task/message label "${taskLabel}" referenced by BSPL refinement constraint.`,
    );
  }

  return messages;
}

function addPrivateProtocolParameter(
  protocol: BsplProtocol,
  parameterName: string,
): void {
  const existing = protocol.parameters.find(
    (parameter) => parameter.name === parameterName,
  );

  if (!existing) {
    protocol.parameters.push({
      name: parameterName,
      adornment: "out",
      private: true,
    });
    protocol.parameters.sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    return;
  }

  if (!existing.private) {
    throw new Error(
      `Cannot add private refinement parameter "${parameterName}" because it is already public.`,
    );
  }
}

function addMessageParameter(
  message: BsplMessageSchema,
  parameter: BsplMessageParameter,
): void {
  const existing = message.parameters.find(
    (candidate) => candidate.name === parameter.name,
  );

  if (!existing) {
    message.parameters.push({ ...parameter });
    return;
  }

  if (existing.adornment !== parameter.adornment) {
    throw new Error(
      `Cannot add ${parameter.adornment} ${parameter.name} to message ${message.name}; it already appears as ${existing.adornment}.`,
    );
  }
}

function hasAnyMessageParameter(
  message: BsplMessageSchema,
  parameterNames: Set<string>,
): boolean {
  return message.parameters.some((parameter) =>
    parameterNames.has(parameter.name),
  );
}

function precedenceParameterName(
  predecessor: string,
  constrained: string,
): string {
  return [
    "cf",
    "prec",
    sanitizeControlFlowPart(predecessor),
    "before",
    sanitizeControlFlowPart(constrained),
  ].join("_");
}

function exclusionParameterName(taskA: string, taskB: string): string {
  return [
    "cf",
    "excl",
    sanitizeControlFlowPart(taskA),
    sanitizeControlFlowPart(taskB),
  ].join("_");
}

function sanitizeControlFlowPart(value: string): string {
  return sanitizeBsplIdentifierPart(value, "task");
}

function cloneMessage(message: BsplMessageSchema): BsplMessageSchema {
  return {
    ...message,
    parameters: message.parameters.map((parameter) => ({ ...parameter })),
  };
}
