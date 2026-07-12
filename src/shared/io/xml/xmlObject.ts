import { convert } from "xmlbuilder2";

export type XmlElement = Record<string, unknown>;

export function parseXmlRoot(xml: string, rootName: string): XmlElement {
  const parsed = convert(xml, { format: "object" }) as unknown;
  const parsedObject = asElement(parsed, "XML document");
  const root = parsedObject[rootName];

  if (!isElement(root)) {
    throw new Error(`Expected XML root element ${rootName}`);
  }

  return root;
}

export function getRequiredAttribute(
  element: XmlElement,
  attributeName: string,
  context: string
): string {
  const value = element[`@${attributeName}`];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must have ${attributeName}`);
  }

  return value;
}

export function getOptionalAttribute(
  element: XmlElement,
  attributeName: string
): string | undefined {
  const value = element[`@${attributeName}`];

  if (typeof value !== "string") {
    return undefined;
  }

  return value;
}

export function getChildElements(
  element: XmlElement,
  childName: string
): XmlElement[] {
  const directChildren = elementsFromValue(element[childName]);
  const mixedChildren = elementsFromValue(element["#"]).flatMap((child) =>
    elementsFromValue(child[childName])
  );

  return [...directChildren, ...mixedChildren];
}

function elementsFromValue(value: unknown): XmlElement[] {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(isElement);
  }

  if (isElement(value)) {
    return [value];
  }

  return [];
}

function asElement(value: unknown, context: string): XmlElement {
  if (!isElement(value)) {
    throw new Error(`Expected ${context} to be an XML object`);
  }

  return value;
}

function isElement(value: unknown): value is XmlElement {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
