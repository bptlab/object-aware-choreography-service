# Typed Petri-Net Target

This module is a foundational target representation for typed inhibitor Petri
nets with identifiers. It is intentionally independent from object-aware
choreography semantics so cross-case mapping and analysis can reuse the target
shape without coupling the serializer to choreography-specific rules.

## External Modeler Format

The inspected `.obpt-typed-pn` modeler resources serialize a model as
`tpn:definitions` with a `tpn:model` and `tpnDi:diagram` section.
Identifier types are represented as `tpn:dataClass` declarations with `name`,
`alias`, and `valueType="ID"`. Typed places use a `color` attribute containing
one or more data class IDs; multiple IDs represent a tuple signature. Initial
markings are nested `tpn:token` elements with one `tpn:tokenValue` per tuple
component.

Arc tuple inscriptions are represented by `tpn:inscriptionElement` children.
Each element points to a `dataClass`, carries a `variableName`, and marks fresh
identifier generation with `isGenerated="true"`. Ordinary arcs and inhibitor
arcs share `tpn:arc`; inhibitors add `isInhibitorArc="true"`. The modeler also
supports arc-level `variableType` and `isExactSynchronization` attributes, but
this first target only preserves `variableType` when supplied and does not model
exact synchronization yet.

The semantic layer imports successfully into the modeler, but the modeler also
needs a non-empty `tpnDi` layer to render the net visually. The serializer now
emits one diagram shape per place and transition, one diagram edge per arc,
shape bounds, edge waypoints, and label bounds for places and arcs.

## Analysis Use

The bounded cross-case analyses operate on this internal representation rather
than on serialized XML. The serializer remains responsible for exchanging typed
Petri-net artifacts with the modeler; firing semantics, binding construction,
generated identifier handling, and object-aware realizability checks are kept in
the analysis and mapping layers.

## Internal Representation

The internal representation uses explicit TypeScript interfaces for identifier
types, variables, places, transitions, arcs, tuple inscriptions, and typed
tokens. The builder validates declared identifier types, variable/type
compatibility, place token arity, duplicate element IDs, and known arc
endpoints. IDs are deterministic and sanitized through the shared ID
sanitization conventions.

## Diagram Layout

The serializer includes deterministic minimal diagram generation. By default,
places and transitions are arranged on a small grid with 50 x 50 node bounds,
fixed column and row spacing, and two edge waypoints. Edge endpoints use simple
side anchors rather than node centers: horizontal arcs connect left/right sides
and vertical arcs connect top/bottom sides. This keeps arrowheads visible for
small generated nets without introducing a full layout algorithm.

Future callers can pass serializer layout options for explicit node bounds, arc
waypoints, and label bounds. Manual import into the typed PN modeler should
still be used to verify visual round-trip compatibility.

The ordinary Petri-net builder uses the same shared side-anchor geometry helper.
Future cross-case layout should reuse or generalize the ordinary Petri-net
layered layout strategy instead of growing a second unrelated layout system for
typed Petri nets.

## Current Limitations

The serializer emits structural XML and deterministic minimal diagram
information needed by the typed PN modeler, but it does not implement full graph
layout. Exact synchronization semantics are represented structurally when
available, and fresh identifiers are represented through `isGenerated="true"` on
inscription elements.
