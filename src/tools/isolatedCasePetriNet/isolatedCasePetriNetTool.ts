import { buildObjectAwareChoreographyContext } from "../../shared/context/objectAwareChoreographyContext.js";
import { buildIsolatedCaseSemantics } from "../../shared/semantics/isolatedCaseSemantics.js";
import {
  generatedModelOutput,
  toolErrorOutput,
} from "../../shared/service/toolOutputs.js";
import {
  ToolIds,
  type ToolInput,
  type ToolResult,
} from "../../shared/service/toolTypes.js";

export async function generateIsolatedCasePetriNetTool(
  input: ToolInput<typeof ToolIds.GenerateIsolatedCasePetriNet>,
): Promise<ToolResult<typeof ToolIds.GenerateIsolatedCasePetriNet>> {
  let context: Awaited<ReturnType<typeof buildObjectAwareChoreographyContext>>;

  try {
    context = await buildObjectAwareChoreographyContext(input);
  } catch (error) {
    return {
      toolId: ToolIds.GenerateIsolatedCasePetriNet,
      outputs: [
        toolErrorOutput({
          kind: "toolError",
          toolId: ToolIds.GenerateIsolatedCasePetriNet,
          message:
            error instanceof Error
              ? error.message
              : "Object-aware choreography context validation failed",
        }),
      ],
    };
  }

  const { petriNet } = buildIsolatedCaseSemantics(context);
  const serializedPetriNet = petriNet.toModdleDefinitions().serialize();

  return {
    toolId: ToolIds.GenerateIsolatedCasePetriNet,
    outputs: [
      generatedModelOutput({
        kind: "generatedModel",
        format: "pnml",
        name: "isolated-case-semantics.pnml",
        content: serializedPetriNet,
      }),
    ],
  };
}
