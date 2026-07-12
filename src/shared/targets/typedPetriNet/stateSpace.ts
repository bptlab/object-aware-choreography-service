import type {
  IdentifierTypeId,
  TypedArc,
  TypedIdentifierType,
  TypedPetriNet,
  TypedPlace,
  TypedPlaceId,
  TypedToken,
  TypedTransition,
  TypedTransitionId,
  TypedVariable,
  TypedVariableId,
} from "./typedPetriNetTypes.js";

export type TypedIdentifierDomains = Record<IdentifierTypeId, string[]>;
export type TypedMarking = Map<TypedPlaceId, TypedToken[]>;
export type FixedParticipantsByCaseAndRole = Record<
  string,
  Record<string, string>
>;

export interface TypedTransitionOccurrence {
  transitionId: TypedTransitionId;
  binding: Record<TypedVariableId, string>;
}

export interface TypedStateSpaceNode {
  id: number;
  marking: TypedMarking;
  markingKey: string;
  predecessorId?: number;
  firedOccurrence?: TypedTransitionOccurrence;
}

export interface TypedStateSpaceEdge {
  sourceId: number;
  targetId: number;
  occurrence: TypedTransitionOccurrence;
}

export interface TypedStateSpace {
  nodes: TypedStateSpaceNode[];
  edges: TypedStateSpaceEdge[];
  nodeByMarkingKey: Map<string, TypedStateSpaceNode>;
  truncated: boolean;
  truncationReasons: Array<"maxMarkings" | "maxDepth">;
  limits: {
    maxMarkings: number;
    maxDepth: number;
  };
}

interface TypedPetriNetIndex {
  placesById: Map<TypedPlaceId, TypedPlace>;
  transitionsById: Map<TypedTransitionId, TypedTransition>;
  variablesById: Map<TypedVariableId, TypedVariable>;
  identifierTypesById: Map<IdentifierTypeId, TypedIdentifierType>;
  inputArcsByTransitionId: Map<TypedTransitionId, TypedArc[]>;
  outputArcsByTransitionId: Map<TypedTransitionId, TypedArc[]>;
  inhibitorArcsByTransitionId: Map<TypedTransitionId, TypedArc[]>;
}

interface StartRoleAssignmentRestriction {
  caseVariableId: TypedVariableId;
  caseTypeId: IdentifierTypeId;
  roles: Array<{
    roleId: string;
    roleTypeId: IdentifierTypeId;
    roleVariableId: TypedVariableId;
  }>;
}

interface PartialOccurrence {
  binding: Record<TypedVariableId, string>;
  consumedTokenKeysByPlaceId: Map<TypedPlaceId, Set<string>>;
}

export function createInitialTypedMarking(net: TypedPetriNet): TypedMarking {
  return normalizeTypedMarking(
    new Map(
      net.places
        .filter((place) => place.initialTokens.length > 0)
        .map((place) => [place.id, place.initialTokens]),
    ),
  );
}

export function generateTypedStateSpace(args: {
  net: TypedPetriNet;
  domains: TypedIdentifierDomains;
  initialMarking?: TypedMarking;
  maxMarkings?: number;
  maxDepth?: number;
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
}): TypedStateSpace {
  const {
    net,
    domains,
    initialMarking = createInitialTypedMarking(net),
    maxMarkings = 100000,
    maxDepth = Number.POSITIVE_INFINITY,
  } = args;
  const initialNode: TypedStateSpaceNode = {
    id: 0,
    marking: normalizeTypedMarking(initialMarking),
    markingKey: typedMarkingKey(initialMarking),
  };
  const depthsByNodeId = new Map([[initialNode.id, 0]]);
  const stateSpace: TypedStateSpace = {
    nodes: [initialNode],
    edges: [],
    nodeByMarkingKey: new Map([[initialNode.markingKey, initialNode]]),
    truncated: false,
    truncationReasons: [],
    limits: {
      maxMarkings,
      maxDepth,
    },
  };
  const queue: TypedStateSpaceNode[] = [initialNode];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const currentDepth = depthsByNodeId.get(current.id) ?? 0;
    if (currentDepth >= maxDepth) {
      const enabledOccurrences = getEnabledTypedTransitionOccurrences({
        net,
        marking: current.marking,
        domains,
        fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
      });

      if (enabledOccurrences.length > 0) {
        markTruncated(stateSpace, "maxDepth");
      }

      continue;
    }

    for (const occurrence of getEnabledTypedTransitionOccurrences({
      net,
      marking: current.marking,
      domains,
      fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
    })) {
      const nextMarking = fireTypedTransitionOccurrence({
        net,
        marking: current.marking,
        occurrence,
      });
      const nextMarkingKey = typedMarkingKey(nextMarking);
      let targetNode = stateSpace.nodeByMarkingKey.get(nextMarkingKey);

      if (!targetNode) {
        if (stateSpace.nodes.length >= maxMarkings) {
          markTruncated(stateSpace, "maxMarkings");
          continue;
        }

        targetNode = {
          id: stateSpace.nodes.length,
          marking: nextMarking,
          markingKey: nextMarkingKey,
          predecessorId: current.id,
          firedOccurrence: occurrence,
        };
        stateSpace.nodes.push(targetNode);
        stateSpace.nodeByMarkingKey.set(nextMarkingKey, targetNode);
        depthsByNodeId.set(targetNode.id, currentDepth + 1);
        queue.push(targetNode);
      }

      stateSpace.edges.push({
        sourceId: current.id,
        targetId: targetNode.id,
        occurrence,
      });
    }
  }

  return stateSpace;
}

function markTruncated(
  stateSpace: TypedStateSpace,
  reason: "maxMarkings" | "maxDepth",
): void {
  stateSpace.truncated = true;

  if (!stateSpace.truncationReasons.includes(reason)) {
    stateSpace.truncationReasons.push(reason);
    stateSpace.truncationReasons.sort();
  }
}

export function getEnabledTypedTransitionOccurrences(args: {
  net: TypedPetriNet;
  marking: TypedMarking;
  domains: TypedIdentifierDomains;
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
}): TypedTransitionOccurrence[] {
  const index = indexTypedPetriNet(args.net);
  validateFixedParticipantAssignments({
    index,
    domains: args.domains,
    fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
  });
  const normalizedMarking = normalizeTypedMarking(args.marking);
  const occurrences = args.net.transitions
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((transition) =>
      enabledOccurrencesForTransition({
        index,
        transition,
        marking: normalizedMarking,
        domains: args.domains,
        fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
      }),
    );

  return occurrences.sort(compareOccurrences);
}

export function fireTypedTransitionOccurrence(args: {
  net: TypedPetriNet;
  marking: TypedMarking;
  occurrence: TypedTransitionOccurrence;
}): TypedMarking {
  const index = indexTypedPetriNet(args.net);
  const transition = index.transitionsById.get(args.occurrence.transitionId);

  if (!transition) {
    throw new Error(`Unknown typed Petri-net transition ${args.occurrence.transitionId}`);
  }

  const marking = normalizeTypedMarking(args.marking);
  const next = cloneTypedMarking(marking);

  for (const arc of index.inputArcsByTransitionId.get(transition.id) ?? []) {
    const place = requiredPlace(index, arc.sourceId);
    const token = tokenFromInscription(arc, place, args.occurrence.binding);
    removeToken(next, place.id, token);
  }

  for (const arc of index.outputArcsByTransitionId.get(transition.id) ?? []) {
    const place = requiredPlace(index, arc.targetId);
    const token = tokenFromInscription(arc, place, args.occurrence.binding);
    addToken(next, place.id, token);
  }

  return normalizeTypedMarking(next);
}

export function typedMarkingKey(marking: TypedMarking): string {
  return [...normalizeTypedMarking(marking).entries()]
    .sort(([leftPlaceId], [rightPlaceId]) => leftPlaceId.localeCompare(rightPlaceId))
    .map(
      ([placeId, tokens]) =>
        `${placeId}[${tokens.map((token) => typedTokenKey(token)).join(";")}]`,
    )
    .join("|");
}

export function typedTokenKey(token: TypedToken): string {
  return token
    .map((value) => `${value.typeId}:${value.value}`)
    .join(",");
}

export function normalizeTypedMarking(marking: TypedMarking): TypedMarking {
  const normalized: TypedMarking = new Map();

  for (const [placeId, tokens] of marking.entries()) {
    const tokenByKey = new Map<string, TypedToken>();

    for (const token of tokens) {
      tokenByKey.set(
        typedTokenKey(token),
        token.map((value) => ({ ...value })),
      );
    }

    const normalizedTokens = [...tokenByKey.entries()]
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([, token]) => token);

    if (normalizedTokens.length > 0) {
      normalized.set(placeId, normalizedTokens);
    }
  }

  return normalized;
}

function enabledOccurrencesForTransition(args: {
  index: TypedPetriNetIndex;
  transition: TypedTransition;
  marking: TypedMarking;
  domains: TypedIdentifierDomains;
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
}): TypedTransitionOccurrence[] {
  const inputArcs = args.index.inputArcsByTransitionId.get(args.transition.id) ?? [];
  const partials = bindInputArcs({
    index: args.index,
    marking: args.marking,
    inputArcs,
  });
  const occurrences = partials.flatMap((partial) =>
    expandUnboundVariables({
      index: args.index,
      transition: args.transition,
      partial,
      marking: args.marking,
      domains: args.domains,
    }),
  );

  return occurrences
    .filter((occurrence) =>
      inhibitorsPermit({
        index: args.index,
        transitionId: args.transition.id,
        marking: args.marking,
        binding: occurrence.binding,
      }),
    )
    .filter((occurrence) =>
      fixedParticipantAssignmentPermits({
        index: args.index,
        transition: args.transition,
        binding: occurrence.binding,
        fixedParticipantsByCaseAndRole: args.fixedParticipantsByCaseAndRole,
      }),
    )
    .map((occurrence) => ({
      transitionId: args.transition.id,
      binding: occurrence.binding,
    }))
    .sort(compareOccurrences);
}

function bindInputArcs(args: {
  index: TypedPetriNetIndex;
  marking: TypedMarking;
  inputArcs: TypedArc[];
}): PartialOccurrence[] {
  let partials: PartialOccurrence[] = [
    { binding: {}, consumedTokenKeysByPlaceId: new Map() },
  ];

  for (const arc of args.inputArcs.slice().sort(compareArcs)) {
    const place = requiredPlace(args.index, arc.sourceId);
    const tokens = (args.marking.get(place.id) ?? []).slice().sort(compareTokens);
    const nextPartials: PartialOccurrence[] = [];

    for (const partial of partials) {
      for (const token of tokens) {
        const tokenKey = typedTokenKey(token);
        const consumedTokenKeys =
          partial.consumedTokenKeysByPlaceId.get(place.id) ?? new Set<string>();

        if (consumedTokenKeys.has(tokenKey)) {
          continue;
        }

        const binding = matchTokenToArc({
          arc,
          place,
          token,
          binding: partial.binding,
          allowNewBindings: true,
        });

        if (!binding) {
          continue;
        }

        const consumedTokenKeysByPlaceId = cloneConsumedTokenKeys(
          partial.consumedTokenKeysByPlaceId,
        );
        const nextConsumedTokenKeys =
          consumedTokenKeysByPlaceId.get(place.id) ?? new Set<string>();
        nextConsumedTokenKeys.add(tokenKey);
        consumedTokenKeysByPlaceId.set(place.id, nextConsumedTokenKeys);
        nextPartials.push({ binding, consumedTokenKeysByPlaceId });
      }
    }

    partials = nextPartials;
  }

  return partials;
}

function expandUnboundVariables(args: {
  index: TypedPetriNetIndex;
  transition: TypedTransition;
  partial: PartialOccurrence;
  marking: TypedMarking;
  domains: TypedIdentifierDomains;
}): Array<{ binding: Record<TypedVariableId, string> }> {
  const requiredVariableIds = requiredVariableIdsForTransition(
    args.index,
    args.transition,
  );
  const freshVariableIds = new Set(
    args.transition.freshVariables.map((freshVariable) => freshVariable.variableId),
  );
  const usedValuesByType = usedValuesByTypeId(args.marking);
  const variablesToBind = [...requiredVariableIds]
    .filter((variableId) => args.partial.binding[variableId] === undefined)
    .sort();
  const expanded: Array<{ binding: Record<TypedVariableId, string> }> = [];

  function visit(
    index: number,
    binding: Record<TypedVariableId, string>,
    selectedFreshValuesByType: Map<IdentifierTypeId, Set<string>>,
  ): void {
    if (index >= variablesToBind.length) {
      for (const freshVariable of args.transition.freshVariables) {
        const value = binding[freshVariable.variableId];

        if (value === undefined) {
          throw new Error(
            `Generated variable ${freshVariable.variableId} has no available value`,
          );
        }

        if (usedValuesByType.get(freshVariable.typeId)?.has(value)) {
          return;
        }
      }

      expanded.push({ binding });
      return;
    }

    const variableId = variablesToBind[index];
    const variable = requiredVariable(args.index, variableId);
    const domain = sortedDomain(args.domains, variable.typeId);
    const freshForType = selectedFreshValuesByType.get(variable.typeId) ?? new Set<string>();

    for (const value of domain) {
      if (freshVariableIds.has(variableId)) {
        if (usedValuesByType.get(variable.typeId)?.has(value)) {
          continue;
        }

        if (freshForType.has(value)) {
          continue;
        }
      }

      const nextFreshValuesByType = cloneFreshSelections(selectedFreshValuesByType);
      if (freshVariableIds.has(variableId)) {
        const nextFreshForType =
          nextFreshValuesByType.get(variable.typeId) ?? new Set<string>();
        nextFreshForType.add(value);
        nextFreshValuesByType.set(variable.typeId, nextFreshForType);
      }

      visit(
        index + 1,
        { ...binding, [variableId]: value },
        nextFreshValuesByType,
      );
    }
  }

  visit(0, { ...args.partial.binding }, new Map());
  return expanded;
}

function inhibitorsPermit(args: {
  index: TypedPetriNetIndex;
  transitionId: TypedTransitionId;
  marking: TypedMarking;
  binding: Record<TypedVariableId, string>;
}): boolean {
  for (const arc of args.index.inhibitorArcsByTransitionId.get(args.transitionId) ?? []) {
    const place = requiredPlace(args.index, arc.sourceId);

    for (const token of args.marking.get(place.id) ?? []) {
      if (
        matchTokenToArc({
          arc,
          place,
          token,
          binding: args.binding,
          allowNewBindings: false,
        })
      ) {
        return false;
      }
    }
  }

  return true;
}

function matchTokenToArc(args: {
  arc: TypedArc;
  place: TypedPlace;
  token: TypedToken;
  binding: Record<TypedVariableId, string>;
  allowNewBindings: boolean;
}): Record<TypedVariableId, string> | undefined {
  validateArcAgainstPlace(args.arc, args.place);

  const nextBinding = { ...args.binding };
  for (const [index, element] of args.arc.inscription.entries()) {
    const value = args.token[index]?.value;
    const existing = nextBinding[element.variableId];

    if (existing !== undefined && existing !== value) {
      return undefined;
    }

    if (existing === undefined) {
      if (!args.allowNewBindings) {
        return undefined;
      }

      nextBinding[element.variableId] = value;
    }
  }

  return nextBinding;
}

function tokenFromInscription(
  arc: TypedArc,
  place: TypedPlace,
  binding: Record<TypedVariableId, string>,
): TypedToken {
  validateArcAgainstPlace(arc, place);

  return arc.inscription.map((element) => {
    const value = binding[element.variableId];

    if (value === undefined) {
      throw new Error(
        `No binding for variable ${element.variableId} on arc ${arc.id}`,
      );
    }

    return { typeId: element.typeId, value };
  });
}

function requiredVariableIdsForTransition(
  index: TypedPetriNetIndex,
  transition: TypedTransition,
): Set<TypedVariableId> {
  const variableIds = new Set<TypedVariableId>(
    transition.freshVariables.map((freshVariable) => freshVariable.variableId),
  );

  for (const arc of [
    ...(index.outputArcsByTransitionId.get(transition.id) ?? []),
    ...(index.inhibitorArcsByTransitionId.get(transition.id) ?? []),
  ]) {
    for (const element of arc.inscription) {
      variableIds.add(element.variableId);
    }
  }

  return variableIds;
}

function indexTypedPetriNet(net: TypedPetriNet): TypedPetriNetIndex {
  const placesById = new Map(net.places.map((place) => [place.id, place]));
  const transitionsById = new Map(
    net.transitions.map((transition) => [transition.id, transition]),
  );
  const variablesById = new Map(
    net.variables.map((variable) => [variable.id, variable]),
  );
  const identifierTypesById = new Map(
    net.identifierTypes.map((type) => [type.id, type]),
  );
  const inputArcsByTransitionId = new Map<TypedTransitionId, TypedArc[]>(
    net.transitions.map((transition) => [transition.id, []]),
  );
  const outputArcsByTransitionId = new Map<TypedTransitionId, TypedArc[]>(
    net.transitions.map((transition) => [transition.id, []]),
  );
  const inhibitorArcsByTransitionId = new Map<TypedTransitionId, TypedArc[]>(
    net.transitions.map((transition) => [transition.id, []]),
  );

  for (const arc of net.arcs) {
    const sourcePlace = placesById.get(arc.sourceId);
    const targetPlace = placesById.get(arc.targetId);
    const sourceTransition = transitionsById.get(arc.sourceId);
    const targetTransition = transitionsById.get(arc.targetId);

    if (!sourcePlace && !targetPlace && !sourceTransition && !targetTransition) {
      throw new Error(`Typed arc ${arc.id} has unknown endpoints`);
    }

    if (sourcePlace && targetTransition) {
      validateArcAgainstPlace(arc, sourcePlace);
      if (arc.kind === "inhibitor") {
        inhibitorArcsByTransitionId.get(targetTransition.id)?.push(arc);
      } else {
        inputArcsByTransitionId.get(targetTransition.id)?.push(arc);
      }
      continue;
    }

    if (sourceTransition && targetPlace && arc.kind === "ordinary") {
      validateArcAgainstPlace(arc, targetPlace);
      outputArcsByTransitionId.get(sourceTransition.id)?.push(arc);
      continue;
    }

    throw new Error(
      `Typed arc ${arc.id} has unsupported or unknown endpoint direction`,
    );
  }

  for (const arcLists of [
    inputArcsByTransitionId,
    outputArcsByTransitionId,
    inhibitorArcsByTransitionId,
  ]) {
    for (const arcs of arcLists.values()) {
      arcs.sort(compareArcs);
    }
  }

  for (const variable of net.variables) {
    if (!net.identifierTypes.some((type) => type.id === variable.typeId)) {
      throw new Error(
        `Typed variable ${variable.id} references unknown type ${variable.typeId}`,
      );
    }
  }

  return {
    placesById,
    transitionsById,
    variablesById,
    identifierTypesById,
    inputArcsByTransitionId,
    outputArcsByTransitionId,
    inhibitorArcsByTransitionId,
  };
}

function validateFixedParticipantAssignments(args: {
  index: TypedPetriNetIndex;
  domains: TypedIdentifierDomains;
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
}): void {
  const fixedParticipantsByCaseAndRole = args.fixedParticipantsByCaseAndRole;

  if (!fixedParticipantsByCaseAndRole) {
    return;
  }

  const fixedEntries = Object.entries(fixedParticipantsByCaseAndRole);

  if (fixedEntries.length === 0) {
    return;
  }

  const restrictions = [...args.index.transitionsById.values()]
    .map((transition) => startRoleAssignmentRestriction(args.index, transition))
    .filter((restriction) => restriction !== undefined);

  if (restrictions.length === 0) {
    throw new Error(
      "Fixed participant assignments were provided, but no start transitions with role-case participation outputs were found",
    );
  }

  const rolesById = new Map(
    restrictions.flatMap((restriction) =>
      restriction.roles.map((role) => [role.roleId, role] as const),
    ),
  );
  const caseTypeIds = [...new Set(restrictions.map((restriction) => restriction.caseTypeId))];

  for (const [caseId, assignments] of fixedEntries) {
    if (
      !caseTypeIds.some(
        (caseTypeId) => sortedDomain(args.domains, caseTypeId).includes(caseId),
      )
    ) {
      throw new Error(
        `Fixed participant assignment references case "${caseId}", which is not in the finite case domain`,
      );
    }

    for (const role of rolesById.values()) {
      if (assignments[role.roleId] === undefined) {
        throw new Error(
          `Fixed participant assignment for case "${caseId}" is missing required role "${role.roleId}"`,
        );
      }
    }

    for (const [roleId, participantId] of Object.entries(assignments)) {
      const role = rolesById.get(roleId);

      if (!role) {
        throw new Error(
          `Fixed participant assignment for case "${caseId}" references unknown role "${roleId}"`,
        );
      }

      if (!sortedDomain(args.domains, role.roleTypeId).includes(participantId)) {
        throw new Error(
          `Fixed participant assignment for case "${caseId}" role "${roleId}" uses participant "${participantId}", which is not in the finite domain for role "${roleId}"`,
        );
      }
    }
  }
}

function fixedParticipantAssignmentPermits(args: {
  index: TypedPetriNetIndex;
  transition: TypedTransition;
  binding: Record<TypedVariableId, string>;
  fixedParticipantsByCaseAndRole?: FixedParticipantsByCaseAndRole;
}): boolean {
  const fixedParticipantsByCaseAndRole = args.fixedParticipantsByCaseAndRole;

  if (!fixedParticipantsByCaseAndRole) {
    return true;
  }

  const restriction = startRoleAssignmentRestriction(args.index, args.transition);

  if (!restriction) {
    return true;
  }

  const caseId = args.binding[restriction.caseVariableId];
  const assignments = fixedParticipantsByCaseAndRole[caseId];

  if (!assignments) {
    return true;
  }

  return restriction.roles.every(
    (role) => args.binding[role.roleVariableId] === assignments[role.roleId],
  );
}

function startRoleAssignmentRestriction(
  index: TypedPetriNetIndex,
  transition: TypedTransition,
): StartRoleAssignmentRestriction | undefined {
  if (transition.freshVariables.length !== 1) {
    return undefined;
  }

  const [freshVariable] = transition.freshVariables;
  const outputArcs = index.outputArcsByTransitionId.get(transition.id) ?? [];
  const roleAssignments = outputArcs
    .filter((arc) => arc.kind === "ordinary" && arc.inscription.length === 2)
    .filter((arc) => arc.inscription[0]?.variableId === freshVariable.variableId)
    .map((arc) => {
      const roleElement = arc.inscription[1];
      const roleType = index.identifierTypesById.get(roleElement.typeId);

      if (!roleType || !roleElement.variableId.startsWith("role_")) {
        return undefined;
      }

      return {
        roleId: roleType.alias,
        roleTypeId: roleElement.typeId,
        roleVariableId: roleElement.variableId,
      };
    })
    .filter((role) => role !== undefined);

  if (roleAssignments.length === 0) {
    return undefined;
  }

  return {
    caseVariableId: freshVariable.variableId,
    caseTypeId: freshVariable.typeId,
    roles: [...new Map(roleAssignments.map((role) => [role.roleId, role])).values()]
      .sort((left, right) => left.roleId.localeCompare(right.roleId)),
  };
}

function validateArcAgainstPlace(arc: TypedArc, place: TypedPlace): void {
  if (arc.inscription.length !== place.tupleType.length) {
    throw new Error(
      `Typed arc ${arc.id} inscription arity ${arc.inscription.length} does not match place ${place.id} tuple arity ${place.tupleType.length}`,
    );
  }

  arc.inscription.forEach((element, index) => {
    if (element.typeId !== place.tupleType[index]) {
      throw new Error(
        `Typed arc ${arc.id} inscription type ${element.typeId} at index ${index} does not match place ${place.id} tuple type ${place.tupleType[index]}`,
      );
    }
  });
}

function sortedDomain(
  domains: TypedIdentifierDomains,
  typeId: IdentifierTypeId,
): string[] {
  const domain = domains[typeId];

  if (!domain) {
    throw new Error(`Missing finite domain for generated variable type ${typeId}`);
  }

  if (domain.length === 0) {
    throw new Error(`Generated variable type ${typeId} has no available value`);
  }

  return [...new Set(domain)].sort();
}

function usedValuesByTypeId(marking: TypedMarking): Map<IdentifierTypeId, Set<string>> {
  const usedValues = new Map<IdentifierTypeId, Set<string>>();

  for (const tokens of marking.values()) {
    for (const token of tokens) {
      for (const value of token) {
        const values = usedValues.get(value.typeId) ?? new Set<string>();
        values.add(value.value);
        usedValues.set(value.typeId, values);
      }
    }
  }

  return usedValues;
}

function cloneTypedMarking(marking: TypedMarking): TypedMarking {
  return new Map(
    [...marking.entries()].map(([placeId, tokens]) => [
      placeId,
      tokens.map((token) => token.map((value) => ({ ...value }))),
    ]),
  );
}

function addToken(marking: TypedMarking, placeId: TypedPlaceId, token: TypedToken): void {
  marking.set(placeId, [...(marking.get(placeId) ?? []), token]);
}

function removeToken(
  marking: TypedMarking,
  placeId: TypedPlaceId,
  token: TypedToken,
): void {
  const tokenKeyToRemove = typedTokenKey(token);
  const remaining = (marking.get(placeId) ?? []).filter(
    (candidate) => typedTokenKey(candidate) !== tokenKeyToRemove,
  );

  if (remaining.length === marking.get(placeId)?.length) {
    throw new Error(`Cannot consume missing token ${tokenKeyToRemove} from ${placeId}`);
  }

  if (remaining.length === 0) {
    marking.delete(placeId);
    return;
  }

  marking.set(placeId, remaining);
}

function requiredPlace(index: TypedPetriNetIndex, placeId: string): TypedPlace {
  const place = index.placesById.get(placeId);

  if (!place) {
    throw new Error(`Unknown typed Petri-net place ${placeId}`);
  }

  return place;
}

function requiredVariable(
  index: TypedPetriNetIndex,
  variableId: TypedVariableId,
): TypedVariable {
  const variable = index.variablesById.get(variableId);

  if (!variable) {
    throw new Error(`Unknown typed Petri-net variable ${variableId}`);
  }

  return variable;
}

function compareArcs(left: TypedArc, right: TypedArc): number {
  return (
    left.id.localeCompare(right.id) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.targetId.localeCompare(right.targetId)
  );
}

function compareTokens(left: TypedToken, right: TypedToken): number {
  return typedTokenKey(left).localeCompare(typedTokenKey(right));
}

function compareOccurrences(
  left: TypedTransitionOccurrence,
  right: TypedTransitionOccurrence,
): number {
  return (
    left.transitionId.localeCompare(right.transitionId) ||
    occurrenceBindingKey(left).localeCompare(occurrenceBindingKey(right))
  );
}

function occurrenceBindingKey(occurrence: TypedTransitionOccurrence): string {
  return Object.entries(occurrence.binding)
    .sort(([leftVariableId], [rightVariableId]) =>
      leftVariableId.localeCompare(rightVariableId),
    )
    .map(([variableId, value]) => `${variableId}:${value}`)
    .join(",");
}

function cloneConsumedTokenKeys(
  consumedTokenKeysByPlaceId: Map<TypedPlaceId, Set<string>>,
): Map<TypedPlaceId, Set<string>> {
  return new Map(
    [...consumedTokenKeysByPlaceId.entries()].map(([placeId, tokenKeys]) => [
      placeId,
      new Set(tokenKeys),
    ]),
  );
}

function cloneFreshSelections(
  selectedFreshValuesByType: Map<IdentifierTypeId, Set<string>>,
): Map<IdentifierTypeId, Set<string>> {
  return new Map(
    [...selectedFreshValuesByType.entries()].map(([typeId, values]) => [
      typeId,
      new Set(values),
    ]),
  );
}
