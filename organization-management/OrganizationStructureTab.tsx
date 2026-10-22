import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  DriveFileMoveOutlined as MoveIcon,
  Edit as EditIcon,
  GroupOutlined as GroupIcon,
  RestoreFromTrash as RestoreIcon,
} from '@mui/icons-material';

import useOrganizationStructure from './hooks/useOrganizationStructure';
import {
  buildOrganizationStructure,
  currentUserId,
  movableBusinessUnits,
  teamBusinessUnitId,
  teamDisplayName,
  userDisplayName,
} from './organizationStructure';
import { resolveError } from './i18n';
import type {
  OrganizationBusinessUnit,
  OrganizationError,
  OrganizationStructureUserRef,
  OrganizationTabProps,
  OrganizationTeam,
} from './types';

/**
 * Structure tab (ORG-022).
 *
 * Replaces the `structure` placeholder in `organizationTabs.tsx`; the other
 * placeholder entries and `OrganizationDetailPanel` are untouched.
 *
 * One hierarchical view rather than two flat lists: business units are the
 * top-level nodes and their teams are nested beneath, matched on
 * `team.businessUnit`. Teams without a unit (or pointing at a unit this view
 * does not contain) are grouped under "Unassigned teams", so a team can never
 * disappear because of a filter applied to something else.
 *
 * Server contract notes
 * ---------------------
 * - **Moving a team is its own mutation.** `moveTeamToBusinessUnit(id,
 *   businessUnitId)` is the only path used to change a team's unit. `updateTeam`
 *   never carries `businessUnit`: the dedicated mutation is what exercises the
 *   server's cross-organization guard, and a client-side edit would bypass it.
 * - **Deletes are soft.** `deleteBusinessUnit` sets `deleted: true`; the paged
 *   read hides it unless `filter.includeDeleted` is set, which is exactly what
 *   the "show deleted" switch controls. Restore therefore lives on the deleted
 *   node, not in a separate screen.
 * - **Creating a team only sends what creation persists.** The server's
 *   `createTeam` reads the organization, the name and the optional business
 *   unit; owner and description are applied by `updateTeam`, so the create
 *   dialog collects them from the Edit dialog instead of pretending it saved
 *   them.
 * - **Writes are hidden, not disabled.** `canManage === false` removes every
 *   write affordance; the tab does not try to enforce authorization itself —
 *   the server remains the authority via `assertOrgAdmin`.
 *
 * Unsaved input
 * -------------
 * `onUnsavedChanges(true)` while a dialog holds uncommitted input, cleared only
 * when the save succeeds or the user discards. A failed save keeps the dialog
 * open *and* the flag set: clearing it because a request was attempted is the
 * ORG-011 review regression this tab must not repeat.
 */

interface UnitFormState {
  mode: 'create' | 'edit';
  id: string;
  name: string;
  description: string;
  owner: string;
}

interface TeamFormState {
  mode: 'create' | 'edit';
  id: string;
  name: string;
  description: string;
  owner: string;
  /** Only used on create. Edits move a team through the Move dialog. */
  businessUnitId: string;
}

interface MoveFormState {
  teamId: string;
  target: string;
}

interface MembersFormState {
  kind: 'businessUnit' | 'team';
  id: string;
  name: string;
  memberId: string;
}

interface DeleteTarget {
  kind: 'businessUnit' | 'team';
  id: string;
  name: string;
}

/** Read a unit's owner label without inventing a placeholder name. */
const ownerLabel = (unit: OrganizationBusinessUnit, noneLabel: string): string => {
  const name = userDisplayName(unit.owner);
  return name.length > 0 ? name : noneLabel;
};

interface TeamRowProps {
  team: OrganizationTeam;
  t: OrganizationTabProps['t'];
  readOnly: boolean;
  busy: boolean;
  onEdit: (team: OrganizationTeam) => void;
  onDelete: (team: OrganizationTeam) => void;
  onMove: (team: OrganizationTeam) => void;
  onMembers: (team: OrganizationTeam) => void;
}

/** One team row inside a business unit (or inside Unassigned teams). */
const TeamRow: React.FC<TeamRowProps> = ({
  team,
  t,
  readOnly,
  busy,
  onEdit,
  onDelete,
  onMove,
  onMembers,
}) => {
  const name = teamDisplayName(team) || team.id;
  const owner = userDisplayName(team.owner);
  const members = Array.isArray(team.members) ? team.members.length : 0;

  return (
    <Box
      component="li"
      data-testid={`structure-team-${team.id}`}
      sx={{
        alignItems: 'center',
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        gap: 1,
        justifyContent: 'space-between',
        py: 1,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body1" noWrap sx={{ fontWeight: 500 }}>
            {name}
          </Typography>
          {team.deleted === true && (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={t('reactory.organizations.structure.team.deleted')}
            />
          )}
          <Chip
            size="small"
            variant="outlined"
            label={t('reactory.organizations.structure.members.count', { count: members })}
          />
        </Stack>

        {team.description ? (
          <Typography variant="caption" color="text.secondary" display="block">
            {team.description}
          </Typography>
        ) : null}

        <Typography variant="caption" color="text.secondary" display="block">
          {owner.length > 0
            ? t('reactory.organizations.structure.unit.owner', { name: owner })
            : t('reactory.organizations.structure.unit.ownerNone')}
        </Typography>
      </Box>

      {!readOnly && (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={t('reactory.organizations.structure.team.edit', { name })}>
            <IconButton
              size="small"
              disabled={busy}
              aria-label={t('reactory.organizations.structure.team.edit', { name })}
              data-testid={`structure-team-edit-${team.id}`}
              onClick={() => onEdit(team)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title={t('reactory.organizations.structure.team.move', { name })}>
            <IconButton
              size="small"
              disabled={busy}
              aria-label={t('reactory.organizations.structure.team.move', { name })}
              data-testid={`structure-team-move-${team.id}`}
              onClick={() => onMove(team)}
            >
              <MoveIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title={t('reactory.organizations.structure.team.members', { name })}>
            <IconButton
              size="small"
              disabled={busy}
              aria-label={t('reactory.organizations.structure.team.members', { name })}
              data-testid={`structure-team-members-${team.id}`}
              onClick={() => onMembers(team)}
            >
              <GroupIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title={t('reactory.organizations.structure.team.delete', { name })}>
            <IconButton
              size="small"
              color="error"
              disabled={busy}
              aria-label={t('reactory.organizations.structure.team.delete', { name })}
              data-testid={`structure-team-delete-${team.id}`}
              onClick={() => onDelete(team)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
};

/**
 * Structure tab body.
 *
 * Every string is an i18n key; every write is hidden when `canManage` is false.
 */
export const OrganizationStructureTab: React.FC<OrganizationTabProps> = ({
  reactory,
  t,
  organization,
  canManage,
  refresh,
  onUnsavedChanges,
  notify,
}) => {
  const structure = useOrganizationStructure({ reactory, organization });
  const refreshStructure = structure.refreshStructure;

  const readOnly = canManage === false;

  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [unitForm, setUnitForm] = useState<UnitFormState | null>(null);
  const [teamForm, setTeamForm] = useState<TeamFormState | null>(null);
  const [moveForm, setMoveForm] = useState<MoveFormState | null>(null);
  const [membersForm, setMembersForm] = useState<MembersFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  /**
   * Dirty state means exactly one thing: an open dialog holds input that has
   * not been committed. It is set when the input changes (and when a brand-new
   * record is opened, which is uncommitted from the start) and cleared only
   * after a save succeeds or the user discards. A failed request leaves it set.
   */
  useEffect(() => {
    onUnsavedChanges(dirty);
  }, [dirty, onUnsavedChanges]);

  // Unmounting the tab (a tab switch) must stop the shell guarding for a dialog
  // that no longer exists.
  useEffect(
    () => () => {
      onUnsavedChanges(false);
    },
    [onUnsavedChanges],
  );

  const tree = useMemo(
    () => buildOrganizationStructure(structure.businessUnits, structure.teams),
    [structure.businessUnits, structure.teams],
  );

  const unitById = useMemo(() => {
    const map = new Map<string, OrganizationBusinessUnit>();
    (structure.businessUnits || []).forEach((unit) => map.set(`${unit.id}`, unit));
    return map;
  }, [structure.businessUnits]);

  const teamById = useMemo(() => {
    const map = new Map<string, OrganizationTeam>();
    (structure.teams || []).forEach((team) => map.set(`${team.id}`, team));
    return map;
  }, [structure.teams]);

  /**
   * The shell's reload refreshes the organization and its counts; the tab's own
   * read refreshes the hierarchy. A successful write needs both, and a failed
   * reload must never be reported as a failed write.
   */
  const safeRefresh = useCallback(async (): Promise<void> => {
    try {
      await refreshStructure();
    } catch {
      // The write already succeeded.
    }
    try {
      await refresh();
    } catch {
      // The write already succeeded.
    }
  }, [refresh, refreshStructure]);

  const notifyFailure = useCallback(
    (error: OrganizationError | null | undefined, fallbackKey: OrganizationError['key']) => {
      if (!error) {
        notify(t(fallbackKey), 'error');
        return;
      }
      notify(resolveError(t, error), 'error');
    },
    [notify, t],
  );

  /* ---------------------------------------------------------------------- *
   * Business unit dialogs
   * ---------------------------------------------------------------------- */

  const openCreateUnit = useCallback(() => {
    setUnitForm({
      mode: 'create',
      id: '',
      name: '',
      description: '',
      // `BusinessUnitInput.owner` is required; default it to the signed-in
      // user so the common case does not need a lookup.
      owner: currentUserId(reactory),
    });
    setDirty(true);
  }, [reactory]);

  const openEditUnit = useCallback((unit: OrganizationBusinessUnit) => {
    setUnitForm({
      mode: 'edit',
      id: `${unit.id}`,
      name: `${unit.name || ''}`,
      description: `${unit.description || ''}`,
      owner: `${(unit.owner && unit.owner.id) || ''}`,
    });
    setDirty(false);
  }, []);

  const updateUnitForm = useCallback((patch: Partial<UnitFormState>) => {
    setUnitForm((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }, []);

  const cancelUnitForm = useCallback(() => {
    setUnitForm(null);
    setDirty(false);
  }, []);

  const saveUnitForm = useCallback(async () => {
    const form = unitForm;
    if (!form || readOnly) return;

    const name = form.name.trim();
    if (name.length === 0) {
      notify(t('reactory.organizations.structure.nameRequired'), 'error');
      return;
    }

    const owner = form.owner.trim();
    if (form.mode === 'create' && owner.length === 0) {
      notify(t('reactory.organizations.structure.ownerRequired'), 'error');
      return;
    }

    setSubmitting(true);
    const result =
      form.mode === 'create'
        ? await structure.createBusinessUnit({
            name,
            description: form.description.trim(),
            owner,
          })
        : await structure.updateBusinessUnit(form.id, {
            name,
            description: form.description.trim(),
            owner: owner || null,
          });
    setSubmitting(false);

    if (!result.record) {
      // The dialog stays open with the draft intact and the dirty flag set.
      notifyFailure(result.error, 'reactory.organizations.error.structureSaveFailed');
      return;
    }

    setUnitForm(null);
    setDirty(false);
    notify(
      t(
        form.mode === 'create'
          ? 'reactory.organizations.structure.notify.unitCreated'
          : 'reactory.organizations.structure.notify.unitSaved',
        { name },
      ),
      'success',
    );
    await safeRefresh();
  }, [notify, notifyFailure, readOnly, safeRefresh, structure, t, unitForm]);

  /* ---------------------------------------------------------------------- *
   * Team dialogs
   * ---------------------------------------------------------------------- */

  const openCreateTeam = useCallback((unit?: OrganizationBusinessUnit) => {
    setTeamForm({
      mode: 'create',
      id: '',
      name: '',
      description: '',
      owner: '',
      businessUnitId: unit ? `${unit.id}` : '',
    });
    setDirty(true);
  }, []);

  const openEditTeam = useCallback((team: OrganizationTeam) => {
    setTeamForm({
      mode: 'edit',
      id: `${team.id}`,
      name: teamDisplayName(team),
      description: `${team.description || ''}`,
      owner: `${(team.owner && team.owner.id) || ''}`,
      businessUnitId: teamBusinessUnitId(team),
    });
    setDirty(false);
  }, []);

  const updateTeamForm = useCallback((patch: Partial<TeamFormState>) => {
    setTeamForm((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }, []);

  const cancelTeamForm = useCallback(() => {
    setTeamForm(null);
    setDirty(false);
  }, []);

  const saveTeamForm = useCallback(async () => {
    const form = teamForm;
    if (!form || readOnly) return;

    const name = form.name.trim();
    if (name.length === 0) {
      notify(t('reactory.organizations.structure.nameRequired'), 'error');
      return;
    }

    setSubmitting(true);
    const result =
      form.mode === 'create'
        ? await structure.createTeam({
            name,
            businessUnitId: form.businessUnitId || null,
          })
        : await structure.updateTeam(form.id, {
            name,
            description: form.description.trim(),
            owner: form.owner.trim() || null,
          });
    setSubmitting(false);

    if (!result.record) {
      notifyFailure(result.error, 'reactory.organizations.error.structureSaveFailed');
      return;
    }

    setTeamForm(null);
    setDirty(false);
    notify(
      t(
        form.mode === 'create'
          ? 'reactory.organizations.structure.notify.teamCreated'
          : 'reactory.organizations.structure.notify.teamSaved',
        { name },
      ),
      'success',
    );
    await safeRefresh();
  }, [notify, notifyFailure, readOnly, safeRefresh, structure, t, teamForm]);

  /* ---------------------------------------------------------------------- *
   * Move a team between units
   * ---------------------------------------------------------------------- */

  const openMoveTeam = useCallback((team: OrganizationTeam) => {
    setMoveForm({ teamId: `${team.id}`, target: '' });
    setDirty(false);
  }, []);

  const cancelMoveTeam = useCallback(() => {
    setMoveForm(null);
    setDirty(false);
  }, []);

  const saveMoveTeam = useCallback(async () => {
    const form = moveForm;
    if (!form || readOnly) return;

    const team = teamById.get(form.teamId);
    const target = unitById.get(form.target);
    if (!team || !target) return;

    setSubmitting(true);
    // Explicitly the move mutation: `updateTeam` is never asked to carry a
    // business unit, so the server's cross-organization guard stays in play.
    const result = await structure.moveTeamToBusinessUnit(form.teamId, `${target.id}`);
    setSubmitting(false);

    if (!result.record) {
      notifyFailure(result.error, 'reactory.organizations.error.structureMoveFailed');
      return;
    }

    setMoveForm(null);
    setDirty(false);
    notify(
      t('reactory.organizations.structure.notify.teamMoved', {
        name: teamDisplayName(team),
        unit: `${target.name || target.id}`,
      }),
      'success',
    );
    await safeRefresh();
  }, [moveForm, notify, notifyFailure, readOnly, safeRefresh, structure, t, teamById, unitById]);

  /* ---------------------------------------------------------------------- *
   * Delete / restore
   * ---------------------------------------------------------------------- */

  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target || readOnly) return;

    setSubmitting(true);

    // A unit delete answers with the soft-deleted record, a team delete with a
    // boolean — two contracts, so they are unwrapped separately rather than
    // through one union the compiler cannot narrow.
    let deleted = false;
    let failure: OrganizationError | null = null;

    if (target.kind === 'businessUnit') {
      const result = await structure.deleteBusinessUnit(target.id);
      deleted = result.record !== null;
      failure = result.error;
    } else {
      const result = await structure.deleteTeam(target.id);
      deleted = result.ok;
      failure = result.error;
    }

    setSubmitting(false);

    if (!deleted) {
      notifyFailure(failure, 'reactory.organizations.error.structureDeleteFailed');
      return;
    }

    setDeleteTarget(null);
    notify(
      t(
        target.kind === 'businessUnit'
          ? 'reactory.organizations.structure.notify.unitDeleted'
          : 'reactory.organizations.structure.notify.teamDeleted',
        { name: target.name },
      ),
      'success',
    );
    await safeRefresh();
  }, [deleteTarget, notify, notifyFailure, readOnly, safeRefresh, structure, t]);

  const restoreUnit = useCallback(
    async (unit: OrganizationBusinessUnit) => {
      if (readOnly) return;

      const name = `${unit.name || unit.id}`;
      setSubmitting(true);
      const result = await structure.restoreBusinessUnit(`${unit.id}`);
      setSubmitting(false);

      if (!result.record) {
        notifyFailure(result.error, 'reactory.organizations.error.structureRestoreFailed');
        return;
      }

      notify(
        t('reactory.organizations.structure.notify.unitRestored', { name }),
        'success',
      );
      await safeRefresh();
    },
    [notify, notifyFailure, readOnly, safeRefresh, structure, t],
  );

  /* ---------------------------------------------------------------------- *
   * Membership
   * ---------------------------------------------------------------------- */

  const openMembers = useCallback(
    (kind: MembersFormState['kind'], id: string, name: string) => {
      setMembersForm({ kind, id, name, memberId: '' });
      setDirty(false);
    },
    [],
  );

  const cancelMembers = useCallback(() => {
    setMembersForm(null);
    setDirty(false);
  }, []);

  const updateMemberId = useCallback((memberId: string) => {
    setMembersForm((current) => (current ? { ...current, memberId } : current));
    setDirty(memberId.trim().length > 0);
  }, []);

  const addMember = useCallback(async () => {
    const form = membersForm;
    if (!form || readOnly) return;

    const memberId = form.memberId.trim();
    if (memberId.length === 0) {
      notify(t('reactory.organizations.structure.members.memberIdRequired'), 'error');
      return;
    }

    setSubmitting(true);
    const result =
      form.kind === 'businessUnit'
        ? await structure.addBusinessUnitMember(form.id, memberId)
        : await structure.addTeamMember(form.id, memberId);
    setSubmitting(false);

    if (!result.ok) {
      notifyFailure(result.error, 'reactory.organizations.error.structureMemberFailed');
      return;
    }

    // The input is committed: clear it, and with it the unsaved flag.
    setMembersForm({ ...form, memberId: '' });
    setDirty(false);
    notify(
      t('reactory.organizations.structure.notify.memberAdded', { name: memberId }),
      'success',
    );
    await safeRefresh();
  }, [membersForm, notify, notifyFailure, readOnly, safeRefresh, structure, t]);

  const removeMember = useCallback(
    async (kind: MembersFormState['kind'], id: string, member: OrganizationStructureUserRef) => {
      if (readOnly) return;

      const memberId = `${(member && member.id) || ''}`;
      if (!memberId) return;

      const name = userDisplayName(member) || memberId;
      setSubmitting(true);
      const result =
        kind === 'businessUnit'
          ? await structure.removeBusinessUnitMember(id, memberId)
          : await structure.removeTeamMember(id, memberId);
      setSubmitting(false);

      if (!result.ok) {
        notifyFailure(result.error, 'reactory.organizations.error.structureMemberFailed');
        return;
      }

      notify(
        t('reactory.organizations.structure.notify.memberRemoved', { name }),
        'success',
      );
      await safeRefresh();
    },
    [notify, notifyFailure, readOnly, safeRefresh, structure, t],
  );

  /* ---------------------------------------------------------------------- *
   * Derived dialog data
   * ---------------------------------------------------------------------- */

  const moveTeam = moveForm ? teamById.get(moveForm.teamId) : undefined;
  const moveTargets = useMemo(
    () =>
      movableBusinessUnits(
        structure.businessUnits,
        moveTeam ? teamBusinessUnitId(moveTeam) : '',
      ),
    [moveTeam, structure.businessUnits],
  );

  const membersRecord:
    | OrganizationBusinessUnit
    | OrganizationTeam
    | undefined = membersForm
    ? membersForm.kind === 'businessUnit'
      ? unitById.get(membersForm.id)
      : teamById.get(membersForm.id)
    : undefined;

  const members: OrganizationStructureUserRef[] = Array.isArray(membersRecord?.members)
    ? (membersRecord?.members as OrganizationStructureUserRef[])
    : [];

  const hasContent = tree.nodes.length > 0 || tree.unassignedTeams.length > 0;

  return (
    <Stack spacing={3} data-testid="organization-structure-tab">
      {readOnly && (
        <Alert severity="info" variant="outlined" data-testid="organization-structure-readonly">
          {t('reactory.organizations.detail.readOnly')}
        </Alert>
      )}

      {structure.error && (
        <Alert
          severity="error"
          data-testid="organization-structure-load-error"
          action={
            <Button color="inherit" size="small" onClick={() => void refreshStructure()}>
              {t('reactory.organizations.list.retry')}
            </Button>
          }
        >
          {resolveError(t, structure.error)}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            justifyContent="space-between"
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle1" component="h2">
                  {t('reactory.organizations.structure.title')}
                </Typography>
                {structure.loading && (
                  <CircularProgress size={16} data-testid="organization-structure-loading" />
                )}
                <Chip
                  size="small"
                  variant="outlined"
                  label={t('reactory.organizations.structure.unit.teamCount', {
                    count: structure.teams.length,
                  })}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {t('reactory.organizations.structure.hint')}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center">
              <FormControlLabel
                control={
                  <Switch
                    checked={structure.includeDeleted}
                    onChange={(event) => structure.setIncludeDeleted(event.target.checked)}
                    inputProps={{
                      'aria-label': t('reactory.organizations.structure.showDeleted'),
                    }}
                  />
                }
                label={t('reactory.organizations.structure.showDeleted')}
              />

              {!readOnly && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<AddIcon />}
                  disabled={submitting}
                  data-testid="structure-unit-create"
                  onClick={openCreateUnit}
                >
                  {t('reactory.organizations.structure.unit.create')}
                </Button>
              )}
            </Stack>
          </Stack>

          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {t('reactory.organizations.structure.showDeletedHint')}
          </Typography>
        </CardContent>
      </Card>

      {!structure.loading && !hasContent && (
        <Alert severity="info" variant="outlined" data-testid="organization-structure-empty">
          {readOnly
            ? t('reactory.organizations.structure.emptyReadOnly')
            : `${t('reactory.organizations.structure.empty')}. ${t(
                'reactory.organizations.structure.emptyHint',
              )}`}
        </Alert>
      )}

      {hasContent && (
        <Box
          component="ul"
          data-testid="organization-structure-tree"
          sx={{ listStyle: 'none', m: 0, p: 0 }}
        >
          {tree.nodes.map((node) => {
            const unit = node.businessUnit;
            const unitId = `${unit.id}`;
            const unitName = `${unit.name || unit.id}`;
            const deleted = unit.deleted === true;

            return (
              <Box component="li" key={unitId} data-testid={`structure-unit-${unitId}`} sx={{ mb: 2 }}>
                <Card
                  variant="outlined"
                  sx={deleted ? { borderStyle: 'dashed', opacity: 0.9 } : undefined}
                >
                  <CardContent>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                      justifyContent="space-between"
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="subtitle1" component="h3">
                            {unitName}
                          </Typography>
                          {deleted && (
                            <Chip
                              size="small"
                              color="warning"
                              label={t('reactory.organizations.structure.unit.deleted')}
                            />
                          )}
                          <Chip
                            size="small"
                            variant="outlined"
                            label={t('reactory.organizations.structure.unit.teamCount', {
                              count: node.teams.length,
                            })}
                          />
                        </Stack>

                        {unit.description && (
                          <Typography variant="body2" color="text.secondary">
                            {unit.description}
                          </Typography>
                        )}

                        <Typography variant="caption" color="text.secondary" display="block">
                          {t('reactory.organizations.structure.unit.owner', {
                            name: ownerLabel(
                              unit,
                              t('reactory.organizations.structure.unit.ownerNone'),
                            ),
                          })}
                        </Typography>
                      </Box>

                      {!readOnly && (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {deleted ? (
                            <Button
                              size="small"
                              startIcon={<RestoreIcon />}
                              disabled={submitting}
                              data-testid={`structure-unit-restore-${unitId}`}
                              aria-label={t('reactory.organizations.structure.unit.restore', {
                                name: unitName,
                              })}
                              onClick={() => void restoreUnit(unit)}
                            >
                              {t('reactory.organizations.structure.unit.restore', {
                                name: unitName,
                              })}
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="small"
                                startIcon={<AddIcon />}
                                disabled={submitting}
                                data-testid={`structure-team-create-${unitId}`}
                                aria-label={t('reactory.organizations.structure.team.createIn', {
                                  name: unitName,
                                })}
                                onClick={() => openCreateTeam(unit)}
                              >
                                {t('reactory.organizations.structure.team.create')}
                              </Button>

                              <Tooltip
                                title={t('reactory.organizations.structure.unit.members', {
                                  name: unitName,
                                })}
                              >
                                <IconButton
                                  size="small"
                                  disabled={submitting}
                                  aria-label={t('reactory.organizations.structure.unit.members', {
                                    name: unitName,
                                  })}
                                  data-testid={`structure-unit-members-${unitId}`}
                                  onClick={() =>
                                    openMembers('businessUnit', unitId, unitName)
                                  }
                                >
                                  <GroupIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip
                                title={t('reactory.organizations.structure.unit.edit', {
                                  name: unitName,
                                })}
                              >
                                <IconButton
                                  size="small"
                                  disabled={submitting}
                                  aria-label={t('reactory.organizations.structure.unit.edit', {
                                    name: unitName,
                                  })}
                                  data-testid={`structure-unit-edit-${unitId}`}
                                  onClick={() => openEditUnit(unit)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip
                                title={t('reactory.organizations.structure.unit.delete', {
                                  name: unitName,
                                })}
                              >
                                <IconButton
                                  size="small"
                                  color="error"
                                  disabled={submitting}
                                  aria-label={t('reactory.organizations.structure.unit.delete', {
                                    name: unitName,
                                  })}
                                  data-testid={`structure-unit-delete-${unitId}`}
                                  onClick={() =>
                                    setDeleteTarget({
                                      kind: 'businessUnit',
                                      id: unitId,
                                      name: unitName,
                                    })
                                  }
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </Stack>
                      )}
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />

                    {node.teams.length === 0 ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        data-testid={`structure-unit-${unitId}-empty`}
                      >
                        {t('reactory.organizations.structure.unit.noTeams')}
                      </Typography>
                    ) : (
                      <Box
                        component="ul"
                        data-testid={`structure-unit-${unitId}-teams`}
                        sx={{ listStyle: 'none', m: 0, p: 0 }}
                      >
                        {node.teams.map((team) => (
                          <TeamRow
                            key={`${team.id}`}
                            team={team}
                            t={t}
                            readOnly={readOnly}
                            busy={submitting}
                            onEdit={openEditTeam}
                            onDelete={(target) =>
                              setDeleteTarget({
                                kind: 'team',
                                id: `${target.id}`,
                                name: teamDisplayName(target),
                              })
                            }
                            onMove={openMoveTeam}
                            onMembers={(target) =>
                              openMembers('team', `${target.id}`, teamDisplayName(target))
                            }
                          />
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Box>
            );
          })}

          {tree.unassignedTeams.length > 0 && (
            <Box component="li" data-testid="structure-unassigned-teams">
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle1" component="h3">
                      {t('reactory.organizations.structure.unassigned.title')}
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={t('reactory.organizations.structure.unassigned.count', {
                        count: tree.unassignedTeams.length,
                      })}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    {t('reactory.organizations.structure.unassigned.hint')}
                  </Typography>

                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {tree.unassignedTeams.map((team) => (
                      <TeamRow
                        key={`${team.id}`}
                        team={team}
                        t={t}
                        readOnly={readOnly}
                        busy={submitting}
                        onEdit={openEditTeam}
                        onDelete={(target) =>
                          setDeleteTarget({
                            kind: 'team',
                            id: `${target.id}`,
                            name: teamDisplayName(target),
                          })
                        }
                        onMove={openMoveTeam}
                        onMembers={(target) =>
                          openMembers('team', `${target.id}`, teamDisplayName(target))
                        }
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Box>
          )}
        </Box>
      )}

      {/* ---------------------------------------------------------------- *
       * Business unit form
       * ---------------------------------------------------------------- */}
      <Dialog open={unitForm !== null} onClose={cancelUnitForm} fullWidth maxWidth="sm">
        <DialogTitle>
          {unitForm && unitForm.mode === 'create'
            ? t('reactory.organizations.structure.unit.createTitle')
            : t('reactory.organizations.structure.unit.editTitle')}
        </DialogTitle>
        <DialogContent>
          {unitForm && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                autoFocus
                required
                fullWidth
                label={t('reactory.organizations.structure.name')}
                placeholder={t('reactory.organizations.structure.namePlaceholder')}
                value={unitForm.name}
                onChange={(event) => updateUnitForm({ name: event.target.value })}
                inputProps={{ 'data-testid': 'structure-unit-name' }}
              />
              <TextField
                fullWidth
                multiline
                minRows={2}
                label={t('reactory.organizations.structure.description')}
                placeholder={t('reactory.organizations.structure.descriptionPlaceholder')}
                value={unitForm.description}
                onChange={(event) => updateUnitForm({ description: event.target.value })}
                inputProps={{ 'data-testid': 'structure-unit-description' }}
              />
              <TextField
                fullWidth
                required={unitForm.mode === 'create'}
                label={t('reactory.organizations.structure.owner')}
                helperText={t('reactory.organizations.structure.ownerHint')}
                value={unitForm.owner}
                onChange={(event) => updateUnitForm({ owner: event.target.value })}
                inputProps={{ 'data-testid': 'structure-unit-owner' }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelUnitForm} disabled={submitting}>
            {t('reactory.organizations.structure.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveUnitForm()}
            disabled={submitting}
            data-testid="structure-unit-save"
          >
            {submitting
              ? t('reactory.organizations.structure.saving')
              : t('reactory.organizations.structure.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------------------------------------------------------------- *
       * Team form
       * ---------------------------------------------------------------- */}
      <Dialog open={teamForm !== null} onClose={cancelTeamForm} fullWidth maxWidth="sm">
        <DialogTitle>
          {teamForm && teamForm.mode === 'create'
            ? t('reactory.organizations.structure.team.createTitle')
            : t('reactory.organizations.structure.team.editTitle')}
        </DialogTitle>
        <DialogContent>
          {teamForm && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                autoFocus
                required
                fullWidth
                label={t('reactory.organizations.structure.name')}
                placeholder={t('reactory.organizations.structure.namePlaceholder')}
                value={teamForm.name}
                onChange={(event) => updateTeamForm({ name: event.target.value })}
                inputProps={{ 'data-testid': 'structure-team-name' }}
              />

              {teamForm.mode === 'create' ? (
                <>
                  <TextField
                    select
                    fullWidth
                    label={t('reactory.organizations.structure.businessUnit')}
                    value={teamForm.businessUnitId}
                    onChange={(event) => updateTeamForm({ businessUnitId: event.target.value })}
                  >
                    <MenuItem value="">
                      {t('reactory.organizations.structure.businessUnitUnassigned')}
                    </MenuItem>
                    {structure.businessUnits
                      .filter((unit) => unit.deleted !== true)
                      .map((unit) => (
                        <MenuItem key={`${unit.id}`} value={`${unit.id}`}>
                          {`${unit.name || unit.id}`}
                        </MenuItem>
                      ))}
                  </TextField>
                  <Typography variant="caption" color="text.secondary">
                    {t('reactory.organizations.structure.team.createHint')}
                  </Typography>
                </>
              ) : (
                <>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    label={t('reactory.organizations.structure.description')}
                    placeholder={t('reactory.organizations.structure.descriptionPlaceholder')}
                    value={teamForm.description}
                    onChange={(event) => updateTeamForm({ description: event.target.value })}
                    inputProps={{ 'data-testid': 'structure-team-description' }}
                  />
                  <TextField
                    fullWidth
                    label={t('reactory.organizations.structure.owner')}
                    helperText={t('reactory.organizations.structure.ownerHint')}
                    value={teamForm.owner}
                    onChange={(event) => updateTeamForm({ owner: event.target.value })}
                    inputProps={{ 'data-testid': 'structure-team-owner' }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {t('reactory.organizations.structure.team.currentUnit', {
                      name:
                        (unitById.get(teamForm.businessUnitId)?.name as string) ||
                        t('reactory.organizations.structure.team.unassigned'),
                    })}
                  </Typography>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelTeamForm} disabled={submitting}>
            {t('reactory.organizations.structure.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveTeamForm()}
            disabled={submitting}
            data-testid="structure-team-save"
          >
            {submitting
              ? t('reactory.organizations.structure.saving')
              : t('reactory.organizations.structure.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------------------------------------------------------------- *
       * Move team
       * ---------------------------------------------------------------- */}
      <Dialog open={moveForm !== null} onClose={cancelMoveTeam} fullWidth maxWidth="xs">
        <DialogTitle>
          {t('reactory.organizations.structure.team.moveTitle', {
            name: moveTeam ? teamDisplayName(moveTeam) : '',
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('reactory.organizations.structure.team.moveBody')}
          </DialogContentText>

          {moveTargets.length === 0 ? (
            <Alert severity="info" variant="outlined" data-testid="structure-move-no-targets">
              {t('reactory.organizations.structure.team.moveNoTargets')}
            </Alert>
          ) : (
            <TextField
              select
              fullWidth
              autoFocus
              label={t('reactory.organizations.structure.team.moveTarget')}
              value={moveForm?.target || ''}
              onChange={(event) => {
                setMoveForm((current) =>
                  current ? { ...current, target: event.target.value } : current,
                );
                setDirty(true);
              }}
            >
              {moveTargets.map((unit) => (
                <MenuItem key={`${unit.id}`} value={`${unit.id}`}>
                  {`${unit.name || unit.id}`}
                </MenuItem>
              ))}
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelMoveTeam} disabled={submitting}>
            {t('reactory.organizations.structure.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveMoveTeam()}
            disabled={submitting || moveTargets.length === 0 || !(moveForm && moveForm.target)}
            data-testid="structure-move-confirm"
          >
            {t('reactory.organizations.structure.team.moveConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------------------------------------------------------------- *
       * Members
       * ---------------------------------------------------------------- */}
      <Dialog open={membersForm !== null} onClose={cancelMembers} fullWidth maxWidth="sm">
        <DialogTitle>
          {t('reactory.organizations.structure.members.title', {
            name: membersForm ? membersForm.name : '',
          })}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {members.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('reactory.organizations.structure.members.empty')}
              </Typography>
            ) : (
              <Box component="ul" data-testid="structure-members-list" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {members.map((member) => {
                  const memberId = `${(member && member.id) || ''}`;
                  const name = userDisplayName(member) || memberId;
                  return (
                    <Box
                      component="li"
                      key={memberId}
                      data-testid={`structure-member-${memberId}`}
                      sx={{
                        alignItems: 'center',
                        borderTop: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        justifyContent: 'space-between',
                        py: 1,
                      }}
                    >
                      <Typography variant="body2">{name}</Typography>
                      {!readOnly && (
                        <Tooltip
                          title={t('reactory.organizations.structure.members.remove', { name })}
                        >
                          <IconButton
                            size="small"
                            color="error"
                            disabled={submitting}
                            aria-label={t('reactory.organizations.structure.members.remove', {
                              name,
                            })}
                            data-testid={`structure-member-remove-${memberId}`}
                            onClick={() =>
                              membersForm &&
                              void removeMember(membersForm.kind, membersForm.id, member)
                            }
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}

            {!readOnly && (
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  fullWidth
                  size="small"
                  label={t('reactory.organizations.structure.members.memberId')}
                  value={membersForm ? membersForm.memberId : ''}
                  onChange={(event) => updateMemberId(event.target.value)}
                  inputProps={{ 'data-testid': 'structure-member-input' }}
                />
                <Button
                  variant="contained"
                  onClick={() => void addMember()}
                  disabled={submitting}
                  data-testid="structure-member-add"
                >
                  {t('reactory.organizations.structure.members.add')}
                </Button>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelMembers} disabled={submitting}>
            {t('reactory.organizations.structure.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------------------------------------------------------------- *
       * Delete confirmation
       * ---------------------------------------------------------------- */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>
          {t('reactory.organizations.structure.delete.title', {
            name: deleteTarget ? deleteTarget.name : '',
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget && deleteTarget.kind === 'businessUnit'
              ? t('reactory.organizations.structure.delete.unitBody')
              : t('reactory.organizations.structure.delete.teamBody')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={submitting}>
            {t('reactory.organizations.structure.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void confirmDelete()}
            disabled={submitting}
            data-testid="structure-delete-confirm"
          >
            {t('reactory.organizations.structure.delete.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

OrganizationStructureTab.displayName = 'OrganizationStructureTab';

export default OrganizationStructureTab;
