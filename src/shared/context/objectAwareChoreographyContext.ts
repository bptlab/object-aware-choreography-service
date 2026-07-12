import type { Choreography } from "bpmn-moddle";
import { parseSingleChoreography } from "../source/objectAwareChoreography/choreography/bpmn.js";
import { getChoreographyTasks } from "../source/objectAwareChoreography/choreography/choreography.js";
import {
  getObjectReferences,
  type ObjectReference,
} from "../source/objectAwareChoreography/choreography/objectReferences.js";
import {
  buildTaskNameIndex,
  type TaskNameIndex,
} from "../source/objectAwareChoreography/choreography/taskNames.js";
import { parseDataModelXml } from "../source/objectAwareChoreography/dataModel/dataModelParser.js";
import type { DataModel } from "../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import { parseLifecycleXml } from "../source/objectAwareChoreography/lifecycle/lifecycleParser.js";
import type { LifecycleModel } from "../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import { validateObjectAwareChoreographyInput } from "../source/objectAwareChoreography/validation/objectAwareChoreographyValidation.js";

export type ObjectAwareChoreographySerializedInput = {
  choreography: string;
  shared_data_model: string;
  shared_object_lifecycles: string;
};

export interface ObjectAwareChoreographyContext {
  choreography: Choreography;
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  objectReferences: Map<string, ObjectReference>;
  taskNameIndex: TaskNameIndex;
}

export async function buildObjectAwareChoreographyContext(
  input: ObjectAwareChoreographySerializedInput,
): Promise<ObjectAwareChoreographyContext> {
  const choreography = await parseSingleChoreography(input.choreography);
  const dataModel = parseDataModelXml(input.shared_data_model);
  const lifecycleModel = parseLifecycleXml(input.shared_object_lifecycles);
  const objectReferences = getObjectReferences(choreography);
  const taskNameIndex = buildTaskNameIndex(getChoreographyTasks(choreography));

  validateObjectAwareChoreographyInput({
    choreography,
    dataModel,
    lifecycleModel,
    objectReferences,
  });

  return {
    choreography,
    dataModel,
    lifecycleModel,
    objectReferences,
    taskNameIndex,
  };
}
