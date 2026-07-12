import {
  getChildElements,
  getRequiredAttribute,
  parseXmlRoot,
} from "../../../io/xml/xmlObject.js";
import type {
  Association,
  AssociationEnd,
  DataClass,
  DataModel,
} from "./dataModelTypes.js";

export function parseDataModelXml(xml: string): DataModel {
  const root = parseXmlRoot(xml, "cd:definitions");
  const models = getChildElements(root, "cd:model");

  if (models.length === 0) {
    throw new Error("Data model XML must contain at least one cd:model");
  }

  const classes = models.flatMap(parseClasses);
  const classXmlIdToClassId = new Map<string, string>();
  const classNames = new Set<string>();

  for (const dataClass of classes) {
    if (classNames.has(dataClass.name)) {
      throw new Error(`Duplicate data model class name ${dataClass.name}`);
    }

    classNames.add(dataClass.name);
  }

  for (const model of models) {
    for (const classElement of getChildElements(model, "cd:class")) {
      const xmlId = getRequiredAttribute(classElement, "id", "Data class");
      const name = getRequiredAttribute(classElement, "name", "Data class");
      classXmlIdToClassId.set(xmlId, name);
    }
  }

  const associations = models.flatMap((model) =>
    parseAssociations(model, classXmlIdToClassId)
  );

  return {
    classes,
    associations,
  };
}

function parseClasses(modelElement: Record<string, unknown>): DataClass[] {
  return getChildElements(modelElement, "cd:class").map((classElement) => {
    getRequiredAttribute(classElement, "id", "Data class");
    const name = getRequiredAttribute(classElement, "name", "Data class");
    const attributes = getChildElements(classElement, "cd:attribute").map(
      (attributeElement) =>
        getRequiredAttribute(attributeElement, "name", `Attribute of ${name}`)
    );

    return {
      id: name,
      name,
      attributes,
    };
  });
}

function parseAssociations(
  modelElement: Record<string, unknown>,
  classXmlIdToClassId: Map<string, string>
): Association[] {
  return getChildElements(modelElement, "cd:association").map(
    (associationElement) => {
      const id = getRequiredAttribute(
        associationElement,
        "id",
        "Data association"
      );
      const sourceXmlId = getRequiredAttribute(
        associationElement,
        "source",
        `Data association ${id}`
      );
      const targetXmlId = getRequiredAttribute(
        associationElement,
        "target",
        `Data association ${id}`
      );
      const sourceClassId = classXmlIdToClassId.get(sourceXmlId);
      const targetClassId = classXmlIdToClassId.get(targetXmlId);

      if (!sourceClassId) {
        throw new Error(
          `Data association ${id} source ${sourceXmlId} does not reference a known class`
        );
      }

      if (!targetClassId) {
        throw new Error(
          `Data association ${id} target ${targetXmlId} does not reference a known class`
        );
      }

      return {
        id,
        ends: [
          parseAssociationEnd(
            sourceClassId,
            getRequiredAttribute(
              associationElement,
              "sourceMultiplicity",
              `Data association ${id}`
            ),
            id
          ),
          parseAssociationEnd(
            targetClassId,
            getRequiredAttribute(
              associationElement,
              "targetMultiplicity",
              `Data association ${id}`
            ),
            id
          ),
        ],
      };
    }
  );
}

function parseAssociationEnd(
  classId: string,
  multiplicity: string,
  associationId: string
): AssociationEnd {
  const parts = multiplicity.trim().split("..");

  if (parts.length === 1) {
    if (parts[0] === "*") {
      return {
        classId,
        lower: 0,
        upper: 1,
      };
    }

    return {
      classId,
      lower: parseMultiplicityNumber(parts[0], associationId),
      upper:
        parts[0] === "*"
          ? "*"
          : parseMultiplicityNumber(parts[0], associationId),
    };
  }

  if (parts.length === 2) {
    return {
      classId,
      lower: parseMultiplicityNumber(parts[0], associationId),
      upper:
        parts[1] === "*"
          ? "*"
          : parseMultiplicityNumber(parts[1], associationId),
    };
  }

  throw new Error(
    `Could not parse multiplicity ${multiplicity} in data association ${associationId}`
  );
}

function parseMultiplicityNumber(value: string, associationId: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Could not parse multiplicity ${value} in data association ${associationId}`
    );
  }

  return Number(value);
}
