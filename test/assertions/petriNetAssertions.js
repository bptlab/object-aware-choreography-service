import assert from "node:assert/strict";
import { sanitizeIdPart } from "../../src/shared/ids/sanitization";
export var Role;
(function (Role) {
    Role["A"] = "RoleA";
    Role["B"] = "RoleB";
    Role["C"] = "RoleC";
})(Role || (Role = {}));
export var Class;
(function (Class) {
    Class["A"] = "ClassA";
    Class["B"] = "ClassB";
    Class["C"] = "ClassC";
})(Class || (Class = {}));
export function expectIsNonEmpty(petriNet) {
    assert.ok(petriNet.getPlaces().length > 0 || petriNet.getTransitions().length > 0, "Expected non-empty Petri net");
}
export function matches(matcher, value) {
    return typeof matcher === "string"
        ? value.includes(matcher)
        : matcher.test(value);
}
function matcherLabel(matcher) {
    return typeof matcher === "string" ? matcher : matcher.toString();
}
function parseStatePlaceId(id) {
    const match = id.match(/^p_state_([^_]+)_([^_]+)_(.+)$/);
    if (!match) {
        return undefined;
    }
    return {
        role: match[1],
        className: match[2],
        state: match[3],
    };
}
function parseExistencePlaceId(id) {
    const match = id.match(/^p_exists_([^_]+)_([^_]+)$/);
    if (!match) {
        return undefined;
    }
    return {
        role: match[1],
        className: match[2],
    };
}
function parseLocalTransitionId(id) {
    const match = id.match(/^t_local_([^_]+)_([^_]+)_([^_]+)_([^_]+)$/);
    if (!match) {
        return undefined;
    }
    return {
        role: match[1],
        className: match[2],
        sourceState: match[3],
        targetState: match[4],
    };
}
function isSequenceFlowPlace(element) {
    return element.id.startsWith("p_sf_");
}
function isTransmissionPlace(element) {
    return element.id.startsWith("p_trans_");
}
function isStatePlace(element) {
    return parseStatePlaceId(element.id) !== undefined;
}
function isExistencePlace(element) {
    return parseExistencePlaceId(element.id) !== undefined;
}
function requireExactlyOne(items, message) {
    assert.equal(items.length, 1, message);
    return items[0];
}
export function getElementById(petriNet, id) {
    return (petriNet.getPlaces().find((place) => place.id === id) ||
        petriNet.getTransitions().find((transition) => transition.id === id));
}
export function requireElementById(petriNet, id) {
    const element = getElementById(petriNet, id);
    assert.ok(element, `Expected to find Petri-net element with id: ${id}`);
    return element;
}
function getPlace(petriNet, matcher) {
    return petriNet
        .getPlaces()
        .find((place) => matches(matcher, place.id) || matches(matcher, place.name));
}
export function requirePlace(petriNet, matcher) {
    const place = getPlace(petriNet, matcher);
    assert.ok(place, `Expected to find Petri-net place matching: ${matcherLabel(matcher)}`);
    return place;
}
export function expectNoPlace(petriNet, matcher) {
    const place = getPlace(petriNet, matcher);
    assert.equal(place, undefined, `Expected no Petri-net place matching: ${matcherLabel(matcher)}`);
}
export function getPlaces(petriNet, matcher) {
    return petriNet
        .getPlaces()
        .filter((place) => matches(matcher, place.id) || matches(matcher, place.name));
}
function getTransition(petriNet, matcher) {
    return petriNet
        .getTransitions()
        .find((transition) => matches(matcher, transition.id) || matches(matcher, transition.name));
}
export function requireTransition(petriNet, matcher) {
    const transition = getTransition(petriNet, matcher);
    assert.ok(transition, `Expected to find Petri-net transition matching: ${matcherLabel(matcher)}`);
    return transition;
}
export function expectNoTransition(petriNet, matcher) {
    const transition = getTransition(petriNet, matcher);
    assert.equal(transition, undefined, `Expected no Petri-net transition matching: ${matcherLabel(matcher)}`);
}
export function getTransitions(petriNet, matcher) {
    return petriNet
        .getTransitions()
        .filter((transition) => matches(matcher, transition.id) || matches(matcher, transition.name));
}
export function requireInteractionTransition(petriNet, args) {
    const prefix = interactionTransitionPrefix(args.direction, args.kind);
    const transition = getTransitions(petriNet, new RegExp(`^${prefix}`)).find((candidate) => (args.fragments ?? []).every((fragment) => candidate.id.includes(sanitizeIdPart(fragment))));
    assert.ok(transition, `Expected ${args.kind} ${args.direction} transition containing ${args.fragments?.join(", ") ?? "<no fragments>"}; found transitions: ${getTransitions(petriNet, new RegExp(`^${prefix}`))
        .map((t) => t.id)
        .join(", ")}`);
    if (args.direction === "send") {
        expectIsSendTransition(petriNet, transition, args.role);
    }
    else {
        expectIsReceiveTransition(petriNet, transition, args.role);
    }
    return transition;
}
function interactionTransitionPrefix(direction, kind) {
    if (kind === "communication") {
        return direction === "send" ? "t_send_" : "t_recv_";
    }
    if (kind === "synchronized") {
        return direction === "send" ? "t_sync_send_" : "t_sync_recv_";
    }
    return direction === "send" ? "t_comb_send_" : "t_comb_recv_";
}
export function getPreset(petriNet, element) {
    return petriNet
        .getArcs()
        .filter((arc) => arc.targetId === element.id)
        .map((arc) => getElementById(petriNet, arc.sourceId))
        .filter((v) => !!v);
}
export function getPostset(petriNet, element) {
    return petriNet
        .getArcs()
        .filter((arc) => arc.sourceId === element.id)
        .map((arc) => getElementById(petriNet, arc.targetId))
        .filter((v) => !!v);
}
function hasArc(petriNet, sourceElement, targetElement) {
    return petriNet
        .getArcs()
        .some((arc) => arc.sourceId === sourceElement.id && arc.targetId === targetElement.id);
}
export function requireArc(petriNet, sourceElement, targetElement) {
    assert.ok(hasArc(petriNet, sourceElement, targetElement), `Expected arc from ${sourceElement.id} to ${targetElement.id}`);
}
export function expectNoArc(petriNet, sourceElement, targetElement) {
    assert.ok(!hasArc(petriNet, sourceElement, targetElement), `Expected no arc from ${sourceElement.id} to ${targetElement.id}`);
}
export function requireReadArc(petriNet, place, transition) {
    requireArc(petriNet, place, transition);
    requireArc(petriNet, transition, place);
}
export function expectNoReadArc(petriNet, place, transition) {
    expectNoArc(petriNet, place, transition);
    expectNoArc(petriNet, transition, place);
}
export function expectIsLocalTransition(petriNet, transition, role, className) {
    const transitionInfo = parseLocalTransitionId(transition.id);
    assert.ok(transitionInfo, `Expected local transition id, got: ${transition.id}`);
    if (role !== undefined) {
        assert.equal(transitionInfo.role, role, `Expected local transition role ${role}, got ${transitionInfo.role}`);
    }
    if (className !== undefined) {
        assert.equal(transitionInfo.className, className, `Expected local transition class ${className}, got ${transitionInfo.className}`);
    }
    const presetStatePlaces = getPreset(petriNet, transition).filter(isStatePlace);
    const postsetStatePlaces = getPostset(petriNet, transition).filter(isStatePlace);
    assert.ok(presetStatePlaces.length === 1, `Expected local transition ${transition.id} to consume from exactly one state place`);
    assert.ok(postsetStatePlaces.length === 1, `Expected local transition ${transition.id} to produce to exactly one state place`);
    assert.ok(postsetStatePlaces.some((place) => parseStatePlaceId(place.id)?.state !== "initial"), `Expected local transition ${transition.id} to produce to a non-initial state place`);
    const { role: adjacentRole, className: adjacentClass } = requireSingleRoleAndClassForStatePlaces([...presetStatePlaces, ...postsetStatePlaces], role, className);
    assert.equal(transitionInfo.role, adjacentRole, `Expected local transition role ${transitionInfo.role} to match adjacent state-place role ${adjacentRole}`);
    assert.equal(transitionInfo.className, adjacentClass, `Expected local transition class ${transitionInfo.className} to match adjacent state-place class ${adjacentClass}`);
}
export function expectIsReceiveTransition(petriNet, transition, role) {
    assert.ok(/^t_(recv|sync_recv|comb_recv)_/.test(transition.id), `Expected receive transition id, got: ${transition.id}`);
    const preset = getPreset(petriNet, transition);
    const postset = getPostset(petriNet, transition);
    assert.ok(postset.some(isSequenceFlowPlace), `Expected receive transition ${transition.id} to produce to a sequence-flow place`);
    assert.equal(preset.filter(isSequenceFlowPlace).length, 0, `Expected receive transition ${transition.id} not to consume from a sequence-flow place`);
    assert.ok(preset.some(isTransmissionPlace), `Expected receive transition ${transition.id} to consume from a transmission place`);
    assert.equal(postset.filter(isTransmissionPlace).length, 0, `Expected receive transition ${transition.id} not to produce to a transmission place`);
    requireSingleRoleForStatePlaces(getAdjacentStatePlaces(petriNet, transition), role);
}
export function expectIsSendTransition(petriNet, transition, role) {
    assert.ok(/^t_(send|sync_send|comb_send)_/.test(transition.id), `Expected send transition id, got: ${transition.id}`);
    const preset = getPreset(petriNet, transition);
    const postset = getPostset(petriNet, transition);
    assert.ok(preset.some(isSequenceFlowPlace), `Expected send transition ${transition.id} to consume from a sequence-flow place`);
    assert.equal(postset.filter(isSequenceFlowPlace).length, 0, `Expected send transition ${transition.id} not to produce to a sequence-flow place`);
    assert.equal(postset.filter(isTransmissionPlace).length, 1, `Expected send transition ${transition.id} to produce to exactly one transmission place`);
    assert.equal(preset.filter(isTransmissionPlace).length, 0, `Expected send transition ${transition.id} not to consume from a transmission place`);
    requireSingleRoleForStatePlaces(getAdjacentStatePlaces(petriNet, transition), role);
}
export function expectIsLocalCreatingTransition(petriNet, transition, role, className) {
    expectIsLocalTransition(petriNet, transition, role, className);
    const preset = getPreset(petriNet, transition);
    const postset = getPostset(petriNet, transition);
    const presetStatePlaces = preset.filter(isStatePlace);
    const postsetStatePlaces = postset.filter(isStatePlace);
    const postsetExistencePlaces = postset.filter(isExistencePlace);
    const initialPlace = requireExactlyOne(presetStatePlaces.filter((place) => parseStatePlaceId(place.id)?.state === "initial"), `Expected local creation transition ${transition.id} to consume from exactly one virtual initial state place`);
    const createdStatePlace = requireExactlyOne(postsetStatePlaces.filter((place) => parseStatePlaceId(place.id)?.state !== "initial"), `Expected local creation transition ${transition.id} to produce to exactly one non-initial state place`);
    assert.equal(presetStatePlaces.length, 1, `Expected local creation transition ${transition.id} to have only one state place in its preset`);
    const initialInfo = parseStatePlaceId(initialPlace.id);
    const createdStateInfo = parseStatePlaceId(createdStatePlace.id);
    assert.ok(initialInfo, `Expected initial place id to parse: ${initialPlace.id}`);
    assert.ok(createdStateInfo, `Expected created state place id to parse: ${createdStatePlace.id}`);
    const createdExistencePlace = requireExactlyOne(postsetExistencePlaces.filter((place) => {
        const info = parseExistencePlaceId(place.id);
        return (info?.role === initialInfo.role &&
            info.className === initialInfo.className);
    }), `Expected local creation transition ${transition.id} to produce exactly one existence-awareness place for the created object`);
    const createdExistenceInfo = parseExistencePlaceId(createdExistencePlace.id);
    assert.ok(createdExistenceInfo, `Expected created existence place id to parse: ${createdExistencePlace.id}`);
    for (const existencePlace of postsetExistencePlaces) {
        if (existencePlace.id === createdExistencePlace.id) {
            continue;
        }
        assert.ok(preset.some((element) => element.id === existencePlace.id), `Expected non-created existence-awareness place ${existencePlace.id} in postset of ${transition.id} to also occur in its preset as a read dependency`);
    }
    assert.equal(initialInfo.role, createdStateInfo.role, `Expected created state role to match initial state role for ${transition.id}`);
    assert.equal(initialInfo.role, createdExistenceInfo.role, `Expected created existence role to match initial state role for ${transition.id}`);
    assert.equal(initialInfo.className, createdStateInfo.className, `Expected created state class to match initial state class for ${transition.id}`);
    assert.equal(initialInfo.className, createdExistenceInfo.className, `Expected created existence class to match initial state class for ${transition.id}`);
    if (role !== undefined) {
        assert.equal(initialInfo.role, role, `Expected creation transition role ${role}, got ${initialInfo.role}`);
    }
    if (className !== undefined) {
        assert.equal(initialInfo.className, className, `Expected creation transition class ${className}, got ${initialInfo.className}`);
    }
}
function requireSingleRoleForStatePlaces(statePlaces, expectedRole) {
    if (statePlaces.length === 0) {
        return undefined;
    }
    const roles = new Set(statePlaces.map((place) => parseStatePlaceId(place.id)?.role));
    assert.equal(roles.size, 1, `Expected all state places to belong to one role, got: ${[...roles].join(", ")}`);
    const [actualRole] = [...roles];
    assert.ok(actualRole, "Expected state-place role to be defined");
    if (expectedRole !== undefined) {
        assert.equal(actualRole, expectedRole, `Expected all state places to belong to role ${expectedRole}, got ${actualRole}`);
    }
    return actualRole;
}
function requireSingleRoleAndClassForStatePlaces(statePlaces, expectedRole, expectedClass) {
    assert.ok(statePlaces.length > 0, "Expected at least one state place");
    const infos = statePlaces.map((place) => parseStatePlaceId(place.id));
    assert.ok(infos.every((info) => info !== undefined), "Expected all given places to be state places");
    const roles = new Set(infos.map((info) => info.role));
    const classNames = new Set(infos.map((info) => info.className));
    assert.equal(roles.size, 1, `Expected all state places to belong to one role, got: ${[...roles].join(", ")}`);
    assert.equal(classNames.size, 1, `Expected all state places to belong to one class, got: ${[
        ...classNames,
    ].join(", ")}`);
    const [actualRole] = [...roles];
    const [actualClass] = [...classNames];
    if (expectedRole !== undefined) {
        assert.equal(actualRole, expectedRole, `Expected state places to belong to role ${expectedRole}, got ${actualRole}`);
    }
    if (expectedClass !== undefined) {
        assert.equal(actualClass, expectedClass, `Expected state places to belong to class ${expectedClass}, got ${actualClass}`);
    }
    return { role: actualRole, className: actualClass };
}
export function requireLocalTransition(petriNet, role, className, sourceState, targetState) {
    const sanitizedSourceState = sourceState === undefined ? undefined : sanitizeIdPart(sourceState);
    const sanitizedTargetState = targetState === undefined ? undefined : sanitizeIdPart(targetState);
    const transition = requireTransition(petriNet, new RegExp(`^t_local_${sanitizeIdPart(role)}_${sanitizeIdPart(className)}_${sanitizedSourceState || ".*"}_${sanitizedTargetState || ".*"}`));
    expectIsLocalTransition(petriNet, transition, role, className);
    return transition;
}
export function requireLocalCreationTransition(petriNet, role, className, targetState) {
    const localCreationTransition = requireLocalTransition(petriNet, role, className, "initial", targetState);
    expectIsLocalCreatingTransition(petriNet, localCreationTransition, role, className);
    return localCreationTransition;
}
// --- Composite 1-to-1 creation transition helpers ---
export function compositeOneToOneCreationTransitionId(role, entries) {
    const serializedEntries = normalizedCompositeCreationEntries(entries)
        .map((entry) => joinTestIdParts(entry.className, entry.targetState))
        .join("__");
    return `t_create_1to1_${sanitizeIdPart(role)}_${serializedEntries}`;
}
function normalizedCompositeCreationEntries(entries) {
    return [...entries].sort((left, right) => {
        const leftKey = joinTestIdParts(left.className, left.targetState);
        const rightKey = joinTestIdParts(right.className, right.targetState);
        return leftKey.localeCompare(rightKey);
    });
}
export function requireCompositeOneToOneCreationTransition(petriNet, role, entries) {
    const compositeCreationTransition = requireTransition(petriNet, compositeOneToOneCreationTransitionId(role, entries));
    expectIsCompositeOneToOneCreationTransition(petriNet, compositeCreationTransition, role, entries);
    return compositeCreationTransition;
}
export function expectIsCompositeOneToOneCreationTransition(petriNet, transition, role, entries) {
    const normalizedEntries = normalizedCompositeCreationEntries(entries);
    assert.equal(transition.id, compositeOneToOneCreationTransitionId(role, normalizedEntries), `Expected composite 1-to-1 creation transition id for role ${role}`);
    const preset = getPreset(petriNet, transition);
    const postset = getPostset(petriNet, transition);
    const presetStatePlaces = preset.filter(isStatePlace);
    const postsetStatePlaces = postset.filter(isStatePlace);
    const postsetExistencePlaces = postset.filter(isExistencePlace);
    assert.equal(presetStatePlaces.length, normalizedEntries.length, `Expected composite creation transition ${transition.id} to consume one virtual initial state place per created object`);
    assert.equal(postsetStatePlaces.length, normalizedEntries.length, `Expected composite creation transition ${transition.id} to produce one target state place per created object`);
    for (const entry of normalizedEntries) {
        const sanitizedClassName = sanitizeIdPart(entry.className);
        const sanitizedTargetState = sanitizeIdPart(entry.targetState);
        const virtualInitialPlace = requireExactlyOne(presetStatePlaces.filter((place) => {
            const info = parseStatePlaceId(place.id);
            return (info?.role === role &&
                info.className === sanitizedClassName &&
                info.state === "initial");
        }), `Expected composite creation transition ${transition.id} to consume the virtual initial state place of ${role}.${entry.className}`);
        const createdStatePlace = requireExactlyOne(postsetStatePlaces.filter((place) => {
            const info = parseStatePlaceId(place.id);
            return (info?.role === role &&
                info.className === sanitizedClassName &&
                info.state === sanitizedTargetState);
        }), `Expected composite creation transition ${transition.id} to produce target state ${entry.targetState} of ${role}.${entry.className}`);
        const createdExistencePlace = requireExactlyOne(postsetExistencePlaces.filter((place) => {
            const info = parseExistencePlaceId(place.id);
            return info?.role === role && info.className === sanitizedClassName;
        }), `Expected composite creation transition ${transition.id} to produce existence-awareness for ${role}.${entry.className}`);
        requireArc(petriNet, virtualInitialPlace, transition);
        requireArc(petriNet, transition, createdStatePlace);
        requireArc(petriNet, transition, createdExistencePlace);
    }
    for (const existencePlace of postsetExistencePlaces) {
        const existenceInfo = parseExistencePlaceId(existencePlace.id);
        const isCreatedObjectExistence = normalizedEntries.some((entry) => existenceInfo?.role === role &&
            existenceInfo.className === sanitizeIdPart(entry.className));
        if (isCreatedObjectExistence) {
            continue;
        }
        assert.ok(preset.some((element) => element.id === existencePlace.id), `Expected non-created existence-awareness place ${existencePlace.id} in postset of ${transition.id} to also occur in its preset as a read dependency`);
    }
}
function joinTestIdParts(...parts) {
    return parts.map(sanitizeIdPart).join("_");
}
function getAdjacentStatePlaces(petriNet, transition) {
    return [
        ...getPreset(petriNet, transition),
        ...getPostset(petriNet, transition),
    ].filter(isStatePlace);
}
export function requireExistencePlace(petriNet, role, className) {
    return requirePlace(petriNet, `${role}.${className}+`);
}
export function requireStatePlace(petriNet, role, className, stateName) {
    return requirePlace(petriNet, `p_state_${joinTestIdParts(role, className, stateName)}`);
}
export function requireVirtualInitialStatePlace(petriNet, role, className) {
    return requireStatePlace(petriNet, role, className, "initial");
}
function postsetIncludes(petriNet, transition, place) {
    return getPostset(petriNet, transition).some((element) => element.id === place.id);
}
export function requirePostsetIncludes(petriNet, transition, place) {
    assert.ok(postsetIncludes(petriNet, transition, place), `Expected postset of ${transition.id} to include ${place.id}`);
}
export function expectPostsetDoesNotInclude(petriNet, transition, place) {
    assert.ok(!postsetIncludes(petriNet, transition, place), `Expected postset of ${transition.id} not to include ${place.id}`);
}
function presetIncludes(petriNet, transition, place) {
    return getPreset(petriNet, transition).some((element) => element.id === place.id);
}
export function requirePresetIncludes(petriNet, transition, place) {
    assert.ok(presetIncludes(petriNet, transition, place), `Expected preset of ${transition.id} to include ${place.id}`);
}
export function expectPresetDoesNotInclude(petriNet, transition, place) {
    assert.ok(!presetIncludes(petriNet, transition, place), `Expected preset of ${transition.id} not to include ${place.id}`);
}
export function expectWellFormedPetriNet(petriNet) {
    expectIsNonEmpty(petriNet);
    const places = petriNet.getPlaces();
    const transitions = petriNet.getTransitions();
    const arcs = petriNet.getArcs();
    const placesById = new Map(places.map((p) => [p.id, p]));
    const transitionsById = new Map(transitions.map((t) => [t.id, t]));
    const elementsById = new Map([...placesById, ...transitionsById]);
    assert.equal(elementsById.size, places.length + transitions.length, "Expected all place and transition ids to be unique");
    const arcKeys = new Set();
    for (const arc of arcs) {
        const source = elementsById.get(arc.sourceId);
        const target = elementsById.get(arc.targetId);
        assert.ok(source, `Expected arc source to exist: ${arc.sourceId}`);
        assert.ok(target, `Expected arc target to exist: ${arc.targetId}`);
        assert.notEqual(arc.sourceId, arc.targetId, `Expected no self-loop arc: ${arc.sourceId}`);
        const sourceIsPlace = placesById.has(arc.sourceId);
        const targetIsPlace = placesById.has(arc.targetId);
        assert.notEqual(sourceIsPlace, targetIsPlace, `Expected bipartite arc between place and transition: ${arc.sourceId} -> ${arc.targetId}`);
        const sourceIsTransition = transitionsById.has(arc.sourceId);
        const targetIsTransition = transitionsById.has(arc.targetId);
        assert.notEqual(sourceIsTransition, targetIsTransition, `Expected bipartite arc between place and transition: ${arc.sourceId} -> ${arc.targetId}`);
        const key = `${arc.sourceId}->${arc.targetId}`;
        assert.ok(!arcKeys.has(key), `Expected no duplicate arc: ${key}`);
        arcKeys.add(key);
    }
}
export function expectLocalTransitionsStayWithinRole(petriNet) {
    for (const transition of petriNet.getTransitions()) {
        if (!transition.id.startsWith("t_local_")) {
            continue;
        }
        expectIsLocalTransition(petriNet, transition);
    }
}
export function requireGatewayBranchTransition(petriNet, fragments) {
    const sanitizedFragments = fragments.map(sanitizeIdPart);
    const transition = getTransitions(petriNet, /^t_xor_/).find((candidate) => sanitizedFragments.every((fragment) => candidate.id.includes(fragment)));
    assert.ok(transition, `Expected exclusive-gateway branch transition containing fragments: ${sanitizedFragments.join(", ")}`);
    return transition;
}
export function requireBranchGuardReadArc(petriNet, transition, role, className, stateName) {
    requireReadArc(petriNet, requireStatePlace(petriNet, role, className, stateName), transition);
}
export function expectNoBranchGuardReadArc(petriNet, transition, role, className, stateName) {
    expectNoReadArc(petriNet, requireStatePlace(petriNet, role, className, stateName), transition);
}
export function expectControlFlowCycleThroughTransition(petriNet, transition) {
    const reachable = new Set();
    const queue = petriNet
        .getArcs()
        .filter((arc) => arc.sourceId === transition.id &&
        isControlFlowTraversalArc(petriNet, arc))
        .map((arc) => arc.targetId);
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || reachable.has(currentId)) {
            continue;
        }
        if (currentId === transition.id) {
            return;
        }
        reachable.add(currentId);
        for (const arc of petriNet.getArcs()) {
            if (arc.sourceId !== currentId ||
                !isControlFlowTraversalArc(petriNet, arc)) {
                continue;
            }
            queue.push(arc.targetId);
        }
    }
    assert.fail(`Expected transition ${transition.id} (${transition.name ?? "unnamed"}) to be part of a directed control-flow cycle`);
}
function isControlFlowTraversalArc(petriNet, arc) {
    const sourceIsTransition = petriNet
        .getTransitions()
        .some((transition) => transition.id === arc.sourceId);
    const targetIsTransition = petriNet
        .getTransitions()
        .some((transition) => transition.id === arc.targetId);
    if (sourceIsTransition === targetIsTransition) {
        return false;
    }
    const placeId = sourceIsTransition ? arc.targetId : arc.sourceId;
    return isControlFlowPlaceId(placeId);
}
function isControlFlowPlaceId(placeId) {
    return placeId.startsWith("p_sf_") || placeId.startsWith("p_trans_");
}
export function expectControlFlowPath(petriNet, sourceTransition, targetTransition) {
    assert.ok(hasControlFlowPath(petriNet, sourceTransition, targetTransition), `Expected directed control-flow path from ${sourceTransition.id} (${sourceTransition.name ?? "unnamed"}) to ${targetTransition.id} (${targetTransition.name ?? "unnamed"})`);
}
export function expectNoControlFlowPath(petriNet, sourceTransition, targetTransition) {
    assert.ok(!hasControlFlowPath(petriNet, sourceTransition, targetTransition), `Expected no directed control-flow path from ${sourceTransition.id} (${sourceTransition.name ?? "unnamed"}) to ${targetTransition.id} (${targetTransition.name ?? "unnamed"})`);
}
function hasControlFlowPath(petriNet, sourceTransition, targetTransition) {
    const reachable = new Set();
    const queue = petriNet
        .getArcs()
        .filter((arc) => arc.sourceId === sourceTransition.id &&
        isControlFlowTraversalArc(petriNet, arc))
        .map((arc) => arc.targetId);
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || reachable.has(currentId)) {
            continue;
        }
        if (currentId === targetTransition.id) {
            return true;
        }
        reachable.add(currentId);
        for (const arc of petriNet.getArcs()) {
            if (arc.sourceId !== currentId ||
                !isControlFlowTraversalArc(petriNet, arc)) {
                continue;
            }
            queue.push(arc.targetId);
        }
    }
    return false;
}
