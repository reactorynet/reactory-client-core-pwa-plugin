/**
 * The definition *draft*: the editable shape behind the Demographics
 * configuration pane (ORG-031), plus every pure rule that governs it.
 *
 * The pane has three representations of the same definition:
 *
 *   1. `DemographicDefinition` — the wire shape (what GraphQL returns/sends).
 *   2. `DemographicDefinitionDraft` — the form shape. Everything is a string or
 *      a boolean so a half-typed field is representable: `schema` and
 *      `componentProps` are JSON *text* until they parse, and the user edits
 *      `componentPropsMap` as ordered rows rather than a raw object, because a
 *      map's key order is what makes the editor usable.
 *   3. `draftDefinition(draft)` — the preview shape handed to
 *      `demographic-form`'s renderer.
 *
 * Kept free of React and MUI so the rules are unit-testable and cannot drift
 * from the component, and free of GraphQL so the documents stay in
 * `./graphql`.
 *
 * Server contract mirrored here (see
 * `reactory-express-server/src/modules/reactory-core/services/DemographicsService.ts`):
 *   - `key` is normalised (trim + lowercase) and frozen after creation;
 *   - an `enum`/`multi-enum` definition needs at least one unique option key;
 *   - a `reference` definition needs one of the five reference models;
 *   - a `system` definition may not change its `valueType`.
 * The client validates first so the drawer can show the problem inline; the
 * server remains the authority.
 */
import {
  isDemographicValueType,
  isSafePropsMapPath,
  type DemographicDefinition,
  type DemographicOption,
} from '../demographic-form';
import type { OrganizationMessageKey } from './i18n';

/**
 * Categories the server accepts, mirroring `DEMOGRAPHIC_CATEGORIES` in
 * `models/demographics/DemographicDefinition.ts`. Deliberately duplicated
 * values, not invented ones: a category the server does not know is rejected on
 * save, so the picker must offer exactly this list.
 */
export const DEMOGRAPHIC_CATEGORIES = [
  'personal',
  'employment',
  'organizational',
  'compliance',
] as const;

export type DemographicCategoryValue = (typeof DEMOGRAPHIC_CATEGORIES)[number];

/** Models a `reference` definition may point at (`DEMOGRAPHIC_REFERENCE_MODELS`). */
export const DEMOGRAPHIC_REFERENCE_MODELS = [
  'BusinessUnit',
  'Team',
  'Region',
  'OperationalGroup',
  'User',
] as const;

export type DemographicReferenceModelValue = (typeof DEMOGRAPHIC_REFERENCE_MODELS)[number];

/** Value types that require an `options` list. */
export const DEMOGRAPHIC_OPTION_VALUE_TYPES = ['enum', 'multi-enum'] as const;

/** True for `enum` / `multi-enum`, the two types that need options. */
export const requiresOptions = (valueType: string | null | undefined): boolean =>
  (DEMOGRAPHIC_OPTION_VALUE_TYPES as readonly string[]).indexOf(`${valueType || ''}`) >= 0;

/** One option row. `id` keeps React keys stable while a row is being edited. */
export interface DemographicOptionRow {
  id: string;
  key: string;
  label: string;
  ordinal: number;
  deprecated: boolean;
}

/** One `componentPropsMap` entry: a dotted source path and a destination prop. */
export interface DemographicPropsMapRow {
  id: string;
  source: string;
  prop: string;
}

/**
 * The editable draft of one definition.
 *
 * `system` and `id` are read-only facts about the stored definition, not user
 * input: `system` decides which guards apply and `id` is what an update targets
 * (the key is immutable, so it cannot be the target).
 */
export interface DemographicDefinitionDraft {
  id: string | null;
  key: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  valueType: string;
  schemaText: string;
  options: DemographicOptionRow[];
  referenceModel: string;
  referenceMultiple: boolean;
  widgetFqn: string;
  widgetPropsText: string;
  widgetPropsMap: DemographicPropsMapRow[];
  required: boolean;
  multiValued: boolean;
  sensitive: boolean;
  searchable: boolean;
  enabled: boolean;
  ordinal: number;
  system: boolean;
}

/** Fields a validation message can attach to. */
export type DemographicDraftField =
  | 'key'
  | 'title'
  | 'valueType'
  | 'category'
  | 'schema'
  | 'options'
  | 'reference'
  | 'widgetProps'
  | 'widgetPropsMap'
  | 'ordinal';

/**
 * `field -> message key`.
 *
 * Keys rather than sentences: the drawer resolves each one through `t()`, which
 * is what keeps every visible string translatable even on the error path.
 */
export type DemographicDraftErrors = Partial<Record<DemographicDraftField, OrganizationMessageKey>>;

/** Raw JSON Schema `type` keywords the editor accepts. */
const SCHEMA_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];

/** Errors live in one place so a typo cannot silently produce a raw key. */
const MESSAGES = {
  keyRequired: 'reactory.organizations.demographics.error.keyRequired',
  keyInvalid: 'reactory.organizations.demographics.error.keyInvalid',
  titleRequired: 'reactory.organizations.demographics.error.titleRequired',
  valueTypeInvalid: 'reactory.organizations.demographics.error.valueTypeInvalid',
  ordinalInvalid: 'reactory.organizations.demographics.error.ordinalInvalid',
  schemaInvalidJson: 'reactory.organizations.demographics.error.schemaInvalidJson',
  schemaNotObject: 'reactory.organizations.demographics.error.schemaNotObject',
  schemaInvalidType: 'reactory.organizations.demographics.error.schemaInvalidType',
  schemaInvalidProperties: 'reactory.organizations.demographics.error.schemaInvalidProperties',
  schemaInvalidRequired: 'reactory.organizations.demographics.error.schemaInvalidRequired',
  schemaInvalidItems: 'reactory.organizations.demographics.error.schemaInvalidItems',
  schemaInvalidEnum: 'reactory.organizations.demographics.error.schemaInvalidEnum',
  optionsRequired: 'reactory.organizations.demographics.error.optionsRequired',
  optionKeyRequired: 'reactory.organizations.demographics.error.optionKeyRequired',
  optionKeyDuplicate: 'reactory.organizations.demographics.error.optionKeyDuplicate',
  referenceRequired: 'reactory.organizations.demographics.error.referenceRequired',
  widgetPropsInvalidJson: 'reactory.organizations.demographics.error.widgetPropsInvalidJson',
  widgetPropsNotObject: 'reactory.organizations.demographics.error.widgetPropsNotObject',
  propsMapSourceInvalid: 'reactory.organizations.demographics.error.propsMapSourceInvalid',
  propsMapPropInvalid: 'reactory.organizations.demographics.error.propsMapPropInvalid',
  propsMapDuplicateSource: 'reactory.organizations.demographics.error.propsMapDuplicateSource',
} as const satisfies Record<string, OrganizationMessageKey>;

let rowCounter = 0;

/** A stable row id. Not derived from user input, so renaming a key is safe. */
export const nextRowId = (prefix: string): string => {
  rowCounter += 1;
  return `${prefix}-${rowCounter}`;
};

/** The key the server will store: trimmed and lowercased. */
export const normaliseDemographicKey = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

/**
 * A key the server accepts after normalisation.
 *
 * The Mongoose schema lowercases `key`, so this is deliberately checked *after*
 * normalisation: typing `dateOfBirth` is fine (it stores as `dateofbirth`), but
 * a key with spaces or punctuation is not, because it also becomes a DOM id in
 * the form renderer.
 */
export const isValidDemographicKey = (value: unknown): boolean =>
  /^[a-z][a-z0-9_]*$/.test(normaliseDemographicKey(value));

const plainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const trimmedOrEmpty = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** Result of parsing a JSON-editor field. */
export interface JsonObjectParseResult<T = Record<string, any>> {
  value: T | null;
  error: OrganizationMessageKey | null;
}

/**
 * Parse a JSON object from an editor field.
 *
 * Empty text is *not* an error: it means "no schema" / "no props" and is sent
 * as `null` so the server clears the field. Anything that parses to a
 * non-object (an array, a scalar) is rejected, because both `schema` and
 * `componentProps` are objects on the wire.
 */
export const parseJsonObjectText = (
  text: string | null | undefined,
  messages: { invalidJson: OrganizationMessageKey; notObject: OrganizationMessageKey },
): JsonObjectParseResult => {
  const source = typeof text === 'string' ? text.trim() : '';
  if (source.length === 0) return { value: null, error: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { value: null, error: messages.invalidJson };
  }

  if (!plainObject(parsed)) return { value: null, error: messages.notObject };
  return { value: parsed as Record<string, any>, error: null };
};

/**
 * Parse and structurally validate a JSON Schema fragment.
 *
 * Only the keywords the form renderer and the server's ajv validation actually
 * read are checked (`type`, `properties`, `required`, `items`, `enum`). That is
 * enough to catch the mistakes an author makes — a stray comma, a `required`
 * list written as a string, `items` written as an array — without shipping a
 * JSON Schema meta-validator into the client bundle.
 */
export const parseSchemaText = (text: string | null | undefined): JsonObjectParseResult => {
  const parsed = parseJsonObjectText(text, {
    invalidJson: MESSAGES.schemaInvalidJson,
    notObject: MESSAGES.schemaNotObject,
  });
  if (parsed.error || !parsed.value) return parsed;

  const schema = parsed.value;

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const valid =
      types.length > 0 &&
      types.every(
        (entry: unknown) => typeof entry === 'string' && SCHEMA_TYPES.indexOf(entry) >= 0,
      );
    if (!valid) return { value: null, error: MESSAGES.schemaInvalidType };
  }

  if (schema.properties !== undefined && !plainObject(schema.properties)) {
    return { value: null, error: MESSAGES.schemaInvalidProperties };
  }

  if (
    schema.required !== undefined &&
    (!Array.isArray(schema.required) ||
      schema.required.some((entry: unknown) => typeof entry !== 'string'))
  ) {
    return { value: null, error: MESSAGES.schemaInvalidRequired };
  }

  if (schema.items !== undefined && !plainObject(schema.items)) {
    return { value: null, error: MESSAGES.schemaInvalidItems };
  }

  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    return { value: null, error: MESSAGES.schemaInvalidEnum };
  }

  return parsed;
};

/** Parse the `componentProps` editor. */
export const parseWidgetPropsText = (
  text: string | null | undefined,
): JsonObjectParseResult =>
  parseJsonObjectText(text, {
    invalidJson: MESSAGES.widgetPropsInvalidJson,
    notObject: MESSAGES.widgetPropsNotObject,
  });

/** Options as editor rows. */
export const optionRowsFromDefinition = (
  options?: DemographicOption[] | null,
): DemographicOptionRow[] =>
  (Array.isArray(options) ? options : []).map((option) => ({
    id: nextRowId('option'),
    key: `${option?.key ?? ''}`,
    label: `${option?.label ?? ''}`,
    ordinal: Number.isFinite(Number(option?.ordinal)) ? Number(option?.ordinal) : 0,
    deprecated: option?.deprecated === true,
  }));

/**
 * A `componentPropsMap` as ordered rows.
 *
 * `Object.keys` order is the authoring order the user typed, so the rows come
 * back in the same sequence they were saved in.
 */
export const propsMapRowsFromDefinition = (
  propsMap?: Record<string, string> | null,
): DemographicPropsMapRow[] =>
  plainObject(propsMap)
    ? Object.keys(propsMap).map((source) => ({
        id: nextRowId('map'),
        source,
        prop: `${propsMap[source] ?? ''}`,
      }))
    : [];

/** Rows back to the stored map shape, dropping blank rows. */
export const propsMapFromRows = (
  rows: DemographicPropsMapRow[],
): Record<string, string> =>
  (rows || []).reduce<Record<string, string>>((map, row) => {
    const source = trimmedOrEmpty(row?.source);
    const prop = trimmedOrEmpty(row?.prop);
    if (source.length > 0 && prop.length > 0) map[source] = prop;
    return map;
  }, {});

/** Rows back to the stored option shape, dropping rows without a key. */
export const optionsFromRows = (rows: DemographicOptionRow[]): DemographicOption[] =>
  (rows || [])
    .map((row, index) => ({
      key: normaliseDemographicKey(row?.key),
      label: trimmedOrEmpty(row?.label) || null,
      ordinal: Number.isFinite(Number(row?.ordinal)) ? Number(row?.ordinal) : index,
      deprecated: row?.deprecated === true,
    }))
    .filter((option) => option.key.length > 0);

const textFromJson = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

/** A blank draft for a new custom definition at the end of the list. */
export const emptyDraft = (ordinal = 0): DemographicDefinitionDraft => ({
  id: null,
  key: '',
  title: '',
  description: '',
  icon: '',
  category: DEMOGRAPHIC_CATEGORIES[0],
  valueType: 'string',
  schemaText: '',
  options: [],
  referenceModel: DEMOGRAPHIC_REFERENCE_MODELS[0],
  referenceMultiple: false,
  widgetFqn: '',
  widgetPropsText: '',
  widgetPropsMap: [],
  required: false,
  multiValued: false,
  sensitive: false,
  searchable: false,
  enabled: true,
  ordinal,
  system: false,
});

/** The editable draft for a stored definition. */
export const draftFromDefinition = (
  definition: DemographicDefinition | null | undefined,
): DemographicDefinitionDraft => {
  if (!definition) return emptyDraft();

  const valueType = `${definition.valueType || 'string'}`;

  return {
    id: definition.id ? `${definition.id}` : null,
    key: `${definition.key || ''}`,
    title: `${definition.title || ''}`,
    description: `${definition.description || ''}`,
    icon: `${definition.icon || ''}`,
    category: `${definition.category || DEMOGRAPHIC_CATEGORIES[0]}`,
    valueType,
    schemaText: textFromJson(definition.schema),
    options: optionRowsFromDefinition(definition.options),
    referenceModel: `${definition.reference?.model || DEMOGRAPHIC_REFERENCE_MODELS[0]}`,
    referenceMultiple: definition.reference?.multiple === true,
    widgetFqn: `${definition.widget?.componentFqn || ''}`,
    widgetPropsText: textFromJson(definition.widget?.componentProps),
    widgetPropsMap: propsMapRowsFromDefinition(definition.widget?.componentPropsMap),
    required: definition.required === true,
    multiValued: definition.multiValued === true,
    sensitive: definition.sensitive === true,
    searchable: definition.searchable === true,
    enabled: definition.enabled !== false,
    ordinal: Number.isFinite(Number(definition.ordinal)) ? Number(definition.ordinal) : 0,
    system: definition.system === true,
  };
};

/**
 * The definition the live preview renders.
 *
 * Three deliberate departures from the draft's literal values:
 *   - `enabled` is always true: an administrator must be able to preview a
 *     definition they are about to re-enable (and the renderer drops disabled
 *     definitions);
 *   - the key falls back to `draft` while the field is still empty, because the
 *     renderer skips keyless definitions and the preview must keep rendering;
 *   - the title falls back to the key, for the same reason.
 */
export const draftDefinition = (
  draft: DemographicDefinitionDraft,
): DemographicDefinition => {
  const key = normaliseDemographicKey(draft.key) || 'draft';
  const schema = parseSchemaText(draft.schemaText).value;
  const widgetProps = parseWidgetPropsText(draft.widgetPropsText).value;
  const widgetFqn = trimmedOrEmpty(draft.widgetFqn);

  return {
    // No `id`: this is a preview, never a stored record.
    key,
    title: trimmedOrEmpty(draft.title) || key,
    description: trimmedOrEmpty(draft.description) || null,
    icon: trimmedOrEmpty(draft.icon) || null,
    category: draft.category || null,
    valueType: draft.valueType,
    schema: schema ?? null,
    options: requiresOptions(draft.valueType) ? optionsFromRows(draft.options) : [],
    reference:
      draft.valueType === 'reference'
        ? { model: draft.referenceModel, multiple: draft.referenceMultiple }
        : null,
    widget: widgetFqn
      ? {
          componentFqn: widgetFqn,
          componentProps: widgetProps ?? null,
          componentPropsMap: propsMapFromRows(draft.widgetPropsMap),
        }
      : null,
    required: draft.required,
    multiValued: draft.multiValued,
    sensitive: draft.sensitive,
    searchable: draft.searchable,
    enabled: true,
    ordinal: draft.ordinal,
    system: draft.system,
  };
};

/** Validate one draft. Returns `field -> key`; an empty object means valid. */
export const validateDraft = (
  draft: DemographicDefinitionDraft,
  options: { creating: boolean },
): DemographicDraftErrors => {
  const errors: DemographicDraftErrors = {};
  const creating = options?.creating !== false;

  if (creating) {
    const key = normaliseDemographicKey(draft.key);
    if (key.length === 0) errors.key = MESSAGES.keyRequired;
    else if (!isValidDemographicKey(key)) errors.key = MESSAGES.keyInvalid;
  }

  if (trimmedOrEmpty(draft.title).length === 0) errors.title = MESSAGES.titleRequired;

  if (!isDemographicValueType(draft.valueType)) errors.valueType = MESSAGES.valueTypeInvalid;

  const schemaError = parseSchemaText(draft.schemaText).error;
  if (schemaError) errors.schema = schemaError;

  if (requiresOptions(draft.valueType)) {
    const seen = new Set<string>();
    let missingKey = false;
    let duplicate = false;

    (draft.options || []).forEach((row) => {
      const key = normaliseDemographicKey(row?.key);
      if (key.length === 0) {
        // A row with a label but no key is a real mistake; a wholly blank row is
        // just space the author has not filled in yet.
        if (trimmedOrEmpty(row?.label).length > 0) missingKey = true;
        return;
      }
      if (seen.has(key)) duplicate = true;
      seen.add(key);
    });

    if (seen.size === 0) errors.options = MESSAGES.optionsRequired;
    else if (duplicate) errors.options = MESSAGES.optionKeyDuplicate;
    else if (missingKey) errors.options = MESSAGES.optionKeyRequired;
  }

  if (
    draft.valueType === 'reference' &&
    (DEMOGRAPHIC_REFERENCE_MODELS as readonly string[]).indexOf(`${draft.referenceModel}`) < 0
  ) {
    errors.reference = MESSAGES.referenceRequired;
  }

  const widgetPropsError = parseWidgetPropsText(draft.widgetPropsText).error;
  if (widgetPropsError) errors.widgetProps = widgetPropsError;

  const seenSources = new Set<string>();
  let sourceInvalid = false;
  let propInvalid = false;
  let sourceDuplicate = false;

  (draft.widgetPropsMap || []).forEach((row) => {
    const source = trimmedOrEmpty(row?.source);
    const prop = trimmedOrEmpty(row?.prop);
    if (source.length === 0 && prop.length === 0) return;

    if (!isSafePropsMapPath(source)) sourceInvalid = true;
    else if (seenSources.has(source)) sourceDuplicate = true;
    else seenSources.add(source);

    if (!isSafePropsMapPath(prop)) propInvalid = true;
  });

  if (sourceDuplicate) errors.widgetPropsMap = MESSAGES.propsMapDuplicateSource;
  else if (sourceInvalid) errors.widgetPropsMap = MESSAGES.propsMapSourceInvalid;
  else if (propInvalid) errors.widgetPropsMap = MESSAGES.propsMapPropInvalid;

  const ordinal = Number(draft.ordinal);
  if (!Number.isFinite(ordinal) || ordinal < 0 || Math.floor(ordinal) !== ordinal) {
    errors.ordinal = MESSAGES.ordinalInvalid;
  }

  return errors;
};

/** True when validation reported at least one field error. */
export const draftHasErrors = (errors: DemographicDraftErrors): boolean =>
  Object.keys(errors || {}).length > 0;

/**
 * Compare a draft with the baseline it was opened from.
 *
 * The drawer reports unsaved changes from this comparison rather than from a
 * "field touched" flag: typing and undoing back to the stored value must not
 * leave the shell guarding a tab switch. Row ids are excluded — they are
 * generated per open and would otherwise make every draft look dirty.
 */
export const isDraftDirty = (
  draft: DemographicDefinitionDraft,
  baseline: DemographicDefinitionDraft,
): boolean => {
  const shape = (value: DemographicDefinitionDraft) =>
    JSON.stringify({
      ...value,
      options: (value.options || []).map((row) => ({
        key: row.key,
        label: row.label,
        ordinal: row.ordinal,
        deprecated: row.deprecated,
      })),
      widgetPropsMap: (value.widgetPropsMap || []).map((row) => ({
        source: row.source,
        prop: row.prop,
      })),
    });

  return shape(draft) !== shape(baseline);
};

/**
 * The `DemographicDefinitionInput` payload for a draft.
 *
 * Guards encoded here, not only in the UI:
 *   - `key` is sent **only** when creating. Including it on an update would be a
 *     request the server always refuses, and the ticket forbids it outright.
 *   - `valueType` is omitted for a `system` definition. The pane disables the
 *     control and explains why; omitting the field means even a tampered draft
 *     cannot attempt a type change the server would reject.
 *   - `options` / `reference` / `widget` are explicitly cleared (`[]` / `null`)
 *     when the draft no longer has them, so switching `enum` → `string` does not
 *     leave an orphaned option list behind.
 */
export const buildDefinitionInput = (
  draft: DemographicDefinitionDraft,
  options: { creating: boolean },
): Record<string, any> => {
  const creating = options?.creating !== false;

  const input: Record<string, any> = {
    title: trimmedOrEmpty(draft.title),
    description: trimmedOrEmpty(draft.description) || null,
    icon: trimmedOrEmpty(draft.icon) || null,
    category: draft.category || null,
    schema: parseSchemaText(draft.schemaText).value,
    options: requiresOptions(draft.valueType) ? optionsFromRows(draft.options) : [],
    reference:
      draft.valueType === 'reference'
        ? { model: draft.referenceModel, multiple: draft.referenceMultiple === true }
        : null,
    widget: trimmedOrEmpty(draft.widgetFqn)
      ? {
          componentFqn: trimmedOrEmpty(draft.widgetFqn),
          componentProps: parseWidgetPropsText(draft.widgetPropsText).value,
          componentPropsMap: propsMapFromRows(draft.widgetPropsMap),
        }
      : null,
    required: draft.required === true,
    multiValued: draft.multiValued === true,
    sensitive: draft.sensitive === true,
    searchable: draft.searchable === true,
    enabled: draft.enabled !== false,
    ordinal: Number.isFinite(Number(draft.ordinal)) ? Number(draft.ordinal) : 0,
  };

  if (creating) {
    input.key = normaliseDemographicKey(draft.key);
  } else {
    // `id` is the update target; `key` is frozen and must never be sent.
    if (draft.id) input.id = draft.id;
    if (!draft.system) input.valueType = draft.valueType;
  }

  return input;
};

/**
 * A single-field patch for the list's inline toggles.
 *
 * `OrganizationSaveDemographicDefinition` treats an omitted field as "leave it
 * unchanged", so a toggle must not send the whole definition: the round trip
 * would race a concurrent edit in the drawer. Only the identity (`id`, or `key`
 * when a legacy payload has no id) and the toggled field travel.
 */
export const patchDefinitionInput = (
  definition: DemographicDefinition,
  patch: Record<string, any>,
): Record<string, any> => {
  const target = definition?.id ? { id: `${definition.id}` } : { key: `${definition?.key || ''}` };
  return { ...target, ...patch };
};

/** Immutable move of one array entry; out-of-range indices are a no-op. */
export const moveItem = <T,>(items: T[], from: number, to: number): T[] => {
  const list = Array.isArray(items) ? items.slice() : [];
  if (from === to) return list;
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return list;
};

/**
 * The key order produced by dropping `sourceKey` on `targetKey`.
 *
 * Returns `null` when either key is unknown, so the caller can skip a request
 * instead of sending an order the server would have to reconcile.
 */
export const reorderKeys = (
  definitions: DemographicDefinition[],
  sourceKey: string,
  targetKey: string,
): string[] | null => {
  const keys = (definitions || []).map((definition) => `${definition?.key || ''}`);
  const from = keys.indexOf(sourceKey);
  const to = keys.indexOf(targetKey);
  if (from < 0 || to < 0) return null;
  return moveItem(keys, from, to);
};

/**
 * Merge server-returned definitions into the list we already hold.
 *
 * Used by `reorder`, which returns only the definitions named in the request.
 * Replacing the list with that response would drop definitions the caller did
 * not reorder, so entries are matched by key and the result is re-sorted by the
 * server's own ordinal.
 */
export const mergeDefinitions = (
  existing: DemographicDefinition[],
  incoming: DemographicDefinition[],
): DemographicDefinition[] => {
  const byKey = new Map<string, DemographicDefinition>();
  (existing || []).forEach((definition) => {
    if (definition?.key) byKey.set(`${definition.key}`, definition);
  });
  (incoming || []).forEach((definition) => {
    if (!definition?.key) return;
    const key = `${definition.key}`;
    byKey.set(key, { ...(byKey.get(key) || {}), ...definition });
  });

  return Array.from(byKey.values()).sort((a, b) => {
    const delta = Number(a?.ordinal ?? 0) - Number(b?.ordinal ?? 0);
    return delta !== 0 ? delta : `${a?.key || ''}`.localeCompare(`${b?.key || ''}`);
  });
};

/** The ordinal a new custom definition should take: one past the last. */
export const nextOrdinal = (definitions: DemographicDefinition[]): number =>
  (definitions || []).reduce(
    (highest, definition) => Math.max(highest, Number(definition?.ordinal ?? 0) + 1),
    0,
  );
