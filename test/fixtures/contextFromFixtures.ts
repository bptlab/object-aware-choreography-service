import {
  buildObjectAwareChoreographyContext,
  type ObjectAwareChoreographyContext,
} from "../../src/shared/context/objectAwareChoreographyContext.js";
import type { ObjectAwareChoreographySerializedInput } from "../../src/shared/service/toolTypes.js";
import { loadFixtureText } from "./fixtureLoader.js";

export type FixtureTriple = {
  choreography: string;
  sharedDataModel: string;
  sharedLifecycle: string;
};

export type NamedFixtureTriple = FixtureTriple & {
  scenarioName: string;
};

export async function serializedInputFromFixtures(
  args: FixtureTriple,
): Promise<ObjectAwareChoreographySerializedInput> {
  const [choreography, sharedDataModel, sharedLifecycle] = await Promise.all([
    loadFixtureText(`test/resources/fixtures/choreographies/${args.choreography}`),
    loadFixtureText(
      `test/resources/fixtures/shared_data_models/${args.sharedDataModel}`,
    ),
    loadFixtureText(
      `test/resources/fixtures/shared_lifecycles/${args.sharedLifecycle}`,
    ),
  ]);

  return {
    choreography,
    shared_data_model: sharedDataModel,
    shared_object_lifecycles: sharedLifecycle,
  };
}

export async function contextFromFixtures(
  args: FixtureTriple,
): Promise<ObjectAwareChoreographyContext> {
  return buildObjectAwareChoreographyContext(
    await serializedInputFromFixtures(args),
  );
}
