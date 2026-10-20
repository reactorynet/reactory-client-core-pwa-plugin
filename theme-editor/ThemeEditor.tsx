/**
 * ThemeEditor — the single, reusable theme editor.
 *
 * Controlled and transport agnostic: it renders/edits the supplied `theme`
 * and emits the next theme through `onChange`. Persistence (GraphQL or
 * otherwise) belongs to the caller, which receives a sanitized payload through
 * `onSave`.
 *
 * Owns: general metadata & content, light/dark palettes, typography/shape
 * options, component overrides, assets, the raw ThemeOptions JSON editor and
 * the live preview.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Code as CodeIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Palette as PaletteIcon,
  Tune as TuneIcon,
  FontDownload as TypographyIcon,
  Widgets as WidgetsIcon,
  Image as ImageIcon,
  Preview as PreviewIcon,
  FormatPaint as FormatPaintIcon,
} from '@mui/icons-material';
import { buildThemePayload, getModePalette, updateThemeComponents, updateThemeOptionSection, updateThemePalette } from './themeModel';
import type { IThemeRecord, ThemeEditorProps, ThemeModeKey } from './types';

const RAW_JSON_TAB = 5;

const ThemeEditor: React.FC<ThemeEditorProps> = ({
  theme,
  open = true,
  mode = 'edit',
  readOnly = false,
  saving = false,
  themeMode,
  onChange,
  onSave,
  onCancel,
  onError,
  variant = 'dialog',
  title,
  saveLabel = 'Save Theme',
  maxWidth = 'lg',
}) => {
  const isReadOnly = readOnly || mode === 'view';

  const [editorTab, setEditorTab] = useState<number>(0);
  const [activeModeTab, setActiveModeTab] = useState<ThemeModeKey>(
    themeMode || (theme?.defaultThemeMode === 'light' ? 'light' : 'dark'),
  );
  const [rawJsonOptions, setRawJsonOptions] = useState<string>(() =>
    JSON.stringify(theme?.options || {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const wasOpenRef = useRef<boolean>(false);
  const themeIdRef = useRef<any>(null);

  // Reset tab/JSON state whenever a new editing session starts (dialog opened,
  // or the host swapped to a different theme record).
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    const themeChanged = open && (theme?.id || null) !== themeIdRef.current;
    wasOpenRef.current = open;
    themeIdRef.current = theme?.id || null;

    if (open && (justOpened || themeChanged)) {
      setEditorTab(0);
      setJsonError(null);
      setFormError(null);
      setActiveModeTab(themeMode || (theme?.defaultThemeMode === 'light' ? 'light' : 'dark'));
    }
  }, [open, theme?.id, themeMode]);

  // Keep the raw JSON mirror in step with the theme while the user is not
  // actively editing JSON, so a palette edit is never lost on save.
  useEffect(() => {
    if (!open || editorTab === RAW_JSON_TAB) return;
    setRawJsonOptions(JSON.stringify(theme?.options || {}, null, 2));
  }, [open, editorTab, theme?.options]);

  const emit = (next: IThemeRecord) => {
    if (isReadOnly) return;
    if (onChange) onChange(next);
  };

  const reportError = (message: string) => {
    if (onError) {
      onError(message);
      return;
    }
    // Standalone usage: surface validation failures inline instead of losing
    // them in the JSON tab's error slot.
    setFormError(message);
  };

  const currentEditingPalette = useMemo(
    () => getModePalette(theme, activeModeTab),
    [theme, activeModeTab],
  );

  const handleSave = () => {
    if (isReadOnly || !theme) return;

    if (!theme.name) {
      reportError('Theme name is required');
      return;
    }

    // On the JSON tab the textarea is the source of truth for options.
    let finalOptions = theme.options || {};
    try {
      if (rawJsonOptions.trim()) {
        finalOptions = JSON.parse(rawJsonOptions);
      }
    } catch (e: any) {
      setJsonError(`Invalid JSON in options: ${e.message}`);
      setEditorTab(RAW_JSON_TAB);
      return;
    }

    if (onSave) onSave(buildThemePayload(theme, finalOptions));
  };

  const handlePaletteChange = (category: string, field: string, value: string) => {
    if (!theme) return;
    emit(updateThemePalette(theme, activeModeTab, category, field, value));
  };

  const handleTypographyChange = (patch: { fontFamily?: string; fontSize?: number }) => {
    if (!theme) return;
    emit(updateThemeOptionSection(theme, 'typography', patch));
  };

  const handleShapeChange = (borderRadius: number) => {
    if (!theme) return;
    emit(updateThemeOptionSection(theme, 'shape', { borderRadius }));
  };

  const handleSpacingChange = (spacing: number) => {
    if (!theme) return;
    emit({ ...theme, options: { ...(theme.options || {}), spacing } });
  };

  const patchButtonDefaults = (patch: Record<string, any>) => {
    if (!theme) return;
    const components = { ...(theme.options?.components || {}) };
    components.MuiButton = {
      ...(components.MuiButton || {}),
      defaultProps: { ...(components.MuiButton?.defaultProps || {}), ...patch },
    };
    emit(updateThemeComponents(theme, components));
  };

  const patchInputVariant = (inputVariant: string) => {
    if (!theme) return;
    const components = { ...(theme.options?.components || {}) };
    components.MuiTextField = {
      ...(components.MuiTextField || {}),
      defaultProps: { ...(components.MuiTextField?.defaultProps || {}), variant: inputVariant },
    };
    components.MuiSelect = {
      ...(components.MuiSelect || {}),
      defaultProps: { ...(components.MuiSelect?.defaultProps || {}), variant: inputVariant },
    };
    components.MuiFormControl = {
      ...(components.MuiFormControl || {}),
      defaultProps: { ...(components.MuiFormControl?.defaultProps || {}), variant: inputVariant },
    };
    emit(updateThemeComponents(theme, components));
  };

  const handleRawJsonChange = (value: string) => {
    setRawJsonOptions(value);
    try {
      const parsed = JSON.parse(value);
      emit({ ...(theme as IThemeRecord), options: parsed });
      setJsonError(null);
    } catch (err: any) {
      setJsonError(`JSON Syntax Error: ${err.message}`);
    }
  };

  const addAsset = () => {
    if (!theme) return;
    const assets = theme.assets ? [...theme.assets] : [];
    assets.push({
      id: `asset-${assets.length + 1}`,
      name: 'new-asset.png',
      assetType: 'image',
      url: `themes/${theme.name}/images/new-asset.png`,
    });
    emit({ ...theme, assets });
  };

  const updateAsset = (idx: number, patch: Record<string, any>) => {
    if (!theme) return;
    const assets = [...(theme.assets || [])];
    assets[idx] = { ...assets[idx], ...patch };
    emit({ ...theme, assets });
  };

  const removeAsset = (idx: number) => {
    if (!theme) return;
    const assets = (theme.assets || []).filter((_: any, aIdx: number) => aIdx !== idx);
    emit({ ...theme, assets });
  };

  const fieldProps = isReadOnly ? { disabled: true as const } : {};

  const heading = title || (theme?.name ? `Edit Theme: ${theme.name}` : 'New Application Theme');

  const header = (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PaletteIcon color="primary" />
        <Typography variant="h6">{heading}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button onClick={onCancel} color="inherit">
          {isReadOnly ? 'Close' : 'Cancel'}
        </Button>
        {!isReadOnly && onSave && (
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : saveLabel}
          </Button>
        )}
      </Box>
    </Box>
  );

  const tabs = (
    <Tabs
      value={editorTab}
      onChange={(_, v) => setEditorTab(v)}
      variant="scrollable"
      scrollButtons="auto"
      sx={{ borderBottom: 1, borderColor: 'divider', px: 2, bgcolor: 'background.default' }}
    >
      <Tab icon={<TuneIcon />} iconPosition="start" label="General" />
      <Tab icon={<FormatPaintIcon />} iconPosition="start" label="MUI Palettes" />
      <Tab icon={<TypographyIcon />} iconPosition="start" label="Typography & Shape" />
      <Tab icon={<WidgetsIcon />} iconPosition="start" label="Component Overrides" />
      <Tab icon={<ImageIcon />} iconPosition="start" label="Assets" />
      <Tab icon={<CodeIcon />} iconPosition="start" label="Raw ThemeOptions (JSON)" />
      <Tab icon={<PreviewIcon />} iconPosition="start" label="Live Preview" />
    </Tabs>
  );

  const content = theme ? (
    <>
      {formError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFormError(null)}>
          {formError}
        </Alert>
      )}

      {/* TAB 0: GENERAL & BRANDING */}
      {editorTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              {...fieldProps}
              fullWidth
              label="Theme Name (Key / Slug)"
              required
              value={theme.name || ''}
              onChange={(e) =>
                emit({ ...theme, name: e.target.value.toLowerCase().replace(/\s+/g, '-') })
              }
              helperText="Unique lowercase identifier e.g. 'reactory', 'dark-ocean'"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              {...fieldProps}
              fullWidth
              label="Namespace"
              value={theme.nameSpace || 'reactory'}
              onChange={(e) => emit({ ...theme, nameSpace: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              {...fieldProps}
              fullWidth
              label="Version"
              value={theme.version || '1.0.0'}
              onChange={(e) => emit({ ...theme, version: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>Default Mode</InputLabel>
              <Select
                {...fieldProps}
                value={theme.defaultThemeMode || 'dark'}
                label="Default Mode"
                onChange={(e) => emit({ ...theme, defaultThemeMode: e.target.value })}
              >
                <MenuItem value="dark">Dark Mode</MenuItem>
                <MenuItem value="light">Light Mode</MenuItem>
                <MenuItem value="os">OS Preference</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>Theme Engine Type</InputLabel>
              <Select
                {...fieldProps}
                value={theme.type || 'material'}
                label="Theme Engine Type"
                onChange={(e) => emit({ ...theme, type: e.target.value })}
              >
                <MenuItem value="material">Material UI (Web)</MenuItem>
                <MenuItem value="material_native">Material Native (Mobile / Universal)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              {...fieldProps}
              fullWidth
              multiline
              rows={2}
              label="Description"
              value={theme.description || ''}
              onChange={(e) => emit({ ...theme, description: e.target.value })}
            />
          </Grid>

          <Grid item xs={12}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1 }}>
              Branding & Content
            </Typography>
            <Divider sx={{ mb: 2 }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              {...fieldProps}
              fullWidth
              label="Application Title"
              value={theme.content?.appTitle || ''}
              onChange={(e) =>
                emit({
                  ...theme,
                  content: { ...(theme.content || {}), appTitle: e.target.value },
                })
              }
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              {...fieldProps}
              fullWidth
              label="Login Welcome Message"
              value={theme.content?.login?.message || ''}
              onChange={(e) =>
                emit({
                  ...theme,
                  content: {
                    ...(theme.content || {}),
                    login: { ...(theme.content?.login || {}), message: e.target.value },
                  },
                })
              }
            />
          </Grid>
        </Grid>
      )}

      {/* TAB 1: MUI PALETTES */}
      {editorTab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant={activeModeTab === 'dark' ? 'contained' : 'outlined'}
                startIcon={<DarkModeIcon />}
                onClick={() => setActiveModeTab('dark')}
              >
                Dark Mode Palette
              </Button>
              <Button
                variant={activeModeTab === 'light' ? 'contained' : 'outlined'}
                startIcon={<LightModeIcon />}
                onClick={() => setActiveModeTab('light')}
              >
                Light Mode Palette
              </Button>
            </Box>
            <Chip
              label={`Editing ${activeModeTab.toUpperCase()} Palette`}
              color={activeModeTab === 'dark' ? 'default' : 'primary'}
            />
          </Box>

          <Grid container spacing={3}>
            {/* Primary Palette */}
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, color: 'primary.main' }}>
                  Primary Color
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Main"
                      value={currentEditingPalette?.primary?.main || ''}
                      onChange={(e) => handlePaletteChange('primary', 'main', e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <input
                              type="color"
                              value={currentEditingPalette?.primary?.main || '#f95e20'}
                              onChange={(e) => handlePaletteChange('primary', 'main', e.target.value)}
                              style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Light"
                      value={currentEditingPalette?.primary?.light || ''}
                      onChange={(e) => handlePaletteChange('primary', 'light', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Dark"
                      value={currentEditingPalette?.primary?.dark || ''}
                      onChange={(e) => handlePaletteChange('primary', 'dark', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Contrast Text"
                      value={currentEditingPalette?.primary?.contrastText || '#ffffff'}
                      onChange={(e) => handlePaletteChange('primary', 'contrastText', e.target.value)}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Secondary Palette */}
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, color: 'secondary.main' }}>
                  Secondary Color
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Main"
                      value={currentEditingPalette?.secondary?.main || ''}
                      onChange={(e) => handlePaletteChange('secondary', 'main', e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <input
                              type="color"
                              value={currentEditingPalette?.secondary?.main || '#700000'}
                              onChange={(e) => handlePaletteChange('secondary', 'main', e.target.value)}
                              style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Light"
                      value={currentEditingPalette?.secondary?.light || ''}
                      onChange={(e) => handlePaletteChange('secondary', 'light', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Dark"
                      value={currentEditingPalette?.secondary?.dark || ''}
                      onChange={(e) => handlePaletteChange('secondary', 'dark', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Contrast Text"
                      value={currentEditingPalette?.secondary?.contrastText || '#ffffff'}
                      onChange={(e) => handlePaletteChange('secondary', 'contrastText', e.target.value)}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Background Palette */}
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Surfaces & Background
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Default Background"
                      value={currentEditingPalette?.background?.default || ''}
                      onChange={(e) => handlePaletteChange('background', 'default', e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <input
                              type="color"
                              value={
                                currentEditingPalette?.background?.default ||
                                (activeModeTab === 'dark' ? '#121212' : '#f5f5f5')
                              }
                              onChange={(e) =>
                                handlePaletteChange('background', 'default', e.target.value)
                              }
                              style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Paper Surface"
                      value={currentEditingPalette?.background?.paper || ''}
                      onChange={(e) => handlePaletteChange('background', 'paper', e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <input
                              type="color"
                              value={
                                currentEditingPalette?.background?.paper ||
                                (activeModeTab === 'dark' ? '#1e1e1e' : '#ffffff')
                              }
                              onChange={(e) =>
                                handlePaletteChange('background', 'paper', e.target.value)
                              }
                              style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* Text Palette */}
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Text Colors
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Primary Text"
                      value={currentEditingPalette?.text?.primary || ''}
                      onChange={(e) => handlePaletteChange('text', 'primary', e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <input
                              type="color"
                              value={
                                currentEditingPalette?.text?.primary ||
                                (activeModeTab === 'dark' ? '#ffffff' : '#111111')
                              }
                              onChange={(e) => handlePaletteChange('text', 'primary', e.target.value)}
                              style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      {...fieldProps}
                      fullWidth
                      size="small"
                      label="Secondary Text"
                      value={currentEditingPalette?.text?.secondary || ''}
                      onChange={(e) => handlePaletteChange('text', 'secondary', e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <input
                              type="color"
                              value={currentEditingPalette?.text?.secondary || '#888888'}
                              onChange={(e) => handlePaletteChange('text', 'secondary', e.target.value)}
                              style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* TAB 2: TYPOGRAPHY, SPACING & SHAPE */}
      {editorTab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Font Family Presets</InputLabel>
              <Select
                {...fieldProps}
                value={theme.options?.typography?.fontFamily || '"Segoe UI", Roboto, sans-serif'}
                label="Font Family Presets"
                onChange={(e) => handleTypographyChange({ fontFamily: e.target.value })}
              >
                <MenuItem value='"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'>Segoe UI / Modern</MenuItem>
                <MenuItem value='"Roboto", "Helvetica", "Arial", sans-serif'>Roboto (Material Default)</MenuItem>
                <MenuItem value='"Inter", -apple-system, BlinkMacSystemFont, sans-serif'>Inter (Clean SaaS)</MenuItem>
                <MenuItem value='"Open Sans", sans-serif'>Open Sans</MenuItem>
                <MenuItem value='system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'>Native System UI</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              {...fieldProps}
              fullWidth
              label="Custom Font Family String"
              value={theme.options?.typography?.fontFamily || ''}
              onChange={(e) => handleTypographyChange({ fontFamily: e.target.value })}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Base Font Size: {theme.options?.typography?.fontSize || 14}px
              </Typography>
              <Slider
                {...fieldProps}
                value={theme.options?.typography?.fontSize || 14}
                min={12}
                max={18}
                step={1}
                marks
                onChange={(_, v) => handleTypographyChange({ fontSize: Number(v) })}
              />
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Border Radius: {theme.options?.shape?.borderRadius ?? 4}px
              </Typography>
              <Slider
                {...fieldProps}
                value={theme.options?.shape?.borderRadius ?? 4}
                min={0}
                max={24}
                step={2}
                marks
                onChange={(_, v) => handleShapeChange(Number(v))}
              />
              <Box
                sx={{
                  width: '100%',
                  height: 36,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: `${theme.options?.shape?.borderRadius ?? 4}px`,
                  mt: 1,
                }}
              >
                <Typography variant="caption">Corner Radius Sample</Typography>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Spacing Unit Factor: {theme.options?.spacing || 8}px
              </Typography>
              <Slider
                {...fieldProps}
                value={theme.options?.spacing || 8}
                min={4}
                max={16}
                step={1}
                marks
                onChange={(_, v) => handleSpacingChange(Number(v))}
              />
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* TAB 3: COMPONENT OVERRIDES */}
      {editorTab === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                MuiButton Defaults
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Default Variant</InputLabel>
                <Select
                  {...fieldProps}
                  value={theme.options?.components?.MuiButton?.defaultProps?.variant || 'contained'}
                  label="Default Variant"
                  onChange={(e) => patchButtonDefaults({ variant: e.target.value })}
                >
                  <MenuItem value="contained">Contained (Solid Fill)</MenuItem>
                  <MenuItem value="outlined">Outlined (Border Only)</MenuItem>
                  <MenuItem value="text">Text (Subtle)</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Default Size</InputLabel>
                <Select
                  {...fieldProps}
                  value={theme.options?.components?.MuiButton?.defaultProps?.size || 'medium'}
                  label="Default Size"
                  onChange={(e) => patchButtonDefaults({ size: e.target.value })}
                >
                  <MenuItem value="small">Small</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="large">Large</MenuItem>
                </Select>
              </FormControl>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                MuiTextField & Select Inputs
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Input Variant</InputLabel>
                <Select
                  {...fieldProps}
                  value={theme.options?.components?.MuiTextField?.defaultProps?.variant || 'outlined'}
                  label="Input Variant"
                  onChange={(e) => patchInputVariant(e.target.value)}
                >
                  <MenuItem value="outlined">Outlined</MenuItem>
                  <MenuItem value="filled">Filled</MenuItem>
                  <MenuItem value="standard">Standard (Underline)</MenuItem>
                </Select>
              </FormControl>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* TAB 4: ASSETS & BRANDING */}
      {editorTab === 4 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Theme Media & Static Assets
            </Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={addAsset} disabled={isReadOnly}>
              Add Asset
            </Button>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Asset Key</TableCell>
                  <TableCell>File / URL</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(theme.assets || []).map((asset: any, idx: number) => (
                  <TableRow key={asset.id || idx}>
                    <TableCell sx={{ width: '25%' }}>
                      <TextField
                        {...fieldProps}
                        size="small"
                        fullWidth
                        value={asset.id || ''}
                        onChange={(e) =>
                          updateAsset(idx, { id: e.target.value, name: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell sx={{ width: '45%' }}>
                      <TextField
                        {...fieldProps}
                        size="small"
                        fullWidth
                        value={asset.url || ''}
                        onChange={(e) => updateAsset(idx, { url: e.target.value })}
                      />
                    </TableCell>
                    <TableCell sx={{ width: '20%' }}>
                      <Select
                        {...fieldProps}
                        size="small"
                        fullWidth
                        value={asset.assetType || 'image'}
                        onChange={(e) => updateAsset(idx, { assetType: e.target.value })}
                      >
                        <MenuItem value="image">Image</MenuItem>
                        <MenuItem value="css">CSS</MenuItem>
                        <MenuItem value="script">Script</MenuItem>
                        <MenuItem value="json">JSON</MenuItem>
                        <MenuItem value="resource">Resource</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell sx={{ width: '10%' }}>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={isReadOnly}
                        onClick={() => removeAsset(idx)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* TAB 5: RAW JSON THEMEOPTIONS */}
      {editorTab === 5 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Edit the raw MUI <code>ThemeOptions</code> object directly. Supports custom variables, transitions, zIndex, and breakpoints.
          </Typography>
          {jsonError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {jsonError}
            </Alert>
          )}
          <TextField
            fullWidth
            multiline
            rows={16}
            value={rawJsonOptions}
            disabled={isReadOnly}
            onChange={(e) => handleRawJsonChange(e.target.value)}
            InputProps={{
              sx: {
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                bgcolor: 'background.default',
              },
            }}
          />
        </Box>
      )}

      {/* TAB 6: LIVE PREVIEW */}
      {editorTab === 6 && (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Live MUI Component & Palette Preview
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: `${theme.options?.shape?.borderRadius ?? 4}px`,
              bgcolor: currentEditingPalette?.background?.paper || '#1e1e1e',
              color: currentEditingPalette?.text?.primary || '#ffffff',
              borderColor: 'divider',
            }}
          >
            <Typography variant="h5" sx={{ mb: 1, color: currentEditingPalette?.primary?.main }}>
              {theme.content?.appTitle || 'App Title Preview'}
            </Typography>
            <Typography variant="body1" sx={{ mb: 3, color: currentEditingPalette?.text?.secondary }}>
              {theme.content?.login?.message || 'Login branding preview statement.'}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Buttons:
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
              <Button
                variant="contained"
                sx={{
                  bgcolor: currentEditingPalette?.primary?.main,
                  color: currentEditingPalette?.primary?.contrastText,
                  '&:hover': { bgcolor: currentEditingPalette?.primary?.dark },
                  borderRadius: `${theme.options?.shape?.borderRadius ?? 4}px`,
                }}
              >
                Primary Contained
              </Button>
              <Button
                variant="outlined"
                sx={{
                  color: currentEditingPalette?.primary?.main,
                  borderColor: currentEditingPalette?.primary?.main,
                  borderRadius: `${theme.options?.shape?.borderRadius ?? 4}px`,
                }}
              >
                Primary Outlined
              </Button>
              <Button
                variant="contained"
                sx={{
                  bgcolor: currentEditingPalette?.secondary?.main,
                  color: currentEditingPalette?.secondary?.contrastText,
                  '&:hover': { bgcolor: currentEditingPalette?.secondary?.dark },
                  borderRadius: `${theme.options?.shape?.borderRadius ?? 4}px`,
                }}
              >
                Secondary Contained
              </Button>
              <Button
                variant="outlined"
                sx={{
                  color: currentEditingPalette?.secondary?.main,
                  borderColor: currentEditingPalette?.secondary?.main,
                  borderRadius: `${theme.options?.shape?.borderRadius ?? 4}px`,
                }}
              >
                Secondary Outlined
              </Button>
            </Box>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Form Controls & Inputs:
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Text Input Preview" defaultValue="Sample text value" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Select Option</InputLabel>
                  <Select defaultValue="1" label="Select Option">
                    <MenuItem value="1">Option One</MenuItem>
                    <MenuItem value="2">Option Two</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Switches, Checkboxes & Chips:
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControlLabel control={<Switch defaultChecked />} label="Active Feature" />
              <FormControlLabel control={<Checkbox defaultChecked />} label="Checkbox" />
              <Chip
                label="Primary Badge"
                sx={{
                  bgcolor: currentEditingPalette?.primary?.main,
                  color: currentEditingPalette?.primary?.contrastText,
                }}
              />
              <Chip
                label="Secondary Badge"
                sx={{
                  bgcolor: currentEditingPalette?.secondary?.main,
                  color: currentEditingPalette?.secondary?.contrastText,
                }}
              />
            </Box>
          </Paper>
        </Box>
      )}
    </>
  ) : null;

  if (variant === 'inline') {
    return (
      <Paper variant="outlined">
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5 }}>{header}</Box>
        <Divider />
        {tabs}
        <Box sx={{ p: 3 }}>{content}</Box>
      </Paper>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth={maxWidth}
      fullWidth
      PaperProps={{ sx: { minHeight: 650 } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {header}
      </DialogTitle>
      <Divider />
      {tabs}
      <DialogContent sx={{ p: 3 }}>{content}</DialogContent>
    </Dialog>
  );
};

export default ThemeEditor;
