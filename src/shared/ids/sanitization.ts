export function sanitizeIdPart(value: string): string {
  return String(value)
    .trim()
    .replace(/_/g, "-")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function joinIdParts(...parts: string[]): string {
  return parts.map(sanitizeIdPart).join("_");
}

export function sanitizeBsplIdentifierPart(
  value: string,
  fallback = "parameter",
): string {
  const sanitized = sanitizeIdPart(value).toLowerCase();

  if (sanitized.length > 0) {
    return sanitized;
  }

  const fallbackSanitized = sanitizeIdPart(fallback).toLowerCase();
  return fallbackSanitized.length > 0 ? fallbackSanitized : "parameter";
}
