import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

import {
  DemographicFieldRenderer,
  normaliseFieldErrors,
  type DemographicDefinition,
} from '../../demographic-form';
import { describeUser, type DemographicMemberDirectory } from '../demographicValues';
import { resolveError } from '../i18n';
import type {
  Organization,
  OrganizationDemographicValue,
  OrganizationError,
  OrganizationFieldError,
  OrganizationTranslator,
} from '../types';

/**
 * Side drawer that edits one stored value (ORG-033).
 *
 * The input is the shared `demographic-form` renderer for the value's own
 * definition — the same control the member sees and the definition preview
 * shows, so an administrator cannot be offered a different shape from the one
 * the server validates.
 *
 * Two rules are inherited from `DemographicDefinitionDrawer`:
 *
 *   - the drawer is mounted only while open, so every open starts from the
 *     stored value (no stale draft from the previous row);
 *   - it refuses backdrop/Escape dismissal, so Cancel is the only discard and
 *     `onUnsavedChanges(true)` cannot be cleared by a stray click. A failed save
 *     keeps the drawer open and the draft dirty — the request being *attempted*
 *     is not the work being *finished*.
 */
export interface DemographicValueDrawerProps {
  reactory: any;
  t: OrganizationTranslator;
  organization: Organization;
  definition: DemographicDefinition;
  value: OrganizationDemographicValue;
  directory?: DemographicMemberDirectory | null;
  saving: boolean;
  /** The last write failure, shown above the actions. */
  error?: OrganizationError | null;
  /** Server field-level messages for this value. */
  fieldErrors?: OrganizationFieldError[];
  onClose: () => void;
  /** Called with the draft; the parent performs the write. */
  onSave: (nextValue: unknown) => void;
  onDirtyChange: (dirty: boolean) => void;
}

const serialiseDraft = (value: unknown): string => {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch {
    return `${value}`;
  }
};

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

export const DemographicValueDrawer: React.FC<DemographicValueDrawerProps> = ({
  reactory,
  t,
  organization,
  definition,
  value,
  directory,
  saving,
  error,
  fieldErrors,
  onClose,
  onSave,
  onDirtyChange,
}) => {
  const [draft, setDraft] = useState<unknown>(() => value?.value ?? null);
  const [baseline] = useState<string>(() => serialiseDraft(value?.value ?? null));
  const [attempted, setAttempted] = useState(false);

  const dirty = serialiseDraft(draft) !== baseline;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Unmounting is the discard path; the shell must stop guarding for a draft
  // that no longer exists.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const user = describeUser(t, directory, value?.user);
  const messages = useMemo(
    () => (fieldErrors || []).map((entry) => entry.message).filter((message) => message.length > 0),
    [fieldErrors],
  );
  const fieldMessage = messages.join(' ');

  const requiredError =
    attempted && definition?.required === true && isEmptyValue(draft)
      ? t('reactory.organizations.demographics.values.drawer.required')
      : '';

  const handleSave = useCallback((): void => {
    setAttempted(true);

    // `required` is the one rule the renderer cannot know about on its own: it
    // disables nothing, and an empty value is only invalid for a required
    // definition. Catching it here saves a round trip and a server message.
    if (definition?.required === true && isEmptyValue(draft)) return;

    onSave(draft);
  }, [definition, draft, onSave]);

  return (
    <Drawer
      anchor="right"
      open
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
        onClose();
      }}
      PaperProps={{ sx: { width: { xs: '100%', sm: 560 }, maxWidth: '100%' } }}
    >
      <Box
        data-testid="demographic-value-drawer"
        sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="h2">
              {t('reactory.organizations.demographics.values.drawer.title', {
                key: definition?.title || definition?.key || value?.key || '',
              })}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('reactory.organizations.demographics.values.drawer.subtitle', {
                user: user.label,
              })}
            </Typography>
          </Box>
          <IconButton
            aria-label={t('reactory.organizations.demographics.values.drawer.close')}
            onClick={onClose}
            data-testid="demographic-value-drawer-close"
          >
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider />

        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
          <Box data-testid="demographic-value-drawer-field">
            <DemographicFieldRenderer
              definition={definition}
              value={draft}
              onChange={(next) => setDraft(next)}
              error={requiredError || fieldMessage}
              disabled={saving}
              mode="edit"
              organization={organization}
              user={{ id: value?.user }}
              reactory={reactory}
            />
          </Box>

          {requiredError && (
            <Alert severity="error" data-testid="demographic-value-drawer-field-error">
              {requiredError}
            </Alert>
          )}

          {messages.length > 0 && (
            <Alert severity="error" data-testid="demographic-value-drawer-errors">
              <Typography variant="body2" component="p">
                {t('reactory.organizations.demographics.values.drawer.errors')}
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {messages.map((message, index) => (
                  <li key={`${message}-${index}`}>
                    <Typography variant="body2">{message}</Typography>
                  </li>
                ))}
              </Box>
            </Alert>
          )}

          {error && !messages.length && (
            <Alert severity="error" data-testid="demographic-value-drawer-save-error">
              {resolveError(t, error)}
            </Alert>
          )}
        </Box>

        <Divider />
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ p: 2 }}>
          <Button
            onClick={onClose}
            disabled={saving}
            data-testid="demographic-value-drawer-cancel"
          >
            {t('reactory.organizations.demographics.values.drawer.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            data-testid="demographic-value-drawer-save"
          >
            {saving
              ? t('reactory.organizations.demographics.values.drawer.saving')
              : t('reactory.organizations.demographics.values.drawer.save')}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
};

export default DemographicValueDrawer;
