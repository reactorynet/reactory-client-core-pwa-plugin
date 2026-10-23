import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  CloudUpload as CloudUploadIcon,
  Code as CodeIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FileCopy as FileCopyIcon,
  PlayArrow as PlayArrowIcon,
  Palette as PaletteIcon,
} from '@mui/icons-material';

import { emitOrganizationUpdated } from './events';
import useOrganizationBranding from './hooks/useOrganizationBranding';
import { resolveError, type OrganizationMessageKey } from './i18n';
import type {
  OrganizationImageType,
  OrganizationTabProps,
  OrganizationThemeMode,
} from './types';
import {
  DEFAULT_CSS_TEMPLATE,
  ThemeCssStudio,
  ThemeEditor,
  buildThemePayload,
  createDefaultTheme,
  duplicateTheme,
  prepareThemeForEditing,
  type IThemeRecord,
} from '../theme-editor';

/**
 * Branding tab (ORG-013).
 *
 * Owns the organization's logo/avatar and its theme assignment. All persistence
 * lives in `useOrganizationBranding` (GraphQL documents are in `./graphql`);
 * the theme editing UI comes from the shared, transport-agnostic `theme-editor`
 * folder, which this tab must not modify.
 *
 * Server contract notes
 * ---------------------
 * - `OrganizationUploadImage(id, imageType, file)` stores the image and returns
 *   the organization with the persisted alias (`logo`/`avatar`) and resolved
 *   URL. There is no follow-up `updateOrganization`; removing an image *is* an
 *   `updateOrganization({ logo: null })` / `({ avatar: null })`.
 * - Save/activate/delete return the whole organization. The active theme and
 *   mode are rendered from that response, never re-derived: deleting the active
 *   theme leaves the server to pick the first remaining theme or to clear the
 *   pointer, and the tab must show exactly what came back.
 * - Uploads are validated *before* the mutation is called: accepted types are
 *   PNG, JPEG, SVG and WebP, and the file must be 5 MB or smaller.
 */

/** Largest accepted branding image, in bytes (5 MB). */
export const BRANDING_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Largest accepted branding image, in megabytes, for the translated hint. */
export const BRANDING_IMAGE_MAX_MB = 5;

/** MIME types the server accepts for a logo or avatar. */
export const BRANDING_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
];

const MODE_VALUES: OrganizationThemeMode[] = ['light', 'dark', 'os'];

const MODE_LABEL_KEYS: Record<OrganizationThemeMode, OrganizationMessageKey> = {
  light: 'reactory.organizations.branding.theme.mode.light',
  dark: 'reactory.organizations.branding.theme.mode.dark',
  os: 'reactory.organizations.branding.theme.mode.os',
};

const IMAGE_LABEL_KEYS: Record<OrganizationImageType, OrganizationMessageKey> = {
  logo: 'reactory.organizations.branding.image.logoName',
  avatar: 'reactory.organizations.branding.image.avatarName',
};

/**
 * Validate a candidate logo/avatar before any network call.
 *
 * Returns the message key describing the problem, or `null` when the file is
 * acceptable. Kept as a pure function so the rejection rule is testable without
 * rendering the tab (and so the rule cannot drift from the `accept` attribute).
 */
export const validateBrandingImage = (
  file?: { type?: string | null; size?: number | null } | null,
): OrganizationMessageKey | null => {
  if (!file) return 'reactory.organizations.branding.image.typeInvalid';

  const type = `${file.type || ''}`.toLowerCase();
  if (BRANDING_IMAGE_TYPES.indexOf(type) < 0) {
    return 'reactory.organizations.branding.image.typeInvalid';
  }

  const size = typeof file.size === 'number' ? file.size : 0;
  if (size > BRANDING_IMAGE_MAX_BYTES) {
    return 'reactory.organizations.branding.image.tooLarge';
  }

  return null;
};

/**
 * Pick an unused theme key for a new theme.
 *
 * Theme names are the server's identity for a theme, so a duplicate name would
 * silently overwrite an existing record. `theme-1`, `theme-2`, … keeps creating
 * a new theme from clobbering one that already exists.
 */
export const nextThemeName = (themes: IThemeRecord[] = []): string => {
  const taken = new Set((themes || []).map((theme) => `${theme?.name || ''}`));
  let ordinal = 1;
  let candidate = `theme-${ordinal}`;
  while (taken.has(candidate)) {
    ordinal += 1;
    candidate = `theme-${ordinal}`;
  }
  return candidate;
};

/** Resolve a theme's default mode to one of the three accepted values. */
const normalizeMode = (value?: string | null): OrganizationThemeMode =>
  value === 'light' || value === 'dark' || value === 'os' ? value : 'dark';

interface ImageSlotProps {
  imageType: OrganizationImageType;
  title: string;
  hint: string;
  url: string | null;
  canManage: boolean;
  uploading: boolean;
  disabled: boolean;
  uploadLabel: string;
  replaceLabel: string;
  removeLabel: string;
  uploadingLabel: string;
  emptyLabel: string;
  onSelect: (file: File) => void;
  onRemove: () => void;
}

/**
 * One image slot (logo or avatar): preview, upload/replace and remove.
 *
 * Rendered as a small local component so logo and avatar cannot drift: both get
 * the same validation path, the same disabled logic and the same preview.
 */
const ImageSlot: React.FC<ImageSlotProps> = ({
  imageType,
  title,
  hint,
  url,
  canManage,
  uploading,
  disabled,
  uploadLabel,
  replaceLabel,
  removeLabel,
  uploadingLabel,
  emptyLabel,
  onSelect,
  onRemove,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    // Reset so choosing the same file again still fires `change`.
    event.target.value = '';
    if (file) onSelect(file);
  };

  return (
    <Card variant="outlined" data-testid={`organization-branding-${imageType}-slot`}>
      <CardContent>
        <Typography variant="subtitle1" component="h3" gutterBottom>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
          {hint}
        </Typography>

        <Box
          sx={{
            alignItems: 'center',
            bgcolor: 'background.default',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            display: 'flex',
            height: 120,
            justifyContent: 'center',
            my: 2,
            overflow: 'hidden',
            p: 1,
          }}
        >
          {url ? (
            <Box
              component="img"
              src={url}
              alt={title}
              data-testid={`organization-branding-${imageType}-preview`}
              sx={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              {emptyLabel}
            </Typography>
          )}
        </Box>

        {uploading && <LinearProgress sx={{ mb: 2 }} />}

        <input
          ref={inputRef}
          type="file"
          hidden
          accept={BRANDING_IMAGE_TYPES.join(',')}
          data-testid={`organization-branding-${imageType}-input`}
          onChange={handleChange}
        />

        {canManage && (
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
              disabled={disabled}
              onClick={() => inputRef.current && inputRef.current.click()}
            >
              {uploading ? uploadingLabel : url ? replaceLabel : uploadLabel}
            </Button>
            {url && (
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                disabled={disabled}
                onClick={onRemove}
              >
                {removeLabel}
              </Button>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Branding tab body.
 *
 * Every string is an i18n key; every write is hidden when `canManage` is false.
 */
export const OrganizationBrandingTab: React.FC<OrganizationTabProps> = ({
  reactory,
  t,
  organization,
  canManage,
  refresh,
  onUnsavedChanges,
  notify,
}) => {
  const branding = useOrganizationBranding({ reactory, organization });

  const readOnly = canManage === false;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<IThemeRecord | null>(null);
  const [themeDirty, setThemeDirty] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [cssOpen, setCssOpen] = useState(false);
  const [cssTheme, setCssTheme] = useState('');
  const [cssContent, setCssContent] = useState('');
  const [cssPublishing, setCssPublishing] = useState(false);
  const cssThemeRef = useRef('');

  /**
   * Dirty state means one thing: the editor holds a theme that has not been
   * committed. It is set on every editor change and cleared only when the save
   * or the discard completes — never merely because a request was attempted.
   */
  useEffect(() => {
    onUnsavedChanges(themeDirty);
  }, [themeDirty, onUnsavedChanges]);

  // Switching tabs unmounts the tab; the shell must not keep guarding for an
  // editor that no longer exists.
  useEffect(
    () => () => {
      onUnsavedChanges(false);
    },
    [onUnsavedChanges],
  );

  const safeRefresh = useCallback(async () => {
    try {
      await refresh();
    } catch {
      // The write already succeeded; a failed reload must not be reported as a
      // failed write.
    }
  }, [refresh]);

  const themeNames = useMemo(
    () => (branding.themes || []).map((theme) => `${theme?.name || ''}`).filter(Boolean),
    [branding.themes],
  );

  const inherited = !branding.theme;
  const activeMode = branding.themeMode || 'dark';

  const effectiveThemeLabel = inherited
    ? t('reactory.organizations.branding.theme.effectiveInherited')
    : t('reactory.organizations.branding.theme.effectiveOwn', {
        name: branding.theme || '',
        mode: t(MODE_LABEL_KEYS[activeMode]),
      });

  const loadError =
    branding.error &&
    (branding.error.key === 'reactory.organizations.error.brandingLoadFailed' ||
      branding.error.key === 'reactory.organizations.error.apiUnavailable')
      ? resolveError(t, branding.error)
      : null;

  /** Validate, then upload. Nothing touches the network when the file is invalid. */
  const handleSelectImage = useCallback(
    async (imageType: OrganizationImageType, file: File) => {
      const issue = validateBrandingImage(file);
      if (issue) {
        notify(t(issue, { max: BRANDING_IMAGE_MAX_MB }), 'error');
        return;
      }

      const result = await branding.uploadImage(imageType, file);
      if (!result.organization) {
        notify(
          resolveError(t, result.error) ||
            t('reactory.organizations.branding.image.uploadFailed'),
          'error',
        );
        return;
      }

      emitOrganizationUpdated(reactory, result.organization);

      notify(
        t('reactory.organizations.branding.image.uploaded', {
          type: t(IMAGE_LABEL_KEYS[imageType]),
        }),
        'success',
      );
      await safeRefresh();
    },
    [branding, notify, reactory, safeRefresh, t],
  );

  const handleRemoveImage = useCallback(
    async (imageType: OrganizationImageType) => {
      const result = await branding.removeImage(imageType);
      if (!result.organization) {
        notify(
          resolveError(t, result.error) ||
            t('reactory.organizations.branding.image.removeFailed'),
          'error',
        );
        return;
      }

      emitOrganizationUpdated(reactory, result.organization);

      notify(
        t('reactory.organizations.branding.image.removed', {
          type: t(IMAGE_LABEL_KEYS[imageType]),
        }),
        'success',
      );
      await safeRefresh();
    },
    [branding, notify, reactory, safeRefresh, t],
  );

  /**
   * Toggle inheritance.
   *
   * Inheriting clears `theme` and `themeMode`; taking ownership requires at
   * least one theme, which is activated through `OrganizationSetActiveTheme`.
   */
  const handleInheritanceChange = useCallback(
    async (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
      if (checked) {
        const result = await branding.inheritClientTheme();
        if (!result.organization) {
          notify(
            resolveError(t, result.error) ||
              t('reactory.organizations.branding.themes.inheritFailed'),
            'error',
          );
          return;
        }

        emitOrganizationUpdated(reactory, result.organization);

        notify(t('reactory.organizations.branding.themes.inherited'), 'success');
        await safeRefresh();
        return;
      }

      if (branding.themes.length === 0) {
        notify(t('reactory.organizations.branding.theme.requiresTheme'), 'warning');
        return;
      }

      const first = branding.themes[0];
      const mode = normalizeMode(branding.themeMode || first.defaultThemeMode);
      const result = await branding.activateTheme(`${first.name}`, mode);
      if (!result.organization) {
        notify(
          resolveError(t, result.error) ||
            t('reactory.organizations.branding.themes.activateFailed'),
          'error',
        );
        return;
      }

      emitOrganizationUpdated(reactory, result.organization);

      notify(
        t('reactory.organizations.branding.themes.activated', { name: `${first.name}` }),
        'success',
      );
      await safeRefresh();
    },
    [branding, notify, reactory, safeRefresh, t],
  );

  const handleModeChange = useCallback(
    async (mode: OrganizationThemeMode) => {
      if (!branding.theme) return;

      const result = await branding.activateTheme(branding.theme, mode);
      if (!result.organization) {
        notify(
          resolveError(t, result.error) ||
            t('reactory.organizations.branding.themes.activateFailed'),
          'error',
        );
        return;
      }

      emitOrganizationUpdated(reactory, result.organization);

      notify(
        t('reactory.organizations.branding.themes.activated', { name: branding.theme }),
        'success',
      );
      await safeRefresh();
    },
    [branding, notify, reactory, safeRefresh, t],
  );

  const handleActivateTheme = useCallback(
    async (themeName: string) => {
      const result = await branding.activateTheme(themeName, branding.themeMode);
      if (!result.organization) {
        notify(
          resolveError(t, result.error) ||
            t('reactory.organizations.branding.themes.activateFailed'),
          'error',
        );
        return;
      }

      emitOrganizationUpdated(reactory, result.organization);

      notify(
        t('reactory.organizations.branding.themes.activated', { name: themeName }),
        'success',
      );
      await safeRefresh();
    },
    [branding, notify, reactory, safeRefresh, t],
  );

  const openCreateTheme = useCallback(() => {
    const theme = prepareThemeForEditing(createDefaultTheme(nextThemeName(branding.themes)));
    setEditingTheme(theme);
    // A brand-new theme is uncommitted from the moment the editor opens.
    setThemeDirty(true);
    setEditorOpen(true);
  }, [branding.themes]);

  const openEditTheme = useCallback((theme: IThemeRecord) => {
    setEditingTheme(prepareThemeForEditing(theme));
    setThemeDirty(false);
    setEditorOpen(true);
  }, []);

  const openDuplicateTheme = useCallback((theme: IThemeRecord) => {
    setEditingTheme(duplicateTheme(prepareThemeForEditing(theme)));
    setThemeDirty(true);
    setEditorOpen(true);
  }, []);

  const handleEditorChange = useCallback((next: IThemeRecord) => {
    setEditingTheme(next);
    setThemeDirty(true);
  }, []);

  /**
   * Discard the editor's working copy.
   *
   * The dirty flag is cleared here only because the draft is dropped in the
   * same action; clearing it without discarding is the input-loss bug this tab
   * must not reintroduce.
   */
  const handleEditorCancel = useCallback(() => {
    setEditorOpen(false);
    setEditingTheme(null);
    setThemeDirty(false);
  }, []);

  const handleSaveTheme = useCallback(
    async (payload: IThemeRecord) => {
      const themePayload = buildThemePayload(payload);
      const result = await branding.saveTheme(themePayload);

      if (!result.organization) {
        // The editor stays open with the user's draft intact; the dirty flag is
        // deliberately left set so the shell keeps guarding navigation.
        notify(
          resolveError(t, result.error) || t('reactory.organizations.branding.themes.saveFailed'),
          'error',
        );
        return;
      }

      setEditorOpen(false);
      setEditingTheme(null);
      setThemeDirty(false);

      emitOrganizationUpdated(reactory, result.organization);

      notify(
        t('reactory.organizations.branding.themes.saved', { name: `${themePayload.name}` }),
        'success',
      );
      await safeRefresh();
    },
    [branding, notify, reactory, safeRefresh, t],
  );

  const handleConfirmDelete = useCallback(async () => {
    const themeName = deleteTarget;
    if (!themeName) return;

    const result = await branding.deleteTheme(themeName);
    setDeleteTarget(null);

    if (!result.organization) {
      notify(
        resolveError(t, result.error) ||
          t('reactory.organizations.branding.themes.deleteFailed'),
        'error',
      );
      return;
    }

    emitOrganizationUpdated(reactory, result.organization);

    notify(t('reactory.organizations.branding.themes.deleted', { name: themeName }), 'success');
    await safeRefresh();
  }, [branding, deleteTarget, notify, reactory, safeRefresh, t]);

  const openCssStudio = useCallback(
    async (theme: IThemeRecord) => {
      const themeName = `${theme.name || ''}`;
      if (!themeName) return;

      cssThemeRef.current = themeName;
      setCssTheme(themeName);
      setCssContent(DEFAULT_CSS_TEMPLATE);
      setCssOpen(true);

      const result = await branding.loadThemeCss(themeName);

      // The studio may have been closed (or another theme opened) while the
      // read was in flight; a stale response must not overwrite the editor.
      if (cssThemeRef.current !== themeName) return;

      if (result.error) {
        notify(
          resolveError(t, result.error) ||
            t('reactory.organizations.branding.css.loadFailed'),
          'error',
        );
        return;
      }

      if (result.css && result.css.trim().length > 0) {
        setCssContent(result.css);
      }
    },
    [branding, notify, t],
  );

  const handleCloseCssStudio = useCallback(() => {
    cssThemeRef.current = '';
    setCssOpen(false);
  }, []);

  const handlePublishCss = useCallback(async () => {
    if (!cssTheme) return;

    setCssPublishing(true);
    const result = await branding.publishThemeCss(cssTheme, cssContent);
    setCssPublishing(false);

    if (!result.published) {
      notify(
        resolveError(t, result.error) ||
          t('reactory.organizations.branding.css.publishFailed'),
        'error',
      );
      return;
    }

    notify(t('reactory.organizations.branding.css.published', { name: cssTheme }), 'success');
    handleCloseCssStudio();
    await safeRefresh();
  }, [branding, cssContent, cssTheme, handleCloseCssStudio, notify, safeRefresh, t]);

  const busy = branding.uploading !== null;

  return (
    <Stack spacing={3} data-testid="organization-branding-tab">
      {readOnly && (
        <Alert severity="info" variant="outlined" data-testid="organization-branding-readonly">
          {t('reactory.organizations.detail.readOnly')}
        </Alert>
      )}

      {loadError && (
        <Alert
          severity="error"
          data-testid="organization-branding-load-error"
          action={
            <Button color="inherit" size="small" onClick={() => void branding.refreshBranding()}>
              {t('reactory.organizations.list.retry')}
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" component="h2">
              {t('reactory.organizations.branding.images.title')}
            </Typography>
            {branding.loading && <CircularProgress size={18} data-testid="organization-branding-loading" />}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {t('reactory.organizations.branding.images.hint')}
          </Typography>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        }}
      >
        <ImageSlot
          imageType="logo"
          title={t('reactory.organizations.branding.logo.title')}
          hint={t('reactory.organizations.branding.logo.hint', { max: BRANDING_IMAGE_MAX_MB })}
          url={branding.logoURL}
          canManage={!readOnly}
          uploading={branding.uploading === 'logo'}
          disabled={busy}
          uploadLabel={t('reactory.organizations.branding.image.upload')}
          replaceLabel={t('reactory.organizations.branding.image.replace')}
          removeLabel={t('reactory.organizations.branding.image.remove')}
          uploadingLabel={t('reactory.organizations.branding.image.uploading')}
          emptyLabel={t('reactory.organizations.branding.image.empty')}
          onSelect={(file) => void handleSelectImage('logo', file)}
          onRemove={() => void handleRemoveImage('logo')}
        />

        <ImageSlot
          imageType="avatar"
          title={t('reactory.organizations.branding.avatar.title')}
          hint={t('reactory.organizations.branding.avatar.hint', { max: BRANDING_IMAGE_MAX_MB })}
          url={branding.avatarURL}
          canManage={!readOnly}
          uploading={branding.uploading === 'avatar'}
          disabled={busy}
          uploadLabel={t('reactory.organizations.branding.image.upload')}
          replaceLabel={t('reactory.organizations.branding.image.replace')}
          removeLabel={t('reactory.organizations.branding.image.remove')}
          uploadingLabel={t('reactory.organizations.branding.image.uploading')}
          emptyLabel={t('reactory.organizations.branding.image.empty')}
          onSelect={(file) => void handleSelectImage('avatar', file)}
          onRemove={() => void handleRemoveImage('avatar')}
        />
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" component="h2" gutterBottom>
            {t('reactory.organizations.branding.theme.section')}
          </Typography>

          {readOnly ? (
            <Typography variant="body2" data-testid="organization-branding-inheritance-readonly">
              {inherited
                ? t('reactory.organizations.branding.theme.inheritHint')
                : t('reactory.organizations.branding.theme.ownHint')}
            </Typography>
          ) : (
            <FormControlLabel
              control={
                <Switch
                  checked={inherited}
                  onChange={(event, checked) => void handleInheritanceChange(event, checked)}
                  inputProps={{ 'aria-label': t('reactory.organizations.branding.theme.inherit') }}
                  disabled={branding.saving}
                />
              }
              label={t('reactory.organizations.branding.theme.inherit')}
            />
          )}

          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            {inherited
              ? t('reactory.organizations.branding.theme.inheritHint')
              : t('reactory.organizations.branding.theme.ownHint')}
          </Typography>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            sx={{ mt: 1 }}
          >
            <Typography variant="body2" data-testid="organization-branding-effective-theme">
              {`${t('reactory.organizations.branding.theme.effective')}: ${effectiveThemeLabel}`}
            </Typography>

            {!inherited && (
              <TextField
                select
                size="small"
                sx={{ minWidth: 180 }}
                label={t('reactory.organizations.branding.theme.mode')}
                value={activeMode}
                disabled={readOnly || branding.saving}
                onChange={(event) => void handleModeChange(normalizeMode(event.target.value))}
                inputProps={{ 'data-testid': 'organization-branding-mode' }}
              >
                {MODE_VALUES.map((mode) => (
                  <MenuItem key={mode} value={mode}>
                    {t(MODE_LABEL_KEYS[mode])}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <PaletteIcon color="primary" fontSize="small" />
              <Typography variant="subtitle1" component="h2">
                {t('reactory.organizations.branding.themes.title')}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                label={t('reactory.organizations.branding.themes.count', {
                  count: themeNames.length,
                })}
              />
            </Stack>

            {!readOnly && (
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openCreateTheme}
                disabled={branding.saving}
              >
                {t('reactory.organizations.branding.themes.create')}
              </Button>
            )}
          </Stack>

          <Divider sx={{ my: 2 }} />

          {themeNames.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('reactory.organizations.branding.themes.empty')}
            </Typography>
          ) : (
            <Stack spacing={1} data-testid="organization-branding-theme-list">
              {(branding.themes || []).map((theme) => {
                const themeName = `${theme?.name || ''}`;
                if (!themeName) return null;

                const isActive = !inherited && branding.theme === themeName;

                return (
                  <Stack
                    key={themeName}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    justifyContent="space-between"
                    data-testid={`organization-branding-theme-${themeName}`}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body1" noWrap>
                          {themeName}
                        </Typography>
                        {isActive && (
                          <Chip
                            size="small"
                            color="primary"
                            icon={<CheckCircleIcon />}
                            label={t('reactory.organizations.branding.themes.active')}
                          />
                        )}
                        {theme.defaultThemeMode && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={t(
                              MODE_LABEL_KEYS[normalizeMode(`${theme.defaultThemeMode}`)],
                            )}
                          />
                        )}
                      </Stack>
                      {theme.description && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {theme.description}
                        </Typography>
                      )}
                    </Box>

                    {!readOnly && (
                      <Stack direction="row" spacing={0.5}>
                        {!isActive && (
                          <Tooltip
                            title={t('reactory.organizations.branding.themes.activate', {
                              name: themeName,
                            })}
                          >
                            <IconButton
                              size="small"
                              color="primary"
                              aria-label={t('reactory.organizations.branding.themes.activate', {
                                name: themeName,
                              })}
                              disabled={branding.saving}
                              onClick={() => void handleActivateTheme(themeName)}
                            >
                              <PlayArrowIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}

                        <Tooltip
                          title={t('reactory.organizations.branding.themes.edit', {
                            name: themeName,
                          })}
                        >
                          <IconButton
                            size="small"
                            aria-label={t('reactory.organizations.branding.themes.edit', {
                              name: themeName,
                            })}
                            disabled={branding.saving}
                            onClick={() => openEditTheme(theme)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip
                          title={t('reactory.organizations.branding.themes.duplicate', {
                            name: themeName,
                          })}
                        >
                          <IconButton
                            size="small"
                            aria-label={t('reactory.organizations.branding.themes.duplicate', {
                              name: themeName,
                            })}
                            disabled={branding.saving}
                            onClick={() => openDuplicateTheme(theme)}
                          >
                            <FileCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip
                          title={t('reactory.organizations.branding.themes.css', {
                            name: themeName,
                          })}
                        >
                          <IconButton
                            size="small"
                            aria-label={t('reactory.organizations.branding.themes.css', {
                              name: themeName,
                            })}
                            disabled={branding.saving}
                            onClick={() => void openCssStudio(theme)}
                          >
                            <CodeIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip
                          title={t('reactory.organizations.branding.themes.delete', {
                            name: themeName,
                          })}
                        >
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={t('reactory.organizations.branding.themes.delete', {
                              name: themeName,
                            })}
                            disabled={branding.saving}
                            onClick={() => setDeleteTarget(themeName)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/*
        The shared editor owns every editing surface; this tab owns persistence.
        `mode`/`readOnly` follow `canManage`, and `saving` disables its Save
        while the mutation is in flight.
      */}
      <ThemeEditor
        open={editorOpen}
        theme={editingTheme}
        mode={readOnly ? 'view' : 'edit'}
        readOnly={readOnly}
        saving={branding.saving}
        title={t('reactory.organizations.branding.themes.editorTitle', {
          name: editingTheme?.name || '',
        })}
        saveLabel={t('reactory.organizations.branding.themes.saveLabel')}
        onChange={handleEditorChange}
        onSave={(payload) => handleSaveTheme(payload as IThemeRecord)}
        onCancel={handleEditorCancel}
      />

      <ThemeCssStudio
        open={cssOpen}
        themeName={cssTheme}
        content={cssContent}
        onChange={setCssContent}
        onPublish={() => void handlePublishCss()}
        onClose={handleCloseCssStudio}
        publishing={cssPublishing}
        readOnly={readOnly}
      />

      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>
          {t('reactory.organizations.branding.themes.deleteTitle', {
            name: deleteTarget || '',
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('reactory.organizations.branding.themes.deleteBody')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={branding.saving}>
            {t('reactory.organizations.branding.themes.deleteCancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleConfirmDelete()}
            disabled={branding.saving}
          >
            {t('reactory.organizations.branding.themes.deleteConfirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default OrganizationBrandingTab;
