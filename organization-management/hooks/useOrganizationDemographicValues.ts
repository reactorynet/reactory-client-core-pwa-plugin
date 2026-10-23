import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OPERATIONS,
  ORGANIZATION_DEMOGRAPHIC_AGGREGATES,
  ORGANIZATION_DEMOGRAPHIC_VALUES,
  ORGANIZATION_BULK_SAVE_DEMOGRAPHIC_VALUES,
  ORGANIZATION_DELETE_DEMOGRAPHIC_VALUE,
  ORGANIZATION_MEMBERS,
  ORGANIZATION_SAVE_DEMOGRAPHIC_VALUE,
} from '../graphql';
import type { DemographicDefinition } from '../../demographic-form';
import {
  buildMemberDirectory,
  demographicValueFilterVariables,
  type DemographicMemberDirectory,
  type DemographicValuesFilter,
} from '../demographicValues';
import type {
  Organization,
  OrganizationDemographicAggregateReport,
  OrganizationDemographicBulkOutcome,
  OrganizationDemographicValue,
  OrganizationDemographicValueFilter,
  OrganizationDemographicValueInput,
  OrganizationDemographicValuePage,
  OrganizationDemographicValueWriteResult,
  OrganizationError,
  OrganizationFieldError,
  OrganizationPaging,
} from '../types';
import { envelopeError, operationPayload, serverMessageOf } from '../utils';

/**
 * Owns the organization's stored demographic **values** (ORG-033).
 *
 * The configuration pane's `useOrganizationDemographics` owns definitions and
 * writes nothing about values; this hook is the read/write half of the same tab
 * and is mounted only by the values view. Splitting them is what lets the tab
 * keep `canManage === false` honest: a read-only viewer never mounts this hook
 * with `autoLoad`, so neither `OrganizationDemographicValues` nor
 * `OrganizationDemographicAggregates` is ever requested (both are
 * administrator-only server-side).
 *
 * Design notes
 * ------------
 * - **Paging and filtering are the server's.** `DemographicValueFilter` has no
 *   `search` and no sort, so the pane filters on `key` / `user` and leaves the
 *   server's order alone. `paging` describes the result set; slicing the loaded
 *   page client-side would skip or repeat rows.
 * - **A read failure and a write failure are different states.** `error` means
 *   "the values could not be read" and renders as a banner. A refused write is
 *   returned by the call that issued it, with its `fieldErrors`, so the drawer
 *   can put each message under the right control.
 * - **Field-level errors survive the envelope.** The server reports them as
 *   GraphQL `extensions.fields` (`{ path: 'values[2].value', message }`), which
 *   `envelopeError` deliberately flattens away. They are collected before the
 *   failure is thrown, and mapped back to a row index for bulk submissions.
 * - **Bulk outcomes are per row.** The server validates the whole batch before
 *   writing, so today a rejected batch is all-or-nothing; the pane still reports
 *   one outcome per submitted row, matched on (user, key), so a partial response
 *   can never be mistaken for a fully successful save.
 * - **The member directory is decoration.** `DemographicValue.user` is an id;
 *   names come from `OrganizationMembers` and a failed lookup leaves the table
 *   showing ids. It never fails the values read.
 * - **Aggregates are best-effort too.** The completeness summary is a separate
 *   query with its own error state, because a thresholded report being
 *   unavailable must not take the values table down with it.
 */

export const DEMOGRAPHIC_VALUE_PAGE_SIZE = 25;
/** Page size used to load the member directory; the read is decoration only. */
export const DEMOGRAPHIC_MEMBER_LOOKUP_PAGE_SIZE = 500;

export interface UseOrganizationDemographicValuesOptions {
  reactory: any;
  organization: Organization;
  /** Definitions the tab already loaded; used to scope the aggregate report. */
  definitions: DemographicDefinition[];
  /** Set false to defer every read (used when `canManage === false`). */
  autoLoad?: boolean;
  pageSize?: number;
}

export interface OrganizationDemographicBulkResult {
  outcomes: OrganizationDemographicBulkOutcome[];
  values: OrganizationDemographicValue[];
  error: OrganizationError | null;
  fieldErrors: OrganizationFieldError[];
}

export interface UseOrganizationDemographicValuesResult {
  values: OrganizationDemographicValue[];
  paging: OrganizationPaging;
  /** The committed filter, i.e. what the current page was read with. */
  filter: DemographicValuesFilter;
  directory: DemographicMemberDirectory;
  aggregates: OrganizationDemographicAggregateReport | null;
  loading: boolean;
  aggregatesLoading: boolean;
  saving: boolean;
  error: OrganizationError | null;
  aggregatesError: OrganizationError | null;
  page: number;
  pageSize: number;
  /** Re-read the current page. */
  refreshValues: () => Promise<void>;
  /** Re-read the aggregate report. */
  refreshAggregates: () => Promise<void>;
  /** Re-read both; used after a successful mutation. */
  refresh: () => Promise<void>;
  /** Patch the filter; always resets to page 1. */
  setFilter: (patch: Partial<DemographicValuesFilter>) => void;
  clearFilter: () => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  /** Write one value (`OrganizationSaveDemographicValue`). */
  saveValue: (
    input: OrganizationDemographicValueInput,
  ) => Promise<OrganizationDemographicValueWriteResult>;
  /** Write several values (`OrganizationBulkSaveDemographicValues`). */
  bulkSaveValues: (
    inputs: OrganizationDemographicValueInput[],
  ) => Promise<OrganizationDemographicBulkResult>;
  /** Delete one value (`OrganizationDeleteDemographicValue`). */
  deleteValue: (input: {
    key: string;
    user: string;
  }) => Promise<{ ok: boolean; error: OrganizationError | null }>;
}

interface TaggedError extends Error {
  organizationKey?: OrganizationError['key'];
  fieldErrors?: OrganizationFieldError[];
}

const taggedError = (message: string, key: OrganizationError['key']): TaggedError => {
  const error = new Error(message) as TaggedError;
  error.organizationKey = key;
  return error;
};

const VALUES_LOAD_FAILED = 'reactory.organizations.error.valuesLoadFailed' as const;
const AGGREGATES_LOAD_FAILED = 'reactory.organizations.error.aggregatesLoadFailed' as const;
const SAVE_FAILED = 'reactory.organizations.error.valueSaveFailed' as const;
const DELETE_FAILED = 'reactory.organizations.error.valueDeleteFailed' as const;

const emptyPaging = (page: number, pageSize: number): OrganizationPaging => ({
  page,
  pageSize,
  total: 0,
  hasNext: false,
});

const readPaging = (payload: any, page: number, pageSize: number): OrganizationPaging => {
  const total = Number(payload && payload.total);
  return {
    page: Number(payload && payload.page) > 0 ? Number(payload.page) : page,
    pageSize: Number(payload && payload.pageSize) > 0 ? Number(payload.pageSize) : pageSize,
    total: Number.isFinite(total) && total > 0 ? total : 0,
    hasNext: Boolean(payload && payload.hasNext === true),
  };
};

/* ------------------------------------------------------------------------- *
 * Field errors
 * ------------------------------------------------------------------------- */

const isFieldError = (value: any): value is OrganizationFieldError =>
  Boolean(value) && typeof value.path === 'string' && typeof value.message === 'string';

/**
 * Collect `extensions.fields` entries from anything a GraphQL call produced.
 *
 * Handles all three shapes the SDK can hand back: a resolved envelope with
 * `errors`, an Apollo rejection with `graphQLErrors`, and an error that already
 * carries the fields on itself.
 */
export const collectFieldErrors = (source: any): OrganizationFieldError[] => {
  if (!source) return [];

  const collected: OrganizationFieldError[] = [];
  const push = (fields: any): void => {
    if (!Array.isArray(fields)) return;
    fields.forEach((field) => {
      if (isFieldError(field)) collected.push({ path: field.path, message: field.message });
    });
  };

  push(source.extensions && source.extensions.fields);
  push(source.fields);

  const envelopes: any[] = [];
  if (Array.isArray(source.errors)) envelopes.push(...source.errors);
  if (Array.isArray(source.graphQLErrors)) envelopes.push(...source.graphQLErrors);

  envelopes.forEach((entry) => {
    if (!entry) return;
    push(entry.extensions && entry.extensions.fields);
    push(entry.fields);
  });

  return collected;
};

/** Row index carried by a bulk field-error path (`values[2].value`). */
export const fieldErrorRowIndex = (path: string): number | null => {
  const match = /^values\[(\d+)\]/.exec(`${path || ''}`);
  return match ? Number(match[1]) : null;
};

const fingerprint = (input: { user?: string | null; key?: string | null }): string =>
  `${input?.user || ''}::${input?.key || ''}`;

/**
 * Match a bulk response back to the rows that were submitted.
 *
 * A row is `saved` only when the response contains a value for its (user, key)
 * pair. Everything else is `rejected` — including every row of a batch the
 * server refused as a whole — so a partial or empty response can never read as
 * success.
 */
export const buildBulkOutcomes = (
  inputs: OrganizationDemographicValueInput[],
  saved: OrganizationDemographicValue[],
  fieldErrors: OrganizationFieldError[],
  batchMessage?: string | null,
): OrganizationDemographicBulkOutcome[] => {
  const savedKeys = new Set(
    (saved || []).map((value) => fingerprint({ user: value?.user, key: value?.key })),
  );

  return (inputs || []).map((input, index) => {
    const errors = (fieldErrors || []).filter((error) => fieldErrorRowIndex(error.path) === index);
    const message = errors.length > 0
      ? errors.map((error) => error.message).join(' ')
      : batchMessage || null;

    return {
      index,
      user: `${input?.user || ''}`,
      key: `${input?.key || ''}`,
      status: errors.length === 0 && savedKeys.has(fingerprint(input)) ? 'saved' : 'rejected',
      message,
    };
  });
};

/* ------------------------------------------------------------------------- *
 * Hook
 * ------------------------------------------------------------------------- */

export const useOrganizationDemographicValues = (
  options: UseOrganizationDemographicValuesOptions,
): UseOrganizationDemographicValuesResult => {
  const {
    reactory,
    organization,
    definitions,
    autoLoad = true,
    pageSize: initialPageSize = DEMOGRAPHIC_VALUE_PAGE_SIZE,
  } = options || ({} as UseOrganizationDemographicValuesOptions);

  const organizationId = organization && organization.id ? `${organization.id}` : '';
  const definitionKeys = useMemo(
    () =>
      (definitions || [])
        .map((definition) => `${definition?.key || ''}`)
        .filter((key) => key.length > 0),
    [definitions],
  );
  const definitionKeysSignature = definitionKeys.join('|');
  const definitionKeysRef = useRef<string[]>(definitionKeys);
  definitionKeysRef.current = definitionKeys;

  const [values, setValues] = useState<OrganizationDemographicValue[]>([]);
  const [paging, setPaging] = useState<OrganizationPaging>(() =>
    emptyPaging(1, initialPageSize),
  );
  const [page, setPageState] = useState<number>(1);
  const [pageSize, setPageSizeState] = useState<number>(initialPageSize);
  const [filter, setFilterState] = useState<DemographicValuesFilter>({ key: null, user: null });
  const [directory, setDirectory] = useState<DemographicMemberDirectory>(() =>
    buildMemberDirectory([]),
  );
  const [aggregates, setAggregates] = useState<OrganizationDemographicAggregateReport | null>(null);
  const [loading, setLoading] = useState<boolean>(autoLoad && organizationId.length > 0);
  const [aggregatesLoading, setAggregatesLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<OrganizationError | null>(null);
  const [aggregatesError, setAggregatesError] = useState<OrganizationError | null>(null);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef(0);
  const aggregateSequenceRef = useRef(0);
  const directorySequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ---- reads ---- */

  const readDirectory = useCallback(async (): Promise<void> => {
    if (!organizationId) return;
    if (!reactory || typeof reactory.graphqlQuery !== 'function') return;

    const sequence = directorySequenceRef.current + 1;
    directorySequenceRef.current = sequence;

    try {
      const result = await reactory.graphqlQuery(
        ORGANIZATION_MEMBERS,
        {
          organizationId,
          filter: { includeDeactivated: true },
          paging: { page: 1, pageSize: DEMOGRAPHIC_MEMBER_LOOKUP_PAGE_SIZE },
        },
        { fetchPolicy: 'network-only' },
      );

      if (sequence !== directorySequenceRef.current || !mountedRef.current) return;
      if (envelopeError(result)) return;

      const payload = operationPayload(result, OPERATIONS.organizationMembers);
      if (mountedRef.current) {
        setDirectory(buildMemberDirectory(Array.isArray(payload?.members) ? payload.members : []));
      }
    } catch {
      // Names are decoration; ids remain a usable fallback.
    }
  }, [organizationId, reactory]);

  const readValues = useCallback(async (): Promise<void> => {
    if (!organizationId) {
      setValues([]);
      setPaging(emptyPaging(page, pageSize));
      setError(null);
      setLoading(false);
      return;
    }

    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setError({ key: 'reactory.organizations.error.apiUnavailable' });
      setLoading(false);
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setLoading(true);
    setError(null);

    const filterVariables = demographicValueFilterVariables(filter);

    try {
      const result = await reactory.graphqlQuery(
        ORGANIZATION_DEMOGRAPHIC_VALUES,
        {
          organizationId,
          ...(filterVariables ? { filter: filterVariables } : {}),
          paging: { page, pageSize },
        },
        { fetchPolicy: 'network-only' },
      );

      if (sequence !== sequenceRef.current || !mountedRef.current) return;

      const failure = envelopeError(result);
      if (failure) {
        setError({ key: VALUES_LOAD_FAILED, serverMessage: failure });
        return;
      }

      const payload = (operationPayload(result, OPERATIONS.organizationDemographicValues) ||
        {}) as OrganizationDemographicValuePage;

      setValues(Array.isArray(payload.values) ? payload.values : []);
      setPaging(readPaging(payload.paging, page, pageSize));
    } catch (caught: any) {
      if (sequence !== sequenceRef.current || !mountedRef.current) return;
      setError({ key: VALUES_LOAD_FAILED, serverMessage: serverMessageOf(caught) });
    } finally {
      if (sequence === sequenceRef.current && mountedRef.current) setLoading(false);
    }
  }, [filter, organizationId, page, pageSize, reactory]);

  const readAggregates = useCallback(async (): Promise<void> => {
    const keys = definitionKeysRef.current || [];
    if (!organizationId || keys.length === 0) {
      setAggregates(null);
      setAggregatesError(null);
      setAggregatesLoading(false);
      return;
    }

    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setAggregatesError({ key: 'reactory.organizations.error.apiUnavailable' });
      return;
    }

    const sequence = aggregateSequenceRef.current + 1;
    aggregateSequenceRef.current = sequence;

    setAggregatesLoading(true);
    setAggregatesError(null);

    try {
      const result = await reactory.graphqlQuery(
        ORGANIZATION_DEMOGRAPHIC_AGGREGATES,
        { organizationId, definitionKeys: keys },
        { fetchPolicy: 'network-only' },
      );

      if (sequence !== aggregateSequenceRef.current || !mountedRef.current) return;

      const failure = envelopeError(result);
      if (failure) {
        setAggregatesError({ key: AGGREGATES_LOAD_FAILED, serverMessage: failure });
        return;
      }

      const payload = operationPayload(result, OPERATIONS.organizationDemographicAggregates);
      setAggregates(payload && Array.isArray(payload.definitions) ? payload : null);
    } catch (caught: any) {
      if (sequence !== aggregateSequenceRef.current || !mountedRef.current) return;
      setAggregatesError({ key: AGGREGATES_LOAD_FAILED, serverMessage: serverMessageOf(caught) });
    } finally {
      if (sequence === aggregateSequenceRef.current && mountedRef.current) {
        setAggregatesLoading(false);
      }
    }
  }, [definitionKeysSignature, organizationId, reactory]);

  useEffect(() => {
    if (!autoLoad) return;
    void readValues();
  }, [autoLoad, readValues]);

  useEffect(() => {
    if (!autoLoad) return;
    void readAggregates();
  }, [autoLoad, readAggregates]);

  useEffect(() => {
    if (!autoLoad) return;
    void readDirectory();
  }, [autoLoad, readDirectory]);

  const refreshValues = useCallback(async (): Promise<void> => {
    await readValues();
  }, [readValues]);

  const refreshAggregates = useCallback(async (): Promise<void> => {
    await readAggregates();
  }, [readAggregates]);

  const refresh = useCallback(async (): Promise<void> => {
    await readValues();
    await readAggregates();
  }, [readAggregates, readValues]);

  /* ---- filter / paging ---- */

  const setFilter = useCallback((patch: Partial<DemographicValuesFilter>): void => {
    setFilterState((previous) => ({ ...previous, ...patch }));
    setPageState(1);
  }, []);

  const clearFilter = useCallback((): void => {
    setFilterState({ key: null, user: null });
    setPageState(1);
  }, []);

  const setPage = useCallback((next: number): void => {
    setPageState(Number(next) > 0 ? Number(next) : 1);
  }, []);

  const setPageSize = useCallback((next: number): void => {
    const size = Number(next) > 0 ? Number(next) : DEMOGRAPHIC_VALUE_PAGE_SIZE;
    setPageSizeState(size);
    setPageState(1);
  }, []);

  /* ---- writes ---- */

  const toOrganizationError = useCallback(
    (caught: any, fallbackKey: OrganizationError['key']): OrganizationError => ({
      key: (caught && caught.organizationKey) || fallbackKey,
      serverMessage: serverMessageOf(caught),
    }),
    [],
  );

  const runMutation = useCallback(
    async (
      document: string,
      variables: Record<string, any>,
      operationName: string,
      fallbackKey: OrganizationError['key'],
    ): Promise<{ payload: any; fieldErrors: OrganizationFieldError[] }> => {
      if (!reactory || typeof reactory.graphqlMutation !== 'function') {
        throw taggedError('', 'reactory.organizations.error.apiUnavailable');
      }

      const result = await reactory.graphqlMutation(document, variables, {
        fetchPolicy: 'network-only',
      });

      const fieldErrors = collectFieldErrors(result);
      const failure = envelopeError(result);
      if (failure) {
        const error = taggedError(failure, fallbackKey);
        error.fieldErrors = fieldErrors;
        throw error;
      }

      return { payload: operationPayload(result, operationName), fieldErrors };
    },
    [reactory],
  );

  const saveValue = useCallback(
    async (
      input: OrganizationDemographicValueInput,
    ): Promise<OrganizationDemographicValueWriteResult> => {
      setSaving(true);

      try {
        const { payload, fieldErrors } = await runMutation(
          ORGANIZATION_SAVE_DEMOGRAPHIC_VALUE,
          { organizationId, value: input },
          OPERATIONS.organizationSaveDemographicValue,
          SAVE_FAILED,
        );

        if (!payload) throw taggedError('', SAVE_FAILED);

        return { values: [payload as OrganizationDemographicValue], error: null, fieldErrors };
      } catch (caught: any) {
        return {
          values: [],
          error: toOrganizationError(caught, SAVE_FAILED),
          fieldErrors: collectFieldErrors(caught),
        };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [organizationId, runMutation, toOrganizationError],
  );

  const bulkSaveValues = useCallback(
    async (
      inputs: OrganizationDemographicValueInput[],
    ): Promise<OrganizationDemographicBulkResult> => {
      const rows = Array.isArray(inputs) ? inputs : [];
      setSaving(true);

      try {
        const { payload, fieldErrors } = await runMutation(
          ORGANIZATION_BULK_SAVE_DEMOGRAPHIC_VALUES,
          { organizationId, values: rows },
          OPERATIONS.organizationBulkSaveDemographicValues,
          SAVE_FAILED,
        );

        const saved = Array.isArray(payload) ? (payload as OrganizationDemographicValue[]) : [];
        return {
          outcomes: buildBulkOutcomes(rows, saved, fieldErrors),
          values: saved,
          error: null,
          fieldErrors,
        };
      } catch (caught: any) {
        const failure = toOrganizationError(caught, SAVE_FAILED);
        const fieldErrors = collectFieldErrors(caught);

        return {
          outcomes: buildBulkOutcomes(rows, [], fieldErrors, failure.serverMessage || null),
          values: [],
          error: failure,
          fieldErrors,
        };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [organizationId, runMutation, toOrganizationError],
  );

  const deleteValue = useCallback(
    async (input: { key: string; user: string }): Promise<{ ok: boolean; error: OrganizationError | null }> => {
      setSaving(true);

      try {
        const { payload } = await runMutation(
          ORGANIZATION_DELETE_DEMOGRAPHIC_VALUE,
          { organizationId, key: input.key, user: input.user },
          OPERATIONS.organizationDeleteDemographicValue,
          DELETE_FAILED,
        );

        if (payload !== true) {
          throw taggedError('', DELETE_FAILED);
        }

        return { ok: true, error: null };
      } catch (caught: any) {
        return { ok: false, error: toOrganizationError(caught, DELETE_FAILED) };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [organizationId, runMutation, toOrganizationError],
  );

  return {
    values,
    paging,
    filter,
    directory,
    aggregates,
    loading,
    aggregatesLoading,
    saving,
    error,
    aggregatesError,
    page,
    pageSize,
    refreshValues,
    refreshAggregates,
    refresh,
    setFilter,
    clearFilter,
    setPage,
    setPageSize,
    saveValue,
    bulkSaveValues,
    deleteValue,
  };
};

export default useOrganizationDemographicValues;
