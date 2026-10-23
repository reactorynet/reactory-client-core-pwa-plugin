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
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';

import useOrganizationDemographicValues from '../hooks/useOrganizationDemographicValues';
import DemographicValueDrawer from './DemographicValueDrawer';
import DemographicBulkEditDrawer from './DemographicBulkEditDrawer';
import DemographicImportDialog from './DemographicImportDialog';
import {
  buildDemographicCsv,
  describeUser,
  demographicValueRowId,
  formatDemographicValue,
  resolveUserId,
} from '../demographicValues';
import { resolveError, type OrganizationMessageKey } from '../i18n';
import { formatUpdated } from '../utils';
import type { DemographicDefinition } from '../../demographic-form';
import type {
  Organization,
  OrganizationDemographicValue,
  OrganizationError,
  OrganizationFieldError,
  OrganizationNotifyType,
  OrganizationTabProps,
  OrganizationTranslator,
} from '../types';

/**
 * Demographics → **Values** (ORG-033).
 *
 * The second view of the existing Demographics tab, not a new tab: the tab is
 * registered once and this pane is mounted beside the ORG-031 configuration
 * pane. It answers "what is stored?", which the configuration pane deliberately
 * does not ask — its comment at the `includeUsage` flag is explicit that
 * `OrganizationDemographicValues` is administrator-only server-side.
 *
 * What the API allows, and what this pane therefore does:
 *
 *   - **Definition filter** maps to `DemographicValueFilter.key`; the member
 *     filter maps to `user`. There is no `search` and no sort, so neither is
 *     offered, and paging is the server's `PagedDemographicValues.paging`.
 *   - **Completeness is per definition**, from
 *     `OrganizationDemographicAggregates`. `cohortTotal` counts only members in
 *     cohorts at or above the k-anonymity threshold, so the summary shows the
 *     threshold and the withheld count instead of inventing a headcount
 *     percentage. That is the honest answer to "filter by completeness": there
 *     is no server-side per-user completeness and it cannot be computed
 *     client-side across pages.
 *   - **CSV is client-side.** Export writes the loaded rows; import parses,
 *     maps columns to definitions, previews and validates, and only then
 *     submits through the bulk mutation.
 *   - **`canManage === false` issues no values or aggregates query at all**, and
 *     renders no write control.
 *
 * Every successful mutation calls the shell's `refresh()`, re-reads the values
 * and the aggregates, and notifies with a translated message.
 */
export interface DemographicValuesPaneProps {
  reactory: any;
  t: OrganizationTranslator;
  organization: Organization;
  definitions: DemographicDefinition[];
  canManage: boolean;
  refresh: () => Promise<void>;
  notify: (message: string, type?: OrganizationNotifyType) => void;
  onDirtyChange: (dirty: boolean) => void;
}

const SOURCE_LABEL_KEYS: Record<string, OrganizationMessageKey> = {
  user: 'reactory.organizations.demographics.values.source.user',
  admin: 'reactory.organizations.demographics.values.source.admin',
  import: 'reactory.organizations.demographics.values.source.import',
  api: 'reactory.organizations.demographics.values.source.api',
};

/** Translate a source token; unknown values render verbatim, never blank. */
const sourceLabel = (t: OrganizationTranslator, source?: string | null): string => {
  const token = `${source || ''}`.trim();
  if (!token) return t('reactory.organizations.list.notSet');
  const key = SOURCE_LABEL_KEYS[token.toLowerCase()];
  return key ? t(key) : token;
};

export const DemographicValuesPane: React.FC<DemographicValuesPaneProps> = ({
  reactory,
  t,
  organization,
  definitions,
  canManage,
  refresh,
  notify,
  onDirtyChange,
}) => {
  const readOnly = canManage === false;

  const demographics = useOrganizationDemographicValues({
    reactory,
    organization,
    definitions,
    // Both queries behind this pane are administrator-only server-side, so a
    // read-only viewer must not issue them.
    autoLoad: !readOnly,
  });

  const [editing, setEditing] = useState<OrganizationDemographicValue | null>(null);
  const [editError, setEditError] = useState<OrganizationError | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<OrganizationFieldError[]>([]);

  const [deleting, setDeleting] = useState<OrganizationDemographicValue | null>(null);
  const [deleteError, setDeleteError] = useState<OrganizationError | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [userInput, setUserInput] = useState('');
  const [userFilterError, setUserFilterError] = useState('');

  const [editDirty, setEditDirty] = useState(false);
  const [bulkDirty, setBulkDirty] = useState(false);
  const [importDirty, setImportDirty] = useState(false);

  const panesDirty = editDirty || bulkDirty || importDirty;

  useEffect(() => {
    onDirtyChange(panesDirty);
  }, [onDirtyChange, panesDirty]);

  // Switching back to Configuration unmounts this pane; the shell must stop
  // guarding for a drawer that no longer exists.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const definitionByKey = useMemo(() => {
    const map: Record<string, DemographicDefinition> = {};
    (definitions || []).forEach((definition) => {
      if (definition && definition.key) map[definition.key] = definition;
    });
    return map;
  }, [definitions]);

  const safeRefresh = useCallback(async (): Promise<void> => {
    try {
      await refresh();
    } catch {
      // The write already succeeded; a failed reload is not a failed write.
    }
  }, [refresh]);

  const notifyFailure = useCallback(
    (error: OrganizationError | null | undefined) => {
      if (!error) return;
      notify(resolveError(t, error), 'error');
    },
    [notify, t],
  );

  /* ---- filters ---- */

  const handleDefinitionFilter = useCallback(
    (key: string): void => {
      demographics.setFilter({ key: key || null });
    },
    [demographics],
  );

  /**
   * Commit the member filter on blur/Enter.
   *
   * An email is resolved to a user id through the member directory, because the
   * server's `user` filter is an ObjectId and would reject the address. An
   * unresolved address is refused here rather than sent to fail server-side.
   */
  const commitUserFilter = useCallback((): void => {
    const raw = userInput.trim();
    if (raw.length === 0) {
      setUserFilterError('');
      demographics.setFilter({ user: null });
      return;
    }

    const resolved = resolveUserId(demographics.directory, raw);
    if (raw.indexOf('@') >= 0 && resolved === raw) {
      setUserFilterError(t('reactory.organizations.demographics.values.csv.error.unknownUser'));
      return;
    }

    setUserFilterError('');
    demographics.setFilter({ user: resolved });
  }, [demographics, t, userInput]);

  const clearFilters = useCallback((): void => {
    setUserInput('');
    setUserFilterError('');
    demographics.clearFilter();
  }, [demographics]);

  /* ---- single edit ---- */

  const openEdit = useCallback((value: OrganizationDemographicValue) => {
    setEditError(null);
    setEditFieldErrors([]);
    setEditing(value);
  }, []);

  const closeEdit = useCallback(() => {
    setEditError(null);
    setEditFieldErrors([]);
    setEditing(null);
  }, []);

  const handleSave = useCallback(
    async (nextValue: unknown): Promise<void> => {
      if (!editing) return;

      const key = `${editing.key}`;
      const result = await demographics.saveValue({
        user: `${editing.user || ''}`,
        key,
        value: nextValue,
        source: 'admin',
      });

      if (result.error) {
        // Keep the drawer open with the draft and the server's field messages:
        // the request was attempted, which is not the same as it succeeding.
        setEditError(result.error);
        setEditFieldErrors(result.fieldErrors);
        notifyFailure(result.error);
        return;
      }

      closeEdit();
      notify(t('reactory.organizations.demographics.values.saved', { key }), 'success');

      await safeRefresh();
      await demographics.refresh();
    },
    [closeEdit, demographics, editing, notify, notifyFailure, safeRefresh, t],
  );

  /* ---- delete ---- */

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!deleting) return;
    const target = deleting;

    const result = await demographics.deleteValue({
      key: `${target.key}`,
      user: `${target.user || ''}`,
    });

    if (result.error) {
      setDeleteError(result.error);
      notifyFailure(result.error);
      return;
    }

    setDeleting(null);
    setDeleteError(null);
    notify(
      t('reactory.organizations.demographics.values.deleted', { key: `${target.key}` }),
      'success',
    );

    await safeRefresh();
    await demographics.refresh();
  }, [deleting, demographics, notify, notifyFailure, safeRefresh, t]);

  /* ---- bulk ---- */

  const handleBulkSubmit = useCallback(
    async (inputs: any[]) => {
      const result = await demographics.bulkSaveValues(inputs);
      const saved = result.outcomes.filter((outcome) => outcome.status === 'saved').length;
      const failed = result.outcomes.length - saved;

      if (saved > 0) {
        notify(
          t('reactory.organizations.demographics.values.bulk.result.allSaved', { count: saved }),
          'success',
        );
        await safeRefresh();
        await demographics.refresh();
      }

      if (failed > 0) {
        // A partial batch is never reported as a success.
        notify(
          t('reactory.organizations.demographics.values.bulk.result.summary', { saved, failed }),
          'error',
        );
      }

      return result;
    },
    [demographics, notify, safeRefresh, t],
  );

  /* ---- import ---- */

  const handleImport = useCallback(
    async (inputs: any[]) => {
      const result = await demographics.bulkSaveValues(inputs);
      const saved = result.outcomes.filter((outcome) => outcome.status === 'saved').length;
      const failed = result.outcomes.length - saved;

      if (saved > 0) {
        notify(
          t('reactory.organizations.demographics.values.csv.success', { count: saved }),
          failed > 0 ? 'warning' : 'success',
        );
        await safeRefresh();
        await demographics.refresh();
      }

      if (failed > 0) {
        notify(
          t('reactory.organizations.demographics.values.csv.partial', { saved, failed }),
          'error',
        );
      }

      return result;
    },
    [demographics, notify, safeRefresh, t],
  );

  /* ---- export ---- */

  const handleExport = useCallback((): void => {
    const { csv } = buildDemographicCsv({
      t,
      values: demographics.values,
      definitions,
      directory: demographics.directory,
    });

    // A download is a browser concern; a host without Blob/URL support (jsdom,
    // the electron shell) simply does not get a file. The CSV itself is built
    // and tested independently.
    try {
      if (typeof Blob === 'undefined' || typeof document === 'undefined') return;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const createUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
      const url = createUrl ? URL.createObjectURL(blob) : '';

      if (!createUrl || !url) return;

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `demographic-values-${organization?.code || organization?.id || 'organization'}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (typeof URL.revokeObjectURL === 'function') {
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch {
      // Export is a convenience; never let it disturb the pane.
    }
  }, [definitions, demographics.directory, demographics.values, organization, t]);

  /* ---- read-only ---- */

  if (readOnly) {
    return (
      <Stack spacing={2} data-testid="organization-demographics-values">
        <Alert
          severity="info"
          variant="outlined"
          data-testid="organization-demographics-values-readonly"
        >
          {t('reactory.organizations.demographics.values.readOnly')}
        </Alert>
      </Stack>
    );
  }

  const loadError = resolveError(t, demographics.error);
  const aggregatesError = resolveError(t, demographics.aggregatesError);
  const totalDefinitions =
    (demographics.aggregates?.reportedDefinitions || 0) +
    (demographics.aggregates?.suppressedDefinitions || 0);

  return (
    <Stack spacing={2} data-testid="organization-demographics-values">
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle1" component="h2">
                  {t('reactory.organizations.demographics.values.title')}
                </Typography>
                {(demographics.loading || demographics.aggregatesLoading) && (
                  <CircularProgress
                    size={16}
                    data-testid="organization-demographics-values-loading"
                  />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {t('reactory.organizations.demographics.values.subtitle')}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => setImportOpen(true)}
                data-testid="demographic-values-import-open"
              >
                {t('reactory.organizations.demographics.values.csv.import')}
              </Button>
              <Tooltip
                title={t('reactory.organizations.demographics.values.csv.exportHint', {
                  count: demographics.values.length,
                })}
              >
                <span>
                  <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={handleExport}
                    disabled={demographics.values.length === 0}
                    data-testid="demographic-values-export"
                  >
                    {t('reactory.organizations.demographics.values.csv.export')}
                  </Button>
                </span>
              </Tooltip>
              <Button
                variant="outlined"
                onClick={() => setBulkOpen(true)}
                disabled={demographics.values.length === 0}
                data-testid="demographic-values-bulk-open"
              >
                {t('reactory.organizations.demographics.values.bulk.open')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* ---- Filters ---- */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', sm: 'flex-start' }}
        data-testid="demographic-values-filters"
      >
        <TextField
          select
          size="small"
          label={t('reactory.organizations.demographics.values.filter.definition')}
          value={demographics.filter.key || ''}
          onChange={(event) => handleDefinitionFilter(event.target.value)}
          sx={{ minWidth: 220 }}
          inputProps={{ 'data-testid': 'demographic-values-filter-definition' }}
        >
          <MenuItem value="">
            {t('reactory.organizations.demographics.values.filter.definitionAll')}
          </MenuItem>
          {(definitions || []).map((definition) => (
            <MenuItem key={definition.key} value={definition.key}>
              {definition.title || definition.key}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          label={t('reactory.organizations.demographics.values.filter.user')}
          placeholder={t('reactory.organizations.demographics.values.filter.userPlaceholder')}
          value={userInput}
          onChange={(event) => setUserInput(event.target.value)}
          onBlur={commitUserFilter}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitUserFilter();
          }}
          error={Boolean(userFilterError)}
          helperText={
            userFilterError || t('reactory.organizations.demographics.values.filter.userHint')
          }
          sx={{ minWidth: 260 }}
          inputProps={{ 'data-testid': 'demographic-values-filter-user' }}
        />

        <Button
          onClick={clearFilters}
          data-testid="demographic-values-filter-clear"
          sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}
        >
          {t('reactory.organizations.demographics.values.filter.clear')}
        </Button>
      </Stack>

      {loadError && (
        <Alert
          severity="error"
          data-testid="organization-demographics-values-error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => void demographics.refreshValues()}
            >
              {t('reactory.organizations.demographics.values.retry')}
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}

      {/* ---- Values table ---- */}
      {demographics.values.length === 0 && !demographics.loading ? (
        <Card variant="outlined">
          <CardContent data-testid="demographic-values-empty">
            <Typography variant="subtitle1" component="h3">
              {t('reactory.organizations.demographics.values.empty.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('reactory.organizations.demographics.values.empty.body')}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Card} variant="outlined">
          <Table size="small" data-testid="demographic-values-table">
            <TableHead>
              <TableRow>
                <TableCell>
                  {t('reactory.organizations.demographics.values.column.user')}
                </TableCell>
                <TableCell>
                  {t('reactory.organizations.demographics.values.column.definition')}
                </TableCell>
                <TableCell>
                  {t('reactory.organizations.demographics.values.column.value')}
                </TableCell>
                <TableCell>
                  {t('reactory.organizations.demographics.values.column.source')}
                </TableCell>
                <TableCell align="center">
                  {t('reactory.organizations.demographics.values.column.verified')}
                </TableCell>
                <TableCell>
                  {t('reactory.organizations.demographics.values.column.updated')}
                </TableCell>
                <TableCell align="right">
                  {t('reactory.organizations.demographics.values.column.actions')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {demographics.values.map((value, index) => {
                const definition = definitionByKey[`${value.key || ''}`];
                const rowId = demographicValueRowId(value, index);
                const user = describeUser(t, demographics.directory, value.user);
                const valueText = formatDemographicValue(
                  t,
                  definition,
                  value.value,
                  value.valueType,
                );

                return (
                  <TableRow
                    key={`${rowId}-${index}`}
                    hover
                    data-testid={`demographic-value-row-${rowId}`}
                  >
                    <TableCell>
                      <Typography variant="body2">{user.label}</Typography>
                      {user.email && user.email !== user.label && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {user.email}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {definition?.title || value.key}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {value.key}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography
                        variant="body2"
                        title={valueText}
                        data-testid={`demographic-value-cell-${rowId}`}
                      >
                        {valueText}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {sourceLabel(t, value.source)}
                      </Typography>
                    </TableCell>

                    <TableCell align="center">
                      <Typography variant="body2">
                        {value.verified === true
                          ? t('reactory.organizations.demographics.values.yes')
                          : t('reactory.organizations.demographics.values.no')}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {formatUpdated(value.updatedAt || value.createdAt)}
                      </Typography>
                    </TableCell>

                    <TableCell align="right">
                      <Stack direction="row" spacing={0} justifyContent="flex-end">
                        <Tooltip
                          title={t('reactory.organizations.demographics.values.edit')}
                        >
                          <IconButton
                            size="small"
                            aria-label={t('reactory.organizations.demographics.values.edit')}
                            disabled={!definition}
                            onClick={() => openEdit(value)}
                            data-testid={`demographic-value-edit-${rowId}`}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip
                          title={t('reactory.organizations.demographics.values.delete')}
                        >
                          <IconButton
                            size="small"
                            aria-label={t('reactory.organizations.demographics.values.delete')}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(value);
                            }}
                            data-testid={`demographic-value-delete-${rowId}`}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={demographics.paging.total}
            page={Math.max(0, demographics.paging.page - 1)}
            rowsPerPage={demographics.paging.pageSize}
            rowsPerPageOptions={[10, 25, 50]}
            onPageChange={(_event, next) => demographics.setPage(next + 1)}
            onRowsPerPageChange={(event) => demographics.setPageSize(Number(event.target.value))}
            labelRowsPerPage={t('reactory.organizations.demographics.values.rowsPerPage')}
            labelDisplayedRows={({ from, to, count }) =>
              t('reactory.organizations.demographics.values.displayedRows', { from, to, count })
            }
          />
        </TableContainer>
      )}

      {/* ---- Per-definition completeness ---- */}
      <Card variant="outlined">
        <CardContent data-testid="demographic-completeness">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1" component="h3">
              {t('reactory.organizations.demographics.completeness.title')}
            </Typography>
            {demographics.aggregatesLoading && (
              <CircularProgress size={16} data-testid="demographic-completeness-loading" />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            {t('reactory.organizations.demographics.completeness.subtitle')}
          </Typography>

          {aggregatesError && (
            <Alert severity="warning" sx={{ mt: 2 }} data-testid="demographic-completeness-error">
              {aggregatesError}
            </Alert>
          )}

          {demographics.aggregates && (
            <>
              <Typography
                variant="body2"
                sx={{ mt: 1 }}
                data-testid="demographic-completeness-threshold"
              >
                {t('reactory.organizations.demographics.completeness.threshold', {
                  count: demographics.aggregates.minimumAggregationGroupSize,
                })}
              </Typography>

              <Typography
                variant="body2"
                data-testid="demographic-completeness-reported"
              >
                {t('reactory.organizations.demographics.completeness.reported', {
                  reported: demographics.aggregates.reportedDefinitions,
                  total: totalDefinitions,
                })}
              </Typography>

              {demographics.aggregates.suppressedDefinitions > 0 && (
                <Alert
                  severity="warning"
                  variant="outlined"
                  sx={{ mt: 1 }}
                  data-testid="demographic-completeness-suppressed"
                >
                  <Typography variant="body2">
                    {t('reactory.organizations.demographics.completeness.suppressedCount', {
                      count: demographics.aggregates.suppressedDefinitions,
                    })}
                  </Typography>
                  <Typography variant="caption">
                    {t('reactory.organizations.demographics.completeness.suppressedNotice')}
                  </Typography>
                </Alert>
              )}

              {demographics.aggregates.definitions.length === 0 ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                  data-testid="demographic-completeness-empty"
                >
                  {t('reactory.organizations.demographics.completeness.empty')}
                </Typography>
              ) : (
                <TableContainer sx={{ mt: 1 }}>
                  <Table size="small" data-testid="demographic-completeness-table">
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          {t('reactory.organizations.demographics.values.column.definition')}
                        </TableCell>
                        <TableCell>
                          {t('reactory.organizations.demographics.values.column.value')}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {demographics.aggregates.definitions.map((entry) => (
                        <TableRow
                          key={entry.definitionKey}
                          data-testid={`demographic-completeness-row-${entry.definitionKey}`}
                        >
                          <TableCell>
                            <Typography variant="body2">{entry.title}</Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {entry.definitionKey}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {entry.suppressed ? (
                              <Chip
                                size="small"
                                color="warning"
                                variant="outlined"
                                label={t(
                                  'reactory.organizations.demographics.completeness.definition.suppressed',
                                )}
                              />
                            ) : (
                              <Typography variant="body2">
                                {t(
                                  'reactory.organizations.demographics.completeness.definition.coverage',
                                  { count: entry.cohortTotal },
                                )}
                              </Typography>
                            )}
                            {!entry.suppressed &&
                              Number(entry.suppressedCohorts) > 0 && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {t(
                                    'reactory.organizations.demographics.completeness.definition.suppressedCohorts',
                                    { count: Number(entry.suppressedCohorts) },
                                  )}
                                </Typography>
                              )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ mt: 1 }}
                data-testid="demographic-completeness-caveat"
              >
                {t('reactory.organizations.demographics.completeness.caveat')}
              </Typography>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---- Delete confirmation ---- */}
      <Dialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        maxWidth="sm"
        fullWidth
        data-testid="demographic-value-delete-dialog"
      >
        <DialogTitle>
          {t('reactory.organizations.demographics.values.delete.title', {
            key: deleting ? `${deleting.key}` : '',
            user: describeUser(t, demographics.directory, deleting?.user).label,
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('reactory.organizations.demographics.values.delete.body')}
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }} data-testid="demographic-value-delete-error">
              {resolveError(t, deleteError)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            data-testid="demographic-value-delete-cancel"
          >
            {t('reactory.organizations.demographics.values.drawer.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDelete()}
            disabled={demographics.saving}
            data-testid="demographic-value-delete-confirm"
          >
            {t('reactory.organizations.demographics.values.delete.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- Single-value drawer ---- */}
      {editing && definitionByKey[`${editing.key || ''}`] && (
        <DemographicValueDrawer
          reactory={reactory}
          t={t}
          organization={organization}
          definition={definitionByKey[`${editing.key || ''}`]}
          value={editing}
          directory={demographics.directory}
          saving={demographics.saving}
          error={editError}
          fieldErrors={editFieldErrors}
          onClose={closeEdit}
          onSave={(next) => void handleSave(next)}
          onDirtyChange={setEditDirty}
        />
      )}

      {/* ---- Bulk edit drawer ---- */}
      {bulkOpen && (
        <DemographicBulkEditDrawer
          reactory={reactory}
          t={t}
          organization={organization}
          values={demographics.values}
          definitions={definitions}
          directory={demographics.directory}
          saving={demographics.saving}
          onClose={() => setBulkOpen(false)}
          onSubmit={handleBulkSubmit}
          onDirtyChange={setBulkDirty}
        />
      )}

      {/* ---- CSV import ---- */}
      {importOpen && (
        <DemographicImportDialog
          reactory={reactory}
          t={t}
          definitions={definitions}
          directory={demographics.directory}
          saving={demographics.saving}
          onClose={() => setImportOpen(false)}
          onImport={handleImport}
          onDirtyChange={setImportDirty}
        />
      )}
    </Stack>
  );
};

export default DemographicValuesPane;
