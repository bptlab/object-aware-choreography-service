import { buildObjectAwareChoreographyContext } from "../../shared/context/objectAwareChoreographyContext.js";
import { buildBspl } from "../../shared/mappings/objectAwareChoreographyToBspl/buildBspl.js";
import { serializeBspl } from "../../shared/targets/bspl/serialization.js";
import {
  generatedModelOutput,
  toolErrorOutput,
} from "../../shared/service/toolOutputs.js";
import {
  ToolIds,
  type ToolInput,
  type ToolResult,
} from "../../shared/service/toolTypes.js";

export async function generateBsplTool(
  input: ToolInput<typeof ToolIds.GenerateBspl>,
): Promise<ToolResult<typeof ToolIds.GenerateBspl>> {
  try {
    const context = await buildObjectAwareChoreographyContext(input);
    const result = buildBspl(context);
    const bspl = serializeBspl(result.protocol);

    return {
      toolId: ToolIds.GenerateBspl,
      outputs: [
        generatedModelOutput({
          kind: "generatedModel",
          format: "bspl",
          name: `${result.protocol.name}.bspl`,
          content: bspl,
          warnings: result.warnings,
          metadata: {
            warnings: result.warnings,
            summary: result.summary,
          },
      }),
    ],
    };
  } catch (error) {
    return {
      toolId: ToolIds.GenerateBspl,
      outputs: [
        toolErrorOutput({
          kind: "toolError",
          toolId: ToolIds.GenerateBspl,
          message:
            error instanceof Error
              ? error.message
              : "BSPL generation failed",
        }),
      ],
    };
  }
}
