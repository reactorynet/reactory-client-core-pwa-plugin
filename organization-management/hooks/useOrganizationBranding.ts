import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OPERATIONS,
  ORGANIZATION_BRANDING,
  ORGANIZATION_DELETE_THEME,
  ORGANIZATION_PUBLISH_THEME_CSS,
  ORGANIZATION_SAVE_THEME,
  ORGANIZATION_SET_ACTIVE_THEME,
  ORGANIZATION_THEME_CSS,
  ORGANIZATION_UPLOAD_IMAGE,
  UPDATE_ORGANIZATION,
} from '../graphql';
import type {
  Organization,
  OrganizationError,
  OrganizationImageType,
  OrganizationTheme,
  OrganizationThemeMode,
} from '../types';
import { envelopeError, operationPayload, serverMessageOf } from '../utils';

/**
 * Owns the organization branding surface (ORG-013).
 *
 * Every GraphQL document, variable shape, in-flight flag and error mapping for
 * the Branding tab lives here; the tab renders what it is given and never
 * builds a document. `theme-editor` deliberately contains no transport, so this
 * hook is the only place organization themes are persisted.
 *
 * Design notes
 * ------------
 * - **The mutation response is the truth.** `OrganizationSaveTheme`,
 *   `OrganizationSetActiveTheme` and `OrganizationDeleteTheme` all return the
 *   whole `Organization`. The hook keeps a snapshot of the last returned
 *   branding slice and the tab renders *that*, so the server's deterministic
 *   delete fallback (first remaining theme, or no pointer at all) is never
 *   re-derived on the client.
 * - **A partial payload must not erase the theme list.** `updateOrganization`
 *   returns `ORGANIZATION_DETAIL_FIELDS`, which does not select `themes`.
 *   `mergeOrganization` therefore keeps the previously loaded list whenever the
 *   incoming payload omitted it.
 * - **Write results carry their own failure.** Returning the `OrganizationError`
 *   alongside the record means the tab can notify with the server's message
 *   immediately after `await` instead of reading pre-render hook state.
 */
export interface UseOrganizationBrandingOptions {
  reactory: any;
  /** The organization the detail shell is showing. */
  organization: Organization;
  /** Set false to defer the initial read (tests, lazy hosts). */
  autoLoad?: boolean;
}

/** Result of a branding write: the accepted record, or the failure that blocked it. */
export interface OrganizationBrandingWriteResult {
  organization: Organization | null;
  error: OrganizationError | null;
}

/** Result of reading a theme's published CSS. */
export interface OrganizationThemeCssResult {
  css: string;
  error: OrganizationError | null;
}

/** Result of publishing a theme's CSS. */
export interface OrganizationThemeCssPublishResult {
  published: boolean;
  error: OrganizationError | null;
}

export interface UseOrganizationBrandingResult {
  /** Themes owned by the organization, from the latest read or mutation. */
  themes: OrganizationTheme[];
  /** Active theme name, from the server. Null means "inherit the client theme". */
  theme: string | null;
  themeMode: OrganizationThemeMode | null;
  logo: string | null;
  logoURL: string | null;
  avatar: string | null;
  avatarURL: string | null;
  /** True while the branding read is in flight. */
  loading: boolean;
  /** True while a theme / image-removal write is in flight. */
  saving: boolean;
  /** Which image slot is uploading, if any. */
  uploading: OrganizationImageType | null;
  /** Last failure, as a translatable key plus the server's own text. */
  error: OrganizationError | null;
  clearError: () => void;
  /** Re-reads the branding slice. */
  refreshBranding: () => Promise<void>;
  /** Uploads a logo or avatar; the server returns the persisted alias. */
  uploadImage: (
    imageType: OrganizationImageType,
    file: File,
  ) => Promise<OrganizationBrandingWriteResult>;
  /** Clears `logo` or `avatar` with `updateOrganization({ [type]: null })`. */
  removeImage: (imageType: OrganizationImageType) => Promise<OrganizationBrandingWriteResult>;
  /** Clears `theme` and `themeMode`, so the client theme applies. */
  inheritClientTheme: () => Promise<OrganizationBrandingWriteResult>;
  /** Creates or updates one theme (`ApplicationThemeInput`). */
  saveTheme: (theme: OrganizationTheme) => Promise<OrganizationBrandingWriteResult>;
  /** Points the organization at one of its themes, optionally switching mode. */
  activateTheme: (
    themeName: string,
    mode?: OrganizationThemeMode | null,
  ) => Promise<OrganizationBrandingWriteResult>;
  /** Deletes a theme; the returned organization carries the resolved pointer. */
  deleteTheme: (themeName: string) => Promise<OrganizationBrandingWriteResult>;
  /** Reads the selected theme's published `styles.css`. */
  loadThemeCss: (themeName: string) => Promise<OrganizationThemeCssResult>;
  /** Publishes the selected theme's `styles.css`. */
  publishThemeCss: (
    themeName: string,
    css: string,
  ) => Promise<OrganizationThemeCssPublishResult>;
}

interface BrandingSnapshot {
  id: string;
  organization: Organization;
}

/** Normalise a server mode value to the enum the editor and mutations accept. */
export const normalizeThemeMode = (value: any): OrganizationThemeMode | null => {
  if (value === 'light' || value === 'dark' || value === 'os') return value;
  return null;
};

/**
 * Merge a mutation payload over the snapshot we already hold.
 *
 * `updateOrganization` does not select `themes`, and a future trimmed mutation
 * selection may not either — an absent `themes` key means "not asked for", not
 * "the organization now has no themes". Keeping the previous list prevents a
 * successful image removal from blanking the theme panel.
 */
export const mergeOrganization = (
  previous: Organization | null,
  payload: Organization,
): Organization => {
  if (!previous) return payload;
  const merged: Organization = { ...previous, ...payload };
  if (payload.themes === undefined) merged.themes = previous.themes;
  return merged;
};

/**
 * Shape a `buildThemePayload` result into a valid `ApplicationThemeInput`.
 *
 * `ApplicationThemeInput` requires `name`, `type`, `defaultThemeMode` and a
 * non-null `options` per mode. The shared editor's payload is authoritative for
 * everything else (modes, assets, content, components); this only fills the
 * scalars a legacy or freshly created record may omit.
 */
export const themeInputFromPayload = (payload: OrganizationTheme): Record<string, any> => ({
  ...payload,
  nameSpace: payload.nameSpace || 'reactory',
  version: payload.version || '1.0.0',
  type: payload.type || 'material',
  defaultThemeMode: payload.defaultThemeMode || 'dark',
  options: payload.options || {},
  modes: (payload.modes || []).map((mode) => ({ ...mode, options: mode.options || {} })),
  content: payload.content || {},
});

export const useOrganizationBranding = (
  options: UseOrganizationBrandingOptions,
): UseOrganizationBrandingResult => {
  const { reactory, organization, autoLoad = true } = options || ({} as UseOrganizationBrandingOptions);

  const organizationId = organization && organization.id ? `${organization.id}` : '';

  const [snapshot, setSnapshot] = useState<BrandingSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(autoLoad && organizationId.length > 0);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploading, setUploading] = useState<OrganizationImageType | null>(null);
  const [error, setError] = useState<OrganizationError | null>(null);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /** Convert a thrown failure into the hook's error contract. */
  const toOrganizationError = useCallback(
    (caught: any, fallbackKey: OrganizationError['key']): OrganizationError => ({
      key: (caught && caught.organizationKey) || fallbackKey,
      serverMessage: serverMessageOf(caught),
    }),
    [],
  );

  const remember = useCallback((payload: Organization, id: string) => {
    if (!payload) return;
    setSnapshot((previous) => {
      const base = previous && previous.id === id ? previous.organization : null;
      return { id, organization: mergeOrganization(base, payload) };
    });
  }, []);

  /**
   * Execute a mutation and unwrap `data.<operationName>`.
   *
   * Throws for both failure shapes the SDK produces (a rejection and a resolved
   * envelope with `errors`) so callers share one error path.
   */
  const runMutation = useCallback(
    async (
      document: string,
      variables: Record<string, any>,
      operationName: string,
    ): Promise<any> => {
      if (!reactory || typeof reactory.graphqlMutation !== 'function') {
        const apiError = new Error('reactory-api-unavailable') as Error & {
          organizationKey?: string;
        };
        apiError.organizationKey = 'reactory.organizations.error.apiUnavailable';
        throw apiError;
      }

      const result = await reactory.graphqlMutation(document, variables, {
        fetchPolicy: 'network-only',
      });

      const failure = envelopeError(result);
      if (failure) {
        const serverError = new Error(failure) as Error & { organizationKey?: string };
        serverError.organizationKey = 'reactory.organizations.error.saveFailed';
        throw serverError;
      }

      return operationPayload(result, operationName);
    },
    [reactory],
  );

  const write = useCallback(
    async (
      document: string,
      variables: Record<string, any>,
      operationName: string,
      fallbackKey: OrganizationError['key'],
    ): Promise<OrganizationBrandingWriteResult> => {
      setSaving(true);
      setError(null);

      try {
        const payload = (await runMutation(document, variables, operationName)) as Organization | null;

        if (!payload || !payload.id) {
          const emptyError = new Error('reactory-empty-result') as Error & {
            organizationKey?: string;
          };
          emptyError.organizationKey = fallbackKey;
          throw emptyError;
        }

        if (mountedRef.current) remember(payload, `${payload.id}`);
        return { organization: payload, error: null };
      } catch (caught: any) {
        const failure = toOrganizationError(caught, fallbackKey);
        if (mountedRef.current) setError(failure);
        return { organization: null, error: failure };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [remember, runMutation, toOrganizationError],
  );

  const read = useCallback(async (): Promise<void> => {
    if (!organizationId) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setError({ key: 'reactory.organizations.error.apiUnavailable' });
      setLoading(false);
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setLoading(true);
    setError(null);

    try {
      const result = await reactory.graphqlQuery(
        ORGANIZATION_BRANDING,
        { id: organizationId },
        { fetchPolicy: 'network-only' },
      );

      if (sequence !== sequenceRef.current || !mountedRef.current) return;

      const failure = envelopeError(result);
      if (failure) {
        setError({
          key: 'reactory.organizations.error.brandingLoadFailed',
          serverMessage: failure,
        });
        return;
      }

      const payload = operationPayload(result, OPERATIONS.organizationBranding) as Organization | null;
      if (payload) remember(payload, organizationId);
    } catch (caught: any) {
      if (sequence !== sequenceRef.current || !mountedRef.current) return;
      setError({
        key: 'reactory.organizations.error.brandingLoadFailed',
        serverMessage: serverMessageOf(caught),
      });
    } finally {
      if (sequence === sequenceRef.current && mountedRef.current) setLoading(false);
    }
  }, [organizationId, reactory, remember]);

  useEffect(() => {
    if (!autoLoad) return;
    void read();
  }, [autoLoad, read]);

  /**
   * Upload one image slot.
   *
   * The `file` goes through the Apollo upload link as the `Upload` scalar; the
   * returned organization already carries the persisted alias and URL, so no
   * follow-up update is needed. `uploading` is separate from `saving` so the
   * theme editor's Save button is not disabled by an unrelated upload.
   */
  const uploadImage = useCallback(
    async (
      imageType: OrganizationImageType,
      file: File,
    ): Promise<OrganizationBrandingWriteResult> => {
      if (!organizationId || !file) {
        return { organization: null, error: null };
      }

      setUploading(imageType);
      setError(null);

      try {
        const payload = (await runMutation(
          ORGANIZATION_UPLOAD_IMAGE,
          { id: organizationId, imageType, file },
          OPERATIONS.organizationUploadImage,
        )) as Organization | null;

        if (!payload || !payload.id) {
          const emptyError = new Error('reactory-empty-result') as Error & {
            organizationKey?: string;
          };
          emptyError.organizationKey = 'reactory.organizations.error.imageUploadFailed';
          throw emptyError;
        }

        if (mountedRef.current) remember(payload, organizationId);
        return { organization: payload, error: null };
      } catch (caught: any) {
        const failure = toOrganizationError(caught, 'reactory.organizations.error.imageUploadFailed');
        if (mountedRef.current) setError(failure);
        return { organization: null, error: failure };
      } finally {
        if (mountedRef.current) setUploading(null);
      }
    },
    [organizationId, remember, runMutation, toOrganizationError],
  );

  const removeImage = useCallback(
    (imageType: OrganizationImageType): Promise<OrganizationBrandingWriteResult> =>
      write(
        UPDATE_ORGANIZATION,
        { id: organizationId, input: { [imageType]: null } },
        OPERATIONS.updateOrganization,
        'reactory.organizations.error.imageRemoveFailed',
      ),
    [organizationId, write],
  );

  const inheritClientTheme = useCallback(
    (): Promise<OrganizationBrandingWriteResult> =>
      write(
        UPDATE_ORGANIZATION,
        { id: organizationId, input: { theme: null, themeMode: null } },
        OPERATIONS.updateOrganization,
        'reactory.organizations.error.themeInheritFailed',
      ),
    [organizationId, write],
  );

  const saveTheme = useCallback(
    (theme: OrganizationTheme): Promise<OrganizationBrandingWriteResult> =>
      write(
        ORGANIZATION_SAVE_THEME,
        { id: organizationId, theme: themeInputFromPayload(theme) },
        OPERATIONS.organizationSaveTheme,
        'reactory.organizations.error.themeSaveFailed',
      ),
    [organizationId, write],
  );

  const activateTheme = useCallback(
    (
      themeName: string,
      mode?: OrganizationThemeMode | null,
    ): Promise<OrganizationBrandingWriteResult> =>
      write(
        ORGANIZATION_SET_ACTIVE_THEME,
        { id: organizationId, themeName, mode: normalizeThemeMode(mode) },
        OPERATIONS.organizationSetActiveTheme,
        'reactory.organizations.error.themeActivateFailed',
      ),
    [organizationId, write],
  );

  const deleteTheme = useCallback(
    (themeName: string): Promise<OrganizationBrandingWriteResult> =>
      write(
        ORGANIZATION_DELETE_THEME,
        { id: organizationId, themeName },
        OPERATIONS.organizationDeleteTheme,
        'reactory.organizations.error.themeDeleteFailed',
      ),
    [organizationId, write],
  );

  /**
   * Read a theme's CSS. A rejected read yields an empty string and the error,
   * so the caller can fall back to the starter template without throwing.
   */
  const loadThemeCss = useCallback(
    async (themeName: string): Promise<OrganizationThemeCssResult> => {
      if (!themeName) return { css: '', error: null };

      if (!reactory || typeof reactory.graphqlQuery !== 'function') {
        return {
          css: '',
          error: { key: 'reactory.organizations.error.apiUnavailable' },
        };
      }

      try {
        const result = await reactory.graphqlQuery(
          ORGANIZATION_THEME_CSS,
          { themeName },
          { fetchPolicy: 'network-only' },
        );

        const failure = envelopeError(result);
        if (failure) {
          return {
            css: '',
            error: {
              key: 'reactory.organizations.error.themeCssLoadFailed',
              serverMessage: failure,
            },
          };
        }

        const css = operationPayload(result, OPERATIONS.organizationThemeCss);
        return { css: typeof css === 'string' ? css : '', error: null };
      } catch (caught: any) {
        return {
          css: '',
          error: {
            key: 'reactory.organizations.error.themeCssLoadFailed',
            serverMessage: serverMessageOf(caught),
          },
        };
      }
    },
    [reactory],
  );

  const publishThemeCss = useCallback(
    async (themeName: string, css: string): Promise<OrganizationThemeCssPublishResult> => {
      if (!reactory || typeof reactory.graphqlMutation !== 'function') {
        return {
          published: false,
          error: { key: 'reactory.organizations.error.apiUnavailable' },
        };
      }

      setSaving(true);
      setError(null);

      try {
        const published = await runMutation(
          ORGANIZATION_PUBLISH_THEME_CSS,
          { id: organizationId, themeName, css },
          OPERATIONS.organizationPublishThemeCss,
        );

        if (published !== true) {
          const failure = new Error('reactory-empty-result') as Error & {
            organizationKey?: string;
          };
          failure.organizationKey = 'reactory.organizations.error.themeCssPublishFailed';
          throw failure;
        }

        return { published: true, error: null };
      } catch (caught: any) {
        const failure = toOrganizationError(
          caught,
          'reactory.organizations.error.themeCssPublishFailed',
        );
        if (mountedRef.current) setError(failure);
        return { published: false, error: failure };
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [organizationId, runMutation, toOrganizationError],
  );

  // Only a snapshot for the organization currently on screen may be rendered;
  // an id change (route navigation) falls back to the shell's prop until the
  // read for the new organization lands.
  const current = snapshot && snapshot.id === organizationId ? snapshot.organization : null;
  const source = current || organization || ({} as Organization);

  return {
    themes: Array.isArray(source.themes) ? source.themes : [],
    theme: source.theme || null,
    themeMode: normalizeThemeMode(source.themeMode),
    logo: source.logo || null,
    logoURL: source.logoURL || null,
    avatar: source.avatar || null,
    avatarURL: source.avatarURL || null,
    loading,
    saving,
    uploading,
    error,
    clearError,
    refreshBranding: read,
    uploadImage,
    removeImage,
    inheritClientTheme,
    saveTheme,
    activateTheme,
    deleteTheme,
    loadThemeCss,
    publishThemeCss,
  };
};

export default useOrganizationBranding;
