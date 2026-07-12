import type { Choreography, ExclusiveGateway } from "bpmn-moddle";
import {
  buildIncomingFlowsByNodeId,
  buildOutgoingFlowsByNodeId,
  determineGatewayDirection,
  getExclusiveGateways,
  getChoreographyTasks,
  getTaskSender,
  validateNormalizedControlFlow,
} from "../choreography/choreography.js";
import { computeDecisionRegion } from "../decision/affectedRoles.js";
import {
  getDecisionGuards,
  validateDecisionGuards,
} from "../decision/decisionGuards.js";
import { computeCreationDependencies } from "../dataModel/dependencies.js";
import type { DataModel } from "../dataModel/dataModelTypes.js";
import type {
  LifecycleModel,
  ObjectLifecycle,
} from "../lifecycle/lifecycleTypes.js";
import { normalizeLabel } from "../choreography/taskNames.js";
import type { ObjectReference } from "../choreography/objectReferences.js";
import { validateObjectReferences } from "../choreography/objectReferences.js";
import { validateLocalStateInputs } from "../../../mappings/objectAwareChoreographyToPetriNet/localStateMapping.js";

export function validateObjectAwareChoreographyInput(args: {
  choreography: Choreography;
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  objectReferences: Map<string, ObjectReference>;
}): void {
  validateNormalizedControlFlow(args.choreography);
  validateLifecycleCoverage(args.dataModel, args.lifecycleModel);
  validateSynchronizedTransitionTargets(args.lifecycleModel);
  validateObjectReferences(
    args.objectReferences,
    args.dataModel,
    args.lifecycleModel,
  );
  validateLocalStateInputs(
    args.choreography,
    args.dataModel,
    args.lifecycleModel,
  );
  validateClassCreatorRoles(args.lifecycleModel);
  validateOneToOneCreatorRoles(args);
  validateExclusiveGatewaySeseRegions(args.choreography);
  validateExclusiveGatewayDecisionGuards(args);
}

function validateLifecycleCoverage(
  dataModel: DataModel,
  lifecycleModel: LifecycleModel,
): void {
  const dataClassIds = new Set(
    dataModel.classes.map((dataClass) => dataClass.id),
  );
  const lifecycleClassIds = new Set(lifecycleModel.lifecycles.keys());

  for (const dataClass of [...dataModel.classes].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (!lifecycleClassIds.has(dataClass.id)) {
      throw new Error(
        `Data model class ${dataClass.name} does not have an object lifecycle`,
      );
    }
  }

  for (const lifecycle of [...lifecycleModel.lifecycles.values()].sort(
    (left, right) => left.classId.localeCompare(right.classId),
  )) {
    if (!dataClassIds.has(lifecycle.classId)) {
      throw new Error(
        `Object lifecycle class ${lifecycle.className} does not exist in the data model`,
      );
    }
  }
}

function validateSynchronizedTransitionTargets(
  lifecycleModel: LifecycleModel,
): void {
  for (const lifecycle of [...lifecycleModel.lifecycles.values()].sort(
    (left, right) => left.classId.localeCompare(right.classId),
  )) {
    const targetStateByTrigger = new Map<string, string>();

    for (const transition of [...lifecycle.transitions].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      if (!transition.triggerName) {
        continue;
      }

      const triggerName = normalizeLabel(transition.triggerName);
      const previousTargetState = targetStateByTrigger.get(triggerName);

      if (previousTargetState === undefined) {
        targetStateByTrigger.set(triggerName, transition.target);
        continue;
      }

      if (previousTargetState !== transition.target) {
        throw new Error(
          `Ambiguous synchronized transition target in lifecycle "${lifecycle.className}" for trigger "${transition.triggerName}": transitions with the same trigger must share one target state, found "${previousTargetState}" and "${transition.target}".`,
        );
      }
    }
  }
}

function validateClassCreatorRoles(lifecycleModel: LifecycleModel): void {
  for (const lifecycle of [...lifecycleModel.lifecycles.values()].sort(
    (left, right) => left.classId.localeCompare(right.classId),
  )) {
    const creatorRoles = getInitialCreatorRoles(lifecycle);

    if (creatorRoles.size > 1) {
      throw new Error(
        `Object lifecycle class ${lifecycle.className} has multiple creator roles for initial states: ${[
          ...creatorRoles,
        ].join(", ")}`,
      );
    }
  }
}

function validateOneToOneCreatorRoles(args: {
  choreography: Choreography;
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  objectReferences: Map<string, ObjectReference>;
}): void {
  const dependencies = computeCreationDependencies(args.dataModel);

  for (const group of dependencies.oneToOneGroups.filter(
    (candidate) => candidate.length > 1,
  )) {
    const creatorRoles = new Map<string, string>();

    for (const classId of group) {
      creatorRoles.set(
        classId,
        requireSingleCreatorRole(args.lifecycleModel, classId, group),
      );
    }

    const distinctCreatorRoles = new Set(creatorRoles.values());

    if (distinctCreatorRoles.size !== 1) {
      throw new Error(
        `Mandatory one-to-one creation group requires a common creator role: [${group.join(", ")}] has creators ${[
          ...creatorRoles.entries(),
        ]
          .map(([classId, role]) => `${classId}:${role}`)
          .join(", ")}`,
      );
    }

    const [creatorRole] = distinctCreatorRoles;

    for (const task of getChoreographyTasks(args.choreography)) {
      const objectReference = args.objectReferences.get(task.id);

      if (!objectReference || !group.includes(objectReference.classId)) {
        continue;
      }

      const sender = getTaskSender(task);

      if (sender !== creatorRole) {
        throw new Error(
          `One-to-one creation group identifier bound by non-creator role: task "${
            task.name ?? task.id
          }" sends ${objectReference.classId} as ${sender}, but group [${group.join(
            ", ",
          )}] requires ${creatorRole}`,
        );
      }
    }
  }
}

function requireSingleCreatorRole(
  lifecycleModel: LifecycleModel,
  classId: string,
  group: string[],
): string {
  const lifecycle = lifecycleModel.lifecycles.get(classId);

  if (!lifecycle) {
    throw new Error(
      `Mandatory one-to-one creation group requires lifecycle for class ${classId} in [${group.join(", ")}]`,
    );
  }

  const creatorRoles = getInitialCreatorRoles(lifecycle);

  if (creatorRoles.size !== 1) {
    throw new Error(
      `Mandatory one-to-one creation group requires a common creator role: class ${classId} has creator roles [${[
        ...creatorRoles,
      ].join(", ")}] in group [${group.join(", ")}]`,
    );
  }

  return [...creatorRoles][0];
}

function getInitialCreatorRoles(lifecycle: ObjectLifecycle): Set<string> {
  return new Set(
    lifecycle.transitions
      .filter((transition) => transition.source === lifecycle.initialStateId)
      .map((transition) => transition.actor)
      .filter((actor): actor is string => actor !== undefined),
  );
}

function validateExclusiveGatewaySeseRegions(choreography: Choreography): void {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);

  for (const gateway of getExclusiveGateways(choreography).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const direction = determineGatewayDirection(
      gateway,
      incomingFlowsByNodeId.get(gateway.id) ?? [],
      outgoingFlowsByNodeId.get(gateway.id) ?? [],
    );

    if (direction !== "split") {
      continue;
    }

    validateExclusiveGatewaySeseRegion(choreography, gateway);
  }
}

function validateExclusiveGatewayDecisionGuards(args: {
  choreography: Choreography;
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
}): void {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(args.choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(args.choreography);
  const decisionGuardsByFlowId = getDecisionGuards(args.choreography);

  for (const gateway of getExclusiveGateways(args.choreography).sort(
    (left, right) => left.id.localeCompare(right.id),
  )) {
    const direction = determineGatewayDirection(
      gateway,
      incomingFlowsByNodeId.get(gateway.id) ?? [],
      outgoingFlowsByNodeId.get(gateway.id) ?? [],
    );

    if (direction !== "split") {
      continue;
    }

    const guards = (outgoingFlowsByNodeId.get(gateway.id) ?? []).map((flow) => {
      const guard = decisionGuardsByFlowId.get(flow.id);

      if (!guard) {
        throw new Error(
          `Outgoing sequence flow "${flow.id}" of exclusive gateway "${
            gateway.name ?? gateway.id
          }" has no object-state guard.`,
        );
      }

      return guard;
    });

    validateDecisionGuards({
      gateway,
      guards,
      dataModel: args.dataModel,
      lifecycleModel: args.lifecycleModel,
    });
  }
}

function validateExclusiveGatewaySeseRegion(
  choreography: Choreography,
  gateway: ExclusiveGateway,
): void {
  const region = computeDecisionRegion(choreography, gateway);
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const regionEntryFlowIds = new Set<string>();

  for (const nodeId of region.regionNodeIds) {
    for (const incomingFlow of incomingFlowsByNodeId.get(nodeId) ?? []) {
      const sourceNodeId = incomingFlow.sourceRef?.id;

      if (sourceNodeId && !region.regionNodeIds.has(sourceNodeId)) {
        regionEntryFlowIds.add(incomingFlow.id);
      }
    }
  }

  if (regionEntryFlowIds.size !== 1 || region.exitNodeIds.size !== 1) {
    throw new Error(
      `Exclusive gateway "${
        gateway.name ?? gateway.id
      }" must form a well-formed SESE (single-entry single-exit) decision or loop region; found ${
        regionEntryFlowIds.size
      } entry sequence flow(s) and ${region.exitNodeIds.size} exit node(s).`,
    );
  }
}
