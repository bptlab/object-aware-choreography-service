import type { ObjectAwareChoreographySerializedInput } from "../context/objectAwareChoreographyContext.js";
export type { ObjectAwareChoreographySerializedInput } from "../context/objectAwareChoreographyContext.js";

export const ToolIds = {
  GenerateIsolatedCasePetriNet: "oa-chor.generate-isolated-case-petri-net",
  IsolatedCaseObjectAwareRealizability:
    "oa-chor.isolated-case-object-aware-realizability",
  GenerateCrossCasePetriNet: "oa-chor.generate-cross-case-petri-net",
  CrossCaseObjectAwareRealizability:
    "oa-chor.cross-case-object-aware-realizability",
  GenerateBspl: "oa-chor.generate-bspl",
  CompareSendTraceLanguages: "oa-chor.compare-send-trace-languages",
  DiscoverControlFlowConstraints:
    "oa-chor.discover-control-flow-constraints",
  RefineBspl: "oa-chor.refine-bspl",
} as const;

export type ToolId =
  | typeof ToolIds.GenerateIsolatedCasePetriNet
  | typeof ToolIds.IsolatedCaseObjectAwareRealizability
  | typeof ToolIds.GenerateCrossCasePetriNet
  | typeof ToolIds.CrossCaseObjectAwareRealizability
  | typeof ToolIds.GenerateBspl
  | typeof ToolIds.CompareSendTraceLanguages
  | typeof ToolIds.DiscoverControlFlowConstraints
  | typeof ToolIds.RefineBspl;

export type DiscoverControlFlowConstraintsInput =
  ObjectAwareChoreographySerializedInput & {
    bspl: string;
  };

export type CompareSendTraceLanguagesInput =
  ObjectAwareChoreographySerializedInput & {
    bspl: string;
  };

export type RefineBsplInput = {
  bspl: string;
  constraints: unknown[] | string;
};

export type GenerateCrossCasePetriNetInput =
  ObjectAwareChoreographySerializedInput & {
    crossCaseClasses?: string[];
    participantIdsByRole?: Record<string, string[]>;
  };

export type CrossCaseObjectAwareRealizabilityInput =
  GenerateCrossCasePetriNetInput & {
    domains: Record<string, string[]>;
    maxMarkings?: number;
    maxDepth?: number;
    fixedParticipantsByCaseAndRole?: Record<string, Record<string, string>>;
    maxLocalPreparationMarkings?: number;
  };

export type ToolInput<T extends ToolId> =
  T extends typeof ToolIds.GenerateIsolatedCasePetriNet
    ? ObjectAwareChoreographySerializedInput
    : T extends typeof ToolIds.IsolatedCaseObjectAwareRealizability
      ? ObjectAwareChoreographySerializedInput
      : T extends typeof ToolIds.GenerateCrossCasePetriNet
        ? GenerateCrossCasePetriNetInput
        : T extends typeof ToolIds.CrossCaseObjectAwareRealizability
          ? CrossCaseObjectAwareRealizabilityInput
          : T extends typeof ToolIds.GenerateBspl
            ? ObjectAwareChoreographySerializedInput
            : T extends typeof ToolIds.CompareSendTraceLanguages
              ? CompareSendTraceLanguagesInput
              : T extends typeof ToolIds.DiscoverControlFlowConstraints
                ? DiscoverControlFlowConstraintsInput
                : T extends typeof ToolIds.RefineBspl
                  ? RefineBsplInput
        : never;

export type ToolInvocation<T extends ToolId = ToolId> = {
  toolId: T;
  input: ToolInput<T>;
};

export type ToolHandler<T extends ToolId = ToolId> = (
  input: ToolInput<T>,
) => Promise<ToolResult<T>>;

export interface GenerateIsolatedCasePetriNetOutput {
  kind: "generatedModel";
  format: "pnml";
  content: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface GenerateBsplOutput {
  kind: "generatedModel";
  format: "bspl";
  content: string;
  name?: string;
  warnings?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface GenerateCrossCasePetriNetOutput {
  kind: "generatedModel";
  format: "obpt-typed-pn";
  content: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface CrossCaseObjectAwareRealizabilityOutput {
  kind: "analysisReport";
  format: "json";
  content: unknown;
  report?: unknown;
  metadata?: Record<string, unknown>;
}

export interface IsolatedCaseObjectAwareRealizabilityOutput {
  kind: "analysisReport";
  format: "json";
  content: unknown;
  report?: unknown;
  metadata?: Record<string, unknown>;
}

export interface DiscoverControlFlowConstraintsOutput {
  kind: "analysisReport";
  format: "json";
  content: unknown;
  report?: unknown;
  metadata?: Record<string, unknown>;
}

export interface CompareSendTraceLanguagesOutput {
  kind: "analysisReport";
  format: "json";
  content: unknown;
  report?: unknown;
  metadata?: Record<string, unknown>;
}

export type RefineBsplOutput = GenerateBsplOutput;

export type ToolOutput<T extends ToolId = ToolId> =
  T extends typeof ToolIds.GenerateIsolatedCasePetriNet
    ? GenerateIsolatedCasePetriNetOutput
    : T extends typeof ToolIds.IsolatedCaseObjectAwareRealizability
      ? IsolatedCaseObjectAwareRealizabilityOutput
      : T extends typeof ToolIds.GenerateCrossCasePetriNet
        ? GenerateCrossCasePetriNetOutput
        : T extends typeof ToolIds.CrossCaseObjectAwareRealizability
          ? CrossCaseObjectAwareRealizabilityOutput
          : T extends typeof ToolIds.GenerateBspl
            ? GenerateBsplOutput
            : T extends typeof ToolIds.CompareSendTraceLanguages
              ? CompareSendTraceLanguagesOutput
              : T extends typeof ToolIds.DiscoverControlFlowConstraints
                ? DiscoverControlFlowConstraintsOutput
                : T extends typeof ToolIds.RefineBspl
                  ? RefineBsplOutput
        : never;

export interface GeneratedModelOutput {
  kind: "generatedModel";
  format: "pnml" | "bspl" | "json" | "obpt-typed-pn";
  name?: string;
  content: string;
  warnings?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface AnalysisReportOutput {
  kind: "analysisReport";
  format: "json";
  content?: unknown;
  report?: unknown;
  metadata?: Record<string, unknown>;
}

export interface NotImplementedOutput {
  kind: "notImplemented";
  message: string;
}

export interface ToolErrorOutput {
  kind: "toolError";
  message: string;
  toolId?: string;
}

export type AnyToolOutput =
  | GeneratedModelOutput
  | AnalysisReportOutput
  | NotImplementedOutput
  | ToolErrorOutput;

export interface ToolResult<T extends ToolId = ToolId> {
  toolId: T | string;
  outputs: Array<ToolOutput<T> | ToolErrorOutput | NotImplementedOutput>;
}
