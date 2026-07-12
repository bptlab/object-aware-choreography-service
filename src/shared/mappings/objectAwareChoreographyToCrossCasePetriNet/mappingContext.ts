import type { ObjectAwareChoreographyContext } from "../../context/objectAwareChoreographyContext.js";
import {
  getParticipantNames,
  getSequenceFlows,
} from "../../source/objectAwareChoreography/choreography/choreography.js";
import type { DataClass } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type { TypedIdentifierType } from "../../targets/typedPetriNet/index.js";
import type {
  CrossCasePetriNetMappingMetadata,
  CrossCasePetriNetOptions,
} from "./types.js";
import {
  caseTypeId,
  objectTypeId,
  objectVariableId,
  roleTypeId,
  roleVariableId,
} from "./ids.js";

export interface CrossCasePetriNetMappingContext {
  source: ObjectAwareChoreographyContext;
  options: CrossCasePetriNetOptions;
  roleIds: string[];
  classes: DataClass[];
  crossCaseClassIds: Set<string>;
  metadata: CrossCasePetriNetMappingMetadata;
  caseTypeId: string;
  roleTypeIdByRole: Map<string, string>;
  objectTypeIdByClass: Map<string, string>;
  roleVariableIdByRole: Map<string, string>;
  objectVariableIdByClass: Map<string, string>;
  sequenceFlowIds: string[];
}

export function createCrossCasePetriNetMappingContext(
  source: ObjectAwareChoreographyContext,
  options: CrossCasePetriNetOptions,
): CrossCasePetriNetMappingContext {
  const roleIds = getParticipantNames(source.choreography);
  const classes = [...source.dataModel.classes];
  const crossCaseClassIds = new Set(options.crossCaseClasses);

  for (const classId of crossCaseClassIds) {
    if (!classes.some((dataClass) => dataClass.id === classId)) {
      throw new Error(`Unknown cross-case class ${classId}`);
    }
  }

  return {
    source,
    options,
    roleIds,
    classes,
    crossCaseClassIds,
    metadata: {
      classes: classes.map((dataClass) => ({
        classId: dataClass.id,
        isCrossCase: crossCaseClassIds.has(dataClass.id),
      })),
    },
    caseTypeId: caseTypeId(),
    roleTypeIdByRole: new Map(roleIds.map((roleId) => [roleId, roleTypeId(roleId)])),
    objectTypeIdByClass: new Map(
      classes.map((dataClass) => [dataClass.id, objectTypeId(dataClass.id)]),
    ),
    roleVariableIdByRole: new Map(
      roleIds.map((roleId) => [roleId, roleVariableId(roleId)]),
    ),
    objectVariableIdByClass: new Map(
      classes.map((dataClass) => [dataClass.id, objectVariableId(dataClass.id)]),
    ),
    sequenceFlowIds: getSequenceFlows(source.choreography)
      .map((flow) => flow.id)
      .sort(),
  };
}

export function identifierTypesForContext(
  context: CrossCasePetriNetMappingContext,
): TypedIdentifierType[] {
  return [
    {
      id: context.caseTypeId,
      name: "Case",
      alias: "case",
      valueType: "ID",
    },
    ...context.roleIds.map((roleId) => ({
      id: requireMapValue(context.roleTypeIdByRole, roleId, "role type"),
      name: `Role ${roleId}`,
      alias: roleId,
      valueType: "ID" as const,
    })),
    ...context.classes.map((dataClass) => ({
      id: requireMapValue(
        context.objectTypeIdByClass,
        dataClass.id,
        "object type",
      ),
      name: `Object ${dataClass.id}`,
      alias: dataClass.id,
      valueType: "ID" as const,
    })),
  ];
}

export function requireMapValue<K, V>(
  map: Map<K, V>,
  key: K,
  description: string,
): V {
  const value = map.get(key);

  if (value === undefined) {
    throw new Error(`Missing ${description} for ${String(key)}`);
  }

  return value;
}
