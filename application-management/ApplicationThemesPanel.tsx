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
  Switch,
  FormControlLabel,
  Paper,
  Grid,
  CircularProgress,
  Tooltip,
  InputAdornment,
  Tabs,
  Tab,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
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
  Tune as TuneIcon,
  FontDownload as TypographyIcon,
  Widgets as WidgetsIcon,
  Image as ImageIcon,
  Preview as PreviewIcon,
  Publish as PublishIcon,
  AutoAwesome as AutoAwesomeIcon,
  FormatPaint as FormatPaintIcon,
} from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';
import { omitDeep } from '@reactory/client-core/components/util';

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

const DEFAULT_DARK_PALETTE = {
  mode: 'dark',
  primary: {
    main: '#f95e20',
    light: '#ff8f52',
    dark: '#be2b00',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#700000',
    light: '#a5392a',
    dark: '#430000',
    contrastText: '#ffffff',
  },
  background: {
    paper: '#1e1e1e',
    default: '#121212',
  },
  text: {
    primary: '#ffffff',
    secondary: '#b0b0b0',
  },
};

const DEFAULT_LIGHT_PALETTE = {
  mode: 'light',
  primary: {
    main: '#ff8d00',
    light: '#ffbe44',
    dark: '#c55e00',
    contrastText: '#000000',
  },
  secondary: {
    main: '#700000',
    light: '#a5392a',
    dark: '#430000',
    contrastText: '#ffffff',
  },
  background: {
    paper: '#ffffff',
    default: '#f5f5f5',
  },
  text: {
    primary: '#1c1c1c',
    secondary: '#666666',
  },
};

const DEFAULT_COMPONENT_OVERRIDES = {
  MuiButton: {
    defaultProps: {
      variant: 'contained',
    },
  },
  MuiTextField: {
    defaultProps: {
      variant: 'outlined',
    },
  },
  MuiSelect: {
    defaultProps: {
      variant: 'outlined',
    },
  },
  MuiPaper: {
    defaultProps: {
      elevation: 1,
    },
  },
};

const DEFAULT_CSS_TEMPLATE = `/* =========================================================
 * Reactory Custom Theme Stylesheet
 * Auto-published to /cdn/themes/[theme-name]/styles.css
 * ========================================================= */

/* Loading Screen Animation */
.loading {
  background: linear-gradient(270deg, #1e1e1e, #2d2d2d);
  background-size: 400% 400%;
  animation: ReactoryGradient 6s ease infinite;
  color: #f95e20;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  min-height: 100%;
  height: 100%;
  min-width: 100%;
  width: 100%;
  font-family: inherit;
}

@keyframes ReactoryGradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Custom Scrollbars */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
}

::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.4);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.6);
}
`;

const createDefaultTheme = (name = 'custom-theme'): any => ({
  nameSpace: 'reactory',
  name,
  version: '1.0.0',
  type: 'material',
  defaultThemeMode: 'dark',
  description: 'A customized Reactory application theme',
  content: {
    appTitle: 'My Reactory App',
    login: {
      message: 'Welcome to Reactory',
    },
  },
  options: {
    typography: {
      fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      fontSize: 14,
    },
    shape: {
      borderRadius: 4,
    },
    spacing: 8,
    components: { ...DEFAULT_COMPONENT_OVERRIDES },
  },
  modes: [
    {
      id: 'dark',
      mode: 'dark',
      name: 'Dark Mode',
      description: 'Default dark theme mode',
      icon: 'night',
      options: {
        palette: { ...DEFAULT_DARK_PALETTE },
        components: { ...DEFAULT_COMPONENT_OVERRIDES },
      },
    },
    {
      id: 'light',
      mode: 'light',
      name: 'Light Mode',
      description: 'Default light theme mode',
      icon: 'day',
      options: {
        palette: { ...DEFAULT_LIGHT_PALETTE },
        components: { ...DEFAULT_COMPONENT_OVERRIDES },
      },
    },
  ],
  assets: [
    { id: 'logo', name: 'logo.png', assetType: 'image', url: `themes/${name}/images/logo.png` },
    { id: 'avatar', name: 'avatar.png', assetType: 'image', url: `themes/${name}/images/avatar.png` },
    { id: 'favicon', name: 'favicon.ico', assetType: 'image', url: `themes/${name}/images/favicon.ico` },
    { id: 'styles', name: 'styles.css', assetType: 'css', url: `themes/${name}/styles.css` },
  ],
});

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

  // Editor Dialog State
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingTheme, setEditingTheme] = useState<any | null>(null);
  const [editorTab, setEditorTab] = useState<number>(0);
  const [activeModeTab, setActiveModeTab] = useState<'dark' | 'light'>('dark');
  const [rawJsonOptions, setRawJsonOptions] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);

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
    const newTheme = createDefaultTheme(`theme-${themes.length + 1}`);
    setEditingTheme(newTheme);
    setRawJsonOptions(JSON.stringify(newTheme.options || {}, null, 2));
    setJsonError(null);
    setEditorTab(0);
    setActiveModeTab('dark');
    setEditorOpen(true);
  };

  // Open Edit Theme
  const handleOpenEdit = (theme: any) => {
    const cloned = JSON.parse(JSON.stringify(theme));
    const rootOptions = cloned.options || {};
    const rootPalette = rootOptions.palette || {};
    const mergedComponents = rootOptions.components 
      || cloned.modes?.[0]?.options?.components 
      || DEFAULT_COMPONENT_OVERRIDES;

    const existingDarkMode = (cloned.modes || []).find((m: any) => m.mode === 'dark');
    const existingLightMode = (cloned.modes || []).find((m: any) => m.mode === 'light');

    const darkPalSrc = existingDarkMode?.options?.palette 
      || (rootPalette.mode === 'dark' || !rootPalette.mode ? rootPalette : null)
      || {};

    const lightPalSrc = existingLightMode?.options?.palette 
      || (rootPalette.mode === 'light' ? rootPalette : null)
      || {};

    const darkPalette = {
      mode: 'dark',
      ...darkPalSrc,
      primary: {
        ...DEFAULT_DARK_PALETTE.primary,
        ...(darkPalSrc.primary || {}),
      },
      secondary: {
        ...DEFAULT_DARK_PALETTE.secondary,
        ...(darkPalSrc.secondary || {}),
      },
      background: {
        ...DEFAULT_DARK_PALETTE.background,
        ...(darkPalSrc.background || {}),
      },
      text: {
        ...DEFAULT_DARK_PALETTE.text,
        ...(darkPalSrc.text || {}),
      },
    };

    const lightPalette = {
      mode: 'light',
      ...lightPalSrc,
      primary: {
        ...DEFAULT_LIGHT_PALETTE.primary,
        ...(lightPalSrc.primary || {}),
      },
      secondary: {
        ...DEFAULT_LIGHT_PALETTE.secondary,
        ...(lightPalSrc.secondary || {}),
      },
      background: {
        ...DEFAULT_LIGHT_PALETTE.background,
        ...(lightPalSrc.background || {}),
      },
      text: {
        ...DEFAULT_LIGHT_PALETTE.text,
        ...(lightPalSrc.text || {}),
      },
    };

    const modes = [
      {
        id: existingDarkMode?.id || 'dark',
        mode: 'dark',
        name: existingDarkMode?.name || 'Dark Mode',
        description: existingDarkMode?.description || 'Default dark theme mode',
        icon: existingDarkMode?.icon || 'night',
        options: {
          ...(existingDarkMode?.options || {}),
          palette: darkPalette,
          components: existingDarkMode?.options?.components || mergedComponents,
        },
      },
      {
        id: existingLightMode?.id || 'light',
        mode: 'light',
        name: existingLightMode?.name || 'Light Mode',
        description: existingLightMode?.description || 'Default light theme mode',
        icon: existingLightMode?.icon || 'day',
        options: {
          ...(existingLightMode?.options || {}),
          palette: lightPalette,
          components: existingLightMode?.options?.components || mergedComponents,
        },
      },
    ];

    const currentMode = cloned.defaultThemeMode === 'light' ? 'light' : 'dark';
    const activePalette = currentMode === 'dark' ? darkPalette : lightPalette;

    cloned.options = {
      ...rootOptions,
      palette: activePalette,
      components: mergedComponents,
    };
    cloned.modes = modes;

    setEditingTheme(cloned);
    setRawJsonOptions(JSON.stringify(cloned.options, null, 2));
    setJsonError(null);
    setEditorTab(0);
    setActiveModeTab(currentMode);
    setEditorOpen(true);
  };

  // Duplicate Theme
  const handleDuplicateTheme = (theme: any) => {
    const cloned = JSON.parse(JSON.stringify(theme));
    cloned.name = `${cloned.name}-copy`;
    cloned.description = `${cloned.description || ''} (Copy)`.trim();
    if (cloned.id) delete cloned.id;
    setEditingTheme(cloned);
    setRawJsonOptions(JSON.stringify(cloned.options || {}, null, 2));
    setJsonError(null);
    setEditorTab(0);
    setEditorOpen(true);
  };

  // Save Theme (Mutation)
  const handleSaveTheme = async () => {
    if (!editingTheme || !editingTheme.name) {
      showNotification('Theme name is required', 'error');
      return;
    }

    // Parse raw JSON if modified on JSON tab
    let finalOptions = editingTheme.options || {};
    try {
      if (rawJsonOptions.trim()) {
        finalOptions = JSON.parse(rawJsonOptions);
      }
    } catch (e: any) {
      setJsonError(`Invalid JSON in options: ${e.message}`);
      setEditorTab(5); // Go to JSON tab
      return;
    }

    const rawPayload = {
      ...editingTheme,
      options: finalOptions,
      modes: (editingTheme.modes || []).map((m: any) => ({
        id: m.id || m.mode,
        mode: m.mode,
        name: m.name || (m.mode === 'dark' ? 'Dark Mode' : 'Light Mode'),
        description: m.description || '',
        icon: m.icon || (m.mode === 'dark' ? 'night' : 'day'),
        options: {
          ...(m.options || {}),
          components: finalOptions.components || m.options?.components || DEFAULT_COMPONENT_OVERRIDES,
        },
      })),
      assets: (editingTheme.assets || []).map((a: any) => ({
        id: a.id || a.name,
        name: a.name || a.id,
        assetType: a.assetType || 'image',
        url: a.url || '',
        loader: a.loader || null,
        options: a.options || null,
        data: a.data || null,
      })),
    };

    const payload = omitDeep(rawPayload);

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

  // Palette color updater helper
  const updatePaletteField = (modeKey: 'dark' | 'light', category: string, field: string, val: string) => {
    if (!editingTheme) return;
    const modes = (editingTheme.modes || []).map((m: any) => {
      if (m.mode === modeKey) {
        const curPal = m.options?.palette || (modeKey === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE);
        const updatedCat = { ...(curPal[category] || {}), [field]: val };
        return {
          ...m,
          options: {
            ...(m.options || {}),
            palette: { ...curPal, [category]: updatedCat },
          },
        };
      }
      return m;
    });

    const activeModeObj = modes.find((m: any) => m.mode === (editingTheme.defaultThemeMode || 'dark')) || modes[0];
    const updatedOptions = {
      ...(editingTheme.options || {}),
      palette: activeModeObj?.options?.palette || editingTheme.options?.palette,
    };

    setEditingTheme({
      ...editingTheme,
      modes,
      options: updatedOptions,
    });
    setRawJsonOptions(JSON.stringify(updatedOptions, null, 2));
  };

  // Palette background / text updater helper
  const updateDirectPaletteField = (modeKey: 'dark' | 'light', category: 'background' | 'text', field: string, val: string) => {
    if (!editingTheme) return;
    const modes = (editingTheme.modes || []).map((m: any) => {
      if (m.mode === modeKey) {
        const curPal = m.options?.palette || (modeKey === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE);
        return {
          ...m,
          options: {
            ...(m.options || {}),
            palette: {
              ...curPal,
              [category]: {
                ...(curPal[category] || {}),
                [field]: val,
              },
            },
          },
        };
      }
      return m;
    });

    const activeModeObj = modes.find((m: any) => m.mode === (editingTheme.defaultThemeMode || 'dark')) || modes[0];
    const updatedOptions = {
      ...(editingTheme.options || {}),
      palette: activeModeObj?.options?.palette || editingTheme.options?.palette,
    };

    setEditingTheme({
      ...editingTheme,
      modes,
      options: updatedOptions,
    });
    setRawJsonOptions(JSON.stringify(updatedOptions, null, 2));
  };

  // Get active editing mode palette
  const currentEditingPalette = useMemo(() => {
    if (!editingTheme?.modes) return activeModeTab === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE;
    const m = editingTheme.modes.find((mode: any) => mode.mode === activeModeTab);
    return m?.options?.palette || (activeModeTab === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE);
  }, [editingTheme, activeModeTab]);

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
                const darkOpt = theme.modes?.find((m: any) => m.mode === 'dark')?.options?.palette || theme.options?.palette || DEFAULT_DARK_PALETTE;
                const primaryColor = darkOpt?.primary?.main || '#f95e20';
                const secondaryColor = darkOpt?.secondary?.main || '#700000';
                const bgColor = darkOpt?.background?.paper || '#2d2d2d';
                const textColor = darkOpt?.text?.primary || '#ffffff';

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
      {/* THEME EDITOR DIALOG                                                       */}
      {/* ========================================================================= */}
      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { minHeight: 650 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PaletteIcon color="primary" />
            <Typography variant="h6">
              {editingTheme?.name ? `Edit Theme: ${editingTheme.name}` : 'New Application Theme'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={() => setEditorOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSaveTheme} disabled={loading}>
              {loading ? <CircularProgress size={20} /> : 'Save Theme'}
            </Button>
          </Box>
        </DialogTitle>
        <Divider />

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

        <DialogContent sx={{ p: 3 }}>
          {editingTheme && (
            <>
              {/* TAB 0: GENERAL & BRANDING */}
              {editorTab === 0 && (
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Theme Name (Key / Slug)"
                      required
                      value={editingTheme.name || ''}
                      onChange={(e) => setEditingTheme({ ...editingTheme, name: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      helperText="Unique lowercase identifier e.g. 'reactory', 'dark-ocean'"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Namespace"
                      value={editingTheme.nameSpace || 'reactory'}
                      onChange={(e) => setEditingTheme({ ...editingTheme, nameSpace: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Version"
                      value={editingTheme.version || '1.0.0'}
                      onChange={(e) => setEditingTheme({ ...editingTheme, version: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth>
                      <InputLabel>Default Mode</InputLabel>
                      <Select
                        value={editingTheme.defaultThemeMode || 'dark'}
                        label="Default Mode"
                        onChange={(e) => setEditingTheme({ ...editingTheme, defaultThemeMode: e.target.value })}
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
                        value={editingTheme.type || 'material'}
                        label="Theme Engine Type"
                        onChange={(e) => setEditingTheme({ ...editingTheme, type: e.target.value })}
                      >
                        <MenuItem value="material">Material UI (Web)</MenuItem>
                        <MenuItem value="material_native">Material Native (Mobile / Universal)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      multiline
                      rows={2}
                      label="Description"
                      value={editingTheme.description || ''}
                      onChange={(e) => setEditingTheme({ ...editingTheme, description: e.target.value })}
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
                      fullWidth
                      label="Application Title"
                      value={editingTheme.content?.appTitle || ''}
                      onChange={(e) =>
                        setEditingTheme({
                          ...editingTheme,
                          content: { ...(editingTheme.content || {}), appTitle: e.target.value },
                        })
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Login Welcome Message"
                      value={editingTheme.content?.login?.message || ''}
                      onChange={(e) =>
                        setEditingTheme({
                          ...editingTheme,
                          content: {
                            ...(editingTheme.content || {}),
                            login: { ...(editingTheme.content?.login || {}), message: e.target.value },
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
                              fullWidth
                              size="small"
                              label="Main"
                              value={currentEditingPalette?.primary?.main || ''}
                              onChange={(e) => updatePaletteField(activeModeTab, 'primary', 'main', e.target.value)}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <input
                                      type="color"
                                      value={currentEditingPalette?.primary?.main || '#f95e20'}
                                      onChange={(e) => updatePaletteField(activeModeTab, 'primary', 'main', e.target.value)}
                                      style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                                    />
                                  </InputAdornment>
                                ),
                              }}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Light"
                              value={currentEditingPalette?.primary?.light || ''}
                              onChange={(e) => updatePaletteField(activeModeTab, 'primary', 'light', e.target.value)}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Dark"
                              value={currentEditingPalette?.primary?.dark || ''}
                              onChange={(e) => updatePaletteField(activeModeTab, 'primary', 'dark', e.target.value)}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Contrast Text"
                              value={currentEditingPalette?.primary?.contrastText || '#ffffff'}
                              onChange={(e) => updatePaletteField(activeModeTab, 'primary', 'contrastText', e.target.value)}
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
                              fullWidth
                              size="small"
                              label="Main"
                              value={currentEditingPalette?.secondary?.main || ''}
                              onChange={(e) => updatePaletteField(activeModeTab, 'secondary', 'main', e.target.value)}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <input
                                      type="color"
                                      value={currentEditingPalette?.secondary?.main || '#700000'}
                                      onChange={(e) => updatePaletteField(activeModeTab, 'secondary', 'main', e.target.value)}
                                      style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                                    />
                                  </InputAdornment>
                                ),
                              }}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Light"
                              value={currentEditingPalette?.secondary?.light || ''}
                              onChange={(e) => updatePaletteField(activeModeTab, 'secondary', 'light', e.target.value)}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Dark"
                              value={currentEditingPalette?.secondary?.dark || ''}
                              onChange={(e) => updatePaletteField(activeModeTab, 'secondary', 'dark', e.target.value)}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Contrast Text"
                              value={currentEditingPalette?.secondary?.contrastText || '#ffffff'}
                              onChange={(e) => updatePaletteField(activeModeTab, 'secondary', 'contrastText', e.target.value)}
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
                              fullWidth
                              size="small"
                              label="Default Background"
                              value={currentEditingPalette?.background?.default || ''}
                              onChange={(e) => updateDirectPaletteField(activeModeTab, 'background', 'default', e.target.value)}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <input
                                      type="color"
                                      value={currentEditingPalette?.background?.default || (activeModeTab === 'dark' ? '#121212' : '#f5f5f5')}
                                      onChange={(e) => updateDirectPaletteField(activeModeTab, 'background', 'default', e.target.value)}
                                      style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                                    />
                                  </InputAdornment>
                                ),
                              }}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Paper Surface"
                              value={currentEditingPalette?.background?.paper || ''}
                              onChange={(e) => updateDirectPaletteField(activeModeTab, 'background', 'paper', e.target.value)}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <input
                                      type="color"
                                      value={currentEditingPalette?.background?.paper || (activeModeTab === 'dark' ? '#1e1e1e' : '#ffffff')}
                                      onChange={(e) => updateDirectPaletteField(activeModeTab, 'background', 'paper', e.target.value)}
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
                              fullWidth
                              size="small"
                              label="Primary Text"
                              value={currentEditingPalette?.text?.primary || ''}
                              onChange={(e) => updateDirectPaletteField(activeModeTab, 'text', 'primary', e.target.value)}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <input
                                      type="color"
                                      value={currentEditingPalette?.text?.primary || (activeModeTab === 'dark' ? '#ffffff' : '#111111')}
                                      onChange={(e) => updateDirectPaletteField(activeModeTab, 'text', 'primary', e.target.value)}
                                      style={{ border: 'none', width: 24, height: 24, cursor: 'pointer', borderRadius: 4 }}
                                    />
                                  </InputAdornment>
                                ),
                              }}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Secondary Text"
                              value={currentEditingPalette?.text?.secondary || ''}
                              onChange={(e) => updateDirectPaletteField(activeModeTab, 'text', 'secondary', e.target.value)}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <input
                                      type="color"
                                      value={currentEditingPalette?.text?.secondary || '#888888'}
                                      onChange={(e) => updateDirectPaletteField(activeModeTab, 'text', 'secondary', e.target.value)}
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
                        value={editingTheme.options?.typography?.fontFamily || '"Segoe UI", Roboto, sans-serif'}
                        label="Font Family Presets"
                        onChange={(e) =>
                          setEditingTheme({
                            ...editingTheme,
                            options: {
                              ...(editingTheme.options || {}),
                              typography: {
                                ...(editingTheme.options?.typography || {}),
                                fontFamily: e.target.value,
                              },
                            },
                          })
                        }
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
                      fullWidth
                      label="Custom Font Family String"
                      value={editingTheme.options?.typography?.fontFamily || ''}
                      onChange={(e) =>
                        setEditingTheme({
                          ...editingTheme,
                          options: {
                            ...(editingTheme.options || {}),
                            typography: {
                              ...(editingTheme.options?.typography || {}),
                              fontFamily: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        Base Font Size: {editingTheme.options?.typography?.fontSize || 14}px
                      </Typography>
                      <Slider
                        value={editingTheme.options?.typography?.fontSize || 14}
                        min={12}
                        max={18}
                        step={1}
                        marks
                        onChange={(_, v) =>
                          setEditingTheme({
                            ...editingTheme,
                            options: {
                              ...(editingTheme.options || {}),
                              typography: {
                                ...(editingTheme.options?.typography || {}),
                                fontSize: Number(v),
                              },
                            },
                          })
                        }
                      />
                    </Paper>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        Border Radius: {editingTheme.options?.shape?.borderRadius ?? 4}px
                      </Typography>
                      <Slider
                        value={editingTheme.options?.shape?.borderRadius ?? 4}
                        min={0}
                        max={24}
                        step={2}
                        marks
                        onChange={(_, v) =>
                          setEditingTheme({
                            ...editingTheme,
                            options: {
                              ...(editingTheme.options || {}),
                              shape: {
                                ...(editingTheme.options?.shape || {}),
                                borderRadius: Number(v),
                              },
                            },
                          })
                        }
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
                          borderRadius: `${editingTheme.options?.shape?.borderRadius ?? 4}px`,
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
                        Spacing Unit Factor: {editingTheme.options?.spacing || 8}px
                      </Typography>
                      <Slider
                        value={editingTheme.options?.spacing || 8}
                        min={4}
                        max={16}
                        step={1}
                        marks
                        onChange={(_, v) =>
                          setEditingTheme({
                            ...editingTheme,
                            options: {
                              ...(editingTheme.options || {}),
                              spacing: Number(v),
                            },
                          })
                        }
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
                          value={editingTheme.options?.components?.MuiButton?.defaultProps?.variant || 'contained'}
                          label="Default Variant"
                          onChange={(e) => {
                            const comps = { ...(editingTheme.options?.components || {}) };
                            comps.MuiButton = {
                              ...(comps.MuiButton || {}),
                              defaultProps: { ...(comps.MuiButton?.defaultProps || {}), variant: e.target.value },
                            };
                            const updatedOptions = { ...(editingTheme.options || {}), components: comps };
                            const updatedModes = (editingTheme.modes || []).map((m: any) => ({
                              ...m,
                              options: { ...(m.options || {}), components: comps },
                            }));
                            setEditingTheme({
                              ...editingTheme,
                              options: updatedOptions,
                              modes: updatedModes,
                            });
                            setRawJsonOptions(JSON.stringify(updatedOptions, null, 2));
                          }}
                        >
                          <MenuItem value="contained">Contained (Solid Fill)</MenuItem>
                          <MenuItem value="outlined">Outlined (Border Only)</MenuItem>
                          <MenuItem value="text">Text (Subtle)</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl fullWidth size="small">
                        <InputLabel>Default Size</InputLabel>
                        <Select
                          value={editingTheme.options?.components?.MuiButton?.defaultProps?.size || 'medium'}
                          label="Default Size"
                          onChange={(e) => {
                            const comps = { ...(editingTheme.options?.components || {}) };
                            comps.MuiButton = {
                              ...(comps.MuiButton || {}),
                              defaultProps: { ...(comps.MuiButton?.defaultProps || {}), size: e.target.value },
                            };
                            const updatedOptions = { ...(editingTheme.options || {}), components: comps };
                            const updatedModes = (editingTheme.modes || []).map((m: any) => ({
                              ...m,
                              options: { ...(m.options || {}), components: comps },
                            }));
                            setEditingTheme({
                              ...editingTheme,
                              options: updatedOptions,
                              modes: updatedModes,
                            });
                            setRawJsonOptions(JSON.stringify(updatedOptions, null, 2));
                          }}
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
                          value={editingTheme.options?.components?.MuiTextField?.defaultProps?.variant || 'outlined'}
                          label="Input Variant"
                          onChange={(e) => {
                            const comps = { ...(editingTheme.options?.components || {}) };
                            comps.MuiTextField = {
                              ...(comps.MuiTextField || {}),
                              defaultProps: { ...(comps.MuiTextField?.defaultProps || {}), variant: e.target.value },
                            };
                            comps.MuiSelect = {
                              ...(comps.MuiSelect || {}),
                              defaultProps: { ...(comps.MuiSelect?.defaultProps || {}), variant: e.target.value },
                            };
                            comps.MuiFormControl = {
                              ...(comps.MuiFormControl || {}),
                              defaultProps: { ...(comps.MuiFormControl?.defaultProps || {}), variant: e.target.value },
                            };
                            const updatedOptions = { ...(editingTheme.options || {}), components: comps };
                            const updatedModes = (editingTheme.modes || []).map((m: any) => ({
                              ...m,
                              options: { ...(m.options || {}), components: comps },
                            }));
                            setEditingTheme({
                              ...editingTheme,
                              options: updatedOptions,
                              modes: updatedModes,
                            });
                            setRawJsonOptions(JSON.stringify(updatedOptions, null, 2));
                          }}
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
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => {
                        const assets = editingTheme.assets ? [...editingTheme.assets] : [];
                        assets.push({
                          id: `asset-${assets.length + 1}`,
                          name: 'new-asset.png',
                          assetType: 'image',
                          url: `themes/${editingTheme.name}/images/new-asset.png`,
                        });
                        setEditingTheme({ ...editingTheme, assets });
                      }}
                    >
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
                        {(editingTheme.assets || []).map((asset: any, idx: number) => (
                          <TableRow key={asset.id || idx}>
                            <TableCell sx={{ width: '25%' }}>
                              <TextField
                                size="small"
                                fullWidth
                                value={asset.id || ''}
                                onChange={(e) => {
                                  const assets = [...editingTheme.assets];
                                  assets[idx] = { ...assets[idx], id: e.target.value, name: e.target.value };
                                  setEditingTheme({ ...editingTheme, assets });
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ width: '45%' }}>
                              <TextField
                                size="small"
                                fullWidth
                                value={asset.url || ''}
                                onChange={(e) => {
                                  const assets = [...editingTheme.assets];
                                  assets[idx] = { ...assets[idx], url: e.target.value };
                                  setEditingTheme({ ...editingTheme, assets });
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ width: '20%' }}>
                              <Select
                                size="small"
                                fullWidth
                                value={asset.assetType || 'image'}
                                onChange={(e) => {
                                  const assets = [...editingTheme.assets];
                                  assets[idx] = { ...assets[idx], assetType: e.target.value };
                                  setEditingTheme({ ...editingTheme, assets });
                                }}
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
                                onClick={() => {
                                  const assets = editingTheme.assets.filter((_: any, aIdx: number) => aIdx !== idx);
                                  setEditingTheme({ ...editingTheme, assets });
                                }}
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
                    onChange={(e) => {
                      setRawJsonOptions(e.target.value);
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setEditingTheme({ ...editingTheme, options: parsed });
                        setJsonError(null);
                      } catch (err: any) {
                        setJsonError(`JSON Syntax Error: ${err.message}`);
                      }
                    }}
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
                      borderRadius: `${editingTheme.options?.shape?.borderRadius ?? 4}px`,
                      bgcolor: currentEditingPalette?.background?.paper || '#1e1e1e',
                      color: currentEditingPalette?.text?.primary || '#ffffff',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="h5" sx={{ mb: 1, color: currentEditingPalette?.primary?.main }}>
                      {editingTheme.content?.appTitle || 'App Title Preview'}
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 3, color: currentEditingPalette?.text?.secondary }}>
                      {editingTheme.content?.login?.message || 'Login branding preview statement.'}
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
                          borderRadius: `${editingTheme.options?.shape?.borderRadius ?? 4}px`,
                        }}
                      >
                        Primary Contained
                      </Button>
                      <Button
                        variant="outlined"
                        sx={{
                          color: currentEditingPalette?.primary?.main,
                          borderColor: currentEditingPalette?.primary?.main,
                          borderRadius: `${editingTheme.options?.shape?.borderRadius ?? 4}px`,
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
                          borderRadius: `${editingTheme.options?.shape?.borderRadius ?? 4}px`,
                        }}
                      >
                        Secondary Contained
                      </Button>
                      <Button
                        variant="outlined"
                        sx={{
                          color: currentEditingPalette?.secondary?.main,
                          borderColor: currentEditingPalette?.secondary?.main,
                          borderRadius: `${editingTheme.options?.shape?.borderRadius ?? 4}px`,
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
                        <TextField
                          fullWidth
                          size="small"
                          label="Text Input Preview"
                          defaultValue="Sample text value"
                        />
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
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* CSS STUDIO & PUBLISHER DIALOG                                             */}
      {/* ========================================================================= */}
      <Dialog
        open={cssStudioOpen}
        onClose={() => setCssStudioOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CodeIcon color="secondary" />
            <Typography variant="h6">CSS Studio: {cssThemeTarget}/styles.css</Typography>
          </Box>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<PublishIcon />}
            onClick={handlePublishCss}
            disabled={cssPublishing}
          >
            {cssPublishing ? <CircularProgress size={20} /> : 'Publish CSS to Theme Directory'}
          </Button>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Published directly to: <code>themes/{cssThemeTarget}/styles.css</code> (Served via CDN)
            </Typography>
            <Button
              size="small"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => setCssContent(DEFAULT_CSS_TEMPLATE)}
            >
              Insert Starter Snippet
            </Button>
          </Box>
          <TextField
            fullWidth
            multiline
            rows={18}
            value={cssContent}
            onChange={(e) => setCssContent(e.target.value)}
            InputProps={{
              sx: {
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                bgcolor: 'background.default',
              },
            }}
          />
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCssStudioOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

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

