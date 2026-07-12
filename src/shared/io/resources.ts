import { promises as fs } from "fs";
import { join } from "path";

export type Resource = {
  fileName: string;
  content: string;
};

export async function readResources(resourcesDir: string): Promise<Resource[]> {
  const resourceFiles = await fs.readdir(resourcesDir);

  return Promise.all(
    resourceFiles.map(async (fileName) => ({
      fileName,
      content: await fs.readFile(join(resourcesDir, fileName), "utf8"),
    }))
  );
}

export function mustFindResource(
  resources: Resource[],
  extension: string
): string {
  const content = resources.find(({ fileName }) =>
    fileName.endsWith(extension)
  )?.content;

  if (!content) {
    throw new Error(`Could not find ${resourceNameForExtension(extension)}`);
  }

  return content;
}

export function mustFindPreferredXmlResource(
  resources: Resource[],
  preferredFileNameParts: string[],
  description: string
): string {
  const xmlResources = resources.filter(({ fileName }) =>
    fileName.endsWith(".xml")
  );
  const preferredResource = xmlResources.find(({ fileName }) => {
    const normalizedFileName = fileName.toLowerCase();

    return preferredFileNameParts.some((part) =>
      normalizedFileName.includes(part.toLowerCase())
    );
  });

  if (preferredResource) {
    return preferredResource.content;
  }

  throw new Error(
    `Could not find ${description}; expected an .xml resource whose file name contains one of: ${preferredFileNameParts.join(
      ", "
    )}`
  );
}

function resourceNameForExtension(extension: string): string {
  if (extension === ".chor") {
    return "choreography file";
  }

  return `${extension} resource`;
}
