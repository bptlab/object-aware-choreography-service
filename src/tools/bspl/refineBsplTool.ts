import {
  refineBsplWithControlFlowConstraints,
  type ControlFlowConstraint,
} from "../../shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";
import { generatedModelOutput, toolErrorOutput } from "../../shared/service/toolOutputs.js";
import {
  ToolIds,
  type RefineBsplInput,
  type ToolResult,
} from "../../shared/service/toolTypes.js";
import { parseBspl } from "../../shared/targets/bspl/parser.js";
import { serializeBspl } from "../../shared/targets/bspl/serialization.js";

export async function refineBsplTool(
  input: RefineBsplInput,
): Promise<ToolResult<typeof ToolIds.RefineBspl>> {
  try {
    const protocol = parseBspl(input.bspl);
    const constraints = parseConstraints(input.constraints);
    const refinedProtocol = refineBsplWithControlFlowConstraints(
      protocol,
      constraints,
    );
    const bspl = serializeBspl(refinedProtocol);

    return {
      toolId: ToolIds.RefineBspl,
      outputs: [
        generatedModelOutput({
          kind: "generatedModel",
          format: "bspl",
          name: `${refinedProtocol.name}.refined.bspl`,
          content: bspl,
          metadata: {
            constraints: constraints.length,
          },
      }),
    ],
    };
  } catch (error) {
    return {
      toolId: ToolIds.RefineBspl,
      outputs: [
        toolErrorOutput({
          kind: "toolError",
          toolId: ToolIds.RefineBspl,
          message:
            error instanceof Error ? error.message : "BSPL refinement failed",
        }),
      ],
    };
  }
}

function parseConstraints(input: unknown[] | string): ControlFlowConstraint[] {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  const constraints = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.constraints)
      ? parsed.constraints
      : undefined;

  if (!constraints) {
    throw new Error(
      'BSPL refinement constraints must be an array or an object with a "constraints" array.',
    );
  }

  constraints.forEach(validateConstraint);
  return constraints.map(normalizeConstraint) as ControlFlowConstraint[];
}

function validateConstraint(value: unknown): void {
  if (!isRecord(value) || typeof constraintKind(value) !== "string") {
    throw new Error(
      "BSPL refinement constraint is missing string field constraintType.",
    );
  }

  switch (constraintKind(value)) {
    case "precedence":
      requireStringField(value, "predecessor");
      requireStringField(value, "constrained");
      break;
    case "disjunctivePrecedence":
      requireStringArrayField(value, "alternatives");
      requireStringField(value, "constrained");
      break;
    case "exclusion":
      requireStringArrayField(value, "tasks");
      if ((value.tasks as unknown[]).length !== 2) {
        throw new Error("Exclusion constraints must reference exactly two tasks.");
      }
      break;
    case "guardInformation":
      requireStringField(value, "guardedTask");
      requireStringArrayField(value, "requiredIn");
      requireStringArrayField(value, "requiredNil");
      break;
    default:
      throw new Error(
        `Unsupported BSPL refinement constraint type "${constraintKind(value)}".`,
      );
  }
}

function normalizeConstraint(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return {
    ...value,
    kind: constraintKind(value),
  };
}

function constraintKind(value: Record<string, unknown>): unknown {
  return value.constraintType ?? value.kind;
}

function requireStringField(
  value: Record<string, unknown>,
  field: string,
): void {
  if (typeof value[field] !== "string") {
    throw new Error(`BSPL refinement constraint is missing string field ${field}.`);
  }
}

function requireStringArrayField(
  value: Record<string, unknown>,
  field: string,
): void {
  if (
    !Array.isArray(value[field]) ||
    !(value[field] as unknown[]).every((entry) => typeof entry === "string")
  ) {
    throw new Error(
      `BSPL refinement constraint is missing string array field ${field}.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
