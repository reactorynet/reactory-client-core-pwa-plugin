/**
 * Canonical theme defaults.
 *
 * These used to live inside `ApplicationThemesPanel`; they are the single
 * source of truth for the client theme editor and the organization branding
 * tab alike. Do not re-declare these palettes anywhere else.
 */
import type { ThemeModeKey } from './types';

export const DEFAULT_DARK_PALETTE = {
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

export const DEFAULT_LIGHT_PALETTE = {
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

export const DEFAULT_COMPONENT_OVERRIDES = {
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

export const DEFAULT_CSS_TEMPLATE = `/* =========================================================
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

/** Default palette for a mode. */
export const getDefaultPalette = (mode: ThemeModeKey = 'dark'): any =>
  mode === 'light' ? DEFAULT_LIGHT_PALETTE : DEFAULT_DARK_PALETTE;

/** Creates a new, fully populated theme record. */
export const createDefaultTheme = (name = 'custom-theme'): any => ({
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
