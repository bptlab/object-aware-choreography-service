import type {
  ServiceInputPayload,
  ToolExchangePayload,
} from "openbpt-service-core";
import { objectAwareRealizabilityTool } from "./tools/objectAwareRealizability/objectAwareRealizabilityTool.js";
import { compareSendTraceLanguagesTool } from "./tools/bspl/compareSendTraceLanguagesTool.js";
import { discoverControlFlowConstraintsTool } from "./tools/bspl/discoverControlFlowConstraintsTool.js";
import { generateBsplTool } from "./tools/bspl/generateBsplTool.js";
import { refineBsplTool } from "./tools/bspl/refineBsplTool.js";
import { checkCrossCaseAnalysisTool } from "./tools/crossCaseAnalysis/crossCaseAnalysisTool.js";
import { generateCrossCasePetriNetTool } from "./tools/crossCasePetriNet/crossCasePetriNetTool.js";
import { generateIsolatedCasePetriNetTool } from "./tools/isolatedCasePetriNet/isolatedCasePetriNetTool.js";
import { logger } from "./shared/logger.js";
import { unknownToolIdResult } from "./shared/service/toolErrors.js";
import { toolErrorOutput } from "./shared/service/toolOutputs.js";
import {
  ToolIds,
  type ToolId,
  type ToolInput,
  type ToolInvocation,
  type ToolResult,
} from "./shared/service/toolTypes.js";
import {
  caseTypeId,
  objectTypeId,
  roleTypeId,
} from "./shared/mappings/objectAwareChoreographyToCrossCasePetriNet/index.js";

interface ServiceInvocation {
  toolId: string;
  input?: unknown;
  payload?: unknown;
}

export async function dispatchToolInvocation(
  invocation: ServiceInvocation,
): Promise<ToolResult> {
  const parsedInvocation = parseToolInvocation(invocation);

  if (!parsedInvocation.ok) {
    return invalidToolInvocationResult(parsedInvocation.message);
  }

  const { toolId, input } = parsedInvocation.invocation;

  switch (toolId) {
    case ToolIds.GenerateIsolatedCasePetriNet:
      return generateIsolatedCasePetriNetTool(
        input as ToolInput<typeof ToolIds.GenerateIsolatedCasePetriNet>,
      );
    case ToolIds.IsolatedCaseObjectAwareRealizability:
      return objectAwareRealizabilityTool(
        input as ToolInput<typeof ToolIds.IsolatedCaseObjectAwareRealizability>,
      );
    case ToolIds.GenerateCrossCasePetriNet:
      return generateCrossCasePetriNetTool(
        input as ToolInput<typeof ToolIds.GenerateCrossCasePetriNet>,
      );
    case ToolIds.CrossCaseObjectAwareRealizability:
      return checkCrossCaseAnalysisTool(
        input as ToolInput<typeof ToolIds.CrossCaseObjectAwareRealizability>,
      );
    case ToolIds.GenerateBspl:
      return generateBsplTool(input as ToolInput<typeof ToolIds.GenerateBspl>);
    case ToolIds.CompareSendTraceLanguages:
      return compareSendTraceLanguagesTool(
        input as ToolInput<typeof ToolIds.CompareSendTraceLanguages>,
      );
    case ToolIds.DiscoverControlFlowConstraints:
      return discoverControlFlowConstraintsTool(
        input as ToolInput<typeof ToolIds.DiscoverControlFlowConstraints>,
      );
    case ToolIds.RefineBspl:
      return refineBsplTool(input as ToolInput<typeof ToolIds.RefineBspl>);
    default:
      return unknownToolIdResult(toolId);
  }
}

export default async function run(
  invocation: ServiceInputPayload,
): Promise<ToolExchangePayload> {
  logger.debug("Starting object-aware choreography service");

  const result = await dispatchToolInvocation(invocation);
  return toolResultToExchangePayload(result);
}

type ParsedToolInvocation =
  | { ok: true; invocation: ToolInvocation<ToolId> }
  | { ok: false; message: string };

function parseToolInvocation(
  invocation: ServiceInvocation,
): ParsedToolInvocation {
  const { toolId } = invocation;
  const input = "payload" in invocation ? invocation.payload : invocation.input;

  if (typeof toolId !== "string") {
    return {
      ok: false,
      message: 'Tool invocation is missing string field "toolId".',
    };
  }

  if (!isActiveToolId(toolId)) {
    return {
      ok: false,
      message: `Unknown tool id "${toolId}"`,
    };
  }

  const parsedInput = parseToolInput(toolId, input);

  if (!parsedInput.ok) {
    return parsedInput;
  }

  return {
    ok: true,
    invocation: {
      toolId,
      input: parsedInput.input as ToolInput<typeof toolId>,
    },
  };
}

function parseToolInput(
  toolId: ToolId,
  input: unknown,
): { ok: true; input: ToolInput<ToolId> } | { ok: false; message: string } {
  if (!isRecord(input)) {
    return {
      ok: false,
      message: "Tool input must be an object with serialized model contents.",
    };
  }

  if (toolId === ToolIds.RefineBspl) {
    const bspl = stringField(input, "bspl_protocol", "bspl");
    const constraints = input["control-flow_constraints"] ?? input.constraints;

    if (typeof bspl !== "string") {
      return {
        ok: false,
        message: 'Tool input is missing string field "bspl_protocol".',
      };
    }

    if (typeof constraints !== "string" && !Array.isArray(constraints)) {
      return {
        ok: false,
        message:
          'Tool input is missing field "control-flow_constraints" as a JSON string or array.',
      };
    }

    return {
      ok: true,
      input: {
        bspl,
        constraints,
      },
    };
  }

  for (const field of [
    "choreography",
    "shared_data_model",
    "shared_object_lifecycles",
  ] as const) {
    if (typeof input[field] !== "string") {
      return {
        ok: false,
        message: `Tool input is missing string field "${field}".`,
      };
    }
  }

  if (
    toolId === ToolIds.CompareSendTraceLanguages ||
    toolId === ToolIds.DiscoverControlFlowConstraints
  ) {
    const bspl = stringField(input, "bspl_protocol", "bspl");

    if (typeof bspl !== "string") {
      return {
        ok: false,
        message: 'Tool input is missing string field "bspl_protocol".',
      };
    }

    return {
      ok: true,
      input: {
        choreography: input.choreography as string,
        shared_data_model: input.shared_data_model as string,
        shared_object_lifecycles: input.shared_object_lifecycles as string,
        bspl,
      },
    };
  }

  if (toolId === ToolIds.GenerateCrossCasePetriNet) {
    const crossCaseClasses = parseCrossCaseClasses(
      input["cross-case_classes"] ?? input.crossCaseClasses,
    );
    const participantIdsByRole = parseOptionalJsonField(
      input.participantIdsByRole,
      "participantIdsByRole",
    );

    if (!crossCaseClasses.ok) {
      return crossCaseClasses;
    }

    if (!participantIdsByRole.ok) {
      return participantIdsByRole;
    }

    if (
      participantIdsByRole.value !== undefined &&
      !isParticipantIdsByRole(participantIdsByRole.value)
    ) {
      return {
        ok: false,
        message:
          'Tool input field "participantIdsByRole" must map roles to string arrays.',
      };
    }

    return {
      ok: true,
      input: {
        choreography: input.choreography as string,
        shared_data_model: input.shared_data_model as string,
        shared_object_lifecycles: input.shared_object_lifecycles as string,
        crossCaseClasses: crossCaseClasses.value,
        participantIdsByRole: participantIdsByRole.value,
      },
    };
  }

  if (toolId === ToolIds.CrossCaseObjectAwareRealizability) {
    const config = parseCrossCaseConfig(
      input["cross-case_config"] ?? input.crossCaseConfig ?? input,
    );

    if (!config.ok) {
      return config;
    }

    return {
      ok: true,
      input: {
        choreography: input.choreography as string,
        shared_data_model: input.shared_data_model as string,
        shared_object_lifecycles: input.shared_object_lifecycles as string,
        ...config.input,
      },
    };
  }

  return {
    ok: true,
    input: {
      choreography: input.choreography as string,
      shared_data_model: input.shared_data_model as string,
      shared_object_lifecycles: input.shared_object_lifecycles as string,
    },
  };
}

function toolResultToExchangePayload(result: ToolResult): ToolExchangePayload {
  const errorOutput = result.outputs.find((output) => output.kind === "toolError");

  if (errorOutput) {
    return {
      error: errorOutput.message,
    };
  }

  switch (result.toolId) {
    case ToolIds.GenerateIsolatedCasePetriNet:
      return {
        petri_net: requireGeneratedContent(result, "petri_net"),
      };
    case ToolIds.IsolatedCaseObjectAwareRealizability:
      return behaviorReportToPayload(requireReport(result));
    case ToolIds.GenerateCrossCasePetriNet:
      return {
        typed_petri_net: requireGeneratedContent(result, "typed_petri_net"),
      };
    case ToolIds.CrossCaseObjectAwareRealizability:
      return behaviorReportToPayload(requireReport(result));
    case ToolIds.GenerateBspl:
      return {
        bspl_protocol: requireGeneratedContent(result, "bspl_protocol"),
      };
    case ToolIds.CompareSendTraceLanguages:
      return languageComparisonToPayload(requireReport(result));
    case ToolIds.DiscoverControlFlowConstraints:
      return {
        "control-flow_constraints": JSON.stringify(
          requireReport(result),
          null,
          2,
        ),
      };
    case ToolIds.RefineBspl:
      return {
        refined_bspl_protocol: requireGeneratedContent(
          result,
          "refined_bspl_protocol",
        ),
      };
    default:
      throw new Error(`Unknown tool id "${result.toolId}".`);
  }
}

function requireGeneratedContent(result: ToolResult, outputId: string): string {
  const output = result.outputs.find(
    (candidate) => candidate.kind === "generatedModel",
  );

  if (!output || !("content" in output) || typeof output.content !== "string") {
    throw new Error(`Tool ${result.toolId} did not produce ${outputId}.`);
  }

  return output.content;
}

function requireReport(result: ToolResult): unknown {
  const output = result.outputs.find(
    (candidate) => candidate.kind === "analysisReport",
  );

  if (!output) {
    throw new Error(
      `Tool ${result.toolId} did not produce an analysis report.`,
    );
  }

  return (
    ("report" in output ? output.report : undefined) ??
    ("content" in output ? output.content : undefined)
  );
}

function behaviorReportToPayload(report: unknown): ToolExchangePayload {
  if (
    !isRecord(report) ||
    !isRecord(report.objectAwareRealizability) ||
    !isRecord(report.projectedChoreographySoundness) ||
    !isRecord(report.senderProgression) ||
    !isRecord(report.receiverProgression) ||
    !isRecord(report.decisionConsistency)
  ) {
    throw new Error("Object-aware realizability report has unexpected shape.");
  }
  const projected = report.projectedChoreographySoundness;

  return {
    object_aware_realizable: report.objectAwareRealizability.holds === true,
    projected_choreography_soundness: projected.holds === true,
    option_to_complete:
      isRecord(projected.optionToComplete) &&
      projected.optionToComplete.holds === true,
    proper_interaction_completion:
      isRecord(projected.properInteractionCompletion) &&
      projected.properInteractionCompletion.holds === true,
    task_coverage:
      isRecord(projected.taskCoverage) && projected.taskCoverage.holds === true,
    branch_coverage:
      isRecord(projected.branchCoverage) &&
      projected.branchCoverage.holds === true,
    sender_progression: report.senderProgression.holds === true,
    receiver_progression: report.receiverProgression.holds === true,
    decision_consistency: report.decisionConsistency.holds === true,
    truncated:
      isRecord(report.stateSpace) && report.stateSpace.truncated === true,
    witness_path: firstWitnessPath(report),
  };
}

function languageComparisonToPayload(report: unknown): ToolExchangePayload {
  if (!isRecord(report)) {
    throw new Error("Language-comparison report has unexpected shape.");
  }

  return {
    choreography_send_trace_language: numberField(
      report,
      "choreographyTraceCount",
    ),
    protocol_send_trace_language: numberField(report, "protocolTraceCount"),
    precision: numberField(report, "precision"),
    recall: numberField(report, "recall"),
  };
}

function firstWitnessPath(report: Record<string, unknown>): string {
  const violations = Array.isArray(report.violations) ? report.violations : [];
  const firstViolation = violations.find(isRecord);

  const trace = firstViolation?.trace;

  if (Array.isArray(trace)) {
    const path = trace
      .filter(isRecord)
      .map(readableTraceStep)
      .filter((entry): entry is string => entry !== undefined);

    if (path.length > 0) {
      return path.join(" -> ");
    }
  }

  const traceText = firstViolation?.traceText;

  if (Array.isArray(traceText)) {
    const path = traceText
      .filter((entry): entry is string => typeof entry === "string")
      .map(readableTraceTextEntry)
      .filter((entry): entry is string => entry !== undefined);

    if (path.length > 0) {
      return path.join(" -> ");
    }
  }

  const witnessPath = firstViolation?.witnessPath;

  if (Array.isArray(witnessPath)) {
    const path = witnessPath
      .filter(isRecord)
      .map((entry) => stringValue(entry.transitionId))
      .filter((entry): entry is string => entry !== undefined);

    if (path.length > 0) {
      return path.join(" -> ");
    }
  }

  return firstViolation ? JSON.stringify(firstViolation, null, 2) : "";
}

function readableTraceStep(step: Record<string, unknown>): string | undefined {
  const label = stringValue(step.transitionLabel);
  const transitionId = stringValue(step.transitionId);
  const transitionKind = stringValue(step.transitionKind);
  const text = label ?? transitionId;

  if (text === undefined || isInternalRoleOnlyStep(text, transitionKind)) {
    return undefined;
  }

  return text;
}

function readableTraceTextEntry(entry: string): string | undefined {
  const labelMatch = /^(?<label>.+?)\s+\([^()]+\)$/.exec(entry);
  const text = labelMatch?.groups?.label ?? entry;

  if (isInternalRoleOnlyStep(text, undefined)) {
    return undefined;
  }

  return text;
}

function isInternalRoleOnlyStep(text: string, transitionKind: string | undefined): boolean {
  const trimmed = text.trim();
  return transitionKind === "local" && /^\[[^\]]+\]$/.test(trimmed);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(record: Record<string, unknown>, field: string): number {
  const value = record[field];

  if (typeof value !== "number") {
    throw new Error(`Expected numeric report field "${field}".`);
  }

  return value;
}

function invalidToolInvocationResult(message: string): ToolResult {
  return {
    toolId: "invalid",
    outputs: [
      toolErrorOutput({
        kind: "toolError",
        message,
      }),
    ],
  };
}

function isActiveToolId(toolId: string): toolId is ToolId {
  return (
    toolId === ToolIds.GenerateIsolatedCasePetriNet ||
    toolId === ToolIds.IsolatedCaseObjectAwareRealizability ||
    toolId === ToolIds.GenerateCrossCasePetriNet ||
    toolId === ToolIds.CrossCaseObjectAwareRealizability ||
    toolId === ToolIds.GenerateBspl ||
    toolId === ToolIds.CompareSendTraceLanguages ||
    toolId === ToolIds.DiscoverControlFlowConstraints ||
    toolId === ToolIds.RefineBspl
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isParticipantIdsByRole(
  value: unknown,
): value is Record<string, string[]> {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (participantIds) =>
      Array.isArray(participantIds) &&
      participantIds.every(
        (participantId) => typeof participantId === "string",
      ),
  );
}

function parseRequiredJsonField(
  value: unknown,
  fieldName: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (value === undefined) {
    return {
      ok: false,
      message: `Tool input is missing field "${fieldName}".`,
    };
  }

  return parseOptionalJsonField(value, fieldName) as
    | { ok: true; value: unknown }
    | { ok: false; message: string };
}

function stringField(
  input: Record<string, unknown>,
  primary: string,
  legacy: string,
): unknown {
  return input[primary] ?? input[legacy];
}

function parseCrossCaseClasses(
  value: unknown,
): { ok: true; value?: string[] } | { ok: false; message: string } {
  if (value === undefined || value === "") {
    return { ok: true, value: undefined };
  }

  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
  ) {
    return { ok: true, value };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      message:
        'Tool input field "cross-case_classes" must be a comma-separated string.',
    };
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    const parsed = parseOptionalJsonField(trimmed, "cross-case_classes");

    if (!parsed.ok) {
      return parsed;
    }

    if (
      Array.isArray(parsed.value) &&
      parsed.value.every((entry) => typeof entry === "string")
    ) {
      return { ok: true, value: parsed.value };
    }

    return {
      ok: false,
      message:
        'Tool input field "cross-case_classes" must contain class names.',
    };
  }

  return {
    ok: true,
    value: trimmed
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  };
}

function parseCrossCaseConfig(value: unknown):
  | {
      ok: true;
      input: {
        crossCaseClasses?: string[];
        participantIdsByRole?: Record<string, string[]>;
        domains: Record<string, string[]>;
        maxMarkings?: number;
        maxDepth?: number;
        fixedParticipantsByCaseAndRole?: Record<string, Record<string, string>>;
        maxLocalPreparationMarkings?: number;
      };
    }
  | { ok: false; message: string } {
  const parsed = parseRequiredJsonField(value, "cross-case_config");

  if (!parsed.ok) {
    return parsed;
  }

  if (!isRecord(parsed.value) || Array.isArray(parsed.value)) {
    return {
      ok: false,
      message: 'Tool input field "cross-case_config" must be a JSON object.',
    };
  }

  const crossCaseClasses = parseCrossCaseClasses(
    parsed.value.crossCaseClasses ?? parsed.value["cross-case_classes"],
  );

  if (!crossCaseClasses.ok) {
    return crossCaseClasses;
  }

  const domains =
    parsed.value.domains !== undefined
      ? parsed.value.domains
      : domainsFromLimits(
          parsed.value.domainLimits ?? parsed.value.domain_sizes,
        );

  if (!isIdentifierDomains(domains)) {
    return {
      ok: false,
      message:
        'Cross-case config must provide "domains" as a string-array map or "domainLimits" with cases, participantsPerRole, and objectsPerClass numbers.',
    };
  }

  const participantIdsByRole =
    parsed.value.participantIdsByRole ?? participantDomainsFromDomains(domains);

  if (
    participantIdsByRole !== undefined &&
    !isParticipantIdsByRole(participantIdsByRole)
  ) {
    return {
      ok: false,
      message:
        'Cross-case config field "participantIdsByRole" must map roles to string arrays.',
    };
  }

  const fixedParticipantsByCaseAndRole =
    parsed.value.fixedParticipantsByCaseAndRole;

  if (
    fixedParticipantsByCaseAndRole !== undefined &&
    !isFixedParticipantsByCaseAndRole(fixedParticipantsByCaseAndRole)
  ) {
    return {
      ok: false,
      message:
        'Cross-case config field "fixedParticipantsByCaseAndRole" must map case ids to role-participant string maps.',
    };
  }

  const maxMarkings = parseOptionalNumber(
    parsed.value.maxMarkings,
    "maxMarkings",
  );
  const maxDepth = parseOptionalNumber(parsed.value.maxDepth, "maxDepth");
  const maxLocalPreparationMarkings = parseOptionalNumber(
    parsed.value.maxLocalPreparationMarkings,
    "maxLocalPreparationMarkings",
  );

  if (!maxMarkings.ok) {
    return maxMarkings;
  }

  if (!maxDepth.ok) {
    return maxDepth;
  }

  if (!maxLocalPreparationMarkings.ok) {
    return maxLocalPreparationMarkings;
  }

  return {
    ok: true,
    input: {
      crossCaseClasses: crossCaseClasses.value,
      participantIdsByRole,
      domains,
      maxMarkings: maxMarkings.value,
      maxDepth: maxDepth.value,
      fixedParticipantsByCaseAndRole,
      maxLocalPreparationMarkings: maxLocalPreparationMarkings.value,
    },
  };
}

function domainsFromLimits(
  value: unknown,
): Record<string, string[]> | undefined {
  if (!isRecord(value) || Array.isArray(value)) {
    return undefined;
  }

  if (
    typeof value.cases !== "number" ||
    !isNumberMap(value.participantsPerRole) ||
    !isNumberMap(value.objectsPerClass)
  ) {
    return undefined;
  }

  return {
    [caseTypeId()]: numberedIds("case", value.cases),
    ...Object.fromEntries(
      Object.entries(value.participantsPerRole).map(([role, count]) => [
        roleTypeId(role),
        numberedIds(domainPrefix(role), count),
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(value.objectsPerClass).map(([classId, count]) => [
        objectTypeId(classId),
        numberedIds(domainPrefix(classId), count),
      ]),
    ),
  };
}

function participantDomainsFromDomains(
  domains: Record<string, string[]>,
): Record<string, string[]> | undefined {
  const entries = Object.entries(domains)
    .filter(([typeId]) => typeId.startsWith("DataClass_Role_"))
    .map(([typeId, ids]) => [typeId.replace(/^DataClass_Role_/, ""), ids]);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isNumberMap(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    !Array.isArray(value) &&
    Object.values(value).every((entry: unknown) => {
      return typeof entry === "number" && Number.isInteger(entry) && entry >= 0;
    })
  );
}

function numberedIds(prefix: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Domain limits must be non-negative integers.");
  }

  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

function domainPrefix(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9]/g, "");

  if (!normalized) {
    return "id";
  }

  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function parseOptionalJsonField(
  value: unknown,
  fieldName: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "string") {
    return { ok: true, value };
  }

  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return {
      ok: false,
      message: `Tool input field "${fieldName}" must be valid JSON when provided as a string.`,
    };
  }
}

function parseOptionalNumber(
  value: unknown,
  fieldName: string,
): { ok: true; value?: number } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      ok: false,
      message: `Tool input field "${fieldName}" must be a non-negative number.`,
    };
  }

  return { ok: true, value: parsed };
}

function isIdentifierDomains(
  value: unknown,
): value is Record<string, string[]> {
  return isParticipantIdsByRole(value);
}

function isFixedParticipantsByCaseAndRole(
  value: unknown,
): value is Record<string, Record<string, string>> {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (assignments) =>
      isRecord(assignments) &&
      !Array.isArray(assignments) &&
      Object.values(assignments).every(
        (participantId) => typeof participantId === "string",
      ),
  );
}
