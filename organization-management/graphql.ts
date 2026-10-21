/**
 * Every GraphQL document used by the organization management surface.
 *
 * Components never build a query string — they call the hooks in `./hooks`,
 * which own variables, loading and error state. Keeping the documents here also
 * makes it obvious which server fields this screen depends on.
 */

/**
 * Fields selected for a list row.
 *
 * `businessUnits` is selected as references only: the count is what the grid
 * shows, and the resolver returns the organization's own array when it is
 * populated, so this stays a single round trip.
 */
export const ORGANIZATION_LIST_FIELDS = `
  id
  name
  code
  tradingName
  status
  logo
  logoURL
  avatar
  avatarURL
  theme
  themeMode
  updatedAt
  businessUnits { id }
`;

/**
 * Identity fields read by the detail shell and returned by mutations.
 *
 * `website`, `contactEmail` and `contactPhone` are editable on the Overview
 * tab (ORG-011) and are part of `UpdateOrganizationInput`. `createdBy` and
 * `updatedBy` are deliberately **not** selected: the server's `Organization`
 * type does not expose them yet, and selecting an unknown field would fail the
 * whole query. The Overview tab renders those rows only when a payload has
 * them (`Organization` in `./types` keeps them optional).
 */
export const ORGANIZATION_DETAIL_FIELDS = `
  id
  name
  code
  tradingName
  legalName
  description
  website
  contactEmail
  contactPhone
  status
  logo
  logoURL
  avatar
  avatarURL
  theme
  themeMode
  public
  createdAt
  updatedAt
  businessUnits { id name }
`;

/**
 * The scoped organization list.
 *
 * `CoreOrganizations(search)` is used rather than `CorePagedOrganizations`
 * because the paged variant accepts no status parameter — see
 * `hooks/useOrganizationList.ts` for why filtering and paging are applied
 * client-side.
 */
export const CORE_ORGANIZATIONS = `
  query CoreOrganizations($search: String) {
    CoreOrganizations(search: $search) {
      ${ORGANIZATION_LIST_FIELDS}
    }
  }
`;

export const CORE_ORGANIZATION = `
  query CoreOrganization($id: String!) {
    CoreOrganization(id: $id) {
      ${ORGANIZATION_DETAIL_FIELDS}
    }
  }
`;

export const ORGANIZATION_STATISTICS = `
  query OrganizationStatistics($id: String!) {
    OrganizationStatistics(id: $id) {
      members
      businessUnits
      teams
    }
  }
`;

export const CREATE_ORGANIZATION = `
  mutation createOrganization($input: CreateOrganizationInput!) {
    createOrganization(input: $input) {
      ${ORGANIZATION_DETAIL_FIELDS}
    }
  }
`;

export const UPDATE_ORGANIZATION = `
  mutation updateOrganization($id: String!, $input: UpdateOrganizationInput!) {
    updateOrganization(id: $id, input: $input) {
      ${ORGANIZATION_DETAIL_FIELDS}
    }
  }
`;

export const ARCHIVE_ORGANIZATION = `
  mutation archiveOrganization($id: String!) {
    archiveOrganization(id: $id) {
      ${ORGANIZATION_LIST_FIELDS}
    }
  }
`;

export const RESTORE_ORGANIZATION = `
  mutation restoreOrganization($id: String!) {
    restoreOrganization(id: $id) {
      ${ORGANIZATION_LIST_FIELDS}
    }
  }
`;

/**
 * ORG-030/ORG-031 will add this query. It is defined here so the wizard has a
 * single place to guard; `useDemographicDefinitions` treats a schema-level
 * rejection as "not available yet" rather than an error.
 */
export const ORGANIZATION_DEMOGRAPHIC_DEFINITIONS = `
  query OrganizationDemographicDefinitions($organizationId: String!) {
    OrganizationDemographicDefinitions(organizationId: $organizationId) {
      id
      key
      title
      description
      category
      valueType
      required
      ordinal
    }
  }
`;

/**
 * Fields selected for a theme owned by an organization (ORG-013).
 *
 * `ApplicationTheme` is the same type a `ReactoryClient` uses, so the shared
 * `theme-editor` can host an organization theme without a translation layer.
 * `options`, `content` and the mode `options` are `Any` on the server and are
 * read as opaque records.
 */
export const ORGANIZATION_THEME_FIELDS = `
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
`;

/**
 * The branding slice of an organization: images, the active theme pointer and
 * the themes the organization owns.
 *
 * Kept separate from `ORGANIZATION_DETAIL_FIELDS` on purpose. The detail shell
 * does not render the theme list, so its read stays lean; the branding tab owns
 * this read (and every theme mutation selects the same slice, which is what
 * lets the tab render the server's returned pointer instead of re-deriving it).
 */
export const ORGANIZATION_BRANDING_FIELDS = `
  id
  name
  theme
  themeMode
  logo
  logoURL
  avatar
  avatarURL
  themes {
    ${ORGANIZATION_THEME_FIELDS}
  }
`;

/**
 * Branding read.
 *
 * `CoreOrganization` is aliased to `OrganizationBranding` so the hook's
 * operation name is unambiguous (and so a test can dispatch on it) without
 * adding a second query field to the schema.
 */
export const ORGANIZATION_BRANDING = `
  query OrganizationBranding($id: String!) {
    CoreOrganization(id: $id) {
      ${ORGANIZATION_BRANDING_FIELDS}
    }
  }
`;

/** The `styles.css` currently published for a theme. */
export const ORGANIZATION_THEME_CSS = `
  query OrganizationThemeCss($themeName: String!) {
    OrganizationThemeCss(themeName: $themeName)
  }
`;

/**
 * Create or update one theme owned by the organization.
 *
 * `theme` is an `ApplicationThemeInput`; the payload is produced by
 * `buildThemePayload` in the shared theme editor, so the tab never hand-shapes
 * a theme. The mutation returns the whole organization — the tab renders the
 * returned `theme`/`themeMode`/`themes`, never a client-side guess.
 */
export const ORGANIZATION_SAVE_THEME = `
  mutation OrganizationSaveTheme($id: String!, $theme: ApplicationThemeInput!) {
    OrganizationSaveTheme(id: $id, theme: $theme) {
      ${ORGANIZATION_BRANDING_FIELDS}
    }
  }
`;

/** Point the organization at one of its themes, optionally changing the mode. */
export const ORGANIZATION_SET_ACTIVE_THEME = `
  mutation OrganizationSetActiveTheme($id: String!, $themeName: String!, $mode: ApplicationThemeModeType) {
    OrganizationSetActiveTheme(id: $id, themeName: $themeName, mode: $mode) {
      ${ORGANIZATION_BRANDING_FIELDS}
    }
  }
`;

/**
 * Delete one theme.
 *
 * The server already resolves the fallback: deleting the active theme activates
 * the first remaining theme, or clears the pointer when none remain. The tab
 * renders the returned `theme` pointer as-is — re-deriving it here is the bug
 * this contract exists to prevent.
 */
export const ORGANIZATION_DELETE_THEME = `
  mutation OrganizationDeleteTheme($id: String!, $themeName: String!) {
    OrganizationDeleteTheme(id: $id, themeName: $themeName) {
      ${ORGANIZATION_BRANDING_FIELDS}
    }
  }
`;

/** Publish the selected theme's `styles.css`. */
export const ORGANIZATION_PUBLISH_THEME_CSS = `
  mutation OrganizationPublishThemeCss($id: String!, $themeName: String!, $css: String!) {
    OrganizationPublishThemeCss(id: $id, themeName: $themeName, css: $css)
  }
`;

/**
 * Upload a logo or avatar (ORG-013a server contract).
 *
 * `imageType` is `'logo'` or `'avatar'`; `file` is an `Upload` scalar, which the
 * Apollo upload link turns into a multipart request. The returned organization
 * already carries the persisted alias (`logo`/`avatar`) and resolved URL, so the
 * tab does not need a follow-up `updateOrganization`.
 */
export const ORGANIZATION_UPLOAD_IMAGE = `
  mutation OrganizationUploadImage($id: String!, $imageType: String!, $file: Upload!) {
    OrganizationUploadImage(id: $id, imageType: $imageType, file: $file) {
      ${ORGANIZATION_BRANDING_FIELDS}
    }
  }
`;

/** Operation names, used by the hooks and by the test fixtures. */
export const OPERATIONS = {
  coreOrganizations: 'CoreOrganizations',
  coreOrganization: 'CoreOrganization',
  organizationStatistics: 'OrganizationStatistics',
  createOrganization: 'createOrganization',
  updateOrganization: 'updateOrganization',
  archiveOrganization: 'archiveOrganization',
  restoreOrganization: 'restoreOrganization',
  organizationDemographicDefinitions: 'OrganizationDemographicDefinitions',
  organizationBranding: 'OrganizationBranding',
  organizationThemeCss: 'OrganizationThemeCss',
  organizationSaveTheme: 'OrganizationSaveTheme',
  organizationSetActiveTheme: 'OrganizationSetActiveTheme',
  organizationDeleteTheme: 'OrganizationDeleteTheme',
  organizationPublishThemeCss: 'OrganizationPublishThemeCss',
  organizationUploadImage: 'OrganizationUploadImage',
} as const;
