import type {
  Choreography,
  ChoreographyTask,
  ExclusiveGateway,
} from "bpmn-moddle";
import { isBpmnType } from "../choreography/bpmn.js";
import {
  buildIncomingFlowsByNodeId,
  buildNodesById,
  buildOutgoingFlowsByNodeId,
  determineGatewayDirection,
  getParticipantNames,
  getTaskSender,
} from "../choreography/choreography.js";

const VIRTUAL_EXIT_NODE_ID = "__virtual_exit__";

export interface DecisionRegion {
  splitGatewayId: string;
  joinGatewayId?: string;
  branchSuccessorIds: string[];
  regionNodeIds: Set<string>;
  loopBackBranchSuccessorIds: Set<string>;
  exitNodeIds: Set<string>;
}

export function computeAffectedRoles(args: {
  choreography: Choreography;
  gateway: ExclusiveGateway;
}): string[] {
  const { choreography, gateway } = args;
  const region = computeDecisionRegion(choreography, gateway);
  const nodesById = buildNodesById(choreography);
  const join = region.joinGatewayId
    ? nodesById.get(region.joinGatewayId)
    : undefined;

  if (
    region.exitNodeIds.size === 0 ||
    (join !== undefined &&
      !isBpmnType<ExclusiveGateway>(join, "bpmn:ExclusiveGateway"))
  ) {
    throw new Error(
      `Could not identify corresponding exclusive join for gateway "${
        gateway.name ?? gateway.id
      }"`
    );
  }

  const roleIds = new Set<string>();
  const outgoingFlows = buildOutgoingFlowsByNodeId(choreography).get(
    gateway.id
  );

  for (const flow of outgoingFlows ?? []) {
    if (!flow.targetRef?.id) {
      continue;
    }

    const branchTasks = collectTasksReachableUntilJoin(
      choreography,
      flow.targetRef.id,
      region
    );

    if (isBpmnType<ChoreographyTask>(flow.targetRef, "bpmn:ChoreographyTask")) {
      roleIds.add(getTaskSender(flow.targetRef));
    } else if (branchTasks.length === 0 && join) {
      for (const task of collectFirstTasksAfterNode(choreography, join.id)) {
        roleIds.add(getTaskSender(task));
      }
    }
  }

  if (join && isBpmnType<ExclusiveGateway>(join, "bpmn:ExclusiveGateway")) {
    for (const roleId of computeAmbiguousContinuationRoles(
      choreography,
      gateway,
      join,
      region
    )) {
      roleIds.add(roleId);
    }
  }

  return sortByParticipantOrder(choreography, [...roleIds]);
}

export function computeDecisionRegion(
  choreography: Choreography,
  split: ExclusiveGateway
): DecisionRegion {
  const outgoingFlows = buildOutgoingFlowsByNodeId(choreography).get(split.id);
  const branchSuccessorIds = (outgoingFlows ?? [])
    .map((flow) => flow.targetRef?.id)
    .filter((id): id is string => id !== undefined);
  const loopBackBranchSuccessorIds = new Set<string>();

  for (const branchSuccessorId of branchSuccessorIds) {
    if (branchReturnsToSplitBeforeExit(choreography, branchSuccessorId, split.id)) {
      loopBackBranchSuccessorIds.add(branchSuccessorId);
    }
  }

  const nonLoopingBranchSuccessorIds = branchSuccessorIds.filter(
    (id) => !loopBackBranchSuccessorIds.has(id)
  );
  const joinGatewayId = findFirstCommonPostDominatingJoin(
    choreography,
    split.id,
    nonLoopingBranchSuccessorIds
  );
  const exitNodeIds = new Set<string>();

  if (joinGatewayId) {
    exitNodeIds.add(joinGatewayId);
  }

  const regionNodeIds = collectDecisionRegionNodes({
    choreography,
    splitGatewayId: split.id,
    branchSuccessorIds,
    joinGatewayId,
    exitNodeIds,
  });

  return {
    splitGatewayId: split.id,
    joinGatewayId,
    branchSuccessorIds,
    regionNodeIds,
    loopBackBranchSuccessorIds,
    exitNodeIds,
  };
}

export function findCorrespondingExclusiveJoin(
  choreography: Choreography,
  split: ExclusiveGateway
): ExclusiveGateway | undefined {
  const region = computeDecisionRegion(choreography, split);
  const nodesById = buildNodesById(choreography);
  const join = region.joinGatewayId
    ? nodesById.get(region.joinGatewayId)
    : undefined;

  return isBpmnType<ExclusiveGateway>(join, "bpmn:ExclusiveGateway")
    ? join
    : undefined;
}

export function collectTasksReachableUntilJoin(
  choreography: Choreography,
  startNodeId: string,
  joinOrRegion: string | DecisionRegion
): ChoreographyTask[] {
  if (typeof joinOrRegion !== "string") {
    return collectTasksReachableInDecisionRegion(
      choreography,
      startNodeId,
      joinOrRegion
    );
  }

  return collectTasksForward(choreography, [startNodeId], {
    stopNodeId: joinOrRegion,
    stopAfterFirstTask: false,
  });
}

export function collectFirstTasksAfterNode(
  choreography: Choreography,
  nodeId: string
): ChoreographyTask[] {
  const outgoingFlows = buildOutgoingFlowsByNodeId(choreography).get(nodeId);
  const startNodeIds = (outgoingFlows ?? [])
    .map((flow) => flow.targetRef?.id)
    .filter((id): id is string => id !== undefined);

  return collectTasksForward(choreography, startNodeIds, {
    stopAfterFirstTask: true,
  });
}

export function collectTasksBeforeNode(
  choreography: Choreography,
  nodeId: string
): ChoreographyTask[] {
  const nodesById = buildNodesById(choreography);
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const tasks = new Map<string, ChoreographyTask>();
  const queue = [...(incomingFlowsByNodeId.get(nodeId) ?? [])]
    .map((flow) => flow.sourceRef?.id)
    .filter((id): id is string => id !== undefined);
  const visited = new Set<string>();

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
    }

    for (const incomingFlow of incomingFlowsByNodeId.get(currentId) ?? []) {
      if (incomingFlow.sourceRef?.id) {
        queue.push(incomingFlow.sourceRef.id);
      }
    }
  }

  return [...tasks.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function collectTasksAfterNode(
  choreography: Choreography,
  nodeId: string
): ChoreographyTask[] {
  const outgoingFlows = buildOutgoingFlowsByNodeId(choreography).get(nodeId);
  const startNodeIds = (outgoingFlows ?? [])
    .map((flow) => flow.targetRef?.id)
    .filter((id): id is string => id !== undefined);

  return collectTasksForward(choreography, startNodeIds, {
    stopAfterFirstTask: false,
  });
}

export function getTaskParticipants(task: ChoreographyTask): string[] {
  return (task.participantRef ?? []).map((participant) => {
    if (!participant.name) {
      throw new Error(
        `Participant ${participant.id} of task "${task.name ?? task.id}" must have name`
      );
    }

    return participant.name;
  });
}

function computeAmbiguousContinuationRoles(
  choreography: Choreography,
  split: ExclusiveGateway,
  join: ExclusiveGateway,
  region: DecisionRegion
): string[] {
  const outgoingFlows = buildOutgoingFlowsByNodeId(choreography).get(split.id);
  const tasksBeforeSplit = collectTasksBeforeNode(choreography, split.id);
  const rolesBeforeSplit = new Set(tasksBeforeSplit.flatMap(getTaskParticipants));
  const branchRoleSets = (outgoingFlows ?? []).map((flow) => {
    const branchTasks = flow.targetRef?.id
      ? collectTasksReachableInDecisionRegion(
          choreography,
          flow.targetRef.id,
          region
        )
      : [];

    return new Set(branchTasks.flatMap(getTaskParticipants));
  });

  if (branchRoleSets.length === 0) {
    return [];
  }

  const continuationRoleSets = collectContinuationRoleSets(choreography, join.id);
  const ambiguousRoles: string[] = [];

  for (const roleId of rolesBeforeSplit) {
    const branchParticipationCount = branchRoleSets.filter((roles) =>
      roles.has(roleId)
    ).length;

    if (
      branchParticipationCount === 0 ||
      branchParticipationCount === branchRoleSets.length
    ) {
      continue;
    }

    const participatesInAllContinuations =
      continuationRoleSets.length > 0 &&
      continuationRoleSets.every((roles) => roles.has(roleId));

    if (!participatesInAllContinuations) {
      ambiguousRoles.push(roleId);
    }
  }

  return ambiguousRoles;
}

function collectContinuationRoleSets(
  choreography: Choreography,
  nodeId: string
): Array<Set<string>> {
  const outgoingFlows = buildOutgoingFlowsByNodeId(choreography).get(nodeId) ?? [];

  return outgoingFlows.map((flow) => {
    const tasks = flow.targetRef?.id
      ? collectTasksForward(choreography, [flow.targetRef.id], {
          stopAfterFirstTask: false,
        })
      : [];

    return new Set(tasks.flatMap(getTaskParticipants));
  });
}

function collectTasksForward(
  choreography: Choreography,
  startNodeIds: string[],
  options: {
    stopNodeId?: string;
    stopNodeIds?: Set<string>;
    stopAfterFirstTask: boolean;
  }
): ChoreographyTask[] {
  const nodesById = buildNodesById(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const tasks = new Map<string, ChoreographyTask>();
  const queue = [...startNodeIds];
  const visited = new Set<string>();
  const stopNodeIds = new Set([
    ...(options.stopNodeId ? [options.stopNodeId] : []),
    ...(options.stopNodeIds ?? []),
  ]);

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (!currentId || visited.has(currentId) || stopNodeIds.has(currentId)) {
      continue;
    }

    visited.add(currentId);

    const node = nodesById.get(currentId);

    if (!node) {
      continue;
    }

    if (isBpmnType<ChoreographyTask>(node, "bpmn:ChoreographyTask")) {
      tasks.set(node.id, node);

      if (options.stopAfterFirstTask) {
        continue;
      }
    }

    for (const outgoingFlow of outgoingFlowsByNodeId.get(currentId) ?? []) {
      if (outgoingFlow.targetRef?.id) {
        queue.push(outgoingFlow.targetRef.id);
      }
    }
  }

  return [...tasks.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function collectTasksReachableInDecisionRegion(
  choreography: Choreography,
  startNodeId: string,
  region: DecisionRegion
): ChoreographyTask[] {
  return collectTasksForward(choreography, [startNodeId], {
    stopNodeIds: new Set([region.splitGatewayId, ...region.exitNodeIds]),
    stopAfterFirstTask: false,
  });
}

function branchReturnsToSplitBeforeExit(
  choreography: Choreography,
  startNodeId: string,
  splitGatewayId: string
): boolean {
  const nodesById = buildNodesById(choreography);
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const queue = [startNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (!currentId || visited.has(currentId)) {
      continue;
    }

    if (currentId === splitGatewayId) {
      return true;
    }

    visited.add(currentId);

    const node = nodesById.get(currentId);

    if (!node) {
      continue;
    }

    if (node.$type === "bpmn:EndEvent") {
      continue;
    }

    if (
      node.$type === "bpmn:ExclusiveGateway" &&
      determineGatewayDirection(
        node,
        incomingFlowsByNodeId.get(node.id) ?? [],
        outgoingFlowsByNodeId.get(node.id) ?? []
      ) === "join"
    ) {
      continue;
    }

    for (const outgoingFlow of outgoingFlowsByNodeId.get(currentId) ?? []) {
      if (outgoingFlow.targetRef?.id) {
        queue.push(outgoingFlow.targetRef.id);
      }
    }
  }

  return false;
}

function findFirstCommonPostDominatingJoin(
  choreography: Choreography,
  splitGatewayId: string,
  branchSuccessorIds: string[]
): string | undefined {
  if (branchSuccessorIds.length === 0) {
    return undefined;
  }

  const nodesById = buildNodesById(choreography);
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const postDominators = computePostDominators(choreography, splitGatewayId);
  const commonPostDominators = intersectSets(
    branchSuccessorIds.map(
      (branchSuccessorId) =>
        postDominators.get(branchSuccessorId) ?? new Set<string>()
    )
  );
  const distancesByBranch = branchSuccessorIds.map((branchSuccessorId) =>
    computeShortestDistances(choreography, branchSuccessorId, splitGatewayId)
  );

  return [...commonPostDominators]
    .filter((nodeId) => nodeId !== splitGatewayId && nodeId !== VIRTUAL_EXIT_NODE_ID)
    .filter((nodeId) => {
      const node = nodesById.get(nodeId);

      return (
        node &&
        isBpmnType<ExclusiveGateway>(node, "bpmn:ExclusiveGateway") &&
        determineGatewayDirection(
          node,
          incomingFlowsByNodeId.get(node.id) ?? [],
          outgoingFlowsByNodeId.get(node.id) ?? []
        ) === "join"
      );
    })
    .map((joinId) => {
      const distances = distancesByBranch.map(
        (distancesByNodeId) => distancesByNodeId.get(joinId) ?? Infinity
      );

      return {
        joinId,
        maxDistance: Math.max(...distances),
        totalDistance: distances.reduce((total, distance) => total + distance, 0),
      };
    })
    .filter(({ maxDistance, totalDistance }) =>
      Number.isFinite(maxDistance) && Number.isFinite(totalDistance)
    )
    .sort(
      (left, right) =>
        left.maxDistance - right.maxDistance ||
        left.totalDistance - right.totalDistance ||
        left.joinId.localeCompare(right.joinId)
    )[0]?.joinId;
}

function computePostDominators(
  choreography: Choreography,
  splitGatewayId: string
): Map<string, Set<string>> {
  const nodesById = buildNodesById(choreography);
  const allNodeIds = new Set([...nodesById.keys(), VIRTUAL_EXIT_NODE_ID]);
  const postDominators = new Map<string, Set<string>>();

  for (const nodeId of allNodeIds) {
    postDominators.set(
      nodeId,
      nodeId === VIRTUAL_EXIT_NODE_ID
        ? new Set([VIRTUAL_EXIT_NODE_ID])
        : new Set(allNodeIds)
    );
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const nodeId of nodesById.keys()) {
      const successorIds = successorIdsForPostDominators(
        choreography,
        nodeId,
        splitGatewayId
      );
      const next = new Set([
        nodeId,
        ...intersectSets(
          successorIds.map(
            (successorId) => postDominators.get(successorId) ?? new Set<string>()
          )
        ),
      ]);
      const current = postDominators.get(nodeId) ?? new Set<string>();

      if (!setsEqual(current, next)) {
        postDominators.set(nodeId, next);
        changed = true;
      }
    }
  }

  return postDominators;
}

function successorIdsForPostDominators(
  choreography: Choreography,
  nodeId: string,
  splitGatewayId: string
): string[] {
  if (nodeId === splitGatewayId) {
    return [VIRTUAL_EXIT_NODE_ID];
  }

  const nodesById = buildNodesById(choreography);
  const node = nodesById.get(nodeId);

  if (!node || isBpmnType(node, "bpmn:EndEvent")) {
    return [VIRTUAL_EXIT_NODE_ID];
  }

  const outgoingFlows = buildOutgoingFlowsByNodeId(choreography).get(nodeId) ?? [];
  const successorIds = outgoingFlows
    .map((flow) => flow.targetRef?.id)
    .filter((id): id is string => id !== undefined);

  return successorIds.length > 0 ? successorIds : [VIRTUAL_EXIT_NODE_ID];
}

function computeShortestDistances(
  choreography: Choreography,
  startNodeId: string,
  stopNodeId: string
): Map<string, number> {
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const distances = new Map<string, number>();
  const queue: Array<{ nodeId: string; distance: number }> = [
    { nodeId: startNodeId, distance: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || distances.has(current.nodeId)) {
      continue;
    }

    distances.set(current.nodeId, current.distance);

    if (current.nodeId === stopNodeId) {
      continue;
    }

    for (const outgoingFlow of outgoingFlowsByNodeId.get(current.nodeId) ?? []) {
      if (outgoingFlow.targetRef?.id) {
        queue.push({
          nodeId: outgoingFlow.targetRef.id,
          distance: current.distance + 1,
        });
      }
    }
  }

  return distances;
}

function collectDecisionRegionNodes(args: {
  choreography: Choreography;
  splitGatewayId: string;
  branchSuccessorIds: string[];
  joinGatewayId?: string;
  exitNodeIds: Set<string>;
}): Set<string> {
  const { choreography, splitGatewayId, branchSuccessorIds, joinGatewayId } =
    args;
  const nodesById = buildNodesById(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const regionNodeIds = new Set([splitGatewayId]);
  const queue = [...branchSuccessorIds];

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (!currentId || regionNodeIds.has(currentId)) {
      continue;
    }

    regionNodeIds.add(currentId);

    if (currentId === splitGatewayId || currentId === joinGatewayId) {
      continue;
    }

    const node = nodesById.get(currentId);

    if (!node || isBpmnType(node, "bpmn:EndEvent")) {
      if (node) {
        args.exitNodeIds.add(node.id);
      }
      continue;
    }

    for (const outgoingFlow of outgoingFlowsByNodeId.get(currentId) ?? []) {
      if (outgoingFlow.targetRef?.id) {
        queue.push(outgoingFlow.targetRef.id);
      }
    }
  }

  return regionNodeIds;
}

function intersectSets(sets: Array<Set<string>>): Set<string> {
  if (sets.length === 0) {
    return new Set();
  }

  return sets.reduce(
    (intersection, set) =>
      new Set([...intersection].filter((value) => set.has(value)))
  );
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function sortByParticipantOrder(
  choreography: Choreography,
  roleIds: string[]
): string[] {
  const participantOrder = new Map(
    getParticipantNames(choreography).map((roleId, index) => [roleId, index])
  );

  return roleIds.sort(
    (left, right) =>
      (participantOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (participantOrder.get(right) ?? Number.MAX_SAFE_INTEGER) ||
      left.localeCompare(right)
  );
}
