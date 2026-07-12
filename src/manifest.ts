import {
  ContentType,
  PayloadType,
  config,
  type ServiceManifest,
  type ToolManifest,
  type ToolInputPayloadDescription,
  type ToolOutputPayloadDescription,
} from "openbpt-service-core";
import { ToolIds, type ToolId } from "./shared/service/toolTypes.js";

const choreographyInput = {
  id: "choreography",
  name: "Choreography",
  description: "Serialized object-aware choreography diagram.",
  type: PayloadType.CURRENT_FILE,
  contentType: ContentType.BPMN_CHOREOGRAPHY,
  isOptional: false,
} as const satisfies ToolInputPayloadDescription;

const dataModelInput = {
  id: "shared_data_model",
  name: "Shared data model",
  description: "Serialized shared class diagram.",
  type: PayloadType.FILE,
  contentType: ContentType.UML_CLASS,
  isOptional: false,
} as const satisfies ToolInputPayloadDescription;

const lifecyclesInput = {
  id: "shared_object_lifecycles",
  name: "Shared object lifecycles",
  description: "Serialized shared object lifecycle specifications.",
  type: PayloadType.FILE,
  contentType: ContentType.STATE_TRANSITION,
  isOptional: false,
} as const satisfies ToolInputPayloadDescription;

const bsplCurrentFileInput = {
  id: "bspl_protocol",
  name: "BSPL protocol",
  description: "BSPL protocol text.",
  type: PayloadType.CURRENT_FILE,
  contentType: ContentType.TEXT,
  isOptional: false,
} as const satisfies ToolInputPayloadDescription;

const constraintsInput = {
  id: "control-flow_constraints",
  name: "Control-flow constraints",
  description: "Control-flow constraints JSON.",
  type: PayloadType.FILE,
  contentType: ContentType.JSON,
  isOptional: false,
} as const satisfies ToolInputPayloadDescription;

const crossCaseClassesInput = {
  id: "cross-case_classes",
  name: "Cross-case classes",
  description:
    "Comma-separated class names whose objects may be shared across cases.",
  type: PayloadType.STRING,
  isOptional: true,
} as const satisfies ToolInputPayloadDescription;

const crossCaseConfigInput = {
  id: "cross-case_config",
  name: "Cross-case configuration",
  description:
    "JSON configuration with cross-case classes, finite domains, fixed participant assignments, and optional bounds.",
  type: PayloadType.FILE,
  contentType: ContentType.JSON,
  isOptional: false,
} as const satisfies ToolInputPayloadDescription;

const objectAwareInputs = [
  choreographyInput,
  dataModelInput,
  lifecyclesInput,
] as const;

const isolatedPetriNetOutput = {
  id: "petri_net",
  name: "Isolated-case Petri net",
  description: "OpenBPT Petri-net diagram/model.",
  type: PayloadType.FILE,
  contentType: ContentType.PETRI_NET,
  saveFile: true,
} as const satisfies ToolOutputPayloadDescription;

const objectAwareRealizableOutput = {
  id: "object_aware_realizable",
  name: "Object-aware realizable",
  description: "Whether all thesis-facing object-aware realizability checks hold.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const projectedChoreographySoundnessOutput = {
  id: "projected_choreography_soundness",
  name: "Projected choreography soundness",
  description: "Whether the projected choreography soundness checks hold.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const optionToCompleteOutput = {
  id: "option_to_complete",
  name: "Option to complete",
  description: "Whether every projected execution state can complete.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const properInteractionCompletionOutput = {
  id: "proper_interaction_completion",
  name: "Proper interaction completion",
  description: "Whether sink markings contain no residual execution tokens.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const taskCoverageOutput = {
  id: "task_coverage",
  name: "Task coverage",
  description: "Whether every choreography task completes in some execution.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const branchCoverageOutput = {
  id: "branch_coverage",
  name: "Branch coverage",
  description: "Whether every modeled gateway branch occurs in some execution.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const senderProgressionOutput = {
  id: "sender_progression",
  name: "Sender progression",
  description: "Whether sender progression holds.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const receiverProgressionOutput = {
  id: "receiver_progression",
  name: "Receiver progression",
  description: "Whether receiver progression holds.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const decisionConsistencyOutput = {
  id: "decision_consistency",
  name: "Decision consistency",
  description: "Whether decision consistency holds.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const truncatedOutput = {
  id: "truncated",
  name: "State-space exploration truncated",
  description: "Whether the state-space exploration was truncated by configured bounds.",
  type: PayloadType.BOOLEAN,
} as const satisfies ToolOutputPayloadDescription;

const witnessPathOutput = {
  id: "witness_path",
  name: "Witness path",
  description: "Counterexample path text, empty when all reported checks hold.",
  type: PayloadType.STRING,
} as const satisfies ToolOutputPayloadDescription;

const typedPetriNetOutput = {
  id: "typed_petri_net",
  name: "Cross-case typed Petri net",
  description: "OpenBPT typed-Petri-net diagram/model.",
  type: PayloadType.FILE,
  contentType: ContentType.TYPED_PETRI_NET,
  saveFile: true,
} as const satisfies ToolOutputPayloadDescription;

const bsplOutput = {
  id: "bspl_protocol",
  name: "BSPL protocol",
  description: "Generated BSPL protocol text.",
  type: PayloadType.FILE,
  contentType: ContentType.TEXT,
  saveFile: true,
} as const satisfies ToolOutputPayloadDescription;

const refinedBsplOutput = {
  id: "refined_bspl_protocol",
  name: "Refined BSPL protocol",
  description: "Refined BSPL protocol text.",
  type: PayloadType.FILE,
  contentType: ContentType.TEXT,
  saveFile: true,
} as const satisfies ToolOutputPayloadDescription;

const choreographyTraceCountOutput = {
  id: "choreography_send_trace_language",
  name: "Choreography send-trace language size",
  description: "Number of choreography send traces.",
  type: PayloadType.NUMBER,
} as const satisfies ToolOutputPayloadDescription;

const protocolTraceCountOutput = {
  id: "protocol_send_trace_language",
  name: "Protocol send-trace language size",
  description: "Number of BSPL protocol send traces.",
  type: PayloadType.NUMBER,
} as const satisfies ToolOutputPayloadDescription;

const precisionOutput = {
  id: "precision",
  name: "Precision",
  description: "Trace-language precision.",
  type: PayloadType.NUMBER,
} as const satisfies ToolOutputPayloadDescription;

const recallOutput = {
  id: "recall",
  name: "Recall",
  description: "Trace-language recall.",
  type: PayloadType.NUMBER,
} as const satisfies ToolOutputPayloadDescription;

const constraintsOutput = {
  id: "control-flow_constraints",
  name: "Control-flow constraints",
  description: "Editable JSON list of control-flow constraints.",
  type: PayloadType.FILE,
  contentType: ContentType.JSON,
  saveFile: true,
} as const satisfies ToolOutputPayloadDescription;

const tools = [
  {
    id: ToolIds.GenerateIsolatedCasePetriNet,
    category: "TRANSLATION",
    name: "Derive isolated-case Petri net",
    description: "Derive an OpenBPT Petri net for one choreography case.",
    input: [...objectAwareInputs],
    output: [isolatedPetriNetOutput],
  },
  {
    id: ToolIds.IsolatedCaseObjectAwareRealizability,
    category: "ANALYSIS",
    name: "Check isolated-case object-aware realizability",
    description:
      "Check projected choreography soundness, sender progression, receiver progression, and decision consistency.",
    input: [...objectAwareInputs],
    output: [
      objectAwareRealizableOutput,
      projectedChoreographySoundnessOutput,
      optionToCompleteOutput,
      properInteractionCompletionOutput,
      taskCoverageOutput,
      branchCoverageOutput,
      senderProgressionOutput,
      receiverProgressionOutput,
      decisionConsistencyOutput,
      truncatedOutput,
      witnessPathOutput,
    ],
  },
  {
    id: ToolIds.GenerateCrossCasePetriNet,
    category: "TRANSLATION",
    name: "Derive cross-case typed Petri net",
    description: "Derive an OpenBPT typed Petri net for cross-case objects.",
    input: [...objectAwareInputs, crossCaseClassesInput],
    output: [typedPetriNetOutput],
  },
  {
    id: ToolIds.CrossCaseObjectAwareRealizability,
    category: "ANALYSIS",
    name: "Check cross-case object-aware realizability",
    description:
      "Check bounded projected choreography soundness, sender progression, receiver progression, and decision consistency.",
    input: [...objectAwareInputs, crossCaseConfigInput],
    output: [
      objectAwareRealizableOutput,
      projectedChoreographySoundnessOutput,
      optionToCompleteOutput,
      properInteractionCompletionOutput,
      taskCoverageOutput,
      branchCoverageOutput,
      senderProgressionOutput,
      receiverProgressionOutput,
      decisionConsistencyOutput,
      truncatedOutput,
      witnessPathOutput,
    ],
  },
  {
    id: ToolIds.GenerateBspl,
    category: "TRANSLATION",
    name: "Generate BSPL protocol",
    description: "Generate a BSPL protocol from the choreography.",
    input: [...objectAwareInputs],
    output: [bsplOutput],
  },
  {
    id: ToolIds.CompareSendTraceLanguages,
    category: "ANALYSIS",
    name: "Compare send-trace languages",
    description: "Compare BSPL and choreography send-trace languages.",
    input: [
      bsplCurrentFileInput,
      {
        ...choreographyInput,
        type: PayloadType.FILE,
      },
      dataModelInput,
      lifecyclesInput,
    ],
    output: [
      choreographyTraceCountOutput,
      protocolTraceCountOutput,
      precisionOutput,
      recallOutput,
    ],
  },
  {
    id: ToolIds.DiscoverControlFlowConstraints,
    category: "ANALYSIS",
    name: "Derive control-flow constraints",
    description: "Derive JSON control-flow constraints for a BSPL protocol.",
    input: [
      bsplCurrentFileInput,
      {
        ...choreographyInput,
        type: PayloadType.FILE,
      },
      dataModelInput,
      lifecyclesInput,
    ],
    output: [constraintsOutput],
  },
  {
    id: ToolIds.RefineBspl,
    category: "TRANSLATION",
    name: "Refine BSPL protocol",
    description: "Refine a BSPL protocol with control-flow constraints.",
    input: [bsplCurrentFileInput, constraintsInput],
    output: [refinedBsplOutput],
  },
] as const satisfies readonly (ToolManifest & { id: ToolId })[];

export const manifest = {
  id: "object_aware_choreography_service",
  version: "1.0.0",
  name: "Object-Aware Choreography Service",
  description: "OpenBPT tools for object-aware choreography analysis.",
  url: config.serviceUrl,
  ttl: config.heartbeatTimeout,
  tools,
  lastSeen: new Date(),
} as const satisfies ServiceManifest;

export default manifest;
