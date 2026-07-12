# Object-Aware Choreography Service

This repository contains the research prototype and executable evaluation artifact accompanying the dissertation **"Modeling and Analysis of
Object-Aware Process Choreographies."**

The prototype extends **OpenBPT** with model validation, formal-semantics
generation, object-aware realizability analysis, bounded cross-case analysis,
and transformations to BSPL information protocols. It operates on
interaction-centric BPMN choreography diagrams enriched with a shared data
model and shared data object lifecycles.

> **Research artifact.** This repository implements the formal semantics, analyses, protocol transformations, and executable evaluation presented in the dissertation.

---

## Capabilities

The service consumes three model types:

- a BPMN choreography diagram;
- a UML class diagram representing the shared data model; and
- UML state-machine diagrams representing shared data object lifecycles.

All model-based tools first combine these inputs into a validated
object-aware choreography context.

The implemented functionality covers four areas.

| Area                        | Functionality                                                                                                                                              | Outputs                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Model validation**        | Validate cross-model references, lifecycle definitions, object references, synchronized transitions, decision guards, and supported structural assumptions | Validation report                                      |
| **Isolated-case analysis**  | Generate isolated-case Petri-net semantics and evaluate object-aware realizability                                                                         | Petri net, analysis report, witnesses                  |
| **Cross-case analysis**     | Generate identifier-aware typed Petri-net semantics and evaluate bounded cross-case object-aware realizability                                             | Typed Petri net, analysis report, witnesses            |
| **Protocol transformation** | Generate BSPL protocols, compare complete send-trace languages, discover control-flow constraints, and refine protocols                                    | BSPL protocols, comparison reports, refinement reports |

Object-aware realizability combines projected choreography soundness with
sender progression, receiver progression, and decision consistency. Cross-case
analysis evaluates the corresponding identifier-aware criteria over bounded
case, participant, and object domains.

---

## Quick Start

### Prerequisites

- Node.js >= 22.14
- npm

Install dependencies:

```bash
npm install
```

Build the service:

```bash
npm run build
```

Run the implementation regression tests:

```bash
npm test
```

Reproduce the dissertation evaluation:

```bash
npm run evaluation:silent
```

The generated evaluation artifacts are written to:

```text
evaluation/results/
```

For interactive use within OpenBPT:

```bash
npm run dev
```

Run the compiled service:

```bash
npm start
```

---

## OpenBPT Tools

The service exposes the following tools.

| Tool ID                                            | Purpose                                                |
| -------------------------------------------------- | ------------------------------------------------------ |
| `oa-chor.generate-isolated-case-petri-net`         | Generate isolated-case Petri-net semantics             |
| `oa-chor.isolated-case-object-aware-realizability` | Evaluate isolated-case object-aware realizability      |
| `oa-chor.generate-cross-case-petri-net`            | Generate identifier-aware typed Petri-net semantics    |
| `oa-chor.cross-case-object-aware-realizability`    | Evaluate bounded cross-case object-aware realizability |
| `oa-chor.generate-bspl`                            | Generate a BSPL protocol                               |
| `oa-chor.compare-send-trace-languages`             | Compare choreography and BSPL send-trace languages     |
| `oa-chor.discover-control-flow-constraints`        | Discover protocol control-flow constraints             |
| `oa-chor.refine-bspl`                              | Refine a BSPL protocol using discovered constraints    |

The model-based tools share a common object-aware choreography context,
validation pipeline, and intermediate representation. The refinement tool
operates directly on an existing BSPL protocol together with a constraint
specification.

---

## Reproducing the Dissertation Evaluation

The executable evaluation accompanying the dissertation is located in
`evaluation/`.

```text
evaluation/
├── README.md
├── scenarios.ts
├── evaluationHelpers.ts
├── artifacts/
├── assertions/
├── fixtures/
└── results/
```

Scenario identifiers use the following prefixes.

| Prefix | Description          |
| ------ | -------------------- |
| `CSxx` | Construct scenarios  |
| `VSxx` | Validation scenarios |
| `WSxx` | Witness scenarios    |
| `ISxx` | Integrated scenarios |

Run the complete evaluation:

```bash
npm run evaluation
```

Run without service logging:

```bash
npm run evaluation:silent
```

Generated artifacts are grouped by evaluation stage:

```text
evaluation/results/
├── 00-validation/
├── 01-isolated-case-semantics/
├── 02-isolated-case-analysis/
├── 03-cross-case-semantics/
├── 04-cross-case-analysis/
├── 05-bspl-mapping/
└── 06-bspl-refinement/
```

Each directory contains

- generated artifacts;
- an `overview.json`;
- an `overview.csv`; and
- scenario-specific reports.

The corresponding evaluation inputs are stored under:

```text
evaluation/fixtures/
```

---

## Implementation Tests

Implementation regression tests are separated from the evaluation.

Run the complete test suite:

```bash
npm test
```

Run without service logging:

```bash
npm run test:silent
```

Test resources are stored under

```text
test/resources/
```

Generated outputs are written to

```text
test/results/
```

---

## Repository Structure

```text
src/
├── service.ts               Tool dispatcher
├── manifest.ts              Tool declarations
├── tools/                   Tool wrappers
└── shared/
    ├── context/             Object-aware choreography context
    ├── source/              Parsing and validation
    ├── mappings/            Petri-net and BSPL transformations
    ├── analysis/            State-space and realizability analyses
    └── targets/             Output representations

evaluation/                  Dissertation evaluation artifact
test/                        Regression tests
lib/openbpt-service-core-ts/ Local OpenBPT adapter
```

---

## Scope and Assumptions

The implementation follows the formal scope defined in the dissertation.

In particular:

- choreography tasks are normalized to directed one-way interactions;
- only the supported BPMN and UML fragments are accepted;
- exclusive-gateway decision regions must satisfy the structural restrictions
  defined by the framework;
- each choreography case contains at most one object identity per object class;
- isolated-case analysis assumes objects are not modified by concurrent
  choreography cases;
- object-aware realizability is evaluated relative to a sound and realizable
  control-flow baseline;
- cross-case analysis is bounded by finite case, participant, and object domains;
- the BSPL mapping assumes acyclic choreography control flow and acyclic object
  lifecycles; and
- choreography–protocol comparison is performed over finite languages of
  complete send traces.

The choreography–protocol comparison establishes equivalence only with respect
to complete send traces. It does not prove operational equivalence between the
Petri-net semantics and the generated BSPL protocol, nor does it verify
BSPL-native safety or liveness properties.

---

## Known Limitations

- The prototype supports only the modeling fragment defined in the dissertation.
- Multiple objects of the same class within a choreography case are not
  supported.
- Dynamic object rebinding is outside the supported fragment.
- State-space exploration is explicit and therefore does not scale to arbitrarily
  large models.
- Cross-case analysis depends on finite identifier domains and optional
  exploration bounds.
- Typed Petri nets are serialized using the OpenBPT typed-net format.
- The BSPL mapping currently excludes cyclic choreography control flow and
  cyclic object lifecycles.
- Selected unsupported choreography structures (for example direct completion
  after particular parallel-join patterns) are rejected during validation.
- Send-trace enumeration and control-flow constraint discovery may terminate
  early when configured exploration limits are exceeded.
- Validation is performed during tool invocation rather than continuously during
  modeling.

---

## Development Commands

```bash
npm install

npm run build

npm run lint

npm test
npm run test:silent

npm run evaluation
npm run evaluation:silent

npm run dev
npm start
```
