import { describe, it } from "node:test";
import { buildIsolatedCaseSemanticsWithObjectAwareAnomalyAnalysis } from "../../../src/shared/semantics/isolatedCaseSemantics.js";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../../fixtures/fixtureIds.js";
import {
  contextFromFixtures,
  NamedFixtureTriple,
  type FixtureTriple,
} from "../../fixtures/contextFromFixtures.js";
import { allFixturesExist } from "../../fixtures/fixtureLoader.js";
import {
  expectObjectAwareAnomalyAnalysisHolds,
  expectObjectAwareAnomalyAnalysisViolated,
  expectDeadBranchViolation,
  expectDecisionDeterminismViolation,
  expectReceiverProgressionViolation,
  expectSenderProgressionViolation,
} from "../../assertions/objectAwareAnomalyAssertions.js";

describe("Object-Aware Anomaly Analysis Fixtures", () => {
  scenario(
    "ICOA-01P no-object holds",
    {
      choreography: Choreographies.c01TaskNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisHolds(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-02P communication task sequence holds",
    {
      choreography: Choreographies.c05SequenceCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisHolds(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-03P synchronized task holds",
    {
      choreography: Choreographies.c10SequenceSynchronizationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisHolds(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-04P combined task holds",
    {
      choreography: Choreographies.c14CombinedSameClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisHolds(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-05P event-based local decision holds",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisHolds(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-06P exclusive decision holds",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisHolds(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-07P parallel holds",
    {
      choreography: Choreographies.c28ParallelGatewayCommunicationThreeClasses,
      sharedDataModel: SharedDataModels.d05ThreeClassesNoAssociation,
      sharedLifecycle: SharedLifecycles.l07CreateThreeClasses,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisHolds(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-08P Event-based loop holds",
    {
      choreography: Choreographies.c22EventBasedGatewayNoClassLoop,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisHolds(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-09P Exclusive loop holds",
    {
      choreography: Choreographies.c27ExclusiveGatewayCommunicationOneClassLoop,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l22LocalDecisionSynchronizedLoop,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisHolds(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-10N send blocking via communication",
    {
      choreography: Choreographies.c30SendBlockingCommunication,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisViolated(objectAwareAnomalyReport);
      expectSenderProgressionViolation(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-11N send blocking via synchronized transition",
    {
      choreography: Choreographies.c31SendBlockingSynchronization,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisViolated(objectAwareAnomalyReport);
      expectSenderProgressionViolation(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-12N receive blocking via communication",
    {
      choreography: Choreographies.c32ReceiveBlockingCommunication,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l13LocalDecisionDifferentRoles,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisViolated(objectAwareAnomalyReport);
      expectReceiverProgressionViolation(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-13N receive blocking via synchronized transition",
    {
      choreography: Choreographies.c33ReceiveBlockingSynchronization,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l16SynchronizedTransitionOneClass,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisViolated(objectAwareAnomalyReport);
      expectReceiverProgressionViolation(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-14N misaligned decision",
    {
      choreography: Choreographies.c34MisalignedDecision,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisViolated(objectAwareAnomalyReport);
      expectDecisionDeterminismViolation(objectAwareAnomalyReport);
    }
  );

  scenario(
    "ICOA-15N dead branch",
    {
      choreography: Choreographies.c35DeadBranch,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle:
        SharedLifecycles.l10LocalTransitionDifferentRolesTwoStates,
    },
    async (fixtures) => {
      const { objectAwareAnomalyReport } = await runScenario(fixtures);

      expectObjectAwareAnomalyAnalysisViolated(objectAwareAnomalyReport);
      expectDeadBranchViolation(objectAwareAnomalyReport);
    }
  );
});

async function runScenario(args: NamedFixtureTriple) {
  return buildIsolatedCaseSemanticsWithObjectAwareAnomalyAnalysis(
    await contextFromFixtures(args)
  );
}

function scenario(
  name: string,
  fixtures: FixtureTriple,
  run: (fixtures: NamedFixtureTriple) => Promise<void>
): void {
  if (!allFixturesExist(fixtures)) {
    throw new Error(`Missing fixtures for scenario "${name}"`);
  }

  it(name, () => run({ ...fixtures, scenarioName: name }));
}
