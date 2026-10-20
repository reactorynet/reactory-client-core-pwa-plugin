/**
 * ApplicationThemesPanel — list + host for the shared `ThemeEditor`.
 *
 * This panel owns the application theme list, active-theme switching, delete
 * confirmation and the themes GraphQL mutations. All editing UI (palettes,
 * typography, assets, raw JSON, preview) and the CSS studio live in
 * `../theme-editor` so the organization branding tab can reuse them.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  Divider,
  Chip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
  Grid,
  CircularProgress,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import {
  Palette as PaletteIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Code as CodeIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FileCopy as FileCopyIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
} from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';
import {
  DEFAULT_CSS_TEMPLATE,
  DEFAULT_DARK_PALETTE,
  ThemeCssStudio,
  ThemeEditor,
  createDefaultTheme,
  duplicateTheme,
  getModePalette,
  prepareThemeForEditing,
} from '../theme-editor';

export interface ApplicationThemesPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: any;
  onChange?: (formData: any) => void;
  applicationId?: string;
  mode?: 'view' | 'edit';
  activeTheme?: string;
}

const THEME_MUTATIONS = {
  setActiveTheme: `mutation ReactoryClientSetActiveTheme($clientId: String!, $themeName: String!) {
    ReactoryClientSetActiveTheme(clientId: $clientId, themeName: $themeName) {
      id
      theme
      themes {
        id
        nameSpace
        name
        version
        type
        defaultThemeMode
        description
        options
        modes {
          id
          mode
          name
          description
          icon
          options
        }
        assets {
          id
          name
          assetType
          url
          loader
          options
          data
        }
        content
      }
    }
  }`,
  saveTheme: `mutation ReactoryClientSaveTheme($clientId: String!, $theme: ApplicationThemeInput!) {
    ReactoryClientSaveTheme(clientId: $clientId, theme: $theme) {
      id
      theme
      themes {
        id
        nameSpace
        name
        version
        type
        defaultThemeMode
        description
        options
        modes {
          id
          mode
          name
          description
          icon
          options
        }
        assets {
          id
          name
          assetType
          url
          loader
          options
          data
        }
        content
      }
    }
  }`,
  deleteTheme: `mutation ReactoryClientDeleteTheme($clientId: String!, $themeName: String!) {
    ReactoryClientDeleteTheme(clientId: $clientId, themeName: $themeName) {
      id
      theme
      themes {
        id
        nameSpace
        name
        version
        type
        defaultThemeMode
        description
        options
        modes {
          id
          mode
          name
          description
          icon
          options
        }
        assets {
          id
          name
          assetType
          url
          loader
          options
          data
        }
        content
      }
    }
  }`,
  publishThemeCss: `mutation ReactoryClientPublishThemeCss($clientId: String, $themeName: String!, $cssContent: String!) {
    ReactoryClientPublishThemeCss(clientId: $clientId, themeName: $themeName, cssContent: $cssContent)
  }`,
  getThemeCss: `query ReactoryClientGetThemeCss($themeName: String!) {
    ReactoryClientGetThemeCss(themeName: $themeName)
  }`,
  refetchClient: `query ReactoryClientWithId($id: String!) {
    ReactoryClientWithId(id: $id) {
      id
      theme
      themes {
        id
        nameSpace
        name
        version
        type
        defaultThemeMode
        description
        options
        modes {
          id
          mode
          name
          description
          icon
          options
        }
        assets {
          id
          name
          assetType
          url
          loader
          options
          data
        }
        content
      }
    }
  }`,
};

export const ApplicationThemesPanel: React.FC<ApplicationThemesPanelProps> = ({
  reactory: propReactory,
  formData,
  onChange,
  applicationId,
  mode = 'view',
  activeTheme: propActiveTheme,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const [themes, setThemes] = useState<any[]>(formData?.themes || []);
  const [activeTheme, setActiveTheme] = useState<string>(propActiveTheme || formData?.theme || 'reactory');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Editor Dialog State — the editor itself is controlled by ThemeEditor.
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingTheme, setEditingTheme] = useState<any | null>(null);

  // CSS Studio Dialog State
  const [cssStudioOpen, setCssStudioOpen] = useState<boolean>(false);
  const [cssThemeTarget, setCssThemeTarget] = useState<string>('');
  const [cssContent, setCssContent] = useState<string>('');
  const [cssPublishing, setCssPublishing] = useState<boolean>(false);

  // Delete Confirm Dialog State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [themeToDelete, setThemeToDelete] = useState<string | null>(null);

  // Sync with formData
  useEffect(() => {
    if (formData?.themes) {
      setThemes(formData.themes);
    }
    if (propActiveTheme) {
      setActiveTheme(propActiveTheme);
    } else if (formData?.theme) {
      setActiveTheme(formData.theme);
    }
  }, [formData, propActiveTheme]);

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setAlert({ message, type });
    if (reactory?.createNotification) {
      reactory.createNotification(message, { type, timeout: 3500 });
    }
    setTimeout(() => {
      setAlert(null);
    }, 4000);
  }, [reactory]);

  // Refresh themes from server
  const handleRefresh = useCallback(async () => {
    if (!applicationId || !reactory?.graphqlQuery) return;
    setLoading(true);
    try {
      const result: any = await reactory.graphqlQuery(THEME_MUTATIONS.refetchClient, { id: applicationId }, { fetchPolicy: 'network-only' });
      const client = result?.data?.ReactoryClientWithId;
      if (client) {
        if (client.themes) setThemes(client.themes);
        if (client.theme) setActiveTheme(client.theme);
        if (onChange) {
          onChange({
            ...formData,
            themes: client.themes,
            theme: client.theme,
          });
        }
        showNotification('Themes refreshed successfully');
      }
    } catch (err: any) {
      showNotification(`Failed to refresh themes: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [applicationId, reactory, formData, onChange, showNotification]);

  // Set Active Theme
  const handleSetActive = useCallback(async (themeName: string) => {
    if (!applicationId || !reactory?.graphqlMutation) {
      setActiveTheme(themeName);
      if (onChange) onChange({ ...formData, theme: themeName });
      showNotification(`Active theme set to "${themeName}" (local)`);
      return;
    }
    setLoading(true);
    try {
      const result: any = await reactory.graphqlMutation(THEME_MUTATIONS.setActiveTheme, {
        clientId: applicationId,
        themeName,
      });
      const client = result?.data?.ReactoryClientSetActiveTheme;
      if (client) {
        const newActiveTheme = client.theme || themeName;
        setActiveTheme(newActiveTheme);
        if (client.themes) setThemes(client.themes);
        if (onChange) {
          onChange({
            ...formData,
            theme: newActiveTheme,
            themes: client.themes || themes,
          });
        }
        // Trigger status refresh with the new theme to update the runtime
        if (typeof reactory?.status === 'function') {
          try {
            await reactory.status({ theme: newActiveTheme });
          } catch (statusErr) {
            console.warn('Failed to refresh status with new theme', statusErr);
          }
        }
        showNotification(`Theme "${themeName}" is now active!`);
      }
    } catch (err: any) {
      showNotification(`Failed to set active theme: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [applicationId, reactory, formData, themes, onChange, showNotification]);

  // Open Add Theme
  const handleOpenAdd = () => {
    setEditingTheme(createDefaultTheme(`theme-${themes.length + 1}`));
    setEditorOpen(true);
  };

  // Open Edit Theme — normalises legacy/single-mode themes into dark+light.
  const handleOpenEdit = (theme: any) => {
    setEditingTheme(prepareThemeForEditing(theme));
    setEditorOpen(true);
  };

  // Duplicate Theme
  const handleDuplicateTheme = (theme: any) => {
    setEditingTheme(duplicateTheme(theme));
    setEditorOpen(true);
  };

  // Save Theme (Mutation) — ThemeEditor supplies the sanitized payload.
  const handleSaveTheme = async (payload: any) => {
    if (!applicationId || !reactory?.graphqlMutation) {
      // Local update
      const existingIdx = themes.findIndex((t) => t.name === payload.name);
      let updatedThemes = [...themes];
      if (existingIdx >= 0) {
        updatedThemes[existingIdx] = payload;
      } else {
        updatedThemes.push(payload);
      }
      setThemes(updatedThemes);
      if (onChange) onChange({ ...formData, themes: updatedThemes });
      setEditorOpen(false);
      showNotification(`Theme "${payload.name}" saved locally`);
      return;
    }

    setLoading(true);
    try {
      const sanitizedThemeInput = {
        id: payload.id || undefined,
        nameSpace: payload.nameSpace || 'reactory',
        name: payload.name,
        version: payload.version || '1.0.0',
        type: payload.type || 'material',
        defaultThemeMode: payload.defaultThemeMode || 'dark',
        description: payload.description || '',
        options: payload.options || {},
        modes: (payload.modes || []).map((m: any) => ({
          id: m.id || m.mode,
          mode: m.mode,
          name: m.name || (m.mode === 'dark' ? 'Dark Mode' : 'Light Mode'),
          description: m.description || '',
          icon: m.icon || (m.mode === 'dark' ? 'night' : 'day'),
          options: m.options || {},
        })),
        assets: (payload.assets || []).map((a: any) => ({
          id: a.id || a.name,
          name: a.name || a.id,
          assetType: a.assetType || 'image',
          url: a.url || '',
          loader: a.loader || null,
          options: a.options || null,
          data: a.data || null,
        })),
        content: payload.content || {},
      };

      const result: any = await reactory.graphqlMutation(THEME_MUTATIONS.saveTheme, {
        clientId: applicationId,
        theme: sanitizedThemeInput,
      });
      const client = result?.data?.ReactoryClientSaveTheme;
      if (client) {
        if (client.themes) setThemes(client.themes);
        if (client.theme) setActiveTheme(client.theme);
        if (onChange) {
          onChange({
            ...formData,
            themes: client.themes || themes,
            theme: client.theme || activeTheme,
          });
        }
        // If the saved theme is currently active, refresh API status
        if ((payload.name === activeTheme || client.theme === payload.name) && typeof reactory?.status === 'function') {
          try {
            await reactory.status({ theme: client.theme || payload.name });
          } catch (statusErr) {
            console.warn('Failed to refresh status with updated theme', statusErr);
          }
        }
        setEditorOpen(false);
        showNotification(`Theme "${payload.name}" successfully saved!`);
      }
    } catch (err: any) {
      showNotification(`Failed to save theme: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Delete Theme
  const handleConfirmDelete = async () => {
    if (!themeToDelete) return;
    if (!applicationId || !reactory?.graphqlMutation) {
      const filtered = themes.filter((t) => t.name !== themeToDelete);
      setThemes(filtered);
      if (activeTheme === themeToDelete) {
        setActiveTheme(filtered[0]?.name || 'reactory');
      }
      if (onChange) onChange({ ...formData, themes: filtered });
      setDeleteConfirmOpen(false);
      setThemeToDelete(null);
      showNotification(`Theme "${themeToDelete}" deleted`);
      return;
    }

    setLoading(true);
    try {
      const result: any = await reactory.graphqlMutation(THEME_MUTATIONS.deleteTheme, {
        clientId: applicationId,
        themeName: themeToDelete,
      });
      const client = result?.data?.ReactoryClientDeleteTheme;
      if (client) {
        if (client.themes) setThemes(client.themes);
        if (client.theme) setActiveTheme(client.theme);
        if (onChange) {
          onChange({
            ...formData,
            themes: client.themes,
            theme: client.theme,
          });
        }
        if (typeof reactory?.status === 'function') {
          try {
            await reactory.status({ theme: client.theme });
          } catch (statusErr) {
            console.warn('Failed to refresh status after deleting theme', statusErr);
          }
        }
        showNotification(`Theme "${themeToDelete}" deleted successfully`);
      }
    } catch (err: any) {
      showNotification(`Failed to delete theme: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setDeleteConfirmOpen(false);
      setThemeToDelete(null);
    }
  };

  // Open CSS Studio
  const handleOpenCssStudio = async (themeName: string) => {
    setCssThemeTarget(themeName);
    setCssStudioOpen(true);
    setCssContent('/* Loading theme stylesheet... */');

    if (reactory?.graphqlQuery) {
      try {
        const result: any = await reactory.graphqlQuery(THEME_MUTATIONS.getThemeCss, { themeName }, { fetchPolicy: 'network-only' });
        const remoteCss = result?.data?.ReactoryClientGetThemeCss;
        if (remoteCss && remoteCss.trim().length > 0) {
          setCssContent(remoteCss);
        } else {
          setCssContent(DEFAULT_CSS_TEMPLATE);
        }
      } catch (err) {
        setCssContent(DEFAULT_CSS_TEMPLATE);
      }
    } else {
      setCssContent(DEFAULT_CSS_TEMPLATE);
    }
  };

  // Publish CSS to disk
  const handlePublishCss = async () => {
    if (!cssThemeTarget || !cssContent) return;
    setCssPublishing(true);
    try {
      if (reactory?.graphqlMutation) {
        await reactory.graphqlMutation(THEME_MUTATIONS.publishThemeCss, {
          clientId: applicationId,
          themeName: cssThemeTarget,
          cssContent,
        });
      }
      showNotification(`styles.css published to /cdn/themes/${cssThemeTarget}/styles.css`);
      setCssStudioOpen(false);
    } catch (err: any) {
      showNotification(`Failed to publish CSS: ${err.message}`, 'error');
    } finally {
      setCssPublishing(false);
    }
  };

  // Filtered themes for list
  const filteredThemes = useMemo(() => {
    if (!searchTerm.trim()) return themes;
    const lower = searchTerm.toLowerCase();
    return themes.filter(
      (t) =>
        t.name?.toLowerCase().includes(lower) ||
        t.description?.toLowerCase().includes(lower) ||
        t.nameSpace?.toLowerCase().includes(lower),
    );
  }, [themes, searchTerm]);

  return (
    <Box sx={{ p: 2 }}>
      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      <Card>
        <CardHeader
          avatar={<PaletteIcon color="primary" />}
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6">Application Themes</Typography>
              <Chip label={`${themes.length} configured`} size="small" variant="outlined" />
            </Box>
          }
          subheader={`Active Theme: ${activeTheme || 'Default'}`}
          action={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Search themes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: 220 }}
              />
              <Tooltip title="Refresh Themes">
                <IconButton onClick={handleRefresh} disabled={loading}>
                  {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                </IconButton>
              </Tooltip>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenAdd}
                size="small"
              >
                Add Theme
              </Button>
            </Box>
          }
        />
        <Divider />
        <CardContent>
          {filteredThemes.length > 0 ? (
            <Grid container spacing={2}>
              {filteredThemes.map((theme: any) => {
                const isActive = theme.name === activeTheme;
                const darkOpt = getModePalette(theme, 'dark');
                // Fall back to the canonical dark palette for partial themes —
                // never re-declare palette values here.
                const primaryColor = darkOpt?.primary?.main || DEFAULT_DARK_PALETTE.primary.main;
                const secondaryColor = darkOpt?.secondary?.main || DEFAULT_DARK_PALETTE.secondary.main;
                const bgColor = darkOpt?.background?.paper || DEFAULT_DARK_PALETTE.background.paper;
                const textColor = darkOpt?.text?.primary || DEFAULT_DARK_PALETTE.text.primary;

                return (
                  <Grid item xs={12} sm={6} md={4} key={theme.id || theme.name}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        height: '100%',
                        border: isActive ? 2 : 1,
                        borderColor: isActive ? 'primary.main' : 'divider',
                        borderRadius: 2,
                        transition: 'all 0.2s ease-in-out',
                        '&:hover': {
                          boxShadow: 3,
                          borderColor: 'primary.light',
                        },
                      }}
                    >
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {theme.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              v{theme.version || '1.0.0'} • {theme.nameSpace || 'reactory'}
                            </Typography>
                          </Box>
                          {isActive ? (
                            <Chip
                              icon={<CheckCircleIcon />}
                              label="Active"
                              color="primary"
                              size="small"
                              sx={{ fontWeight: 600 }}
                            />
                          ) : (
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleSetActive(theme.name)}
                            >
                              Set Active
                            </Button>
                          )}
                        </Box>

                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                          <Chip
                            label={theme.defaultThemeMode || 'dark'}
                            size="small"
                            icon={theme.defaultThemeMode === 'light' ? <LightModeIcon /> : <DarkModeIcon />}
                            variant="outlined"
                          />
                          <Chip label={theme.type || 'material'} size="small" variant="outlined" />
                          {theme.modes?.length > 0 && (
                            <Chip label={`${theme.modes.length} Modes`} size="small" variant="outlined" />
                          )}
                          {theme.assets?.length > 0 && (
                            <Chip label={`${theme.assets.length} Assets`} size="small" variant="outlined" />
                          )}
                        </Box>

                        {/* Palette Color Swatches */}
                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                            Palette Swatches:
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Tooltip title={`Primary: ${primaryColor}`}>
                              <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: primaryColor, border: 1, borderColor: 'divider' }} />
                            </Tooltip>
                            <Tooltip title={`Secondary: ${secondaryColor}`}>
                              <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: secondaryColor, border: 1, borderColor: 'divider' }} />
                            </Tooltip>
                            <Tooltip title={`Background Paper: ${bgColor}`}>
                              <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: bgColor, border: 1, borderColor: 'divider' }} />
                            </Tooltip>
                            <Tooltip title={`Text Primary: ${textColor}`}>
                              <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: textColor, border: 1, borderColor: 'divider' }} />
                            </Tooltip>
                          </Box>
                        </Box>

                        {theme.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 36 }}>
                            {theme.description}
                          </Typography>
                        )}
                      </Box>

                      {/* Action Toolbar */}
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1 }}>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Edit Theme">
                            <IconButton size="small" color="primary" onClick={() => handleOpenEdit(theme)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Publish CSS">
                            <IconButton size="small" color="secondary" onClick={() => handleOpenCssStudio(theme.name)}>
                              <CodeIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Duplicate Theme">
                            <IconButton size="small" onClick={() => handleDuplicateTheme(theme)}>
                              <FileCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Tooltip title={isActive ? 'Active theme cannot be deleted' : 'Delete Theme'}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={isActive || themes.length <= 1}
                              onClick={() => {
                                setThemeToDelete(theme.name);
                                setDeleteConfirmOpen(true);
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          ) : (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <PaletteIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="h6" color="text.secondary">
                No themes found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create a new theme to customize colors, typography, component styling, and CSS.
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
                Create Theme
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* THEME EDITOR (shared component)                                          */}
      {/* ========================================================================= */}
      {/* NOTE: `mode` is intentionally not forwarded. This panel has always
          rendered an editable dialog regardless of the `mode` prop, and that
          behaviour must not change; hosts that need read-only pass `readOnly`
          to ThemeEditor directly. */}
      <ThemeEditor
        open={editorOpen}
        theme={editingTheme}
        onChange={setEditingTheme}
        onSave={handleSaveTheme}
        onCancel={() => setEditorOpen(false)}
        onError={(message) => showNotification(message, 'error')}
        saving={loading}
      />

      {/* ========================================================================= */}
      {/* CSS STUDIO & PUBLISHER (shared component, mutations stay here)           */}
      {/* ========================================================================= */}
      <ThemeCssStudio
        open={cssStudioOpen}
        themeName={cssThemeTarget}
        content={cssContent}
        onChange={setCssContent}
        onPublish={handlePublishCss}
        onClose={() => setCssStudioOpen(false)}
        publishing={cssPublishing}
      />

      {/* ========================================================================= */}
      {/* DELETE CONFIRM DIALOG                                                     */}
      {/* ========================================================================= */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Theme</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the theme <strong>"{themeToDelete}"</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApplicationThemesPanel;
