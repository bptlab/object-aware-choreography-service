import assert from "node:assert/strict";
import type {
  AnalysisReportOutput,
  AnyToolOutput,
  GeneratedModelOutput,
  ToolResult,
} from "../../../src/shared/service/toolTypes.js";

export function expectGeneratedModelOutput(
  result: ToolResult,
): GeneratedModelOutput {
  const output = firstOutput(result);

  assert.equal(output.kind, "generatedModel");
  return output as GeneratedModelOutput;
}

export function expectJsonReportOutput(result: ToolResult): AnalysisReportOutput {
  const output = firstOutput(result);

  assert.equal(output.kind, "analysisReport");
  assert.equal((output as AnalysisReportOutput).format, "json");
  return output as AnalysisReportOutput;
}

export function expectStructuredErrorOrWarning(result: ToolResult): void {
  const output = firstOutput(result);

  assert.ok(
    output.kind === "toolError" ||
      ("metadata" in output &&
        Array.isArray((output.metadata as { warnings?: unknown[] } | undefined)?.warnings)),
    "Expected a structured tool error or metadata warnings",
  );
}

function firstOutput(result: ToolResult): AnyToolOutput {
  const [output] = result.outputs;

  assert.ok(output, "Expected at least one tool output");
  return output as AnyToolOutput;
}
