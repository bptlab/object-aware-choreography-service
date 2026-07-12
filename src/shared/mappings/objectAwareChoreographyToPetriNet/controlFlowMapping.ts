import type { Choreography } from "bpmn-moddle";
import { isBpmnType } from "../../source/objectAwareChoreography/choreography/bpmn.js";
import {
  buildExclusiveGatewayDirections,
  buildIncomingFlowsByNodeId,
  buildOutgoingFlowsByNodeId,
  getChoreographyTasks,
  getEndEvents,
  getEventBasedGateways,
  getExclusiveGateways,
  getParallelGateways,
  getSequenceFlows,
  getStartEvents,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import { parseObjectReferenceText } from "../../source/objectAwareChoreography/choreography/objectReferences.js";
import { buildChoreographyBackboneDescriptors } from "../objectAwareChoreographyNetBackbone/index.js";
import {
  placeIdForSequenceFlow,
  transitionIdForExclusiveJoin,
  transitionIdForExclusiveSplit,
  transitionIdForNode,
  transitionIdForParallelGateway,
} from "../../targets/petriNet/ids.js";
import type { ControlFlowLayout } from "./mappingContext.js";
import { PetriNetBuilder } from "../../targets/petriNet/petriNetBuilder.js";

export function buildControlFlowNet(
  choreography: Choreography,
  builder: PetriNetBuilder,
  layout: ControlFlowLayout
): void {
  const startEvents = getStartEvents(choreography);
  const endEvents = getEndEvents(choreography);
  const choreographyTasks = getChoreographyTasks(choreography);
  const parallelGateways = getParallelGateways(choreography);
  const exclusiveGateways = getExclusiveGateways(choreography);
  const eventBasedGateways = getEventBasedGateways(choreography);
  const sequenceFlows = getSequenceFlows(choreography);
  const controlFlowPlaceDescriptors = buildChoreographyBackboneDescriptors({
    choreography,
  }).filter((descriptor) => descriptor.kind === "controlFlowPlace");
  const incomingFlowsByNodeId = buildIncomingFlowsByNodeId(choreography);
  const outgoingFlowsByNodeId = buildOutgoingFlowsByNodeId(choreography);
  const exclusiveGatewayDirections =
    buildExclusiveGatewayDirections(choreography);

  builder.addPlace("p_source", "source", 1, layout.boundsForSourcePlace());
  builder.addPlace("p_sink", "sink", 0, layout.boundsForSinkPlace());

  for (const descriptor of controlFlowPlaceDescriptors) {
    const flow = sequenceFlows.find(
      (candidate) => candidate.id === descriptor.sequenceFlowId,
    );

    if (!flow) {
      throw new Error(
        `Backbone descriptor references unknown sequence flow ${descriptor.sequenceFlowId}`,
      );
    }

    if (!isBpmnType(flow.sourceRef, "bpmn:EventBasedGateway")) {
      builder.addPlace(
        placeIdForSequenceFlow(flow),
        descriptor.label ?? flow.id,
        0,
        layout.boundsForSequenceFlowPlace(flow)
      );
    }
  }

  for (const event of [...startEvents, ...endEvents]) {
    builder.addTransition(
      transitionIdForNode(event),
      event.name ?? event.id,
      false,
      layout.boundsForNodeTransition(event)
    );
  }

  for (const task of choreographyTasks) {
    builder.addTransition(
      transitionIdForNode(task),
      task.name ?? task.id,
      false,
      layout.boundsForNodeTransition(task)
    );
  }

  for (const gateway of parallelGateways) {
    builder.addTransition(
      transitionIdForParallelGateway(gateway),
      gateway.name ?? gateway.id,
      true,
      layout.boundsForNodeTransition(gateway)
    );
  }

  for (const gateway of exclusiveGateways) {
    const direction = exclusiveGatewayDirections.get(gateway.id);
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];

    if (direction === "split") {
      for (const outgoingFlow of outgoingFlows) {
        builder.addTransition(
          transitionIdForExclusiveSplit(
            gateway,
            outgoingFlow.targetRef,
            branchConditionForFlow(outgoingFlow),
          ),
          `${gateway.name ?? gateway.id} -> ${
            outgoingFlow.targetRef.name ?? outgoingFlow.targetRef.id
          }`,
          true,
          layout.boundsForExclusiveSplitTransition(outgoingFlow)
        );
      }
    }

    if (direction === "join") {
      for (const incomingFlow of incomingFlows) {
        builder.addTransition(
          transitionIdForExclusiveJoin(incomingFlow.sourceRef, gateway),
          `${incomingFlow.sourceRef.name ?? incomingFlow.sourceRef.id} -> ${
            gateway.name ?? gateway.id
          }`,
          true,
          layout.boundsForExclusiveJoinTransition(incomingFlow)
        );
      }
    }
  }

  const startEvent = startEvents[0];
  builder.addArc("p_source", transitionIdForNode(startEvent));

  for (const endEvent of endEvents) {
    builder.addArc(transitionIdForNode(endEvent), "p_sink");
  }

  for (const flow of sequenceFlows) {
    if (isBpmnType(flow.sourceRef, "bpmn:EventBasedGateway")) {
      continue;
    }

    const source = flow.sourceRef;
    const target = flow.targetRef;
    const placeId = placeIdForSequenceFlow(flow);

    if (
      isBpmnType(
        target,
        "bpmn:StartEvent",
        "bpmn:EndEvent",
        "bpmn:ChoreographyTask",
        "bpmn:ParallelGateway"
      )
    ) {
      builder.addArc(
        placeId,
        isBpmnType(target, "bpmn:ParallelGateway")
          ? transitionIdForParallelGateway(target)
          : transitionIdForNode(target),
      );
    }

    if (
      isBpmnType(
        source,
        "bpmn:StartEvent",
        "bpmn:EndEvent",
        "bpmn:ChoreographyTask",
        "bpmn:ParallelGateway"
      )
    ) {
      builder.addArc(
        isBpmnType(source, "bpmn:ParallelGateway")
          ? transitionIdForParallelGateway(source)
          : transitionIdForNode(source),
        placeId,
      );
    }
  }

  for (const gateway of exclusiveGateways) {
    const direction = exclusiveGatewayDirections.get(gateway.id);
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];

    if (direction === "split") {
      for (const incomingFlow of incomingFlows) {
        for (const outgoingFlow of outgoingFlows) {
          const transitionId = transitionIdForExclusiveSplit(
            gateway,
            outgoingFlow.targetRef,
            branchConditionForFlow(outgoingFlow),
          );
          builder.addArc(placeIdForSequenceFlow(incomingFlow), transitionId);
        }
      }

      for (const outgoingFlow of outgoingFlows) {
        builder.addArc(
          transitionIdForExclusiveSplit(
            gateway,
            outgoingFlow.targetRef,
            branchConditionForFlow(outgoingFlow),
          ),
          placeIdForSequenceFlow(outgoingFlow)
        );
      }
    }

    if (direction === "join") {
      for (const incomingFlow of incomingFlows) {
        builder.addArc(
          placeIdForSequenceFlow(incomingFlow),
          transitionIdForExclusiveJoin(incomingFlow.sourceRef, gateway)
        );
      }

      for (const outgoingFlow of outgoingFlows) {
        for (const incomingFlow of incomingFlows) {
          builder.addArc(
            transitionIdForExclusiveJoin(incomingFlow.sourceRef, gateway),
            placeIdForSequenceFlow(outgoingFlow)
          );
        }
      }
    }
  }

  for (const gateway of eventBasedGateways) {
    const incomingFlows = incomingFlowsByNodeId.get(gateway.id) ?? [];
    const outgoingFlows = outgoingFlowsByNodeId.get(gateway.id) ?? [];

    for (const incomingFlow of incomingFlows) {
      for (const outgoingFlow of outgoingFlows) {
        builder.addArc(
          placeIdForSequenceFlow(incomingFlow),
          transitionIdForNode(outgoingFlow.targetRef)
        );
      }
    }
  }
}

function branchConditionForFlow(flow: { name?: string }): 
  | { classId: string; stateId: string }
  | undefined {
  if (!flow.name) {
    return undefined;
  }

  return parseObjectReferenceText(flow.name);
}
