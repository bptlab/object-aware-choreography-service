import { checkCrossCaseObjectAwareRealizability } from "../../shared/analysis/crossCaseObjectAwareRealizability/index.js";
import { buildObjectAwareChoreographyContext } from "../../shared/context/objectAwareChoreographyContext.js";
import { buildCrossCasePetriNet } from "../../shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import { getChoreographyTasks } from "../../shared/source/objectAwareChoreography/choreography/choreography.js";
import { analysisReportOutput, toolErrorOutput } from "../../shared/service/toolOutputs.js";
import {
  ToolIds,
  type ToolInput,
  type ToolResult,
} from "../../shared/service/toolTypes.js";

export async function checkCrossCaseAnalysisTool(
  input: ToolInput<typeof ToolIds.CrossCaseObjectAwareRealizability>,
): Promise<ToolResult<typeof ToolIds.CrossCaseObjectAwareRealizability>> {
  try {
    const context = await buildObjectAwareChoreographyContext(input);
    const typedPetriNet = buildCrossCasePetriNet(context, {
      crossCaseClasses: input.crossCaseClasses ?? [],
      participantIdsByRole: input.participantIdsByRole,
    });
    const report = checkCrossCaseObjectAwareRealizability({
      net: typedPetriNet,
      domains: input.domains,
      maxMarkings: input.maxMarkings,
      maxDepth: input.maxDepth,
      fixedParticipantsByCaseAndRole: input.fixedParticipantsByCaseAndRole,
      maxLocalPreparationMarkings: input.maxLocalPreparationMarkings,
      taskIds: getChoreographyTasks(context.choreography).map((task) => task.id),
    });

    return {
      toolId: ToolIds.CrossCaseObjectAwareRealizability,
      outputs: [
        analysisReportOutput({
          kind: "analysisReport",
          format: "json",
          content: report,
          report,
          metadata: {
            objectAwareRealizable:
              report.objectAwareRealizability.holds,
            projectedChoreographySoundness:
              report.projectedChoreographySoundness.holds,
            optionToComplete:
              report.projectedChoreographySoundness.optionToComplete.holds,
            properInteractionCompletion:
              report.projectedChoreographySoundness.properInteractionCompletion
                .holds,
            taskCoverage:
              report.projectedChoreographySoundness.taskCoverage.holds,
            branchCoverage:
              report.projectedChoreographySoundness.branchCoverage.holds,
            markings: report.stateSpace.markings,
            edges: report.stateSpace.edges,
            truncated: report.stateSpace.truncated,
            truncationReasons: report.stateSpace.truncationReasons,
          },
      }),
    ],
    };
  } catch (error) {
    return {
      toolId: ToolIds.CrossCaseObjectAwareRealizability,
      outputs: [
        toolErrorOutput({
          kind: "toolError",
          toolId: ToolIds.CrossCaseObjectAwareRealizability,
          message:
            error instanceof Error
              ? error.message
              : "Cross-case object-aware anomaly analysis failed",
        }),
      ],
    };
  }
}
