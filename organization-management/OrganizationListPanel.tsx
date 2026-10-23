import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Archive as ArchiveIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

import OrganizationToolbar from './OrganizationToolbar';
import OrganizationCreateWizard from './OrganizationCreateWizard';
import OrganizationStatusChip from './components/OrganizationStatusChip';
import { makeTranslator, resolveError } from './i18n';
import useOrganizationList, { PAGE_SIZE_OPTIONS } from './hooks/useOrganizationList';
import useOrganizationAdmin from './hooks/useOrganizationAdmin';
import type {
  Organization,
  OrganizationError,
  OrganizationListRow,
  OrganizationSortField,
  OrganizationStatusFilter,
} from './types';
import {
  DEFAULT_ORGANIZATIONS_BASE_PATH,
  formatUpdated,
  organizationDetailPath,
  organizationStatus,
  resolveOrganizationPermissions,
} from './utils';

export interface OrganizationListPanelProps {
  reactory?: any;
  /** Default status filter; `active` hides archived organizations. */
  initialStatusFilter?: OrganizationStatusFilter;
  /** Called after a create, before the detail view is opened. */
  onOrganizationCreated?: (organization: Organization) => void;
  /**
   * Open an organization in place instead of navigating to its detail route.
   *
   * When supplied, this **replaces** navigation for both paths that open a
   * detail view — a row activation and the create flow's follow-up — so a host
   * can compose the list with its own detail surface (ORG-042b). Omitting it
   * keeps the historical behaviour: `basePath`/`detailRoute` build a path and
   * `reactory.navigation(path)` is called, which is what `/organizations` and
   * `/organizations/manage` rely on.
   */
  onSelectOrganization?: (organization: Organization) => void;
  /**
   * Base path of the organization surface, i.e. where the detail view lives.
   *
   * A plain string precisely so a *route config* can supply it: `componentProps`
   * is JSON, so the older `detailRoute` function cannot be configured by a host.
   * Defaults to `/organizations`, the legacy surface; pass
   * `'/organizations/manage'` when the UI is mounted under the manage prefix.
   * A trailing slash is accepted and normalised away.
   */
  basePath?: string;
  /**
   * Override the detail route with a function.
   *
   * Takes precedence over `basePath`. This is a *function*, so it can only be
   * supplied by a host that renders the panel in code, not from a route config.
   */
  detailRoute?: (organization: Organization) => string;
}

const COLUMN_COUNT = 11;

const initials = (name?: string | null): string =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

interface SortableCellProps {
  field: OrganizationSortField;
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  align?: 'left' | 'right';
  onSort: (field: OrganizationSortField) => void;
}

const SortableCell: React.FC<SortableCellProps> = ({
  field,
  label,
  active,
  direction,
  align = 'left',
  onSort,
}) => (
  <TableCell align={align} sortDirection={active ? direction : false}>
    <TableSortLabel active={active} direction={active ? direction : 'asc'} onClick={() => onSort(field)}>
      {label}
    </TableSortLabel>
  </TableCell>
);

/**
 * Organization list (ORG-010).
 *
 * The panel is deliberately thin: `useOrganizationList` owns the query,
 * filtering, sorting, paging, statistics and selection, `useOrganizationAdmin`
 * owns every write. This component only decides layout, the empty-state
 * distinction and the confirmation copy.
 *
 * Archived organizations are hidden by default because the default status
 * filter is `active`; the filter is the only way to see them, and rows in that
 * view expose Restore instead of Archive.
 *
 * Mutating affordances are gated on `reactory.hasRole`, mirroring the server
 * (`createOrganization` is ADMIN/SYSTEM; archive/restore are ORGANIZATION_ADMIN
 * or ADMIN, plus an org-scoped `assertOrgAdmin`). The manage check is resolved
 * **per row, with the organization in hand** — an ORGANIZATION_ADMIN is
 * normally granted through a membership, and a role check that omits the
 * organization only reads platform roles.
 *
 * A plain USER still sees the list — which the server does serve them — but is
 * never offered an action the server would deny.
 */
export const OrganizationListPanel: React.FC<OrganizationListPanelProps> = ({
  reactory: propReactory,
  initialStatusFilter = 'active',
  onOrganizationCreated,
  onSelectOrganization,
  basePath = DEFAULT_ORGANIZATIONS_BASE_PATH,
  detailRoute,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;
  const t = makeTranslator(reactory);

  const list = useOrganizationList({ reactory, initialStatusFilter });
  const admin = useOrganizationAdmin(reactory);
  const permissions = useMemo(() => resolveOrganizationPermissions(reactory), [reactory]);

  /**
   * Which visible rows this caller may archive/restore.
   *
   * Computed per row rather than once, because the answer differs by
   * organization: a membership-granted ORGANIZATION_ADMIN administers only the
   * organizations their memberships name.
   */
  const manageableRowIds = useMemo(
    () =>
      list.rows
        .filter((row) => permissions.canManageOrganization(row.id))
        .map((row) => row.id),
    [list.rows, permissions],
  );

  const canManageRow = useCallback(
    (organizationId?: string | null) => permissions.canManageOrganization(organizationId),
    [permissions],
  );

  const [wizardOpen, setWizardOpen] = useState(false);
  const [archiveTargets, setArchiveTargets] = useState<OrganizationListRow[]>([]);

  const notify = useCallback(
    (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
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

  /**
   * Open the detail view for a row, or for an organization just created.
   *
   * A host that owns the detail surface passes `onSelectOrganization` and no
   * route is built at all (ORG-042b: the application organizations tab renders
   * the detail in place). Otherwise the route is built from `basePath` — not a
   * literal — so the whole surface can be mounted under `/organizations/manage`
   * (ORG-016); `detailRoute` still wins when a host supplies the function.
   */
  const openOrganization = useCallback(
    (organization: Organization) => {
      if (typeof onSelectOrganization === 'function') {
        onSelectOrganization(organization);
        return;
      }

      const path = detailRoute
        ? detailRoute(organization)
        : organizationDetailPath(basePath, organization.id);

      if (reactory && typeof reactory.navigation === 'function') {
        reactory.navigation(path);
      }
    },
    [reactory, basePath, detailRoute, onSelectOrganization],
  );

  const handleCreated = useCallback(
    async (organization: Organization, warning?: OrganizationError | null) => {
      setWizardOpen(false);

      if (warning) {
        notify(
          t('reactory.organizations.wizard.review.createdWithWarning', {
            name: organization.name,
            message: resolveError(t, warning),
          }),
          'warning',
        );
      } else {
        notify(t('reactory.organizations.wizard.review.created', { name: organization.name }));
      }

      // Refresh before navigating so the list is already correct when the user
      // comes back from the detail view.
      await list.refresh();
      if (typeof onOrganizationCreated === 'function') onOrganizationCreated(organization);
      openOrganization(organization);
    },
    [list, notify, onOrganizationCreated, openOrganization, t],
  );

  const requestArchive = useCallback((rows: OrganizationListRow[]) => {
    if (!rows || rows.length === 0) return;
    setArchiveTargets(rows);
  }, []);

  const closeArchiveDialog = useCallback(() => {
    if (admin.saving) return;
    setArchiveTargets([]);
  }, [admin.saving]);

  const confirmArchive = useCallback(async () => {
    const targets = archiveTargets;
    if (targets.length === 0) return;

    const result = await admin.archive(targets.map((row) => row.id));
    setArchiveTargets([]);
    list.clearSelection();

    if (result.failed.length === 0) {
      notify(
        targets.length === 1
          ? t('reactory.organizations.archive.success', { count: 1 })
          : t('reactory.organizations.archive.successPlural', { count: result.succeeded.length }),
      );
    } else if (result.succeeded.length > 0) {
      notify(
        t('reactory.organizations.archive.partial', {
          succeeded: result.succeeded.length,
          failed: result.failed.length,
        }),
        'warning',
      );
    } else {
      notify(
        resolveError(t, result.failed[0]?.error) || t('reactory.organizations.archive.failed'),
        'error',
      );
    }

    await list.refresh();
  }, [admin, archiveTargets, list, notify, t]);

  const handleRestore = useCallback(
    async (organization: OrganizationListRow) => {
      const result = await admin.restore(organization.id);
      if (result.organization) {
        notify(t('reactory.organizations.restore.success', { name: organization.name }));
        await list.refresh();
      } else {
        notify(
          resolveError(t, result.error) ||
            t('reactory.organizations.restore.failed', { name: organization.name }),
          'error',
        );
      }
    },
    [admin, list, notify, t],
  );

  const handleArchiveSelected = useCallback(() => {
    // Only the selected organizations this caller may actually administer.
    const targets = (list.selectedRows.length > 0
      ? list.selectedRows
      : list.rows.filter((row) => list.selection.indexOf(row.id) >= 0)
    ).filter((row) => canManageRow(row.id));

    if (targets.length === 0) return;
    requestArchive(targets);
  }, [canManageRow, list, requestArchive]);

  const archiveTitle = useMemo(() => {
    if (archiveTargets.length === 1) {
      return t('reactory.organizations.archive.title', { name: archiveTargets[0].name });
    }
    return t('reactory.organizations.archive.titlePlural', { count: archiveTargets.length });
  }, [archiveTargets, t]);

  const showLoading = list.isLoading && list.rows.length === 0;
  const showError = list.loadState === 'error';
  const showEmpty = !showLoading && !showError && list.rows.length === 0;

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" component="h1" gutterBottom>
          {t('reactory.organizations.list.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('reactory.organizations.list.subtitle')}
        </Typography>
      </Box>

      <Paper variant="outlined">
        <OrganizationToolbar
          reactory={reactory}
          search={list.searchInput}
          onSearchChange={list.setSearchInput}
          status={list.statusFilter}
          onStatusChange={list.setStatusFilter}
          onRefresh={() => {
            void list.refresh();
          }}
          onNewOrganization={() => setWizardOpen(true)}
          onArchiveSelected={handleArchiveSelected}
          selectedCount={list.selection.filter((id) => manageableRowIds.indexOf(id) >= 0).length}
          refreshing={list.refreshing}
          canCreate={permissions.canCreate}
          canManage={manageableRowIds.length > 0}
        />

        {showError && (
          <Alert
            severity="error"
            sx={{ mx: 2, mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => void list.refresh()}>
                {t('reactory.organizations.list.retry')}
              </Button>
            }
          >
            <AlertTitle>{t('reactory.organizations.list.errorTitle')}</AlertTitle>
            {resolveError(t, list.error)}
          </Alert>
        )}

        <TableContainer>
          <Table size="small" aria-label={t('reactory.organizations.list.title')}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    color="primary"
                    checked={list.isPageSelected}
                    indeterminate={list.isPageIndeterminate}
                    onChange={(event) => list.togglePageSelection(event.target.checked)}
                    inputProps={{ 'aria-label': t('reactory.organizations.list.selectAll') }}
                  />
                </TableCell>
                <TableCell>{t('reactory.organizations.list.column.logo')}</TableCell>
                <SortableCell
                  field="name"
                  label={t('reactory.organizations.list.column.name')}
                  active={list.sort.field === 'name'}
                  direction={list.sort.direction}
                  onSort={list.toggleSort}
                />
                <SortableCell
                  field="code"
                  label={t('reactory.organizations.list.column.code')}
                  active={list.sort.field === 'code'}
                  direction={list.sort.direction}
                  onSort={list.toggleSort}
                />
                <SortableCell
                  field="tradingName"
                  label={t('reactory.organizations.list.column.tradingName')}
                  active={list.sort.field === 'tradingName'}
                  direction={list.sort.direction}
                  onSort={list.toggleSort}
                />
                <SortableCell
                  field="status"
                  label={t('reactory.organizations.list.column.status')}
                  active={list.sort.field === 'status'}
                  direction={list.sort.direction}
                  onSort={list.toggleSort}
                />
                <SortableCell
                  field="businessUnits"
                  label={t('reactory.organizations.list.column.businessUnits')}
                  active={list.sort.field === 'businessUnits'}
                  direction={list.sort.direction}
                  align="right"
                  onSort={list.toggleSort}
                />
                <TableCell align="right">
                  {t('reactory.organizations.list.column.members')}
                </TableCell>
                <SortableCell
                  field="theme"
                  label={t('reactory.organizations.list.column.theme')}
                  active={list.sort.field === 'theme'}
                  direction={list.sort.direction}
                  onSort={list.toggleSort}
                />
                <SortableCell
                  field="updatedAt"
                  label={t('reactory.organizations.list.column.updated')}
                  active={list.sort.field === 'updatedAt'}
                  direction={list.sort.direction}
                  onSort={list.toggleSort}
                />
                <TableCell align="right">
                  {t('reactory.organizations.list.column.actions')}
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {showLoading && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} align="center">
                    <Stack
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      justifyContent="center"
                      role="status"
                      sx={{ py: 4 }}
                    >
                      <CircularProgress size={20} />
                      <Typography variant="body2" color="text.secondary">
                        {t('reactory.organizations.list.loading')}
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}

              {showEmpty && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} align="center">
                    <Box role="status" sx={{ py: 5 }}>
                      <Typography variant="subtitle1">
                        {list.hasNoMatches
                          ? t('reactory.organizations.list.emptyNoMatches')
                          : t('reactory.organizations.list.emptyNoOrganizations')}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {list.hasNoMatches
                          ? t('reactory.organizations.list.emptyNoMatchesHint')
                          : t('reactory.organizations.list.emptyNoOrganizationsHint')}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}

              {list.rows.map((row) => {
                const archived = organizationStatus(row) === 'archived';
                const selected = list.selection.indexOf(row.id) >= 0;

                return (
                  <TableRow key={row.id} hover selected={selected}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        color="primary"
                        checked={selected}
                        onChange={(event) =>
                          list.toggleSelection(row.id, event.target.checked)
                        }
                        inputProps={{
                          'aria-label': t('reactory.organizations.list.selectRow', {
                            name: row.name,
                          }),
                        }}
                      />
                    </TableCell>

                    <TableCell>
                      <Avatar
                        src={row.avatarURL || row.logoURL || undefined}
                        alt={row.name}
                        sx={{ width: 32, height: 32, fontSize: 14 }}
                      >
                        {initials(row.name)}
                      </Avatar>
                    </TableCell>

                    <TableCell>
                      <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={() => openOrganization(row)}
                        aria-label={t('reactory.organizations.list.openOrganization', {
                          name: row.name,
                        })}
                        sx={{ textAlign: 'left' }}
                      >
                        {row.name}
                      </Link>
                    </TableCell>

                    <TableCell>{row.code || t('reactory.organizations.list.notSet')}</TableCell>
                    <TableCell>
                      {row.tradingName || t('reactory.organizations.list.notSet')}
                    </TableCell>
                    <TableCell>
                      <OrganizationStatusChip status={row.status} t={t} />
                    </TableCell>
                    <TableCell align="right">{row.businessUnitCount}</TableCell>
                    <TableCell align="right">
                      {typeof row.members === 'number'
                        ? row.members
                        : t('reactory.organizations.list.notSet')}
                    </TableCell>
                    <TableCell>
                      {row.theme || t('reactory.organizations.list.themeInherited')}
                    </TableCell>
                    <TableCell>
                      {formatUpdated(row.updatedAt) || t('reactory.organizations.list.notSet')}
                    </TableCell>

                    <TableCell align="right">
                      {!canManageRow(row.id) ? null : archived ? (
                        <Tooltip
                          title={t('reactory.organizations.restore.rowAction', { name: row.name })}
                        >
                          <IconButton
                            size="small"
                            aria-label={t('reactory.organizations.restore.rowAction', {
                              name: row.name,
                            })}
                            onClick={() => void handleRestore(row)}
                            disabled={admin.saving}
                          >
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip
                          title={t('reactory.organizations.archive.rowAction', { name: row.name })}
                        >
                          <IconButton
                            size="small"
                            aria-label={t('reactory.organizations.archive.rowAction', {
                              name: row.name,
                            })}
                            onClick={() => requestArchive([row])}
                            disabled={admin.saving}
                          >
                            <ArchiveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={list.paging.total}
          page={Math.max(0, list.paging.page - 1)}
          rowsPerPage={list.pageSize}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          onPageChange={(_event, nextPage) => list.setPage(nextPage + 1)}
          onRowsPerPageChange={(event) => list.setPageSize(Number(event.target.value))}
          labelRowsPerPage={t('reactory.organizations.list.rowsPerPage')}
          labelDisplayedRows={({ from, to, count }) =>
            t('reactory.organizations.list.displayedRows', { from, to, count })
          }
        />
      </Paper>

      <Dialog
        open={archiveTargets.length > 0}
        onClose={closeArchiveDialog}
        maxWidth="xs"
        fullWidth
        aria-labelledby="organization-archive-dialog-title"
      >
        <DialogTitle id="organization-archive-dialog-title">{archiveTitle}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('reactory.organizations.archive.reversibleHint')}
          </Typography>

          {archiveTargets.length > 1 && (
            <List dense disablePadding sx={{ mt: 1.5 }}>
              {archiveTargets.map((target) => (
                <ListItem key={target.id} disableGutters>
                  <ListItemText primary={target.name} />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeArchiveDialog} disabled={admin.saving}>
            {t('reactory.organizations.archive.cancel')}
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => void confirmArchive()}
            disabled={admin.saving}
          >
            {t('reactory.organizations.archive.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <OrganizationCreateWizard
        reactory={reactory}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={handleCreated}
      />
    </Box>
  );
};

export default OrganizationListPanel;
