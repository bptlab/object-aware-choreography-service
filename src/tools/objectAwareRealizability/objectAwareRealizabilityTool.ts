import { buildObjectAwareChoreographyContext } from "../../shared/context/objectAwareChoreographyContext.js";
import { buildIsolatedCaseSemanticsWithObjectAwareRealizability } from "../../shared/semantics/isolatedCaseSemantics.js";
import { logger } from "../../shared/logger.js";
import {
  analysisReportOutput,
  toolErrorOutput,
} from "../../shared/service/toolOutputs.js";
import {
  ToolIds,
  type ToolInput,
  type ToolResult,
} from "../../shared/service/toolTypes.js";

export async function objectAwareRealizabilityTool(
  input: ToolInput<typeof ToolIds.IsolatedCaseObjectAwareRealizability>,
): Promise<ToolResult<typeof ToolIds.IsolatedCaseObjectAwareRealizability>> {
  let context: Awaited<ReturnType<typeof buildObjectAwareChoreographyContext>>;

  try {
    context = await buildObjectAwareChoreographyContext(input);
  } catch (error) {
    return {
      toolId: ToolIds.IsolatedCaseObjectAwareRealizability,
      outputs: [
        toolErrorOutput({
          kind: "toolError",
          toolId: ToolIds.IsolatedCaseObjectAwareRealizability,
          message:
            error instanceof Error
              ? error.message
              : "Object-aware choreography context validation failed",
        }),
      ],
    };
  }

  const { objectAwareRealizabilityReport } =
    buildIsolatedCaseSemanticsWithObjectAwareRealizability(context);

  logger.info(
    {
      objectAwareRealizable:
        objectAwareRealizabilityReport.objectAwareRealizability.holds,
      reachableMarkings: objectAwareRealizabilityReport.stateSpace.markings,
      stateSpaceEdges: objectAwareRealizabilityReport.stateSpace.edges,
      ...objectAwareRealizabilityReport.metadata,
      ...objectAwareRealizabilityReport.diagnostics,
    },
    "Object-aware realizability analysis diagnostics",
  );

  if (!objectAwareRealizabilityReport.objectAwareRealizability.holds) {
    const firstViolation = objectAwareRealizabilityReport.violations[0];

    logger.info(
      {
        totalViolations: objectAwareRealizabilityReport.violations.length,
        byKind: objectAwareRealizabilityReport.diagnostics,
        firstViolation,
      },
      "Object-aware realizability violation summary",
    );
    logger.info(
      {
        kind: firstViolation?.kind,
        traceText: firstViolation?.traceText,
        markedPlaces: firstViolation?.markedPlaces,
      },
      "Object-aware realizability counterexample trace",
    );
  }

  logger.info(
    { objectAwareRealizabilityReport },
    "Object-aware realizability analysis report",
  );

  return {
    toolId: ToolIds.IsolatedCaseObjectAwareRealizability,
    outputs: [
      analysisReportOutput({
        kind: "analysisReport",
        format: "json",
        content: objectAwareRealizabilityReport,
        report: objectAwareRealizabilityReport,
      }),
    ],
  };
}
