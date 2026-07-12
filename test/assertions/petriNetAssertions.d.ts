import { ModdlePlace, ModdleTransition } from "pnml-moddle-converter";
import { PetriNetBuilder } from "../../src/shared/targets/petriNet/petriNetBuilder";
export type Matcher = string | RegExp;
export declare enum Role {
    A = "RoleA",
    B = "RoleB",
    C = "RoleC"
}
export declare enum Class {
    A = "ClassA",
    B = "ClassB",
    C = "ClassC"
}
export declare function expectIsNonEmpty(petriNet: PetriNetBuilder): void;
export declare function matches(matcher: Matcher, value: string): boolean;
export declare function getElementById(petriNet: PetriNetBuilder, id: string): ModdlePlace | ModdleTransition | undefined;
export declare function requireElementById(petriNet: PetriNetBuilder, id: string): ModdlePlace | ModdleTransition;
export declare function requirePlace(petriNet: PetriNetBuilder, matcher: Matcher): ModdlePlace;
export declare function expectNoPlace(petriNet: PetriNetBuilder, matcher: Matcher): void;
export declare function getPlaces(petriNet: PetriNetBuilder, matcher: Matcher): ModdlePlace[];
export declare function requireTransition(petriNet: PetriNetBuilder, matcher: Matcher): ModdleTransition;
export declare function expectNoTransition(petriNet: PetriNetBuilder, matcher: Matcher): void;
export declare function getTransitions(petriNet: PetriNetBuilder, matcher: Matcher): ModdleTransition[];
type InteractionTransitionKind = "communication" | "synchronized" | "combined";
type InteractionTransitionDirection = "send" | "receive";
export declare function requireInteractionTransition(petriNet: PetriNetBuilder, args: {
    direction: InteractionTransitionDirection;
    kind: InteractionTransitionKind;
    fragments?: string[];
    role?: Role;
}): ModdleTransition;
export declare function getPreset(petriNet: PetriNetBuilder, element: ModdlePlace | ModdleTransition): (ModdlePlace | ModdleTransition)[];
export declare function getPostset(petriNet: PetriNetBuilder, element: ModdlePlace | ModdleTransition): (ModdlePlace | ModdleTransition)[];
export declare function requireArc(petriNet: PetriNetBuilder, sourceElement: ModdlePlace | ModdleTransition, targetElement: ModdlePlace | ModdleTransition): void;
export declare function expectNoArc(petriNet: PetriNetBuilder, sourceElement: ModdlePlace | ModdleTransition, targetElement: ModdlePlace | ModdleTransition): void;
export declare function requireReadArc(petriNet: PetriNetBuilder, place: ModdlePlace, transition: ModdleTransition): void;
export declare function expectNoReadArc(petriNet: PetriNetBuilder, place: ModdlePlace, transition: ModdleTransition): void;
export declare function expectIsLocalTransition(petriNet: PetriNetBuilder, transition: ModdleTransition, role?: string, className?: string): void;
export declare function expectIsReceiveTransition(petriNet: PetriNetBuilder, transition: ModdleTransition, role?: string): void;
export declare function expectIsSendTransition(petriNet: PetriNetBuilder, transition: ModdleTransition, role?: string): void;
export declare function expectIsLocalCreatingTransition(petriNet: PetriNetBuilder, transition: ModdleTransition, role?: string, className?: string): void;
export declare function requireLocalTransition(petriNet: PetriNetBuilder, role: Role, className: Class, sourceState?: string, targetState?: string): ModdleTransition;
export declare function requireLocalCreationTransition(petriNet: PetriNetBuilder, role: Role, className: Class, targetState?: string): ModdleTransition;
export declare function compositeOneToOneCreationTransitionId(role: string, entries: Array<{
    className: string;
    targetState: string;
}>): string;
export declare function requireCompositeOneToOneCreationTransition(petriNet: PetriNetBuilder, role: string, entries: Array<{
    className: string;
    targetState: string;
}>): ModdleTransition;
export declare function expectIsCompositeOneToOneCreationTransition(petriNet: PetriNetBuilder, transition: ModdleTransition, role: string, entries: Array<{
    className: string;
    targetState: string;
}>): void;
export declare function requireExistencePlace(petriNet: PetriNetBuilder, role: string, className: string): ModdlePlace;
export declare function requireStatePlace(petriNet: PetriNetBuilder, role: string, className: string, stateName: string): ModdlePlace;
export declare function requireVirtualInitialStatePlace(petriNet: PetriNetBuilder, role: string, className: string): ModdlePlace;
export declare function requirePostsetIncludes(petriNet: PetriNetBuilder, transition: ModdleTransition, place: ModdlePlace): void;
export declare function expectPostsetDoesNotInclude(petriNet: PetriNetBuilder, transition: ModdleTransition, place: ModdlePlace): void;
export declare function requirePresetIncludes(petriNet: PetriNetBuilder, transition: ModdleTransition, place: ModdlePlace): void;
export declare function expectPresetDoesNotInclude(petriNet: PetriNetBuilder, transition: ModdleTransition, place: ModdlePlace): void;
export declare function expectWellFormedPetriNet(petriNet: PetriNetBuilder): void;
export declare function expectLocalTransitionsStayWithinRole(petriNet: PetriNetBuilder): void;
export declare function requireGatewayBranchTransition(petriNet: PetriNetBuilder, fragments: string[]): ModdleTransition;
export declare function requireBranchGuardReadArc(petriNet: PetriNetBuilder, transition: ModdleTransition, role: string, className: string, stateName: string): void;
export declare function expectNoBranchGuardReadArc(petriNet: PetriNetBuilder, transition: ModdleTransition, role: string, className: string, stateName: string): void;
export declare function expectControlFlowCycleThroughTransition(petriNet: PetriNetBuilder, transition: ModdleTransition): void;
export declare function expectControlFlowPath(petriNet: PetriNetBuilder, sourceTransition: ModdleTransition, targetTransition: ModdleTransition): void;
export declare function expectNoControlFlowPath(petriNet: PetriNetBuilder, sourceTransition: ModdleTransition, targetTransition: ModdleTransition): void;
export {};
