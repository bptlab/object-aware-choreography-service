import { toolErrorOutput } from "./toolOutputs.js";
import type { ToolResult } from "./toolTypes.js";

export function unknownToolIdResult(toolId: string): ToolResult {
  return {
    toolId,
    outputs: [
      toolErrorOutput({
        kind: "toolError",
        toolId,
        message: `Unknown tool id "${toolId}"`,
      }),
    ],
  };
}
