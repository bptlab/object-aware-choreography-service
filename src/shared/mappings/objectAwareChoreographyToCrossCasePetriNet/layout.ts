import { buildPetriNetWithSemantics } from "../objectAwareChoreographyToPetriNet/buildPetriNet.js";
import type {
  IsolatedPetriNetArtifact,
  PetriNetPlaceSemantics,
  PetriNetTransitionSemantics,
} from "../objectAwareChoreographyToPetriNet/petriNetArtifact.js";
import { sideAnchorWaypoints } from "../../targets/layout/geometry.js";
import { typedPetriNetId } from "../../targets/typedPetriNet/ids.js";
import type {
  TypedBounds,
  TypedPetriNet,
  TypedPoint,
} from "../../targets/typedPetriNet/index.js";
import type { TypedPetriNetLayoutOverrides } from "../../targets/typedPetriNet/layout.js";
import {
  awarenessPlaceId,
  controlFlowPlaceId,
  endTransitionId,
  inclusionPlaceId,
  gatewayBranchTransitionId,
  creationTransitionId,
  localTransitionId,
  objectBindingPlaceId,
  participationPlaceId,
  poolPlaceId,
  parallelGatewayTransitionId,
  relationPlaceId,
  sinkPlaceId,
  startTransitionId,
  stateAwarenessPlaceId,
  taskAtomicTransitionId,
  taskReceiveTransitionId,
  taskSendTransitionId,
  transmissionPlaceId,
} from "./ids.js";
import { realLifecycleStates } from "./labels.js";
import type { CrossCasePetriNetMappingContext } from "./mappingContext.js";

const PLACE_WIDTH = 50;
const PLACE_HEIGHT = 50;
const START_X = 0;
const START_Y = 0;
const ROLE_INFRASTRUCTURE_X = START_X;
const ROLE_GROUP_X_GAP = 130;
const CLASS_COLUMN_START_X =
  ROLE_INFRASTRUCTURE_X + PLACE_WIDTH + ROLE_GROUP_X_GAP;
const DEFAULT_CLASS_COLUMN_WIDTH = 220;
const INTER_CLASS_X_GAP = 130;
const ROW_SPACING = 90;
const INTRA_GROUP_X_SPACING = PLACE_WIDTH + 50;
const BINDING_INTRA_GROUP_X_SPACING = PLACE_WIDTH + 60;
const ROLE_BAND_GAP = 120;
const BINDING_LAYER_GAP = 130;
const CONTROL_FLOW_LAYER_GAP = 150;
const FALLBACK_COLUMN_SPACING = 130;
const FALLBACK_ROW_SPACING = 110;

export function computeCrossCaseTypedPetriNetLayout(args: {
  net: TypedPetriNet;
  context: CrossCasePetriNetMappingContext;
  isolatedArtifact?: IsolatedPetriNetArtifact;
}): TypedPetriNetLayoutOverrides {
  const { net, context } = args;
  const isolatedArtifact =
    args.isolatedArtifact ??
    buildPetriNetWithSemantics({
      choreography: context.source.choreography,
      dataModel: context.source.dataModel,
      lifecycleModel: context.source.lifecycleModel,
      objectReferences: context.source.objectReferences,
      taskNameIndex: context.source.taskNameIndex,
    });
  const nodeBoundsById: Record<string, TypedBounds> = {};
  const classColumns = computeClassColumns(context);
  let y = START_Y;

  for (const roleId of context.roleIds) {
    const topY = y;
    const bottomY = y + ROW_SPACING;

    nodeBoundsById[placeElementId(poolPlaceId(roleId))] = nodeBounds(
      ROLE_INFRASTRUCTURE_X,
      topY,
    );
    nodeBoundsById[placeElementId(participationPlaceId(roleId))] = nodeBounds(
      ROLE_INFRASTRUCTURE_X,
      bottomY,
    );

    for (const dataClass of context.classes) {
      const classStartX =
        classColumns.get(dataClass.id)?.startX ?? CLASS_COLUMN_START_X;
      const lifecycle = context.source.lifecycleModel.lifecycles.get(
        dataClass.id,
      );
      const states = realLifecycleStates(lifecycle?.states ?? []);

      nodeBoundsById[placeElementId(awarenessPlaceId(roleId, dataClass.id))] =
        nodeBounds(classStartX, topY);
      states.forEach((state, stateIndex) => {
        nodeBoundsById[
          placeElementId(stateAwarenessPlaceId(roleId, dataClass.id, state.id))
        ] = nodeBounds(
          classStartX + stateIndex * INTRA_GROUP_X_SPACING,
          bottomY,
        );
      });
    }

    y = bottomY + PLACE_HEIGHT + ROLE_BAND_GAP;
  }

  addObjectStateTransitionBounds({
    net,
    artifact: isolatedArtifact,
    nodeBoundsById,
  });

  const bindingTopY = y + BINDING_LAYER_GAP;
  for (const dataClass of context.classes) {
    const classStartX =
      classColumns.get(dataClass.id)?.startX ?? CLASS_COLUMN_START_X;
    nodeBoundsById[placeElementId(objectBindingPlaceId(dataClass.id))] =
      nodeBounds(classStartX, bindingTopY);
    nodeBoundsById[placeElementId(inclusionPlaceId(dataClass.id))] = nodeBounds(
      classStartX + BINDING_INTRA_GROUP_X_SPACING,
      bindingTopY,
    );
  }

  const relationY = bindingTopY + ROW_SPACING;
  const relationAssociations = context.source.dataModel.associations.filter(
    (association) =>
      placeElementId(relationPlaceId(association.id)) in placeIds(net),
  );
  relationAssociations.forEach((association, index) => {
    const [left, right] = association.ends;
    const leftColumn = classColumns.get(left.classId);
    const rightColumn = classColumns.get(right.classId);
    const relationCenterX =
      leftColumn !== undefined && rightColumn !== undefined
        ? (leftColumn.centerX + rightColumn.centerX) / 2
        : nextFallbackClassCenterX(classColumns, index);

    nodeBoundsById[placeElementId(relationPlaceId(association.id))] =
      centeredNodeBounds(relationCenterX, relationY);
  });

  const controlFlowY = relationY + CONTROL_FLOW_LAYER_GAP;
  addLiftedControlFlowBounds({
    net,
    artifact: isolatedArtifact,
    nodeBoundsById,
    targetTopY: controlFlowY,
  });

  addFallbackBounds(net, nodeBoundsById, controlFlowY + FALLBACK_ROW_SPACING);

  const edgeWaypointsByArcId: Record<string, TypedPoint[]> = {};
  for (const arc of net.arcs) {
    const sourceBounds = nodeBoundsById[arc.sourceId];
    const targetBounds = nodeBoundsById[arc.targetId];

    if (sourceBounds && targetBounds) {
      edgeWaypointsByArcId[arc.id] = [
        ...sideAnchorWaypoints(sourceBounds, targetBounds),
      ];
    }
  }

  return {
    nodeBoundsById,
    edgeWaypointsByArcId,
  };
}

function addObjectStateTransitionBounds(args: {
  net: TypedPetriNet;
  artifact: IsolatedPetriNetArtifact;
  nodeBoundsById: Record<string, TypedBounds>;
}): void {
  const { net, artifact, nodeBoundsById } = args;

  for (const transition of semanticTransitions(artifact, "localTransition")) {
    const typedId = transitionElementId(
      localTransitionId(
        transition.roleId,
        transition.classId,
        transition.sourceStateId,
        transition.targetStateId,
      ),
    );
    if (!nodeExists(net, typedId)) {
      continue;
    }

    const sourceState =
      nodeBoundsById[
        placeElementId(
          stateAwarenessPlaceId(
            transition.roleId,
            transition.classId,
            transition.sourceStateId,
          ),
        )
      ];
    const targetState =
      nodeBoundsById[
        placeElementId(
          stateAwarenessPlaceId(
            transition.roleId,
            transition.classId,
            transition.targetStateId,
          ),
        )
      ];
    const reference = sourceState ?? targetState;
    if (!reference) {
      continue;
    }

    nodeBoundsById[typedId] = nodeBounds(
      reference.x + PLACE_WIDTH + 25,
      reference.y,
    );
  }

  for (const transition of semanticTransitions(
    artifact,
    "objectCreationTransition",
  )) {
    const typedId = transitionElementId(
      creationTransitionId(
        transition.roleId,
        transition.classId,
        transition.targetStateId,
      ),
    );
    if (!nodeExists(net, typedId)) {
      continue;
    }

    const targetState =
      nodeBoundsById[
        placeElementId(
          stateAwarenessPlaceId(
            transition.roleId,
            transition.classId,
            transition.targetStateId,
          ),
        )
      ];
    if (!targetState) {
      continue;
    }

    nodeBoundsById[typedId] = nodeBounds(
      targetState.x - PLACE_WIDTH - 25,
      targetState.y,
    );
  }

  for (const transition of semanticTransitions(
    artifact,
    "oneToOneObjectCreationTransition",
  )) {
    const typedId = transitionElementId(transition.isolatedTransitionId);
    if (!nodeExists(net, typedId)) {
      continue;
    }

    const targetStates = transition.entries
      .map(
        (entry) =>
          nodeBoundsById[
            placeElementId(
              stateAwarenessPlaceId(
                transition.roleId,
                entry.classId,
                entry.targetStateId,
              ),
            )
          ],
      )
      .filter((bounds): bounds is TypedBounds => bounds !== undefined);
    if (targetStates.length === 0) {
      continue;
    }

    const averageX =
      targetStates.reduce((sum, bounds) => sum + bounds.x, 0) /
      targetStates.length;
    const averageY =
      targetStates.reduce((sum, bounds) => sum + bounds.y, 0) /
      targetStates.length;
    nodeBoundsById[typedId] = nodeBounds(averageX - PLACE_WIDTH - 25, averageY);
  }
}

function addLiftedControlFlowBounds(args: {
  net: TypedPetriNet;
  artifact: IsolatedPetriNetArtifact;
  nodeBoundsById: Record<string, TypedBounds>;
  targetTopY: number;
}): void {
  const { net, artifact, nodeBoundsById, targetTopY } = args;
  const liftedNodes: Array<{
    typedId: string;
    isolatedId?: string;
    xOffset?: number;
    yOffset?: number;
    width?: number;
    height?: number;
  }> = [];

  for (const transition of semanticTransitions(
    artifact,
    "startEventTransition",
  )) {
    liftedNodes.push({
      typedId: transitionElementId(startTransitionId(transition.eventId)),
      isolatedId: transition.isolatedTransitionId,
    });
  }

  for (const transition of semanticTransitions(artifact, "endEventTransition")) {
    liftedNodes.push({
      typedId: transitionElementId(endTransitionId(transition.eventId)),
      isolatedId: transition.isolatedTransitionId,
    });
  }

  for (const place of semanticPlaces(artifact, "sinkPlace")) {
    liftedNodes.push({
      typedId: placeElementId(sinkPlaceId()),
      isolatedId: place.isolatedPlaceId,
      width: PLACE_WIDTH,
      height: PLACE_HEIGHT,
    });
  }

  for (const place of semanticPlaces(artifact, "controlFlowPlace")) {
    liftedNodes.push({
      typedId: placeElementId(controlFlowPlaceId(place.sequenceFlowId)),
      isolatedId: place.isolatedPlaceId,
      width: PLACE_WIDTH,
      height: PLACE_HEIGHT,
    });
  }

  for (const place of semanticPlaces(artifact, "transmissionPlace")) {
    liftedNodes.push({
      typedId: placeElementId(transmissionPlaceId(place.taskId)),
      isolatedId: place.isolatedPlaceId,
      yOffset: 70,
      width: PLACE_WIDTH,
      height: PLACE_HEIGHT,
    });
  }

  for (const transition of semanticTransitions(
    artifact,
    "gatewayBranchTransition",
  )) {
    liftedNodes.push({
      typedId: transitionElementId(
        gatewayBranchTransitionId(transition.gatewayId, transition.branchId),
      ),
      isolatedId: transition.isolatedTransitionId,
    });
  }

  for (const transition of semanticTransitions(
    artifact,
    "parallelGatewayTransition",
  )) {
    liftedNodes.push({
      typedId: transitionElementId(
        parallelGatewayTransitionId(transition.gatewayId),
      ),
      isolatedId: transition.isolatedTransitionId,
    });
  }

  for (const transition of semanticTransitions(
    artifact,
    "atomicTaskTransition",
  )) {
    liftedNodes.push({
      typedId: transitionElementId(taskAtomicTransitionId(transition.taskId)),
      isolatedId: transition.isolatedTransitionId,
    });
  }

  for (const transition of semanticTransitions(
    artifact,
    "taskSendTransition",
  )) {
    if (isNoObjectTaskTransition(artifact, transition.taskId)) {
      liftedNodes.push({
        typedId: transitionElementId(
          taskAtomicTransitionId(transition.taskId, transition.variantId),
        ),
        isolatedId: transition.isolatedTransitionId,
      });
      continue;
    }

    liftedNodes.push({
      typedId: transitionElementId(
        taskSendTransitionId(transition.taskId, transition.variantId),
      ),
      isolatedId: transition.isolatedTransitionId,
      xOffset: -60,
      yOffset: -70,
    });
  }

  for (const transition of semanticTransitions(
    artifact,
    "taskReceiveTransition",
  )) {
    if (isNoObjectTaskTransition(artifact, transition.taskId)) {
      continue;
    }

    liftedNodes.push({
      typedId: transitionElementId(
        taskReceiveTransitionId(transition.taskId, transition.variantId),
      ),
      isolatedId: transition.isolatedTransitionId,
      xOffset: 60,
      yOffset: 70,
    });
  }

  const presentNodes = liftedNodes.filter((node) =>
    nodeExists(net, node.typedId),
  );
  const isolatedBounds = presentNodes
    .map((node) =>
      node.isolatedId
        ? artifact.layout.nodeBoundsById[node.isolatedId]
        : undefined,
    )
    .filter((bounds): bounds is TypedBounds => bounds !== undefined);
  const minY = Math.min(...isolatedBounds.map((bounds) => bounds.y), 0);

  presentNodes.forEach((node, index) => {
    const sourceBounds = node.isolatedId
      ? artifact.layout.nodeBoundsById[node.isolatedId]
      : undefined;

    if (!sourceBounds) {
      nodeBoundsById[node.typedId] = nodeBounds(
        START_X + (index % 6) * FALLBACK_COLUMN_SPACING,
        targetTopY + Math.floor(index / 6) * FALLBACK_ROW_SPACING,
      );
      return;
    }

    nodeBoundsById[node.typedId] = {
      ...sourceBounds,
      x: sourceBounds.x + (node.xOffset ?? 0),
      y: targetTopY + (sourceBounds.y - minY) + (node.yOffset ?? 0),
      width: Math.max(sourceBounds.width, node.width ?? sourceBounds.width),
      height: Math.max(sourceBounds.height, node.height ?? sourceBounds.height),
    };
  });
}

function isNoObjectTaskTransition(
  artifact: IsolatedPetriNetArtifact,
  taskId: string,
): boolean {
  return Object.values(artifact.semantics.transitions)
    .filter(
      (
        transition,
      ): transition is Extract<
        PetriNetTransitionSemantics,
        { kind: "taskSendTransition" | "taskReceiveTransition" }
      > =>
        (transition.kind === "taskSendTransition" ||
          transition.kind === "taskReceiveTransition") &&
        transition.taskId === taskId,
    )
    .every((transition) => {
      if (transition.objectRef) {
        return false;
      }

      if (
        transition.stateReads.length > 0 ||
        transition.stateWrites.length > 0
      ) {
        return false;
      }

      return (
        transition.kind !== "taskReceiveTransition" ||
        transition.existenceWrites.length === 0
      );
    });
}

function semanticPlaces<K extends PetriNetPlaceSemantics["kind"]>(
  artifact: IsolatedPetriNetArtifact,
  kind: K,
): Array<Extract<PetriNetPlaceSemantics, { kind: K }>> {
  return Object.values(artifact.semantics.places).filter(
    (place): place is Extract<PetriNetPlaceSemantics, { kind: K }> =>
      place.kind === kind,
  );
}

function semanticTransitions<K extends PetriNetTransitionSemantics["kind"]>(
  artifact: IsolatedPetriNetArtifact,
  kind: K,
): Array<Extract<PetriNetTransitionSemantics, { kind: K }>> {
  return Object.values(artifact.semantics.transitions).filter(
    (
      transition,
    ): transition is Extract<PetriNetTransitionSemantics, { kind: K }> =>
      transition.kind === kind,
  );
}

function nodeExists(net: TypedPetriNet, id: string): boolean {
  return (
    net.places.some((place) => place.id === id) ||
    net.transitions.some((transition) => transition.id === id)
  );
}

function computeClassColumns(
  context: CrossCasePetriNetMappingContext,
): Map<string, { startX: number; centerX: number; width: number }> {
  const columns = new Map<
    string,
    { startX: number; centerX: number; width: number }
  >();
  let leftX = CLASS_COLUMN_START_X;

  for (const dataClass of context.classes) {
    const lifecycle = context.source.lifecycleModel.lifecycles.get(
      dataClass.id,
    );
    const stateCount = realLifecycleStates(lifecycle?.states ?? []).length;
    const width = Math.max(
      DEFAULT_CLASS_COLUMN_WIDTH,
      stateGroupWidth(stateCount),
      BINDING_INTRA_GROUP_X_SPACING + PLACE_WIDTH,
    );

    columns.set(dataClass.id, {
      startX: leftX,
      centerX: leftX + width / 2,
      width,
    });
    leftX += width + INTER_CLASS_X_GAP;
  }

  return columns;
}

function nextFallbackClassCenterX(
  columns: Map<string, { centerX: number; width: number }>,
  index: number,
): number {
  const columnValues = [...columns.values()];
  const lastColumn = columnValues.at(-1);

  if (!lastColumn) {
    return CLASS_COLUMN_START_X + index * DEFAULT_CLASS_COLUMN_WIDTH;
  }

  return (
    lastColumn.centerX +
    lastColumn.width / 2 +
    INTER_CLASS_X_GAP +
    DEFAULT_CLASS_COLUMN_WIDTH / 2 +
    index * (DEFAULT_CLASS_COLUMN_WIDTH + INTER_CLASS_X_GAP)
  );
}

function stateGroupWidth(stateCount: number): number {
  return Math.max(0, stateCount - 1) * INTRA_GROUP_X_SPACING + PLACE_WIDTH;
}

function addFallbackBounds(
  net: TypedPetriNet,
  nodeBoundsById: Record<string, TypedBounds>,
  startY: number,
): void {
  const unpositionedIds = [
    ...net.places.map((place) => place.id),
    ...net.transitions.map((transition) => transition.id),
  ].filter((id) => nodeBoundsById[id] === undefined);

  unpositionedIds.sort().forEach((id, index) => {
    nodeBoundsById[id] = nodeBounds(
      START_X + (index % 6) * FALLBACK_COLUMN_SPACING,
      startY + Math.floor(index / 6) * FALLBACK_ROW_SPACING,
    );
  });
}

function centeredNodeBounds(centerX: number, y: number): TypedBounds {
  return nodeBounds(centerX - PLACE_WIDTH / 2, y);
}

function placeIds(net: TypedPetriNet): Record<string, true> {
  return Object.fromEntries(net.places.map((place) => [place.id, true]));
}

function nodeBounds(x: number, y: number): TypedBounds {
  return {
    x,
    y,
    width: PLACE_WIDTH,
    height: PLACE_HEIGHT,
  };
}

function placeElementId(id: string): string {
  return typedPetriNetId("Place", id);
}

function transitionElementId(id: string): string {
  return typedPetriNetId("Transition", id);
}
