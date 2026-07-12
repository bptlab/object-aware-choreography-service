import type {
  BsplMessageParameter,
  BsplMessageSchema,
  BsplProtocol,
  BsplProtocolParameter,
} from "./bsplTypes.js";

export function serializeBspl(protocol: BsplProtocol): string {
  const keyParameterNames = new Set(
    protocol.parameters
      .filter((parameter) => parameter.key)
      .map((parameter) => parameter.name),
  );

  return `${protocol.name} {
  roles ${protocol.roles.join(", ")}
  parameters ${protocol.parameters
    .filter((parameter) => !parameter.private)
    .map(formatProtocolParameter)
    .join(", ")}
  ${formatPrivateParameters(protocol.parameters)}
  ${protocol.messages
    .map((message) => formatMessage(message, keyParameterNames))
    .join("\n  ")}
}`;
}

function formatProtocolParameter(parameter: BsplProtocolParameter): string {
  return `${parameter.adornment} ${parameter.name}${parameter.key ? " key" : ""}`;
}

function formatPrivateParameters(parameters: BsplProtocolParameter[]): string {
  const privateParameters = parameters
    .filter((parameter) => parameter.private)
    .map((parameter) => parameter.name)
    .sort();

  if (privateParameters.length === 0) {
    return "";
  }

  return `private ${privateParameters.join(", ")}\n  `;
}

function formatMessage(
  message: BsplMessageSchema,
  keyParameterNames: Set<string>,
): string {
  return `${message.sender} -> ${message.receiver}: ${message.name} [${message.parameters
    .slice()
    .sort(compareMessageParameters)
    .map((parameter) => formatMessageParameter(parameter, keyParameterNames))
    .join(", ")}]`;
}

function formatMessageParameter(
  parameter: BsplMessageParameter,
  keyParameterNames: Set<string>,
): string {
  return `${parameter.adornment} ${parameter.name}${
    parameter.key || keyParameterNames.has(parameter.name) ? " key" : ""
  }`;
}

function compareMessageParameters(
  left: BsplMessageParameter,
  right: BsplMessageParameter,
): number {
  const keyParameterOrder = (parameter: BsplMessageParameter): number =>
    parameter.name === "case_id" || parameter.name === "q_case" || parameter.key
      ? 0
      : 1;
  const adornmentOrder = new Map([
    ["in", 0],
    ["out", 1],
    ["nil", 2],
  ]);

  return (
    keyParameterOrder(left) - keyParameterOrder(right) ||
    (adornmentOrder.get(left.adornment) ?? 0) -
      (adornmentOrder.get(right.adornment) ?? 0) ||
    left.name.localeCompare(right.name)
  );
}
