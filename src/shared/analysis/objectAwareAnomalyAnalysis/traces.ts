import type { AnalysisPetriNet } from "../../targets/petriNet/firing.js";
import type { ObjectAwareRealizabilityMetadata } from "./objectAwareAnomalyTypes.js";
import type {
  BehaviorStateSpace,
  BehaviorStateSpaceNode,
} from "./stateSpace.js";

export type ObjectAwareAnomalyTraceTransitionKind =
  | "local"
  | "send"
  | "receive"
  | "decision"
  | "control-flow";

export interface ObjectAwareAnomalyTraceStep {
  transitionId: string;
  transitionLabel?: string;
  transitionKind?: ObjectAwareAnomalyTraceTransitionKind;
}

export function reconstructTrace(
  stateSpace: BehaviorStateSpace,
  node: BehaviorStateSpaceNode,
  net: AnalysisPetriNet,
  metadata?: ObjectAwareRealizabilityMetadata,
): ObjectAwareAnomalyTraceStep[] {
  const steps: ObjectAwareAnomalyTraceStep[] = [];
  let current: BehaviorStateSpaceNode | undefined = node;

  while (current?.predecessorId !== undefined) {
    if (current.firedTransitionId) {
      steps.push({
        transitionId: current.firedTransitionId,
        transitionLabel: net.transitionLabels.get(current.firedTransitionId),
        transitionKind: metadata
          ? classifyTransition(current.firedTransitionId, metadata)
          : undefined,
      });
    }

    current = stateSpace.nodeById.get(current.predecessorId);
  }

  return steps.reverse();
}

export function traceText(
  trace: Array<{ transitionId: string; transitionLabel?: string }>,
): string[] {
  return trace.map((step) =>
    step.transitionLabel
      ? `${step.transitionLabel} (${step.transitionId})`
      : step.transitionId,
  );
}

function classifyTransition(
  transitionId: string,
  metadata: ObjectAwareRealizabilityMetadata,
): ObjectAwareAnomalyTraceTransitionKind {
  for (const localTransitionIds of metadata.localTransitionsByRole.values()) {
    if (localTransitionIds.includes(transitionId)) {
      return "local";
    }
  }

  if (
    metadata.taskInteractions.some((task) =>
      task.senderTransitionIds.includes(transitionId),
    )
  ) {
    return "send";
  }

  if (
    metadata.taskInteractions.some((task) =>
      task.receiverTransitionIds.includes(transitionId),
    )
  ) {
    return "receive";
  }

  if (
    metadata.decisionGateways.some((decision) =>
      decision.branchTransitionIds.includes(transitionId),
    )
  ) {
    return "decision";
  }

  return "control-flow";
}
