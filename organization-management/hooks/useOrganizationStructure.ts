import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ADD_BUSINESS_UNIT_MEMBER,
  ADD_TEAM_MEMBER,
  CREATE_BUSINESS_UNIT,
  CREATE_TEAM,
  DELETE_BUSINESS_UNIT,
  DELETE_TEAM,
  MOVE_TEAM_TO_BUSINESS_UNIT,
  OPERATIONS,
  ORGANIZATION_STRUCTURE_BUSINESS_UNITS,
  ORGANIZATION_STRUCTURE_TEAMS,
  REMOVE_BUSINESS_UNIT_MEMBER,
  REMOVE_TEAM_MEMBER,
  RESTORE_BUSINESS_UNIT,
  UPDATE_BUSINESS_UNIT,
  UPDATE_TEAM,
} from '../graphql';
import type {
  Organization,
  OrganizationBusinessUnit,
  OrganizationBusinessUnitCreateInput,
  OrganizationBusinessUnitUpdateInput,
  OrganizationError,
  OrganizationStructureFlagResult,
  OrganizationStructureWriteResult,
  OrganizationTeam,
  OrganizationTeamCreateInput,
  OrganizationTeamUpdateInput,
} from '../types';
import { envelopeError, operationPayload, serverMessageOf } from '../utils';

/**
 * Owns the organization structure surface (ORG-022).
 *
 * Every GraphQL document, variable shape, in-flight flag and error mapping for
 * the Structure tab lives here; the tab renders what it is given and never
 * builds a document.
 *
 * Design notes
 * ------------
 * - **Two reads, one sequence.** The hierarchy is assembled from two flat
 *   queries (business units and teams) fetched together. A single sequence
 *   counter guards the pair, so an older response — for example the one still
 *   in flight when the administrator flips "show deleted" — can never overwrite
 *   the newer result, in whole or in half.
 * - **Deletes are soft, and the filter says so.** `pagedBusinessUnits` excludes
 *   soft-deleted units unless `filter.includeDeleted` is set; that server flag
 *   is what `includeDeleted` maps to. Teams have no such flag (the paged team
 *   query always excludes deleted teams), so no client-side guess is made.
 * - **Moving a team is its own mutation.** `moveTeamToBusinessUnit` is the only
 *   path that changes a team's unit; `updateTeam` never receives a
 *   `businessUnit` field. That keeps the server's cross-organization guard in
 *   the loop instead of relying on the client to have the right ids.
 * - **Write results carry their own failure.** Returning the error alongside
 *   the record means the tab can notify with the server's message immediately
 *   after `await` instead of reading pre-render hook state.
 */

export interface UseOrganizationStructureOptions {
  reactory: any;
  /** The organization the detail shell is showing. */
  organization: Organization;
  /** Set false to defer the initial read (tests, lazy hosts). */
  autoLoad?: boolean;
}

export interface UseOrganizationStructureResult {
  businessUnits: OrganizationBusinessUnit[];
  teams: OrganizationTeam[];
  /** True when soft-deleted business units are included in the read. */
  includeDeleted: boolean;
  /** True while the structure read is in flight. */
  loading: boolean;
  /** True while a write is in flight. */
  saving: boolean;
  /** Last read failure, as a translatable key plus the server's own text. */
  error: OrganizationError | null;
  clearError: () => void;
  /** Re-reads both collections. */
  refreshStructure: () => Promise<void>;
  /** Toggle soft-deleted business units; triggers a fresh read. */
  setIncludeDeleted: (includeDeleted: boolean) => void;
  createBusinessUnit: (
    input: OrganizationBusinessUnitCreateInput,
  ) => Promise<OrganizationStructureWriteResult<OrganizationBusinessUnit>>;
  updateBusinessUnit: (
    id: string,
    input: OrganizationBusinessUnitUpdateInput,
  ) => Promise<OrganizationStructureWriteResult<OrganizationBusinessUnit>>;
  deleteBusinessUnit: (
    id: string,
  ) => Promise<OrganizationStructureWriteResult<OrganizationBusinessUnit>>;
  restoreBusinessUnit: (
    id: string,
  ) => Promise<OrganizationStructureWriteResult<OrganizationBusinessUnit>>;
  addBusinessUnitMember: (id: string, memberId: string) => Promise<OrganizationStructureFlagResult>;
  removeBusinessUnitMember: (
    id: string,
    memberId: string,
  ) => Promise<OrganizationStructureFlagResult>;
  createTeam: (
    input: OrganizationTeamCreateInput,
  ) => Promise<OrganizationStructureWriteResult<OrganizationTeam>>;
  updateTeam: (
    id: string,
    input: OrganizationTeamUpdateInput,
  ) => Promise<OrganizationStructureWriteResult<OrganizationTeam>>;
  moveTeamToBusinessUnit: (
    teamId: string,
    businessUnitId: string,
  ) => Promise<OrganizationStructureWriteResult<OrganizationTeam>>;
  deleteTeam: (id: string) => Promise<OrganizationStructureFlagResult>;
  addTeamMember: (id: string, memberId: string) => Promise<OrganizationStructureFlagResult>;
  removeTeamMember: (id: string, memberId: string) => Promise<OrganizationStructureFlagResult>;
}

/** A thrown failure tagged with the catalogue key that should describe it. */
interface TaggedError extends Error {
  organizationKey?: OrganizationError['key'];
}

const taggedError = (
  message: string,
  key: OrganizationError['key'],
): TaggedError => {
  const error = new Error(message) as TaggedError;
  error.organizationKey = key;
  return error;
};

export const useOrganizationStructure = (
  options: UseOrganizationStructureOptions,
): UseOrganizationStructureResult => {
  const { reactory, organization, autoLoad = true } =
    options || ({} as UseOrganizationStructureOptions);

  const organizationId = organization && organization.id ? `${organization.id}` : '';

  const [businessUnits, setBusinessUnits] = useState<OrganizationBusinessUnit[]>([]);
  const [teams, setTeams] = useState<OrganizationTeam[]>([]);
  const [includeDeleted, setIncludeDeletedState] = useState<boolean>(false);
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

  const setIncludeDeleted = useCallback((value: boolean) => {
    setIncludeDeletedState(value === true);
  }, []);

  /** Convert a thrown failure into the hook's error contract. */
  const toOrganizationError = useCallback(
    (caught: any, fallbackKey: OrganizationError['key']): OrganizationError => ({
      key: (caught && caught.organizationKey) || fallbackKey,
      serverMessage: serverMessageOf(caught),
    }),
    [],
  );

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
      if (failure) {
        throw taggedError(failure, 'reactory.organizations.error.structureSaveFailed');
      }

      return operationPayload(result, field);
    },
    [reactory],
  );

  /** A mutation that answers with a record; an empty payload is a failure. */
  const writeRecord = useCallback(
    async <T extends { id?: string | null }>(
      document: string,
      variables: Record<string, any>,
      field: string,
      fallbackKey: OrganizationError['key'],
    ): Promise<OrganizationStructureWriteResult<T>> => {
      setSaving(true);
      setError(null);

      try {
        const payload = (await runMutation(document, variables, field)) as T | null;
        if (!payload || !payload.id) {
          throw taggedError('reactory-empty-result', fallbackKey);
        }
        return { record: payload, error: null };
      } catch (caught: any) {
        const failure = toOrganizationError(caught, fallbackKey);
        if (mountedRef.current) setError(failure);
        return { record: null, error: failure };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [runMutation, toOrganizationError],
  );

  /**
   * A mutation that answers with a boolean.
   *
   * `addMemberToBusinessUnit`, `removeMemberFromTeam` and `deleteTeam` all
   * return `Boolean`; only an explicit `true` counts as success, so a null the
   * server forgot to resolve is reported rather than silently treated as done.
   */
  const writeFlag = useCallback(
    async (
      document: string,
      variables: Record<string, any>,
      field: string,
      fallbackKey: OrganizationError['key'],
    ): Promise<OrganizationStructureFlagResult> => {
      setSaving(true);
      setError(null);

      try {
        const payload = await runMutation(document, variables, field);
        if (payload !== true) {
          throw taggedError('reactory-unsuccessful-result', fallbackKey);
        }
        return { ok: true, error: null };
      } catch (caught: any) {
        const failure = toOrganizationError(caught, fallbackKey);
        if (mountedRef.current) setError(failure);
        return { ok: false, error: failure };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [runMutation, toOrganizationError],
  );

  const read = useCallback(async (): Promise<void> => {
    if (!organizationId) {
      setBusinessUnits([]);
      setTeams([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setError({ key: 'reactory.organizations.error.apiUnavailable' });
      setLoading(false);
      return;
    }

    // One sequence for the pair: the units and teams of a read always belong
    // together, so a stale half must be discarded just like a stale whole.
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setLoading(true);
    setError(null);

    try {
      const [unitsResult, teamsResult] = await Promise.all([
        reactory.graphqlQuery(
          ORGANIZATION_STRUCTURE_BUSINESS_UNITS,
          { organizationId, includeDeleted: includeDeleted === true },
          { fetchPolicy: 'network-only' },
        ),
        reactory.graphqlQuery(
          ORGANIZATION_STRUCTURE_TEAMS,
          { organizationId },
          { fetchPolicy: 'network-only' },
        ),
      ]);

      if (sequence !== sequenceRef.current || !mountedRef.current) return;

      const failure = envelopeError(unitsResult) || envelopeError(teamsResult);
      if (failure) {
        setError({
          key: 'reactory.organizations.error.structureLoadFailed',
          serverMessage: failure,
        });
        return;
      }

      const unitPayload =
        operationPayload(unitsResult, OPERATIONS.organizationStructureBusinessUnits) || {};
      const teamPayload =
        operationPayload(teamsResult, OPERATIONS.organizationStructureTeams) || {};

      setBusinessUnits(
        Array.isArray(unitPayload.businessUnits) ? unitPayload.businessUnits : [],
      );
      setTeams(Array.isArray(teamPayload.teams) ? teamPayload.teams : []);
    } catch (caught: any) {
      if (sequence !== sequenceRef.current || !mountedRef.current) return;
      setError({
        key: 'reactory.organizations.error.structureLoadFailed',
        serverMessage: serverMessageOf(caught),
      });
    } finally {
      if (sequence === sequenceRef.current && mountedRef.current) setLoading(false);
    }
  }, [includeDeleted, organizationId, reactory]);

  useEffect(() => {
    if (!autoLoad) return;
    void read();
  }, [autoLoad, read]);

  const createBusinessUnit = useCallback(
    (input: OrganizationBusinessUnitCreateInput) =>
      writeRecord<OrganizationBusinessUnit>(
        CREATE_BUSINESS_UNIT,
        {
          input: {
            organization: organizationId,
            name: input.name,
            description: input.description || null,
            owner: input.owner,
          },
        },
        OPERATIONS.createBusinessUnit,
        'reactory.organizations.error.structureSaveFailed',
      ),
    [organizationId, writeRecord],
  );

  const updateBusinessUnit = useCallback(
    (id: string, input: OrganizationBusinessUnitUpdateInput) =>
      writeRecord<OrganizationBusinessUnit>(
        UPDATE_BUSINESS_UNIT,
        {
          id,
          input: {
            name: input.name,
            description: input.description || null,
            owner: input.owner || null,
          },
        },
        OPERATIONS.updateBusinessUnit,
        'reactory.organizations.error.structureSaveFailed',
      ),
    [writeRecord],
  );

  const deleteBusinessUnit = useCallback(
    (id: string) =>
      writeRecord<OrganizationBusinessUnit>(
        DELETE_BUSINESS_UNIT,
        { id },
        OPERATIONS.deleteBusinessUnit,
        'reactory.organizations.error.structureDeleteFailed',
      ),
    [writeRecord],
  );

  const restoreBusinessUnit = useCallback(
    (id: string) =>
      writeRecord<OrganizationBusinessUnit>(
        RESTORE_BUSINESS_UNIT,
        { id },
        OPERATIONS.restoreBusinessUnit,
        'reactory.organizations.error.structureRestoreFailed',
      ),
    [writeRecord],
  );

  const addBusinessUnitMember = useCallback(
    (id: string, memberId: string) =>
      writeFlag(
        ADD_BUSINESS_UNIT_MEMBER,
        { id, memberId },
        OPERATIONS.addBusinessUnitMember,
        'reactory.organizations.error.structureMemberFailed',
      ),
    [writeFlag],
  );

  const removeBusinessUnitMember = useCallback(
    (id: string, memberId: string) =>
      writeFlag(
        REMOVE_BUSINESS_UNIT_MEMBER,
        { id, memberId },
        OPERATIONS.removeBusinessUnitMember,
        'reactory.organizations.error.structureMemberFailed',
      ),
    [writeFlag],
  );

  /** Create a team. `businessUnit` is optional; `null` means unassigned. */
  const createTeam = useCallback(
    (input: OrganizationTeamCreateInput) =>
      writeRecord<OrganizationTeam>(
        CREATE_TEAM,
        {
          input: {
            organization: organizationId,
            name: input.name,
            businessUnit: input.businessUnitId || null,
          },
        },
        OPERATIONS.createTeam,
        'reactory.organizations.error.structureSaveFailed',
      ),
    [organizationId, writeRecord],
  );

  /**
   * Update a team.
   *
   * `businessUnit` is never included: changing the unit goes through
   * `moveTeamToBusinessUnit`, and sending it here would bypass the server's
   * cross-organization check for moves.
   */
  const updateTeam = useCallback(
    (id: string, input: OrganizationTeamUpdateInput) =>
      writeRecord<OrganizationTeam>(
        UPDATE_TEAM,
        {
          id,
          input: {
            name: input.name,
            description: input.description || null,
            owner: input.owner || null,
          },
        },
        OPERATIONS.updateTeam,
        'reactory.organizations.error.structureSaveFailed',
      ),
    [writeRecord],
  );

  const moveTeamToBusinessUnit = useCallback(
    (teamId: string, businessUnitId: string) =>
      writeRecord<OrganizationTeam>(
        MOVE_TEAM_TO_BUSINESS_UNIT,
        { id: teamId, businessUnitId },
        OPERATIONS.moveTeamToBusinessUnit,
        'reactory.organizations.error.structureMoveFailed',
      ),
    [writeRecord],
  );

  const deleteTeam = useCallback(
    (id: string) =>
      writeFlag(
        DELETE_TEAM,
        { id },
        OPERATIONS.deleteTeam,
        'reactory.organizations.error.structureDeleteFailed',
      ),
    [writeFlag],
  );

  const addTeamMember = useCallback(
    (id: string, memberId: string) =>
      writeFlag(
        ADD_TEAM_MEMBER,
        { id, memberId },
        OPERATIONS.addTeamMember,
        'reactory.organizations.error.structureMemberFailed',
      ),
    [writeFlag],
  );

  const removeTeamMember = useCallback(
    (id: string, memberId: string) =>
      writeFlag(
        REMOVE_TEAM_MEMBER,
        { id, memberId },
        OPERATIONS.removeTeamMember,
        'reactory.organizations.error.structureMemberFailed',
      ),
    [writeFlag],
  );

  return {
    businessUnits,
    teams,
    includeDeleted,
    loading,
    saving,
    error,
    clearError,
    refreshStructure: read,
    setIncludeDeleted,
    createBusinessUnit,
    updateBusinessUnit,
    deleteBusinessUnit,
    restoreBusinessUnit,
    addBusinessUnitMember,
    removeBusinessUnitMember,
    createTeam,
    updateTeam,
    moveTeamToBusinessUnit,
    deleteTeam,
    addTeamMember,
    removeTeamMember,
  };
};

export default useOrganizationStructure;
