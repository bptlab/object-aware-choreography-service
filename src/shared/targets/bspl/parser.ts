import type {
  BsplAdornment,
  BsplMessageSchema,
  BsplProtocol,
  BsplProtocolParameter,
} from "./bsplTypes.js";

export function parseBspl(text: string): BsplProtocol {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const header = lines[0]?.match(/^([A-Za-z0-9_.-]+)\s*\{$/);

  if (!header) {
    throw new Error("Could not parse BSPL protocol header.");
  }

  const name = header[1];
  const roles: string[] = [];
  const parameters = new Map<string, BsplProtocolParameter>();
  const privateParameterNames = new Set<string>();
  const messages: BsplMessageSchema[] = [];

  for (const line of lines.slice(1)) {
    if (line === "}") {
      continue;
    }

    if (line.startsWith("roles ")) {
      roles.push(...parseCommaList(line.slice("roles ".length)));
      continue;
    }

    if (line.startsWith("parameters ")) {
      for (const parameter of parseProtocolParameters(
        line.slice("parameters ".length),
      )) {
        parameters.set(parameter.name, parameter);
      }
      continue;
    }

    if (line.startsWith("private ")) {
      for (const parameterName of parseCommaList(line.slice("private ".length))) {
        privateParameterNames.add(parameterName);
        parameters.set(parameterName, {
          name: parameterName,
          adornment: "out",
          private: true,
        });
      }
      continue;
    }

    const message = parseMessage(line, messages.length);
    messages.push(message);

    for (const parameter of message.parameters) {
      const protocolParameter = parameters.get(parameter.name);
      if (protocolParameter) {
        if (protocolParameter.key) {
          parameter.key = true;
        }
        if (parameter.key && !protocolParameter.private) {
          protocolParameter.key = true;
        }
      } else {
        parameters.set(parameter.name, {
          name: parameter.name,
          adornment: "out",
          private: privateParameterNames.has(parameter.name),
          key: parameter.key,
        });
      }
    }
  }

  return {
    name,
    roles,
    parameters: [...parameters.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    messages,
  };
}

function parseProtocolParameters(text: string): BsplProtocolParameter[] {
  if (text.trim().length === 0) {
    return [];
  }

  return parseCommaList(text).map((entry) => {
    const match = entry.match(/^out\s+([A-Za-z0-9_.-]+)(?:\s+key)?$/);

    if (!match) {
      throw new Error(`Could not parse BSPL protocol parameter "${entry}".`);
    }

    return {
      name: match[1],
      adornment: "out",
      key: /\skey$/.test(entry),
    };
  });
}

function parseMessage(line: string, index: number): BsplMessageSchema {
  const match = line.match(
    /^([A-Za-z0-9_.-]+)\s*->\s*([A-Za-z0-9_.-]+):\s*([A-Za-z0-9_.-]+)\s*\[(.*)\]$/,
  );

  if (!match) {
    throw new Error(`Could not parse BSPL message schema "${line}".`);
  }

  const [, sender, receiver, name, parameterText] = match;

  return {
    id: `${name}_${index}`,
    name,
    sender,
    receiver,
    taskId: name,
    parameters: parameterText.trim()
      ? parseCommaList(parameterText).map((entry) => {
          const parameterMatch = entry.match(
            /^(in|out|nil)\s+([A-Za-z0-9_.-]+)(?:\s+key)?$/,
          );

          if (!parameterMatch) {
            throw new Error(`Could not parse BSPL message parameter "${entry}".`);
          }

          return {
            adornment: parameterMatch[1] as BsplAdornment,
            name: parameterMatch[2],
            key: /\skey$/.test(entry),
          };
        })
      : [],
  };
}

function parseCommaList(text: string): string[] {
  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
