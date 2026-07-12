import type {
  AnalysisReportOutput,
  GeneratedModelOutput,
  NotImplementedOutput,
  ToolErrorOutput,
} from "./toolTypes.js";

export function generatedModelOutput<T extends GeneratedModelOutput>(args: T): T {
  return args;
}

export function analysisReportOutput<T extends AnalysisReportOutput>(args: T): T {
  return args;
}

export function notImplementedOutput(message: string): NotImplementedOutput {
  return {
    kind: "notImplemented",
    message,
  };
}

export function toolErrorOutput(args: ToolErrorOutput): ToolErrorOutput {
  return args;
}
