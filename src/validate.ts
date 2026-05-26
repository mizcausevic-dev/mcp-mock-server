import type { JsonSchema } from "./types.js";

/** Validate `value` against a minimal subset of JSON Schema needed for MCP tool
 *  args (type/required/enum/min/max/minLength/maxLength/additionalProperties).
 *  Returns the list of human-readable violation messages — empty when valid. */
export function validate(value: unknown, schema: JsonSchema | undefined, path = "$"): string[] {
  if (!schema) return [];
  const violations: string[] = [];

  if (schema.type) {
    if (!matchesType(value, schema.type)) {
      violations.push(`${path}: expected ${schema.type}, got ${jsType(value)}`);
      return violations; // further checks aren't meaningful on the wrong type
    }
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (!schema.enum.some((e) => deepEqual(e, value))) {
      violations.push(`${path}: not in enum [${schema.enum.map((e) => JSON.stringify(e)).join(", ")}]`);
    }
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const r of schema.required ?? []) {
      if (!(r in obj)) violations.push(`${path}: missing required field "${r}"`);
    }
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) {
        violations.push(...validate(v, props[k], `${path}.${k}`));
      } else if (schema.additionalProperties === false) {
        violations.push(`${path}: unexpected property "${k}" (additionalProperties: false)`);
      }
    }
  }

  if (schema.type === "string" && typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      violations.push(`${path}: length ${value.length} < minLength ${schema.minLength}`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      violations.push(`${path}: length ${value.length} > maxLength ${schema.maxLength}`);
    }
  }

  if ((schema.type === "integer" || schema.type === "number") && typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      violations.push(`${path}: ${value} < minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      violations.push(`${path}: ${value} > maximum ${schema.maximum}`);
    }
  }

  return violations;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function jsType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
