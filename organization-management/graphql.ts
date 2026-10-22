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
 * Every field the Demographics configuration pane (ORG-031) reads.
 *
 * Mirrors `type DemographicDefinition` in
 * `reactory-express-server/src/modules/reactory-core/graph/types/Demographics`.
 * `schema`, `componentProps` and `componentPropsMap` are the server's `Any`
 * scalar and are read as opaque JSON — the editor validates their structure
 * client-side before they are sent back.
 */
export const DEMOGRAPHIC_DEFINITION_FIELDS = `
  id
  organization
  key
  title
  description
  icon
  category
  valueType
  schema
  options { key label ordinal deprecated }
  reference { model multiple }
  widget { componentFqn componentProps componentPropsMap }
  required
  multiValued
  sensitive
  searchable
  enabled
  ordinal
  roles
  system
`;

/**
 * The organization's definitions, ordered by `ordinal` by the server.
 *
 * `includeDisabled` is optional rather than required-with-default so the create
 * wizard's guard (`useDemographicDefinitions` in `hooks/useOrganizationAdmin`)
 * can keep calling this document with `{ organizationId }` alone and still
 * receive the enabled set.
 */
export const ORGANIZATION_DEMOGRAPHIC_DEFINITIONS = `
  query OrganizationDemographicDefinitions($organizationId: String!, $includeDisabled: Boolean) {
    OrganizationDemographicDefinitions(organizationId: $organizationId, includeDisabled: $includeDisabled) {
      ${DEMOGRAPHIC_DEFINITION_FIELDS}
    }
  }
`;

/**
 * Create or update one definition.
 *
 * `key` is only ever sent on create: the server freezes it once the definition
 * exists, and `buildDefinitionInput` in `./demographicDraft` refuses to include
 * it for an update.
 */
export const ORGANIZATION_SAVE_DEMOGRAPHIC_DEFINITION = `
  mutation OrganizationSaveDemographicDefinition($organizationId: String!, $definition: DemographicDefinitionInput!) {
    OrganizationSaveDemographicDefinition(organizationId: $organizationId, definition: $definition) {
      ${DEMOGRAPHIC_DEFINITION_FIELDS}
    }
  }
`;

/**
 * Soft-delete one definition.
 *
 * The server refuses when stored values still reference the definition; the
 * pane surfaces that refusal verbatim and keeps the row, so this mutation
 * resolves `false`/throws rather than silently succeeding.
 */
export const ORGANIZATION_DELETE_DEMOGRAPHIC_DEFINITION = `
  mutation OrganizationDeleteDemographicDefinition($organizationId: String!, $key: String!) {
    OrganizationDeleteDemographicDefinition(organizationId: $organizationId, key: $key)
  }
`;

/** Apply the supplied key order as the definitions' `ordinal`. */
export const ORGANIZATION_REORDER_DEMOGRAPHIC_DEFINITIONS = `
  mutation OrganizationReorderDemographicDefinitions($organizationId: String!, $keys: [String!]!) {
    OrganizationReorderDemographicDefinitions(organizationId: $organizationId, keys: $keys) {
      ${DEMOGRAPHIC_DEFINITION_FIELDS}
    }
  }
`;

/** Toggle one definition without touching any stored value. */
export const ORGANIZATION_SET_DEMOGRAPHIC_ENABLED = `
  mutation OrganizationSetDemographicEnabled($organizationId: String!, $key: String!, $enabled: Boolean!) {
    OrganizationSetDemographicEnabled(organizationId: $organizationId, key: $key, enabled: $enabled) {
      ${DEMOGRAPHIC_DEFINITION_FIELDS}
    }
  }
`;

/**
 * One page of stored values, used only to count them.
 *
 * `DemographicDefinition` carries no usage count and the server has no
 * aggregation query, so the configuration pane asks for a single-row page per
 * definition and reads `paging.total`. `pageSize: 1` keeps the payload to one
 * document per key; the count is best-effort and never blocks the list.
 */
export const ORGANIZATION_DEMOGRAPHIC_VALUES = `
  query OrganizationDemographicValues($organizationId: String!, $filter: DemographicValueFilter, $paging: PagingRequest) {
    OrganizationDemographicValues(organizationId: $organizationId, filter: $filter, paging: $paging) {
      values { key }
      paging { page pageSize total hasNext }
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

/* ------------------------------------------------------------------------- *
 * Organization structure (ORG-022)
 *
 * Every document below targets the API that shipped with ORG-020 (business
 * units) and ORG-021 (teams + the business-unit link). Two details are easy to
 * get wrong and are deliberate here:
 *
 *   - `businessUnitsForOrganization` and `teamsForOrganization` take `id`, not
 *     `organizationId`. The paged variants take `organizationId`. The tab uses
 *     the paged ones because only `ReactoryBusinessUnitFilter` can ask for
 *     soft-deleted units (`includeDeleted`), which is what makes Restore
 *     reachable.
 *   - `moveTeamToBusinessUnit` takes `id` (the team) and `businessUnitId`. A
 *     team's unit is never moved by sending `businessUnit` through
 *     `updateTeam`: that path would bypass the server's explicit move
 *     validation, which is the point of the dedicated mutation.
 * ------------------------------------------------------------------------- */

/** Fields selected for a business unit node. */
export const BUSINESS_UNIT_FIELDS = `
  id
  name
  description
  avatar
  deleted
  organization { id }
  owner { id firstName lastName email }
  members { id firstName lastName email }
`;

/** Fields selected for a team node, including the unit link. */
export const TEAM_FIELDS = `
  id
  title
  name
  description
  avatar
  deleted
  organization { id }
  businessUnit { id name }
  owner { id firstName lastName email }
  members { id firstName lastName email }
`;

/**
 * How many rows the structure view asks for in one page.
 *
 * Both paged queries are used (rather than the flat `*ForOrganization`
 * variants) because only the paged filters can express "include soft-deleted
 * business units". The structure screen is a whole-organization view, so it
 * loads one large page and does not paginate in the UI.
 */
export const STRUCTURE_PAGE_SIZE = 500;

/**
 * Business units for the organization, optionally including soft-deleted ones.
 *
 * `filter.includeDeleted` is the server's own flag (`ReactoryBusinessUnitFilter`)
 * — the tab toggles it, it does not invent a client-side filter.
 */
export const ORGANIZATION_STRUCTURE_BUSINESS_UNITS = `
  query OrganizationStructureBusinessUnits($organizationId: String!, $includeDeleted: Boolean) {
    OrganizationStructureBusinessUnits: pagedBusinessUnits(
      organizationId: $organizationId
      filter: { includeDeleted: $includeDeleted }
      paging: { page: 1, pageSize: ${STRUCTURE_PAGE_SIZE} }
    ) {
      paging { total page pageSize hasNext }
      businessUnits {
        ${BUSINESS_UNIT_FIELDS}
      }
    }
  }
`;

/** Teams for the organization, with their business-unit link. */
export const ORGANIZATION_STRUCTURE_TEAMS = `
  query OrganizationStructureTeams($organizationId: String!) {
    OrganizationStructureTeams: pagedTeams(
      organizationId: $organizationId
      paging: { page: 1, pageSize: ${STRUCTURE_PAGE_SIZE} }
    ) {
      paging { total page pageSize hasNext }
      teams {
        ${TEAM_FIELDS}
      }
    }
  }
`;

/**
 * Create a business unit.
 *
 * `BusinessUnitInput` requires `organization` and `owner`; `owner` comes from
 * the form (defaulted to the signed-in user), `organization` from the tab's
 * organization.
 */
export const CREATE_BUSINESS_UNIT = `
  mutation CreateBusinessUnit($input: BusinessUnitInput!) {
    createBusinessUnit(input: $input) {
      ${BUSINESS_UNIT_FIELDS}
    }
  }
`;

/** Update a business unit's identity fields (`BusinessUnitUpdateInput`). */
export const UPDATE_BUSINESS_UNIT = `
  mutation UpdateBusinessUnit($id: String!, $input: BusinessUnitUpdateInput) {
    updateBusinessUnit(id: $id, input: $input) {
      ${BUSINESS_UNIT_FIELDS}
    }
  }
`;

/** Soft-delete a business unit. Returns the unit with `deleted: true`. */
export const DELETE_BUSINESS_UNIT = `
  mutation DeleteBusinessUnit($id: String!) {
    deleteBusinessUnit(id: $id) {
      ${BUSINESS_UNIT_FIELDS}
    }
  }
`;

/** Restore a soft-deleted business unit. */
export const RESTORE_BUSINESS_UNIT = `
  mutation RestoreBusinessUnit($id: String!) {
    restoreBusinessUnit(id: $id) {
      ${BUSINESS_UNIT_FIELDS}
    }
  }
`;

/** Add a user to a business unit. Answers with a boolean. */
export const ADD_BUSINESS_UNIT_MEMBER = `
  mutation AddBusinessUnitMember($id: String!, $memberId: String!) {
    addMemberToBusinessUnit(id: $id, memberId: $memberId)
  }
`;

/** Remove a user from a business unit. Answers with a boolean. */
export const REMOVE_BUSINESS_UNIT_MEMBER = `
  mutation RemoveBusinessUnitMember($id: String!, $memberId: String!) {
    removeMemberFromBusinessUnit(id: $id, memberId: $memberId)
  }
`;

/**
 * Create a team inside the organization, optionally inside a business unit.
 *
 * The server's `createTeam` only reads `organization`, `name`/`title` and
 * `businessUnit`; owner and description are set through `updateTeam`.
 */
export const CREATE_TEAM = `
  mutation CreateTeam($input: TeamInput) {
    createTeam(input: $input) {
      ${TEAM_FIELDS}
    }
  }
`;

/** Update a team. Never carries `businessUnit` — see `MOVE_TEAM_TO_BUSINESS_UNIT`. */
export const UPDATE_TEAM = `
  mutation UpdateTeam($id: String!, $input: TeamInput) {
    updateTeam(id: $id, input: $input) {
      ${TEAM_FIELDS}
    }
  }
`;

/**
 * Move a team into a business unit.
 *
 * The single supported way to change a team's unit. The service re-validates
 * both sides and enforces the cross-organization guard.
 */
export const MOVE_TEAM_TO_BUSINESS_UNIT = `
  mutation MoveTeamToBusinessUnit($id: String!, $businessUnitId: String!) {
    moveTeamToBusinessUnit(id: $id, businessUnitId: $businessUnitId) {
      ${TEAM_FIELDS}
    }
  }
`;

/** Soft-delete a team. Answers with a boolean. */
export const DELETE_TEAM = `
  mutation DeleteTeam($id: String!) {
    deleteTeam(id: $id)
  }
`;

/** Add a user to a team. Answers with a boolean. */
export const ADD_TEAM_MEMBER = `
  mutation AddTeamMember($id: String!, $memberId: String!) {
    addMemberToTeam(id: $id, memberId: $memberId)
  }
`;

/** Remove a user from a team. Answers with a boolean. */
export const REMOVE_TEAM_MEMBER = `
  mutation RemoveTeamMember($id: String!, $memberId: String!) {
    removeMemberFromTeam(id: $id, memberId: $memberId)
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
  organizationDemographicValues: 'OrganizationDemographicValues',
  organizationSaveDemographicDefinition: 'OrganizationSaveDemographicDefinition',
  organizationDeleteDemographicDefinition: 'OrganizationDeleteDemographicDefinition',
  organizationReorderDemographicDefinitions: 'OrganizationReorderDemographicDefinitions',
  organizationSetDemographicEnabled: 'OrganizationSetDemographicEnabled',
  organizationBranding: 'OrganizationBranding',
  organizationThemeCss: 'OrganizationThemeCss',
  organizationSaveTheme: 'OrganizationSaveTheme',
  organizationSetActiveTheme: 'OrganizationSetActiveTheme',
  organizationDeleteTheme: 'OrganizationDeleteTheme',
  organizationPublishThemeCss: 'OrganizationPublishThemeCss',
  organizationUploadImage: 'OrganizationUploadImage',
  organizationStructureBusinessUnits: 'OrganizationStructureBusinessUnits',
  organizationStructureTeams: 'OrganizationStructureTeams',
  createBusinessUnit: 'createBusinessUnit',
  updateBusinessUnit: 'updateBusinessUnit',
  deleteBusinessUnit: 'deleteBusinessUnit',
  restoreBusinessUnit: 'restoreBusinessUnit',
  addBusinessUnitMember: 'addMemberToBusinessUnit',
  removeBusinessUnitMember: 'removeMemberFromBusinessUnit',
  createTeam: 'createTeam',
  updateTeam: 'updateTeam',
  moveTeamToBusinessUnit: 'moveTeamToBusinessUnit',
  deleteTeam: 'deleteTeam',
  addTeamMember: 'addMemberToTeam',
  removeTeamMember: 'removeMemberFromTeam',
} as const;
