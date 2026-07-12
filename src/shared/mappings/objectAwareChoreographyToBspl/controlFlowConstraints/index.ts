import type { Choreography, ChoreographyTask, FlowNode } from "bpmn-moddle";
import type { ObjectAwareChoreographyContext } from "../../../context/objectAwareChoreographyContext.js";
import {
  compareTraceLanguages,
  computeBsplMessageEmissionLanguage,
  computePetriNetSendLanguage,
  type SendTrace,
  type TraceLanguage,
  type TraceLanguageOptions,
} from "../behaviorComparison/index.js";
import type { BsplProtocol } from "../../../targets/bspl/bsplTypes.js";
import {
  buildIncomingFlowsByNodeId,
  buildNodesById,
  buildOutgoingFlowsByNodeId,
  determineGatewayDirection,
  getChoreographyTasks,
  getEventBasedGateways,
  getExclusiveGateways,
  getParallelGateways,
} from "../../../source/objectAwareChoreography/choreography/choreography.js";
import { isBpmnType } from "../../../source/objectAwareChoreography/choreography/bpmn.js";
import { getDecisionGuards } from "../../../source/objectAwareChoreography/decision/decisionGuards.js";
import { computeDecisionRegion } from "../../../source/objectAwareChoreography/decision/affectedRoles.js";
import {
  bsplMessageName,
  buildBsplParameterMapping,
} from "../parameterMapping.js";
import { buildIsolatedCaseSemantics } from "../../../semantics/isolatedCaseSemantics.js";

export { refineBsplWithControlFlowConstraints } from "./refineBsplWithControlFlowConstraints.js";

export type ControlFlowConstraint =
  | PrecedenceConstraint
  | DisjunctivePrecedenceConstraint
  | ExclusionConstraint
  | GuardInformationConstraint;

export type PrecedenceConstraint = {
  kind: "precedence";
  id: string;
  predecessor: string;
  constrained: string;
  source: ConstraintSource;
  violatingTraces: string[][];
};

export type DisjunctivePrecedenceConstraint = {
  kind: "disjunctivePrecedence";
  id: string;
  alternatives: string[];
  constrained: string;
  source: ConstraintSource;
  violatingTraces: string[][];
};

export type ExclusionConstraint = {
  kind: "exclusion";
  id: string;
  tasks: [string, string];
  source: ConstraintSource;
  violatingTraces: string[][];
};

export type GuardInformationConstraint = {
  kind: "guardInformation";
  id: string;
  guardedTask: string;
  objectClass: string;
  objectState: string;
  requiredInAlternatives?: string[][];
  requiredIn: string[];
  requiredNil: string[];
  source: ConstraintSource;
  violatingTraces: string[][];
};

export type ConstraintSource = {
  reason:
    | "sequence"
    | "parallelJoin"
    | "exclusiveJoin"
    | "exclusiveSplit"
    | "eventBasedSplit"
    | "guardedExclusiveSplit";
  gatewayId?: string;
  branchId?: string;
  explanation: string;
};

export type ControlFlowConstraintDiscoveryResult = {
  comparison: {
    choreographyTraceCount: number;
    protocolTraceCount: number;
    sharedTraceCount: number;
    recall: number;
    precision: number;
    protocolOnly: string[][];
  };
  constraints: ControlFlowConstraint[];
};

export type FirstDeviation = {
  trace: string[];
  prefix: string[];
  task: string;
  position: number;
};

type ConstraintAccumulator = Map<string, ControlFlowConstraint>;

type BranchMembership = {
  reason: "exclusiveSplit" | "eventBasedSplit" | "guardedExclusiveSplit";
  gatewayId: string;
  branchId: string;
};

type ControlFlowFacts = {
  taskNames: string[];
  directPredecessorsByTask: Map<string, string[]>;
  branchMembershipByTask: Map<string, BranchMembership[]>;
  firstBranchTaskGroups: FirstBranchTaskGroup[];
  guardedBranchByTask: Map<
    string,
    {
      gatewayId: string;
      branchId: string;
      classId: string;
      stateId: string;
    }
  >;
  postJoinTasks: Map<
    string,
    { reason: "parallelJoin" | "exclusiveJoin"; alternatives: string[] }
  >;
};

type FirstBranchTaskGroup = {
  reason: "exclusiveSplit" | "eventBasedSplit" | "guardedExclusiveSplit";
  gatewayId: string;
  entries: Array<{ task: string; branchId: string }>;
};

export function discoverControlFlowConstraints(
  context: ObjectAwareChoreographyContext,
  protocol: BsplProtocol,
  options: TraceLanguageOptions = {},
): ControlFlowConstraintDiscoveryResult {
  validateConstraintDiscoveryPreconditions(context.choreography);

  const semantics = buildIsolatedCaseSemantics(context);
  const choreographyLanguage = computePetriNetSendLanguage(
    semantics.petriNet,
    options,
  );
  const protocolLanguage = computeBsplMessageEmissionLanguage(
    protocol,
    options,
  );
  const comparison = compareTraceLanguages(
    choreographyLanguage,
    protocolLanguage,
  );
  const protocolTaskNames = new Set(
    protocol.messages.map((message) => message.name),
  );
  const facts = buildControlFlowFacts(context.choreography, protocolTaskNames);
  const constraints: ConstraintAccumulator = new Map();

  for (const trace of comparison.protocolOnly) {
    const deviation = findFirstDeviation(choreographyLanguage, trace);

    if (!deviation) {
      continue;
    }

    deriveConstraintsForDeviation({
      context,
      facts,
      choreographyLanguage,
      deviation,
      constraints,
    });
  }

  return {
    comparison: {
      choreographyTraceCount: comparison.choreographyTraceCount,
      protocolTraceCount: comparison.protocolTraceCount,
      sharedTraceCount: comparison.sharedTraceCount,
      recall: comparison.recall,
      precision: comparison.precision,
      protocolOnly: comparison.protocolOnly.map((trace) => [...trace]),
    },
    constraints: [...constraints.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}

function validateConstraintDiscoveryPreconditions(
  choreography: Choreography,
): void {
  validateNoEmptyBranchesForConstraintDiscovery(choreography);
}

function validateNoEmptyBranchesForConstraintDiscovery(
  choreography: Choreography,
): void {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);

  for (const gateway of getExclusiveGateways(choreography).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];

    if (
      determineGatewayDirection(gateway, incomingFlows, outgoingFlows) !==
      "split"
    ) {
      continue;
    }

    const region = computeDecisionRegion(choreography, gateway);

    for (const flow of outgoingFlows) {
      const firstTasks = firstObservableTasks(
        choreography,
        flow.targetRef?.id,
        {
          stopNodeIds: new Set([gateway.id, ...region.exitNodeIds]),
        },
      );

      if (firstTasks.length === 0) {
        throw new Error(
          `Control-flow constraint discovery does not support an empty exclusive branch: outgoing flow ${
            flow.id
          } of exclusive gateway ${
            gateway.name ?? gateway.id
          } has no observable task before the matching join.`,
        );
      }
    }
  }

  for (const gateway of getEventBasedGateways(choreography).sort(
    (left, right) => left.id.localeCompare(right.id),
  )) {
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];
    const matchingJoinId = findMatchingJoinForSplit(
      choreography,
      outgoingFlows.map((flow) => flow.targetRef?.id),
    );

    for (const flow of outgoingFlows) {
      const firstTasks = firstObservableTasks(
        choreography,
        flow.targetRef?.id,
        {
          stopNodeIds: matchingJoinId ? new Set([matchingJoinId]) : undefined,
        },
      );

      if (firstTasks.length === 0) {
        throw new Error(
          `Control-flow constraint discovery does not support an empty event-based branch: outgoing flow ${
            flow.id
          } of event-based gateway ${
            gateway.name ?? gateway.id
          } has no observable task before the matching join.`,
        );
      }
    }
  }
}

export function findFirstDeviation(
  choreographyLanguage: TraceLanguage,
  protocolTrace: SendTrace,
): FirstDeviation | undefined {
  const prefixes = buildPrefixKeys(choreographyLanguage);

  for (let i = 0; i < protocolTrace.length; i += 1) {
    const prefixWithTask = protocolTrace.slice(0, i + 1);

    if (!prefixes.has(traceKey(prefixWithTask))) {
      return {
        trace: [...protocolTrace],
        prefix: [...protocolTrace.slice(0, i)],
        task: protocolTrace[i],
        position: i,
      };
    }
  }

  return undefined;
}

function deriveConstraintsForDeviation(args: {
  context: ObjectAwareChoreographyContext;
  facts: ControlFlowFacts;
  choreographyLanguage: TraceLanguage;
  deviation: FirstDeviation;
  constraints: ConstraintAccumulator;
}): void {
  deriveFirstBranchTaskExclusions(args);
  deriveExclusions(args);
  derivePrecedence(args);
  deriveGuardInformation(args);
}

function deriveFirstBranchTaskExclusions(args: {
  facts: ControlFlowFacts;
  deviation: FirstDeviation;
  constraints: ConstraintAccumulator;
}): void {
  const traceTasks = new Set(args.deviation.trace);

  for (const group of args.facts.firstBranchTaskGroups) {
    const presentEntries = group.entries.filter((entry) =>
      traceTasks.has(entry.task),
    );

    for (let leftIndex = 0; leftIndex < presentEntries.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < presentEntries.length;
        rightIndex += 1
      ) {
        const left = presentEntries[leftIndex];
        const right = presentEntries[rightIndex];

        if (left.branchId === right.branchId) {
          continue;
        }

        const tasks = [left.task, right.task].sort() as [string, string];

        addConstraint(args.constraints, {
          kind: "exclusion",
          id: `exclusion:${tasks[0]}!${tasks[1]}`,
          tasks,
          source: {
            reason: group.reason,
            gatewayId: group.gatewayId,
            explanation: `Tasks ${tasks[0]} and ${tasks[1]} are first observable tasks in alternative branches of gateway ${group.gatewayId}.`,
          },
          violatingTraces: [args.deviation.trace],
        });
      }
    }
  }
}

function derivePrecedence(args: {
  facts: ControlFlowFacts;
  choreographyLanguage: TraceLanguage;
  deviation: FirstDeviation;
  constraints: ConstraintAccumulator;
}): void {
  const { choreographyLanguage, deviation, constraints, facts } = args;
  const prefixTasks = new Set(deviation.prefix);
  const postJoinFact = facts.postJoinTasks.get(deviation.task);
  const isGuardedBranchTask = facts.guardedBranchByTask.has(deviation.task);

  if (postJoinFact?.reason === "exclusiveJoin") {
    const alternatives = postJoinFact.alternatives.filter(
      (alternative) => !prefixTasks.has(alternative),
    );

    if (
      alternatives.length === postJoinFact.alternatives.length &&
      alternatives.length > 1
    ) {
      addConstraint(constraints, {
        kind: "disjunctivePrecedence",
        id: `disjunctivePrecedence:${alternatives.join("|")}->${
          deviation.task
        }`,
        alternatives,
        constrained: deviation.task,
        source: {
          reason: "exclusiveJoin",
          explanation: `Task ${deviation.task} requires one completed alternative branch before it can occur.`,
        },
        violatingTraces: [deviation.trace],
      });
    }

    return;
  }

  const directPredecessors =
    facts.directPredecessorsByTask.get(deviation.task) ?? [];
  const requiredPredecessors = directPredecessors.filter((task) => {
    if (prefixTasks.has(task)) {
      return false;
    }

    // Guard-information constraints encode object-state preconditions for
    // guarded branches. Keep only explicit control-flow backbone dependencies
    // that cannot be represented by the guard itself.
    return !isGuardedBranchTask || facts.postJoinTasks.has(task);
  });

  for (const predecessor of requiredPredecessors) {
    const source: ConstraintSource = postJoinFact?.alternatives.includes(
      predecessor,
    )
      ? {
          reason: postJoinFact.reason,
          explanation: `Task ${deviation.task} is after a join and requires branch task ${predecessor}.`,
        }
      : {
          reason: "sequence",
          explanation: `Task ${deviation.task} is not enabled until ${predecessor} has occurred.`,
        };

    addConstraint(constraints, {
      kind: "precedence",
      id: `precedence:${predecessor}->${deviation.task}`,
      predecessor,
      constrained: deviation.task,
      source,
      violatingTraces: [deviation.trace],
    });
  }

  if (requiredPredecessors.length > 0) {
    return;
  }

  if (isGuardedBranchTask) {
    return;
  }

  const tracesWithTask = choreographyLanguage.traces.filter((trace) =>
    trace.includes(deviation.task),
  );
  const predecessorSets = tracesWithTask.map(
    (trace) => new Set(trace.slice(0, trace.indexOf(deviation.task))),
  );
  const alternativePredecessors = unionMany(predecessorSets).filter(
    (task) => directPredecessors.includes(task) && !prefixTasks.has(task),
  );

  if (
    alternativePredecessors.length > 1 &&
    tracesWithTask.every((trace) =>
      alternativePredecessors.some(
        (alternative) =>
          trace.indexOf(alternative) < trace.indexOf(deviation.task),
      ),
    )
  ) {
    const alternatives = alternativePredecessors.sort();

    addConstraint(constraints, {
      kind: "disjunctivePrecedence",
      id: `disjunctivePrecedence:${alternatives.join("|")}->${deviation.task}`,
      alternatives,
      constrained: deviation.task,
      source: {
        reason: "exclusiveJoin",
        explanation: `Task ${deviation.task} requires one completed alternative branch before it can occur.`,
      },
      violatingTraces: [deviation.trace],
    });
  }
}

function deriveExclusions(args: {
  facts: ControlFlowFacts;
  deviation: FirstDeviation;
  constraints: ConstraintAccumulator;
}): void {
  const { facts, deviation, constraints } = args;

  for (const existingTask of new Set(deviation.prefix)) {
    const source = commonBranchSource(facts, existingTask, deviation.task);

    if (!source) {
      continue;
    }

    const tasks = [existingTask, deviation.task].sort() as [string, string];

    addConstraint(constraints, {
      kind: "exclusion",
      id: `exclusion:${tasks[0]}!${tasks[1]}`,
      tasks,
      source,
      violatingTraces: [deviation.trace],
    });
  }
}

function deriveGuardInformation(args: {
  context: ObjectAwareChoreographyContext;
  facts: ControlFlowFacts;
  deviation: FirstDeviation;
  constraints: ConstraintAccumulator;
}): void {
  const guardedBranch = args.facts.guardedBranchByTask.get(args.deviation.task);

  if (!guardedBranch) {
    return;
  }

  const parameterMapping = buildBsplParameterMapping({
    dataModel: args.context.dataModel,
    lifecycleModel: args.context.lifecycleModel,
  });
  const lifecycle = args.context.lifecycleModel.lifecycles.get(
    guardedBranch.classId,
  );
  const objectIdentifier = parameterMapping.objectIdentifier(
    guardedBranch.classId,
  );
  const stateSignatures = parameterMapping.stateSignature(
    guardedBranch.classId,
    guardedBranch.stateId,
  );
  const requiredInAlternatives = (
    stateSignatures.length > 0 ? stateSignatures : [[]]
  ).map((signature) => [...new Set([...objectIdentifier, ...signature])].sort());
  const requiredIn = [
    ...new Set(requiredInAlternatives.flat()),
  ].sort();
  const requiredNil = lifecycle
    ? [
        ...new Set(
          lifecycle.transitions
            .filter((transition) => transition.source === guardedBranch.stateId)
            .flatMap((transition) =>
              parameterMapping.stateSignature(
                guardedBranch.classId,
                transition.target,
              ),
            )
            .flat(),
        ),
      ]
        .filter((parameter) => !requiredIn.includes(parameter))
        .sort()
    : [];

  addConstraint(args.constraints, {
    kind: "guardInformation",
    id: `guardInformation:${guardedBranch.gatewayId}:${guardedBranch.branchId}:${args.deviation.task}`,
    guardedTask: args.deviation.task,
    objectClass: guardedBranch.classId,
    objectState: guardedBranch.stateId,
    requiredInAlternatives,
    requiredIn,
    requiredNil,
    source: {
      reason: "guardedExclusiveSplit",
      gatewayId: guardedBranch.gatewayId,
      branchId: guardedBranch.branchId,
      explanation: `Task ${args.deviation.task} is the first task on a guarded exclusive branch and requires the guard information.`,
    },
    violatingTraces: [args.deviation.trace],
  });
}

function buildControlFlowFacts(
  choreography: Choreography,
  protocolTaskNames: Set<string>,
): ControlFlowFacts {
  const facts: ControlFlowFacts = {
    taskNames: [...protocolTaskNames].sort(),
    directPredecessorsByTask: new Map(),
    branchMembershipByTask: new Map(),
    firstBranchTaskGroups: [],
    guardedBranchByTask: new Map(),
    postJoinTasks: new Map(),
  };

  addExclusiveBranchFacts(choreography, facts, protocolTaskNames);
  addEventBasedBranchFacts(choreography, facts, protocolTaskNames);
  addJoinFacts(choreography, facts, protocolTaskNames);
  addDirectPredecessorFacts(choreography, facts, protocolTaskNames);

  return facts;
}

function addDirectPredecessorFacts(
  choreography: Choreography,
  facts: ControlFlowFacts,
  protocolTaskNames: Set<string>,
): void {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);

  for (const task of getChoreographyTasks(choreography)) {
    const label = taskLabel(task);

    if (!protocolTaskNames.has(label)) {
      continue;
    }

    const directPredecessors = [
      ...new Set(
        (incomingFlowsByNodeId.get(task.id) ?? [])
          .flatMap((flow) =>
            collectLastTasksBefore(choreography, flow.sourceRef?.id),
          )
          .map(taskLabel)
          .filter((predecessor) => protocolTaskNames.has(predecessor)),
      ),
    ].sort();

    facts.directPredecessorsByTask.set(label, directPredecessors);
  }
}

function addExclusiveBranchFacts(
  choreography: Choreography,
  facts: ControlFlowFacts,
  protocolTaskNames: Set<string>,
): void {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const guards = getDecisionGuards(choreography);

  for (const gateway of getExclusiveGateways(choreography)) {
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];

    if (
      determineGatewayDirection(gateway, incomingFlows, outgoingFlows) !==
      "split"
    ) {
      continue;
    }

    const region = computeDecisionRegion(choreography, gateway);

    const firstBranchEntries: FirstBranchTaskGroup["entries"] = [];
    let firstBranchReason: FirstBranchTaskGroup["reason"] = "exclusiveSplit";

    for (const flow of outgoingFlows) {
      const branchId = flow.id;
      const branchTasks = collectTasksUntil(choreography, flow.targetRef?.id, {
        stopNodeIds: new Set([gateway.id, ...region.exitNodeIds]),
      });
      const guard = guards.get(flow.id);
      const reason = guard ? "guardedExclusiveSplit" : "exclusiveSplit";
      firstBranchReason =
        firstBranchReason === "guardedExclusiveSplit" || guard
          ? "guardedExclusiveSplit"
          : "exclusiveSplit";

      for (const task of branchTasks) {
        const label = taskLabel(task);
        if (!protocolTaskNames.has(label)) {
          continue;
        }
        addBranchMembership(facts, label, {
          reason,
          gatewayId: gateway.id,
          branchId,
        });
      }

      const firstTasks = firstObservableTasks(
        choreography,
        flow.targetRef?.id,
        {
          stopNodeIds: new Set([gateway.id, ...region.exitNodeIds]),
        },
      );

      if (guard) {
        for (const task of firstTasks) {
          const label = taskLabel(task);
          if (!protocolTaskNames.has(label)) {
            continue;
          }
          facts.guardedBranchByTask.set(label, {
            gatewayId: gateway.id,
            branchId,
            classId: guard.classId,
            stateId: guard.stateId,
          });
        }
      }

      for (const task of firstTasks) {
        const label = taskLabel(task);
        if (!protocolTaskNames.has(label)) {
          continue;
        }
        firstBranchEntries.push({ task: label, branchId });
      }
    }

    addFirstBranchTaskGroup(facts, {
      reason: firstBranchReason,
      gatewayId: gateway.id,
      entries: firstBranchEntries,
    });
  }
}

function addEventBasedBranchFacts(
  choreography: Choreography,
  facts: ControlFlowFacts,
  protocolTaskNames: Set<string>,
): void {
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);

  for (const gateway of getEventBasedGateways(choreography)) {
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];
    const matchingJoinId = findMatchingJoinForSplit(
      choreography,
      outgoingFlows.map((flow) => flow.targetRef?.id),
    );

    const firstBranchEntries: FirstBranchTaskGroup["entries"] = [];

    for (const flow of outgoingFlows) {
      const branchTasks = collectTasksUntil(choreography, flow.targetRef?.id, {
        stopNodeIds: matchingJoinId ? new Set([matchingJoinId]) : undefined,
      });

      for (const task of branchTasks) {
        const label = taskLabel(task);
        if (!protocolTaskNames.has(label)) {
          continue;
        }
        addBranchMembership(facts, label, {
          reason: "eventBasedSplit",
          gatewayId: gateway.id,
          branchId: flow.id,
        });
      }

      const firstTasks = firstObservableTasks(
        choreography,
        flow.targetRef?.id,
        {
          stopNodeIds: matchingJoinId ? new Set([matchingJoinId]) : undefined,
        },
      );

      for (const task of firstTasks) {
        const label = taskLabel(task);
        if (!protocolTaskNames.has(label)) {
          continue;
        }
        firstBranchEntries.push({ task: label, branchId: flow.id });
      }
    }

    addFirstBranchTaskGroup(facts, {
      reason: "eventBasedSplit",
      gatewayId: gateway.id,
      entries: firstBranchEntries,
    });
  }
}

function addJoinFacts(
  choreography: Choreography,
  facts: ControlFlowFacts,
  protocolTaskNames: Set<string>,
): void {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);

  for (const gateway of [
    ...getExclusiveGateways(choreography),
    ...getParallelGateways(choreography),
  ]) {
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];

    if (
      determineGatewayDirection(gateway, incomingFlows, outgoingFlows) !==
      "join"
    ) {
      continue;
    }

    const reason = isBpmnType(gateway, "bpmn:ParallelGateway")
      ? "parallelJoin"
      : "exclusiveJoin";
    const alternatives = incomingFlows
      .flatMap((flow) =>
        collectLastTasksBefore(choreography, flow.sourceRef?.id),
      )
      .map(taskLabel)
      .filter((label) => protocolTaskNames.has(label))
      .sort();

    for (const flow of outgoingFlows) {
      for (const task of firstObservableTasks(
        choreography,
        flow.targetRef?.id,
      )) {
        const label = taskLabel(task);
        if (!protocolTaskNames.has(label)) {
          continue;
        }
        facts.postJoinTasks.set(label, { reason, alternatives });
      }
    }
  }
}

function firstObservableTasks(
  choreography: Choreography,
  startNodeId: string | undefined,
  options: { stopNodeIds?: Set<string> } = {},
): ChoreographyTask[] {
  const nodesById = buildNodesById(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const queue = startNodeId ? [startNodeId] : [];
  const visited = new Set<string>();
  const tasks = new Map<string, ChoreographyTask>();

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (
      !currentId ||
      visited.has(currentId) ||
      options.stopNodeIds?.has(currentId)
    ) {
      continue;
    }

    visited.add(currentId);
    const node = nodesById.get(currentId);

    if (!node) {
      continue;
    }

    if (isBpmnType<ChoreographyTask>(node, "bpmn:ChoreographyTask")) {
      tasks.set(node.id, node);
      continue;
    }

    for (const flow of outgoingFlowsByNodeId.get(currentId) ?? []) {
      if (flow.targetRef?.id) {
        queue.push(flow.targetRef.id);
      }
    }
  }

  return [...tasks.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function collectTasksUntil(
  choreography: Choreography,
  startNodeId: string | undefined,
  options: { stopNodeIds?: Set<string> } = {},
): ChoreographyTask[] {
  const nodesById = buildNodesById(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const queue = startNodeId ? [startNodeId] : [];
  const visited = new Set<string>();
  const tasks = new Map<string, ChoreographyTask>();

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (
      !currentId ||
      visited.has(currentId) ||
      options.stopNodeIds?.has(currentId)
    ) {
      continue;
    }

    visited.add(currentId);
    const node = nodesById.get(currentId);

    if (!node) {
      continue;
    }

    if (isBpmnType<ChoreographyTask>(node, "bpmn:ChoreographyTask")) {
      tasks.set(node.id, node);
    }

    for (const flow of outgoingFlowsByNodeId.get(currentId) ?? []) {
      if (flow.targetRef?.id) {
        queue.push(flow.targetRef.id);
      }
    }
  }

  return [...tasks.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function collectLastTasksBefore(
  choreography: Choreography,
  startNodeId: string | undefined,
): ChoreographyTask[] {
  const nodesById = buildNodesById(choreography);
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const queue = startNodeId ? [startNodeId] : [];
  const visited = new Set<string>();
  const tasks = new Map<string, ChoreographyTask>();

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const node = nodesById.get(currentId);

    if (!node) {
      continue;
    }

    if (isBpmnType<ChoreographyTask>(node, "bpmn:ChoreographyTask")) {
      tasks.set(node.id, node);
      continue;
    }

    for (const flow of incomingFlowsByNodeId.get(currentId) ?? []) {
      if (flow.sourceRef?.id) {
        queue.push(flow.sourceRef.id);
      }
    }
  }

  return [...tasks.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function findMatchingJoinForSplit(
  choreography: Choreography,
  branchStartNodeIds: Array<string | undefined>,
): string | undefined {
  const reachableJoinDistances = branchStartNodeIds
    .filter((id): id is string => id !== undefined)
    .map((branchStartNodeId) =>
      collectReachableJoinDistances(choreography, branchStartNodeId),
    );

  if (reachableJoinDistances.length === 0) {
    return undefined;
  }

  const commonJoinIds = [...reachableJoinDistances[0].keys()].filter((joinId) =>
    reachableJoinDistances.every((distances) => distances.has(joinId)),
  );

  return commonJoinIds.sort((left, right) => {
    const leftDistance = Math.max(
      ...reachableJoinDistances.map((distances) => distances.get(left) ?? 0),
    );
    const rightDistance = Math.max(
      ...reachableJoinDistances.map((distances) => distances.get(right) ?? 0),
    );

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.localeCompare(right);
  })[0];
}

function collectReachableJoinDistances(
  choreography: Choreography,
  startNodeId: string,
): Map<string, number> {
  const nodesById = buildNodesById(choreography);
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const queue: Array<{ nodeId: string; distance: number }> = [
    { nodeId: startNodeId, distance: 0 },
  ];
  const visited = new Set<string>();
  const joinDistances = new Map<string, number>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || visited.has(current.nodeId)) {
      continue;
    }

    visited.add(current.nodeId);
    const node = nodesById.get(current.nodeId);

    if (!node) {
      continue;
    }

    const incomingFlows = incomingFlowsByNodeId.get(node.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(node.id) ?? [];

    if (
      (isBpmnType(node, "bpmn:ExclusiveGateway") ||
        isBpmnType(node, "bpmn:ParallelGateway")) &&
      determineGatewayDirection(node, incomingFlows, outgoingFlows) === "join"
    ) {
      joinDistances.set(node.id, current.distance);
      continue;
    }

    for (const flow of outgoingFlows) {
      if (flow.targetRef?.id) {
        queue.push({
          nodeId: flow.targetRef.id,
          distance: current.distance + 1,
        });
      }
    }
  }

  return joinDistances;
}

function addBranchMembership(
  facts: ControlFlowFacts,
  task: string,
  membership: BranchMembership,
): void {
  facts.branchMembershipByTask.set(task, [
    ...(facts.branchMembershipByTask.get(task) ?? []),
    membership,
  ]);
}

function addFirstBranchTaskGroup(
  facts: ControlFlowFacts,
  group: FirstBranchTaskGroup,
): void {
  const branchIds = new Set(group.entries.map((entry) => entry.branchId));

  if (branchIds.size < 2) {
    return;
  }

  facts.firstBranchTaskGroups.push({
    ...group,
    entries: [...group.entries].sort((left, right) => {
      const branchComparison = left.branchId.localeCompare(right.branchId);
      return branchComparison !== 0
        ? branchComparison
        : left.task.localeCompare(right.task);
    }),
  });
}

function commonBranchSource(
  facts: ControlFlowFacts,
  leftTask: string,
  rightTask: string,
): ConstraintSource | undefined {
  const leftMemberships = facts.branchMembershipByTask.get(leftTask) ?? [];
  const rightMemberships = facts.branchMembershipByTask.get(rightTask) ?? [];

  for (const left of leftMemberships) {
    const right = rightMemberships.find(
      (candidate) =>
        candidate.gatewayId === left.gatewayId &&
        candidate.branchId !== left.branchId,
    );

    if (!right) {
      continue;
    }

    const reason =
      left.reason === "eventBasedSplit" || right.reason === "eventBasedSplit"
        ? "eventBasedSplit"
        : left.reason === "guardedExclusiveSplit" ||
          right.reason === "guardedExclusiveSplit"
        ? "guardedExclusiveSplit"
        : "exclusiveSplit";

    return {
      reason,
      gatewayId: left.gatewayId,
      explanation: `Tasks ${leftTask} and ${rightTask} are in alternative branches of gateway ${left.gatewayId}.`,
    };
  }

  return undefined;
}

function addConstraint(
  constraints: ConstraintAccumulator,
  constraint: ControlFlowConstraint,
): void {
  const existing = constraints.get(constraint.id);

  if (!existing) {
    constraints.set(constraint.id, constraint);
    return;
  }

  const traceKeys = new Set(existing.violatingTraces.map(traceKey));

  for (const trace of constraint.violatingTraces) {
    if (!traceKeys.has(traceKey(trace))) {
      existing.violatingTraces.push(trace);
    }
  }
}

function buildPrefixKeys(language: TraceLanguage): Set<string> {
  const prefixes = new Set<string>();

  for (const trace of language.traces) {
    for (let length = 0; length <= trace.length; length += 1) {
      prefixes.add(traceKey(trace.slice(0, length)));
    }
  }

  return prefixes;
}

function unionMany(sets: Array<Set<string>>): string[] {
  return [...new Set(sets.flatMap((set) => [...set]))];
}

function traceKey(trace: readonly string[]): string {
  return JSON.stringify(trace);
}

function taskLabel(task: FlowNode): string {
  return bsplMessageName(task.name ?? task.id, task.id);
}
