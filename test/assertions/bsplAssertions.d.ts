import type { SendTrace } from "../../src/shared/mappings/objectAwareChoreographyToBspl/behaviorComparison/index.js";
import type { BsplMessageParameter, BsplMessageSchema, BsplProtocol, BsplProtocolParameter } from "../../src/shared/targets/bspl/bsplTypes.js";
import type { ControlFlowConstraint, ControlFlowConstraintDiscoveryResult } from "../../src/shared/mappings/objectAwareChoreographyToBspl/controlFlowConstraints/index.js";
type DiscoveryResult = ControlFlowConstraintDiscoveryResult;
type DiscoveredConstraint = ControlFlowConstraint;
type PrecedenceConstraint = Extract<DiscoveredConstraint, {
    kind: "precedence";
}>;
type DisjunctivePrecedenceConstraint = Extract<DiscoveredConstraint, {
    kind: "disjunctivePrecedence";
}>;
type ExclusionConstraint = Extract<DiscoveredConstraint, {
    kind: "exclusion";
}>;
type GuardInformationConstraint = Extract<DiscoveredConstraint, {
    kind: "guardInformation";
}>;
export type Matcher = string | RegExp;
type MessageQuery = {
    name?: Matcher;
    sender?: Matcher;
    receiver?: Matcher;
    parameters?: BsplMessageParameter[];
};
type ExpectedPublicParameter = {
    name: string;
    adornment?: "out";
    key?: boolean;
};
export declare function requireProtocolName(protocol: BsplProtocol): string;
export declare function requireRole(protocol: BsplProtocol, role: Matcher): string;
export declare function expectRolesExactly(protocol: BsplProtocol, expected: string[]): void;
export declare function requirePublicParameter(protocol: BsplProtocol, parameterName: Matcher): BsplProtocolParameter;
export declare function requirePrivateParameter(protocol: BsplProtocol, parameterName: Matcher): BsplProtocolParameter;
export declare function requireParameter(protocol: BsplProtocol, parameterName: Matcher): BsplProtocolParameter;
export declare function expectNoParameter(protocol: BsplProtocol, parameterName: Matcher): void;
export declare function requireMessages(protocol: BsplProtocol, query: MessageQuery): BsplMessageSchema[];
export declare function requireMessage(protocol: BsplProtocol, query: MessageQuery): BsplMessageSchema;
export declare function requireOnlyMessage(protocol: BsplProtocol, query: MessageQuery): BsplMessageSchema;
export declare function expectNoMessage(protocol: BsplProtocol, query: MessageQuery): void;
export declare function expectMessageHasParameter(protocol: BsplProtocol, query: MessageQuery, parameter: BsplMessageParameter): void;
export declare function requireMessageParameter(message: BsplMessageSchema, parameter: BsplMessageParameter): BsplMessageParameter;
export declare function expectMessageParameterAbsent(message: BsplMessageSchema, parameter: BsplMessageParameter): void;
export declare function expectMessageDoesNotHaveParameter(protocol: BsplProtocol, query: MessageQuery, parameter: BsplMessageParameter): void;
export declare function expectOnlyPublicParameters(protocol: BsplProtocol, expected: ExpectedPublicParameter[]): void;
export declare function expectAllUsedParametersDeclared(protocol: BsplProtocol): void;
export declare function expectEveryRoleUsedInMessage(protocol: BsplProtocol): void;
export declare function expectProtocolDoesNotContainRawBpmnIds(protocol: BsplProtocol): void;
export declare function expectNoUnqualifiedAttributeParameters(protocol: BsplProtocol, attributeNames: string[]): void;
export declare function expectParameterNamingScheme(protocol: BsplProtocol): void;
export declare function expectCompletionParameterProducedByTerminalMessage(protocol: BsplProtocol, messageName: Matcher): void;
export declare function expectProtocolHasMessage(protocol: BsplProtocol, messageName: string): void;
export declare function expectProtocolHasParameter(protocol: BsplProtocol, parameterName: string): void;
export declare function hasMessageParameter(message: BsplMessageSchema, parameter: BsplMessageParameter): boolean;
export declare function expectWellFormedProtocol(protocol: BsplProtocol): void;
export declare function expectHasViolatingTrace(constraint: DiscoveredConstraint): void;
export declare function requirePrecedence(result: DiscoveryResult, predecessor: string, constrained: string): PrecedenceConstraint;
export declare function expectNoPrecedence(result: DiscoveryResult, predecessor: string, constrained: string): void;
export declare function requireDisjunctivePrecedence(result: DiscoveryResult, alternatives: string[], constrained: string): DisjunctivePrecedenceConstraint;
export declare function requireExclusion(result: DiscoveryResult, taskA: string, taskB: string): ExclusionConstraint;
export declare function expectNoExclusion(result: DiscoveryResult, taskA: string, taskB: string): void;
export declare function requireGuardInformation(result: DiscoveryResult, query: {
    guardedTask?: string;
    objectClass?: string;
    objectState?: string | RegExp;
}): GuardInformationConstraint;
export declare function createIndependentProtocol(tasks: string[]): BsplProtocol;
export declare function createPrecedenceConstraint(predecessor: string, constrained: string): ControlFlowConstraint;
export declare function createDisjunctivePrecedenceConstraint(alternatives: string[], constrained: string): ControlFlowConstraint;
export declare function createExclusionConstraint(taskA: string, taskB: string): ControlFlowConstraint;
export declare function createGuardInformationConstraint(guardedTask: string, args: {
    requiredIn: string[];
    requiredNil: string[];
}): ControlFlowConstraint;
export declare function expectNoTraceContainsBoth(traces: readonly SendTrace[], taskA: string, taskB: string): void;
export {};
