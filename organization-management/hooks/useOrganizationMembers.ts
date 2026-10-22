import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ADD_BUSINESS_UNIT_MEMBER,
  ADD_TEAM_MEMBER,
  DEACTIVATE_ORGANIZATION_MEMBER,
  INVITE_ORGANIZATION_MEMBER,
  MEMBER_PAGE_SIZE,
  OPERATIONS,
  ORGANIZATION_MEMBERS,
  ORGANIZATION_STRUCTURE_BUSINESS_UNITS,
  ORGANIZATION_STRUCTURE_TEAMS,
  REMOVE_BUSINESS_UNIT_MEMBER,
  REMOVE_ORGANIZATION_MEMBER,
  REMOVE_TEAM_MEMBER,
  SET_ORGANIZATION_MEMBER_ROLES,
  STRUCTURE_PAGE_SIZE,
} from '../graphql';
import type {
  Organization,
  OrganizationBusinessUnit,
  OrganizationError,
  OrganizationMember,
  OrganizationMemberAssignment,
  OrganizationMemberFilter,
  OrganizationMemberInviteInput,
  OrganizationMemberInviteOutcome,
  OrganizationMemberInviteResult,
  OrganizationMemberPage,
  OrganizationMemberPaging,
  OrganizationMemberWriteResult,
  OrganizationTeam,
} from '../types';
import { envelopeError, operationPayload, serverMessageOf } from '../utils';

/**
 * Owns the organization People surface (ORG-024).
 *
 * Every GraphQL document, variable shape, in-flight flag and error mapping for
 * the People tab lives here; the tab renders what it is given and never builds a
 * document.
 *
 * Design notes
 * ------------
 * - **Filtering and paging are the server's.** `OrganizationMemberFilter` is
 *   passed through unchanged, so `paging.total` describes the result set and not
 *   the loaded page. Any client-side filtering would make paging skip or repeat
 *   rows. Search is debounced (`searchDebounceMs`, default 300ms) because every
 *   keystroke would otherwise be a round trip. The tab relies on that default;
 *   a test that needs a deterministic query count uses fake timers rather than
 *   a production escape hatch.
 * - **A sequence guard, not a flag.** `useOrganizationBranding` established the
 *   pattern: an older response must never overwrite a newer one. The counter is
 *   incremented per read and both the success and failure paths bail when they
 *   are stale — the search box is exactly the case where responses can arrive
 *   out of order.
 * - **Assignment uses the business-unit/team mutations.** The member row carries
 *   `businessUnitId` and `teams`, but neither is writable: the server derives
 *   the unit from the membership and the teams from `Team.members`. Assigning
 *   therefore calls `addMemberToBusinessUnit` / `removeMemberFromBusinessUnit`
 *   (ORG-020) and `addMemberToTeam` / `removeMemberFromTeam` (ORG-021), diffing
 *   the member's current assignment against the requested one. No mutation is
 *   invented and no non-existent field is written.
 * - **Invites are sequential.** There is no bulk mutation, so a batch is one
 *   `inviteOrganizationMember` call per address, each with its own outcome. A
 *   duplicate or an invalid address must not discard the results around it, so
 *   the loop never throws and never uses `Promise.all`.
 * - **Write results carry their own failure.** Returning the error alongside the
 *   result lets the tab notify immediately after `await` instead of reading
 *   pre-render hook state.
 * - **`error` is the LIST error, never a write error.** Only a failed read sets
 *   it, because the tab renders it as a page-level banner. A rejected mutation
 *   would otherwise replace a perfectly good table with "the members could not be
 *   loaded"; write failures travel on the per-action / per-address result the
 *   component notifies from.
 */

export interface UseOrganizationMembersOptions {
  reactory: any;
  /** The organization the detail shell is showing. */
  organization: Organization;
  /** Set false to defer the initial read (tests, lazy hosts). */
  autoLoad?: boolean;
  /** Rows per page; defaults to `MEMBER_PAGE_SIZE`. */
  pageSize?: number;
  /**
   * Search debounce in milliseconds; defaults to 300.
   *
   * The tab does not override it. A test that needs a deterministic query count
   * uses fake timers instead of shortening the debounce, so the shipped
   * behaviour is the one under test.
   */
  searchDebounceMs?: number;
}

export interface UseOrganizationMembersResult {
  members: OrganizationMember[];
  paging: OrganizationMemberPaging;
  /** The committed filter, i.e. what the current page was read with. */
  filter: OrganizationMemberFilter;
  /** The raw search box value (debounced before it reaches `filter`). */
  searchInput: string;
  /** Business units, for the filter and the assignment dialog. */
  businessUnits: OrganizationBusinessUnit[];
  /** Teams, for the filter and the assignment dialog. */
  teams: OrganizationTeam[];
  loading: boolean;
  saving: boolean;
  /**
   * The **read** failure only, because the tab renders it as a page-level
   * banner. Write failures are returned by the write calls and reported through
   * `notify`; they are deliberately never stored here.
   */
  error: OrganizationError | null;
  clearError: () => void;
  /** Re-reads the current page with the current filter. */
  refreshMembers: () => Promise<void>;
  /** Update the search box; commits to the filter after the debounce. */
  setSearch: (value: string) => void;
  /** Patch any other filter; always resets to page 1. */
  setFilter: (patch: Partial<OrganizationMemberFilter>) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  /** Replace a member's roles (`setOrganizationMemberRoles`). */
  setMemberRoles: (userId: string, roles: string[]) => Promise<OrganizationMemberWriteResult>;
  /** Disable a membership without deleting it (`deactivateOrganizationMember`). */
  deactivateMember: (userId: string) => Promise<OrganizationMemberWriteResult>;
  /** Delete a membership (`removeOrganizationMember`). Destructive. */
  removeMember: (userId: string) => Promise<OrganizationMemberWriteResult>;
  /** Invite one address (`inviteOrganizationMember`). */
  inviteMember: (input: OrganizationMemberInviteInput) => Promise<OrganizationMemberInviteResult>;
  /**
   * Invite a pasted list, one address at a time, returning one outcome per
   * address. Never rejects: a row's failure is data, not an exception.
   */
  inviteMembers: (
    emails: string[],
    options?: { roles?: string[] | null; businessUnitId?: string | null },
  ) => Promise<OrganizationMemberInviteOutcome[]>;
  /** Apply a business-unit/team assignment through the ORG-020/021 mutations. */
  assignMember: (
    member: OrganizationMember,
    assignment: OrganizationMemberAssignment,
  ) => Promise<OrganizationMemberWriteResult>;
}

/** A thrown failure tagged with the catalogue key that should describe it. */
interface TaggedError extends Error {
  organizationKey?: OrganizationError['key'];
}

const taggedError = (message: string, key: OrganizationError['key']): TaggedError => {
  const error = new Error(message) as TaggedError;
  error.organizationKey = key;
  return error;
};

const LOAD_FAILED = 'reactory.organizations.error.membersLoadFailed' as const;
const SAVE_FAILED = 'reactory.organizations.error.memberSaveFailed' as const;
const INVITE_FAILED = 'reactory.organizations.error.memberInviteFailed' as const;
const ASSIGN_FAILED = 'reactory.organizations.error.memberAssignFailed' as const;

const emptyPaging = (page: number, pageSize: number): OrganizationMemberPaging => ({
  page,
  pageSize,
  total: 0,
  hasNext: false,
});

/** The default filter: the server's own default status, made explicit. */
export const DEFAULT_MEMBER_FILTER: OrganizationMemberFilter = {
  search: null,
  role: null,
  status: 'active',
  includeDeactivated: false,
  businessUnitId: null,
  teamId: null,
};

/**
 * Trim a role list and drop blanks, so `roles: ['']` never reaches the server.
 *
 * An empty result becomes `null`, not `[]`: `roles` is optional on
 * `inviteOrganizationMember`, and omitting it lets the server apply its own
 * default instead of the client asserting "no roles". (`setOrganizationMemberRoles`
 * is different — there `[]` means "clear the roles" — so it passes its array
 * through untouched.)
 */
export const normalizeRoles = (roles?: string[] | null): string[] | null => {
  if (!Array.isArray(roles)) return null;
  const normalized = roles.map((role) => `${role}`.trim()).filter((role) => role.length > 0);
  return normalized.length > 0 ? normalized : null;
};

/**
 * A pragmatic email check.
 *
 * The server is the authority on whether an address is acceptable; this only
 * keeps an obviously malformed line from being sent, so a pasted batch can
 * report "invalid" per row without a round trip.
 */
export const isInviteEmail = (value?: string | null): boolean =>
  /^[^\s@]+@[^\s@,]+\.[^\s@,]+$/.test(`${value || ''}`.trim());

/** Split a pasted block into addresses (newlines, commas, semicolons). */
export const parseInviteEmails = (value?: string | null): string[] => {
  const seen = new Set<string>();
  const emails: string[] = [];

  `${value || ''}`
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .forEach((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      emails.push(entry);
    });

  return emails;
};

/** Does the server's message describe an existing member / pending invite? */
export const isAlreadyMemberMessage = (message?: string | null): boolean =>
  /already|exists|duplicate|pending invitation/i.test(`${message || ''}`);

/** Build the `filter` variable, omitting empty values so the server defaults apply. */
export const memberFilterVariables = (
  filter: OrganizationMemberFilter,
): Record<string, any> | undefined => {
  const variables: Record<string, any> = {};

  const search = `${filter.search || ''}`.trim();
  if (search.length > 0) variables.search = search;
  if (filter.role) variables.role = filter.role;
  if (filter.status) variables.status = filter.status;
  if (filter.includeDeactivated === true) variables.includeDeactivated = true;
  if (filter.deactivatedOnly === true) variables.deactivatedOnly = true;
  if (filter.enabled === true || filter.enabled === false) variables.enabled = filter.enabled;
  if (filter.businessUnitId) variables.businessUnitId = filter.businessUnitId;
  if (filter.teamId) variables.teamId = filter.teamId;

  return Object.keys(variables).length > 0 ? variables : undefined;
};

/** Read `PagedOrganizationMembers.paging` without trusting every field. */
const readPaging = (
  payload: any,
  page: number,
  pageSize: number,
): OrganizationMemberPaging => {
  const total = Number(payload && payload.total);
  return {
    page: Number(payload && payload.page) > 0 ? Number(payload.page) : page,
    pageSize: Number(payload && payload.pageSize) > 0 ? Number(payload.pageSize) : pageSize,
    total: Number.isFinite(total) && total > 0 ? total : 0,
    hasNext: Boolean(payload && payload.hasNext === true),
  };
};

export const useOrganizationMembers = (
  options: UseOrganizationMembersOptions,
): UseOrganizationMembersResult => {
  const {
    reactory,
    organization,
    autoLoad = true,
    pageSize: initialPageSize = MEMBER_PAGE_SIZE,
    searchDebounceMs = 300,
  } = options || ({} as UseOrganizationMembersOptions);

  const organizationId = organization && organization.id ? `${organization.id}` : '';

  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [paging, setPaging] = useState<OrganizationMemberPaging>(() =>
    emptyPaging(1, initialPageSize),
  );
  const [page, setPageState] = useState<number>(1);
  const [pageSize, setPageSizeState] = useState<number>(initialPageSize);
  const [filter, setFilterState] = useState<OrganizationMemberFilter>({
    ...DEFAULT_MEMBER_FILTER,
  });
  const [searchInput, setSearchInputState] = useState<string>('');
  const [businessUnits, setBusinessUnits] = useState<OrganizationBusinessUnit[]>([]);
  const [teams, setTeams] = useState<OrganizationTeam[]>([]);
  const [loading, setLoading] = useState<boolean>(autoLoad && organizationId.length > 0);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<OrganizationError | null>(null);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const toOrganizationError = useCallback(
    (caught: any, fallbackKey: OrganizationError['key']): OrganizationError => ({
      key: (caught && caught.organizationKey) || fallbackKey,
      serverMessage: serverMessageOf(caught),
    }),
    [],
  );

  /* ---------------------------------------------------------------------- *
   * Read
   * ---------------------------------------------------------------------- */

  const read = useCallback(async (): Promise<void> => {
    if (!organizationId) {
      setMembers([]);
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

    const filterVariables = memberFilterVariables(filter);

    try {
      const result = await reactory.graphqlQuery(
        ORGANIZATION_MEMBERS,
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
        setError({ key: LOAD_FAILED, serverMessage: failure });
        return;
      }

      const payload = (operationPayload(result, OPERATIONS.organizationMembers) ||
        {}) as OrganizationMemberPage;

      setMembers(Array.isArray(payload.members) ? payload.members : []);
      setPaging(readPaging(payload.paging, page, pageSize));
    } catch (caught: any) {
      if (sequence !== sequenceRef.current || !mountedRef.current) return;
      setError({ key: LOAD_FAILED, serverMessage: serverMessageOf(caught) });
    } finally {
      if (sequence === sequenceRef.current && mountedRef.current) setLoading(false);
    }
  }, [filter, organizationId, page, pageSize, reactory]);

  useEffect(() => {
    if (!autoLoad) return;
    void read();
  }, [autoLoad, read]);

  /**
   * Load the assignment/filter options once (ORG-020/021 paged reads).
   *
   * The People tab cannot reach the Structure tab's hook, and these are the same
   * documents that hook uses, so the options stay one query each instead of a
   * second, subtly different source. A failure here only empties the options —
   * it never blocks the member list.
   */
  useEffect(() => {
    let cancelled = false;

    if (!organizationId || !reactory || typeof reactory.graphqlQuery !== 'function') {
      setBusinessUnits([]);
      setTeams([]);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const [unitsResult, teamsResult] = await Promise.all([
          reactory.graphqlQuery(
            ORGANIZATION_STRUCTURE_BUSINESS_UNITS,
            { organizationId, includeDeleted: false },
            { fetchPolicy: 'network-only' },
          ),
          reactory.graphqlQuery(
            ORGANIZATION_STRUCTURE_TEAMS,
            { organizationId },
            { fetchPolicy: 'network-only' },
          ),
        ]);

        if (cancelled) return;
        if (envelopeError(unitsResult) || envelopeError(teamsResult)) return;

        const unitPayload =
          operationPayload(unitsResult, OPERATIONS.organizationStructureBusinessUnits) || {};
        const teamPayload =
          operationPayload(teamsResult, OPERATIONS.organizationStructureTeams) || {};

        setBusinessUnits(
          Array.isArray(unitPayload.businessUnits) ? unitPayload.businessUnits : [],
        );
        setTeams(Array.isArray(teamPayload.teams) ? teamPayload.teams : []);
      } catch {
        // Options are a convenience; the list above is the contract.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, reactory]);

  /* ---------------------------------------------------------------------- *
   * Filter and paging
   * ---------------------------------------------------------------------- */

  const setPage = useCallback((next: number) => {
    setPageState(next > 0 ? next : 1);
  }, []);

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(next > 0 ? next : MEMBER_PAGE_SIZE);
    setPageState(1);
  }, []);

  const setSearch = useCallback((value: string) => {
    setSearchInputState(value);
  }, []);

  const setFilter = useCallback((patch: Partial<OrganizationMemberFilter>) => {
    setFilterState((previous) => ({ ...previous, ...patch }));
    // A different filter is a different result set, so the previous page number
    // would be arbitrary. Reset to the first page every time.
    setPageState(1);
    if (patch.search !== undefined) setSearchInputState(`${patch.search || ''}`);
  }, []);

  /**
   * Debounce the search box into the committed filter.
   *
   * The guard (`searchInput === filter.search`) is what stops the effect from
   * re-committing its own result: once the filter catches up, there is nothing
   * to schedule.
   */
  useEffect(() => {
    const committed = `${filter.search || ''}`;
    if (searchInput === committed) return undefined;

    const timer = setTimeout(
      () => {
        setFilterState((previous) => ({
          ...previous,
          search: searchInput.trim() || null,
        }));
        setPageState(1);
      },
      Math.max(0, searchDebounceMs),
    );

    return () => clearTimeout(timer);
  }, [filter.search, searchDebounceMs, searchInput]);

  /* ---------------------------------------------------------------------- *
   * Writes
   * ---------------------------------------------------------------------- */

  /**
   * Execute a mutation and unwrap `data.<field>`.
   *
   * Throws for both failure shapes the SDK produces (a rejection and a resolved
   * envelope with `errors`) so every caller shares one error path.
   */
  const runMutation = useCallback(
    async (
      document: string,
      variables: Record<string, any>,
      field: string,
      fallbackKey: OrganizationError['key'],
    ): Promise<any> => {
      if (!reactory || typeof reactory.graphqlMutation !== 'function') {
        throw taggedError(
          'reactory-api-unavailable',
          'reactory.organizations.error.apiUnavailable',
        );
      }

      const result = await reactory.graphqlMutation(document, variables, {
        fetchPolicy: 'network-only',
      });

      const failure = envelopeError(result);
      if (failure) throw taggedError(failure, fallbackKey);

      return operationPayload(result, field);
    },
    [reactory],
  );

  /** A membership mutation, which answers with the whole `Organization`. */
  const writeOrganization = useCallback(
    async (
      document: string,
      variables: Record<string, any>,
      field: string,
      fallbackKey: OrganizationError['key'],
    ): Promise<OrganizationMemberWriteResult> => {
      setSaving(true);

      try {
        const payload = await runMutation(document, variables, field, fallbackKey);
        if (!payload || !payload.id) {
          throw taggedError('reactory-empty-result', fallbackKey);
        }
        return { ok: true, error: null };
      } catch (caught: any) {
        // Deliberately not stored in `error`: a rejected mutation is not a failed
        // list read, and the tab renders `error` as a page-level banner. The
        // failure travels on the result so the caller can notify from it.
        return { ok: false, error: toOrganizationError(caught, fallbackKey) };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [runMutation, toOrganizationError],
  );

  const setMemberRoles = useCallback(
    (userId: string, roles: string[]) =>
      writeOrganization(
        SET_ORGANIZATION_MEMBER_ROLES,
        { id: organizationId, userId, roles: Array.isArray(roles) ? roles : [] },
        OPERATIONS.setOrganizationMemberRoles,
        SAVE_FAILED,
      ),
    [organizationId, writeOrganization],
  );

  const deactivateMember = useCallback(
    (userId: string) =>
      writeOrganization(
        DEACTIVATE_ORGANIZATION_MEMBER,
        { id: organizationId, userId },
        OPERATIONS.deactivateOrganizationMember,
        SAVE_FAILED,
      ),
    [organizationId, writeOrganization],
  );

  const removeMember = useCallback(
    (userId: string) =>
      writeOrganization(
        REMOVE_ORGANIZATION_MEMBER,
        { id: organizationId, userId },
        OPERATIONS.removeOrganizationMember,
        SAVE_FAILED,
      ),
    [organizationId, writeOrganization],
  );

  /**
   * Invite one address.
   *
   * An obviously malformed address is rejected locally (so a pasted batch can
   * report it without a round trip); everything else is the server's decision,
   * including the "already a member" rejection, which is surfaced verbatim.
   */
  const inviteMember = useCallback(
    async (input: OrganizationMemberInviteInput): Promise<OrganizationMemberInviteResult> => {
      const email = `${(input && input.email) || ''}`.trim();

      if (!isInviteEmail(email)) {
        return {
          member: null,
          error: { key: 'reactory.organizations.error.memberInviteInvalidEmail' },
        };
      }

      setSaving(true);

      try {
        const payload = await runMutation(
          INVITE_ORGANIZATION_MEMBER,
          {
            id: organizationId,
            email,
            roles: normalizeRoles(input.roles),
            businessUnitId: input.businessUnitId || null,
          },
          OPERATIONS.inviteOrganizationMember,
          INVITE_FAILED,
        );

        if (!payload) throw taggedError('reactory-empty-result', INVITE_FAILED);

        return { member: payload as OrganizationMember, error: null };
      } catch (caught: any) {
        // See `writeOrganization`: a rejected invite is reported per address by
        // the caller, never as a list-load banner.
        return { member: null, error: toOrganizationError(caught, INVITE_FAILED) };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [organizationId, runMutation, toOrganizationError],
  );

  /**
   * Invite a pasted list.
   *
   * Sequential on purpose: there is no bulk mutation, and `Promise.all` would
   * turn one rejection into a lost set of outcomes. Every address produces
   * exactly one row, in the order it was pasted.
   */
  const inviteMembers = useCallback(
    async (
      emails: string[],
      inviteOptions: { roles?: string[] | null; businessUnitId?: string | null } = {},
    ): Promise<OrganizationMemberInviteOutcome[]> => {
      const addresses = (Array.isArray(emails) ? emails : [])
        .map((email) => `${email || ''}`.trim())
        .filter((email, index, all) => email.length > 0 && all.indexOf(email) === index);

      const outcomes: OrganizationMemberInviteOutcome[] = [];

      for (const email of addresses) {
        if (!isInviteEmail(email)) {
          outcomes.push({ email, status: 'invalid-email', message: null });
          continue;
        }

        // One call per address; the result is captured, never thrown.
        const result = await inviteMember({
          email,
          roles: inviteOptions.roles,
          businessUnitId: inviteOptions.businessUnitId,
        });

        if (result.member) {
          outcomes.push({ email, status: 'invited', message: null, member: result.member });
          continue;
        }

        const message = (result.error && result.error.serverMessage) || null;
        outcomes.push({
          email,
          status: isAlreadyMemberMessage(message) ? 'already-member' : 'error',
          message,
        });
      }

      return outcomes;
    },
    [inviteMember],
  );

  /**
   * Apply a business-unit/team assignment.
   *
   * `businessUnitId` and `teams` are derived server-side, so the assignment is
   * expressed as calls to the ORG-020/021 mutations: leave the current unit and
   * join the target one, then reconcile the team set. Each step is applied even
   * if an earlier one failed, so a partially applied assignment is reported
   * rather than silently half-done.
   */
  const assignMember = useCallback(
    async (
      member: OrganizationMember,
      assignment: OrganizationMemberAssignment,
    ): Promise<OrganizationMemberWriteResult> => {
      const userId = `${(member && member.userId) || ''}`;

      if (!userId) {
        // A pending invitation has no user yet, so it cannot hold a unit or team.
        return { ok: false, error: { key: ASSIGN_FAILED } };
      }

      setSaving(true);

      const failures: OrganizationError[] = [];

      const apply = async (document: string, variables: Record<string, any>, field: string) => {
        try {
          const payload = await runMutation(document, variables, field, ASSIGN_FAILED);
          if (payload !== true) throw taggedError('reactory-unsuccessful-result', ASSIGN_FAILED);
        } catch (caught: any) {
          failures.push(toOrganizationError(caught, ASSIGN_FAILED));
        }
      };

      try {
        const currentUnit = member.businessUnitId ? `${member.businessUnitId}` : null;
        const targetUnit = assignment.businessUnitId ? `${assignment.businessUnitId}` : null;

        if (currentUnit !== targetUnit) {
          if (currentUnit) {
            await apply(
              REMOVE_BUSINESS_UNIT_MEMBER,
              { id: currentUnit, memberId: userId },
              OPERATIONS.removeBusinessUnitMember,
            );
          }
          if (targetUnit) {
            await apply(
              ADD_BUSINESS_UNIT_MEMBER,
              { id: targetUnit, memberId: userId },
              OPERATIONS.addBusinessUnitMember,
            );
          }
        }

        const currentTeams = new Set(
          (Array.isArray(member.teamIds) ? member.teamIds : [])
            .map((teamId) => `${teamId}`)
            .filter((teamId) => teamId.length > 0),
        );
        const targetTeams = new Set(
          (assignment.teamIds || []).map((teamId) => `${teamId}`).filter((id) => id.length > 0),
        );

        for (const teamId of currentTeams) {
          if (targetTeams.has(teamId)) continue;
          await apply(
            REMOVE_TEAM_MEMBER,
            { id: teamId, memberId: userId },
            OPERATIONS.removeTeamMember,
          );
        }

        for (const teamId of targetTeams) {
          if (currentTeams.has(teamId)) continue;
          await apply(ADD_TEAM_MEMBER, { id: teamId, memberId: userId }, OPERATIONS.addTeamMember);
        }

        if (failures.length > 0) {
          // Reported to the caller (which notifies), never as a list-load banner.
          return { ok: false, error: failures[0] };
        }

        return { ok: true, error: null };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [runMutation, toOrganizationError],
  );

  return {
    members,
    paging,
    filter,
    searchInput,
    businessUnits,
    teams,
    loading,
    saving,
    error,
    clearError,
    refreshMembers: read,
    setSearch,
    setFilter,
    setPage,
    setPageSize,
    setMemberRoles,
    deactivateMember,
    removeMember,
    inviteMember,
    inviteMembers,
    assignMember,
  };
};

export default useOrganizationMembers;
