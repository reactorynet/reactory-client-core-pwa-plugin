/**
 * Pure theme transformations shared by every theme editor host.
 *
 * Nothing here performs I/O: the helpers take a theme record and return a new
 * one (or a sanitized payload), which keeps `ThemeEditor` controllable and
 * makes the logic unit-testable without rendering.
 */
import { omitDeep } from '@reactory/client-core/components/util';
import {
  DEFAULT_COMPONENT_OVERRIDES,
  DEFAULT_DARK_PALETTE,
  DEFAULT_LIGHT_PALETTE,
  getDefaultPalette,
} from './themeDefaults';
import type { IThemeRecord, ThemeModeKey } from './types';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value ?? {}));

/**
 * Normalises an arbitrarily shaped theme into the two-mode (dark/light) shape
 * the editor works with, filling every missing palette entry from the defaults.
 * Returns a deep clone — the caller's theme is never mutated.
 */
export const prepareThemeForEditing = (theme: IThemeRecord | null): IThemeRecord => {
  const cloned: IThemeRecord = clone(theme || {});
  const rootOptions = cloned.options || {};
  const rootPalette = rootOptions.palette || {};
  const mergedComponents =
    rootOptions.components ||
    cloned.modes?.[0]?.options?.components ||
    DEFAULT_COMPONENT_OVERRIDES;

  const existingDarkMode = (cloned.modes || []).find((m) => m.mode === 'dark');
  const existingLightMode = (cloned.modes || []).find((m) => m.mode === 'light');

  const darkPalSrc =
    existingDarkMode?.options?.palette ||
    (rootPalette.mode === 'dark' || !rootPalette.mode ? rootPalette : null) ||
    {};

  const lightPalSrc =
    existingLightMode?.options?.palette ||
    (rootPalette.mode === 'light' ? rootPalette : null) ||
    {};

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

  const currentMode: ThemeModeKey = cloned.defaultThemeMode === 'light' ? 'light' : 'dark';
  const activePalette = currentMode === 'dark' ? darkPalette : lightPalette;

  cloned.options = {
    ...rootOptions,
    palette: activePalette,
    components: mergedComponents,
  };
  cloned.modes = modes;

  return cloned;
};

/**
 * Clones a theme for duplication: suffixes the key and description and drops
 * the server identity so a save creates a new record.
 */
export const duplicateTheme = (theme: IThemeRecord): IThemeRecord => {
  const cloned: IThemeRecord = clone(theme || {});
  cloned.name = `${cloned.name}-copy`;
  cloned.description = `${cloned.description || ''} (Copy)`.trim();
  if (cloned.id) delete cloned.id;
  return cloned;
};

/**
 * Resolves the palette configured for a mode, falling back to the root
 * palette and then to the canonical default for that mode.
 */
export const getModePalette = (theme: IThemeRecord | null, mode: ThemeModeKey = 'dark'): any =>
  theme?.modes?.find((m) => m.mode === mode)?.options?.palette ||
  theme?.options?.palette ||
  getDefaultPalette(mode);

/**
 * Returns a new theme with `palette[category][field]` updated for `mode`, and
 * the root `options.palette` re-pointed at the active default mode's palette.
 * Used for both colour groups (primary/secondary) and direct groups
 * (background/text) — the nesting is identical.
 */
export const updateThemePalette = (
  theme: IThemeRecord,
  mode: ThemeModeKey,
  category: string,
  field: string,
  value: string,
): IThemeRecord => {
  const modes = (theme.modes || []).map((entry) => {
    if (entry.mode !== mode) return entry;
    const currentPalette = entry.options?.palette || getDefaultPalette(mode);
    return {
      ...entry,
      options: {
        ...(entry.options || {}),
        palette: {
          ...currentPalette,
          [category]: { ...(currentPalette[category] || {}), [field]: value },
        },
      },
    };
  });

  const activeMode =
    modes.find((entry) => entry.mode === (theme.defaultThemeMode || 'dark')) || modes[0];

  const options = {
    ...(theme.options || {}),
    palette: activeMode?.options?.palette || theme.options?.palette,
  };

  return { ...theme, modes, options };
};

/** Updates one option section (typography / shape) immutably. */
export const updateThemeOptionSection = (
  theme: IThemeRecord,
  section: 'typography' | 'shape',
  patch: Record<string, any>,
): IThemeRecord => ({
  ...theme,
  options: {
    ...(theme.options || {}),
    [section]: { ...((theme.options || {})[section] || {}), ...patch },
  },
});

/**
 * Replaces component overrides on the root options and mirrors them into every
 * mode, matching how the MUI theme is assembled at runtime.
 */
export const updateThemeComponents = (
  theme: IThemeRecord,
  components: Record<string, any>,
): IThemeRecord => ({
  ...theme,
  options: { ...(theme.options || {}), components },
  modes: (theme.modes || []).map((entry) => ({
    ...entry,
    options: { ...(entry.options || {}), components },
  })),
});

/**
 * Builds the payload handed to a caller's save mutation: normalised modes and
 * assets, no `__typename`, with the (possibly raw-JSON) options applied.
 */
export const buildThemePayload = (
  theme: IThemeRecord,
  optionsOverride?: Record<string, any>,
): IThemeRecord => {
  const finalOptions = optionsOverride || theme.options || {};

  const rawPayload = {
    ...theme,
    options: finalOptions,
    modes: (theme.modes || []).map((m: any) => ({
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
    assets: (theme.assets || []).map((a: any) => ({
      id: a.id || a.name,
      name: a.name || a.id,
      assetType: a.assetType || 'image',
      url: a.url || '',
      loader: a.loader || null,
      options: a.options || null,
      data: a.data || null,
    })),
  };

  return omitDeep(rawPayload) as IThemeRecord;
};
