import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import {
  ArchiveOutlined as ArchiveOutlinedIcon,
  ArrowBack as ArrowBackIcon,
  ContentCopyOutlined as ContentCopyOutlinedIcon,
  MoreVert as MoreVertIcon,
  RestoreOutlined as RestoreOutlinedIcon,
} from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

import OrganizationStatusChip from './components/OrganizationStatusChip';
import { makeTranslator, resolveError } from './i18n';
import { ORGANIZATION_TABS, organizationTabById, OVERVIEW_TAB_ID } from './organizationTabs';
import useOrganizationDetail, { resolveOrganizationId } from './hooks/useOrganizationDetail';
import useOrganizationAdmin from './hooks/useOrganizationAdmin';
import type { OrganizationNotifyType } from './types';
import { organizationStatus, resolveOrganizationPermissions } from './utils';

export interface OrganizationDetailPanelProps {
  reactory?: any;
  /** Route argument. */
  id?: string;
  /** Alternative route-argument name used by some route configs. */
  organizationId?: string;
  /** Called by the back action; defaults to navigating to `/organizations`. */
  onBack?: () => void;
}

/** Event emitted after any write, so hosts can refresh their own projections. */
export const ORGANIZATION_UPDATED_EVENT = 'core.OrganizationUpdatedEvent';

/** Re-exported so route helpers and tests have one import site. */
export { organizationIdFromPath } from './utils';

const initials = (name?: string | null): string =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

/**
 * Organization detail shell (ORG-011).
 *
 * Layout only: `useOrganizationDetail` owns the reads (plus loading, error and
 * not-found state) and `useOrganizationAdmin` owns every write. What this
 * component adds is the frame — an identity header with key metrics, a tab bar
 * driven by `ORGANIZATION_TABS`, and the guards around leaving with unsaved
 * changes.
 *
 * Extending it
 * ------------
 * `ORGANIZATION_TABS` is the extension point. Every tab is an
 * `OrganizationTabProps` component rendered through the same code path, so a
 * later ticket (ORG-013 branding, ORG-022 structure, ORG-024 people, ORG-031
 * demographics, settings) adds one registry entry and never touches this file.
 *
 * Permission handling
 * -------------------
 * Archive and restore are org-admin operations. The check reuses
 * `resolveOrganizationPermissions` — the helper the list panel already uses —
 * and resolves it **for this organization**, because an ORGANIZATION_ADMIN is
 * normally granted through a membership rather than a platform role. A
 * read-only viewer still sees the panel (the server serves them the read) but
 * is offered no write affordance anywhere: no archive/restore, and the Overview
 * tab renders its fields disabled with no Save.
 */
export const OrganizationDetailPanel: React.FC<OrganizationDetailPanelProps> = ({
  reactory: propReactory,
  id,
  organizationId,
  onBack,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;
  const t = makeTranslator(reactory);

  const resolvedId = resolveOrganizationId(reactory, id || organizationId);
  const { organization, statistics, loadState, error, isLoading, refresh } =
    useOrganizationDetail({ reactory, organizationId: resolvedId });
  const admin = useOrganizationAdmin(reactory);
  const permissions = useMemo(() => resolveOrganizationPermissions(reactory), [reactory]);

  const [activeTabId, setActiveTabId] = useState<string>(OVERVIEW_TAB_ID);
  /**
   * Unsaved input, as reported by the mounted tab.
   *
   * **This is a mirror, never an authority.** The tab owns the fact and reports
   * it through `OrganizationTabProps.onUnsavedChanges`; the shell only reads it
   * to decide whether to ask before an action. It is deliberately *not* set to
   * `false` anywhere the tab keeps running: the tab reports on change, so a
   * shell-side clear could not be corrected and the guard would silently stop
   * guarding (review round 1). Only three things clear it — the tab reporting a
   * clean form (save, cancel, reload), the tab unmounting, and a route change to
   * a different organization.
   */
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  /**
   * Action to run once the user agrees to go ahead despite unsaved input.
   *
   * `reloads` distinguishes the two reasons the shell asks: a navigation (the
   * edit is definitely lost) from an action that reloads the organization (the
   * edit is lost only if that action succeeds). The wording differs, because
   * the archive dialog can still be cancelled.
   */
  const [pendingAction, setPendingAction] = useState<{
    run: () => void;
    reloads: boolean;
  } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const notify = useCallback(
    (message: string, type: OrganizationNotifyType = 'success') => {
      if (reactory && typeof reactory.createNotification === 'function') {
        reactory.createNotification(message, {
          type,
          canDismiss: true,
          timeout: type === 'error' ? 6000 : 4000,
          showInAppNotification: true,
        });
      }
    },
    [reactory],
  );

  const canManage = useMemo(
    () => (organization ? permissions.canManageOrganization(organization.id) : false),
    [organization, permissions],
  );

  const archived = organization ? organizationStatus(organization) === 'archived' : false;

  /**
   * Run an action, or ask first when the mounted tab holds unsaved input.
   *
   * Used for tab switches, Back and the archive/restore actions: each of them
   * would otherwise discard a half-finished edit without telling the user.
   * `reloads` selects the wording only — it never decides whether the guard
   * fires, so an action cannot opt out of the warning.
   */
  const guard = useCallback(
    (run: () => void, reloads = false) => {
      if (unsavedChanges) {
        setPendingAction({ run, reloads });
        return;
      }
      run();
    },
    [unsavedChanges],
  );

  const navigateBack = useCallback(() => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    if (reactory && typeof reactory.navigation === 'function') {
      reactory.navigation('/organizations');
    }
  }, [onBack, reactory]);

  const handleBack = useCallback(() => guard(navigateBack), [guard, navigateBack]);

  const handleTabChange = useCallback(
    (nextTabId: string) => {
      if (nextTabId === activeTabId) return;
      // No shell-side clear: switching tabs unmounts the current tab, and its
      // unmount report is what tells the shell the edit is gone.
      guard(() => setActiveTabId(nextTabId));
    },
    [activeTabId, guard],
  );

  /**
   * Run the pending action.
   *
   * Deliberately does **not** touch `unsavedChanges`. The action may not discard
   * anything — the archive dialog can be cancelled, and an archive/restore
   * mutation can fail — in which case the form still holds the edit and the
   * shell must keep guarding it. When the action does take the form away, the
   * tab's own unmount/report clears the flag.
   */
  const confirmDiscard = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    if (action) action.run();
  }, [pendingAction]);

  const keepEditing = useCallback(() => setPendingAction(null), []);

  const closeMenu = useCallback(() => setMenuAnchor(null), []);

  const handleCopyId = useCallback(async () => {
    if (!organization) return;

    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(organization.id);
        notify(t('reactory.organizations.detail.copyIdSuccess'), 'success');
        return;
      }
    } catch {
      // Fall through to the informational message; nothing was copied.
    }

    notify(t('reactory.organizations.detail.copyIdUnavailable'), 'info');
  }, [notify, organization, t]);

  const performArchive = useCallback(async () => {
    if (!organization) return;

    const result = await admin.archive([organization.id]);
    setArchiveOpen(false);

    if (result.failed.length === 0) {
      notify(
        t('reactory.organizations.archive.success', {
          count: result.succeeded.length || 1,
        }),
        'success',
      );
      if (reactory && typeof reactory.emit === 'function') {
        reactory.emit(ORGANIZATION_UPDATED_EVENT, { id: organization.id, status: 'archived' });
      }
      await refresh();
      return;
    }

    notify(
      resolveError(t, result.failed[0]?.error) || t('reactory.organizations.archive.failed'),
      'error',
    );
  }, [admin, notify, organization, reactory, refresh, t]);

  const performRestore = useCallback(async () => {
    if (!organization) return;

    const result = await admin.restore(organization.id);

    if (result.organization) {
      notify(
        t('reactory.organizations.restore.success', { name: result.organization.name || organization.name }),
        'success',
      );
      if (reactory && typeof reactory.emit === 'function') {
        reactory.emit(ORGANIZATION_UPDATED_EVENT, result.organization);
      }
      await refresh();
      return;
    }

    notify(
      resolveError(t, result.error) ||
        t('reactory.organizations.restore.failed', { name: organization.name }),
      'error',
    );
  }, [admin, notify, organization, reactory, refresh, t]);

  // A browser-level reload or tab close cannot be intercepted by the shell's
  // dialog, but the browser can still ask the user to confirm.
  useEffect(() => {
    if (!unsavedChanges || typeof window === 'undefined') return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers require a truthy returnValue.
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedChanges]);

  // A different organization is a different form: never carry the guard (or an
  // open dialog) across a route change.
  useEffect(() => {
    setUnsavedChanges(false);
    setPendingAction(null);
    setActiveTabId(OVERVIEW_TAB_ID);
  }, [resolvedId]);

  const metric = (key: string, label: string, value?: number | null) => (
    <Box key={key} sx={{ minWidth: 72 }} data-testid={`organization-metric-${key}`}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="h6">
        {value === null || value === undefined ? t('reactory.organizations.list.notSet') : value}
      </Typography>
    </Box>
  );

  const activeTab = organizationTabById(activeTabId);
  const ActiveTabComponent = activeTab.component;

  return (
    <Box sx={{ width: '100%' }}>
      <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
        {t('reactory.organizations.detail.back')}
      </Button>

      {isLoading && (
        <Stack direction="row" spacing={1.5} alignItems="center" role="status">
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            {t('reactory.organizations.detail.loading')}
          </Typography>
        </Stack>
      )}

      {loadState === 'error' && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refresh()}>
              {t('reactory.organizations.detail.retry')}
            </Button>
          }
        >
          <AlertTitle>{t('reactory.organizations.detail.error')}</AlertTitle>
          {resolveError(t, error)}
        </Alert>
      )}

      {loadState === 'success' && !organization && (
        <Alert severity="info">
          <AlertTitle>{t('reactory.organizations.detail.notFound')}</AlertTitle>
          {t('reactory.organizations.detail.notFoundHint')}
        </Alert>
      )}

      {loadState === 'success' && organization && (
        <Stack spacing={3}>
          <Card variant="outlined">
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <Avatar
                  src={organization.avatarURL || organization.logoURL || undefined}
                  alt={organization.name}
                  sx={{ width: 64, height: 64 }}
                >
                  {initials(organization.name) || undefined}
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h5" component="h1">
                    {organization.name}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    <Box component="span" data-testid="organization-detail-status">
                      <OrganizationStatusChip status={organization.status} t={t} />
                    </Box>
                    {organization.code && (
                      <Chip size="small" variant="outlined" label={organization.code} />
                    )}
                    {organization.tradingName && (
                      <Chip size="small" variant="outlined" label={organization.tradingName} />
                    )}
                  </Stack>
                </Box>

                <Stack direction="row" spacing={2} alignItems="center">
                  {metric('members', t('reactory.organizations.detail.members'), statistics?.members)}
                  {metric(
                    'businessUnits',
                    t('reactory.organizations.detail.businessUnits'),
                    statistics?.businessUnits,
                  )}
                  {metric('teams', t('reactory.organizations.detail.teams'), statistics?.teams)}

                  <IconButton
                    aria-label={t('reactory.organizations.detail.actions')}
                    aria-haspopup="menu"
                    onClick={(event) => setMenuAnchor(event.currentTarget)}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </Stack>
              </Stack>

              {organization.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  {organization.description}
                </Typography>
              )}
            </CardContent>
          </Card>

          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={activeTab.id}
              onChange={(_event, value) => handleTabChange(`${value}`)}
              variant="scrollable"
              scrollButtons="auto"
              aria-label={t('reactory.organizations.detail.tabs')}
            >
              {ORGANIZATION_TABS.map((tab) => (
                <Tab
                  key={tab.id}
                  value={tab.id}
                  icon={tab.icon}
                  iconPosition="start"
                  label={t(tab.labelKey)}
                />
              ))}
            </Tabs>
          </Box>

          <Box>
            <ActiveTabComponent
              reactory={reactory}
              t={t}
              organization={organization}
              statistics={statistics}
              canManage={canManage}
              refresh={refresh}
              onUnsavedChanges={setUnsavedChanges}
              notify={notify}
            />
          </Box>
        </Stack>
      )}

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {canManage && !archived && (
          <MenuItem
            onClick={() => {
              closeMenu();
              // A successful archive reloads the organization, which resets the
              // form — hence the warning, and the "reloads" wording.
              guard(() => setArchiveOpen(true), true);
            }}
          >
            <ListItemIcon>
              <ArchiveOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('reactory.organizations.detail.action.archive')}</ListItemText>
          </MenuItem>
        )}

        {canManage && archived && (
          <MenuItem
            onClick={() => {
              closeMenu();
              guard(() => void performRestore(), true);
            }}
          >
            <ListItemIcon>
              <RestoreOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('reactory.organizations.detail.action.restore')}</ListItemText>
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            closeMenu();
            void handleCopyId();
          }}
        >
          <ListItemIcon>
            <ContentCopyOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('reactory.organizations.detail.action.copyId')}</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog
        open={archiveOpen}
        onClose={() => {
          if (!admin.saving) setArchiveOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        aria-labelledby="organization-detail-archive-title"
      >
        <DialogTitle id="organization-detail-archive-title">
          {t('reactory.organizations.archive.title', { name: organization?.name || '' })}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('reactory.organizations.archive.reversibleHint')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveOpen(false)} disabled={admin.saving}>
            {t('reactory.organizations.archive.cancel')}
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => void performArchive()}
            disabled={admin.saving}
          >
            {t('reactory.organizations.archive.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/*
        Two truths, two messages. Leaving a tab always discards the edit; an
        archive or restore only does so if it succeeds, and can still be
        cancelled — so that confirmation must not promise a discard.
      */}
      <Dialog
        open={Boolean(pendingAction)}
        onClose={keepEditing}
        maxWidth="xs"
        fullWidth
        aria-labelledby="organization-detail-unsaved-title"
      >
        <DialogTitle id="organization-detail-unsaved-title">
          {pendingAction && pendingAction.reloads
            ? t('reactory.organizations.detail.unsaved.reloadTitle')
            : t('reactory.organizations.detail.unsaved.title')}
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {pendingAction && pendingAction.reloads
              ? t('reactory.organizations.detail.unsaved.reloadBody')
              : t('reactory.organizations.detail.unsaved.body')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={keepEditing}>
            {t('reactory.organizations.detail.unsaved.keepEditing')}
          </Button>
          <Button variant="contained" color="warning" onClick={confirmDiscard}>
            {pendingAction && pendingAction.reloads
              ? t('reactory.organizations.detail.unsaved.proceed')
              : t('reactory.organizations.detail.unsaved.discard')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrganizationDetailPanel;
