import type { ChoreographyTask, SequenceFlow } from "bpmn-moddle";
import type { Association } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type { LifecycleState } from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import type { CrossCasePetriNetMappingContext } from "./mappingContext.js";

export function realLifecycleStates(states: LifecycleState[]): LifecycleState[] {
  return states.filter((state) => !state.isInitial);
}

export function poolPlaceLabel(roleId: string): string {
  return `${roleId} Pool`;
}

export function participationPlaceLabel(roleId: string): string {
  return `${roleId} Participants`;
}

export function awarenessPlaceLabel(roleId: string, className: string): string {
  return `${roleId}.${className}+`;
}

export function stateAwarenessPlaceLabel(
  roleId: string,
  className: string,
  stateName: string,
): string {
  return `${roleId}.${className} [${stateName}]`;
}

export function objectBindingPlaceLabel(className: string): string {
  return `${className} Case Correlation`;
}

export function inclusionPlaceLabel(className: string): string {
  return `${className} Case Inclusion`;
}

export function relationPlaceLabel(
  association: Association,
  context: CrossCasePetriNetMappingContext,
): string {
  const [left, right] = association.ends;

  return `${classNameForId(left.classId, context)} ${classNameForId(
    right.classId,
    context,
  )} Association`;
}

export function transmissionPlaceLabel(task: ChoreographyTask): string {
  return `${task.name ?? task.id} Transmission`;
}

export function controlFlowPlaceLabel(flow: SequenceFlow): string {
  return flow.name?.trim() || `Control Flow ${flow.id}`;
}

export function startTransitionLabel(): string {
  return "Start Case";
}

export function endTransitionLabel(): string {
  return "End Case";
}

export function sinkPlaceLabel(): string {
  return "sink";
}

export function creationTransitionLabel(className: string): string {
  return `Create ${className}`;
}

export function taskSendTransitionLabel(taskName: string): string {
  return `${taskName} Send`;
}

export function taskAtomicTransitionLabel(taskName: string): string {
  return taskName;
}

export function taskReceiveTransitionLabel(taskName: string): string {
  return `${taskName} Receive`;
}

export function gatewayBranchTransitionLabel(args: {
  gatewayName?: string;
  branchId: string;
  direction: "split" | "join";
}): string {
  const gatewayName = args.gatewayName ?? "Gateway";
  const directionLabel = args.direction === "split" ? "Branch" : "Join";

  return `${gatewayName} ${directionLabel} ${args.branchId}`;
}

export function parallelGatewayTransitionLabel(gatewayName?: string): string {
  return gatewayName ?? "Parallel Gateway";
}

function classNameForId(
  classId: string,
  context: CrossCasePetriNetMappingContext,
): string {
  return (
    context.classes.find((dataClass) => dataClass.id === classId)?.name ?? classId
  );
}
