import {
  getChildElements,
  getOptionalAttribute,
  getRequiredAttribute,
  parseXmlRoot,
} from "../../../io/xml/xmlObject.js";
import type {
  LifecycleModel,
  LifecycleState,
  LifecycleTransition,
  ObjectLifecycle,
} from "./lifecycleTypes.js";

const INITIAL_STATE_ID = "initial";

export function parseLifecycleXml(xml: string): LifecycleModel {
  const root = parseXmlRoot(xml, "olc:definitions");
  const modelElements = getChildElements(root, "olc:model");
  const lifecycles = new Map<string, ObjectLifecycle>();

  for (const modelElement of modelElements) {
    const lifecycle = parseLifecycleModel(modelElement);

    if (lifecycles.has(lifecycle.classId)) {
      throw new Error(
        `Duplicate lifecycle model for class ${lifecycle.classId}`
      );
    }

    lifecycles.set(lifecycle.classId, lifecycle);
  }

  return { lifecycles };
}

function parseLifecycleModel(
  modelElement: Record<string, unknown>
): ObjectLifecycle {
  const className = getRequiredAttribute(
    modelElement,
    "name",
    "Lifecycle model"
  );
  const initialStates = getChildElements(modelElement, "olc:initialState");

  if (initialStates.length !== 1) {
    throw new Error(
      `Lifecycle ${className} must have exactly one initial state, found ${initialStates.length}`
    );
  }

  const initialStateXmlId = getRequiredAttribute(
    initialStates[0],
    "id",
    `Initial state of lifecycle ${className}`
  );
  const statesByXmlId = new Map<string, string>([
    [initialStateXmlId, INITIAL_STATE_ID],
  ]);
  const semanticStateIds = new Set<string>([INITIAL_STATE_ID]);
  const states: LifecycleState[] = [
    {
      id: INITIAL_STATE_ID,
      xmlId: initialStateXmlId,
      name: INITIAL_STATE_ID,
      attributes: [],
      isInitial: true,
    },
  ];

  for (const stateElement of getChildElements(modelElement, "olc:state")) {
    const xmlId = getRequiredAttribute(
      stateElement,
      "id",
      `State of lifecycle ${className}`
    );
    const rawName = getRequiredAttribute(
      stateElement,
      "name",
      `State ${xmlId} of lifecycle ${className}`
    );
    const stateName = parseStateName(rawName);

    if (semanticStateIds.has(stateName)) {
      throw new Error(
        `Duplicate semantic state ${stateName} in lifecycle ${className}`
      );
    }

    semanticStateIds.add(stateName);
    statesByXmlId.set(xmlId, stateName);
    states.push({
      id: stateName,
      xmlId,
      name: stateName,
      attributes: parseStateAttributes(rawName),
    });
  }

  const transitions = getChildElements(modelElement, "olc:transition").map(
    (transitionElement) =>
      parseLifecycleTransition(transitionElement, className, statesByXmlId)
  );

  return {
    classId: className,
    className,
    states,
    initialStateId: INITIAL_STATE_ID,
    transitions,
  };
}

function parseLifecycleTransition(
  transitionElement: Record<string, unknown>,
  className: string,
  statesByXmlId: Map<string, string>
): LifecycleTransition {
  const id = getRequiredAttribute(
    transitionElement,
    "id",
    `Transition of lifecycle ${className}`
  );
  const sourceXmlId = getRequiredAttribute(
    transitionElement,
    "source",
    `Transition ${id} of lifecycle ${className}`
  );
  const targetXmlId = getRequiredAttribute(
    transitionElement,
    "target",
    `Transition ${id} of lifecycle ${className}`
  );
  const source = statesByXmlId.get(sourceXmlId);
  const target = statesByXmlId.get(targetXmlId);
  const rawName = normalizeLabel(
    getOptionalAttribute(transitionElement, "name")
  );
  const actor = parseLocalActor(rawName);
  const triggerName = actor === undefined ? rawName : undefined;

  if (!source) {
    throw new Error(
      `Transition ${id} of lifecycle ${className} source ${sourceXmlId} does not reference a known state`
    );
  }

  if (!target) {
    throw new Error(
      `Transition ${id} of lifecycle ${className} target ${targetXmlId} does not reference a known state`
    );
  }

  if (actor !== undefined && target === INITIAL_STATE_ID) {
    throw new Error(
      `Local transition ${id} of lifecycle ${className} may not target the initial state`
    );
  }

  return {
    id,
    source,
    target,
    sourceXmlId,
    targetXmlId,
    actor,
    triggerName,
    rawName,
  };
}

function parseStateName(rawName: string): string {
  const firstLine = rawName.split(/\r?\n/)[0];
  const stateName = normalizeRequiredLabel(firstLine);

  if (!stateName) {
    throw new Error(`Could not parse semantic state name from ${rawName}`);
  }

  return stateName;
}

function parseStateAttributes(rawName: string): string[] {
  const match = /\{([^}]*)\}/s.exec(rawName);

  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map((attribute) => normalizeRequiredLabel(attribute))
    .filter((attribute) => attribute.length > 0);
}

function parseLocalActor(rawName: string | undefined): string | undefined {
  if (rawName === undefined) {
    return undefined;
  }

  const match = /^\[([^\]]+)\]$/.exec(rawName);

  if (!match) {
    return undefined;
  }

  const actor = normalizeRequiredLabel(match[1]);

  if (!actor) {
    throw new Error(`Local transition actor in ${rawName} must be non-empty`);
  }

  return actor;
}

function normalizeLabel(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeRequiredLabel(value);
}

function normalizeRequiredLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
