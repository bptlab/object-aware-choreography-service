import { computeCreationDependencies } from "../../source/objectAwareChoreography/dataModel/dependencies.js";
import type { DataModel } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type { LifecycleModel } from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import type { BsplParameterMapping } from "./parameterMapping.js";

export interface BsplKeyMapping {
  initialConcreteStatesByClass: Map<string, string[]>;
  objectIdentifiersByClass: Map<string, string[]>;
  directedCreationDependenciesByClass: Map<string, string[]>;
  oneToOneGroups: string[][];
}

export function buildBsplKeyMapping(args: {
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
  parameterMapping: BsplParameterMapping;
}): BsplKeyMapping {
  const { dataModel, lifecycleModel, parameterMapping } = args;
  const dependencies = computeCreationDependencies(dataModel);
  const objectIdentifiersByClass = new Map<string, string[]>();
  const initialConcreteStatesByClass = new Map<string, string[]>();

  for (const lifecycle of lifecycleModel.lifecycles.values()) {
    objectIdentifiersByClass.set(
      lifecycle.classId,
      parameterMapping.objectIdentifier(lifecycle.classId),
    );
    initialConcreteStatesByClass.set(
      lifecycle.classId,
      lifecycle.transitions
        .filter((transition) => transition.source === lifecycle.initialStateId)
        .map((transition) => transition.target)
        .sort(),
    );
  }

  const oneToOneGroups = dependencies.oneToOneGroups.filter(
    (group) => group.length > 1,
  );

  return {
    initialConcreteStatesByClass,
    objectIdentifiersByClass,
    directedCreationDependenciesByClass:
      propagateOneToOneGroupCreationDependencies(
        dependencies.existentialRequirementsByClass,
        dependencies.oneToOneGroupByClass,
      ),
    oneToOneGroups,
  };
}

function propagateOneToOneGroupCreationDependencies(
  directRequirementsByClass: Map<string, string[]>,
  oneToOneGroupByClass: Map<string, string[]>,
): Map<string, string[]> {
  const propagatedRequirementsByClass = new Map<string, string[]>();

  for (const classId of directRequirementsByClass.keys()) {
    const group = oneToOneGroupByClass.get(classId) ?? [classId];
    const groupMembers = new Set(group);
    const requirements = new Set<string>();

    for (const groupClassId of group) {
      for (const requiredClassId of
        directRequirementsByClass.get(groupClassId) ?? []) {
        if (!groupMembers.has(requiredClassId)) {
          requirements.add(requiredClassId);
        }
      }
    }

    propagatedRequirementsByClass.set(classId, [...requirements].sort());
  }

  return propagatedRequirementsByClass;
}
