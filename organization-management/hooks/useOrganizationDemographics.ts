import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OPERATIONS,
  ORGANIZATION_DELETE_DEMOGRAPHIC_DEFINITION,
  ORGANIZATION_DEMOGRAPHIC_DEFINITIONS,
  ORGANIZATION_DEMOGRAPHIC_VALUES,
  ORGANIZATION_REORDER_DEMOGRAPHIC_DEFINITIONS,
  ORGANIZATION_SAVE_DEMOGRAPHIC_DEFINITION,
  ORGANIZATION_SET_DEMOGRAPHIC_ENABLED,
} from '../graphql';
import type { DemographicDefinition } from '../../demographic-form';
import { mergeDefinitions } from '../demographicDraft';
import type { Organization, OrganizationError } from '../types';
import { envelopeError, operationPayload, serverMessageOf } from '../utils';

/**
 * Owns the organization's demographic-definition surface (ORG-031).
 *
 * Every document, variable shape, in-flight flag and error mapping for the
 * Demographics tab lives here; the tab renders what it is given and never builds
 * a document. This mirrors `useOrganizationBranding`, which is the convention
 * for a tab that owns its own read.
 *
 * Named `useOrganizationDemographics` rather than `useDemographicDefinitions`
 * because that name is already taken by the create wizard's availability guard
 * (`hooks/useOrganizationAdmin.ts`), which answers a different question ("does
 * this build have the API?"). Both are exported from the barrel; two hooks with
 * one name would collide there.
 *
 * Design notes
 * ------------
 * - **The mutation response is the truth.** Save / set-enabled / reorder all
 *   return the definitions the server now holds, and the hook keeps those.
 * - **A failed delete never removes the row.** The server refuses to delete a
 *   definition that still has values and says so in its message; the hook
 *   returns that failure and leaves the list untouched, so the optimistic
 *   removal the ticket forbids cannot happen here.
 * - **Write results carry their own failure.** Every mutator resolves with the
 *   `OrganizationError` alongside the value, so the tab can notify with the
 *   server's message straight after `await` instead of reading pre-render hook
 *   state.
 * - **A read failure and a write failure are different states.** `loadError`
 *   means "the definitions could not be read", and the pane renders it as a
 *   banner whose Retry re-reads. `writeError` means "the last write was
 *   refused", and belongs next to the write that failed. Sharing one state made
 *   every failed save appear as a load banner whose Retry re-read the
 *   definitions instead of retrying the write.
 * - **Usage counts are best-effort.** `DemographicDefinition` has no count
 *   field, so a count is one single-row value page per key. A failure leaves
 *   that key's count `null` (rendered as an em dash) and never surfaces as a
 *   load error — the pane is still fully usable without the numbers.
 */
export interface UseOrganizationDemographicsOptions {
  reactory: any;
  /** The organization the detail shell is showing. */
  organization: Organization;
  /** Set false to defer the initial read (tests, lazy hosts). */
  autoLoad?: boolean;
  /**
   * Load usage counts. `OrganizationDemographicValues` is
   * ORGANIZATION_ADMIN-only server-side, so a read-only viewer must not ask.
   */
  includeUsage?: boolean;
}

/** Result of a definition write: the accepted value, or the failure that blocked it. */
export interface OrganizationDemographicWriteResult<T> {
  value: T | null;
  error: OrganizationError | null;
}

/** Usage counts keyed by definition key; `null` means "could not be counted". */
export type DemographicUsageCounts = Record<string, number | null>;

export interface UseOrganizationDemographicsResult {
  /** Every definition the server returned, including disabled ones. */
  definitions: DemographicDefinition[];
  /** Stored-value counts per definition key. */
  usage: DemographicUsageCounts;
  /** True while the definitions read is in flight. */
  loading: boolean;
  /** True while the usage counts are being collected. */
  counting: boolean;
  /** True while a definition write is in flight. */
  saving: boolean;
  /** The last **read** failure, for the pane's banner. Never set by a write. */
  loadError: OrganizationError | null;
  /**
   * The last **write** failure, for the surface that issued the write. Cleared
   * at the start of the next write and by `clearWriteError`.
   */
  writeError: OrganizationError | null;
  /** Clears the write failure only; a read failure is cleared by a re-read. */
  clearWriteError: () => void;
  /** Re-reads the definitions (and their usage counts). */
  refreshDefinitions: () => Promise<void>;
  /** Create (no `id`) or update (with `id`) one definition. */
  saveDefinition: (
    input: Record<string, any>,
  ) => Promise<OrganizationDemographicWriteResult<DemographicDefinition>>;
  /** Soft-delete one definition. A refusal leaves the list untouched. */
  deleteDefinition: (
    key: string,
  ) => Promise<OrganizationDemographicWriteResult<boolean>>;
  /** Enable or disable one definition. */
  setEnabled: (
    key: string,
    enabled: boolean,
  ) => Promise<OrganizationDemographicWriteResult<DemographicDefinition>>;
  /** Persist a new ordinal order for the supplied keys. */
  reorder: (
    keys: string[],
  ) => Promise<OrganizationDemographicWriteResult<DemographicDefinition[]>>;
}

/**
 * Attach a translatable fallback key to an error we are about to throw.
 *
 * `message` is the *server's* text, and `serverMessageOf` shows it verbatim, so
 * an error raised on this side of the wire passes `''`: the translated key is
 * then the only thing rendered, and no internal token can leak into the UI.
 */
const organisationError = (message: string, key: OrganizationError['key']): Error => {
  const error = new Error(message) as Error & { organizationKey?: OrganizationError['key'] };
  error.organizationKey = key;
  return error;
};

export const useOrganizationDemographics = (
  options: UseOrganizationDemographicsOptions,
): UseOrganizationDemographicsResult => {
  const {
    reactory,
    organization,
    autoLoad = true,
    includeUsage = true,
  } = options || ({} as UseOrganizationDemographicsOptions);

  const organizationId = organization && organization.id ? `${organization.id}` : '';

  const [definitions, setDefinitions] = useState<DemographicDefinition[]>([]);
  const [usage, setUsage] = useState<DemographicUsageCounts>({});
  const [loading, setLoading] = useState<boolean>(autoLoad && organizationId.length > 0);
  const [counting, setCounting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<OrganizationError | null>(null);
  const [writeError, setWriteError] = useState<OrganizationError | null>(null);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef(0);
  const usageSequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearWriteError = useCallback(() => setWriteError(null), []);

  /** Convert a thrown failure into the hook's error contract. */
  const toOrganizationError = useCallback(
    (caught: any, fallbackKey: OrganizationError['key']): OrganizationError => ({
      key: (caught && caught.organizationKey) || fallbackKey,
      serverMessage: serverMessageOf(caught),
    }),
    [],
  );

  /**
   * Run a mutation and unwrap `data.<operationName>`.
   *
   * Both failure shapes the SDK produces are folded into one throw: a rejection
   * and a resolved envelope carrying `errors`.
   */
  const runMutation = useCallback(
    async (
      document: string,
      variables: Record<string, any>,
      operationName: string,
      fallbackKey: OrganizationError['key'],
    ): Promise<any> => {
      if (!reactory || typeof reactory.graphqlMutation !== 'function') {
        throw organisationError('', 'reactory.organizations.error.apiUnavailable');
      }

      const result = await reactory.graphqlMutation(document, variables, {
        fetchPolicy: 'network-only',
      });

      const failure = envelopeError(result);
      if (failure) throw organisationError(failure, fallbackKey);

      return operationPayload(result, operationName);
    },
    [reactory],
  );

  /**
   * Count the stored values of each definition.
   *
   * One single-row page per key, in parallel. `paging.total` is the count; the
   * values themselves are not needed. A rejected/permission-denied query leaves
   * that key `null` instead of failing the pane.
   */
  const loadUsageCounts = useCallback(
    async (keys: string[]): Promise<void> => {
      const wanted = (keys || []).filter((key) => typeof key === 'string' && key.length > 0);
      if (wanted.length === 0 || !includeUsage || !organizationId) return;

      if (!reactory || typeof reactory.graphqlQuery !== 'function') return;

      const sequence = usageSequenceRef.current + 1;
      usageSequenceRef.current = sequence;

      if (mountedRef.current) setCounting(true);

      try {
        const entries = await Promise.all(
          wanted.map(async (key): Promise<[string, number | null]> => {
            try {
              const result = await reactory.graphqlQuery(
                ORGANIZATION_DEMOGRAPHIC_VALUES,
                { organizationId, filter: { key }, paging: { page: 1, pageSize: 1 } },
                { fetchPolicy: 'network-only' },
              );

              if (envelopeError(result)) return [key, null];

              const payload = operationPayload(result, OPERATIONS.organizationDemographicValues);
              const total = Number(payload && payload.paging ? payload.paging.total : NaN);
              return [key, Number.isFinite(total) ? total : null];
            } catch {
              // A count is decoration; never let it fail the list.
              return [key, null];
            }
          }),
        );

        if (sequence !== usageSequenceRef.current || !mountedRef.current) return;

        setUsage((previous) => {
          const next: DemographicUsageCounts = { ...previous };
          entries.forEach(([key, total]) => {
            next[key] = total;
          });
          return next;
        });
      } finally {
        if (sequence === usageSequenceRef.current && mountedRef.current) setCounting(false);
      }
    },
    [includeUsage, organizationId, reactory],
  );

  const read = useCallback(async (): Promise<void> => {
    if (!organizationId) {
      setDefinitions([]);
      setUsage({});
      setLoadError(null);
      setLoading(false);
      return;
    }

    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setLoadError({ key: 'reactory.organizations.error.apiUnavailable' });
      setLoading(false);
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setLoading(true);
    setLoadError(null);

    try {
      const result = await reactory.graphqlQuery(
        ORGANIZATION_DEMOGRAPHIC_DEFINITIONS,
        { organizationId, includeDisabled: true },
        { fetchPolicy: 'network-only' },
      );

      if (sequence !== sequenceRef.current || !mountedRef.current) return;

      const failure = envelopeError(result);
      if (failure) {
        setLoadError({
          key: 'reactory.organizations.error.definitionsFailed',
          serverMessage: failure,
        });
        return;
      }

      const payload = operationPayload(
        result,
        OPERATIONS.organizationDemographicDefinitions,
      );

      const list: DemographicDefinition[] = Array.isArray(payload) ? payload : [];
      setDefinitions(list);

      // Deliberately not awaited: the list must render before the counts land.
      void loadUsageCounts(list.map((definition) => `${definition.key || ''}`));
    } catch (caught: any) {
      if (sequence !== sequenceRef.current || !mountedRef.current) return;
      setLoadError({
        key: 'reactory.organizations.error.definitionsFailed',
        serverMessage: serverMessageOf(caught),
      });
    } finally {
      if (sequence === sequenceRef.current && mountedRef.current) setLoading(false);
    }
  }, [loadUsageCounts, organizationId, reactory]);

  useEffect(() => {
    if (!autoLoad) return;
    void read();
  }, [autoLoad, read]);

  const write = useCallback(
    async <T,>(
      document: string,
      variables: Record<string, any>,
      operationName: string,
      fallbackKey: OrganizationError['key'],
      apply: (payload: any) => T,
    ): Promise<OrganizationDemographicWriteResult<T>> => {
      setSaving(true);
      // Only the write channel: a read failure stays on screen until a re-read
      // succeeds and must not be cleared by an unrelated save.
      setWriteError(null);

      try {
        const payload = await runMutation(document, variables, operationName, fallbackKey);
        return { value: apply(payload), error: null };
      } catch (caught: any) {
        const failure = toOrganizationError(caught, fallbackKey);
        if (mountedRef.current) setWriteError(failure);
        return { value: null, error: failure };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [runMutation, toOrganizationError],
  );

  const saveDefinition = useCallback(
    (input: Record<string, any>) =>
      write<DemographicDefinition>(
        ORGANIZATION_SAVE_DEMOGRAPHIC_DEFINITION,
        { organizationId, definition: input },
        OPERATIONS.organizationSaveDemographicDefinition,
        'reactory.organizations.demographics.saveFailed',
        (payload) => {
          const saved = payload as DemographicDefinition | null;
          if (!saved || !saved.key) {
            throw organisationError('', 'reactory.organizations.demographics.saveFailed');
          }
          if (mountedRef.current) {
            setDefinitions((previous) => mergeDefinitions(previous, [saved]));
          }
          return saved;
        },
      ),
    [organizationId, write],
  );

  const deleteDefinition = useCallback(
    (key: string) =>
      write<boolean>(
        ORGANIZATION_DELETE_DEMOGRAPHIC_DEFINITION,
        { organizationId, key },
        OPERATIONS.organizationDeleteDemographicDefinition,
        'reactory.organizations.demographics.delete.failed',
        (payload) => {
          if (payload !== true) {
            // The server answered but did not delete: keep the row.
            throw organisationError('', 'reactory.organizations.demographics.delete.failed');
          }
          if (mountedRef.current) {
            setDefinitions((previous) =>
              previous.filter((definition) => `${definition.key || ''}` !== `${key}`),
            );
            setUsage((previous) => {
              const next = { ...previous };
              delete next[key];
              return next;
            });
          }
          return true;
        },
      ),
    [organizationId, write],
  );

  const setEnabled = useCallback(
    (key: string, enabled: boolean) =>
      write<DemographicDefinition>(
        ORGANIZATION_SET_DEMOGRAPHIC_ENABLED,
        { organizationId, key, enabled },
        OPERATIONS.organizationSetDemographicEnabled,
        'reactory.organizations.demographics.enableFailed',
        (payload) => {
          const saved = payload as DemographicDefinition | null;
          if (!saved || !saved.key) {
            throw organisationError('', 'reactory.organizations.demographics.enableFailed');
          }
          if (mountedRef.current) {
            setDefinitions((previous) => mergeDefinitions(previous, [saved]));
          }
          return saved;
        },
      ),
    [organizationId, write],
  );

  const reorder = useCallback(
    (keys: string[]) =>
      write<DemographicDefinition[]>(
        ORGANIZATION_REORDER_DEMOGRAPHIC_DEFINITIONS,
        { organizationId, keys },
        OPERATIONS.organizationReorderDemographicDefinitions,
        'reactory.organizations.demographics.reorderFailed',
        (payload) => {
          const ordered: DemographicDefinition[] = Array.isArray(payload) ? payload : [];
          if (mountedRef.current) {
            setDefinitions((previous) => mergeDefinitions(previous, ordered));
          }
          return ordered;
        },
      ),
    [organizationId, write],
  );

  return {
    definitions,
    usage,
    loading,
    counting,
    saving,
    loadError,
    writeError,
    clearWriteError,
    refreshDefinitions: read,
    saveDefinition,
    deleteDefinition,
    setEnabled,
    reorder,
  };
};

export default useOrganizationDemographics;
