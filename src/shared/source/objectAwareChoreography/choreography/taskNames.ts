import type { ChoreographyTask } from "bpmn-moddle";
import { logger } from "../../../logger.js";

export interface TaskNameInfo {
  taskId: string;
  taskName: string;
  normalizedName: string;
  canonicalName: string;
}

export interface TaskNameIndex {
  byTaskId: Map<string, TaskNameInfo>;
  tasksByCanonicalName: Map<string, TaskNameInfo[]>;
}

export function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

export function canonicalTaskName(taskName: string): string {
  return normalizeLabel(taskName);
}

export function buildTaskNameIndex(tasks: ChoreographyTask[]): TaskNameIndex {
  const normalizedNames = new Set<string>();
  const normalizedVariantPrefixCounts = new Map<string, number>();

  for (const task of tasks) {
    const normalizedName = normalizeLabel(task.name ?? task.id);

    if (normalizedNames.has(normalizedName)) {
      throw new Error(`Duplicate choreography task name "${normalizedName}"`);
    }

    normalizedNames.add(normalizedName);

    const variantPrefix = getNormalizedVariantPrefix(normalizedName);

    if (variantPrefix) {
      normalizedVariantPrefixCounts.set(
        variantPrefix,
        (normalizedVariantPrefixCounts.get(variantPrefix) ?? 0) + 1
      );
    }
  }

  const byTaskId = new Map<string, TaskNameInfo>();
  const tasksByCanonicalName = new Map<string, TaskNameInfo[]>();

  for (const task of tasks) {
    const taskName = task.name ?? task.id;
    const normalizedName = normalizeLabel(taskName);
    const variantPrefix = getNormalizedVariantPrefix(normalizedName);
    const canonicalName =
      variantPrefix &&
      (normalizedVariantPrefixCounts.get(variantPrefix) ?? 0) > 1
        ? variantPrefix
        : normalizedName;
    const taskInfo = {
      taskId: task.id,
      taskName,
      normalizedName,
      canonicalName,
    };

    byTaskId.set(task.id, taskInfo);
    tasksByCanonicalName.set(canonicalName, [
      ...(tasksByCanonicalName.get(canonicalName) ?? []),
      taskInfo,
    ]);
  }

  for (const [canonicalName, taskInfos] of tasksByCanonicalName) {
    if (taskInfos.length > 1) {
      logger.info(
        {
          canonicalName,
          variants: taskInfos.map((taskInfo) => taskInfo.normalizedName),
        },
        "Detected canonical choreography task variant group"
      );
    }
  }

  return {
    byTaskId,
    tasksByCanonicalName,
  };
}

export function triggerMatchesTask(
  triggerName: string,
  taskInfo: TaskNameInfo
): boolean {
  return normalizeLabel(triggerName) === taskInfo.canonicalName;
}

function getNormalizedVariantPrefix(
  normalizedName: string
): string | undefined {
  const match = /^(.*)\s+\d+$/.exec(normalizedName);

  if (!match) {
    return undefined;
  }

  return normalizeLabel(match[1]);
}
