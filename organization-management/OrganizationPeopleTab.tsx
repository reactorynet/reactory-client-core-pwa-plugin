import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccountTreeOutlined as AssignIcon,
  BlockOutlined as DeactivateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  PersonAddOutlined as InviteIcon,
} from '@mui/icons-material';

import useOrganizationMembers, {
  parseInviteEmails,
} from './hooks/useOrganizationMembers';
import { resolveError } from './i18n';
import type {
  OrganizationError,
  OrganizationMember,
  OrganizationMemberFilter,
  OrganizationMemberInviteOutcome,
  OrganizationMemberTeamRef,
  OrganizationTabProps,
  OrganizationTeam,
} from './types';

/**
 * People tab (ORG-024).
 *
 * Replaces the `people` placeholder in `organizationTabs.tsx`; the other
 * placeholder entries and `OrganizationDetailPanel` are untouched, so ORG-033
 * can still edit its own registry entry.
 *
 * Server contract notes
 * ---------------------
 * - **Filtering and paging are server-side.** Every control patches
 *   `OrganizationMemberFilter` and the read is re-issued, because filtering the
 *   loaded page on the client would make `paging.total` and the page offsets
 *   disagree with the result set.
 * - **`businessUnitId` and `teams` are read-only.** They are derived server-side
 *   (the unit from the membership, the teams from `Team.members`), so the
 *   assignment dialog calls `addMemberToBusinessUnit` /
 *   `removeMemberFromBusinessUnit` and `addMemberToTeam` / `removeMemberFromTeam`
 *   (ORG-020/021) instead of writing a field that does not exist.
 * - **Invites are per-address.** There is no bulk mutation, so a pasted list is
 *   one call per address and every row keeps its own outcome.
 * - **Writes are hidden, not disabled.** `canManage === false` removes every
 *   write affordance; the server stays the authority through `AssertOrgAdmin`.
 * - **A write failure never replaces the list.** The page-level error banner is
 *   reserved for a failed *read*; a rejected mutation is reported by `notify`
 *   and, for invites, by the per-address result rows. Turning a duplicate
 *   invitation into "the members could not be loaded" would hide a table that
 *   is still valid and would leave the administrator nothing to act on.
 *
 * Unsaved input
 * -------------
 * `onUnsavedChanges(true)` while a dialog holds input that has not been
 * committed, and it is cleared only when the save/discard *completes*. A failed
 * save keeps the dialog (and the flag) in place — clearing it because a request
 * was attempted is the ORG-011 regression this tab must not repeat.
 */

interface RolesDraft {
  member: OrganizationMember;
  roles: string;
  initialRoles: string;
}

interface AssignDraft {
  member: OrganizationMember;
  businessUnitId: string;
  teamIds: string[];
  initialBusinessUnitId: string;
  initialTeamIds: string[];
}

interface InviteDraft {
  emails: string;
  roles: string;
  businessUnitId: string;
  /**
   * The values the last completed batch was sent with. The draft is clean when
   * it still matches them, so a committed batch leaves the dialog open (to show
   * its per-row results) without claiming to hold unsaved input.
   */
  baselineEmails: string;
  baselineRoles: string;
  baselineBusinessUnitId: string;
}

const statusOf = (member: OrganizationMember): string => {
  if (member && member.invited === true) return 'invited';
  const status = `${(member && member.status) || ''}`.trim().toLowerCase();
  if (status.length > 0) return status;
  return member && member.enabled === false ? 'deactivated' : 'active';
};

const isInvited = (member: OrganizationMember): boolean => statusOf(member) === 'invited';

const memberName = (member: OrganizationMember, fallback: string): string => {
  const first = `${(member && (member.firstName || (member.user && member.user.firstName))) || ''}`.trim();
  const last = `${(member && (member.lastName || (member.user && member.user.lastName))) || ''}`.trim();
  const joined = `${first} ${last}`.trim();
  if (joined.length > 0) return joined;
  return `${(member && (member.email || (member.user && member.user.email))) || fallback}`;
};

const memberEmail = (member: OrganizationMember): string =>
  `${(member && (member.email || (member.user && member.user.email))) || ''}`;

const memberAvatar = (member: OrganizationMember): string =>
  `${(member && (member.avatar || (member.user && member.user.avatar))) || ''}`;

const memberRowId = (member: OrganizationMember): string =>
  `${(member && (member.id || member.userId || member.email)) || ''}`;

const teamLabel = (team: OrganizationMemberTeamRef | OrganizationTeam): string =>
  `${(team && (team.name || (team as OrganizationTeam).title || team.id)) || ''}`;

const formatTimestamp = (value?: string | number | Date | null): string => {
  if (value === undefined || value === null || value === '') return '';

  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    date = new Date(value < 1e11 ? value * 1000 : value);
  } else {
    const numeric = Number(value);
    date =
      Number.isFinite(numeric) && `${value}`.trim() !== ''
        ? new Date(numeric < 1e11 ? numeric * 1000 : numeric)
        : new Date(value);
  }

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Comma (or newline) separated role text into a clean, deduplicated list. */
const parseRoles = (value?: string | null): string[] => {
  const seen = new Set<string>();
  const roles: string[] = [];

  `${value || ''}`
    .split(/[\n,]+/)
    .map((role) => role.trim())
    .filter((role) => role.length > 0)
    .forEach((role) => {
      const key = role.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      roles.push(role);
    });

  return roles;
};

const sameSet = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const source = new Set(left);
  return right.every((entry) => source.has(entry));
};

interface ChipListProps {
  values: string[];
  testId: string;
  /** How many chips fit before the "+N more" chip takes over. */
  limit?: number;
  hint?: string;
  /** Translated overflow label, so "+N more" is a catalogue string too. */
  moreLabel: (count: number) => string;
}

/**
 * A fixed-height chip list.
 *
 * `teams` is an array, so the column is given a bounded width and the remainder
 * collapses into a "+N more" chip with the full list in its tooltip. Chips wrap
 * as a second line of defence, so a long team name cannot push the table wider
 * than the viewport.
 */
const ChipList: React.FC<ChipListProps> = ({
  values,
  testId,
  limit = 2,
  hint,
  moreLabel,
}) => {
  if (values.length === 0) return null;

  const visible = values.slice(0, limit);
  const overflow = values.length - visible.length;

  return (
    <Tooltip title={hint || values.join(', ')}>
      <Stack
        direction="row"
        spacing={0.5}
        useFlexGap
        flexWrap="wrap"
        data-testid={testId}
        sx={{ maxWidth: 220 }}
      >
        {visible.map((value) => (
          <Chip key={value} size="small" variant="outlined" label={value} />
        ))}
        {overflow > 0 && (
          <Chip
            size="small"
            variant="outlined"
            label={moreLabel(overflow)}
            data-testid={`${testId}-more`}
          />
        )}
      </Stack>
    </Tooltip>
  );
};

export const OrganizationPeopleTab: React.FC<OrganizationTabProps> = ({
  reactory,
  t,
  organization,
  canManage,
  refresh,
  onUnsavedChanges,
  notify,
}) => {
  const people = useOrganizationMembers({
    reactory,
    organization,
  });

  const readOnly = canManage === false;

  const [submitting, setSubmitting] = useState(false);
  const [rolesDraft, setRolesDraft] = useState<RolesDraft | null>(null);
  const [assignDraft, setAssignDraft] = useState<AssignDraft | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<OrganizationMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OrganizationMember | null>(null);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft | null>(null);
  const [inviteOutcomes, setInviteOutcomes] = useState<OrganizationMemberInviteOutcome[] | null>(
    null,
  );

  /**
   * Unsaved input, computed from the open dialogs rather than tracked as a
   * second, independently mutable flag — there is then no way for the flag and
   * the form to disagree.
   */
  const dirty = useMemo(() => {
    if (rolesDraft) return rolesDraft.roles !== rolesDraft.initialRoles;
    if (assignDraft) {
      return (
        assignDraft.businessUnitId !== assignDraft.initialBusinessUnitId ||
        !sameSet(assignDraft.teamIds, assignDraft.initialTeamIds)
      );
    }
    if (inviteDraft) {
      return (
        inviteDraft.emails !== inviteDraft.baselineEmails ||
        inviteDraft.roles !== inviteDraft.baselineRoles ||
        inviteDraft.businessUnitId !== inviteDraft.baselineBusinessUnitId
      );
    }
    return false;
  }, [assignDraft, inviteDraft, rolesDraft]);

  useEffect(() => {
    onUnsavedChanges(dirty);
  }, [dirty, onUnsavedChanges]);

  // A tab switch unmounts the tab: the shell must stop guarding for a dialog
  // that no longer exists.
  useEffect(
    () => () => {
      onUnsavedChanges(false);
    },
    [onUnsavedChanges],
  );

  const notifyFailure = useCallback(
    (error: OrganizationError | null | undefined, fallbackKey: OrganizationError['key']) => {
      notify(error ? resolveError(t, error) : t(fallbackKey), 'error');
    },
    [notify, t],
  );

  /**
   * A successful write needs both reads: the tab's page (which the shell cannot
   * re-read) and the shell's organization counts. A failed reload must never be
   * reported as a failed write.
   */
  const safeRefresh = useCallback(async (): Promise<void> => {
    try {
      await people.refreshMembers();
    } catch {
      // The write already succeeded.
    }
    try {
      await refresh();
    } catch {
      // The write already succeeded.
    }
  }, [people.refreshMembers, refresh]);

  const roleOptions = useMemo(() => {
    const roles = new Set<string>();
    (people.members || []).forEach((member) => {
      (member.roles || []).forEach((role) => {
        if (role) roles.add(`${role}`);
      });
    });

    const current = people.filter && people.filter.role ? `${people.filter.role}` : '';
    if (current) roles.add(current);

    return Array.from(roles).sort((left, right) => left.localeCompare(right));
  }, [people.filter, people.members]);

  const selectedBusinessUnitId = (people.filter && people.filter.businessUnitId) || '';
  const selectedTeamId = (people.filter && people.filter.teamId) || '';
  const selectedStatus =
    people.filter && people.filter.status
      ? `${people.filter.status}`
      : people.filter && people.filter.includeDeactivated
        ? 'all'
        : 'active';

  const visibleTeams = useMemo(() => {
    if (!selectedBusinessUnitId) return people.teams;
    return people.teams.filter(
      (team) => `${(team.businessUnit && team.businessUnit.id) || ''}` === selectedBusinessUnitId,
    );
  }, [people.teams, selectedBusinessUnitId]);

  const updateFilter = useCallback(
    (patch: Partial<OrganizationMemberFilter>) => {
      people.setFilter(patch);
    },
    [people],
  );

  /* ---------------------------------------------------------------------- *
   * Role editing
   * ---------------------------------------------------------------------- */

  const openRoles = useCallback((member: OrganizationMember) => {
    const roles = (Array.isArray(member.roles) ? member.roles : []).join(', ');
    setRolesDraft({ member, roles, initialRoles: roles });
  }, []);

  const closeRoles = useCallback(() => setRolesDraft(null), []);

  const saveRoles = useCallback(async () => {
    const draft = rolesDraft;
    if (!draft || readOnly) return;

    const userId = `${draft.member.userId || ''}`;
    if (!userId) {
      notifyFailure(
        { key: 'reactory.organizations.error.memberSaveFailed' },
        'reactory.organizations.error.memberSaveFailed',
      );
      return;
    }

    const name = memberName(draft.member, t('reactory.organizations.people.nameUnknown'));
    const roles = parseRoles(draft.roles);

    setSubmitting(true);
    const result = await people.setMemberRoles(userId, roles);
    setSubmitting(false);

    if (!result.ok) {
      // The dialog stays open with the draft intact; the flag stays set.
      notifyFailure(result.error, 'reactory.organizations.error.memberSaveFailed');
      return;
    }

    setRolesDraft(null);
    notify(t('reactory.organizations.people.notify.rolesSaved', { name }), 'success');
    await safeRefresh();
  }, [notify, notifyFailure, people, readOnly, rolesDraft, safeRefresh, t]);

  /* ---------------------------------------------------------------------- *
   * Assignment (business unit + teams)
   * ---------------------------------------------------------------------- */

  const openAssign = useCallback((member: OrganizationMember) => {
    const businessUnitId = `${(member.businessUnit && member.businessUnit.id) || member.businessUnitId || ''}`;
    const teamIds = (Array.isArray(member.teamIds) ? member.teamIds : [])
      .map((teamId) => `${teamId}`)
      .filter((teamId) => teamId.length > 0);

    setAssignDraft({
      member,
      businessUnitId,
      teamIds,
      initialBusinessUnitId: businessUnitId,
      initialTeamIds: teamIds,
    });
  }, []);

  const closeAssign = useCallback(() => setAssignDraft(null), []);

  const assignTeams = useMemo(() => {
    if (!assignDraft) return [] as OrganizationTeam[];
    if (!assignDraft.businessUnitId) return people.teams;
    return people.teams.filter(
      (team) =>
        `${(team.businessUnit && team.businessUnit.id) || ''}` === assignDraft.businessUnitId,
    );
  }, [assignDraft, people.teams]);

  const toggleAssignTeam = useCallback((teamId: string) => {
    setAssignDraft((current) => {
      if (!current) return current;
      const selected = current.teamIds.indexOf(teamId) >= 0;
      return {
        ...current,
        teamIds: selected
          ? current.teamIds.filter((entry) => entry !== teamId)
          : [...current.teamIds, teamId],
      };
    });
  }, []);

  const saveAssignment = useCallback(async () => {
    const draft = assignDraft;
    if (!draft || readOnly) return;

    const name = memberName(draft.member, t('reactory.organizations.people.nameUnknown'));

    setSubmitting(true);
    const result = await people.assignMember(draft.member, {
      businessUnitId: draft.businessUnitId || null,
      teamIds: draft.teamIds,
    });
    setSubmitting(false);

    if (!result.ok) {
      notifyFailure(result.error, 'reactory.organizations.error.memberAssignFailed');
      return;
    }

    setAssignDraft(null);
    notify(t('reactory.organizations.people.notify.assigned', { name }), 'success');
    await safeRefresh();
  }, [assignDraft, notify, notifyFailure, people, readOnly, safeRefresh, t]);

  /* ---------------------------------------------------------------------- *
   * Deactivate / remove
   * ---------------------------------------------------------------------- */

  const confirmDeactivate = useCallback(async () => {
    const member = deactivateTarget;
    if (!member || readOnly) return;

    const userId = `${member.userId || ''}`;
    if (!userId) return;

    const name = memberName(member, t('reactory.organizations.people.nameUnknown'));

    setSubmitting(true);
    const result = await people.deactivateMember(userId);
    setSubmitting(false);

    if (!result.ok) {
      notifyFailure(result.error, 'reactory.organizations.error.memberSaveFailed');
      return;
    }

    setDeactivateTarget(null);
    notify(t('reactory.organizations.people.notify.deactivated', { name }), 'success');
    await safeRefresh();
  }, [deactivateTarget, notify, notifyFailure, people, readOnly, safeRefresh, t]);

  const confirmRemove = useCallback(async () => {
    const member = removeTarget;
    if (!member || readOnly) return;

    const userId = `${member.userId || ''}`;
    if (!userId) return;

    const name = memberName(member, t('reactory.organizations.people.nameUnknown'));

    setSubmitting(true);
    const result = await people.removeMember(userId);
    setSubmitting(false);

    if (!result.ok) {
      notifyFailure(result.error, 'reactory.organizations.error.memberSaveFailed');
      return;
    }

    setRemoveTarget(null);
    notify(t('reactory.organizations.people.notify.removed', { name }), 'success');
    await safeRefresh();
  }, [notify, notifyFailure, people, readOnly, removeTarget, safeRefresh, t]);

  /* ---------------------------------------------------------------------- *
   * Invite (single address and pasted batch share one path)
   * ---------------------------------------------------------------------- */

  const openInvite = useCallback(() => {
    setInviteOutcomes(null);
    setInviteDraft({
      emails: '',
      roles: '',
      businessUnitId: '',
      baselineEmails: '',
      baselineRoles: '',
      baselineBusinessUnitId: '',
    });
  }, []);

  const closeInvite = useCallback(() => {
    setInviteDraft(null);
    setInviteOutcomes(null);
  }, []);

  const submitInvites = useCallback(async () => {
    const draft = inviteDraft;
    if (!draft || readOnly) return;

    const emails = parseInviteEmails(draft.emails);
    if (emails.length === 0) {
      notify(t('reactory.organizations.people.invite.emailsRequired'), 'error');
      return;
    }

    setSubmitting(true);
    // Sequential, per-address: one rejection must not discard the others.
    const outcomes = await people.inviteMembers(emails, {
      roles: parseRoles(draft.roles),
      businessUnitId: draft.businessUnitId || null,
    });
    setSubmitting(false);

    setInviteOutcomes(outcomes);

    const invited = outcomes.filter((outcome) => outcome.status === 'invited').length;
    const failed = outcomes.length - invited;

    if (invited > 0) {
      notify(
        failed > 0
          ? t('reactory.organizations.people.notify.bulkPartial', { invited, failed })
          : outcomes.length === 1
            ? t('reactory.organizations.people.notify.invited', { name: outcomes[0].email })
            : t('reactory.organizations.people.notify.bulkInvited', { count: invited }),
        failed > 0 ? 'warning' : 'success',
      );
    } else if (failed > 0) {
      const first = outcomes.find((outcome) => outcome.message);
      notify(
        (first && first.message) || t('reactory.organizations.error.memberInviteFailed'),
        'error',
      );
    }

    // The batch is committed: mark the draft clean, but keep the text and the
    // results so the administrator can read what happened.
    setInviteDraft((current) =>
      current
        ? {
            ...current,
            baselineEmails: current.emails,
            baselineRoles: current.roles,
            baselineBusinessUnitId: current.businessUnitId,
          }
        : current,
    );

    if (invited > 0) await safeRefresh();
  }, [inviteDraft, notify, people, readOnly, safeRefresh, t]);

  const inviteOutcomeLabel = useCallback(
    (outcome: OrganizationMemberInviteOutcome): string => {
      if (outcome.status === 'invited') {
        return t('reactory.organizations.people.invite.result.invited');
      }
      if (outcome.status === 'already-member') {
        return t('reactory.organizations.people.invite.result.alreadyMember');
      }
      if (outcome.status === 'invalid-email') {
        return t('reactory.organizations.people.invite.result.invalidEmail');
      }
      return t('reactory.organizations.people.invite.result.error');
    },
    [t],
  );

  /* ---------------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------------- */

  const total = people.paging.total;
  const hasRows = people.members.length > 0;

  return (
    <Stack spacing={2} data-testid="organization-people">
      {people.error && (
        <Alert
          severity="error"
          data-testid="organization-people-load-error"
          action={
            <Button color="inherit" size="small" onClick={() => void people.refreshMembers()}>
              {t('reactory.organizations.list.retry')}
            </Button>
          }
        >
          {resolveError(t, people.error)}
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
                  {t('reactory.organizations.people.title')}
                </Typography>
                {people.loading && (
                  <CircularProgress size={16} data-testid="organization-people-loading" />
                )}
                <Chip
                  size="small"
                  variant="outlined"
                  label={t('reactory.organizations.people.total', { count: total })}
                  data-testid="organization-people-total"
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {t('reactory.organizations.people.hint')}
              </Typography>
            </Box>

            {!readOnly && (
              <Button
                size="small"
                variant="contained"
                startIcon={<InviteIcon />}
                disabled={submitting}
                data-testid="people-invite-open"
                onClick={openInvite}
              >
                {t('reactory.organizations.people.invite.open')}
              </Button>
            )}
          </Stack>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            sx={{ mt: 2 }}
            alignItems={{ xs: 'stretch', md: 'center' }}
          >
            <TextField
              size="small"
              fullWidth
              label={t('reactory.organizations.people.search')}
              placeholder={t('reactory.organizations.people.searchPlaceholder')}
              value={people.searchInput}
              onChange={(event) => people.setSearch(event.target.value)}
              inputProps={{ 'data-testid': 'people-search' }}
            />

            <TextField
              select
              size="small"
              label={t('reactory.organizations.people.roleFilter')}
              value={people.filter.role || ''}
              onChange={(event) => updateFilter({ role: event.target.value || null })}
              inputProps={{ 'data-testid': 'people-role-filter' }}
              sx={{ minWidth: 160 }}
              helperText={t('reactory.organizations.people.roleObservedHint')}
            >
              <MenuItem value="">{t('reactory.organizations.people.roleAll')}</MenuItem>
              {roleOptions.map((role) => (
                <MenuItem key={role} value={role}>
                  {role}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label={t('reactory.organizations.people.statusFilter')}
              value={selectedStatus}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'all') {
                  updateFilter({ status: null, includeDeactivated: true });
                  return;
                }
                updateFilter({ status: value, includeDeactivated: false });
              }}
              inputProps={{ 'data-testid': 'people-status-filter' }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="active">{t('reactory.organizations.people.status.active')}</MenuItem>
              <MenuItem value="deactivated">
                {t('reactory.organizations.people.status.deactivated')}
              </MenuItem>
              <MenuItem value="invited">{t('reactory.organizations.people.status.invited')}</MenuItem>
              <MenuItem value="all">{t('reactory.organizations.people.status.all')}</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label={t('reactory.organizations.people.businessUnitFilter')}
              value={selectedBusinessUnitId}
              onChange={(event) =>
                // A team belongs to a unit, so keeping a team selected while the
                // unit changes would silently return nothing.
                updateFilter({ businessUnitId: event.target.value || null, teamId: null })
              }
              inputProps={{ 'data-testid': 'people-business-unit-filter' }}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">{t('reactory.organizations.people.businessUnitAll')}</MenuItem>
              {people.businessUnits.map((unit) => (
                <MenuItem key={`${unit.id}`} value={`${unit.id}`}>
                  {`${unit.name || unit.id}`}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label={t('reactory.organizations.people.teamFilter')}
              value={selectedTeamId}
              onChange={(event) => updateFilter({ teamId: event.target.value || null })}
              inputProps={{ 'data-testid': 'people-team-filter' }}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">{t('reactory.organizations.people.teamAll')}</MenuItem>
              {visibleTeams.map((team) => (
                <MenuItem key={`${team.id}`} value={`${team.id}`}>
                  {teamLabel(team)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {!people.loading && !hasRows && (
        <Alert severity="info" variant="outlined" data-testid="organization-people-empty">
          {readOnly
            ? t('reactory.organizations.people.emptyReadOnly')
            : `${t('reactory.organizations.people.empty')}. ${t(
                'reactory.organizations.people.emptyHint',
              )}`}
        </Alert>
      )}

      {hasRows && (
        <TableContainer component={Card} variant="outlined">
          <Table size="small" data-testid="people-table">
            <TableHead>
              <TableRow>
                <TableCell>{t('reactory.organizations.people.column.member')}</TableCell>
                <TableCell>{t('reactory.organizations.people.column.email')}</TableCell>
                <TableCell>{t('reactory.organizations.people.column.roles')}</TableCell>
                <TableCell>{t('reactory.organizations.people.column.businessUnit')}</TableCell>
                <TableCell>{t('reactory.organizations.people.column.teams')}</TableCell>
                <TableCell>{t('reactory.organizations.people.column.status')}</TableCell>
                <TableCell>{t('reactory.organizations.people.column.lastLogin')}</TableCell>
                {!readOnly && (
                  <TableCell align="right">
                    {t('reactory.organizations.people.column.actions')}
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {people.members.map((member) => {
                const rowId = memberRowId(member);
                const name = memberName(
                  member,
                  t('reactory.organizations.people.nameUnknown'),
                );
                const email = memberEmail(member);
                const avatar = memberAvatar(member);
                const roles = (Array.isArray(member.roles) ? member.roles : [])
                  .map((role) => `${role}`)
                  .filter((role) => role.length > 0);
                const status = statusOf(member);
                const invited = isInvited(member);
                const businessUnit =
                  (member.businessUnit && member.businessUnit.name) || member.businessUnitId || '';
                const teams = (Array.isArray(member.teams) ? member.teams : []).filter(
                  (team) => Boolean(team),
                );
                const lastLogin = formatTimestamp(member.lastLogin);
                const actionable = !readOnly && Boolean(member.userId) && !invited;

                return (
                  <TableRow
                    key={rowId}
                    data-testid={`people-row-${rowId}`}
                    data-status={status}
                    hover
                  >
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar src={avatar || undefined} sx={{ height: 28, width: 28 }}>
                          {name.slice(0, 1).toUpperCase()}
                        </Avatar>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                          {name}
                        </Typography>
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {email || t('reactory.organizations.people.notSet')}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      {roles.length > 0 ? (
                        <ChipList
                          values={roles}
                          testId={`people-roles-${rowId}`}
                          hint={roles.join(', ')}
                          moreLabel={(count) =>
                            t('reactory.organizations.people.more', { count })
                          }
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          {t('reactory.organizations.people.rolesNone')}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {`${businessUnit}`.length > 0
                          ? businessUnit
                          : t('reactory.organizations.people.unassigned')}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      {teams.length > 0 ? (
                        <ChipList
                          values={teams.map((team) => teamLabel(team))}
                          testId={`people-teams-${rowId}`}
                          hint={t('reactory.organizations.people.teamsHint', {
                            count: teams.length,
                            names: teams.map((team) => teamLabel(team)).join(', '),
                          })}
                          moreLabel={(count) =>
                            t('reactory.organizations.people.more', { count })
                          }
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          {t('reactory.organizations.people.notSet')}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Chip
                          size="small"
                          color={
                            status === 'active'
                              ? 'success'
                              : status === 'invited'
                                ? 'info'
                                : 'default'
                          }
                          variant={status === 'active' ? 'filled' : 'outlined'}
                          data-testid={`people-status-${rowId}`}
                          label={t(
                            status === 'invited'
                              ? 'reactory.organizations.people.status.invited'
                              : status === 'deactivated'
                                ? 'reactory.organizations.people.status.deactivated'
                                : 'reactory.organizations.people.status.active',
                          )}
                        />
                        {invited && (
                          <Typography variant="caption" color="text.secondary">
                            {t('reactory.organizations.people.invited')}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {lastLogin || t('reactory.organizations.people.never')}
                      </Typography>
                    </TableCell>

                    {!readOnly && (
                      <TableCell align="right">
                        {actionable && (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip
                              title={t('reactory.organizations.people.action.roles', { name })}
                            >
                              <IconButton
                                size="small"
                                disabled={submitting}
                                aria-label={t('reactory.organizations.people.action.roles', {
                                  name,
                                })}
                                data-testid={`people-roles-open-${rowId}`}
                                onClick={() => openRoles(member)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>

                            <Tooltip
                              title={t('reactory.organizations.people.action.assign', { name })}
                            >
                              <IconButton
                                size="small"
                                disabled={submitting}
                                aria-label={t('reactory.organizations.people.action.assign', {
                                  name,
                                })}
                                data-testid={`people-assign-open-${rowId}`}
                                onClick={() => openAssign(member)}
                              >
                                <AssignIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>

                            <Tooltip
                              title={t('reactory.organizations.people.action.deactivate', {
                                name,
                              })}
                            >
                              <IconButton
                                size="small"
                                disabled={submitting}
                                aria-label={t('reactory.organizations.people.action.deactivate', {
                                  name,
                                })}
                                data-testid={`people-deactivate-open-${rowId}`}
                                onClick={() => setDeactivateTarget(member)}
                              >
                                <DeactivateIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>

                            <Tooltip
                              title={t('reactory.organizations.people.action.remove', { name })}
                            >
                              <IconButton
                                size="small"
                                color="error"
                                disabled={submitting}
                                aria-label={t('reactory.organizations.people.action.remove', {
                                  name,
                                })}
                                data-testid={`people-remove-open-${rowId}`}
                                onClick={() => setRemoveTarget(member)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={total}
            page={Math.max(0, people.paging.page - 1)}
            rowsPerPage={people.paging.pageSize}
            rowsPerPageOptions={[10, 25, 50]}
            onPageChange={(_event, next) => people.setPage(next + 1)}
            onRowsPerPageChange={(event) => people.setPageSize(Number(event.target.value))}
            labelRowsPerPage={t('reactory.organizations.people.rowsPerPage')}
            labelDisplayedRows={({ from, to, count }) =>
              t('reactory.organizations.people.displayedRows', { from, to, count })
            }
          />
        </TableContainer>
      )}

      {/* ------------------------------------------------------------------ *
       * Roles
       * ------------------------------------------------------------------ */}
      <Dialog open={rolesDraft !== null} onClose={closeRoles} fullWidth maxWidth="sm">
        <DialogTitle>
          {t('reactory.organizations.people.roles.title', {
            name: rolesDraft
              ? memberName(rolesDraft.member, t('reactory.organizations.people.nameUnknown'))
              : '',
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('reactory.organizations.people.roles.body')}
          </DialogContentText>
          <TextField
            fullWidth
            autoFocus
            multiline
            minRows={2}
            label={t('reactory.organizations.people.roles.field')}
            placeholder={t('reactory.organizations.people.roles.placeholder')}
            value={rolesDraft ? rolesDraft.roles : ''}
            onChange={(event) =>
              setRolesDraft((current) =>
                current ? { ...current, roles: event.target.value } : current,
              )
            }
            inputProps={{ 'data-testid': 'people-roles-input' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRoles} disabled={submitting}>
            {t('reactory.organizations.people.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveRoles()}
            disabled={submitting}
            data-testid="people-roles-save"
          >
            {submitting
              ? t('reactory.organizations.people.saving')
              : t('reactory.organizations.people.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ------------------------------------------------------------------ *
       * Assignment
       * ------------------------------------------------------------------ */}
      <Dialog open={assignDraft !== null} onClose={closeAssign} fullWidth maxWidth="sm">
        <DialogTitle>
          {t('reactory.organizations.people.assign.title', {
            name: assignDraft
              ? memberName(assignDraft.member, t('reactory.organizations.people.nameUnknown'))
              : '',
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('reactory.organizations.people.assign.body')}
          </DialogContentText>

          <Stack spacing={2}>
            <TextField
              select
              fullWidth
              label={t('reactory.organizations.people.assign.businessUnit')}
              value={assignDraft ? assignDraft.businessUnitId : ''}
              onChange={(event) =>
                setAssignDraft((current) =>
                  current ? { ...current, businessUnitId: event.target.value } : current,
                )
              }
              inputProps={{ 'data-testid': 'people-assign-business-unit' }}
            >
              <MenuItem value="">{t('reactory.organizations.people.unassigned')}</MenuItem>
              {people.businessUnits.map((unit) => (
                <MenuItem key={`${unit.id}`} value={`${unit.id}`}>
                  {`${unit.name || unit.id}`}
                </MenuItem>
              ))}
            </TextField>

            <Box>
              <Typography variant="subtitle2" component="h3">
                {t('reactory.organizations.people.assign.teams')}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('reactory.organizations.people.assign.teamsHint')}
              </Typography>

              {assignTeams.length === 0 ? (
                <Alert
                  severity="info"
                  variant="outlined"
                  sx={{ mt: 1 }}
                  data-testid="people-assign-no-teams"
                >
                  {t('reactory.organizations.people.assign.teamsEmpty')}
                </Alert>
              ) : (
                <Box data-testid="people-assign-teams" sx={{ mt: 1 }}>
                  {assignTeams.map((team) => {
                    const teamId = `${team.id}`;
                    const checked = Boolean(
                      assignDraft && assignDraft.teamIds.indexOf(teamId) >= 0,
                    );
                    return (
                      <FormControlLabel
                        key={teamId}
                        control={
                          <Checkbox
                            size="small"
                            checked={checked}
                            onChange={() => toggleAssignTeam(teamId)}
                            // The accessible name is the team label, which is how
                            // the suite selects it (MUI renders a checkbox, not
                            // a switch, whatever the control looks like).
                            inputProps={{ 'aria-label': teamLabel(team) }}
                          />
                        }
                        label={teamLabel(team)}
                      />
                    );
                  })}
                </Box>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAssign} disabled={submitting}>
            {t('reactory.organizations.people.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveAssignment()}
            disabled={submitting}
            data-testid="people-assign-save"
          >
            {submitting
              ? t('reactory.organizations.people.saving')
              : t('reactory.organizations.people.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ------------------------------------------------------------------ *
       * Deactivate
       * ------------------------------------------------------------------ */}
      <Dialog open={deactivateTarget !== null} onClose={() => setDeactivateTarget(null)}>
        <DialogTitle>
          {t('reactory.organizations.people.deactivate.title', {
            name: deactivateTarget
              ? memberName(deactivateTarget, t('reactory.organizations.people.nameUnknown'))
              : '',
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{t('reactory.organizations.people.deactivate.body')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateTarget(null)} disabled={submitting}>
            {t('reactory.organizations.people.cancel')}
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => void confirmDeactivate()}
            disabled={submitting}
            data-testid="people-deactivate-confirm"
          >
            {t('reactory.organizations.people.deactivate.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ------------------------------------------------------------------ *
       * Remove (destructive)
       * ------------------------------------------------------------------ */}
      <Dialog open={removeTarget !== null} onClose={() => setRemoveTarget(null)}>
        <DialogTitle>
          {t('reactory.organizations.people.remove.title', {
            name: removeTarget
              ? memberName(removeTarget, t('reactory.organizations.people.nameUnknown'))
              : '',
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{t('reactory.organizations.people.remove.body')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveTarget(null)} disabled={submitting}>
            {t('reactory.organizations.people.cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void confirmRemove()}
            disabled={submitting}
            data-testid="people-remove-confirm"
          >
            {t('reactory.organizations.people.remove.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ------------------------------------------------------------------ *
       * Invite (one address or a pasted batch)
       * ------------------------------------------------------------------ */}
      <Dialog open={inviteDraft !== null} onClose={closeInvite} fullWidth maxWidth="sm">
        <DialogTitle>{t('reactory.organizations.people.invite.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('reactory.organizations.people.invite.body')}
          </DialogContentText>

          <Stack spacing={2}>
            <TextField
              fullWidth
              autoFocus
              multiline
              minRows={3}
              label={t('reactory.organizations.people.invite.emails')}
              placeholder={t('reactory.organizations.people.invite.emailsPlaceholder')}
              value={inviteDraft ? inviteDraft.emails : ''}
              onChange={(event) =>
                setInviteDraft((current) =>
                  current ? { ...current, emails: event.target.value } : current,
                )
              }
              inputProps={{ 'data-testid': 'people-invite-emails' }}
            />

            <TextField
              fullWidth
              label={t('reactory.organizations.people.invite.roles')}
              value={inviteDraft ? inviteDraft.roles : ''}
              onChange={(event) =>
                setInviteDraft((current) =>
                  current ? { ...current, roles: event.target.value } : current,
                )
              }
              inputProps={{ 'data-testid': 'people-invite-roles' }}
            />

            <TextField
              select
              fullWidth
              label={t('reactory.organizations.people.invite.businessUnit')}
              value={inviteDraft ? inviteDraft.businessUnitId : ''}
              onChange={(event) =>
                setInviteDraft((current) =>
                  current ? { ...current, businessUnitId: event.target.value } : current,
                )
              }
              inputProps={{ 'data-testid': 'people-invite-business-unit' }}
            >
              <MenuItem value="">{t('reactory.organizations.people.unassigned')}</MenuItem>
              {people.businessUnits.map((unit) => (
                <MenuItem key={`${unit.id}`} value={`${unit.id}`}>
                  {`${unit.name || unit.id}`}
                </MenuItem>
              ))}
            </TextField>

            {inviteOutcomes && inviteOutcomes.length > 0 && (
              <Box data-testid="people-invite-results">
                <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
                  {t('reactory.organizations.people.invite.results')}
                </Typography>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {inviteOutcomes.map((outcome) => (
                    <Box
                      component="li"
                      key={outcome.email}
                      data-testid={`people-invite-result-${outcome.email}`}
                      data-status={outcome.status}
                      sx={{
                        alignItems: 'flex-start',
                        borderTop: 1,
                        borderColor: 'divider',
                        display: 'flex',
                        gap: 1,
                        justifyContent: 'space-between',
                        py: 0.75,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap>
                          {outcome.email}
                        </Typography>
                        {outcome.message && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {outcome.message}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={
                          outcome.status === 'invited'
                            ? 'success'
                            : outcome.status === 'already-member'
                              ? 'warning'
                              : 'error'
                        }
                        label={inviteOutcomeLabel(outcome)}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeInvite} disabled={submitting}>
            {t('reactory.organizations.people.close')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void submitInvites()}
            disabled={submitting}
            data-testid="people-invite-submit"
          >
            {submitting
              ? t('reactory.organizations.people.invite.sending')
              : t('reactory.organizations.people.invite.submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

OrganizationPeopleTab.displayName = 'OrganizationPeopleTab';

export default OrganizationPeopleTab;
