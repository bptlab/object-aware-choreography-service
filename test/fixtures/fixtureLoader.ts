import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export function resolveFixturePath(relativePath: string): string {
  return resolve(process.cwd(), relativePath);
}

export function fixtureExists(relativePath: string): boolean {
  return existsSync(resolveFixturePath(relativePath));
}

export async function loadFixtureText(relativePath: string): Promise<string> {
  const resolvedPath = resolveFixturePath(relativePath);

  if (!fixtureExists(relativePath)) {
    throw new Error(`Missing fixture: ${relativePath} (${resolvedPath})`);
  }

  return readFile(resolvedPath, "utf8");
}

export function allFixturesExist(args: {
  choreography: string;
  sharedDataModel: string;
  sharedLifecycle: string;
}): boolean {
  return (
    fixtureExists(`test/resources/fixtures/choreographies/${args.choreography}`) &&
    fixtureExists(
      `test/resources/fixtures/shared_data_models/${args.sharedDataModel}`,
    ) &&
    fixtureExists(
      `test/resources/fixtures/shared_lifecycles/${args.sharedLifecycle}`,
    )
  );
}
