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
} as const;
