/**
 * Shared theme editor contracts.
 *
 * The theme editor is deliberately transport agnostic: it never talks to
 * GraphQL. Callers own persistence and hand the component a `theme` object
 * plus change/save callbacks.
 */

export type ThemeModeKey = 'dark' | 'light';

/** Editor interaction mode. `view` is an alias for `readOnly`. */
export type ThemeEditorMode = 'view' | 'edit';

/**
 * Loose theme shape. Themes originate from GraphQL (`ApplicationTheme`) or
 * from `createDefaultTheme`, and the editor is intentionally permissive so it
 * can host both client and organization themes.
 */
export interface IThemeRecord {
  id?: string;
  nameSpace?: string;
  name?: string;
  version?: string;
  type?: string;
  defaultThemeMode?: string;
  description?: string;
  content?: {
    appTitle?: string;
    login?: { message?: string };
    [key: string]: any;
  };
  options?: {
    palette?: any;
    typography?: { fontFamily?: string; fontSize?: number; [key: string]: any };
    shape?: { borderRadius?: number; [key: string]: any };
    spacing?: number;
    components?: any;
    [key: string]: any;
  };
  modes?: Array<{
    id?: string;
    mode?: string;
    name?: string;
    description?: string;
    icon?: string;
    options?: { palette?: any; components?: any; [key: string]: any };
    [key: string]: any;
  }>;
  assets?: Array<{
    id?: string;
    name?: string;
    assetType?: string;
    url?: string;
    loader?: any;
    options?: any;
    data?: any;
  }>;
  [key: string]: any;
}

export interface ThemeEditorProps {
  /** Controlled theme being edited. */
  theme: IThemeRecord | null;
  /** Whether the editor is visible. Defaults to `true`. */
  open?: boolean;
  /** `edit` (default) or `view`. `view` is treated as `readOnly`. */
  mode?: ThemeEditorMode;
  /** Hard read-only override; hides Save and disables every input. */
  readOnly?: boolean;
  /** Disables the save action and shows a spinner while a caller mutation runs. */
  saving?: boolean;
  /** Controlled palette tab. Defaults to the theme's `defaultThemeMode`. */
  themeMode?: ThemeModeKey;
  /** Called with the next theme on every edit. */
  onChange?: (theme: IThemeRecord) => void;
  /**
   * Called with a sanitized, persistence-ready theme when the user saves.
   * The payload has `__typename` removed and its modes/assets normalised.
   */
  onSave?: (payload: IThemeRecord) => void | Promise<void>;
  /** Called when the user cancels / closes the editor. */
  onCancel?: () => void;
  /** Optional error sink (e.g. a notification service). Defaults to inline alert. */
  onError?: (message: string) => void;
  /** `dialog` (default) renders a modal; `inline` renders the editor in place. */
  variant?: 'dialog' | 'inline';
  /** Overrides the dialog/inline heading. */
  title?: string;
  /** Save button label. */
  saveLabel?: string;
  /** Dialog max width. Defaults to `lg`. */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface ThemeCssStudioProps {
  open: boolean;
  /** Theme whose `styles.css` is being edited. */
  themeName: string;
  /** Controlled CSS content. */
  content: string;
  onChange: (content: string) => void;
  /** Publish handler supplied by the caller (mutation lives there). */
  onPublish: () => void | Promise<void>;
  onClose: () => void;
  /** True while the caller's publish mutation is in flight. */
  publishing?: boolean;
  readOnly?: boolean;
}
