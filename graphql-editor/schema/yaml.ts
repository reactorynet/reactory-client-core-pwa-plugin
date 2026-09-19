/**
 * Minimal YAML emitter for result display.
 *
 * The client has no YAML dependency, and adding one to the plugin (a submodule
 * with no package.json of its own) would mean touching the host's dependency
 * graph for a display-only concern. This emitter covers the JSON-ish value
 * space a GraphQL response actually produces: objects, arrays, strings,
 * numbers, booleans and null.
 *
 * Every line is emitted with its own absolute indentation, and each recursive
 * call is told the level it is writing at. That is deliberate: producing
 * *relative* indentation and shifting it afterwards double-counts nested
 * structure, which silently misaligns block mappings inside sequences.
 */

const RESERVED = new Set([
  'true', 'false', 'null', 'yes', 'no', 'on', 'off', '~',
  'True', 'False', 'Null', 'Yes', 'No', 'On', 'Off', 'NULL', 'TRUE', 'FALSE',
]);

/** A plain (unquoted) scalar is only safe for a conservative character set. */
const PLAIN_SAFE = /^[A-Za-z0-9_][A-Za-z0-9_\-./ @]*$/;

/** Numeric-looking strings must be quoted or they would read back as numbers. */
const LOOKS_TYPED = /^[-+]?(\d[\d_]*)?\.?\d*([eE][-+]?\d+)?$/;

const needsQuoting = (value: string): boolean => {
  if (value.length === 0) return true;
  if (RESERVED.has(value)) return true;
  if (LOOKS_TYPED.test(value)) return true;
  if (!PLAIN_SAFE.test(value)) return true;
  // A leading/trailing space would be stripped by a YAML reader.
  if (value !== value.trim()) return true;
  if (value.includes(': ') || value.endsWith(':')) return true;
  return false;
};

const quote = (value: string): string =>
  `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;

const scalar = (value: any): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'null';
    if (!Number.isFinite(value)) return quote(String(value));
    return String(value);
  }
  if (value instanceof Date) return quote(value.toISOString());
  const text = String(value);
  return needsQuoting(text) ? quote(text) : text;
};

const isPlainObject = (value: any): boolean =>
  value !== null && typeof value === 'object' && Array.isArray(value) === false;

const isCollection = (value: any): boolean => Array.isArray(value) || isPlainObject(value);

const inlineCollection = (value: any): string | null => {
  if (Array.isArray(value) && value.length === 0) return '[]';
  if (isPlainObject(value) && Object.keys(value).length === 0) return '{}';
  return null;
};

/** Emit `value` with every line padded to `indent` levels. */
const emit = (value: any, indent: number): string[] => {
  const pad = '  '.repeat(indent);

  // A top-level empty collection has no entries to iterate over, so without
  // this it would render as nothing at all rather than as an empty container.
  if (isCollection(value)) {
    const inline = inlineCollection(value);
    if (inline) return [`${pad}${inline}`];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (isCollection(item)) {
        const inline = inlineCollection(item);
        if (inline) return [`${pad}- ${inline}`];

        // The child is written one level deeper, which places its first key
        // exactly where `- ` ends; the remaining lines keep that alignment.
        const child = emit(item, indent + 1);
        return [`${pad}- ${child[0].trim()}`, ...child.slice(1)];
      }
      return [`${pad}- ${scalar(item)}`];
    });
  }

  if (isPlainObject(value)) {
    return Object.entries(value).flatMap(([key, entryValue]) => {
      const safeKey = needsQuoting(key) ? quote(key) : key;

      if (isCollection(entryValue)) {
        const inline = inlineCollection(entryValue);
        if (inline) return [`${pad}${safeKey}: ${inline}`];
        return [`${pad}${safeKey}:`, ...emit(entryValue, indent + 1)];
      }

      return [`${pad}${safeKey}: ${scalar(entryValue)}`];
    });
  }

  return [`${pad}${scalar(value)}`];
};

/** Serialise a JSON-compatible value to YAML text. */
export const toYaml = (value: any): string => `${emit(value, 0).join('\n')}\n`;

/** Serialise to JSON, tolerating values JSON.stringify refuses (e.g. cycles). */
export const toJsonText = (value: any): string => {
  try {
    return `${JSON.stringify(value, null, 2)}\n`;
  } catch (error) {
    return `{ "error": "Result could not be serialised: ${(error as Error).message}" }\n`;
  }
};
