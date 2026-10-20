/**
 * @jest-environment jsdom
 *
 * Unit coverage for the pure theme transformations that used to be buried
 * inside `ApplicationThemesPanel`. These are the contract every host (client
 * themes, organization branding) depends on, so they are tested without
 * rendering anything.
 */
import {
  DEFAULT_COMPONENT_OVERRIDES,
  DEFAULT_DARK_PALETTE,
  DEFAULT_LIGHT_PALETTE,
  createDefaultTheme,
} from '../themeDefaults';
import {
  buildThemePayload,
  duplicateTheme,
  getModePalette,
  prepareThemeForEditing,
  updateThemeComponents,
  updateThemePalette,
} from '../themeModel';

describe('prepareThemeForEditing', () => {
  it('normalises a legacy single-mode theme into dark + light', () => {
    const legacy = {
      name: 'legacy',
      options: {
        palette: { mode: 'light', primary: { main: '#abcdef' } },
      },
      modes: [{ mode: 'light', options: { palette: { primary: { main: '#abcdef' } } } }],
    };

    const prepared = prepareThemeForEditing(legacy as any);

    expect(prepared.modes).toHaveLength(2);
    const dark = prepared.modes.find((m) => m.mode === 'dark');
    const light = prepared.modes.find((m) => m.mode === 'light');

    // Missing dark palette is filled from the canonical defaults.
    expect(dark?.options?.palette).toEqual(DEFAULT_DARK_PALETTE);
    // Existing light values win over defaults; missing groups are filled.
    expect(light?.options?.palette?.primary?.main).toBe('#abcdef');
    expect(light?.options?.palette?.secondary).toEqual(DEFAULT_LIGHT_PALETTE.secondary);
    expect(light?.options?.palette?.background).toEqual(DEFAULT_LIGHT_PALETTE.background);

    // Root options point at the default (dark) palette.
    expect(prepared.defaultThemeMode).toBeUndefined();
    expect(prepared.options?.palette).toEqual(DEFAULT_DARK_PALETTE);
  });

  it('does not mutate the caller theme', () => {
    const original = createDefaultTheme('demo');
    const snapshot = JSON.parse(JSON.stringify(original));

    prepareThemeForEditing(original);

    expect(original).toEqual(snapshot);
  });

  it('keeps component overrides when the root options omit them', () => {
    const prepared = prepareThemeForEditing({
      name: 'components',
      modes: [{ mode: 'dark', options: { components: { MuiChip: { defaultProps: { size: 'small' } } } } }],
    } as any);

    expect(prepared.options?.components).toEqual({
      MuiChip: { defaultProps: { size: 'small' } },
    });
  });

  it('falls back to the canonical overrides when nothing is configured', () => {
    const prepared = prepareThemeForEditing({ name: 'bare' } as any);
    expect(prepared.options?.components).toEqual(DEFAULT_COMPONENT_OVERRIDES);
  });
});

describe('duplicateTheme', () => {
  it('suffixes the key/description and drops the server identity', () => {
    const source = { ...createDefaultTheme('ocean'), id: 'server-id', description: 'Blue' };

    const copy = duplicateTheme(source as any);

    expect(copy.name).toBe('ocean-copy');
    expect(copy.description).toBe('Blue (Copy)');
    expect(copy.id).toBeUndefined();
    // Source untouched.
    expect(source.name).toBe('ocean');
    expect(source.id).toBe('server-id');
  });
});

describe('getModePalette', () => {
  it('prefers the mode palette, then root palette, then defaults', () => {
    const theme = createDefaultTheme('demo');

    expect(getModePalette(theme, 'light')).toEqual(DEFAULT_LIGHT_PALETTE);
    expect(getModePalette(null, 'dark')).toEqual(DEFAULT_DARK_PALETTE);

    const rootOnly = { name: 'root', options: { palette: { primary: { main: '#010203' } } } };
    expect(getModePalette(rootOnly as any, 'dark')?.primary?.main).toBe('#010203');
  });
});

describe('updateThemePalette', () => {
  it('updates only the requested mode and re-points the root palette', () => {
    const theme = prepareThemeForEditing(createDefaultTheme('demo'));

    const next = updateThemePalette(theme, 'light', 'primary', 'main', '#00ff00');

    const light = next.modes?.find((m) => m.mode === 'light');
    const dark = next.modes?.find((m) => m.mode === 'dark');

    expect(light?.options?.palette?.primary?.main).toBe('#00ff00');
    expect(light?.options?.palette?.primary?.light).toBe(DEFAULT_LIGHT_PALETTE.primary.light);
    // Dark mode untouched.
    expect(dark?.options?.palette).toEqual(DEFAULT_DARK_PALETTE);
    // Root palette mirrors the default mode (dark).
    expect(next.options?.palette?.mode).toBe('dark');
    // Immutability.
    expect(theme.modes?.find((m) => m.mode === 'light')?.options?.palette?.primary?.main)
      .toBe(DEFAULT_LIGHT_PALETTE.primary.main);
  });

  it('handles direct colour groups such as background and text', () => {
    const theme = prepareThemeForEditing(createDefaultTheme('demo'));
    const next = updateThemePalette(theme, 'dark', 'background', 'paper', '#222222');

    expect(next.modes?.find((m) => m.mode === 'dark')?.options?.palette?.background?.paper)
      .toBe('#222222');
  });
});

describe('updateThemeComponents', () => {
  it('writes overrides to the root and mirrors them into every mode', () => {
    const theme = prepareThemeForEditing(createDefaultTheme('demo'));
    const components = { ...DEFAULT_COMPONENT_OVERRIDES, MuiChip: { defaultProps: { size: 'small' } } };

    const next = updateThemeComponents(theme, components);

    expect(next.options?.components).toEqual(components);
    expect(next.modes?.every((m) => m.options?.components === components)).toBe(true);
  });
});

describe('buildThemePayload', () => {
  it('sanitises modes, assets and GraphQL metadata', () => {
    const theme = {
      ...createDefaultTheme('demo'),
      // GraphQL responses carry __typename at every level; mutations must not.
      __typename: 'ApplicationTheme',
      id: 'theme-1',
      modes: (createDefaultTheme('demo').modes || []).map((m: any) => ({
        ...m,
        __typename: 'ApplicationThemeMode',
      })),
      assets: [
        { id: 'logo', name: 'logo.png', assetType: 'image', url: 'themes/demo/images/logo.png', __typename: 'ApplicationThemeAsset' },
        { name: 'only-a-name.png' },
      ],
    };

    const payload = buildThemePayload(theme as any);

    expect(payload.__typename).toBeUndefined();
    expect(payload.id).toBe('theme-1');
    expect(payload.modes).toHaveLength(2);
    expect(payload.modes?.[0]).toEqual({
      id: 'dark',
      mode: 'dark',
      name: 'Dark Mode',
      description: 'Default dark theme mode',
      icon: 'night',
      options: {
        palette: DEFAULT_DARK_PALETTE,
        components: DEFAULT_COMPONENT_OVERRIDES,
      },
    });
    expect(payload.assets?.[0]).toEqual({
      id: 'logo',
      name: 'logo.png',
      assetType: 'image',
      url: 'themes/demo/images/logo.png',
      loader: null,
      options: null,
      data: null,
    });
    // Missing fields are normalised from the name.
    expect(payload.assets?.[1]).toEqual({
      id: 'only-a-name.png',
      name: 'only-a-name.png',
      assetType: 'image',
      url: '',
      loader: null,
      options: null,
      data: null,
    });
  });

  it('applies a raw-JSON options override', () => {
    const theme = createDefaultTheme('demo');
    const payload = buildThemePayload(theme, {
      ...theme.options,
      components: { MuiButton: { defaultProps: { variant: 'outlined' } } },
    });

    expect(payload.options?.components).toEqual({
      MuiButton: { defaultProps: { variant: 'outlined' } },
    });
    expect(payload.modes?.[0]?.options?.components).toEqual({
      MuiButton: { defaultProps: { variant: 'outlined' } },
    });
  });
});
