/**
 * Parse and validate a contentJson value coming from a multipart/form-data field
 * or a JSON request body.
 *
 * Accepted shapes:
 *   - undefined  → undefined  (field not provided)
 *   - null        → null        (explicit clear)
 *   - empty str   → null        (blank field)
 *   - JSON string → parsed object, must be { type: "doc", content: [...] }
 *   - object      → must be { type: "doc", content: [...] }
 *
 * Rejected:
 *   - number, boolean, array, or any other non-object type
 *   - malformed JSON
 *   - objects missing type/content or with wrong type
 */
export function parseContentJsonField(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;

  // Non-string, non-null values: validate shape or reject
  if (typeof value !== 'string') {
    // Reject primitives (number, boolean) and arrays outright
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid contentJson payload: must be a Tiptap document object with type "doc"');
    }
    // value is a plain object — validate shape
    const obj = value as Record<string, unknown>;
    if (obj.type !== 'doc' || !Array.isArray(obj.content)) {
      throw new Error('Invalid contentJson payload: must have type "doc" with content array');
    }
    return value;
  }

  // String path: parse JSON, then validate shape
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Invalid contentJson payload: malformed JSON');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid contentJson payload: must be an object with type "doc"');
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.type !== 'doc' || !Array.isArray(obj.content)) {
    throw new Error('Invalid contentJson payload: must have type "doc" with content array');
  }

  return parsed;
}