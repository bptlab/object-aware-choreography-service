# Thesis Evaluation Scenarios

This directory contains the thesis-facing evaluation setup for the object-aware
choreography service. It is organized by stable scenario IDs instead of the
implementation-oriented artifact test names.

Run only this evaluation setup with:

```sh
npm run evaluation
```

The regular `npm run test` and `npm run test:silent` scripts intentionally
exclude `evaluation`, so the existing implementation regression tests stay
separate from the thesis evaluation scenarios.

## Scenario Groups

- `CSxx`: construct scenarios
- `VSxx`: validation scenarios
- `WSxx`: object-aware realizability witness scenarios
- `ISxx`: integrated scenarios

Scenario definitions live in `scenarios.ts`. All artifact tests resolve their
inputs through that file. Validation scenarios are exercised only by
`00-validation.test.ts`, not by the artifact-specific tests. This group covers
context-level validation and target-specific preconditions, including
BSPL-specific mapping restrictions.

## Fixtures

Evaluation fixtures are copied under:

```text
evaluation/fixtures/
  choreographies/
  shared_data_models/
  shared_object_lifecycles/
```

The loader fails with a clear missing-fixture error if a referenced fixture does
not exist. This is intentional: incomplete thesis scenarios should be visible
while the final fixture set is prepared.

Fixtures are shared across scenarios when the same model shape is sufficient.
For example, the binary association scenarios reuse the same two-class
choreography with different shared data models.

`CS16` is currently marked partial for BSPL comparison/refinement until the
multi-participant guarded-decision behavior is confirmed in the thesis-facing
evaluation setup.

## Results

Evaluation artifacts are written to:

```text
evaluation/results/
  00-validation/
  01-isolated-case-semantics/
  02-isolated-case-analysis/
  03-cross-case-semantics/
  04-cross-case-analysis/
  05-bspl-mapping/
  06-bspl-refinement/
```

Every generated filename starts with the lowercase scenario ID followed by a
stable snake-case slug.
