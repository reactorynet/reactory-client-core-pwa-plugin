/**
 * Small pure helpers shared by the renderer, the registry and the tests.
 *
 * Kept free of React and MUI so they can be unit-tested directly and reused by
 * ORG-031/ORG-033/ORG-034 when they normalise their own payloads.
 */
import {
  DEMOGRAPHIC_VALUE_TYPES,
  type DemographicDefinition,
  type DemographicFieldError,
  type DemographicOption,
  type DemographicValueType,
  type DemographicValues,
} from './types';

/** DOM id of the control a field's `<label for>` points at. */
export const demographicControlId = (key: string): string => `demographic-field-${key}`;

/** True for the nine value types the server documents. */
export const isDemographicValueType = (value: unknown): value is DemographicValueType =>
  typeof value === 'string' &&
  (DEMOGRAPHIC_VALUE_TYPES as readonly string[]).indexOf(value) >= 0;

/**
 * Coerce an unknown wire value type onto a known one.
 *
 * An unknown type is rendered as a text input and flagged by the field renderer;
 * it must never throw, because a newer server adding a tenth type would
 * otherwise break every demographics screen.
 */
export const normaliseValueType = (valueType: unknown): DemographicValueType =>
  isDemographicValueType(valueType) ? valueType : 'string';

/** A translated/verbatim error as a flat list, dropping empty entries. */
export const normaliseFieldErrors = (error?: DemographicFieldError): string[] => {
  if (error === null || error === undefined) return [];
  const list = Array.isArray(error) ? error : [error];
  return list
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
};

/** Immutable single-key update; the caller's record is never mutated. */
export const setDemographicValue = (
  values: DemographicValues | null | undefined,
  key: string,
  value: unknown,
): DemographicValues => ({ ...(values || {}), [key]: value });

/** Ordinal for sorting, with non-numeric/missing values treated as 0. */
export const ordinalOf = (value: { ordinal?: number | null } | null | undefined): number => {
  const ordinal = Number(value?.ordinal);
  return Number.isFinite(ordinal) ? ordinal : 0;
};

/**
 * The definitions a form actually renders: enabled, not soft-deleted, keyed,
 * ordered by `ordinal` (ties broken by key so the order is deterministic).
 *
 * `enabled === false` is the only "off" value — the GraphQL field is nullable
 * and an older payload that omits it means enabled.
 */
export const selectRenderableDefinitions = (
  definitions: DemographicDefinition[] | null | undefined,
): DemographicDefinition[] =>
  (definitions || [])
    .filter(
      (definition) =>
        Boolean(definition) &&
        typeof definition.key === 'string' &&
        definition.key.length > 0 &&
        definition.enabled !== false &&
        definition.deleted !== true,
    )
    .slice()
    .sort((a, b) => {
      const delta = ordinalOf(a) - ordinalOf(b);
      return delta !== 0 ? delta : a.key.localeCompare(b.key);
    });

/**
 * Normalise enum/multi-enum options for display.
 *
 * A deprecated option stays visible only while it is the current value, so an
 * existing record keeps rendering after its option is retired while new records
 * cannot pick it.
 */
export const normaliseOptions = (
  definition: Pick<DemographicDefinition, 'options'>,
  value?: unknown,
): Array<{ key: string; label: string }> => {
  const options: DemographicOption[] = Array.isArray(definition?.options)
    ? definition.options
    : [];
  const selected = new Set<string>(
    (Array.isArray(value) ? value : value === null || value === undefined ? [] : [value])
      .map((entry) => (typeof entry === 'string' ? entry : String(entry ?? '')))
      .filter((entry) => entry.length > 0),
  );

  return options
    .filter((option) => option && typeof option.key === 'string' && option.key.length > 0)
    .filter((option) => option.deprecated !== true || selected.has(option.key))
    .slice()
    .sort((a, b) => ordinalOf(a) - ordinalOf(b))
    .map((option) => ({
      key: option.key,
      label:
        typeof option.label === 'string' && option.label.trim().length > 0
          ? option.label
          : option.key,
    }));
};

/**
 * Render a stored date for the read-only presentation.
 *
 * Dates arrive as ISO strings (server `Date` scalar) but a caller may hand us a
 * `Date` or a dayjs/moment object, so accept anything stringifiable and fall
 * back to the raw value.
 */
export const formatDemographicDate = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof (value as any).format === 'function') {
    try {
      return String((value as any).format('YYYY-MM-DD'));
    } catch {
      return String(value);
    }
  }
  return String(value);
};

/**
 * Coerce the raw text of a numeric field into the value the server stores.
 *
 * `''` clears the value; a finite number is stored as a number; anything else is
 * handed back as text rather than as `NaN`.
 *
 * Why text can reach here at all: a `type="number"` input sanitises invalid
 * content to `''` in a browser, but a paste of `1e`, an `inputMode` host, or a
 * future switch to a text input can hand over something `Number()` cannot
 * parse. Emitting `NaN` would fail the server's `number` value-type check with
 * an opaque error; keeping the text lets the field-level validation speak.
 */
export const coerceNumericInput = (raw: string): number | string | null => {
  if (raw === '' || raw === null || raw === undefined) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
};

/** Display text for a selected option key. */
export const optionLabelFor = (
  definition: Pick<DemographicDefinition, 'options'>,
  optionKey: unknown,
): string => {
  const key = typeof optionKey === 'string' ? optionKey : String(optionKey ?? '');
  if (key.length === 0) return '';
  const match = (definition?.options || []).find((option) => option?.key === key);
  return match && typeof match.label === 'string' && match.label.trim().length > 0
    ? match.label
    : key;
};
