import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Choreographies,
  SharedDataModels,
  SharedLifecycles,
} from "../fixtures/fixtureIds.js";
import {
  contextFromFixtures,
  serializedInputFromFixtures,
  type FixtureTriple,
  type NamedFixtureTriple,
} from "../fixtures/contextFromFixtures.js";
import { allFixturesExist } from "../fixtures/fixtureLoader.js";
import { parseLifecycleXml } from "../../src/shared/source/objectAwareChoreography/lifecycle/lifecycleParser.js";
import { buildObjectAwareChoreographyContext } from "../../src/shared/context/objectAwareChoreographyContext.js";
import { dispatchToolInvocation } from "../../src/service.js";
import { ToolIds } from "../../src/shared/service/toolTypes.js";

describe("Object-Aware Choreography Validation Fixtures", () => {
  scenario(
    "OACV-01N duplicate task names are rejected",
    {
      choreography: Choreographies.c03InvalidDuplicateTaskNames,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        await contextFromFixtures(fixtures);
      }, /duplicate|task|name/i);
    }
  );

  scenario(
    "OACV-02N different creators for the same class are rejected",
    {
      choreography:
        Choreographies.c16EventBasedGatewayCommunicationOneClassCreate,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l04CreateMultipleStatesNoCommonRole,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        await contextFromFixtures(fixtures);
      }, /creator|role|initial|class/i);
    }
  );

  scenario(
    "OACV-03N inconsistent one-to-one creator roles are rejected",
    {
      choreography: Choreographies.c07SequenceCommunicationTwoClasses,
      sharedDataModel: SharedDataModels.d04TwoClasses11,
      sharedLifecycle: SharedLifecycles.l06CreateTwoClassesDifferentRoles,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        await contextFromFixtures(fixtures);
      }, /one-to-one|1:1|creator|role/i);
    }
  );

  scenario(
    "OACV-04N exclusive gateways must form SESE structures",
    {
      choreography: Choreographies.c25ExclusiveGatewayInvalidNoSese,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        await contextFromFixtures(fixtures);
      }, /exclusive|gateway|sese|single[- ]?entry|single[- ]?exit|well[- ]?formed/i);
    }
  );

  scenario(
    "OACV-05N every data model class must have an object lifecycle",
    {
      choreography: Choreographies.c02SequenceNoClass,
      sharedDataModel: SharedDataModels.d02TwoClassesNM,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        await contextFromFixtures(fixtures);
      }, /class|ClassB|object lifecycle/i);
    }
  );

  scenario(
    "OACV-06N every object lifecycle must belong to a data model class",
    {
      choreography: Choreographies.c02SequenceNoClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l05CreateTwoClasses,
    },
    async (fixtures) => {
      await assert.rejects(async () => {
        await contextFromFixtures(fixtures);
      }, /lifecycle class|ClassB|data model/i);
    }
  );

  scenario(
    "OACV-07N object references must target existing data model classes",
    {
      choreography: Choreographies.c04CommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const input = await serializedInputFromFixtures(fixtures);
      input.choreography = input.choreography.replace(
        "ClassA [a-x]",
        "MissingClass [a-x]"
      );

      await assert.rejects(async () => {
        await buildObjectAwareChoreographyContext(input);
      }, /references unknown class MissingClass/i);
    }
  );

  scenario(
    "OACV-08N object references must target existing lifecycle states",
    {
      choreography: Choreographies.c04CommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l01CreateSingleState,
    },
    async (fixtures) => {
      const input = await serializedInputFromFixtures(fixtures);
      input.choreography = input.choreography.replace(
        "ClassA [a-x]",
        "ClassA [missing-state]"
      );

      await assert.rejects(async () => {
        await buildObjectAwareChoreographyContext(input);
      }, /references unknown state ClassA \[missing-state\]/i);
    }
  );

  it("OACV-09P treats only bracketed role labels as local transition actors", () => {
    const lifecycleModel =
      parseLifecycleXml(`<?xml version="1.0" encoding="UTF-8"?>
<olc:definitions xmlns:olc="http://bpt-lab.org/schemas/olc">
  <olc:model id="model_1" name="ClassA">
    <olc:initialState id="initial" />
    <olc:state id="state_a" name="a" />
    <olc:state id="state_b" name="b" />
    <olc:transition id="local" name="[RoleA]" source="initial" target="state_a" />
    <olc:transition id="sync" name="RoleA" source="state_a" target="state_b" />
  </olc:model>
</olc:definitions>`);

    const lifecycle = lifecycleModel.lifecycles.get("ClassA");
    assert.ok(lifecycle);

    const localTransition = lifecycle.transitions.find(
      (transition) => transition.id === "local"
    );
    const synchronizedTransition = lifecycle.transitions.find(
      (transition) => transition.id === "sync"
    );

    assert.equal(localTransition?.actor, "RoleA");
    assert.equal(localTransition?.triggerName, undefined);
    assert.equal(synchronizedTransition?.actor, undefined);
    assert.equal(synchronizedTransition?.triggerName, "RoleA");
  });

  scenario(
    "OACV-10P valid decision guards are accepted during context validation",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const context = await contextFromFixtures(fixtures);

      assert.equal(context.dataModel.classes.length, 1);
    }
  );

  scenario(
    "OACV-11N decision guards must reference existing data model classes",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const input = await serializedInputFromFixtures(fixtures);
      input.choreography = input.choreography.replace(
        'name="ClassA [a-x]" sourceRef="Gateway_1fcecxd"',
        'name="MissingClass [a-x]" sourceRef="Gateway_1fcecxd"',
      );
      input.choreography = input.choreography.replace(
        'name="ClassA [a-y]" sourceRef="Gateway_1fcecxd"',
        'name="MissingClass [a-y]" sourceRef="Gateway_1fcecxd"',
      );

      await assert.rejects(async () => {
        await buildObjectAwareChoreographyContext(input);
      }, /sequence flow "Flow_[^"]+".*unknown class MissingClass/i);
    }
  );

  scenario(
    "OACV-12N decision guards must reference existing lifecycle states",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const input = await serializedInputFromFixtures(fixtures);
      input.choreography = input.choreography.replace(
        'name="ClassA [a-x]" sourceRef="Gateway_1fcecxd"',
        'name="ClassA [missing-state]" sourceRef="Gateway_1fcecxd"',
      );

      await assert.rejects(async () => {
        await buildObjectAwareChoreographyContext(input);
      }, /sequence flow "Flow_1yuxkqv".*unknown state ClassA \[missing-state\]/i);
    }
  );

  scenario(
    "OACV-13N service tools return structured errors for context validation failures",
    {
      choreography: Choreographies.c23ExclusiveGatewayCommunicationOneClass,
      sharedDataModel: SharedDataModels.d01OneClass,
      sharedLifecycle: SharedLifecycles.l02CreateMultipleStates,
    },
    async (fixtures) => {
      const input = await serializedInputFromFixtures(fixtures);
      input.choreography = input.choreography.replace(
        'name="ClassA [a-x]" sourceRef="Gateway_1fcecxd"',
        'name="MissingClass [a-x]" sourceRef="Gateway_1fcecxd"',
      );
      input.choreography = input.choreography.replace(
        'name="ClassA [a-y]" sourceRef="Gateway_1fcecxd"',
        'name="MissingClass [a-y]" sourceRef="Gateway_1fcecxd"',
      );

      const result = await dispatchToolInvocation({
        toolId: ToolIds.GenerateIsolatedCasePetriNet,
        input,
      });
      const [output] = result.outputs;

      assert.equal(output.kind, "toolError");
      assert.match(output.message, /unknown class MissingClass/i);
    }
  );
});

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
