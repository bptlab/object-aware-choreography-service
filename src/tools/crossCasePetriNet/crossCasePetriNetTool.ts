import { buildObjectAwareChoreographyContext } from "../../shared/context/objectAwareChoreographyContext.js";
import {
  buildCrossCasePetriNet,
  computeCrossCaseTypedPetriNetLayout,
  createCrossCasePetriNetMappingContext,
} from "../../shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";
import {
  generatedModelOutput,
  toolErrorOutput,
} from "../../shared/service/toolOutputs.js";
import {
  ToolIds,
  type ToolInput,
  type ToolResult,
} from "../../shared/service/toolTypes.js";
import { serializeTypedPetriNet } from "../../shared/targets/typedPetriNet/index.js";

export async function generateCrossCasePetriNetTool(
  input: ToolInput<typeof ToolIds.GenerateCrossCasePetriNet>,
): Promise<ToolResult<typeof ToolIds.GenerateCrossCasePetriNet>> {
  let context: Awaited<ReturnType<typeof buildObjectAwareChoreographyContext>>;

  try {
    context = await buildObjectAwareChoreographyContext(input);
  } catch (error) {
    return {
      toolId: ToolIds.GenerateCrossCasePetriNet,
      outputs: [
        toolErrorOutput({
          kind: "toolError",
          toolId: ToolIds.GenerateCrossCasePetriNet,
          message:
            error instanceof Error
              ? error.message
              : "Object-aware choreography context validation failed",
        }),
      ],
    };
  }

  const options = {
    crossCaseClasses: input.crossCaseClasses ?? [],
    participantIdsByRole: input.participantIdsByRole,
  };
  const petriNet = buildCrossCasePetriNet(context, options);
  const mappingContext = createCrossCasePetriNetMappingContext(
    context,
    options,
  );
  const serializedPetriNet = serializeTypedPetriNet(petriNet, {
    layout: computeCrossCaseTypedPetriNetLayout({
      net: petriNet,
      context: mappingContext,
    }),
  });

  return {
    toolId: ToolIds.GenerateCrossCasePetriNet,
    outputs: [
      generatedModelOutput({
        kind: "generatedModel",
        format: "obpt-typed-pn",
        name: "cross-case-typed-petri-net.obpt-typed-pn",
        content: serializedPetriNet,
        metadata: {
          classes: mappingContext.metadata.classes,
        },
      }),
    ],
  };
}
