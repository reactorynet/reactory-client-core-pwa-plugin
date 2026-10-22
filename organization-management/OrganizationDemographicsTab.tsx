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
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowDownward as ArrowDownwardIcon,
  ArrowUpward as ArrowUpwardIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIndicatorIcon,
  Edit as EditIcon,
} from '@mui/icons-material';

import useOrganizationDemographics from './hooks/useOrganizationDemographics';
import DemographicDefinitionDrawer, {
  categoryLabel,
  valueTypeLabel,
} from './components/DemographicDefinitionDrawer';
import { switchInputProps } from './components/switchInputProps';
import {
  moveItem,
  nextOrdinal,
  patchDefinitionInput,
  reorderKeys,
} from './demographicDraft';
import { resolveError } from './i18n';
import type { OrganizationError, OrganizationTabProps } from './types';
import type { DemographicDefinition } from '../demographic-form';

/**
 * Demographics tab — the definition configuration pane (ORG-031).
 *
 * Replaces the ORG-031 placeholder in `organizationTabs.tsx`; the shell, the
 * other placeholder entries and `theme-editor` are untouched.
 *
 * Two jobs:
 *   1. **The list.** Every definition (system and custom) with an enable toggle,
 *      a required toggle, a drag/keyboard reorder that persists the ordinal, and
 *      the number of stored values that reference it.
 *   2. **The drawer.** Create and edit one definition, with a live preview built
 *      from the shared `demographic-form` renderer.
 *
 * Guard rails that are enforced in the UI *and* at the payload boundary:
 *   - a `system` definition's value type is disabled with an explanation, and
 *     `buildDefinitionInput` omits `valueType` for it entirely;
 *   - `key` is read-only on edit, and the update payload never carries it;
 *   - a delete the server refuses (because values still reference it) shows the
 *     server's own message and leaves the row in place — nothing is removed
 *     optimistically;
 *   - `canManage === false` hides every write control, including the drawer.
 *
 * All persistence lives in `useOrganizationDemographics`; the documents are in
 * `./graphql`. Every successful write calls `refresh()` (the shell's reload) and
 * `notify()` with a translated message.
 */
export const OrganizationDemographicsTab: React.FC<OrganizationTabProps> = ({
  reactory,
  t,
  organization,
  canManage,
  refresh,
  onUnsavedChanges,
  notify,
}) => {
  const readOnly = canManage === false;

  const demographics = useOrganizationDemographics({
    reactory,
    organization,
    // `OrganizationDemographicValues` is administrator-only server-side, so a
    // read-only viewer must not ask for the counts.
    includeUsage: !readOnly,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DemographicDefinition | null>(null);
  const [dirty, setDirty] = useState(false);

  const [deleting, setDeleting] = useState<DemographicDefinition | null>(null);
  const [deleteError, setDeleteError] = useState<OrganizationError | null>(null);

  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const definitions = demographics.definitions;

  /**
   * Dirty state means exactly one thing: the drawer holds a draft that differs
   * from the definition it was opened with. It is cleared only when the drawer
   * closes after a save or a discard — never because a request was attempted.
   */
  useEffect(() => {
    onUnsavedChanges(dirty);
  }, [dirty, onUnsavedChanges]);

  // Switching tabs unmounts the pane; the shell must stop guarding for a drawer
  // that no longer exists.
  useEffect(
    () => () => {
      onUnsavedChanges(false);
    },
    [onUnsavedChanges],
  );

  const safeRefresh = useCallback(async (): Promise<void> => {
    try {
      await refresh();
    } catch {
      // The write already succeeded; a failed reload must not be reported as a
      // failed write.
    }
  }, [refresh]);

  /** Tell the user, preferring the server's own message when it sent one. */
  const notifyFailure = useCallback(
    (error: OrganizationError | null | undefined) => {
      if (!error) return;
      notify(resolveError(t, error), 'error');
    },
    [notify, t],
  );

  const remainingOrdinal = useMemo(() => nextOrdinal(definitions), [definitions]);

  const openCreate = useCallback(() => {
    // A failure from a previous attempt belongs to that attempt, not to the
    // drawer the user is opening now.
    demographics.clearWriteError();
    setEditing(null);
    setDrawerOpen(true);
  }, [demographics]);

  const openEdit = useCallback(
    (definition: DemographicDefinition) => {
      demographics.clearWriteError();
      setEditing(definition);
      setDrawerOpen(true);
    },
    [demographics],
  );

  /**
   * Close the drawer and release the guard.
   *
   * Reached from Save-success and from Cancel, and from nowhere else: the drawer
   * refuses backdrop/Escape dismissal, so this is always an explicit discard.
   */
  const closeDrawer = useCallback(() => {
    demographics.clearWriteError();
    setDirty(false);
    setDrawerOpen(false);
    setEditing(null);
  }, [demographics]);

  const handleSave = useCallback(
    async (input: Record<string, any>) => {
      const result = await demographics.saveDefinition(input);

      if (result.error) {
        // The drawer stays open and the draft stays dirty: the request was
        // attempted, which is not the same as the work being finished.
        notifyFailure(result.error);
        return;
      }

      const title =
        (result.value && result.value.title) || input.title || `${input.key || ''}`;

      setDirty(false);
      setDrawerOpen(false);
      setEditing(null);

      notify(t('reactory.organizations.demographics.saved', { title }), 'success');

      await safeRefresh();
      // A create changes the set, so the usage counts have to be re-collected.
      await demographics.refreshDefinitions();
    },
    [demographics, editing, notify, notifyFailure, safeRefresh, t],
  );

  const handleToggleEnabled = useCallback(
    async (definition: DemographicDefinition, enabled: boolean) => {
      const title = definition.title || definition.key;
      const result = await demographics.setEnabled(`${definition.key}`, enabled);

      if (result.error) {
        notifyFailure(result.error);
        return;
      }

      notify(
        enabled
          ? t('reactory.organizations.demographics.enabled', { title })
          : t('reactory.organizations.demographics.disabled', { title }),
        'success',
      );
      await safeRefresh();
    },
    [demographics, notify, notifyFailure, safeRefresh, t],
  );

  /**
   * `Required` has no dedicated mutation — it is a one-field save.
   *
   * The patch carries only the identity and the flag, so it cannot clobber a
   * concurrent edit, and a `system` definition's frozen value type is never
   * mentioned.
   */
  const handleToggleRequired = useCallback(
    async (definition: DemographicDefinition, required: boolean) => {
      const title = definition.title || definition.key;
      const result = await demographics.saveDefinition(
        patchDefinitionInput(definition, { required }),
      );

      if (result.error) {
        notifyFailure(result.error);
        return;
      }

      notify(
        t('reactory.organizations.demographics.requiredSaved', {
          title,
          state: t(
            required
              ? 'reactory.organizations.demographics.requiredState.required'
              : 'reactory.organizations.demographics.requiredState.optional',
          ),
        }),
        'success',
      );
      await safeRefresh();
    },
    [demographics, notify, notifyFailure, safeRefresh, t],
  );

  const persistOrder = useCallback(
    async (keys: string[] | null) => {
      if (!keys) return;

      const result = await demographics.reorder(keys);
      if (result.error) {
        // Nothing was reordered locally: the hook only adopts a successful
        // response, so a failure leaves the list exactly as it was.
        notifyFailure(result.error);
        return;
      }

      notify(t('reactory.organizations.demographics.reordered'), 'success');
      await safeRefresh();
    },
    [demographics, notify, notifyFailure, safeRefresh, t],
  );

  const handleDrop = useCallback(
    async (targetKey: string) => {
      const sourceKey = draggingKey;
      setDraggingKey(null);
      if (!sourceKey || sourceKey === targetKey) return;
      await persistOrder(reorderKeys(definitions, sourceKey, targetKey));
    },
    [definitions, draggingKey, persistOrder],
  );

  const handleMove = useCallback(
    async (definition: DemographicDefinition, direction: -1 | 1) => {
      const keys = definitions.map((entry) => `${entry.key || ''}`);
      const from = keys.indexOf(`${definition.key || ''}`);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= keys.length) return;
      await persistOrder(moveItem(keys, from, to));
    },
    [definitions, persistOrder],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    const target = deleting;
    const title = target.title || target.key;

    const result = await demographics.deleteDefinition(`${target.key}`);

    if (result.error) {
      // The server refuses to delete a definition that still has values, and
      // says so. Show that refusal verbatim and keep the row: no optimistic
      // removal, ever.
      setDeleteError(result.error);
      notifyFailure(result.error);
      return;
    }

    setDeleting(null);
    setDeleteError(null);

    notify(t('reactory.organizations.demographics.deleted', { title }), 'success');

    await safeRefresh();
    await demographics.refreshDefinitions();
  }, [deleting, demographics, notify, notifyFailure, safeRefresh, t]);

  // The banner is for a **read** failure only. A refused write is reported by the
  // surface that issued it (the drawer or the delete dialog) plus notify();
  // rendering it here made Retry re-read the definitions instead of retrying
  // the write that actually failed.
  const loadError = resolveError(t, demographics.loadError);
  const systemCount = definitions.filter((definition) => definition.system === true).length;

  /** Stored-value count for one definition, as display text. */
  const usageText = (key: string): string => {
    const count = demographics.usage[key];
    if (count === undefined || count === null) {
      return t('reactory.organizations.demographics.usage.unknown');
    }
    return count === 0
      ? t('reactory.organizations.demographics.usage.none')
      : t('reactory.organizations.demographics.usage.count', { count });
  };

  const canWrite = !readOnly;

  return (
    <Stack spacing={2} data-testid="organization-demographics-tab">
      {readOnly && (
        <Alert severity="info" variant="outlined" data-testid="organization-demographics-readonly">
          {t('reactory.organizations.detail.readOnly')}
        </Alert>
      )}

      {loadError && (
        <Alert
          severity="error"
          data-testid="organization-demographics-load-error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => void demographics.refreshDefinitions()}
            >
              {t('reactory.organizations.list.retry')}
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}

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
                  {t('reactory.organizations.demographics.title')}
                </Typography>
                {(demographics.loading || demographics.counting) && (
                  <CircularProgress
                    size={16}
                    data-testid="organization-demographics-loading"
                  />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {t('reactory.organizations.demographics.subtitle')}
              </Typography>
            </Box>

            {canWrite && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openCreate}
                data-testid="organization-demographics-new"
              >
                {t('reactory.organizations.demographics.new')}
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {systemCount > 0 && (
        <Alert severity="info" variant="outlined" data-testid="organization-demographics-system-hint">
          {t('reactory.organizations.demographics.system.hint')}
        </Alert>
      )}

      {definitions.length === 0 && !demographics.loading ? (
        <Card variant="outlined">
          <CardContent data-testid="organization-demographics-empty">
            <Typography variant="subtitle1" component="h3">
              {t('reactory.organizations.demographics.empty.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('reactory.organizations.demographics.empty.body')}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Card} variant="outlined">
          <Table size="small" data-testid="organization-demographics-table">
            <TableHead>
              <TableRow>
                {canWrite && <TableCell padding="checkbox" />}
                <TableCell>{t('reactory.organizations.demographics.column.definition')}</TableCell>
                <TableCell>{t('reactory.organizations.demographics.column.category')}</TableCell>
                <TableCell>{t('reactory.organizations.demographics.column.type')}</TableCell>
                <TableCell align="right">
                  {t('reactory.organizations.demographics.column.usage')}
                </TableCell>
                <TableCell align="center">
                  {t('reactory.organizations.demographics.column.required')}
                </TableCell>
                <TableCell align="center">
                  {t('reactory.organizations.demographics.column.enabled')}
                </TableCell>
                {canWrite && (
                  <TableCell align="right">
                    {t('reactory.organizations.demographics.column.actions')}
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {definitions.map((definition, index) => {
                const key = `${definition.key || ''}`;
                const title = definition.title || key;

                return (
                  <TableRow
                    key={key}
                    hover
                    draggable={canWrite}
                    data-testid={`demographic-definition-row-${key}`}
                    onDragStart={(event) => {
                      setDraggingKey(key);
                      if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', key);
                      }
                    }}
                    onDragOver={(event) => {
                      if (canWrite) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      void handleDrop(key);
                    }}
                    onDragEnd={() => setDraggingKey(null)}
                    sx={draggingKey === key ? { opacity: 0.6 } : undefined}
                  >
                    {canWrite && (
                      <TableCell padding="checkbox">
                        <Stack direction="row" alignItems="center" spacing={0}>
                          <Tooltip
                            title={t('reactory.organizations.demographics.dragHandle', { title })}
                          >
                            <DragIndicatorIcon
                              fontSize="small"
                              sx={{ color: 'text.disabled', cursor: 'grab' }}
                            />
                          </Tooltip>
                          <IconButton
                            size="small"
                            disabled={index === 0}
                            aria-label={t('reactory.organizations.demographics.moveUp', { title })}
                            data-testid={`demographic-definition-move-up-${key}`}
                            onClick={() => void handleMove(definition, -1)}
                          >
                            <ArrowUpwardIcon fontSize="inherit" />
                          </IconButton>
                          <IconButton
                            size="small"
                            disabled={index === definitions.length - 1}
                            aria-label={t('reactory.organizations.demographics.moveDown', {
                              title,
                            })}
                            data-testid={`demographic-definition-move-down-${key}`}
                            onClick={() => void handleMove(definition, 1)}
                          >
                            <ArrowDownwardIcon fontSize="inherit" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    )}

                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="body2">{title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {key}
                        </Typography>
                        {definition.system === true && (
                          <Chip
                            size="small"
                            label={t('reactory.organizations.demographics.system.badge')}
                            data-testid={`demographic-definition-system-${key}`}
                          />
                        )}
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {categoryLabel(t, definition.category)}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {valueTypeLabel(t, definition.valueType)}
                      </Typography>
                    </TableCell>

                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        data-testid={`demographic-definition-usage-${key}`}
                      >
                        {usageText(key)}
                      </Typography>
                    </TableCell>

                    <TableCell align="center">
                      {canWrite ? (
                        <Switch
                          size="small"
                          checked={definition.required === true}
                          disabled={demographics.saving}
                          onChange={(event) =>
                            void handleToggleRequired(definition, event.target.checked)
                          }
                          inputProps={switchInputProps(
                            `demographic-definition-required-${key}`,
                            t('reactory.organizations.demographics.required', { title }),
                          )}
                        />
                      ) : (
                        <Typography variant="body2">
                          {definition.required === true
                            ? t('reactory.organizations.demographics.yes')
                            : t('reactory.organizations.demographics.no')}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell align="center">
                      {canWrite ? (
                        <Switch
                          size="small"
                          checked={definition.enabled !== false}
                          disabled={demographics.saving}
                          onChange={(event) =>
                            void handleToggleEnabled(definition, event.target.checked)
                          }
                          inputProps={switchInputProps(
                            `demographic-definition-enabled-${key}`,
                            t('reactory.organizations.demographics.enable', { title }),
                          )}
                        />
                      ) : (
                        <Typography variant="body2">
                          {definition.enabled !== false
                            ? t('reactory.organizations.demographics.yes')
                            : t('reactory.organizations.demographics.no')}
                        </Typography>
                      )}
                    </TableCell>

                    {canWrite && (
                      <TableCell align="right">
                        <Stack direction="row" spacing={0} justifyContent="flex-end">
                          <Tooltip
                            title={t('reactory.organizations.demographics.edit', { title })}
                          >
                            <IconButton
                              size="small"
                              aria-label={t('reactory.organizations.demographics.edit', { title })}
                              data-testid={`demographic-definition-edit-${key}`}
                              onClick={() => openEdit(definition)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip
                            title={t('reactory.organizations.demographics.delete', { title })}
                          >
                            <IconButton
                              size="small"
                              aria-label={t('reactory.organizations.demographics.delete', {
                                title,
                              })}
                              data-testid={`demographic-definition-delete-${key}`}
                              onClick={() => {
                                setDeleteError(null);
                                setDeleting(definition);
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {canWrite && definitions.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          {t('reactory.organizations.demographics.reorderHint')}
        </Typography>
      )}

      {/* ---- Delete confirmation ---- */}
      <Dialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        maxWidth="sm"
        fullWidth
        data-testid="demographic-definition-delete-dialog"
      >
        <DialogTitle>
          {t('reactory.organizations.demographics.delete.title', {
            title: deleting ? deleting.title || deleting.key : '',
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('reactory.organizations.demographics.delete.body')}
          </DialogContentText>
          {deleteError ? (
            <Alert severity="error" sx={{ mt: 2 }} data-testid="demographic-definition-delete-error">
              {resolveError(t, deleteError)}
            </Alert>
          ) : (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
              {t('reactory.organizations.demographics.delete.blockedHint')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            data-testid="demographic-definition-delete-cancel"
          >
            {t('reactory.organizations.demographics.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleConfirmDelete()}
            disabled={demographics.saving}
            data-testid="demographic-definition-delete-confirm"
          >
            {t('reactory.organizations.demographics.delete.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- Create / edit drawer ---- */}
      {canWrite && drawerOpen && (
        <DemographicDefinitionDrawer
          reactory={reactory}
          t={t}
          organization={organization}
          definition={editing}
          ordinal={remainingOrdinal}
          saving={demographics.saving}
          error={demographics.writeError}
          onClose={closeDrawer}
          onSave={(input) => void handleSave(input)}
          onDirtyChange={setDirty}
        />
      )}
    </Stack>
  );
};

export default OrganizationDemographicsTab;
