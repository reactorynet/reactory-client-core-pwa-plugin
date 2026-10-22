import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
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
  Close as CloseIcon,
  DeleteOutline as DeleteOutlineIcon,
} from '@mui/icons-material';

import {
  DEMOGRAPHIC_VALUE_TYPES,
  DemographicForm,
  resolveWidgetComponent,
  type DemographicDefinition,
  type DemographicValues,
} from '../../demographic-form';
import {
  DEMOGRAPHIC_CATEGORIES,
  DEMOGRAPHIC_REFERENCE_MODELS,
  buildDefinitionInput,
  draftDefinition,
  draftFromDefinition,
  draftHasErrors,
  emptyDraft,
  isDraftDirty,
  nextRowId,
  requiresOptions,
  validateDraft,
  type DemographicDefinitionDraft,
  type DemographicDraftErrors,
  type DemographicDraftField,
  type DemographicOptionRow,
  type DemographicPropsMapRow,
} from '../demographicDraft';
import { resolveError, type OrganizationMessageKey } from '../i18n';
import { switchInputProps } from './switchInputProps';
import type { Organization, OrganizationError, OrganizationTranslator } from '../types';

/**
 * The create/edit drawer for one demographic definition (ORG-031).
 *
 * Rendered **only while open** (the tab mounts it on `open`), which is what
 * gives every open a fresh draft: there is no path where a half-finished edit
 * from a previous definition survives into the next one. `onDirtyChange` is
 * driven by comparing the draft with the baseline it opened with, so typing and
 * undoing back to the stored value correctly reports "clean".
 *
 * The drawer is deliberately not dismissable by backdrop click or Escape: the
 * only ways out are Save and Cancel, and Cancel is the discard. That is the
 * mechanism that keeps `onUnsavedChanges(true)` from being cleared by an
 * accidental click — a save that fails leaves the drawer open and the draft
 * dirty (the exact defect ORG-011 shipped once).
 */
export interface DemographicDefinitionDrawerProps {
  reactory: any;
  t: OrganizationTranslator;
  organization: Organization;
  /** The definition being edited; `null` creates a new one. */
  definition: DemographicDefinition | null;
  /** Ordinal for a new definition: one past the current last. */
  ordinal: number;
  /** True while the save request is in flight. */
  saving: boolean;
  /** The last save failure, shown inline above the actions. */
  error: OrganizationError | null;
  onClose: () => void;
  /** Called only with a draft that passed client-side validation. */
  onSave: (input: Record<string, any>) => void;
  onDirtyChange: (dirty: boolean) => void;
}

const CATEGORY_LABEL_KEYS: Record<string, OrganizationMessageKey> = {
  personal: 'reactory.organizations.demographics.category.personal',
  employment: 'reactory.organizations.demographics.category.employment',
  organizational: 'reactory.organizations.demographics.category.organizational',
  compliance: 'reactory.organizations.demographics.category.compliance',
};

const TYPE_LABEL_KEYS: Record<string, OrganizationMessageKey> = {
  string: 'reactory.organizations.demographics.type.string',
  number: 'reactory.organizations.demographics.type.number',
  boolean: 'reactory.organizations.demographics.type.boolean',
  date: 'reactory.organizations.demographics.type.date',
  enum: 'reactory.organizations.demographics.type.enum',
  'multi-enum': 'reactory.organizations.demographics.type.multi-enum',
  object: 'reactory.organizations.demographics.type.object',
  array: 'reactory.organizations.demographics.type.array',
  reference: 'reactory.organizations.demographics.type.reference',
};

/** Translated label for a category value; unknown values render verbatim. */
export const categoryLabel = (
  t: OrganizationTranslator,
  category?: string | null,
): string => {
  const key = CATEGORY_LABEL_KEYS[`${category || ''}`];
  return key ? t(key) : `${category || ''}`;
};

/** Translated label for a value type; unknown values render verbatim. */
export const valueTypeLabel = (t: OrganizationTranslator, valueType?: string | null): string => {
  const key = TYPE_LABEL_KEYS[`${valueType || ''}`];
  return key ? t(key) : `${valueType || ''}`;
};

/** Translate one draft-validation key, or `''` when the field is valid. */
const messageFor = (
  t: OrganizationTranslator,
  errors: DemographicDraftErrors,
  field: DemographicDraftField,
): string => {
  const key = errors[field];
  return key ? t(key) : '';
};

export const DemographicDefinitionDrawer: React.FC<DemographicDefinitionDrawerProps> = ({
  reactory,
  t,
  organization,
  definition,
  ordinal,
  saving,
  error,
  onClose,
  onSave,
  onDirtyChange,
}) => {
  const creating = !definition;

  const [draft, setDraft] = useState<DemographicDefinitionDraft>(() =>
    definition ? draftFromDefinition(definition) : emptyDraft(ordinal),
  );
  const [baseline] = useState<DemographicDefinitionDraft>(() =>
    definition ? draftFromDefinition(definition) : emptyDraft(ordinal),
  );
  const [touched, setTouched] = useState<Partial<Record<DemographicDraftField, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [previewValues, setPreviewValues] = useState<DemographicValues>({});

  const errors = useMemo(() => validateDraft(draft, { creating }), [creating, draft]);
  const invalid = draftHasErrors(errors);

  /**
   * Report dirtiness from the diff, not from a "touched" flag: a user who types
   * a value and deletes it again has nothing unsaved.
   */
  useEffect(() => {
    onDirtyChange(isDraftDirty(draft, baseline));
  }, [baseline, draft, onDirtyChange]);

  // Unmounting the drawer is the discard path; the shell must stop guarding for
  // a draft that no longer exists.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const update = useCallback(
    <K extends keyof DemographicDefinitionDraft>(
      field: K,
      value: DemographicDefinitionDraft[K],
    ): void => {
      setDraft((previous) => ({ ...previous, [field]: value }));
    },
    [],
  );

  const touch = useCallback((field: DemographicDraftField): void => {
    setTouched((previous) => (previous[field] ? previous : { ...previous, [field]: true }));
  }, []);

  /** A field's message is hidden until the user has left the field or tried to save. */
  const fieldError = (field: DemographicDraftField): string =>
    touched[field] || attempted ? messageFor(t, errors, field) : '';

  const previewDefinition = useMemo(() => draftDefinition(draft), [draft]);

  /**
   * Status of the entered FQN.
   *
   * `resolveWidgetComponent` is the same resolver `demographic-form` uses, so
   * the badge tells the administrator exactly what the form will do — not what a
   * second, independent lookup thinks.
   */
  const widgetStatus = useMemo<'resolved' | 'unresolved' | 'unavailable' | null>(() => {
    const fqn = draft.widgetFqn.trim();
    if (!fqn) return null;
    if (!reactory || typeof reactory.getComponent !== 'function') return 'unavailable';
    return resolveWidgetComponent(reactory, fqn) ? 'resolved' : 'unresolved';
  }, [draft.widgetFqn, reactory]);

  const handleSave = useCallback((): void => {
    setAttempted(true);
    if (invalid) return;
    onSave(buildDefinitionInput(draft, { creating }));
  }, [creating, draft, invalid, onSave]);

  const addOption = useCallback((): void => {
    setDraft((previous) => {
      // `max + 1`, not `length`: after a row is removed, `length` can collide
      // with an ordinal that is still in use, and a collision makes the order
      // ambiguous for the renderer (which sorts on this field).
      const nextOrdinal = previous.options.reduce(
        (highest, row) =>
          Math.max(highest, Number.isFinite(Number(row.ordinal)) ? Number(row.ordinal) + 1 : 0),
        0,
      );

      return {
        ...previous,
        options: [
          ...previous.options,
          { id: nextRowId('option'), key: '', label: '', ordinal: nextOrdinal, deprecated: false },
        ],
      };
    });
  }, []);

  const removeOption = useCallback((index: number): void => {
    setDraft((previous) => ({
      ...previous,
      options: previous.options.filter((_row, position) => position !== index),
    }));
  }, []);

  const patchOption = useCallback(
    (index: number, patch: Partial<DemographicOptionRow>): void => {
      setDraft((previous) => ({
        ...previous,
        options: previous.options.map((row, position) =>
          position === index ? { ...row, ...patch } : row,
        ),
      }));
    },
    [],
  );

  const addMapping = useCallback((): void => {
    setDraft((previous) => ({
      ...previous,
      widgetPropsMap: [
        ...previous.widgetPropsMap,
        { id: nextRowId('map'), source: '', prop: '' },
      ],
    }));
  }, []);

  const removeMapping = useCallback((index: number): void => {
    setDraft((previous) => ({
      ...previous,
      widgetPropsMap: previous.widgetPropsMap.filter((_row, position) => position !== index),
    }));
  }, []);

  const patchMapping = useCallback(
    (index: number, patch: Partial<DemographicPropsMapRow>): void => {
      setDraft((previous) => ({
        ...previous,
        widgetPropsMap: previous.widgetPropsMap.map((row, position) =>
          position === index ? { ...row, ...patch } : row,
        ),
      }));
    },
    [],
  );

  const schemaHelper = fieldError('schema') || t('reactory.organizations.demographics.field.schemaHint');
  const optionsError = fieldError('options');
  const propsMapError = fieldError('widgetPropsMap');

  return (
    <Drawer
      anchor="right"
      open
      // A backdrop click or Escape must not throw away an unsaved definition;
      // Cancel is the only discard path.
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
        onClose();
      }}
      PaperProps={{ sx: { width: { xs: '100%', sm: 720 }, maxWidth: '100%' } }}
    >
      <Box
        data-testid="demographic-definition-drawer"
        sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" component="h2">
            {creating
              ? t('reactory.organizations.demographics.drawer.createTitle')
              : t('reactory.organizations.demographics.drawer.editTitle', {
                  title: draft.title || draft.key,
                })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('reactory.organizations.demographics.drawer.subtitle')}
          </Typography>
        </Box>
        <IconButton
          aria-label={t('reactory.organizations.demographics.cancel')}
          onClick={onClose}
          data-testid="demographic-definition-close"
        >
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
        {/* ---- Identity ---- */}
        <Typography variant="subtitle2" component="h3">
          {t('reactory.organizations.demographics.section.identity')}
        </Typography>

        <TextField
          label={t('reactory.organizations.demographics.field.key')}
          value={draft.key}
          onChange={(event) => update('key', event.target.value)}
          onBlur={() => touch('key')}
          disabled={!creating}
          required={creating}
          fullWidth
          error={Boolean(fieldError('key'))}
          helperText={
            fieldError('key') ||
            (creating
              ? t('reactory.organizations.demographics.field.keyHint')
              : t('reactory.organizations.demographics.field.keyImmutable'))
          }
          inputProps={{ 'data-testid': 'demographic-definition-field-key' }}
        />

        <TextField
          label={t('reactory.organizations.demographics.field.title')}
          value={draft.title}
          onChange={(event) => update('title', event.target.value)}
          onBlur={() => touch('title')}
          required
          fullWidth
          error={Boolean(fieldError('title'))}
          helperText={
            fieldError('title') || t('reactory.organizations.demographics.field.titleHint')
          }
          inputProps={{ 'data-testid': 'demographic-definition-field-title' }}
        />

        <TextField
          label={t('reactory.organizations.demographics.field.description')}
          value={draft.description}
          onChange={(event) => update('description', event.target.value)}
          fullWidth
          multiline
          minRows={2}
          helperText={t('reactory.organizations.demographics.field.descriptionHint')}
          inputProps={{ 'data-testid': 'demographic-definition-field-description' }}
        />

        <TextField
          label={t('reactory.organizations.demographics.field.icon')}
          value={draft.icon}
          onChange={(event) => update('icon', event.target.value)}
          fullWidth
          helperText={t('reactory.organizations.demographics.field.iconHint')}
          inputProps={{ 'data-testid': 'demographic-definition-field-icon' }}
        />

        {/* ---- Typing ---- */}
        <Divider />
        <Typography variant="subtitle2" component="h3">
          {t('reactory.organizations.demographics.section.typing')}
        </Typography>

        <TextField
          select
          label={t('reactory.organizations.demographics.field.category')}
          value={draft.category}
          onChange={(event) => update('category', event.target.value)}
          fullWidth
        >
          {DEMOGRAPHIC_CATEGORIES.map((category) => (
            <MenuItem key={category} value={category}>
              {categoryLabel(t, category)}
            </MenuItem>
          ))}
        </TextField>

        {/*
          A `system` definition's value type is frozen server-side: stored values
          were validated against it. The control is disabled *and* explained, and
          `buildDefinitionInput` omits the field entirely for a system update.
        */}
        <TextField
          select
          label={t('reactory.organizations.demographics.field.valueType')}
          value={draft.valueType}
          onChange={(event) => update('valueType', event.target.value)}
          disabled={draft.system}
          fullWidth
          helperText={
            draft.system
              ? t('reactory.organizations.demographics.field.valueTypeLocked')
              : ''
          }
        >
          {DEMOGRAPHIC_VALUE_TYPES.map((valueType) => (
            <MenuItem key={valueType} value={valueType}>
              {valueTypeLabel(t, valueType)}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label={t('reactory.organizations.demographics.field.ordinal')}
          value={Number.isFinite(draft.ordinal) ? draft.ordinal : ''}
          onChange={(event) => update('ordinal', Number(event.target.value))}
          onBlur={() => touch('ordinal')}
          type="number"
          fullWidth
          error={Boolean(fieldError('ordinal'))}
          helperText={
            fieldError('ordinal') || t('reactory.organizations.demographics.field.ordinalHint')
          }
          inputProps={{ 'data-testid': 'demographic-definition-field-ordinal', min: 0 }}
        />

        <TextField
          label={t('reactory.organizations.demographics.field.schema')}
          value={draft.schemaText}
          onChange={(event) => update('schemaText', event.target.value)}
          onBlur={() => touch('schema')}
          fullWidth
          multiline
          minRows={4}
          error={Boolean(fieldError('schema'))}
          helperText={schemaHelper}
          inputProps={{
            'data-testid': 'demographic-definition-field-schema',
            spellCheck: false,
            style: { fontFamily: 'monospace', fontSize: 12 },
          }}
        />

        {/* ---- Options (enum / multi-enum only) ---- */}
        {requiresOptions(draft.valueType) && (
          <Box data-testid="demographic-definition-options">
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle1" component="h4">
                {t('reactory.organizations.demographics.field.options')}
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addOption}
                data-testid="demographic-definition-option-add"
              >
                {t('reactory.organizations.demographics.options.add')}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {t('reactory.organizations.demographics.field.optionsHint')}
            </Typography>

            {draft.options.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('reactory.organizations.demographics.options.empty')}
              </Typography>
            )}

            <Stack spacing={1} sx={{ mt: 1 }}>
              {draft.options.map((row, index) => (
                <Stack
                  key={row.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  data-testid={`demographic-definition-option-${index}`}
                >
                  <TextField
                    label={t('reactory.organizations.demographics.field.optionKey')}
                    value={row.key}
                    onChange={(event) => patchOption(index, { key: event.target.value })}
                    size="small"
                    sx={{ flex: 1 }}
                    inputProps={{
                      'data-testid': `demographic-definition-option-${index}-key`,
                    }}
                  />
                  <TextField
                    label={t('reactory.organizations.demographics.field.optionLabel')}
                    value={row.label}
                    onChange={(event) => patchOption(index, { label: event.target.value })}
                    size="small"
                    sx={{ flex: 1 }}
                    inputProps={{
                      'data-testid': `demographic-definition-option-${index}-label`,
                    }}
                  />
                  <TextField
                    label={t('reactory.organizations.demographics.field.optionOrdinal')}
                    value={Number.isFinite(row.ordinal) ? row.ordinal : ''}
                    onChange={(event) => patchOption(index, { ordinal: Number(event.target.value) })}
                    type="number"
                    size="small"
                    sx={{ width: 96 }}
                    inputProps={{
                      'data-testid': `demographic-definition-option-${index}-ordinal`,
                    }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={row.deprecated}
                        onChange={(event) =>
                          patchOption(index, { deprecated: event.target.checked })
                        }
                        size="small"
                        inputProps={switchInputProps(
                          `demographic-definition-option-${index}-deprecated`,
                          t('reactory.organizations.demographics.field.optionDeprecated'),
                        )}
                      />
                    }
                    label={t('reactory.organizations.demographics.field.optionDeprecated')}
                  />
                  <Tooltip title={t('reactory.organizations.demographics.options.remove')}>
                    <IconButton
                      size="small"
                      aria-label={t('reactory.organizations.demographics.options.remove')}
                      onClick={() => removeOption(index)}
                      data-testid={`demographic-definition-option-${index}-remove`}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>

            {optionsError && (
              <Alert severity="error" sx={{ mt: 1 }} data-testid="demographic-definition-options-error">
                {optionsError}
              </Alert>
            )}
          </Box>
        )}

        {/* ---- Reference ---- */}
        {draft.valueType === 'reference' && (
          <Stack spacing={1} data-testid="demographic-definition-reference">
            <TextField
              select
              label={t('reactory.organizations.demographics.field.referenceModel')}
              value={draft.referenceModel}
              onChange={(event) => update('referenceModel', event.target.value)}
              fullWidth
              error={Boolean(fieldError('reference'))}
              helperText={fieldError('reference')}
            >
              {DEMOGRAPHIC_REFERENCE_MODELS.map((model) => (
                <MenuItem key={model} value={model}>
                  {model}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={draft.referenceMultiple}
                  onChange={(event) => update('referenceMultiple', event.target.checked)}
                  inputProps={switchInputProps(
                    'demographic-definition-field-reference-multiple',
                    t('reactory.organizations.demographics.field.referenceMultiple'),
                  )}
                />
              }
              label={t('reactory.organizations.demographics.field.referenceMultiple')}
            />
          </Stack>
        )}

        {/* ---- Widget binding ---- */}
        <Divider />
        <Typography variant="subtitle2" component="h3">
          {t('reactory.organizations.demographics.section.widget')}
        </Typography>

        <TextField
          label={t('reactory.organizations.demographics.field.widgetFqn')}
          value={draft.widgetFqn}
          onChange={(event) => update('widgetFqn', event.target.value)}
          fullWidth
          helperText={t('reactory.organizations.demographics.field.widgetFqnHint')}
          inputProps={{ 'data-testid': 'demographic-definition-field-widget-fqn' }}
        />

        {widgetStatus === 'resolved' && (
          <Chip
            size="small"
            color="success"
            variant="outlined"
            data-testid="demographic-definition-widget-status"
            label={t('reactory.organizations.demographics.widget.resolved', {
              fqn: draft.widgetFqn.trim(),
            })}
          />
        )}
        {widgetStatus === 'unresolved' && (
          <Alert severity="warning" data-testid="demographic-definition-widget-status">
            {t('reactory.organizations.demographics.widget.unresolved', {
              fqn: draft.widgetFqn.trim(),
            })}
          </Alert>
        )}
        {widgetStatus === 'unavailable' && (
          <Alert severity="info" data-testid="demographic-definition-widget-status">
            {t('reactory.organizations.demographics.widget.registryUnavailable')}
          </Alert>
        )}

        <TextField
          label={t('reactory.organizations.demographics.field.widgetProps')}
          value={draft.widgetPropsText}
          onChange={(event) => update('widgetPropsText', event.target.value)}
          onBlur={() => touch('widgetProps')}
          fullWidth
          multiline
          minRows={3}
          error={Boolean(fieldError('widgetProps'))}
          helperText={
            fieldError('widgetProps') ||
            t('reactory.organizations.demographics.field.widgetPropsHint')
          }
          inputProps={{
            'data-testid': 'demographic-definition-field-widget-props',
            spellCheck: false,
            style: { fontFamily: 'monospace', fontSize: 12 },
          }}
        />

        <Box data-testid="demographic-definition-propsmap">
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" component="h4">
              {t('reactory.organizations.demographics.field.widgetPropsMap')}
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addMapping}
              data-testid="demographic-definition-propsmap-add"
            >
              {t('reactory.organizations.demographics.widget.addMapping')}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {t('reactory.organizations.demographics.field.widgetPropsMapHint')}
          </Typography>

          <Stack spacing={1} sx={{ mt: 1 }}>
            {draft.widgetPropsMap.map((row, index) => (
              <Stack
                key={row.id}
                direction="row"
                spacing={1}
                alignItems="center"
                data-testid={`demographic-definition-propsmap-${index}`}
              >
                <TextField
                  label={t('reactory.organizations.demographics.widget.mapSource')}
                  value={row.source}
                  onChange={(event) => patchMapping(index, { source: event.target.value })}
                  size="small"
                  sx={{ flex: 1 }}
                  inputProps={{
                    'data-testid': `demographic-definition-propsmap-${index}-source`,
                  }}
                />
                <TextField
                  label={t('reactory.organizations.demographics.widget.mapProp')}
                  value={row.prop}
                  onChange={(event) => patchMapping(index, { prop: event.target.value })}
                  size="small"
                  sx={{ flex: 1 }}
                  inputProps={{
                    'data-testid': `demographic-definition-propsmap-${index}-prop`,
                  }}
                />
                <Tooltip title={t('reactory.organizations.demographics.widget.removeMapping')}>
                  <IconButton
                    size="small"
                    aria-label={t('reactory.organizations.demographics.widget.removeMapping')}
                    onClick={() => removeMapping(index)}
                    data-testid={`demographic-definition-propsmap-${index}-remove`}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
          </Stack>

          {propsMapError && (
            <Alert severity="error" sx={{ mt: 1 }} data-testid="demographic-definition-propsmap-error">
              {propsMapError}
            </Alert>
          )}
        </Box>

        {/* ---- Behaviour flags ---- */}
        <Divider />
        <Typography variant="subtitle2" component="h3">
          {t('reactory.organizations.demographics.section.behaviour')}
        </Typography>

        <Stack spacing={0.5}>
          {(
            [
              ['required', 'flag.required', 'flag.requiredHint'],
              ['multiValued', 'flag.multiValued', 'flag.multiValuedHint'],
              ['sensitive', 'flag.sensitive', 'flag.sensitiveHint'],
              ['searchable', 'flag.searchable', 'flag.searchableHint'],
              ['enabled', 'flag.enabled', 'flag.enabledHint'],
            ] as const
          ).map(([field, labelKey, hintKey]) => (
            <Box key={field}>
              <FormControlLabel
                control={
                  <Switch
                    checked={draft[field] === true}
                    onChange={(event) => update(field, event.target.checked)}
                    inputProps={switchInputProps(
                      `demographic-definition-flag-${field}`,
                      t(`reactory.organizations.demographics.${labelKey}`),
                    )}
                  />
                }
                label={t(`reactory.organizations.demographics.${labelKey}`)}
              />
              <Typography variant="caption" color="text.secondary" display="block">
                {t(`reactory.organizations.demographics.${hintKey}`)}
              </Typography>
            </Box>
          ))}
        </Stack>

        {/* ---- Live preview ---- */}
        <Divider />
        <Typography variant="subtitle2" component="h3">
          {t('reactory.organizations.demographics.section.preview')}
        </Typography>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              {t('reactory.organizations.demographics.preview.hint')}
            </Typography>
            <Box data-testid="demographic-definition-preview">
              {/*
                The shared renderer (ORG-032) is the preview: a second renderer
                would drift from what members actually see. `enabled` is forced
                true inside `draftDefinition` so a definition being re-enabled is
                still previewable.
              */}
              <DemographicForm
                definitions={[previewDefinition]}
                values={previewValues}
                onChange={(values) => setPreviewValues(values)}
                organization={organization}
                reactory={reactory}
                mode="edit"
              />
            </Box>
          </CardContent>
        </Card>

        {error && (
          <Alert severity="error" data-testid="demographic-definition-save-error">
            {resolveError(t, error)}
          </Alert>
        )}
      </Box>

      <Divider />
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ p: 2 }}>
        <Button onClick={onClose} data-testid="demographic-definition-cancel" disabled={saving}>
          {t('reactory.organizations.demographics.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          data-testid="demographic-definition-save"
        >
          {saving
            ? t('reactory.organizations.demographics.saving')
            : t('reactory.organizations.demographics.save')}
        </Button>
      </Stack>
      </Box>
    </Drawer>
  );
};

export default DemographicDefinitionDrawer;
