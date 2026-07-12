import type { ObjectAwareChoreographyContext } from "../../../context/objectAwareChoreographyContext.js";
import { buildIsolatedCaseSemantics } from "../../../semantics/isolatedCaseSemantics.js";
import type {
  BsplMessageSchema,
  BsplProtocol,
} from "../../../targets/bspl/bsplTypes.js";
import {
  fireTransition,
  getEnabledTransitions,
  markingKey,
  toAnalysisPetriNet,
  type AnalysisPetriNet,
  type Marking,
} from "../../../targets/petriNet/firing.js";
import type { PetriNetBuilder } from "../../../targets/petriNet/petriNetBuilder.js";
import { bsplMessageName } from "../parameterMapping.js";

export type TraceLabel = string;
export type SendTrace = readonly TraceLabel[];

export type TraceLanguage = {
  traces: SendTrace[];
};

export type LanguageComparisonResult = {
  choreographyTraceCount: number;
  protocolTraceCount: number;
  sharedTraceCount: number;
  recall: number;
  precision: number;
  choreographyOnly: SendTrace[];
  protocolOnly: SendTrace[];
  shared: SendTrace[];
};

export type TraceLanguageOptions = {
  maxStates?: number;
  maxTraces?: number;
};

type SearchState = {
  globallyBound: ReadonlySet<string>;
  roleKnowledge: ReadonlyMap<string, ReadonlySet<string>>;
  trace: string[];
};

type MarkingTraceState = {
  marking: Marking;
  trace: string[];
};

const DEFAULT_MAX_STATES = 100000;
const DEFAULT_MAX_TRACES = 100000;
const COMPLETED_PARAMETER = "completed";

export function computeBsplMessageEmissionLanguage(
  protocol: BsplProtocol,
  options: TraceLanguageOptions = {},
): TraceLanguage {
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const maxTraces = options.maxTraces ?? DEFAULT_MAX_TRACES;
  const traces: SendTrace[] = [];
  const visited = new Set<string>();
  const queue: SearchState[] = [
    {
      globallyBound: new Set(),
      roleKnowledge: new Map(
        protocol.roles.map((role) => [role, new Set<string>()]),
      ),
      trace: [],
    },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const currentKey = bsplStateKey(current);

    if (visited.has(currentKey)) {
      continue;
    }

    if (visited.size >= maxStates) {
      throw new Error(
        `BSPL message-emission language generation exceeded maximum of ${maxStates} states`,
      );
    }

    visited.add(currentKey);

    if (current.globallyBound.has(COMPLETED_PARAMETER)) {
      traces.push(current.trace);

      if (traces.length > maxTraces) {
        throw new Error(
          `BSPL message-emission language generation exceeded maximum of ${maxTraces} terminal traces`,
        );
      }

      continue;
    }

    const enabledMessages = protocol.messages
      .filter((candidate) => isBsplMessageEnabled(candidate, current))
      .sort((left, right) => left.id.localeCompare(right.id));

    if (enabledMessages.length === 0) {
      traces.push(current.trace);

      if (traces.length > maxTraces) {
        throw new Error(
          `BSPL message-emission language generation exceeded maximum of ${maxTraces} terminal traces`,
        );
      }

      continue;
    }

    for (const message of enabledMessages) {
      queue.push({
        ...fireBsplMessage(current, message),
        // Current BsplMessageSchema.name is the normalized choreography task
        // label. Technical schema variants differ by id, not by name.
        trace: [...current.trace, message.name],
      });
    }
  }

  return { traces: deduplicateAndSortTraces(traces) };
}

export function computePetriNetSendLanguage(
  petriNet: PetriNetBuilder,
  options: TraceLanguageOptions = {},
): TraceLanguage {
  const net = toAnalysisPetriNet(petriNet);
  return computeAnalysisPetriNetSendLanguage(net, options);
}

export function compareTraceLanguages(
  choreographyLanguage: TraceLanguage,
  protocolLanguage: TraceLanguage,
): LanguageComparisonResult {
  const choreographyTraces = deduplicateAndSortTraces(
    choreographyLanguage.traces,
  );
  const protocolTraces = deduplicateAndSortTraces(protocolLanguage.traces);
  const choreographyByKey = new Map(
    choreographyTraces.map((trace) => [canonicalTraceKey(trace), trace]),
  );
  const protocolByKey = new Map(
    protocolTraces.map((trace) => [canonicalTraceKey(trace), trace]),
  );
  const shared = deduplicateAndSortTraces(
    choreographyTraces.filter((trace) =>
      protocolByKey.has(canonicalTraceKey(trace)),
    ),
  );
  const choreographyOnly = choreographyTraces.filter(
    (trace) => !protocolByKey.has(canonicalTraceKey(trace)),
  );
  const protocolOnly = protocolTraces.filter(
    (trace) => !choreographyByKey.has(canonicalTraceKey(trace)),
  );

  return {
    choreographyTraceCount: choreographyTraces.length,
    protocolTraceCount: protocolTraces.length,
    sharedTraceCount: shared.length,
    recall: ratio(
      shared.length,
      choreographyTraces.length,
      protocolTraces.length,
    ),
    precision: ratio(
      shared.length,
      protocolTraces.length,
      choreographyTraces.length,
    ),
    choreographyOnly,
    protocolOnly,
    shared,
  };
}

export function compareChoreographyAndBsplBehavior(
  context: ObjectAwareChoreographyContext,
  protocol: BsplProtocol,
  options: TraceLanguageOptions = {},
): LanguageComparisonResult {
  const semantics = buildIsolatedCaseSemantics(context);
  const choreographyLanguage = computeAnalysisPetriNetSendLanguage(
    semantics.analysisPetriNet,
    options,
  );
  const protocolLanguage = computeBsplMessageEmissionLanguage(
    protocol,
    options,
  );

  return compareTraceLanguages(choreographyLanguage, protocolLanguage);
}

export function canonicalTraceKey(trace: SendTrace): string {
  return JSON.stringify(trace);
}

function computeAnalysisPetriNetSendLanguage(
  net: AnalysisPetriNet,
  options: TraceLanguageOptions,
): TraceLanguage {
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const maxTraces = options.maxTraces ?? DEFAULT_MAX_TRACES;
  const traces: SendTrace[] = [];
  const visited = new Set<string>();
  const finalPlaceIds = finalPlaceIdsFor(net);
  const queue: MarkingTraceState[] = [
    { marking: net.initialMarking, trace: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const currentKey = `${markingKey(current.marking)}::${canonicalTraceKey(
      current.trace,
    )}`;

    if (visited.has(currentKey)) {
      continue;
    }

    if (visited.size >= maxStates) {
      throw new Error(
        `Petri-net send-language generation exceeded maximum of ${maxStates} states`,
      );
    }

    visited.add(currentKey);

    if (isCompleteMarking(current.marking, finalPlaceIds)) {
      traces.push(current.trace);

      if (traces.length > maxTraces) {
        throw new Error(
          `Petri-net send-language generation exceeded maximum of ${maxTraces} complete traces`,
        );
      }

      continue;
    }

    for (const transitionId of getEnabledTransitions(
      net,
      current.marking,
    ).sort()) {
      const nextMarking = fireTransition(net, current.marking, transitionId);
      const label = visibleSendLabel(net, transitionId);

      queue.push({
        marking: nextMarking,
        trace: label ? [...current.trace, label] : current.trace,
      });
    }
  }

  return { traces: deduplicateAndSortTraces(traces) };
}

function isBsplMessageEnabled(
  message: BsplMessageSchema,
  state: SearchState,
): boolean {
  const senderKnowledge = knowledgeForRole(state, message.sender);

  return message.parameters.every((parameter) => {
    if (parameter.adornment === "in") {
      return senderKnowledge.has(parameter.name);
    }

    if (parameter.adornment === "nil") {
      // BSPL parameters are single-assignment within an enactment, so nil is
      // interpreted globally: once produced by any message, it is no longer nil.
      return !state.globallyBound.has(parameter.name);
    }

    return !state.globallyBound.has(parameter.name);
  });
}

function fireBsplMessage(
  state: SearchState,
  message: BsplMessageSchema,
): Omit<SearchState, "trace"> {
  const globallyBound = new Set(state.globallyBound);
  const roleKnowledge = cloneRoleKnowledge(state.roleKnowledge);
  const transmittedParameters = message.parameters
    .filter(
      (parameter) =>
        parameter.adornment === "in" || parameter.adornment === "out",
    )
    .map((parameter) => parameter.name);

  for (const parameter of message.parameters) {
    if (parameter.adornment === "out") {
      globallyBound.add(parameter.name);
    }
  }

  // Following the prior chor2bspl trace semantics, sender and receiver both
  // learn the parameters carried in the emitted schema. Other roles do not.
  addRoleKnowledge(roleKnowledge, message.sender, transmittedParameters);
  addRoleKnowledge(roleKnowledge, message.receiver, transmittedParameters);

  return { globallyBound, roleKnowledge };
}

function bsplStateKey(state: SearchState): string {
  return [
    [...state.globallyBound].sort().join("|"),
    roleKnowledgeKey(state.roleKnowledge),
    canonicalTraceKey(state.trace),
  ].join("::");
}

function finalPlaceIdsFor(net: AnalysisPetriNet): string[] {
  const finalPlaceIds = net.places.filter(
    (placeId) =>
      placeId === "p_sink" || net.placeLabels.get(placeId) === "sink",
  );

  if (finalPlaceIds.length === 0) {
    throw new Error(
      "Cannot infer Petri-net completion marking: expected final place p_sink or a place labeled sink",
    );
  }

  return finalPlaceIds.sort();
}

function isCompleteMarking(
  marking: Marking,
  finalPlaceIds: readonly string[],
): boolean {
  return finalPlaceIds.some((placeId) => (marking.get(placeId) ?? 0) > 0);
}

function visibleSendLabel(
  net: AnalysisPetriNet,
  transitionId: string,
): string | undefined {
  const label = net.transitionLabels.get(transitionId) ?? transitionId;

  // The current Petri-net representation does not attach structured origin
  // metadata to transitions. Prefer labels stored on transitions and use ID
  // prefixes only to classify generated sender-side interaction transitions.
  if (
    transitionId.startsWith("t_send_") ||
    transitionId.startsWith("t_sync_send_") ||
    transitionId.startsWith("t_comb_send_")
  ) {
    return canonicalVisibleTaskLabel(stripSendSuffix(label), transitionId);
  }

  if (
    transitionId.startsWith("t_recv_") ||
    transitionId.startsWith("t_sync_recv_") ||
    transitionId.startsWith("t_comb_recv_") ||
    transitionId.startsWith("t_local_") ||
    transitionId.startsWith("t_create_1to1_") ||
    transitionId.startsWith("t_xor_") ||
    transitionId.startsWith("t_parallel_")
  ) {
    return undefined;
  }

  if (/^t_ChoreographyTask[-_]/.test(transitionId)) {
    return canonicalVisibleTaskLabel(label, transitionId);
  }

  return undefined;
}

function canonicalVisibleTaskLabel(label: string, fallbackId: string): string {
  return bsplMessageName(label, fallbackId);
}

function stripSendSuffix(label: string): string {
  return label
    .replace(/\s+combined send$/, "")
    .replace(/\s+sync send$/, "")
    .replace(/\s+send$/, "");
}

function knowledgeForRole(
  state: SearchState,
  role: string,
): ReadonlySet<string> {
  return state.roleKnowledge.get(role) ?? new Set();
}

function cloneRoleKnowledge(
  roleKnowledge: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, Set<string>> {
  return new Map(
    [...roleKnowledge.entries()].map(([role, knowledge]) => [
      role,
      new Set(knowledge),
    ]),
  );
}

function addRoleKnowledge(
  roleKnowledge: Map<string, Set<string>>,
  role: string,
  parameters: readonly string[],
): void {
  const knowledge = roleKnowledge.get(role) ?? new Set<string>();

  for (const parameter of parameters) {
    knowledge.add(parameter);
  }

  roleKnowledge.set(role, knowledge);
}

function roleKnowledgeKey(
  roleKnowledge: ReadonlyMap<string, ReadonlySet<string>>,
): string {
  return [...roleKnowledge.entries()]
    .sort(([leftRole], [rightRole]) => leftRole.localeCompare(rightRole))
    .map(([role, knowledge]) => `${role}:${[...knowledge].sort().join(",")}`)
    .join("|");
}

function deduplicateAndSortTraces(traces: readonly SendTrace[]): SendTrace[] {
  const byKey = new Map<string, SendTrace>();

  for (const trace of traces) {
    byKey.set(canonicalTraceKey(trace), [...trace]);
  }

  return [...byKey.values()].sort(compareTraces);
}

function compareTraces(left: SendTrace, right: SendTrace): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }

  return canonicalTraceKey(left).localeCompare(canonicalTraceKey(right));
}

function ratio(
  sharedCount: number,
  denominator: number,
  otherSize: number,
): number {
  if (denominator === 0) {
    return otherSize === 0 ? 1 : 0;
  }

  return sharedCount / denominator;
}
