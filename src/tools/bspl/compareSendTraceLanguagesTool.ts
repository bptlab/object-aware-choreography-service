import { buildObjectAwareChoreographyContext } from "../../shared/context/objectAwareChoreographyContext.js";
import { compareChoreographyAndBsplBehavior } from "../../shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import { analysisReportOutput, toolErrorOutput } from "../../shared/service/toolOutputs.js";
import {
  ToolIds,
  type ToolInput,
  type ToolResult,
} from "../../shared/service/toolTypes.js";
import { parseBspl } from "../../shared/targets/bspl/parser.js";

export async function compareSendTraceLanguagesTool(
  input: ToolInput<typeof ToolIds.CompareSendTraceLanguages>,
): Promise<ToolResult<typeof ToolIds.CompareSendTraceLanguages>> {
  try {
    const context = await buildObjectAwareChoreographyContext(input);
    const protocol = parseBspl(input.bspl);
    const result = compareChoreographyAndBsplBehavior(context, protocol);

    return {
      toolId: ToolIds.CompareSendTraceLanguages,
      outputs: [
        analysisReportOutput({
          kind: "analysisReport",
          format: "json",
          content: result,
          report: result,
          metadata: {
            choreographyTraceCount: result.choreographyTraceCount,
            protocolTraceCount: result.protocolTraceCount,
            sharedTraceCount: result.sharedTraceCount,
            precision: result.precision,
            recall: result.recall,
          },
        }),
      ],
    };
  } catch (error) {
    return {
      toolId: ToolIds.CompareSendTraceLanguages,
      outputs: [
        toolErrorOutput({
          kind: "toolError",
          toolId: ToolIds.CompareSendTraceLanguages,
          message:
            error instanceof Error
              ? error.message
              : "Send-trace language comparison failed",
        }),
      ],
    };
  }
}
