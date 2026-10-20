/**
 * Public surface of the shared theme editor.
 *
 * Consumers (application theme panel, organization branding tab, …) import
 * everything theme-related from here so the defaults, palette constants and
 * payload shaping cannot drift between hosts.
 */
export { default as ThemeEditor } from './ThemeEditor';
export { default as ThemeCssStudio } from './ThemeCssStudio';
export {
  DEFAULT_COMPONENT_OVERRIDES,
  DEFAULT_CSS_TEMPLATE,
  DEFAULT_DARK_PALETTE,
  DEFAULT_LIGHT_PALETTE,
  createDefaultTheme,
  getDefaultPalette,
} from './themeDefaults';
export {
  buildThemePayload,
  duplicateTheme,
  getModePalette,
  prepareThemeForEditing,
  updateThemeComponents,
  updateThemeOptionSection,
  updateThemePalette,
} from './themeModel';
export type { IThemeRecord, ThemeCssStudioProps, ThemeEditorMode, ThemeEditorProps, ThemeModeKey } from './types';
