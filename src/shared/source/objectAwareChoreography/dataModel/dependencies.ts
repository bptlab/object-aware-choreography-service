import type { AssociationEnd, DataModel } from "./dataModelTypes.js";

export interface CreationDependencies {
  oneToOneGroups: string[][];
  oneToOneGroupByClass: Map<string, string[]>;
  existentialRequirementsByClass: Map<string, string[]>;
}

export function computeCreationDependencies(
  dataModel: DataModel
): CreationDependencies {
  const classIds = dataModel.classes.map((dataClass) => dataClass.id).sort();
  const knownClassIds = new Set(classIds);
  const unionFind = new UnionFind(classIds);

  for (const association of dataModel.associations) {
    const [left, right] = association.ends;
    validateAssociationEnd(left, knownClassIds, association.id);
    validateAssociationEnd(right, knownClassIds, association.id);

    if (isMandatoryOne(left) && isMandatoryOne(right)) {
      unionFind.union(left.classId, right.classId);
    }
  }

  const oneToOneGroups = buildOneToOneGroups(classIds, unionFind);
  const oneToOneGroupByClass = new Map<string, string[]>();

  for (const group of oneToOneGroups) {
    for (const classId of group) {
      oneToOneGroupByClass.set(classId, group);
    }
  }

  const existentialRequirementsByClass = new Map<string, string[]>(
    classIds.map((classId) => [classId, []])
  );

  for (const association of dataModel.associations) {
    const [left, right] = association.ends;
    addDirectedRequirement(
      left,
      right,
      oneToOneGroupByClass,
      existentialRequirementsByClass
    );
    addDirectedRequirement(
      right,
      left,
      oneToOneGroupByClass,
      existentialRequirementsByClass
    );
  }

  for (const [classId, requirements] of existentialRequirementsByClass) {
    existentialRequirementsByClass.set(
      classId,
      [...new Set(requirements)].sort()
    );
  }

  return {
    oneToOneGroups,
    oneToOneGroupByClass,
    existentialRequirementsByClass,
  };
}

function addDirectedRequirement(
  optionalEnd: AssociationEnd,
  requiredEnd: AssociationEnd,
  oneToOneGroupByClass: Map<string, string[]>,
  existentialRequirementsByClass: Map<string, string[]>
): void {
  if (!isOptionalOne(optionalEnd) || !isMandatoryOne(requiredEnd)) {
    return;
  }

  if (optionalEnd.classId === requiredEnd.classId) {
    return;
  }

  const optionalGroup = oneToOneGroupByClass.get(optionalEnd.classId) ?? [
    optionalEnd.classId,
  ];

  if (optionalGroup.includes(requiredEnd.classId)) {
    return;
  }

  existentialRequirementsByClass
    .get(optionalEnd.classId)
    ?.push(requiredEnd.classId);
}

function buildOneToOneGroups(
  classIds: string[],
  unionFind: UnionFind
): string[][] {
  const groupsByRoot = new Map<string, string[]>();

  for (const classId of classIds) {
    const root = unionFind.find(classId);
    const group = groupsByRoot.get(root) ?? [];
    group.push(classId);
    groupsByRoot.set(root, group);
  }

  return [...groupsByRoot.values()]
    .map((group) => group.sort())
    .sort((left, right) => left[0].localeCompare(right[0]));
}

function validateAssociationEnd(
  end: AssociationEnd,
  knownClassIds: Set<string>,
  associationId: string
): void {
  if (!knownClassIds.has(end.classId)) {
    throw new Error(
      `Association ${associationId} references unknown dependency class ${end.classId}`
    );
  }
}

function isMandatoryOne(end: AssociationEnd): boolean {
  return end.lower === 1 && end.upper === 1;
}

function isOptionalOne(end: AssociationEnd): boolean {
  return end.lower === 0 && end.upper === 1;
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  constructor(classIds: string[]) {
    for (const classId of classIds) {
      this.parent.set(classId, classId);
    }
  }

  find(classId: string): string {
    const parent = this.parent.get(classId);

    if (parent === undefined) {
      throw new Error(
        `Unknown class ${classId} in one-to-one dependency graph`
      );
    }

    if (parent === classId) {
      return classId;
    }

    const root = this.find(parent);
    this.parent.set(classId, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);

    if (leftRoot === rightRoot) {
      return;
    }

    if (leftRoot.localeCompare(rightRoot) <= 0) {
      this.parent.set(rightRoot, leftRoot);
    } else {
      this.parent.set(leftRoot, rightRoot);
    }
  }
}
