import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ARCHIVE_ORGANIZATION,
  CREATE_ORGANIZATION,
  OPERATIONS,
  ORGANIZATION_DEMOGRAPHIC_DEFINITIONS,
  RESTORE_ORGANIZATION,
  UPDATE_ORGANIZATION,
} from '../graphql';
import type {
  DemographicDefinitionsState,
  Organization,
  OrganizationArchiveResult,
  OrganizationCreateRequest,
  OrganizationCreateResult,
  OrganizationError,
  OrganizationRestoreResult,
} from '../types';
import { envelopeError, operationPayload, serverMessageOf } from '../utils';

export interface UseOrganizationAdminResult {
  /** True while any write is in flight. */
  saving: boolean;
  /**
   * The last write failure, as a translatable key plus the server's own text.
   * The component resolves it — the hook never renders a sentence.
   */
  error: OrganizationError | null;
  clearError: () => void;
  /**
   * Creates the organization, then applies the identity extras and the branding
   * decision that `CreateOrganizationInput` cannot carry.
   */
  create: (request: OrganizationCreateRequest) => Promise<OrganizationCreateResult | null>;
  update: (id: string, input: Record<string, any>) => Promise<Organization | null>;
  /** Archives one or more organizations. Partial failures are reported, not thrown. */
  archive: (ids: string[]) => Promise<OrganizationArchiveResult>;
  /** Returns the restored organization, or the failure that prevented it. */
  restore: (id: string) => Promise<OrganizationRestoreResult>;
}

/**
 * Owns every organization write.
 *
 * Design notes
 * ------------
 * - **Creation is two calls.** `createOrganization`'s GraphQL input exposes only
 *   `name` and `code` (plus `logo`/`legacyId`), while the wizard collects
 *   `tradingName`, `description` and a branding decision. Those are applied with
 *   one `updateOrganization` immediately after the create. If that follow-up
 *   fails the organization still exists, so the result carries a `warning`
 *   instead of pretending the create failed — otherwise the wizard would send
 *   the user back to a form for a record that is already in the list.
 * - **`theme: null` is the "start blank" branding step.** It clears the active
 *   theme pointer; the runtime then falls back to the client theme for
 *   "inherit". No theme is authored here — ORG-013 owns the editor.
 * - **Archive is a status change, never a delete.** The mutations are called one
 *   id at a time so one forbidden/archived-elsewhere row cannot fail the batch.
 */
export const useOrganizationAdmin = (reactory: any): UseOrganizationAdminResult => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<OrganizationError | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Convert a thrown mutation failure into the hook's error contract.
   *
   * A failure raised before the request left the client carries its own key
   * ("API unavailable"); anything else is the caller's operation-specific key.
   * The server's message, when there is one, travels alongside for display.
   */
  const toOrganizationError = useCallback(
    (caught: any, fallbackKey: OrganizationError['key']): OrganizationError => ({
      key: (caught && caught.organizationKey) || fallbackKey,
      serverMessage: serverMessageOf(caught),
    }),
    [],
  );

  /**
   * Execute a mutation and unwrap `data.<operationName>`.
   *
   * Throws for both failure shapes: a rejected call and a resolved envelope with
   * `errors`. Callers convert the throw into their own return contract.
   */
  const runMutation = useCallback(
    async (document: string, variables: Record<string, any>, operationName: string): Promise<any> => {
      if (!reactory || typeof reactory.graphqlMutation !== 'function') {
        // Tagged so callers can distinguish "no SDK" from a server rejection.
        const apiError = new Error('reactory-api-unavailable') as Error & { 
          organizationKey?: string;
        };
        apiError.organizationKey = 'reactory.organizations.error.apiUnavailable';
        throw apiError;
      }

      const result = await reactory.graphqlMutation(document, variables, {
        fetchPolicy: 'network-only',
      });

      const failure = envelopeError(result);
      if (failure) {
        const serverError = new Error(failure) as Error & { organizationKey?: string };
        serverError.organizationKey = 'reactory.organizations.error.saveFailed';
        throw serverError;
      }

      const payload = operationPayload(result, operationName);
      if (payload === null || payload === undefined) {
        const emptyError = new Error('reactory-empty-result') as Error & {
          organizationKey?: string;
        };
        emptyError.organizationKey = 'reactory.organizations.error.saveFailed';
        throw emptyError;
      }

      return payload;
    },
    [reactory],
  );

  const create = useCallback(
    async (request: OrganizationCreateRequest): Promise<OrganizationCreateResult | null> => {
      if (!request || !request.name || request.name.trim().length === 0) {
        setError({ key: 'reactory.organizations.wizard.field.nameRequired' });
        return null;
      }

      setSaving(true);
      setError(null);

      try {
        const createInput: Record<string, any> = { name: request.name.trim() };
        const code = (request.code || '').trim();
        if (code.length > 0) createInput.code = code;

        const created = (await runMutation(
          CREATE_ORGANIZATION,
          { input: createInput },
          OPERATIONS.createOrganization,
        )) as Organization;

        // Identity extras the create input cannot carry, plus the branding step.
        const followUpInput: Record<string, any> = {};
        const tradingName = (request.tradingName || '').trim();
        const description = (request.description || '').trim();
        if (tradingName.length > 0) followUpInput.tradingName = tradingName;
        if (description.length > 0) followUpInput.description = description;
        if ((request.branding || 'inherit') === 'blank') followUpInput.theme = null;

        if (Object.keys(followUpInput).length === 0 || !created || !created.id) {
          return { organization: created };
        }

        try {
          const updated = (await runMutation(
            UPDATE_ORGANIZATION,
            { id: created.id, input: followUpInput },
            OPERATIONS.updateOrganization,
          )) as Organization;

          return { organization: updated || created };
        } catch (caught: any) {
          return {
            organization: created,
            warning: toOrganizationError(caught, 'reactory.organizations.error.saveFailed'),
          };
        }
      } catch (caught: any) {
        if (mountedRef.current) {
          setError(toOrganizationError(caught, 'reactory.organizations.error.createFailed'));
        }
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [runMutation],
  );

  const update = useCallback(
    async (id: string, input: Record<string, any>): Promise<Organization | null> => {
      setSaving(true);
      setError(null);

      try {
        const updated = (await runMutation(
          UPDATE_ORGANIZATION,
          { id, input },
          OPERATIONS.updateOrganization,
        )) as Organization;
        return updated;
      } catch (caught: any) {
        if (mountedRef.current) {
          setError(toOrganizationError(caught, 'reactory.organizations.error.updateFailed'));
        }
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [runMutation],
  );

  const archive = useCallback(
    async (ids: string[]): Promise<OrganizationArchiveResult> => {
      const targets = (ids || []).filter(Boolean);
      const result: OrganizationArchiveResult = { succeeded: [], failed: [] };
      if (targets.length === 0) return result;

      setSaving(true);
      setError(null);

      try {
        const outcomes = await Promise.all(
          targets.map(async (id) => {
            try {
              await runMutation(ARCHIVE_ORGANIZATION, { id }, OPERATIONS.archiveOrganization);
              return { id, ok: true as const };
            } catch (caught: any) {
              return {
                id,
                ok: false as const,
                error: toOrganizationError(caught, 'reactory.organizations.error.archiveFailed'),
              };
            }
          }),
        );

        outcomes.forEach((outcome) => {
          if (outcome.ok) result.succeeded.push(outcome.id);
          else result.failed.push({ id: outcome.id, error: outcome.error });
        });

        if (result.succeeded.length === 0 && result.failed.length > 0 && mountedRef.current) {
          setError(result.failed[0].error);
        }

        return result;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [runMutation],
  );

  const restore = useCallback(
    async (id: string): Promise<OrganizationRestoreResult> => {
      setSaving(true);
      setError(null);

      try {
        const restored = (await runMutation(
          RESTORE_ORGANIZATION,
          { id },
          OPERATIONS.restoreOrganization,
        )) as Organization;
        return { organization: restored, error: null };
      } catch (caught: any) {
        // Returned as well as stored: the panel needs the message for its
        // notification without waiting for a re-render.
        const failure = toOrganizationError(caught, 'reactory.organizations.error.restoreFailed');
        if (mountedRef.current) setError(failure);
        return { organization: null, error: failure };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [runMutation, toOrganizationError],
  );

  return { saving, error, clearError, create, update, archive, restore };
};

/**
 * Decide whether a demographics failure means "the API is not in this build".
 *
 * ORG-030/ORG-031 add `OrganizationDemographicDefinitions`. Until that ships the
 * schema rejects the document, and that rejection must read as "configure
 * later", not as an error the user has to act on. Anything else is a real
 * failure and is reported as such.
 */
const classifyDefinitionsFailure = (message: string): DemographicDefinitionsState => {
  const schemaLevel =
    /cannot query field/i.test(message) ||
    /is not defined by type/i.test(message) ||
    /unknown (field|argument)/i.test(message) ||
    /cannot query/i.test(message) ||
    /validation error/i.test(message);

  if (schemaLevel) return { status: 'unavailable', reason: 'not-implemented', message };
  return { status: 'unavailable', reason: 'error', message };
};

/**
 * Guarded read of the organization's demographic definitions.
 *
 * This is the only place the not-yet-shipped query is referenced. The wizard
 * calls it with no organization id during creation, which resolves to
 * `no-organization` without touching the network; when an id is available the
 * call is attempted and a schema-level rejection degrades to `not-implemented`.
 */
export const useDemographicDefinitions = (
  reactory: any,
  organizationId?: string | null,
): DemographicDefinitionsState => {
  const [state, setState] = useState<DemographicDefinitionsState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;

    if (!organizationId) {
      setState({ status: 'unavailable', reason: 'no-organization' });
      return () => {
        cancelled = true;
      };
    }

    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setState({ status: 'unavailable', reason: 'not-implemented' });
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'loading' });

    void (async () => {
      try {
        const result = await reactory.graphqlQuery(
          ORGANIZATION_DEMOGRAPHIC_DEFINITIONS,
          { organizationId },
          { fetchPolicy: 'network-only' },
        );

        if (cancelled) return;

        const failure = envelopeError(result);
        if (failure) {
          setState(classifyDefinitionsFailure(failure));
          return;
        }

        const payload = operationPayload(result, OPERATIONS.organizationDemographicDefinitions);
        if (payload === null || payload === undefined) {
          setState({ status: 'unavailable', reason: 'not-implemented' });
          return;
        }

        setState({ status: 'available', definitions: Array.isArray(payload) ? payload : [] });
      } catch (caught: any) {
        if (cancelled) return;
        // The hook's state only carries a reason; the wizard supplies its own
        // translated copy for each reason, so nothing English leaks out here.
        setState(classifyDefinitionsFailure(serverMessageOf(caught) || ''));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reactory, organizationId]);

  return state;
};

export default useOrganizationAdmin;
