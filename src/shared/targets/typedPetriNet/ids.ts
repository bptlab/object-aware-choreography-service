import { sanitizeIdPart } from "../../ids/sanitization.js";

export function typedPetriNetId(prefix: string, id: string): string {
  const sanitized = sanitizeIdPart(id).replace(/-/g, "_");
  const suffix = sanitized.length > 0 ? sanitized : "unnamed";
  return `${prefix}_${suffix}`;
}
