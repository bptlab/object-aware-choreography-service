import type { Choreography, FlowNode } from "bpmn-moddle";
import {
  createObjectAwareRealizabilityMetadata,
  type DeadBranchAbsenceBranch,
  type ObjectAwareRealizabilityMetadata,
  type SenderProgressionPosition,
} from "../../analysis/objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";
import { isBpmnType } from "../../source/objectAwareChoreography/choreography/bpmn.js";
import {
  buildIncomingFlowsByNodeId,
  buildOutgoingFlowsByNodeId,
  getChoreographyTasks,
  getEventBasedGateways,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import type { DataModel } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type { LifecycleModel } from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import type { ObjectReference } from "../../source/objectAwareChoreography/choreography/objectReferences.js";
import type { TaskNameIndex } from "../../source/objectAwareChoreography/choreography/taskNames.js";
import { logger } from "../../logger.js";
import {
  placeIdForSequenceFlow,
  transitionIdForNode,
} from "../../targets/petriNet/ids.js";
import { PetriNetBuilder } from "../../targets/petriNet/petriNetBuilder.js";
import { applyCombinedTaskMapping } from "./combinedTaskMapping.js";
import { buildControlFlowNet } from "./controlFlowMapping.js";
import { applyDecisionMapping } from "./decisionMapping.js";
import { addLocalStateLayer } from "./localStateMapping.js";
import {
  computeFallbackControlFlowLayout,
  computeControlFlowLayout,
  computeLocalStateLayout,
  type ControlFlowLayout,
} from "./mappingContext.js";
import { applyObjectStateCommunicationMapping } from "./objectStateCommunicationMapping.js";
import { applyPureSynchronizedTaskMapping } from "./synchronizedTaskMapping.js";
import {
  buildPetriNetArtifact,
  type IsolatedPetriNetArtifact,
} from "./petriNetArtifact.js";

export interface BuildPetriNetResult {
  petriNet: PetriNetBuilder;
  objectAwareRealizabilityMetadata: ObjectAwareRealizabilityMetadata;
}

export type BuildPetriNetWithSemanticsResult = BuildPetriNetResult &
  IsolatedPetriNetArtifact;

export function buildPetriNet(args: {
  choreography: Choreography;
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  objectReferences: Map<string, ObjectReference>;
  taskNameIndex: TaskNameIndex;
}): BuildPetriNetResult {
  const { petriNet, objectAwareRealizabilityMetadata } =
    buildPetriNetWithSemantics(args);

  return { petriNet, objectAwareRealizabilityMetadata };
}

export function buildPetriNetWithSemantics(args: {
  choreography: Choreography;
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  objectReferences: Map<string, ObjectReference>;
  taskNameIndex: TaskNameIndex;
}): BuildPetriNetWithSemanticsResult {
  const {
    choreography,
    dataModel,
    lifecycleModel,
    objectReferences,
    taskNameIndex,
  } = args;
  const petriNet = new PetriNetBuilder();
  const objectAwareRealizabilityMetadata = createObjectAwareRealizabilityMetadata();

  logger.debug("Computing deterministic layouts");
  let controlFlowLayout: ControlFlowLayout;

  try {
    controlFlowLayout = computeControlFlowLayout(choreography);
  } catch (error) {
    logger.warn(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      "Deterministic layered layout failed; using fallback layout",
    );
    controlFlowLayout = computeFallbackControlFlowLayout(choreography);
  }

  const localStateLayout = computeLocalStateLayout(
    choreography,
    dataModel,
    lifecycleModel,
  );

  logger.debug("Building control-flow Petri net layer");
  buildControlFlowNet(choreography, petriNet, controlFlowLayout);

  logger.debug("Adding local object-state Petri net layer");
  const localStateDiagnostics = addLocalStateLayer(
    choreography,
    dataModel,
    lifecycleModel,
    petriNet,
    localStateLayout,
    objectAwareRealizabilityMetadata,
  );
  logger.info(
    {
      independentCreationTransitions:
        localStateDiagnostics.independentCreationTransitions,
      independentCreationDependencyReadArcs:
        localStateDiagnostics.independentCreationDependencyReadArcs,
      oneToOneGroups: localStateDiagnostics.oneToOneGroups,
      compositeOneToOneCreationTransitions:
        localStateDiagnostics.compositeOneToOneCreationTransitions,
      compositeCreationDependencyReadArcs:
        localStateDiagnostics.compositeCreationDependencyReadArcs,
      ordinaryStateTransitions: localStateDiagnostics.ordinaryStateTransitions,
    },
    "Local-state mapping diagnostics",
  );

  logger.debug("Applying combined task mapping");
  const combinedTaskDiagnostics = applyCombinedTaskMapping({
    choreography,
    dataModel,
    lifecycleModel,
    objectReferences,
    petriNet,
    taskNameIndex,
    objectAwareRealizabilityMetadata,
  });
  logger.info(
    {
      canonicalTaskGroups: combinedTaskDiagnostics.canonicalTaskGroups,
      combinedTasks: combinedTaskDiagnostics.combinedTasks,
      combinedSenderTransitions:
        combinedTaskDiagnostics.combinedSenderTransitions,
      combinedReceiverTransitions:
        combinedTaskDiagnostics.combinedReceiverTransitions,
    },
    "Combined task mapping diagnostics",
  );

  logger.debug("Applying pure object-state communication task mapping");
  const objectStateCommunicationDiagnostics =
    applyObjectStateCommunicationMapping({
      choreography,
      dataModel,
      lifecycleModel,
      objectReferences,
      petriNet,
      taskNameIndex,
      objectAwareRealizabilityMetadata,
    });
  logger.info(
    {
      choreographyTasks: objectStateCommunicationDiagnostics.choreographyTasks,
      tasksWithMessageElements:
        objectStateCommunicationDiagnostics.tasksWithMessageElements,
      tasksWithObjectReferences:
        objectStateCommunicationDiagnostics.tasksWithObjectReferences,
      replacedTaskTransitions:
        objectStateCommunicationDiagnostics.replacedTaskTransitions,
      senderTransitionsGenerated:
        objectStateCommunicationDiagnostics.senderTransitionsGenerated,
      transmissionPlacesGenerated:
        objectStateCommunicationDiagnostics.transmissionPlacesGenerated,
      receiverTransitionsGenerated:
        objectStateCommunicationDiagnostics.receiverTransitionsGenerated,
    },
    "Object-state communication mapping diagnostics",
  );

  logger.debug("Applying pure synchronized task mapping");
  const synchronizedTaskDiagnostics = applyPureSynchronizedTaskMapping({
    choreography,
    lifecycleModel,
    objectReferences,
    petriNet,
    taskNameIndex,
    objectAwareRealizabilityMetadata,
  });
  logger.info(
    {
      lifecycleTriggerNames: synchronizedTaskDiagnostics.lifecycleTriggerNames,
      pureSynchronizedTasks: synchronizedTaskDiagnostics.pureSynchronizedTasks,
      combinedTasksSkipped: synchronizedTaskDiagnostics.combinedTasksSkipped,
      synchronizedTaskTransitionsReplaced:
        synchronizedTaskDiagnostics.synchronizedTaskTransitionsReplaced,
      transmissionPlacesGenerated:
        synchronizedTaskDiagnostics.transmissionPlacesGenerated,
      synchronizedSenderTransitionsGenerated:
        synchronizedTaskDiagnostics.synchronizedSenderTransitionsGenerated,
      synchronizedReceiverTransitionsGenerated:
        synchronizedTaskDiagnostics.synchronizedReceiverTransitionsGenerated,
    },
    "Pure synchronized task mapping diagnostics",
  );

  logger.debug("Applying decision guard mapping");
  const decisionMappingDiagnostics = applyDecisionMapping({
    choreography,
    dataModel,
    lifecycleModel,
    petriNet,
    objectAwareRealizabilityMetadata,
  });
  logger.info(
    {
      exclusiveGatewaySplits: decisionMappingDiagnostics.exclusiveGatewaySplits,
      guardedOutgoingBranches:
        decisionMappingDiagnostics.guardedOutgoingBranches,
      decisionGatewaysMapped: decisionMappingDiagnostics.decisionGatewaysMapped,
      affectedRolesByGateway:
        decisionMappingDiagnostics.affectedRolesByGateway.map(
          ({ gatewayId, gatewayName, affectedRoles }) => ({
            gatewayId,
            gatewayName,
            affectedRoles,
          }),
        ),
      guardReadArcsAdded: decisionMappingDiagnostics.guardReadArcsAdded,
    },
    "Decision guard mapping diagnostics",
  );

  finalizeObjectAwareRealizabilityMetadata(
    choreography,
    petriNet,
    objectAwareRealizabilityMetadata,
  );

  const artifact = buildPetriNetArtifact({
    context: {
      choreography,
      dataModel,
      lifecycleModel,
      objectReferences,
      taskNameIndex,
    },
    petriNet,
  });

  return {
    ...artifact,
    objectAwareRealizabilityMetadata,
  };
}

function finalizeObjectAwareRealizabilityMetadata(
  choreography: Choreography,
  petriNet: PetriNetBuilder,
  metadata: ObjectAwareRealizabilityMetadata,
): void {
  metadata.transmissions = metadata.taskInteractions.map((task) => ({
    id: task.transmissionPlaceId,
    taskId: task.taskId,
    taskName: task.taskName,
    placeId: task.transmissionPlaceId,
    receiverRole: task.receiverRole,
    receiverTransitionIds: task.receiverTransitionIds,
  }));
  metadata.senderPositions = [
    ...buildDirectTaskSendPositions(choreography, metadata),
    ...buildEventBasedGatewaySendPositions(choreography, petriNet, metadata),
  ];
  metadata.branches.push(
    ...buildEventBasedGatewayBranches(choreography, petriNet, metadata),
  );
}

function buildDirectTaskSendPositions(
  choreography: Choreography,
  metadata: ObjectAwareRealizabilityMetadata,
): SenderProgressionPosition[] {
  const tasksById = new Map(
    getChoreographyTasks(choreography).map((task) => [task.id, task]),
  );
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);

  return metadata.taskInteractions
    .filter((taskInteraction) => {
      const task = tasksById.get(taskInteraction.taskId);

      if (!task) {
        return false;
      }

      return !(incomingFlowsByNodeId.get(task.id) ?? []).some((flow) =>
        isBpmnType(flow.sourceRef, "bpmn:EventBasedGateway"),
      );
    })
    .map((taskInteraction) => ({
      id: `send_${taskInteraction.taskId}`,
      label: taskInteraction.taskName,
      placeId: taskInteraction.preControlFlowPlaceId,
      kind: "direct-task",
      taskIds: [taskInteraction.taskId],
      taskNames: [taskInteraction.taskName],
      senderTransitionIds: taskInteraction.senderTransitionIds,
    }));
}

function buildEventBasedGatewaySendPositions(
  choreography: Choreography,
  petriNet: PetriNetBuilder,
  metadata: ObjectAwareRealizabilityMetadata,
): SenderProgressionPosition[] {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const sendPositions: SenderProgressionPosition[] = [];

  for (const gateway of getEventBasedGateways(choreography)) {
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];
    const senderTransitionIds = [
      ...new Set(
        outgoingFlows.flatMap((flow) =>
          transitionIdsForEventBasedBranch(flow.targetRef, petriNet, metadata),
        ),
      ),
    ].sort();

    if (incomingFlows.length !== 1 || senderTransitionIds.length === 0) {
      throw new Error(
        `Cannot build event-based send-position metadata for gateway ${gateway.id}`,
      );
    }

    sendPositions.push({
      id: `send_${gateway.id}`,
      label:
        gateway.name ??
        outgoingFlows
          .map((flow) => flow.targetRef.name ?? flow.targetRef.id)
          .join(" / "),
      placeId: placeIdForSequenceFlow(incomingFlows[0]),
      kind: "event-based-gateway",
      taskIds: outgoingFlows.map((flow) => flow.targetRef.id),
      taskNames: outgoingFlows.map(
        (flow) => flow.targetRef.name ?? flow.targetRef.id,
      ),
      senderTransitionIds,
    });
  }

  return sendPositions;
}

function buildEventBasedGatewayBranches(
  choreography: Choreography,
  petriNet: PetriNetBuilder,
  metadata: ObjectAwareRealizabilityMetadata,
): DeadBranchAbsenceBranch[] {
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const branches: DeadBranchAbsenceBranch[] = [];

  for (const gateway of getEventBasedGateways(choreography)) {
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];

    if (incomingFlows.length !== 1) {
      throw new Error(
        `Cannot build event-based branch metadata for gateway ${gateway.id}`,
      );
    }

    for (const outgoingFlow of outgoingFlowsByNodeId.get(gateway.id) ?? []) {
      branches.push({
        id: `branch_${gateway.id}_${outgoingFlow.targetRef.id}`,
        kind: "event-based",
        gatewayId: gateway.id,
        gatewayName: gateway.name,
        branchLabel: outgoingFlow.name,
        entryPlaceId: placeIdForSequenceFlow(incomingFlows[0]),
        targetNodeId: outgoingFlow.targetRef.id,
        targetNodeName: outgoingFlow.targetRef.name,
        transitionIds: transitionIdsForEventBasedBranch(
          outgoingFlow.targetRef,
          petriNet,
          metadata,
        ),
      });
    }
  }

  return branches;
}

function transitionIdsForEventBasedBranch(
  targetNode: FlowNode,
  petriNet: PetriNetBuilder,
  metadata: ObjectAwareRealizabilityMetadata,
): string[] {
  const taskInteraction = metadata.taskInteractions.find(
    (candidate) => candidate.taskId === targetNode.id,
  );

  if (taskInteraction) {
    return taskInteraction.senderTransitionIds;
  }

  const transitionId = transitionIdForNode(targetNode);

  if (petriNet.hasTransition(transitionId)) {
    return [transitionId];
  }

  throw new Error(
    `Cannot find transition metadata for event-based branch target ${targetNode.name ?? targetNode.id}`,
  );
}
