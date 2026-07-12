export function asRecord(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${description} must be an object`);
  }

  return value as Record<string, unknown>;
}

export function getRequiredStringField(
  input: unknown,
  fieldName: string,
  description = "input",
): string {
  const record = asRecord(input, description);
  const value = record[fieldName];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${description} must include string field "${fieldName}"`);
  }

  return value;
}

export function getOptionalStringField(
  input: unknown,
  fieldName: string,
  description = "input",
): string | undefined {
  const record = asRecord(input, description);
  const value = record[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${description} field "${fieldName}" must be a string`);
  }

  return value;
}
