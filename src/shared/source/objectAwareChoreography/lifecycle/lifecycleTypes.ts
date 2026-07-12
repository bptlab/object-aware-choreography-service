import type { RoleId } from "../choreography/choreography.js";
import type { ClassId } from "../dataModel/dataModelTypes.js";

export type StateId = string;

export interface LifecycleModel {
  lifecycles: Map<ClassId, ObjectLifecycle>;
}

export interface ObjectLifecycle {
  classId: ClassId;
  className: string;
  states: LifecycleState[];
  initialStateId: StateId;
  transitions: LifecycleTransition[];
}

export interface LifecycleState {
  id: StateId;
  xmlId: string;
  name: string;
  attributes: string[];
  isInitial?: boolean;
}

export interface LifecycleTransition {
  id: string;
  source: StateId;
  target: StateId;
  sourceXmlId: string;
  targetXmlId: string;
  actor?: RoleId;
  triggerName?: string;
  rawName?: string;
}
