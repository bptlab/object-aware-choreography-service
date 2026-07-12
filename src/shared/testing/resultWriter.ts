import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeScenarioResult(args: {
  resultDirectory: string;
  subdirectory?: string;
  scenarioName: string;
  content: string;
  fileExtension: string;
}): Promise<void> {
  const resultDir = join(
    process.cwd(),
    "test",
    "results",
    ...(args.subdirectory ? [args.subdirectory] : []),
    args.resultDirectory
  );

  await mkdir(resultDir, { recursive: true });
  await writeFile(
    join(
      resultDir,
      `${resultFileName(args.scenarioName)}.${args.fileExtension}`
    ),
    args.content,
    "utf8"
  );
}

function resultFileName(scenarioName: string): string {
  return scenarioName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
