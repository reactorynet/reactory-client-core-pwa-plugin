import { useCallback, useEffect, useRef, useState } from 'react';
import { CORE_ORGANIZATION, OPERATIONS, ORGANIZATION_STATISTICS } from '../graphql';
import type {
  Organization,
  OrganizationError,
  OrganizationLoadState,
  OrganizationStatistics,
} from '../types';
import {
  envelopeError,
  operationPayload,
  organizationIdFromPath,
  serverMessageOf,
} from '../utils';

export interface UseOrganizationDetailOptions {
  reactory: any;
  /** Explicit id, e.g. a route argument. */
  organizationId?: string | null;
  /** Set false to defer the first load (tests, lazy hosts). */
  autoLoad?: boolean;
}

export interface UseOrganizationDetailResult {
  /** Null while loading, when the id is unknown, or when nothing matched. */
  organization: Organization | null;
  statistics: OrganizationStatistics | null;
  loadState: OrganizationLoadState;
  /** Translatable failure descriptor; the panel resolves it. */
  error: OrganizationError | null;
  isLoading: boolean;
  /** Loads (or re-loads) the organization and its counts. */
  refresh: () => Promise<void>;
}

/**
 * Resolve the id the detail route is showing.
 *
 * Route `args` are passed through by the router when configured, but not every
 * host wires them up, so the router's own location is the fallback.
 */
export const resolveOrganizationId = (
  reactory: any,
  explicitId?: string | null,
): string => {
  if (explicitId) return explicitId;
  const pathname = reactory && reactory.location ? reactory.location.pathname : '';
  return organizationIdFromPath(pathname);
};

/**
 * Owns the organization detail read.
 *
 * Extracted from the panel so the ticket's rule holds for every screen in this
 * folder: hooks own the query, the variables, loading and error state, and the
 * component only renders what it is given.
 *
 * Notes
 * -----
 * - **Two reads, one sequence guard.** `CoreOrganization` is required;
 *   `OrganizationStatistics` is supplementary, so a failed count query leaves
 *   the header intact rather than blanking the page. Both share the monotonic
 *   sequence so a slow response for a previous id cannot land.
 * - **`OrganizationStatistics` is only asked for when the organization exists.**
 *   The service 404s on an unknown id, which would otherwise add a second,
 *   misleading error to a perfectly good "not found" page.
 * - A missing id is a successful empty read, not an error: the route is simply
 *   incomplete, and the panel renders its not-found state.
 */
export const useOrganizationDetail = (
  options: UseOrganizationDetailOptions,
): UseOrganizationDetailResult => {
  const { reactory, organizationId, autoLoad = true } = options || {};

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [statistics, setStatistics] = useState<OrganizationStatistics | null>(null);
  const [loadState, setLoadState] = useState<OrganizationLoadState>(
    autoLoad ? 'loading' : 'idle',
  );
  const [error, setError] = useState<OrganizationError | null>(null);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const resolvedId = resolveOrganizationId(reactory, organizationId);

    if (!resolvedId) {
      setOrganization(null);
      setStatistics(null);
      setError(null);
      setLoadState('success');
      return;
    }

    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setError({ key: 'reactory.organizations.error.apiUnavailable' });
      setLoadState('error');
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setLoadState((previous) => (previous === 'success' ? 'success' : 'loading'));
    setError(null);

    try {
      const result = await reactory.graphqlQuery(
        CORE_ORGANIZATION,
        { id: resolvedId },
        { fetchPolicy: 'network-only' },
      );

      if (sequence !== sequenceRef.current || !mountedRef.current) return;

      const failure = envelopeError(result);
      if (failure) {
        setError({
          key: 'reactory.organizations.error.detailLoadFailed',
          serverMessage: failure,
        });
        setLoadState('error');
        return;
      }

      const payload = operationPayload(result, OPERATIONS.coreOrganization) as Organization | null;

      setOrganization(payload || null);
      setStatistics(null);
      setLoadState('success');

      if (!payload) return;

      try {
        const statsResult = await reactory.graphqlQuery(
          ORGANIZATION_STATISTICS,
          { id: resolvedId },
          { fetchPolicy: 'network-only' },
        );

        if (sequence !== sequenceRef.current || !mountedRef.current) return;
        if (envelopeError(statsResult)) return;

        setStatistics(
          (operationPayload(
            statsResult,
            OPERATIONS.organizationStatistics,
          ) as OrganizationStatistics) || null,
        );
      } catch (caught) {
        // Counts are supplementary; the identity header is still useful.
      }
    } catch (caught: any) {
      if (sequence !== sequenceRef.current || !mountedRef.current) return;
      setError({
        key: 'reactory.organizations.error.detailLoadFailed',
        serverMessage: serverMessageOf(caught),
      });
      setLoadState('error');
    }
  }, [reactory, organizationId]);

  useEffect(() => {
    if (!autoLoad) return;
    void load();
  }, [autoLoad, load]);

  return {
    organization,
    statistics,
    loadState,
    error,
    isLoading: loadState === 'loading',
    refresh: load,
  };
};

export default useOrganizationDetail;
