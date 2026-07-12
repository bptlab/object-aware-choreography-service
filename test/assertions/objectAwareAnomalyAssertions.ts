import assert from "node:assert/strict";

type AnomalyReport = {
  anomalyFree?: unknown;
  violations?: unknown;
  diagnostics?: Record<string, unknown>;
  stateSpace?: {
    markings?: number;
  };
};

export function expectObjectAwareAnomalyAnalysisHolds(report: unknown): void {
  const parsed = asAnomalyReport(report);

  assert.equal(parsed.anomalyFree, true);
}

export function expectObjectAwareAnomalyAnalysisViolated(report: unknown): void {
  const parsed = asAnomalyReport(report);

  assert.equal(parsed.anomalyFree, false);
}

export function expectSenderProgressionViolation(report: unknown): void {
  expectDiagnosticCount(report, "senderProgressionViolations");
}

export function expectReceiverProgressionViolation(report: unknown): void {
  expectDiagnosticCount(report, "receiverProgressionViolations");
}

export function expectDecisionDeterminismViolation(report: unknown): void {
  expectDiagnosticCount(report, "decisionDeterminismViolations");
}

export function expectDeadBranchViolation(report: unknown): void {
  expectDiagnosticCount(report, "deadBranchAbsenceViolations");
}

export function expectViolationHasTrace(
  report: unknown,
  propertyName: string,
): void {
  const parsed = asAnomalyReport(report);
  const violations = Array.isArray(parsed.violations) ? parsed.violations : [];

  assert.ok(violations.length > 0, "Expected at least one violation");
  assert.ok(
    violations.some(
      (violation) =>
        typeof violation === "object" &&
        violation !== null &&
        propertyName in violation &&
        Array.isArray((violation as Record<string, unknown>).trace),
    ),
    `Expected violation with property ${propertyName} and a trace`,
  );
}

function expectDiagnosticCount(report: unknown, diagnosticName: string): void {
  const parsed = asAnomalyReport(report);
  const value = parsed.diagnostics?.[diagnosticName];

  assert.equal(typeof value, "number", `Expected diagnostic ${diagnosticName}`);
  assert.ok(
    (value as number) > 0,
    `Expected diagnostic ${diagnosticName} to be greater than zero`,
  );
}

function asAnomalyReport(report: unknown): AnomalyReport {
  assert.equal(typeof report, "object");
  assert.ok(report !== null);

  return report as AnomalyReport;
}
