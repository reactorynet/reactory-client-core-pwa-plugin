import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CORE_ORGANIZATIONS, OPERATIONS, ORGANIZATION_STATISTICS } from '../graphql';
import type {
  Organization,
  OrganizationError,
  OrganizationListRow,
  OrganizationLoadState,
  OrganizationPaging,
  OrganizationSort,
  OrganizationSortField,
  OrganizationStatistics,
  OrganizationStatusFilter,
} from '../types';
import {
  businessUnitCount,
  envelopeError,
  operationPayload,
  organizationStatus,
  serverMessageOf,
} from '../utils';

/** Debounce for the search box; long enough to avoid a request per keystroke. */
export const SEARCH_DEBOUNCE_MS = 300;

export const DEFAULT_PAGE_SIZE = 10;

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Compare two organizations for the requested column.
 *
 * Nulls sort last in both directions so "no code" rows do not collect at the
 * top of a descending sort, and `updatedAt` is compared as time rather than as
 * a formatted string.
 */
const compareValues = (left: any, right: any, direction: 'asc' | 'desc'): number => {
  const leftEmpty = left === undefined || left === null || left === '';
  const rightEmpty = right === undefined || right === null || right === '';

  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  let result: number;
  if (typeof left === 'number' && typeof right === 'number') {
    result = left - right;
  } else {
    result = `${left}`.toLowerCase().localeCompare(`${right}`.toLowerCase());
  }

  return direction === 'desc' ? -result : result;
};

/** Read the sortable value for a column. */
const sortValue = (organization: Organization, field: OrganizationSortField): any => {
  switch (field) {
    case 'businessUnits':
      return businessUnitCount(organization);
    case 'updatedAt':
      return organization.updatedAt ? new Date(organization.updatedAt).getTime() : null;
    case 'status':
      return organizationStatus(organization);
    case 'theme':
      return organization.theme || '';
    case 'code':
      return organization.code || '';
    case 'tradingName':
      return organization.tradingName || '';
    case 'name':
    default:
      return organization.name || '';
  }
};

/** Pure sort helper — exported so the ordering rules can be unit tested. */
export const sortOrganizations = (
  organizations: Organization[],
  sort: OrganizationSort,
): Organization[] => {
  const field = sort.field;
  const direction = sort.direction;
  return [...organizations].sort((left, right) =>
    compareValues(sortValue(left, field), sortValue(right, field), direction),
  );
};

export interface UseOrganizationListOptions {
  reactory: any;
  /** Default `active`: archived organizations are hidden until asked for. */
  initialStatusFilter?: OrganizationStatusFilter;
  initialPageSize?: number;
  initialSort?: OrganizationSort;
  /** Set false to defer the first load (used by tests and by lazy hosts). */
  autoLoad?: boolean;
}

export interface UseOrganizationListResult {
  /** The rows on the current page, with the counts the grid renders. */
  rows: OrganizationListRow[];
  loadState: OrganizationLoadState;
  /** True while a refresh runs over an already-populated list. */
  refreshing: boolean;
  /**
   * A translatable failure descriptor, not a rendered sentence: the panel
   * resolves `key` through `t()` and prefers `serverMessage` when the server
   * supplied one.
   */
  error: OrganizationError | null;
  paging: OrganizationPaging;
  /** Organizations in scope, before the search/status filter. */
  scopedCount: number;
  searchInput: string;
  setSearchInput: (value: string) => void;
  statusFilter: OrganizationStatusFilter;
  setStatusFilter: (value: OrganizationStatusFilter) => void;
  sort: OrganizationSort;
  toggleSort: (field: OrganizationSortField) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (pageSize: number) => void;
  /** Ids of the selected rows (across pages, pruned to the current result). */
  selection: string[];
  selectedRows: OrganizationListRow[];
  toggleSelection: (id: string, selected?: boolean) => void;
  togglePageSelection: (selected: boolean) => void;
  clearSelection: () => void;
  isPageSelected: boolean;
  isPageIndeterminate: boolean;
  statisticsFor: (id: string) => OrganizationStatistics | null;
  /** Re-reads the list and drops cached statistics. */
  refresh: () => Promise<void>;
  isLoading: boolean;
  isEmpty: boolean;
  hasNoMatches: boolean;
}

/**
 * Owns the organization list: query, variables, filtering, sorting, paging,
 * statistics and selection.
 *
 * Design notes
 * ------------
 * - **The scoped list is read with `CoreOrganizations`, not
 *   `CorePagedOrganizations`.** The paged query accepts only `search` and
 *   `paging`; it has no status parameter and does not exclude archived
 *   organizations. Since "archived is hidden by default and reachable through
 *   the status filter" is a requirement, the status filter and paging are
 *   applied here, over the fully-scoped set. Adding `status` to the paged query
 *   is a server change and is recorded as a follow-up rather than done here.
 * - **Search is applied locally across name, code and trading name.** The
 *   server's `search` argument matches `name` only; using it would make a code
 *   search silently return nothing.
 * - **Statistics are fetched per visible page, not per row of the whole set.**
 *   `OrganizationStatistics(id)` is a per-organization query, so loading it for
 *   every organization in scope would be an N+1 over the entire list. Only the
 *   page in view is hydrated, and failures leave the column empty rather than
 *   failing the list.
 * - **A monotonic sequence guards overlapping loads** so a slow response for an
 *   older search term cannot overwrite a newer one.
 */
export const useOrganizationList = (
  options: UseOrganizationListOptions,
): UseOrganizationListResult => {
  const {
    reactory,
    initialStatusFilter = 'active',
    initialPageSize = DEFAULT_PAGE_SIZE,
    initialSort = { field: 'name', direction: 'asc' },
    autoLoad = true,
  } = options || ({} as UseOrganizationListOptions);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [statistics, setStatistics] = useState<Record<string, OrganizationStatistics>>({});
  // Start in `loading` when the first fetch is automatic, otherwise the
  // "no organizations exist" empty state flashes before the effect runs.
  const [loadState, setLoadState] = useState<OrganizationLoadState>(autoLoad ? 'loading' : 'idle');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<OrganizationError | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrganizationStatusFilter>(initialStatusFilter);
  const [sort, setSort] = useState<OrganizationSort>(initialSort);
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [selection, setSelection] = useState<string[]>([]);

  const mountedRef = useRef(true);
  const sequenceRef = useRef(0);
  /** Statistics already requested, so a re-render does not re-query them. */
  const statisticsRequestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setError({ key: 'reactory.organizations.error.apiUnavailable' });
      setLoadState('error');
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setRefreshing(true);
    setLoadState((previous) => (previous === 'success' ? 'success' : 'loading'));

    try {
      const result = await reactory.graphqlQuery(
        CORE_ORGANIZATIONS,
        { search: null },
        { fetchPolicy: 'network-only' },
      );

      if (sequence !== sequenceRef.current || mountedRef.current === false) return;

      const failure = envelopeError(result);
      if (failure) {
        setError({ key: 'reactory.organizations.error.loadFailed', serverMessage: failure });
        setLoadState('error');
        return;
      }

      const payload = operationPayload(result, OPERATIONS.coreOrganizations);
      const list: Organization[] = Array.isArray(payload) ? payload : [];

      setOrganizations(list);
      setError(null);
      setLoadState('success');
      // Drop selections for organizations that no longer exist in scope.
      setSelection((previous) => previous.filter((id) => list.some((entry) => entry.id === id)));
    } catch (caught: any) {
      if (sequence !== sequenceRef.current || mountedRef.current === false) return;
      setError({
        key: 'reactory.organizations.error.loadFailed',
        serverMessage: serverMessageOf(caught),
      });
      setLoadState('error');
    } finally {
      if (sequence === sequenceRef.current && mountedRef.current !== false) {
        setRefreshing(false);
      }
    }
  }, [reactory]);

  useEffect(() => {
    if (!autoLoad) return;
    void load();
  }, [autoLoad, load]);

  // Debounce the search box.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch((searchInput || '').trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // A new filter/term/page size always starts at the first page.
  useEffect(() => {
    setPageState(1);
  }, [debouncedSearch, statusFilter, pageSize]);

  const filtered = useMemo(() => {
    const term = (debouncedSearch || '').toLowerCase();

    return organizations.filter((organization) => {
      if (statusFilter !== 'all' && organizationStatus(organization) !== statusFilter) {
        return false;
      }
      if (!term) return true;

      return [organization.name, organization.code, organization.tradingName]
        .filter((value) => typeof value === 'string' && value.length > 0)
        .some((value) => (value as string).toLowerCase().includes(term));
    });
  }, [organizations, debouncedSearch, statusFilter]);

  const sorted = useMemo(() => sortOrganizations(filtered, sort), [filtered, sort]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  const rows: OrganizationListRow[] = useMemo(
    () =>
      pageRows.map((organization) => ({
        ...organization,
        businessUnitCount: businessUnitCount(organization),
        members: statistics[organization.id] ? statistics[organization.id].members : null,
      })),
    [pageRows, statistics],
  );

  // Hydrate statistics for the visible page only.
  const pageIdsKey = pageRows.map((organization) => organization.id).join('|');

  useEffect(() => {
    if (!reactory || typeof reactory.graphqlQuery !== 'function') return;

    const missing = pageRows
      .map((organization) => organization.id)
      .filter((id) => Boolean(id) && statisticsRequestedRef.current.has(id) === false);

    if (missing.length === 0) return;

    missing.forEach((id) => statisticsRequestedRef.current.add(id));

    let cancelled = false;

    const read = async (id: string): Promise<{ id: string; statistics: OrganizationStatistics } | null> => {
      try {
        const result = await reactory.graphqlQuery(
          ORGANIZATION_STATISTICS,
          { id },
          { fetchPolicy: 'network-only' },
        );
        if (envelopeError(result)) return null;
        const payload = operationPayload(result, OPERATIONS.organizationStatistics);
        return payload ? { id, statistics: payload as OrganizationStatistics } : null;
      } catch (caught) {
        // Counts are a convenience; a failure here must not break the list.
        return null;
      }
    };

    void (async () => {
      const results = await Promise.all(missing.map(read));
      if (cancelled || mountedRef.current === false) return;

      setStatistics((previous) => {
        const next = { ...previous };
        results.forEach((entry) => {
          if (entry && entry.statistics) next[entry.id] = entry.statistics;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
    // `pageRows` is captured by identity; the key keeps the effect stable across
    // re-renders that produce the same page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdsKey, reactory]);

  const refresh = useCallback(async (): Promise<void> => {
    statisticsRequestedRef.current.clear();
    setStatistics({});
    await load();
  }, [load]);

  const setPage = useCallback(
    (nextPage: number) => {
      setPageState(Math.min(Math.max(1, nextPage), pageCount));
    },
    [pageCount],
  );

  const setPageSize = useCallback((nextPageSize: number) => {
    setPageSizeState(Math.max(1, nextPageSize));
  }, []);

  const setStatusFilterValue = useCallback((nextStatus: OrganizationStatusFilter) => {
    setStatusFilter(nextStatus);
    setSelection([]);
  }, []);

  const setSearchInputValue = useCallback((value: string) => {
    setSearchInput(value);
    setSelection([]);
  }, []);

  const toggleSort = useCallback((field: OrganizationSortField) => {
    setSort((previous) =>
      previous.field === field
        ? { field, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    );
  }, []);

  const toggleSelection = useCallback((id: string, selected?: boolean) => {
    setSelection((previous) => {
      const isSelected = previous.indexOf(id) >= 0;
      const nextSelected = selected === undefined ? !isSelected : selected;
      if (nextSelected && !isSelected) return [...previous, id];
      if (!nextSelected && isSelected) return previous.filter((entry) => entry !== id);
      return previous;
    });
  }, []);

  const pageIds = pageRows.map((organization) => organization.id);

  const togglePageSelection = useCallback(
    (selected: boolean) => {
      setSelection((previous) => {
        if (!selected) return previous.filter((id) => pageIds.indexOf(id) < 0);
        const additions = pageIds.filter((id) => previous.indexOf(id) < 0);
        return [...previous, ...additions];
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageIdsKey],
  );

  const clearSelection = useCallback(() => setSelection([]), []);

  // Selected rows are resolved against the whole filtered set, not just the
  // visible page: a selection survives paging, and the archive dialog names the
  // organizations it is about to change.
  const selectedRows = useMemo<OrganizationListRow[]>(() => {
    return selection
      .map((id) => sorted.find((organization) => organization.id === id))
      .filter((organization): organization is Organization => Boolean(organization))
      .map((organization) => ({
        ...organization,
        businessUnitCount: businessUnitCount(organization),
        members: statistics[organization.id] ? statistics[organization.id].members : null,
      }));
  }, [selection, sorted, statistics]);

  const selectedOnPage = pageIds.filter((id) => selection.indexOf(id) >= 0).length;

  return {
    rows,
    loadState,
    refreshing,
    error,
    paging: {
      page: safePage,
      pageSize,
      total,
      hasNext: safePage * pageSize < total,
    },
    scopedCount: organizations.length,
    searchInput,
    setSearchInput: setSearchInputValue,
    statusFilter,
    setStatusFilter: setStatusFilterValue,
    sort,
    toggleSort,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    selection,
    selectedRows,
    toggleSelection,
    togglePageSelection,
    clearSelection,
    isPageSelected: pageIds.length > 0 && selectedOnPage === pageIds.length,
    isPageIndeterminate: selectedOnPage > 0 && selectedOnPage < pageIds.length,
    statisticsFor: (id: string) => statistics[id] || null,
    refresh,
    isLoading: loadState === 'loading',
    isEmpty: loadState === 'success' && organizations.length === 0,
    hasNoMatches: loadState === 'success' && organizations.length > 0 && total === 0,
  };
};

export default useOrganizationList;
