import type { BsplWarning } from "../../targets/bspl/bsplTypes.js";
import type { DataModel } from "../../source/objectAwareChoreography/dataModel/dataModelTypes.js";
import type {
  LifecycleModel,
  ObjectLifecycle,
} from "../../source/objectAwareChoreography/lifecycle/lifecycleTypes.js";
import { sanitizeBsplIdentifierPart } from "../../ids/sanitization.js";

export interface BsplParameterMapping {
  warnings: BsplWarning[];
  attributeSignature(classId: string, stateId: string): string[];
  stateIndicatorSignature(classId: string, stateId: string): string[];
  stateSignature(classId: string, stateId: string): string[][];
  objectIdentifier(classId: string): string[];
  stateIndicatorParameters(): string[];
  attributeParameters(): string[];
}

export function buildBsplParameterMapping(args: {
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
}): BsplParameterMapping {
  const { dataModel, lifecycleModel } = args;
  const warnings: BsplWarning[] = [];
  const dataClassesById = new Map(
    dataModel.classes.map((dataClass) => [dataClass.id, dataClass]),
  );
  const synchronizedTargetStates = buildSynchronizedTargetStates(lifecycleModel);
  const attributeParameterNames = buildAttributeParameterNames({
    dataModel,
    lifecycleModel,
  });
  const stateIndicatorParameterNames = buildStateIndicatorParameterNames({
    lifecycleModel,
    synchronizedTargetStates,
  });
  const objectIdentifiers = new Map<string, string[]>();

  for (const lifecycle of lifecycleModel.lifecycles.values()) {
    objectIdentifiers.set(
      lifecycle.classId,
      computeObjectIdentifier({
        lifecycle,
        dataModel,
        warnings,
        attributeParameterNames,
      }),
    );
  }

  const mapping: BsplParameterMapping = {
    warnings,
    attributeSignature(classId, stateId) {
      const lifecycle = lifecycleModel.lifecycles.get(classId);
      const dataClass = dataClassesById.get(classId);
      const knownAttributes = new Set(dataClass?.attributes ?? []);
      const state = lifecycle?.states.find((candidate) => candidate.id === stateId);

      if (!state || state.attributes.length === 0) {
        return [];
      }

      return state.attributes
        .filter((attribute) => knownAttributes.size === 0 || knownAttributes.has(attribute))
        .map((attribute) =>
          mustGetParameterName(
            attributeParameterNames,
            attributeParameterKey(classId, attribute),
          ),
        )
        .sort();
    },
    stateIndicatorSignature(classId, stateId) {
      if (!synchronizedTargetStates.get(classId)?.has(stateId)) {
        return [];
      }

      return [
        mustGetParameterName(
          stateIndicatorParameterNames,
          stateIndicatorParameterKey(classId, stateId),
        ),
      ];
    },
    stateSignature(classId, stateId) {
      const alternatives = [
        this.attributeSignature(classId, stateId),
        this.stateIndicatorSignature(classId, stateId),
      ].filter((signature) => signature.length > 0);

      return alternatives;
    },
    objectIdentifier(classId) {
      const identifier = objectIdentifiers.get(classId);

      if (!identifier || identifier.length === 0) {
        throw new Error(`No BSPL object identifier is available for class ${classId}`);
      }

      return identifier;
    },
    stateIndicatorParameters() {
      return [...synchronizedTargetStates.entries()]
        .flatMap(([classId, stateIds]) =>
          [...stateIds].map((stateId) =>
            mustGetParameterName(
              stateIndicatorParameterNames,
              stateIndicatorParameterKey(classId, stateId),
            ),
          ),
        )
        .sort();
    },
    attributeParameters() {
      return [...attributeParameterNames.values()].sort();
    },
  };

  return mapping;
}

export function sanitizeBsplIdentifier(
  value: string,
  fallback = "parameter",
): string {
  return sanitizeBsplIdentifierPart(value, fallback);
}

export function bsplMessageName(
  taskName: string,
  fallbackTaskId = "message",
): string {
  return sanitizeBsplIdentifier(taskName, fallbackTaskId);
}

export function taskOccurrenceParameterName(
  taskName: string,
  fallbackTaskId = "task",
): string {
  return ["task", sanitizeBsplIdentifier(taskName, fallbackTaskId)].join("_");
}

export function attributeParameterName(args: {
  className: string;
  attributeName: string;
  fallbackClassId?: string;
  fallbackAttributeId?: string;
}): string {
  return [
    "attribute",
    sanitizeBsplIdentifier(args.className, args.fallbackClassId),
    sanitizeBsplIdentifier(args.attributeName, args.fallbackAttributeId),
  ].join("_");
}

export function stateIndicatorParameterName(args: {
  className: string;
  stateName: string;
  fallbackClassId?: string;
  fallbackStateId?: string;
}): string {
  return [
    "state",
    sanitizeBsplIdentifier(args.className, args.fallbackClassId),
    sanitizeBsplIdentifier(args.stateName, args.fallbackStateId),
  ].join("_");
}

function buildAttributeParameterNames(args: {
  dataModel: DataModel;
  lifecycleModel: LifecycleModel;
}): Map<string, string> {
  const namesByKey = new Map<string, string>();
  const seenSemanticsByName = new Map<string, string>();
  const classesById = new Map(
    args.dataModel.classes.map((dataClass) => [dataClass.id, dataClass]),
  );
  const attributesByClassId = new Map<string, Set<string>>();

  for (const dataClass of args.dataModel.classes) {
    const attributes = attributesByClassId.get(dataClass.id) ?? new Set<string>();
    dataClass.attributes.forEach((attribute) => attributes.add(attribute));
    attributesByClassId.set(dataClass.id, attributes);
  }

  for (const lifecycle of args.lifecycleModel.lifecycles.values()) {
    const attributes =
      attributesByClassId.get(lifecycle.classId) ?? new Set<string>();

    for (const state of lifecycle.states) {
      state.attributes.forEach((attribute) => attributes.add(attribute));
    }

    attributesByClassId.set(lifecycle.classId, attributes);
  }

  for (const [classId, attributes] of attributesByClassId.entries()) {
    const dataClass = classesById.get(classId);
    const className = dataClass?.name ?? classId;

    for (const attribute of [...attributes].sort()) {
      const key = attributeParameterKey(classId, attribute);
      const semantic = `attribute ${className}.${attribute}`;
      const name = attributeParameterName({
        className,
        attributeName: attribute,
        fallbackClassId: classId,
        fallbackAttributeId: attribute,
      });

      registerUniqueParameterName({
        namesByKey,
        seenSemanticsByName,
        key,
        name,
        semantic,
      });
    }
  }

  return namesByKey;
}

function buildStateIndicatorParameterNames(args: {
  lifecycleModel: LifecycleModel;
  synchronizedTargetStates: Map<string, Set<string>>;
}): Map<string, string> {
  const namesByKey = new Map<string, string>();
  const seenSemanticsByName = new Map<string, string>();

  for (const lifecycle of args.lifecycleModel.lifecycles.values()) {
    const synchronizedStateIds =
      args.synchronizedTargetStates.get(lifecycle.classId) ?? new Set<string>();

    for (const state of lifecycle.states) {
      if (!synchronizedStateIds.has(state.id)) {
        continue;
      }

      const key = stateIndicatorParameterKey(lifecycle.classId, state.id);
      const semantic = `state ${lifecycle.className}.${state.name}`;
      const name = stateIndicatorParameterName({
        className: lifecycle.className,
        stateName: state.name,
        fallbackClassId: lifecycle.classId,
        fallbackStateId: state.id,
      });

      registerUniqueParameterName({
        namesByKey,
        seenSemanticsByName,
        key,
        name,
        semantic,
      });
    }
  }

  return namesByKey;
}

function registerUniqueParameterName(args: {
  namesByKey: Map<string, string>;
  seenSemanticsByName: Map<string, string>;
  key: string;
  name: string;
  semantic: string;
}): void {
  const existingSemantic = args.seenSemanticsByName.get(args.name);

  if (existingSemantic && existingSemantic !== args.semantic) {
    throw new Error(
      `BSPL parameter naming collision for ${args.name}: ${existingSemantic} conflicts with ${args.semantic}`,
    );
  }

  args.seenSemanticsByName.set(args.name, args.semantic);
  args.namesByKey.set(args.key, args.name);
}

function mustGetParameterName(
  parameterNames: Map<string, string>,
  key: string,
): string {
  const parameterName = parameterNames.get(key);

  if (!parameterName) {
    throw new Error(`Missing BSPL parameter name for ${key}`);
  }

  return parameterName;
}

function attributeParameterKey(classId: string, attributeName: string): string {
  return `${classId}\u0000${attributeName}`;
}

function stateIndicatorParameterKey(classId: string, stateId: string): string {
  return `${classId}\u0000${stateId}`;
}

function computeObjectIdentifier(args: {
  lifecycle: ObjectLifecycle;
  dataModel: DataModel;
  warnings: BsplWarning[];
  attributeParameterNames: Map<string, string>;
}): string[] {
  const { lifecycle, dataModel, warnings, attributeParameterNames } = args;
  const initialConcreteStateIds = lifecycle.transitions
    .filter((transition) => transition.source === lifecycle.initialStateId)
    .map((transition) => transition.target)
    .sort();
  const initialStateAttributeSignatures = initialConcreteStateIds.map((stateId) => {
    const state = lifecycle.states.find((candidate) => candidate.id === stateId);

    return new Set(
      (state?.attributes ?? []).map((attribute) =>
        mustGetParameterName(
          attributeParameterNames,
          attributeParameterKey(lifecycle.classId, attribute),
        ),
      ),
    );
  });
  const intersection = intersectSets(initialStateAttributeSignatures);

  if (intersection.length > 0) {
    return intersection;
  }

  const dataClass = dataModel.classes.find(
    (candidate) => candidate.id === lifecycle.classId,
  );
  const fallbackIdentifier = dataClass?.attributes.find((attribute) =>
    /_id$/i.test(attribute),
  );

  if (fallbackIdentifier) {
    warnings.push({
      code: "bspl.identifierFallback",
      message: `Class ${lifecycle.classId} has no common initial-state attribute signature; using data-model attribute ${fallbackIdentifier} as prototype object identifier.`,
      details: {
        classId: lifecycle.classId,
        fallbackIdentifier,
      },
    });

    return [
      mustGetParameterName(
        attributeParameterNames,
        attributeParameterKey(lifecycle.classId, fallbackIdentifier),
      ),
    ];
  }

  throw new Error(
    `Could not determine BSPL object-identifying parameters for class ${lifecycle.classId}; initial concrete states have no common attributes and no data-model attribute ending in _id exists.`,
  );
}

function buildSynchronizedTargetStates(
  lifecycleModel: LifecycleModel,
): Map<string, Set<string>> {
  const targetStatesByClass = new Map<string, Set<string>>();

  for (const lifecycle of lifecycleModel.lifecycles.values()) {
    for (const transition of lifecycle.transitions) {
      if (!transition.triggerName) {
        continue;
      }

      const targetStates = targetStatesByClass.get(lifecycle.classId) ?? new Set();
      targetStates.add(transition.target);
      targetStatesByClass.set(lifecycle.classId, targetStates);
    }
  }

  return targetStatesByClass;
}

function intersectSets(sets: Array<Set<string>>): string[] {
  if (sets.length === 0) {
    return [];
  }

  return [...sets[0]]
    .filter((value) => sets.every((set) => set.has(value)))
    .sort();
}
