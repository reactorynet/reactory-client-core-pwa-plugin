/**
 * Formatting, CSV export and CSV import helpers for the demographics values
 * pane (ORG-033).
 *
 * Kept free of React and MUI so the interesting parts — "is this value readable
 * as something other than JSON?", "does this CSV row validate?" — can be unit
 * tested directly. The components own presentation and persistence; this module
 * owns the translation between what the server stores and what an administrator
 * reads or pastes into a spreadsheet.
 *
 * Two honesty rules run through it:
 *
 *   - a multi-valued definition renders as a readable list (`English, French`),
 *     never as `["English","French"]`;
 *   - an import row is validated **before** anything is submitted, and an
 *     invalid row is reported with the reason rather than silently dropped —
 *     except that the row is never part of the bulk payload.
 */
import {
  formatDemographicDate,
  optionLabelFor,
  type DemographicDefinition,
} from '../demographic-form';
import { serialiseCsv } from './demographicCsv';
import type { OrganizationMessageKey } from './i18n';
import type {
  OrganizationDemographicValue,
  OrganizationDemographicValueInput,
  OrganizationMember,
  OrganizationTranslator,
} from './types';

/* ------------------------------------------------------------------------- *
 * Member directory
 * ------------------------------------------------------------------------- */

export interface DemographicMemberEntry {
  id: string;
  name: string;
  email: string;
}

/**
 * A best-effort `User` id → name/email index.
 *
 * `DemographicValue.user` is an id, so the table needs a way to show a person.
 * The directory is built from `OrganizationMembers` (the same read the People
 * tab uses) and is allowed to be empty: every lookup falls back to the id, and
 * no query failure is surfaced as a values failure.
 */
export interface DemographicMemberDirectory {
  byId: Record<string, DemographicMemberEntry>;
  byEmail: Record<string, string>;
}

const memberName = (member: OrganizationMember | null | undefined): string => {
  if (!member) return '';
  const first = `${member.user?.firstName || member.firstName || ''}`.trim();
  const last = `${member.user?.lastName || member.lastName || ''}`.trim();
  return `${first} ${last}`.trim();
};

const memberEmail = (member: OrganizationMember | null | undefined): string =>
  `${member?.user?.email || member?.email || ''}`.trim();

export const buildMemberDirectory = (
  members: OrganizationMember[] | null | undefined,
): DemographicMemberDirectory => {
  const byId: Record<string, DemographicMemberEntry> = {};
  const byEmail: Record<string, string> = {};

  (members || []).forEach((member) => {
    const id = `${member?.userId || member?.user?.id || member?.id || ''}`;
    if (!id) return;

    const entry: DemographicMemberEntry = { id, name: memberName(member), email: memberEmail(member) };
    byId[id] = entry;
    if (entry.email) byEmail[entry.email.toLowerCase()] = id;
  });

  return { byId, byEmail };
};

/**
 * Resolve whatever the administrator typed into a user id.
 *
 * An email is matched case-insensitively; anything else is treated as an id,
 * because the server rejects an invalid ObjectId with its own message and
 * guessing further would only hide that.
 */
export const resolveUserId = (
  directory: DemographicMemberDirectory | null | undefined,
  raw: string | null | undefined,
): string => {
  const value = `${raw || ''}`.trim();
  if (value.length === 0) return '';
  if (!directory) return value;

  // Both indexes are keyed predictably: ids verbatim, emails lower-cased.
  const lowered = value.toLowerCase();
  if (directory.byEmail[lowered]) return directory.byEmail[lowered];

  return value;
};

export interface DemographicUserLabel {
  name: string;
  email: string;
  label: string;
}

/** Display fields for a user id, falling back to the id and never to blank. */
export const describeUser = (
  t: OrganizationTranslator,
  directory: DemographicMemberDirectory | null | undefined,
  userId: string | null | undefined,
): DemographicUserLabel => {
  const id = `${userId || ''}`.trim();
  const entry = id && directory ? directory.byId[id] : undefined;

  const name = entry?.name || '';
  const email = entry?.email || '';
  const label = name || email || id || t('reactory.organizations.demographics.values.unknownUser');

  return { name, email, label };
};

/* ------------------------------------------------------------------------- *
 * Readable values
 * ------------------------------------------------------------------------- */

export interface FormatDemographicValueOptions {
  /** Text used for an absent value; defaults to the catalogue's em dash. */
  empty?: string;
}

/**
 * Render one stored value as text a person can read.
 *
 * `definition` supplies the options for `enum` / `multi-enum` and the
 * `multiValued` flag; when the definition has been deleted the `valueType`
 * snapshot is used instead, so an orphaned row still renders.
 */
export const formatDemographicValue = (
  t: OrganizationTranslator,
  definition: DemographicDefinition | null | undefined,
  value: unknown,
  valueType?: string | null,
  options: FormatDemographicValueOptions = {},
): string => {
  const empty = options.empty !== undefined ? options.empty : t('reactory.organizations.list.notSet');
  const type = `${definition?.valueType || valueType || ''}`.trim();
  const optionSource = definition || { options: [] };

  const formatScalar = (entry: unknown): string => {
    if (entry === null || entry === undefined || entry === '') return '';

    if (type === 'boolean') {
      return entry === true || `${entry}`.toLowerCase() === 'true'
        ? t('reactory.organizations.demographics.values.yes')
        : t('reactory.organizations.demographics.values.no');
    }

    if (type === 'date') return formatDemographicDate(entry);

    if (type === 'enum' || type === 'multi-enum') {
      return optionLabelFor(optionSource as DemographicDefinition, entry);
    }

    if (typeof entry === 'object') return JSON.stringify(entry);
    return `${entry}`;
  };

  if (value === null || value === undefined || value === '') return empty;

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => formatScalar(entry))
      .filter((entry) => entry.length > 0);

    // An unknown/older server type that hands us an array is still rendered as
    // a list rather than as JSON.
    return parts.length > 0 ? parts.join(', ') : empty;
  }

  const text = formatScalar(value);
  return text.length > 0 ? text : empty;
};

/* ------------------------------------------------------------------------- *
 * Filter variables
 * ------------------------------------------------------------------------- */

export interface DemographicValuesFilter {
  /** Definition key, as `DemographicValueFilter.key` expects it. */
  key?: string | null;
  /** `User` id, resolved from an email by the pane before it is committed. */
  user?: string | null;
}

/**
 * Build the `filter` variable, omitting empty fields so the server defaults
 * apply. Only the seven documented filter fields exist; there is no `search`.
 */
export const demographicValueFilterVariables = (
  filter: DemographicValuesFilter,
): Record<string, any> | undefined => {
  const variables: Record<string, any> = {};

  const key = `${filter?.key || ''}`.trim();
  if (key.length > 0) variables.key = key;

  const user = `${filter?.user || ''}`.trim();
  if (user.length > 0) variables.user = user;

  return Object.keys(variables).length > 0 ? variables : undefined;
};

/** Stable DOM/test id for one value row. */
export const demographicValueRowId = (
  value: Pick<OrganizationDemographicValue, 'key' | 'user'>,
  index: number,
): string => {
  const key = `${value?.key || 'value'}`;
  const user = `${value?.user || 'user'}`;
  return `${key}-${user || index}`;
};

/* ------------------------------------------------------------------------- *
 * CSV export
 * ------------------------------------------------------------------------- */

/** Stable column order of the exported file. */
export const DEMOGRAPHIC_CSV_COLUMNS = [
  'user',
  'userName',
  'userEmail',
  'key',
  'title',
  'value',
  'source',
  'verified',
  'updated',
] as const;

export interface BuildDemographicCsvOptions {
  t: OrganizationTranslator;
  values: OrganizationDemographicValue[];
  definitions: DemographicDefinition[];
  directory?: DemographicMemberDirectory | null;
  bom?: boolean;
}

export interface DemographicCsvExport {
  csv: string;
  rowCount: number;
}

const isoDate = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

/**
 * Build a CSV of the **loaded** values.
 *
 * The ticket's export is a client-side view of what is on screen: there is no
 * server export endpoint and paging through the whole result set would invent
 * one. The pane labels the button with the loaded row count for that reason.
 */
export const buildDemographicCsv = (
  options: BuildDemographicCsvOptions,
): DemographicCsvExport => {
  const { t, values, definitions, directory, bom = false } = options || ({} as BuildDemographicCsvOptions);

  const definitionByKey: Record<string, DemographicDefinition> = {};
  (definitions || []).forEach((definition) => {
    if (definition && definition.key) definitionByKey[definition.key] = definition;
  });

  const rows: unknown[][] = [[...DEMOGRAPHIC_CSV_COLUMNS]];

  (values || []).forEach((value) => {
    const definition = definitionByKey[`${value?.key || ''}`];
    const user = describeUser(t, directory, value?.user);

    rows.push([
      `${value?.user || ''}`,
      user.name,
      user.email,
      `${value?.key || ''}`,
      definition?.title || `${value?.key || ''}`,
      formatDemographicValue(t, definition, value?.value, value?.valueType, { empty: '' }),
      `${value?.source || ''}`,
      value?.verified === true
        ? t('reactory.organizations.demographics.values.yes')
        : t('reactory.organizations.demographics.values.no'),
      isoDate(value?.updatedAt || value?.createdAt),
    ]);
  });

  return {
    csv: serialiseCsv(rows, { bom, newline: '\r\n' }),
    rowCount: Math.max(0, rows.length - 1),
  };
};

/* ------------------------------------------------------------------------- *
 * CSV import
 * ------------------------------------------------------------------------- */

export const IMPORT_TARGET_IGNORE = '';
export const IMPORT_TARGET_USER = 'user';

export interface DemographicImportMappingRow {
  /** Column position in the header. */
  index: number;
  column: string;
  /** `''` = ignore, `'user'` = the user column, otherwise a definition key. */
  target: string;
}

const USER_HEADER_ALIASES = new Set([
  'user',
  'userid',
  'user id',
  'email',
  'e-mail',
  'member',
  'member id',
  'memberemail',
]);

/** Guess a mapping from the header row; the administrator can override it. */
export const inferImportMapping = (
  header: string[],
  definitions: DemographicDefinition[],
): DemographicImportMappingRow[] => {
  const byKey: Record<string, string> = {};
  const byTitle: Record<string, string> = {};

  (definitions || []).forEach((definition) => {
    if (!definition || !definition.key) return;
    byKey[definition.key.toLowerCase()] = definition.key;
    if (definition.title) byTitle[`${definition.title}`.trim().toLowerCase()] = definition.key;
  });

  return (header || []).map((column, index) => {
    const normalized = `${column || ''}`.trim().toLowerCase();

    if (USER_HEADER_ALIASES.has(normalized)) {
      return { index, column: `${column || ''}`, target: IMPORT_TARGET_USER };
    }

    if (byKey[normalized]) return { index, column: `${column || ''}`, target: byKey[normalized] };
    if (byTitle[normalized]) return { index, column: `${column || ''}`, target: byTitle[normalized] };

    return { index, column: `${column || ''}`, target: IMPORT_TARGET_IGNORE };
  });
};

export interface DemographicImportCell {
  key: string;
  title: string;
  raw: string;
  value: unknown;
}

export interface DemographicImportRow {
  /** 1-based data-row number, excluding the header. */
  rowNumber: number;
  userRaw: string;
  userId: string;
  values: DemographicImportCell[];
  valid: boolean;
  /** Translatable reason; the caller renders it through `t()`. */
  errorKey?: OrganizationMessageKey;
  /** Which definition the failure belongs to, when it is field-specific. */
  errorKeyOf?: string;
}

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const parseBoolean = (text: string): boolean | null => {
  const value = text.trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].indexOf(value) >= 0) return true;
  if (['false', 'no', 'n', '0'].indexOf(value) >= 0) return false;
  return null;
};

const splitMulti = (text: string): string[] =>
  text
    .split(/[|;]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

type CoerceResult =
  | { ok: true; value: unknown }
  | { ok: false; errorKey: OrganizationMessageKey };

/**
 * Coerce one CSV cell into the value the definition expects.
 *
 * The server remains the authority: `validateDemographicValue` runs again on
 * write and its field errors are surfaced. This pass exists so an obviously
 * wrong cell is reported in the preview instead of failing the whole batch.
 */
export const coerceImportCell = (
  definition: DemographicDefinition,
  raw: string,
): CoerceResult => {
  const text = `${raw ?? ''}`.trim();
  const type = `${definition?.valueType || 'string'}`;
  const multiValued = definition?.multiValued === true;

  const coerceScalar = (entry: string): CoerceResult => {
    if (type === 'number') {
      return NUMBER_PATTERN.test(entry)
        ? { ok: true, value: Number(entry) }
        : { ok: false, errorKey: 'reactory.organizations.demographics.values.csv.error.invalidNumber' };
    }

    if (type === 'boolean') {
      const parsed = parseBoolean(entry);
      return parsed === null
        ? { ok: false, errorKey: 'reactory.organizations.demographics.values.csv.error.invalidBoolean' }
        : { ok: true, value: parsed };
    }

    if (type === 'date') {
      const date = new Date(entry);
      return Number.isNaN(date.getTime())
        ? { ok: false, errorKey: 'reactory.organizations.demographics.values.csv.error.invalidDate' }
        : { ok: true, value: entry };
    }

    if (type === 'enum') {
      const options = definition.options || [];
      const lowered = entry.toLowerCase();
      const match = options.find(
        (option) =>
          `${option?.key || ''}`.toLowerCase() === lowered ||
          `${option?.label || ''}`.trim().toLowerCase() === lowered,
      );
      return match
        ? { ok: true, value: `${match.key}` }
        : { ok: false, errorKey: 'reactory.organizations.demographics.values.csv.error.invalidOption' };
    }

    if (type === 'object' || type === 'array') {
      try {
        const parsed = JSON.parse(entry);
        if (type === 'array' && !Array.isArray(parsed)) {
          return { ok: false, errorKey: 'reactory.organizations.demographics.values.csv.error.invalidJson' };
        }
        if (type === 'object' && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
          return { ok: false, errorKey: 'reactory.organizations.demographics.values.csv.error.invalidJson' };
        }
        return { ok: true, value: parsed };
      } catch {
        return { ok: false, errorKey: 'reactory.organizations.demographics.values.csv.error.invalidJson' };
      }
    }

    return { ok: true, value: entry };
  };

  if (type === 'object' && !multiValued) return coerceScalar(text);

  if (type === 'array' && !multiValued) return coerceScalar(text);

  if (type === 'multi-enum' || (type === 'reference' && definition?.reference?.multiple === true) || multiValued) {
    const parts = splitMulti(text);
    if (parts.length === 0) return { ok: true, value: [] };

    const output: unknown[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const result =
        type === 'multi-enum'
          ? coerceScalarForMultiEnum(definition, parts[index])
          : coerceScalar(parts[index]);

      if (result.ok === false) return result;
      output.push(result.value);
    }

    return { ok: true, value: output };
  }

  return coerceScalar(text);
};

const coerceScalarForMultiEnum = (definition: DemographicDefinition, entry: string): CoerceResult => {
  const options = definition.options || [];
  const lowered = entry.toLowerCase();
  const match = options.find(
    (option) =>
      `${option?.key || ''}`.toLowerCase() === lowered ||
      `${option?.label || ''}`.trim().toLowerCase() === lowered,
  );
  return match
    ? { ok: true, value: `${match.key}` }
    : { ok: false, errorKey: 'reactory.organizations.demographics.values.csv.error.invalidOption' };
};

export interface BuildImportPreviewOptions {
  rows: string[][];
  mapping: DemographicImportMappingRow[];
  definitions: DemographicDefinition[];
  directory?: DemographicMemberDirectory | null;
}

/**
 * Validate every CSV data row against the mapping, without writing anything.
 *
 * Rows are returned in file order so the preview can show a row number that
 * matches the spreadsheet. Invalid rows stay in the list — an administrator
 * needs to see *why* a row will not be imported — but `importRowToInputs` is
 * only called for the valid ones.
 */
export const buildImportPreview = (
  options: BuildImportPreviewOptions,
): DemographicImportRow[] => {
  const { rows, mapping, definitions, directory } = options || ({} as BuildImportPreviewOptions);

  const definitionByKey: Record<string, DemographicDefinition> = {};
  (definitions || []).forEach((definition) => {
    if (definition && definition.key) definitionByKey[definition.key] = definition;
  });

  const validMapping = (mapping || []).filter((entry) => entry && entry.target);
  const userColumn = validMapping.find((entry) => entry.target === IMPORT_TARGET_USER);
  const definitionColumns = validMapping.filter((entry) => entry.target !== IMPORT_TARGET_USER);

  const seen = new Set<string>();

  return (rows || []).map((row, index) => {
    const cells = Array.isArray(row) ? row : [];
    const userRaw = userColumn ? `${cells[userColumn.index] ?? ''}`.trim() : '';
    const userId = userColumn ? resolveUserId(directory, userRaw) : '';

    const values: DemographicImportCell[] = [];
    let failure: { key: OrganizationMessageKey; definitionKey?: string } | null = null;

    definitionColumns.forEach((column) => {
      if (failure) return;

      const definition = definitionByKey[column.target];
      if (!definition) {
        failure = {
          key: 'reactory.organizations.demographics.values.csv.error.unknownDefinition',
          definitionKey: column.target,
        };
        return;
      }

      const raw = `${cells[column.index] ?? ''}`.trim();
      if (raw.length === 0) return;

      const coerced = coerceImportCell(definition, raw);
      if (coerced.ok === false) {
        failure = { key: coerced.errorKey, definitionKey: definition.key };
        return;
      }

      values.push({ key: definition.key, title: definition.title || definition.key, raw, value: coerced.value });
    });

    const base = { rowNumber: index + 1, userRaw, userId, values };

    if (!userColumn) {
      return {
        ...base,
        valid: false,
        errorKey: 'reactory.organizations.demographics.values.csv.preview.missingUserColumn',
      };
    }

    if (failure) {
      return {
        ...base,
        valid: false,
        errorKey: failure.key,
        errorKeyOf: failure.definitionKey,
      };
    }

    if (userId.length === 0) {
      return {
        ...base,
        valid: false,
        errorKey: 'reactory.organizations.demographics.values.csv.error.unknownUser',
      };
    }

    if (directory && Object.keys(directory.byId).length > 0 && !directory.byId[userId] && !/^[0-9a-fA-F]{24}$/.test(userId)) {
      // A directory is available and neither an id nor an email matched.
      return {
        ...base,
        valid: false,
        errorKey: 'reactory.organizations.demographics.values.csv.error.unknownUser',
      };
    }

    if (values.length === 0) {
      return {
        ...base,
        valid: false,
        errorKey: 'reactory.organizations.demographics.values.csv.error.noValues',
      };
    }

    const fingerprints = values.map((value) => `${userId}::${value.key}`);
    if (fingerprints.some((fingerprint) => seen.has(fingerprint))) {
      return {
        ...base,
        valid: false,
        errorKey: 'reactory.organizations.demographics.values.csv.error.duplicate',
      };
    }
    fingerprints.forEach((fingerprint) => seen.add(fingerprint));

    return { ...base, valid: true };
  });
};

/** Turn one validated preview row into bulk-write payloads. */
export const importRowToInputs = (
  row: DemographicImportRow,
): OrganizationDemographicValueInput[] =>
  (row?.values || []).map((value) => ({
    user: row.userId,
    key: value.key,
    value: value.value,
    source: 'import',
  }));
