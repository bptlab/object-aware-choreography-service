import type { Choreography, FlowNode, SequenceFlow } from "bpmn-moddle";
import { compareById } from "../../source/objectAwareChoreography/choreography/bpmn.js";
import {
  buildIncomingFlowsByNodeId,
  buildNodesById,
  buildOutgoingFlowsByNodeId,
  getControlFlowNodes,
  getEndEvents,
  getParticipantNames,
  getSequenceFlows,
  getStartEvents,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import type { RoleId } from "../../source/objectAwareChoreography/choreography/choreography.js";
import type { DataModel } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type {
  LifecycleModel,
  LifecycleTransition,
  StateId,
} from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import type { Bounds } from "../../targets/petriNet/petriNetBuilder.js";
import type { ObjectAwareRealizabilityMetadata } from "../../analysis/objectAwareAnomalyAnalysis/objectAwareAnomalyTypes.js";

export interface PetriNetMappingContext {
  objectAwareRealizabilityMetadata: ObjectAwareRealizabilityMetadata;
}

const LAYER_SPACING = 150;
const ROW_SPACING = 200;
const SOURCE_PLACE_X = 0;
const START_TRANSITION_X = 100;
const PLACE_SIZE = 32;
const TRANSITION_WIDTH = 40;
const TRANSITION_HEIGHT = 60;
const FALLBACK_GRID_COLUMNS = 6;
const FALLBACK_GRID_COLUMN_SPACING = 220;
const FALLBACK_GRID_ROW_SPACING = 180;
const LOCAL_STATE_START_X = 0;
const LOCAL_STATE_START_Y = -900;
const LOCAL_STATE_PARTICIPANT_SPACING = 220;
const LOCAL_STATE_AWARENESS_ROW_OFFSET = 80;
const LOCAL_STATE_CLASS_SPACING = 140;
const LOCAL_STATE_NODE_SPACING = 100;

export type ControlFlowLayout = {
  nodeLayers: Map<string, number>;
  nodeBranchIndexes: Map<string, number>;
  flowBranchIndexes: Map<string, number>;
  boundsForSourcePlace: () => Bounds;
  boundsForSinkPlace: () => Bounds;
  boundsForSequenceFlowPlace: (flow: SequenceFlow) => Bounds;
  boundsForNodeTransition: (node: FlowNode) => Bounds;
  boundsForExclusiveSplitTransition: (outgoingFlow: SequenceFlow) => Bounds;
  boundsForExclusiveJoinTransition: (incomingFlow: SequenceFlow) => Bounds;
};

export type LocalStateLayout = {
  boundsForStatePlace: (
    role: RoleId,
    classId: string,
    stateId: StateId,
  ) => Bounds;
  boundsForExistencePlace: (role: RoleId, classId: string) => Bounds;
  boundsForLocalTransition: (
    role: RoleId,
    classId: string,
    transition: LifecycleTransition,
  ) => Bounds;
};

export function computeControlFlowLayout(
  choreography: Choreography,
): ControlFlowLayout {
  const startEvent = getStartEvents(choreography)[0];
  const endEvents = getEndEvents(choreography);
  const nodes = getControlFlowNodes(choreography);
  const nodesById = buildNodesById(choreography);
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const nodeLayers = new Map<string, number>();
  const visitingNodeIds = new Set<string>();

  function longestPathDistanceFromStart(node: FlowNode): number {
    const existing = nodeLayers.get(node.id);

    if (existing !== undefined) {
      return existing;
    }

    if (visitingNodeIds.has(node.id)) {
      throw new Error(
        `Cannot compute deterministic layered layout because sequence flow graph contains a cycle at node ${node.id}`,
      );
    }

    visitingNodeIds.add(node.id);

    let layer: number;
    if (node.id === startEvent.id) {
      layer = 0;
    } else {
      const incomingFlows = incomingFlowsByNodeId.get(node.id) ?? [];
      const reachablePredecessorLayers = incomingFlows
        .filter((flow) => nodesById.has(flow.sourceRef.id))
        .map((flow) => longestPathDistanceFromStart(flow.sourceRef));

      if (reachablePredecessorLayers.length === 0) {
        throw new Error(
          `Cannot compute deterministic layered layout because node ${node.id} is not reachable from start event ${startEvent.id}`,
        );
      }

      layer = Math.max(...reachablePredecessorLayers) + 1;
    }

    visitingNodeIds.delete(node.id);
    nodeLayers.set(node.id, layer);
    return layer;
  }

  for (const node of nodes) {
    longestPathDistanceFromStart(node);
  }

  const nodeBranchIndexes = new Map<string, number>();
  const flowBranchIndexes = new Map<string, number>();
  let nextBranchIndex = 1;

  nodeBranchIndexes.set(startEvent.id, 0);

  const nodesByLayer = [...nodes].sort((left, right) => {
    const layerDiff =
      (nodeLayers.get(left.id) ?? 0) - (nodeLayers.get(right.id) ?? 0);
    return layerDiff || compareById(left, right);
  });

  for (const node of nodesByLayer) {
    const incomingFlows = incomingFlowsByNodeId.get(node.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(node.id) ?? [];
    const incomingBranchIndexes = incomingFlows
      .map((flow) => flowBranchIndexes.get(flow.id))
      .filter((branchIndex): branchIndex is number => branchIndex !== undefined)
      .sort((left, right) => left - right);
    const nodeBranchIndex =
      node.id === startEvent.id
        ? 0
        : incomingBranchIndexes[0] ?? nodeBranchIndexes.get(node.id) ?? 0;

    nodeBranchIndexes.set(node.id, nodeBranchIndex);

    if (outgoingFlows.length > 1) {
      outgoingFlows.forEach((flow, index) => {
        const branchIndex = index === 0 ? nodeBranchIndex : nextBranchIndex++;
        flowBranchIndexes.set(flow.id, branchIndex);

        if (!nodeBranchIndexes.has(flow.targetRef.id)) {
          nodeBranchIndexes.set(flow.targetRef.id, branchIndex);
        }
      });
    } else if (outgoingFlows.length === 1) {
      const outgoingFlow = outgoingFlows[0];
      flowBranchIndexes.set(outgoingFlow.id, nodeBranchIndex);

      if (!nodeBranchIndexes.has(outgoingFlow.targetRef.id)) {
        nodeBranchIndexes.set(outgoingFlow.targetRef.id, nodeBranchIndex);
      }
    }
  }

  const sinkX =
    xForTransitionLayer(
      Math.max(...endEvents.map((event) => nodeLayers.get(event.id) ?? 0)),
    ) + LAYER_SPACING;

  return {
    nodeLayers,
    nodeBranchIndexes,
    flowBranchIndexes,
    boundsForSourcePlace: () => boundsForPlace(SOURCE_PLACE_X, 0),
    boundsForSinkPlace: () => boundsForPlace(sinkX, 0),
    boundsForSequenceFlowPlace: (flow: SequenceFlow) =>
      boundsForPlace(
        xForSequenceFlowPlace(flow, nodeLayers),
        yForBranchIndex(flowBranchIndexes.get(flow.id) ?? 0),
      ),
    boundsForNodeTransition: (node: FlowNode) =>
      boundsForTransition(
        xForTransitionLayer(nodeLayers.get(node.id) ?? 0),
        yForBranchIndex(nodeBranchIndexes.get(node.id) ?? 0),
      ),
    boundsForExclusiveSplitTransition: (outgoingFlow: SequenceFlow) =>
      boundsForTransition(
        xForTransitionLayer(nodeLayers.get(outgoingFlow.sourceRef.id) ?? 0),
        yForBranchIndex(flowBranchIndexes.get(outgoingFlow.id) ?? 0),
      ),
    boundsForExclusiveJoinTransition: (incomingFlow: SequenceFlow) =>
      boundsForTransition(
        xForTransitionLayer(nodeLayers.get(incomingFlow.targetRef.id) ?? 0),
        yForBranchIndex(flowBranchIndexes.get(incomingFlow.id) ?? 0),
      ),
  };
}

export function computeFallbackControlFlowLayout(
  choreography: Choreography,
): ControlFlowLayout {
  const nodes = orderedControlFlowNodes(choreography);
  const sequenceFlows = getSequenceFlows(choreography);
  const bpmnDiBounds = extractBpmnDiBounds(choreography);
  const nodeLayers = new Map<string, number>();
  const nodeBranchIndexes = new Map<string, number>();
  const flowBranchIndexes = new Map<string, number>();
  const fallbackBoundsByNodeId = new Map<string, Bounds>();

  nodes.forEach((node, index) => {
    nodeLayers.set(node.id, Math.floor(index / FALLBACK_GRID_COLUMNS));
    nodeBranchIndexes.set(node.id, index % FALLBACK_GRID_COLUMNS);
    fallbackBoundsByNodeId.set(
      node.id,
      boundsForTransitionAtCenter(boundsCenter(fallbackBpmnBounds(index))),
    );
  });

  sequenceFlows.forEach((flow, index) => {
    flowBranchIndexes.set(flow.id, index % FALLBACK_GRID_COLUMNS);
  });

  function boundsForNode(node: FlowNode): Bounds {
    const existingBounds = bpmnDiBounds.get(node.id);

    if (existingBounds) {
      return boundsForTransitionAtCenter(boundsCenter(existingBounds));
    }

    return (
      fallbackBoundsByNodeId.get(node.id) ??
      boundsForTransitionAtCenter(boundsCenter(fallbackBpmnBounds(nodes.length)))
    );
  }

  function boundsForFlow(flow: SequenceFlow): Bounds {
    const sourceBounds = boundsForNode(flow.sourceRef);
    const targetBounds = boundsForNode(flow.targetRef);
    const sourceCenter = boundsCenter(sourceBounds);
    const targetCenter = boundsCenter(targetBounds);

    return boundsForPlace(
      (sourceCenter.x + targetCenter.x) / 2,
      (sourceCenter.y + targetCenter.y) / 2,
    );
  }

  const startEvent = getStartEvents(choreography)[0];
  const endEvents = getEndEvents(choreography);
  const startBounds = startEvent ? boundsForNode(startEvent) : undefined;
  const endBounds = endEvents.map((event) => boundsForNode(event));
  const sinkAnchor =
    endBounds.length > 0
      ? endBounds.reduce((rightmost, bounds) =>
          bounds.x > rightmost.x ? bounds : rightmost,
        )
      : undefined;

  return {
    nodeLayers,
    nodeBranchIndexes,
    flowBranchIndexes,
    boundsForSourcePlace: () =>
      startBounds
        ? boundsForPlace(startBounds.x - LAYER_SPACING, centerY(startBounds))
        : boundsForPlace(SOURCE_PLACE_X, 0),
    boundsForSinkPlace: () =>
      sinkAnchor
        ? boundsForPlace(
            sinkAnchor.x + sinkAnchor.width + LAYER_SPACING,
            centerY(sinkAnchor),
          )
        : boundsForPlace(START_TRANSITION_X + LAYER_SPACING, 0),
    boundsForSequenceFlowPlace: (flow) => boundsForFlow(flow),
    boundsForNodeTransition: (node) => boundsForNode(node),
    boundsForExclusiveSplitTransition: (outgoingFlow) =>
      boundsBetween(
        boundsForNode(outgoingFlow.sourceRef),
        boundsForFlow(outgoingFlow),
      ),
    boundsForExclusiveJoinTransition: (incomingFlow) =>
      boundsBetween(
        boundsForFlow(incomingFlow),
        boundsForNode(incomingFlow.targetRef),
      ),
  };
}

function orderedControlFlowNodes(choreography: Choreography): FlowNode[] {
  const controlFlowNodeIds = new Set(
    getControlFlowNodes(choreography).map((node) => node.id),
  );

  return (choreography.flowElements ?? []).filter(
    (element): element is FlowNode => controlFlowNodeIds.has(element.id),
  );
}

function fallbackBpmnBounds(index: number): Bounds {
  const column = index % FALLBACK_GRID_COLUMNS;
  const row = Math.floor(index / FALLBACK_GRID_COLUMNS);

  return {
    x: START_TRANSITION_X + column * FALLBACK_GRID_COLUMN_SPACING,
    y: row * FALLBACK_GRID_ROW_SPACING,
    width: TRANSITION_WIDTH,
    height: TRANSITION_HEIGHT,
  };
}

function boundsForTransitionAtCenter(center: { x: number; y: number }): Bounds {
  return boundsForTransition(center.x - TRANSITION_WIDTH / 2, center.y);
}

function boundsBetween(first: Bounds, second: Bounds): Bounds {
  return boundsForTransition(
    (centerX(first) + centerX(second)) / 2 - TRANSITION_WIDTH / 2,
    (centerY(first) + centerY(second)) / 2,
  );
}

type BpmnShapeLike = {
  bpmnElement?: { id?: string };
  bounds?: Partial<Bounds>;
};

type BpmnDiagramLike = {
  plane?: {
    planeElement?: BpmnShapeLike[];
  };
};

type ChoreographyWithParentDefinitions = Choreography & {
  $parent?: {
    diagrams?: BpmnDiagramLike[];
  };
};

function extractBpmnDiBounds(choreography: Choreography): Map<string, Bounds> {
  const boundsByNodeId = new Map<string, Bounds>();
  const definitions = (choreography as ChoreographyWithParentDefinitions)
    .$parent;

  for (const diagram of definitions?.diagrams ?? []) {
    for (const shape of diagram.plane?.planeElement ?? []) {
      const elementId = shape.bpmnElement?.id;
      const bounds = shape.bounds;

      if (
        elementId &&
        bounds &&
        typeof bounds.x === "number" &&
        typeof bounds.y === "number" &&
        typeof bounds.width === "number" &&
        typeof bounds.height === "number"
      ) {
        boundsByNodeId.set(elementId, {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });
      }
    }
  }

  return boundsByNodeId;
}

function xForTransitionLayer(layer: number): number {
  return START_TRANSITION_X + layer * LAYER_SPACING * 2;
}

function xForSequenceFlowPlace(
  flow: SequenceFlow,
  nodeLayers: Map<string, number>,
): number {
  return (
    xForTransitionLayer(nodeLayers.get(flow.sourceRef.id) ?? 0) + LAYER_SPACING
  );
}

function yForBranchIndex(branchIndex: number): number {
  return branchIndex * ROW_SPACING;
}

function boundsForPlace(x: number, y: number): Bounds {
  return {
    x,
    y: y - PLACE_SIZE / 2,
    width: PLACE_SIZE,
    height: PLACE_SIZE,
  };
}

function boundsForTransition(x: number, y: number): Bounds {
  return {
    x,
    y: y - TRANSITION_HEIGHT / 2,
    width: TRANSITION_WIDTH,
    height: TRANSITION_HEIGHT,
  };
}

function boundsCenter(bounds: Bounds): { x: number; y: number } {
  return {
    x: centerX(bounds),
    y: centerY(bounds),
  };
}

function centerX(bounds: Bounds): number {
  return bounds.x + bounds.width / 2;
}

function centerY(bounds: Bounds): number {
  return bounds.y + bounds.height / 2;
}

export function computeLocalStateLayout(
  choreography: Choreography,
  dataModel: DataModel,
  lifecycleModel: LifecycleModel,
): LocalStateLayout {
  const participantRowByRole = new Map(
    getParticipantNames(choreography).map((role, index) => [role, index]),
  );
  const classGroupStartByClassId = new Map<string, number>();

  let nextClassGroupStart = LOCAL_STATE_START_X;
  for (const dataClass of dataModel.classes) {
    const lifecycle = lifecycleModel.lifecycles.get(dataClass.id);
    const placeCount = (lifecycle?.states.length ?? 1) + 1;

    classGroupStartByClassId.set(dataClass.id, nextClassGroupStart);
    nextClassGroupStart +=
      Math.max(1, placeCount - 1) * LOCAL_STATE_NODE_SPACING +
      LOCAL_STATE_CLASS_SPACING;
  }

  function transitionAndExistenceRowYForRole(role: RoleId): number {
    const row = participantRowByRole.get(role);

    if (row === undefined) {
      throw new Error(`Cannot layout local state row for unknown role ${role}`);
    }

    return LOCAL_STATE_START_Y + row * LOCAL_STATE_PARTICIPANT_SPACING;
  }

  function awarenessRowYForRole(role: RoleId): number {
    return (
      transitionAndExistenceRowYForRole(role) + LOCAL_STATE_AWARENESS_ROW_OFFSET
    );
  }

  function xForStatePlace(classId: string, stateId: StateId): number {
    const lifecycle = lifecycleModel.lifecycles.get(classId);

    if (!lifecycle) {
      throw new Error(
        `Cannot layout local state place for unknown class ${classId}`,
      );
    }

    const stateIndex = lifecycle.states.findIndex(
      (state) => state.id === stateId,
    );

    if (stateIndex === -1) {
      throw new Error(
        `Cannot layout local state place for unknown state ${classId}.${stateId}`,
      );
    }

    return (
      (classGroupStartByClassId.get(classId) ?? LOCAL_STATE_START_X) +
      stateIndex * LOCAL_STATE_NODE_SPACING
    );
  }

  function xForExistencePlace(classId: string): number {
    return xForStatePlace(classId, "initial");
  }

  return {
    boundsForStatePlace: (role, classId, stateId) =>
      boundsForPlace(
        xForStatePlace(classId, stateId),
        awarenessRowYForRole(role),
      ),
    boundsForExistencePlace: (role, classId) =>
      boundsForPlace(
        xForExistencePlace(classId),
        transitionAndExistenceRowYForRole(role),
      ),
    boundsForLocalTransition: (role, classId, transition) => {
      const sourceX = xForStatePlace(classId, transition.source);
      const targetX = xForStatePlace(classId, transition.target);

      return boundsForTransition(
        (sourceX + targetX) / 2,
        transitionAndExistenceRowYForRole(role),
      );
    },
  };
}
