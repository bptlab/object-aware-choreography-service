import type {
  PetriNetSemanticModel,
  PetriNetPlaceSemantics,
  PetriNetTransitionSemantics,
} from "../../mappings/objectAwareChoreographyToPetriNet/petriNetArtifact.js";
import type { AnalysisPetriNet, Marking } from "../../targets/petriNet/firing.js";
import type {
  BranchKind,
  DeadBranchAbsenceBranch,
} from "../objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";
import type { BehaviorStateSpace } from "../objectAwareAnomalyAnalysis/stateSpace.js";

export interface BranchCoverageBranch {
  id: string;
  kind: BranchKind;
  gatewayId: string;
  gatewayName?: string;
  branchLabel?: string;
  targetNodeId: string;
  targetNodeName?: string;
  transitionIds: string[];
}

export interface ProjectedChoreographySoundnessResult {
  optionToComplete: {
    holds: boolean;
    violatingStateCount: number;
    representativeViolation?: string;
  };
  properInteractionCompletion: {
    holds: boolean;
    violatingStateCount: number;
    representativeViolation?: string;
  };
  taskCoverage: {
    holds: boolean;
    coveredTaskCount: number;
    totalTaskCount: number;
    uncoveredTaskIds: string[];
  };
  branchCoverage: {
    holds: boolean;
    coveredBranchCount: number;
    totalBranchCount: number;
    uncoveredBranchIds: string[];
  };
  holds: boolean;
}

interface ProjectionMetadata {
  sinkPlaceId: string;
  controlFlowPlaceIds: string[];
  transmissionPlaceIds: string[];
  completionTransitionsByTaskId: Map<string, string[]>;
}

export function analyzeProjectedChoreographySoundness(args: {
  net: AnalysisPetriNet;
  stateSpace: BehaviorStateSpace;
  taskIds: string[];
  semantics: PetriNetSemanticModel;
  branchCoverageBranches?: Array<BranchCoverageBranch | DeadBranchAbsenceBranch>;
}): ProjectedChoreographySoundnessResult {
  const metadata = buildProjectionMetadata(args);
  const completeNodeIds = new Set(
    args.stateSpace.nodes
      .filter((node) => isInteractionComplete(node.marking, metadata))
      .map((node) => node.id),
  );
  const backwardReachableNodeIds = reverseReachableNodeIds({
    stateSpace: args.stateSpace,
    startNodeIds: completeNodeIds,
  });
  const optionToCompleteViolatingNodes = args.stateSpace.nodes.filter(
    (node) => !backwardReachableNodeIds.has(node.id),
  );
  const properCompletionViolatingNodes = args.stateSpace.nodes.filter(
    (node) =>
      tokenCount(node.marking, metadata.sinkPlaceId) > 0 &&
      !isInteractionComplete(node.marking, metadata),
  );
  const firedTransitionIds = new Set(
    args.stateSpace.edges.map((edge) => edge.transitionId),
  );
  const uncoveredTaskIds = args.taskIds
    .filter((taskId) => {
      const completionTransitionIds =
        metadata.completionTransitionsByTaskId.get(taskId) ?? [];

      return !completionTransitionIds.some((transitionId) =>
        firedTransitionIds.has(transitionId),
      );
    })
    .sort();
  const branchCoverageBranches = (args.branchCoverageBranches ?? []).map(
    normalizeBranchCoverageBranch,
  );
  const uncoveredBranchIds = branchCoverageBranches
    .filter(
      (branch) =>
        !branch.transitionIds.some((transitionId) =>
          firedTransitionIds.has(transitionId),
        ),
    )
    .map((branch) => branch.id)
    .sort();
  const optionToComplete = {
    holds: optionToCompleteViolatingNodes.length === 0,
    violatingStateCount: optionToCompleteViolatingNodes.length,
    representativeViolation: optionToCompleteViolatingNodes[0]?.id.toString(),
  };
  const properInteractionCompletion = {
    holds: properCompletionViolatingNodes.length === 0,
    violatingStateCount: properCompletionViolatingNodes.length,
    representativeViolation: properCompletionViolatingNodes[0]?.id.toString(),
  };
  const taskCoverage = {
    holds: uncoveredTaskIds.length === 0,
    coveredTaskCount: args.taskIds.length - uncoveredTaskIds.length,
    totalTaskCount: args.taskIds.length,
    uncoveredTaskIds,
  };
  const branchCoverage = {
    holds: uncoveredBranchIds.length === 0,
    coveredBranchCount: branchCoverageBranches.length - uncoveredBranchIds.length,
    totalBranchCount: branchCoverageBranches.length,
    uncoveredBranchIds,
  };
  const holds =
    optionToComplete.holds &&
    properInteractionCompletion.holds &&
    taskCoverage.holds &&
    branchCoverage.holds;

  return {
    optionToComplete,
    properInteractionCompletion,
    taskCoverage,
    branchCoverage,
    holds,
  };
}

function normalizeBranchCoverageBranch(
  branch: BranchCoverageBranch | DeadBranchAbsenceBranch,
): BranchCoverageBranch {
  return {
    id: branch.id,
    kind: branch.kind,
    gatewayId: branch.gatewayId,
    gatewayName: branch.gatewayName,
    branchLabel: branch.branchLabel,
    targetNodeId: branch.targetNodeId,
    targetNodeName: branch.targetNodeName,
    transitionIds: branch.transitionIds,
  };
}

function buildProjectionMetadata(args: {
  net: AnalysisPetriNet;
  taskIds: string[];
  semantics: PetriNetSemanticModel;
}): ProjectionMetadata {
  const sinkPlaceId = getSingleSinkPlaceId(args.semantics);
  const controlFlowPlaceIds = semanticPlaces(args.semantics, "controlFlowPlace")
    .map((place) => place.isolatedPlaceId)
    .sort();
  const transmissionPlaceIds = semanticPlaces(args.semantics, "transmissionPlace")
    .flatMap((place) => (place.isolatedPlaceId ? [place.isolatedPlaceId] : []))
    .sort();
  const completionTransitionsByTaskId = completionTransitionsByTaskIdFor(
    args.semantics,
  );

  assertPlaceExists(args.net, sinkPlaceId, "sink");
  for (const placeId of [...controlFlowPlaceIds, ...transmissionPlaceIds]) {
    assertPlaceExists(args.net, placeId, "execution");
  }
  for (const [taskId, transitionIds] of completionTransitionsByTaskId) {
    if (!args.taskIds.includes(taskId)) {
      continue;
    }

    for (const transitionId of transitionIds) {
      assertTransitionExists(args.net, transitionId, taskId);
    }
  }

  return {
    sinkPlaceId,
    controlFlowPlaceIds,
    transmissionPlaceIds,
    completionTransitionsByTaskId,
  };
}

function getSingleSinkPlaceId(semantics: PetriNetSemanticModel): string {
  const sinkPlaces = semanticPlaces(semantics, "sinkPlace");

  if (sinkPlaces.length !== 1) {
    throw new Error(
      `Expected exactly one isolated sink-place descriptor, found ${sinkPlaces.length}`,
    );
  }

  return sinkPlaces[0].isolatedPlaceId;
}

function semanticPlaces<K extends PetriNetPlaceSemantics["kind"]>(
  semantics: PetriNetSemanticModel,
  kind: K,
): Array<Extract<PetriNetPlaceSemantics, { kind: K }>> {
  return Object.values(semantics.places).filter(
    (place): place is Extract<PetriNetPlaceSemantics, { kind: K }> =>
      place.kind === kind,
  );
}

function semanticTransitions<K extends PetriNetTransitionSemantics["kind"]>(
  semantics: PetriNetSemanticModel,
  kind: K,
): Array<Extract<PetriNetTransitionSemantics, { kind: K }>> {
  return Object.values(semantics.transitions).filter(
    (transition): transition is Extract<PetriNetTransitionSemantics, { kind: K }> =>
      transition.kind === kind,
  );
}

function completionTransitionsByTaskIdFor(
  semantics: PetriNetSemanticModel,
): Map<string, string[]> {
  const completionTransitionsByTaskId = new Map<string, Set<string>>();

  for (const receiveTransition of semanticTransitions(
    semantics,
    "taskReceiveTransition",
  )) {
    addCompletionTransition(
      completionTransitionsByTaskId,
      receiveTransition.taskId,
      receiveTransition.isolatedTransitionId,
    );
  }

  for (const atomicTransition of semanticTransitions(
    semantics,
    "atomicTaskTransition",
  )) {
    if (completionTransitionsByTaskId.has(atomicTransition.taskId)) {
      continue;
    }

    addCompletionTransition(
      completionTransitionsByTaskId,
      atomicTransition.taskId,
      atomicTransition.isolatedTransitionId,
    );
  }

  return new Map(
    [...completionTransitionsByTaskId.entries()]
      .map(
        ([taskId, transitionIds]): [string, string[]] => [
          taskId,
          [...transitionIds].sort(),
        ],
      )
      .sort(([leftTaskId], [rightTaskId]) => leftTaskId.localeCompare(rightTaskId)),
  );
}

function addCompletionTransition(
  transitionsByTaskId: Map<string, Set<string>>,
  taskId: string,
  transitionId: string | undefined,
): void {
  if (!transitionId) {
    return;
  }

  const transitionIds = transitionsByTaskId.get(taskId) ?? new Set<string>();
  transitionIds.add(transitionId);
  transitionsByTaskId.set(taskId, transitionIds);
}

function isInteractionComplete(
  marking: Marking,
  metadata: ProjectionMetadata,
): boolean {
  if (tokenCount(marking, metadata.sinkPlaceId) !== 1) {
    return false;
  }

  return [...metadata.controlFlowPlaceIds, ...metadata.transmissionPlaceIds].every(
    (placeId) => tokenCount(marking, placeId) === 0,
  );
}

function reverseReachableNodeIds(args: {
  stateSpace: BehaviorStateSpace;
  startNodeIds: Set<number>;
}): Set<number> {
  const predecessorsByNodeId = new Map<number, Set<number>>();

  for (const edge of args.stateSpace.edges) {
    const predecessors = predecessorsByNodeId.get(edge.targetId) ?? new Set<number>();
    predecessors.add(edge.sourceId);
    predecessorsByNodeId.set(edge.targetId, predecessors);
  }

  const visited = new Set(args.startNodeIds);
  const queue = [...args.startNodeIds].sort((left, right) => left - right);

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (nodeId === undefined) {
      continue;
    }

    for (const predecessorId of predecessorsByNodeId.get(nodeId) ?? []) {
      if (visited.has(predecessorId)) {
        continue;
      }

      visited.add(predecessorId);
      queue.push(predecessorId);
    }
  }

  return visited;
}

function tokenCount(marking: Marking, placeId: string): number {
  return marking.get(placeId) ?? 0;
}

function assertPlaceExists(
  net: AnalysisPetriNet,
  placeId: string,
  role: string,
): void {
  if (!net.places.includes(placeId)) {
    throw new Error(
      `Projected choreography soundness ${role} place "${placeId}" is not present in the analysis net`,
    );
  }
}

function assertTransitionExists(
  net: AnalysisPetriNet,
  transitionId: string,
  taskId: string,
): void {
  if (!net.transitions.includes(transitionId)) {
    throw new Error(
      `Projected choreography soundness completion transition "${transitionId}" for task "${taskId}" is not present in the analysis net`,
    );
  }
}
