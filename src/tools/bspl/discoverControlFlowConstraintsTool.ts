import { buildObjectAwareChoreographyContext } from "../../shared/context/objectAwareChoreographyContext.js";
import {
  discoverControlFlowConstraints,
  type ControlFlowConstraint,
} from "../../shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";
import { parseBspl } from "../../shared/targets/bspl/parser.js";
import {
  analysisReportOutput,
  toolErrorOutput,
} from "../../shared/service/toolOutputs.js";
import {
  ToolIds,
  type ToolInput,
  type ToolResult,
} from "../../shared/service/toolTypes.js";

export async function discoverControlFlowConstraintsTool(
  input: ToolInput<typeof ToolIds.DiscoverControlFlowConstraints>,
): Promise<ToolResult<typeof ToolIds.DiscoverControlFlowConstraints>> {
  try {
    const context = await buildObjectAwareChoreographyContext(input);
    const protocol = parseBspl(input.bspl);
    const result = discoverControlFlowConstraints(context, protocol);
    const editableConstraints = {
      constraints: result.constraints.map(toEditableConstraint),
    };

    return {
      toolId: ToolIds.DiscoverControlFlowConstraints,
      outputs: [
        analysisReportOutput({
          kind: "analysisReport",
          format: "json",
          content: editableConstraints,
          report: editableConstraints,
          metadata: {
            constraints: result.constraints.length,
            precision: result.comparison.precision,
            recall: result.comparison.recall,
          },
        }),
      ],
    };
  } catch (error) {
    return {
      toolId: ToolIds.DiscoverControlFlowConstraints,
      outputs: [
        toolErrorOutput({
          kind: "toolError",
          toolId: ToolIds.DiscoverControlFlowConstraints,
          message:
            error instanceof Error
              ? error.message
              : "Control-flow constraint discovery failed",
        }),
      ],
    };
  }
}

function toEditableConstraint(
  constraint: ControlFlowConstraint,
): Record<string, unknown> {
  switch (constraint.kind) {
    case "precedence":
      return {
        constraintType: "precedence",
        predecessor: constraint.predecessor,
        constrained: constraint.constrained,
      };
    case "disjunctivePrecedence":
      return {
        constraintType: "disjunctivePrecedence",
        alternatives: constraint.alternatives,
        constrained: constraint.constrained,
      };
    case "exclusion":
      return {
        constraintType: "exclusion",
        tasks: constraint.tasks,
      };
    case "guardInformation":
      return {
        constraintType: "guardInformation",
        guardedTask: constraint.guardedTask,
        requiredIn: constraint.requiredIn,
        requiredNil: constraint.requiredNil,
      };
  }
}
