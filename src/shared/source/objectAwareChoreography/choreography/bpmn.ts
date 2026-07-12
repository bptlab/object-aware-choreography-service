import { BpmnModdle } from "bpmn-moddle";
import type {
  BaseElement,
  Choreography,
  Definitions,
  SequenceFlow,
} from "bpmn-moddle";

export function isBpmnType<T extends BaseElement>(
  element: BaseElement | undefined,
  ...types: string[]
): element is T {
  return element !== undefined && types.includes(element.$type);
}

export async function parseSingleChoreography(
  xml: string
): Promise<Choreography> {
  const choreographyModdle = new BpmnModdle();
  const result = await choreographyModdle.fromXML(xml);
  const definitions = result.rootElement as Definitions;

  const choreographies = definitions.rootElements.filter(
    (element: BaseElement) => element.$type === "bpmn:Choreography"
  ) as Choreography[];

  if (choreographies.length === 0) {
    throw new Error("Could not find choreography definition");
  }

  if (choreographies.length > 1) {
    throw new Error(
      "Multiple choreography definitions found, expected only one"
    );
  }

  return choreographies[0];
}

export function compareById(left: BaseElement, right: BaseElement): number {
  return left.id.localeCompare(right.id);
}

export function compareFlowById(
  left: SequenceFlow,
  right: SequenceFlow
): number {
  return left.id.localeCompare(right.id);
}
