import type { DemographicDefinition } from '../../demographic-form';
import type {
  Organization,
  OrganizationBusinessUnit,
  OrganizationDemographicAggregateReport,
  OrganizationDemographicValue,
  OrganizationMember,
  OrganizationStatistics,
  OrganizationTeam,
  OrganizationTheme,
} from '../types';

/**
 * Test fixtures and a stubbed Reactory SDK for the organization management
 * suites.
 *
 * Not named `*.test.*`, so Jest's `testMatch` does not run it as a suite.
 */

/** Read the operation name from a raw string or a DocumentNode. */
export const operationNameOf = (document: any): string => {
  if (typeof document === 'string') {
    const match = /(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(document);
    return match ? match[1] : '';
  }

  const definition = (document?.definitions || []).find(
    (entry: any) => entry?.kind === 'OperationDefinition',
  );
  return definition?.name?.value || '';
};

export const makeOrganization = (overrides: Partial<Organization> = {}): Organization => ({
  id: 'org-1',
  name: 'Acme Holdings',
  code: 'ACME',
  tradingName: 'Acme Trading (Pty) Ltd',
  legalName: 'Acme Holdings (Pty) Ltd',
  description: 'A holding company.',
  website: 'https://acme.example',
  contactEmail: 'hello@acme.example',
  contactPhone: '+27 11 555 0100',
  status: 'active',
  logo: null,
  logoURL: null,
  avatar: null,
  avatarURL: null,
  theme: 'Acme Theme',
  themeMode: 'dark',
  public: false,
  businessUnits: [{ id: 'bu-1' }, { id: 'bu-2' }],
  createdAt: '2026-01-05T09:00:00.000Z',
  updatedAt: '2026-08-14T10:00:00.000Z',
  ...overrides,
});

export const activeOrganizations = (): Organization[] => [
  makeOrganization(),
  makeOrganization({
    id: 'org-2',
    name: 'Beta Industries',
    code: 'BETA',
    tradingName: null,
    status: 'active',
    theme: null,
    businessUnits: [{ id: 'bu-3' }],
    updatedAt: '2026-09-02T08:30:00.000Z',
  }),
];

/** Generate `count` distinct active organizations, named so sorting is stable. */
export const manyOrganizations = (count: number): Organization[] =>
  Array.from({ length: count }, (_unused, index) => {
    const ordinal = index + 1;
    const suffix = `${ordinal}`.padStart(2, '0');
    return makeOrganization({
      id: `org-${ordinal}`,
      name: `Organization ${suffix}`,
      code: `ORG${suffix}`,
      tradingName: `Organization ${suffix} Trading`,
      businessUnits: [{ id: `bu-${ordinal}-a` }, { id: `bu-${ordinal}-b` }],
      updatedAt: `2026-08-${suffix}T10:00:00.000Z`,
    });
  });

/**
 * A valid `ApplicationTheme` record, shaped like the ones the server returns
 * for `Organization.themes` (see the shared theme editor's `IThemeRecord`).
 */
export const makeTheme = (overrides: Partial<OrganizationTheme> = {}): OrganizationTheme => ({
  id: 'theme-1',
  nameSpace: 'reactory',
  name: 'Acme Theme',
  version: '1.0.0',
  type: 'material',
  defaultThemeMode: 'dark',
  description: 'Acme brand theme',
  options: { palette: { mode: 'dark' } },
  modes: [
    {
      id: 'dark',
      mode: 'dark',
      name: 'Dark Mode',
      description: '',
      icon: 'night',
      options: { palette: { mode: 'dark' } },
    },
    {
      id: 'light',
      mode: 'light',
      name: 'Light Mode',
      description: '',
      icon: 'day',
      options: { palette: { mode: 'light' } },
    },
  ],
  assets: [],
  content: { appTitle: 'Acme' },
  ...overrides,
});

export const statisticsFor = (
  overrides: Partial<OrganizationStatistics> = {},
): OrganizationStatistics => ({
  members: 12,
  businessUnits: 2,
  teams: 3,
  ...overrides,
});

/** A `User` reference in the shape the structure queries select. */
export const makeUserRef = (
  id: string,
  firstName = 'Ada',
  lastName = 'Lovelace',
): { id: string; firstName: string; lastName: string; email: string } => ({
  id,
  firstName,
  lastName,
  email: `${firstName}.${lastName}@example.com`.toLowerCase(),
});

/**
 * A business unit as `pagedBusinessUnits` returns it.
 *
 * `deleted` is the soft-delete flag the "show deleted" filter acts on, so the
 * fixture defaults to a live unit and tests opt into a deleted one explicitly.
 */
export const makeBusinessUnit = (
  overrides: Partial<OrganizationBusinessUnit> = {},
): OrganizationBusinessUnit => ({
  id: 'bu-1',
  name: 'Engineering',
  description: 'Builds and runs the platform.',
  avatar: null,
  deleted: false,
  organization: { id: 'org-1' },
  owner: makeUserRef('user-owner-1', 'Grace', 'Hopper'),
  members: [makeUserRef('user-member-1', 'Alan', 'Turing')],
  ...overrides,
});

/** A team as `pagedTeams` returns it, linked to `bu-1` unless overridden. */
export const makeTeam = (overrides: Partial<OrganizationTeam> = {}): OrganizationTeam => ({
  id: 'team-1',
  name: 'Platform',
  title: 'Platform',
  description: 'Core platform squad.',
  avatar: null,
  deleted: false,
  organization: { id: 'org-1' },
  businessUnit: { id: 'bu-1', name: 'Engineering' },
  owner: makeUserRef('user-owner-2', 'Katherine', 'Johnson'),
  members: [makeUserRef('user-member-2', 'Margaret', 'Hamilton')],
  ...overrides,
});

/**
 * A two-unit hierarchy with one nested team, one empty unit and one team that
 * belongs to no unit — the three shapes the Structure tab must distinguish.
 */
export const structureFixtures = () => ({
  businessUnits: [
    makeBusinessUnit({ id: 'bu-1', name: 'Engineering' }),
    makeBusinessUnit({ id: 'bu-2', name: 'Operations', description: null, members: [] }),
  ],
  teams: [
    makeTeam({ id: 'team-1', name: 'Platform' }),
    makeTeam({
      id: 'team-2',
      name: 'Field Ops',
      title: 'Field Ops',
      businessUnit: null,
    }),
  ],
});

/**
 * A member row as `OrganizationMembers` returns it (ORG-024).
 *
 * Defaults to an active organization administrator in `bu-1` who belongs to two
 * teams, so the table's multi-team column has something to render.
 * `businessUnitId` / `teams` are read-only on this shape: the server derives
 * them from the membership and from `Team.members`.
 */
export const makeOrganizationMember = (
  overrides: Partial<OrganizationMember> = {},
): OrganizationMember => ({
  id: 'member-1',
  userId: 'user-1',
  user: { id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  avatar: null,
  roles: ['ORGANIZATION_ADMIN', 'USER'],
  enabled: true,
  status: 'active',
  businessUnitId: 'bu-1',
  businessUnit: { id: 'bu-1', name: 'Engineering' },
  teamIds: ['team-1', 'team-2'],
  teams: [
    { id: 'team-1', name: 'Platform', title: 'Platform' },
    { id: 'team-2', name: 'Field Ops', title: 'Field Ops' },
  ],
  created: '2026-02-01T08:00:00.000Z',
  lastLogin: '2026-10-19T06:15:00.000Z',
  authProvider: 'local',
  invited: false,
  ...overrides,
});

/**
 * The four member shapes the People tab must distinguish: an active member with
 * a unit and two teams, a member with no unit and one team, a deactivated
 * member, and a pending invitation.
 */
export const organizationMemberFixtures = (): OrganizationMember[] => [
  makeOrganizationMember({ id: 'member-1', userId: 'user-1' }),
  makeOrganizationMember({
    id: 'member-2',
    userId: 'user-2',
    user: { id: 'user-2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' },
    email: 'grace@example.com',
    firstName: 'Grace',
    lastName: 'Hopper',
    roles: ['USER'],
    businessUnitId: null,
    businessUnit: null,
    teamIds: ['team-2'],
    teams: [{ id: 'team-2', name: 'Field Ops', title: 'Field Ops' }],
    lastLogin: null,
  }),
  makeOrganizationMember({
    id: 'member-3',
    userId: 'user-3',
    user: { id: 'user-3', firstName: 'Alan', lastName: 'Turing', email: 'alan@example.com' },
    email: 'alan@example.com',
    firstName: 'Alan',
    lastName: 'Turing',
    roles: ['USER'],
    enabled: false,
    status: 'deactivated',
    businessUnitId: 'bu-2',
    businessUnit: { id: 'bu-2', name: 'Operations' },
    teamIds: [],
    teams: [],
    lastLogin: '2026-05-02T10:00:00.000Z',
  }),
  makeOrganizationMember({
    id: 'invite-1',
    userId: null,
    user: null,
    email: 'pending@example.com',
    firstName: null,
    lastName: null,
    roles: ['USER'],
    enabled: false,
    status: 'invited',
    businessUnitId: null,
    businessUnit: null,
    teamIds: [],
    teams: [],
    created: '2026-10-18T12:00:00.000Z',
    lastLogin: null,
    authProvider: 'invitation',
    invited: true,
  }),
];

/** Generate `count` active members named so paging is stable. */
export const manyOrganizationMembers = (count: number): OrganizationMember[] =>
  Array.from({ length: count }, (_unused, index) => {
    const ordinal = index + 1;
    const suffix = `${ordinal}`.padStart(2, '0');
    return makeOrganizationMember({
      id: `member-${suffix}`,
      userId: `user-${suffix}`,
      user: {
        id: `user-${suffix}`,
        firstName: 'Member',
        lastName: suffix,
        email: `member.${suffix}@example.com`,
      },
      email: `member.${suffix}@example.com`,
      firstName: 'Member',
      lastName: suffix,
      roles: ['USER'],
      businessUnitId: null,
      businessUnit: null,
      teamIds: [],
      teams: [],
      lastLogin: null,
    });
  });

/**
 * One demographic definition, shaped like a seeded ORG-030 base definition
 * (`system: true`) unless overridden.
 */
export const makeDemographicDefinition = (
  overrides: Partial<DemographicDefinition> = {},
): DemographicDefinition => ({
  id: 'def-1',
  organization: 'org-1',
  key: 'gender',
  title: 'Gender',
  description: 'How the member identifies.',
  icon: null,
  category: 'personal',
  valueType: 'enum',
  schema: null,
  options: [
    { key: 'female', label: 'Female', ordinal: 0, deprecated: false },
    { key: 'male', label: 'Male', ordinal: 1, deprecated: false },
  ],
  reference: null,
  widget: null,
  required: false,
  multiValued: false,
  sensitive: false,
  searchable: true,
  enabled: true,
  ordinal: 0,
  roles: [],
  system: true,
  deleted: false,
  ...overrides,
});

/**
 * A small base set plus one custom definition, in ordinal order.
 *
 * Three shapes are deliberate: an `enum` (options editor), a `date` (no
 * options), and a custom `reference` (the reference picker, and the one row that
 * may be edited or deleted freely).
 */
export const baseDemographicDefinitions = (): DemographicDefinition[] => [
  makeDemographicDefinition(),
  makeDemographicDefinition({
    id: 'def-2',
    key: 'dateofbirth',
    title: 'Date of birth',
    description: null,
    category: 'personal',
    valueType: 'date',
    options: [],
    sensitive: true,
    searchable: false,
    ordinal: 1,
  }),
  makeDemographicDefinition({
    id: 'def-3',
    key: 'team',
    title: 'Team',
    description: 'The team the member belongs to.',
    category: 'organizational',
    valueType: 'reference',
    options: [],
    reference: { model: 'Team', multiple: false },
    ordinal: 2,
  }),
  makeDemographicDefinition({
    id: 'def-4',
    key: 'shirtsize',
    title: 'Shirt size',
    description: 'Used for uniform orders.',
    category: 'employment',
    valueType: 'string',
    options: [],
    system: false,
    searchable: false,
    ordinal: 3,
  }),
];

/**
 * One stored demographic value (ORG-033).
 *
 * Defaults to an administratively-written `gender` value for `user-1`. The
 * values pane resolves the display name from `options.members`, so a fixture
 * without a matching member still renders — as the id.
 */
export const makeDemographicValue = (
  overrides: Partial<OrganizationDemographicValue> = {},
): OrganizationDemographicValue => ({
  id: 'value-1',
  organization: 'org-1',
  user: 'user-1',
  membership: null,
  definition: 'def-1',
  key: 'gender',
  value: 'female',
  valueType: 'enum',
  source: 'user',
  verified: false,
  effectiveFrom: null,
  effectiveTo: null,
  updatedBy: 'user-1',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-02T08:00:00.000Z',
  ...overrides,
});

/**
 * The value shapes the table must distinguish: two single-valued rows for the
 * same member, a multi-valued row, and a row whose source is an import.
 */
export const demographicValueFixtures = (): OrganizationDemographicValue[] => [
  makeDemographicValue({ id: 'value-1', user: 'user-1', key: 'gender', value: 'female' }),
  makeDemographicValue({
    id: 'value-2',
    user: 'user-2',
    key: 'dateofbirth',
    definition: 'def-2',
    value: '1990-04-12',
    valueType: 'date',
    source: 'admin',
    verified: true,
  }),
  makeDemographicValue({
    id: 'value-3',
    user: 'user-1',
    key: 'language',
    definition: 'def-5',
    value: ['English', 'French'],
    valueType: 'multi-enum',
    source: 'import',
  }),
];

/**
 * A `DemographicAggregateReport` with one reported and one withheld definition,
 * which is the shape the completeness summary has to explain.
 */
export const makeDemographicAggregateReport = (
  overrides: Partial<OrganizationDemographicAggregateReport> = {},
): OrganizationDemographicAggregateReport => ({
  organization: 'org-1',
  minimumAggregationGroupSize: 5,
  filter: {
    businessUnit: null,
    team: null,
    region: null,
    effectiveFrom: null,
    effectiveTo: null,
    definitionKeys: ['gender', 'dateofbirth'],
    cohortRestricted: false,
  },
  definitions: [
    {
      definitionKey: 'gender',
      title: 'Gender',
      category: 'personal',
      valueType: 'enum',
      multiValued: false,
      sensitive: false,
      suppressed: false,
      suppressedCohorts: 1,
      cohortTotal: 12,
      percentageDenominator: 12,
      denominatorKind: 'respondents',
      buckets: [
        { key: 'female', label: 'Female', count: 7, percentage: 58.33 },
        { key: 'male', label: 'Male', count: 5, percentage: 41.67 },
      ],
    },
    {
      definitionKey: 'dateofbirth',
      title: 'Date of birth',
      category: 'personal',
      valueType: 'date',
      multiValued: false,
      sensitive: true,
      suppressed: true,
      suppressedCohorts: null,
      cohortTotal: 0,
      percentageDenominator: 0,
      denominatorKind: 'respondents',
      buckets: [],
    },
  ],
  reportedDefinitions: 1,
  suppressedDefinitions: 1,
  ...overrides,
});

export interface ReactoryStubOptions {
  /** Mutable array: create/archive mutations update it so a refresh reflects them. */
  organizations?: Organization[];
  statistics?: Record<string, Partial<OrganizationStatistics>>;
  /** Return a value to override the default handler for an operation. */
  queryImpl?: (operation: string, variables: any, callIndex: number) => any;
  mutationImpl?: (operation: string, variables: any, callIndex: number) => any;
  /** Resolve query promises manually (used to assert the loading state). */
  hangOrganizations?: boolean;
  /** Published `styles.css` per theme name, for `OrganizationThemeCss`. */
  themeCss?: Record<string, string>;
  /**
   * Definitions the Demographics pane reads (ORG-031), mutated in place so a
   * post-write `refreshDefinitions()` observes the change.
   *
   * Omitted keeps the pre-ORG-030 behaviour the create-wizard tests assert:
   * `OrganizationDemographicDefinitions` answers with a schema-level rejection.
   */
  demographicDefinitions?: DemographicDefinition[];
  /**
   * Stored-value counts per definition key.
   *
   * `OrganizationDemographicValues` reports these as `paging.total`, and a
   * non-zero count makes the delete mutation refuse, exactly as the server does.
   */
  demographicValueCounts?: Record<string, number>;
  /**
   * Stored values the values pane (ORG-033) reads and mutates.
   *
   * Omitted preserves the ORG-031 behaviour: `OrganizationDemographicValues`
   * answers with an empty page whose `paging.total` comes from
   * `demographicValueCounts`, which is all the configuration pane needs.
   */
  demographicValues?: OrganizationDemographicValue[];
  /** Aggregate report the completeness summary reads; a neutral one otherwise. */
  demographicAggregates?: OrganizationDemographicAggregateReport;
  i18n?: any;
  /**
   * Platform roles the caller holds (`loggedIn.roles`). Matched against what
   * `hasRole` is asked for, with any overlap granting.
   *
   * Omitted means "every role", which is what the admin-path tests want. Pass
   * `['USER']` to exercise the read-only rendering.
   */
  roles?: string[];
  /**
   * `loggedIn.memberships`, in the SDK's shape. These are the roles an
   * ORGANIZATION_ADMIN normally holds (written by `addMember` / `setMemberRoles`
   * into the membership, never into `user.roles`), so a permission check that
   * omits the organization cannot see them.
   */
  memberships?: Array<{
    organization?: { id: string } | null;
    organizationId?: string;
    businessUnit?: { id: string } | null;
    businessUnitId?: string;
    roles: string[];
    enabled?: boolean;
  }>;
  /** Business units the structure queries return (mutated in place by writes). */
  businessUnits?: OrganizationBusinessUnit[];
  /** Teams the structure queries return (mutated in place by writes). */
  teams?: OrganizationTeam[];
  /**
   * Member rows the People query returns (mutated in place by writes), so a
   * post-write `refreshMembers()` observes the new roles/state.
   */
  members?: OrganizationMember[];
}

/**
 * A stubbed Reactory SDK.
 *
 * Mutation/query handlers dispatch on the GraphQL operation name, which is the
 * boundary the hooks actually talk to. `createOrganization` pushes into the
 * shared array so a post-create `refresh()` observes the new record — the same
 * sequence the real screen performs.
 */
export const makeReactory = (options: ReactoryStubOptions = {}) => {
  const state: Organization[] = options.organizations || [];
  const businessUnits: OrganizationBusinessUnit[] = options.businessUnits || [];
  const teams: OrganizationTeam[] = options.teams || [];
  const memberRows: OrganizationMember[] = options.members || [];
  const statistics = options.statistics || {};
  const platformRoles = options.roles || ['ADMIN', 'ORGANIZATION_ADMIN', 'USER', 'SYSTEM'];
  const memberships = (options.memberships || []).map((membership) => ({
    ...membership,
    businessUnit: membership.businessUnit === undefined ? null : membership.businessUnit,
    enabled: membership.enabled === undefined ? true : membership.enabled,
  }));

  let queryCalls = 0;
  let mutationCalls = 0;

  const graphqlQuery = jest.fn((document: any, variables: any) => {
    const operation = operationNameOf(document);
    const callIndex = queryCalls;
    queryCalls += 1;

    if (options.queryImpl) {
      const override = options.queryImpl(operation, variables, callIndex);
      if (override !== undefined) return Promise.resolve(override);
    }

    if (operation === 'CoreOrganizations') {
      if (options.hangOrganizations) return new Promise(() => {});
      return Promise.resolve({ data: { CoreOrganizations: [...state] }, errors: [] });
    }

    if (operation === 'CoreOrganization') {
      const found = state.find((entry) => entry.id === variables?.id) || null;
      return Promise.resolve({ data: { CoreOrganization: found }, errors: [] });
    }

    if (operation === 'OrganizationStatistics') {
      const values = statistics[variables?.id];
      return Promise.resolve({
        data: {
          OrganizationStatistics: {
            members: values?.members ?? 7,
            businessUnits: values?.businessUnits ?? 2,
            teams: values?.teams ?? 1,
          },
        },
        errors: [],
      });
    }

    if (operation === 'OrganizationBranding') {
      const found = state.find((entry) => entry.id === variables?.id) || null;
      return Promise.resolve({
        data: {
          OrganizationBranding: found
            ? { ...found, themes: Array.isArray(found.themes) ? [...found.themes] : [] }
            : null,
        },
        errors: [],
      });
    }

    if (operation === 'OrganizationThemeCss') {
      const published = (options.themeCss || {})[variables?.themeName];
      return Promise.resolve({
        data: { OrganizationThemeCss: typeof published === 'string' ? published : '' },
        errors: [],
      });
    }

    if (operation === 'OrganizationDemographicDefinitions') {
      if (!options.demographicDefinitions) {
        // No fixture supplied: this is the shape a schema without ORG-030 returns.
        return Promise.resolve({
          data: null,
          errors: [
            {
              message:
                'Cannot query field "OrganizationDemographicDefinitions" on type "Query".',
            },
          ],
        });
      }

      const includeDisabled = variables?.includeDisabled === true;
      const definitions = options.demographicDefinitions.filter(
        (definition) => includeDisabled || definition.enabled !== false,
      );

      return Promise.resolve({
        data: { OrganizationDemographicDefinitions: definitions.map((entry) => ({ ...entry })) },
        errors: [],
      });
    }

    if (operation === 'OrganizationDemographicValues') {
      const filter = variables?.filter || {};
      const page = Number(variables?.paging?.page) > 0 ? Number(variables.paging.page) : 1;
      const pageSize =
        Number(variables?.paging?.pageSize) > 0 ? Number(variables.paging.pageSize) : 25;

      // The configuration pane only asks for `paging.total` (one single-row page
      // per definition); the values pane reads the rows themselves. Both are
      // served here, so the same document behaves the same way in both places.
      const source = options.demographicValues || [];

      const rows = source.filter((value) => {
        if (filter.user && `${value.user || ''}` !== `${filter.user}`) return false;
        if (filter.key && `${value.key || ''}` !== `${filter.key}`) return false;
        if (filter.definition && `${value.definition || ''}` !== `${filter.definition}`) return false;
        if (filter.source && `${value.source || ''}` !== `${filter.source}`) return false;
        if (
          filter.verified !== undefined &&
          filter.verified !== null &&
          (value.verified === true) !== (filter.verified === true)
        ) {
          return false;
        }
        return true;
      });

      const total = options.demographicValues
        ? rows.length
        : Number((options.demographicValueCounts || {})[filter.key] || 0);

      const start = (page - 1) * pageSize;

      return Promise.resolve({
        data: {
          OrganizationDemographicValues: {
            values: options.demographicValues
              ? rows.slice(start, start + pageSize).map((value) => ({ ...value }))
              : [],
            paging: { page, pageSize, total, hasNext: page * pageSize < total },
          },
        },
        errors: [],
      });
    }

    if (operation === 'OrganizationDemographicAggregates') {
      const report = (options.demographicAggregates || {
        organization: variables?.organizationId || 'org-1',
        minimumAggregationGroupSize: 5,
        filter: {
          businessUnit: null,
          team: null,
          region: null,
          effectiveFrom: null,
          effectiveTo: null,
          definitionKeys: Array.isArray(variables?.definitionKeys)
            ? [...variables.definitionKeys]
            : [],
          cohortRestricted: false,
        },
        definitions: [],
        reportedDefinitions: 0,
        suppressedDefinitions: 0,
      }) as OrganizationDemographicAggregateReport;

      return Promise.resolve({
        data: { OrganizationDemographicAggregates: report },
        errors: [],
      });
    }

    // ---- Organization structure (ORG-022) ----
    if (operation === 'OrganizationStructureBusinessUnits') {
      // The server excludes soft-deleted units unless `includeDeleted` is set;
      // the stub applies the same rule so the "show deleted" toggle is
      // observable in the rendered tree.
      const includeDeleted = variables?.includeDeleted === true;
      const visible = businessUnits.filter(
        (unit) => includeDeleted || unit.deleted !== true,
      );

      return Promise.resolve({
        data: {
          OrganizationStructureBusinessUnits: {
            businessUnits: visible.map((unit) => ({ ...unit })),
            paging: {
              page: 1,
              pageSize: 500,
              total: visible.length,
              hasNext: false,
            },
          },
        },
        errors: [],
      });
    }

    if (operation === 'OrganizationStructureTeams') {
      const visible = teams.filter((team) => team.deleted !== true);
      return Promise.resolve({
        data: {
          OrganizationStructureTeams: {
            teams: visible.map((team) => ({ ...team })),
            paging: {
              page: 1,
              pageSize: 500,
              total: visible.length,
              hasNext: false,
            },
          },
        },
        errors: [],
      });
    }

    // ---- Organization members (ORG-024) ----
    if (operation === 'OrganizationMembers') {
      const filter = variables?.filter || {};
      const page = Number(variables?.paging?.page) > 0 ? Number(variables.paging.page) : 1;
      const pageSize =
        Number(variables?.paging?.pageSize) > 0 ? Number(variables.paging.pageSize) : 25;

      const rowStatus = (row: OrganizationMember): string =>
        row.invited === true
          ? 'invited'
          : `${row.status || (row.enabled === false ? 'deactivated' : 'active')}`;

      const search = `${filter.search || ''}`.trim().toLowerCase();
      const status = `${filter.status || ''}`.trim().toLowerCase();

      const rows = memberRows.filter((row) => {
        const current = rowStatus(row);

        // Mirrors the service: `invited` switches to the invitation collection,
        // `deactivated` / `enabled: false` selects disabled memberships, and by
        // default active members are returned (`includeDeactivated` widens it).
        if (status === 'invited') {
          if (current !== 'invited') return false;
        } else if (status === 'deactivated' || filter.deactivatedOnly === true || filter.enabled === false) {
          if (current !== 'deactivated') return false;
        } else if (filter.enabled === true) {
          if (current !== 'active') return false;
        } else {
          if (current === 'invited') return false;
          if (filter.includeDeactivated !== true && current !== 'active') return false;
        }

        if (search.length > 0) {
          const haystack = `${row.firstName || ''} ${row.lastName || ''} ${row.email || ''}`.toLowerCase();
          if (haystack.indexOf(search) < 0) return false;
        }

        if (filter.role && !(row.roles || []).some((role) => `${role}` === `${filter.role}`)) {
          return false;
        }

        if (filter.businessUnitId && `${row.businessUnitId || ''}` !== `${filter.businessUnitId}`) {
          return false;
        }

        if (filter.teamId && !(row.teamIds || []).some((id) => `${id}` === `${filter.teamId}`)) {
          return false;
        }

        return true;
      });

      const total = rows.length;
      const start = (page - 1) * pageSize;

      return Promise.resolve({
        data: {
          OrganizationMembers: {
            members: rows.slice(start, start + pageSize).map((row) => ({ ...row })),
            paging: { page, pageSize, total, hasNext: page * pageSize < total },
          },
        },
        errors: [],
      });
    }

    return Promise.resolve({
      data: null,
      errors: [{ message: `Unhandled query: ${operation}` }],
    });
  });

  const graphqlMutation = jest.fn((document: any, variables: any) => {
    const operation = operationNameOf(document);
    const callIndex = mutationCalls;
    mutationCalls += 1;

    if (options.mutationImpl) {
      const override = options.mutationImpl(operation, variables, callIndex);
      if (override !== undefined) return Promise.resolve(override);
    }

    if (operation === 'createOrganization') {
      const created = makeOrganization({
        id: `org-created-${state.length + 1}`,
        name: variables?.input?.name,
        code: variables?.input?.code || null,
        tradingName: null,
        description: null,
        theme: null,
        businessUnits: [],
        status: 'active',
      });
      state.push(created);
      return Promise.resolve({ data: { createOrganization: created }, errors: [] });
    }

    if (operation === 'updateOrganization') {
      const index = state.findIndex((entry) => entry.id === variables?.id);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Organization not found' }] });
      }
      const updated = { ...state[index], ...(variables?.input || {}) };
      state[index] = updated;
      return Promise.resolve({ data: { updateOrganization: updated }, errors: [] });
    }

    if (operation === 'archiveOrganization' || operation === 'restoreOrganization') {
      const index = state.findIndex((entry) => entry.id === variables?.id);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Organization not found' }] });
      }
      const status = operation === 'archiveOrganization' ? 'archived' : 'active';
      const updated = { ...state[index], status };
      state[index] = updated;
      return Promise.resolve({ data: { [operation]: updated }, errors: [] });
    }

    if (operation === 'OrganizationSaveTheme') {
      const index = state.findIndex((entry) => entry.id === variables?.id);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Organization not found' }] });
      }

      const incoming = variables?.theme || {};
      const themes = Array.isArray(state[index].themes) ? [...state[index].themes!] : [];
      const existing = themes.findIndex((theme) => theme.name === incoming.name);
      if (existing >= 0) themes[existing] = { ...themes[existing], ...incoming };
      else themes.push({ ...incoming });

      const updated = { ...state[index], themes };
      state[index] = updated;
      return Promise.resolve({ data: { OrganizationSaveTheme: updated }, errors: [] });
    }

    if (operation === 'OrganizationSetActiveTheme') {
      const index = state.findIndex((entry) => entry.id === variables?.id);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Organization not found' }] });
      }

      const updated = {
        ...state[index],
        theme: variables?.themeName,
        themeMode: variables?.mode || state[index].themeMode || 'dark',
      };
      state[index] = updated;
      return Promise.resolve({ data: { OrganizationSetActiveTheme: updated }, errors: [] });
    }

    if (operation === 'OrganizationDeleteTheme') {
      const index = state.findIndex((entry) => entry.id === variables?.id);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Organization not found' }] });
      }

      const current = state[index];
      const themes = (Array.isArray(current.themes) ? current.themes : []).filter(
        (theme) => theme.name !== variables?.themeName,
      );

      // Mirrors the server's deterministic fallback: the first remaining theme
      // becomes active, or the pointer is cleared when none remain.
      const theme =
        current.theme === variables?.themeName
          ? themes[0]?.name || null
          : current.theme || null;

      const updated = {
        ...current,
        themes,
        theme,
        themeMode: theme ? current.themeMode || 'dark' : null,
      };
      state[index] = updated;
      return Promise.resolve({ data: { OrganizationDeleteTheme: updated }, errors: [] });
    }

    if (operation === 'OrganizationUploadImage') {
      const index = state.findIndex((entry) => entry.id === variables?.id);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Organization not found' }] });
      }

      const imageType = variables?.imageType === 'avatar' ? 'avatar' : 'logo';
      const alias = `uploaded-${imageType}`;
      const updated = {
        ...state[index],
        [imageType]: alias,
        [`${imageType}URL`]: `https://cdn.example/${alias}`,
      };
      state[index] = updated;
      return Promise.resolve({ data: { OrganizationUploadImage: updated }, errors: [] });
    }

    if (operation === 'OrganizationPublishThemeCss') {
      return Promise.resolve({ data: { OrganizationPublishThemeCss: true }, errors: [] });
    }

    if (operation === 'OrganizationSaveDemographicDefinition') {
      const list = options.demographicDefinitions;
      if (!list) {
        return Promise.resolve({
          data: null,
          errors: [{ message: 'Demographics are not available in this environment.' }],
        });
      }

      const input = variables?.definition || {};
      const index = input.id
        ? list.findIndex((entry) => entry.id === input.id)
        : list.findIndex((entry) => entry.key === input.key);

      if (index < 0) {
        if (!input.key) {
          return Promise.resolve({ data: null, errors: [{ message: 'A key is required' }] });
        }

        const created: DemographicDefinition = {
          id: `def-new-${list.length + 1}`,
          organization: 'org-1',
          key: input.key,
          title: input.title || input.key,
          description: input.description ?? null,
          icon: input.icon ?? null,
          category: input.category ?? 'personal',
          valueType: input.valueType || 'string',
          schema: input.schema ?? null,
          options: input.options ?? [],
          reference: input.reference ?? null,
          widget: input.widget ?? null,
          required: input.required === true,
          multiValued: input.multiValued === true,
          sensitive: input.sensitive === true,
          searchable: input.searchable === true,
          enabled: input.enabled !== false,
          ordinal: Number(input.ordinal || 0),
          roles: input.roles || [],
          system: input.system === true,
          deleted: false,
        };

        list.push(created);
        return Promise.resolve({
          data: { OrganizationSaveDemographicDefinition: { ...created } },
          errors: [],
        });
      }

      const existing = list[index];

      // Mirrors the server's frozen value type for a seeded definition.
      if (
        existing.system === true &&
        input.valueType !== undefined &&
        input.valueType !== existing.valueType
      ) {
        return Promise.resolve({
          data: null,
          errors: [
            {
              message: `System demographic definition [${existing.key}] cannot change its value type from [${existing.valueType}] to [${input.valueType}]`,
            },
          ],
        });
      }

      // The server ignores `key` on update; the key is never reassigned here.
      const { key: _ignoredKey, ...patch } = input;
      const updated = { ...existing, ...patch } as DemographicDefinition;
      list[index] = updated;

      return Promise.resolve({
        data: { OrganizationSaveDemographicDefinition: { ...updated } },
        errors: [],
      });
    }

    if (operation === 'OrganizationSetDemographicEnabled') {
      const list = options.demographicDefinitions || [];
      const index = list.findIndex((entry) => entry.key === variables?.key);
      if (index < 0) {
        return Promise.resolve({
          data: null,
          errors: [{ message: `Demographic definition [${variables?.key}] not found` }],
        });
      }

      const updated = { ...list[index], enabled: variables?.enabled === true };
      list[index] = updated;
      return Promise.resolve({
        data: { OrganizationSetDemographicEnabled: { ...updated } },
        errors: [],
      });
    }

    if (operation === 'OrganizationReorderDemographicDefinitions') {
      const list = options.demographicDefinitions || [];
      const keys: string[] = Array.isArray(variables?.keys) ? variables.keys : [];

      const ordered = keys.map((key, ordinal) => {
        const index = list.findIndex((entry) => entry.key === key);
        if (index < 0) return null;
        list[index] = { ...list[index], ordinal };
        return { ...list[index] };
      });

      if (ordered.some((entry) => entry === null)) {
        return Promise.resolve({
          data: null,
          errors: [{ message: 'Demographic definition(s) not found' }],
        });
      }

      return Promise.resolve({
        data: { OrganizationReorderDemographicDefinitions: ordered },
        errors: [],
      });
    }

    if (operation === 'OrganizationDeleteDemographicDefinition') {
      const list = options.demographicDefinitions || [];
      const key = variables?.key;
      const index = list.findIndex((entry) => entry.key === key);

      if (index < 0) {
        return Promise.resolve({
          data: null,
          errors: [{ message: `Demographic definition [${key}] not found` }],
        });
      }

      const references = Number((options.demographicValueCounts || {})[key] || 0);
      if (references > 0) {
        // The refusal the pane must surface instead of removing the row.
        return Promise.resolve({
          data: null,
          errors: [
            {
              message: `Demographic definition [${key}] cannot be deleted because ${references} value(s) still reference it. Disable the definition instead.`,
            },
          ],
        });
      }

      list.splice(index, 1);
      return Promise.resolve({
        data: { OrganizationDeleteDemographicDefinition: true },
        errors: [],
      });
    }

    // ---- Demographic values (ORG-033) ----
    const saveValueRecord = (input: any): OrganizationDemographicValue => {
      const list = options.demographicValues;
      const definitions = options.demographicDefinitions || [];
      const definition = definitions.find((entry) => entry.key === input?.key) || null;
      const index = list
        ? list.findIndex(
            (entry) =>
              `${entry.user || ''}` === `${input?.user || ''}` && entry.key === input?.key,
          )
        : -1;
      const existing = index >= 0 && list ? list[index] : null;

      const saved: OrganizationDemographicValue = {
        ...makeDemographicValue({
          id: `value-${(list || []).length + 1}`,
          user: `${input?.user || ''}`,
          key: `${input?.key || ''}`,
        }),
        ...(existing || {}),
        ...(input || {}),
        organization: existing?.organization || 'org-1',
        definition: input?.definition || definition?.id || existing?.definition || null,
        // The server snapshots the definition's type at write time.
        valueType: definition?.valueType || existing?.valueType || null,
        updatedAt: '2026-10-23T09:00:00.000Z',
      };

      if (list) {
        if (index >= 0) list[index] = saved;
        else list.push(saved);
      }

      return saved;
    };

    if (operation === 'OrganizationSaveDemographicValue') {
      const input = variables?.value || {};
      if (!input.user) {
        return Promise.resolve({
          data: null,
          errors: [
            {
              message: 'Invalid value for demographic',
              extensions: { fields: [{ path: 'user', message: 'A user is required' }] },
            },
          ],
        });
      }

      const saved = saveValueRecord(input);
      return Promise.resolve({
        data: { OrganizationSaveDemographicValue: { ...saved } },
        errors: [],
      });
    }

    if (operation === 'OrganizationBulkSaveDemographicValues') {
      const inputs: any[] = Array.isArray(variables?.values) ? variables.values : [];
      const saved = inputs.map((input) => saveValueRecord(input));
      return Promise.resolve({
        data: { OrganizationBulkSaveDemographicValues: saved.map((entry) => ({ ...entry })) },
        errors: [],
      });
    }

    if (operation === 'OrganizationDeleteDemographicValue') {
      const list = options.demographicValues;
      const index = list
        ? list.findIndex(
            (entry) =>
              entry.key === variables?.key && `${entry.user || ''}` === `${variables?.user || ''}`,
          )
        : -1;

      if (index >= 0 && list) list.splice(index, 1);

      return Promise.resolve({
        data: { OrganizationDeleteDemographicValue: true },
        errors: [],
      });
    }

    // ---- Organization structure (ORG-022) ----
    const unitById = (id: any) =>
      businessUnits.find((unit) => `${unit.id}` === `${id}`) || null;
    const teamById = (id: any) => teams.find((team) => `${team.id}` === `${id}`) || null;
    const unitRef = (id: any) => {
      const unit = unitById(id);
      return unit ? { id: `${unit.id}`, name: unit.name } : null;
    };
    const memberRef = (memberId: any) => ({ id: `${memberId}` });

    if (operation === 'CreateBusinessUnit') {
      const input = variables?.input || {};
      const created: OrganizationBusinessUnit = {
        id: `bu-created-${businessUnits.length + 1}`,
        name: input.name,
        description: input.description ?? null,
        avatar: null,
        deleted: false,
        organization: { id: input.organization },
        owner: { id: input.owner },
        members: [],
      };
      businessUnits.push(created);
      return Promise.resolve({ data: { createBusinessUnit: { ...created } }, errors: [] });
    }

    if (operation === 'UpdateBusinessUnit') {
      const index = businessUnits.findIndex((unit) => `${unit.id}` === `${variables?.id}`);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Business unit not found' }] });
      }

      const input = variables?.input || {};
      const updated: OrganizationBusinessUnit = {
        ...businessUnits[index],
        name: input.name ?? businessUnits[index].name,
        description: input.description ?? null,
        owner: input.owner ? { id: `${input.owner}` } : null,
      };
      businessUnits[index] = updated;

      // The server keeps each team's `businessUnit { name }` reference in step
      // with the unit it points at.
      teams.forEach((team) => {
        if (team.businessUnit && `${team.businessUnit.id}` === `${updated.id}`) {
          team.businessUnit = { id: `${updated.id}`, name: updated.name };
        }
      });

      return Promise.resolve({ data: { updateBusinessUnit: { ...updated } }, errors: [] });
    }

    if (operation === 'DeleteBusinessUnit' || operation === 'RestoreBusinessUnit') {
      const index = businessUnits.findIndex((unit) => `${unit.id}` === `${variables?.id}`);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Business unit not found' }] });
      }

      const updated: OrganizationBusinessUnit = {
        ...businessUnits[index],
        deleted: operation === 'DeleteBusinessUnit',
      };
      businessUnits[index] = updated;

      // The response is keyed by the GraphQL *field*, not the operation name.
      const field =
        operation === 'DeleteBusinessUnit' ? 'deleteBusinessUnit' : 'restoreBusinessUnit';
      return Promise.resolve({ data: { [field]: { ...updated } }, errors: [] });
    }

    if (operation === 'AddBusinessUnitMember' || operation === 'RemoveBusinessUnitMember') {
      const unit = unitById(variables?.id);
      if (!unit) {
        return Promise.resolve({ data: null, errors: [{ message: 'Business unit not found' }] });
      }

      const members = Array.isArray(unit.members) ? [...unit.members] : [];
      if (operation === 'AddBusinessUnitMember') {
        if (!members.some((member) => `${member.id}` === `${variables?.memberId}`)) {
          members.push(memberRef(variables?.memberId));
        }
      }
      unit.members = members.filter(
        (member) =>
          operation === 'AddBusinessUnitMember' ||
          `${member.id}` !== `${variables?.memberId}`,
      );

      // The member row's `businessUnitId` follows the unit membership; it is
      // never written by the People tab itself.
      memberRows.forEach((row) => {
        if (`${row.userId || ''}` !== `${variables?.memberId}`) return;
        row.businessUnitId =
          operation === 'AddBusinessUnitMember' ? `${variables?.id}` : null;
        row.businessUnit = row.businessUnitId ? unitRef(row.businessUnitId) : null;
      });

      const field =
        operation === 'AddBusinessUnitMember'
          ? 'addMemberToBusinessUnit'
          : 'removeMemberFromBusinessUnit';
      return Promise.resolve({ data: { [field]: true }, errors: [] });
    }

    if (operation === 'CreateTeam') {
      const input = variables?.input || {};
      const created: OrganizationTeam = {
        id: `team-created-${teams.length + 1}`,
        name: input.name,
        title: input.name,
        description: null,
        avatar: null,
        deleted: false,
        organization: { id: input.organization },
        businessUnit: input.businessUnit ? unitRef(input.businessUnit) : null,
        owner: null,
        members: [],
      };
      teams.push(created);
      return Promise.resolve({ data: { createTeam: { ...created } }, errors: [] });
    }

    if (operation === 'UpdateTeam') {
      const index = teams.findIndex((team) => `${team.id}` === `${variables?.id}`);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Team not found' }] });
      }

      const input = variables?.input || {};
      const updated: OrganizationTeam = {
        ...teams[index],
        name: input.name ?? teams[index].name,
        title: input.name ?? teams[index].title,
        description: input.description ?? null,
        owner: input.owner ? { id: `${input.owner}` } : null,
      };
      teams[index] = updated;
      return Promise.resolve({ data: { updateTeam: { ...updated } }, errors: [] });
    }

    if (operation === 'MoveTeamToBusinessUnit') {
      const index = teams.findIndex((team) => `${team.id}` === `${variables?.id}`);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Team not found' }] });
      }

      const target = unitById(variables?.businessUnitId);
      if (!target) {
        // Mirrors the server's missing / cross-organization unit rejection.
        return Promise.resolve({
          data: null,
          errors: [{ message: 'Business unit not found in this organization' }],
        });
      }

      const moved: OrganizationTeam = {
        ...teams[index],
        businessUnit: { id: `${target.id}`, name: target.name },
      };
      teams[index] = moved;
      return Promise.resolve({ data: { moveTeamToBusinessUnit: { ...moved } }, errors: [] });
    }

    if (operation === 'DeleteTeam') {
      const index = teams.findIndex((team) => `${team.id}` === `${variables?.id}`);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Team not found' }] });
      }
      teams.splice(index, 1);
      return Promise.resolve({ data: { deleteTeam: true }, errors: [] });
    }

    if (operation === 'AddTeamMember' || operation === 'RemoveTeamMember') {
      const team = teamById(variables?.id);
      if (!team) {
        return Promise.resolve({ data: null, errors: [{ message: 'Team not found' }] });
      }

      const members = Array.isArray(team.members) ? [...team.members] : [];
      if (operation === 'AddTeamMember') {
        if (!members.some((member) => `${member.id}` === `${variables?.memberId}`)) {
          members.push(memberRef(variables?.memberId));
        }
      }
      team.members = members.filter(
        (member) =>
          operation === 'AddTeamMember' || `${member.id}` !== `${variables?.memberId}`,
      );

      // `teams` on a member row is derived from `Team.members`, so the stub
      // derives it the same way after add/remove.
      memberRows.forEach((row) => {
        if (`${row.userId || ''}` !== `${variables?.memberId}`) return;
        const ids = new Set((row.teamIds || []).map((id) => `${id}`));
        if (operation === 'AddTeamMember') ids.add(`${variables?.id}`);
        else ids.delete(`${variables?.id}`);
        row.teamIds = Array.from(ids);
        row.teams = row.teamIds.map((teamId) => {
          const found = teamById(teamId);
          return found
            ? { id: `${found.id}`, name: found.name, title: found.title }
            : { id: teamId };
        });
      });

      const field =
        operation === 'AddTeamMember' ? 'addMemberToTeam' : 'removeMemberFromTeam';
      return Promise.resolve({ data: { [field]: true }, errors: [] });
    }

    // ---- Organization members (ORG-024) ----
    const memberIndex = (userId: any) =>
      memberRows.findIndex((row) => `${row.userId || ''}` === `${userId || ''}`);
    const organizationReference = () => ({ id: 'org-1', name: 'Acme Holdings' });

    if (operation === 'SetOrganizationMemberRoles') {
      const index = memberIndex(variables?.userId);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Member not found' }] });
      }

      memberRows[index] = {
        ...memberRows[index],
        roles: Array.isArray(variables?.roles) ? [...variables.roles] : [],
      };

      return Promise.resolve({
        data: { setOrganizationMemberRoles: organizationReference() },
        errors: [],
      });
    }

    if (operation === 'DeactivateOrganizationMember') {
      const index = memberIndex(variables?.userId);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Member not found' }] });
      }

      memberRows[index] = {
        ...memberRows[index],
        enabled: false,
        status: 'deactivated',
      };

      return Promise.resolve({
        data: { deactivateOrganizationMember: organizationReference() },
        errors: [],
      });
    }

    if (operation === 'RemoveOrganizationMember') {
      const index = memberIndex(variables?.userId);
      if (index < 0) {
        return Promise.resolve({ data: null, errors: [{ message: 'Member not found' }] });
      }

      memberRows.splice(index, 1);

      return Promise.resolve({
        data: { removeOrganizationMember: organizationReference() },
        errors: [],
      });
    }

    if (operation === 'InviteOrganizationMember') {
      const email = `${variables?.email || ''}`.trim().toLowerCase();

      // The server rejects a duplicate instead of creating a second row; the
      // stub does the same so the tab's per-row reporting can be asserted.
      if (memberRows.some((row) => `${row.email || ''}`.toLowerCase() === email)) {
        return Promise.resolve({
          data: null,
          errors: [
            { message: `The email ${email} already belongs to a member of this organization` },
          ],
        });
      }

      const created = makeOrganizationMember({
        id: `invite-${memberRows.length + 1}`,
        userId: null,
        user: null,
        email,
        firstName: null,
        lastName: null,
        avatar: null,
        roles: Array.isArray(variables?.roles) ? [...variables.roles] : [],
        enabled: false,
        status: 'invited',
        businessUnitId: variables?.businessUnitId || null,
        businessUnit: variables?.businessUnitId ? unitRef(variables.businessUnitId) : null,
        teamIds: [],
        teams: [],
        created: '2026-10-22T09:00:00.000Z',
        lastLogin: null,
        authProvider: 'invitation',
        invited: true,
      });

      memberRows.push(created);

      return Promise.resolve({
        data: { inviteOrganizationMember: { ...created } },
        errors: [],
      });
    }

    return Promise.resolve({
      data: null,
      errors: [{ message: `Unhandled mutation: ${operation}` }],
    });
  });

  return {
    graphqlQuery,
    graphqlMutation,
    state,
    businessUnits,
    teams,
    members: memberRows,
    createNotification: jest.fn(),
    navigation: jest.fn(),
    /** Event bus surface used by the detail shell and the Overview tab. */
    emit: jest.fn(),
    location: { pathname: '/' } as any,
    getUser: jest.fn(() => ({
      loggedIn: {
        roles: platformRoles,
        memberships,
      },
    })),
    /**
     * Mirrors `ReactoryApi.hasRole(roles, userRoles, organization, ...)`.
     *
     * The signature matters: without the `organization` argument the real SDK
     * compares only `loggedIn.roles`, and an ORGANIZATION_ADMIN granted through
     * `addMember` / `setMemberRoles` lives on `memberships[].roles`. A stub that
     * ignored the argument would make a broken permission check look correct
     * (this exact gap hid a defect in review cycle 1).
     */
    hasRole: jest.fn(
      (
        required: string[] = [],
        userRoles: string[] | null = null,
        organization?: { id?: string } | null,
        businessUnit?: { id?: string } | null,
        userMemberships?: any[],
      ) => {
        if (!Array.isArray(required)) return false;
        if (required.length === 1 && required[0] === '*') return true;

        let granted = userRoles;

        if (granted === null) {
          const source = Array.isArray(userMemberships) ? userMemberships : memberships;

          if (!organization) {
            granted = platformRoles;
          } else {
            granted = source
              .filter((membership) => {
                if (!membership || !membership.organization) return false;
                if (membership.organization.id !== organization.id) return false;
                // An org-level check ignores business-unit memberships, exactly
                // as the SDK does.
                if (!businessUnit && membership.businessUnit !== null && membership.businessUnit !== undefined) {
                  return false;
                }
                return true;
              })
              .reduce<string[]>((roles, membership) => roles.concat(membership.roles || []), []);
          }
        }

        return required.some((role) => (granted || []).indexOf(role) >= 0);
      },
    ),
    log: jest.fn(),
    i18n: options.i18n,
  };
};

export const mutationCallsFor = (reactory: any, operation: string) =>
  reactory.graphqlMutation.mock.calls.filter(
    (call: any[]) => operationNameOf(call[0]) === operation,
  );

export const queryCallsFor = (reactory: any, operation: string) =>
  reactory.graphqlQuery.mock.calls.filter(
    (call: any[]) => operationNameOf(call[0]) === operation,
  );

/** Open a MUI `Select` by its label and choose an option by its visible text. */
export const selectOption = async (
  control: HTMLElement,
  optionName: string,
  fireEventFn: any,
  screenApi: any,
) => {
  fireEventFn.mouseDown(control);
  const option = await screenApi.findByRole('option', { name: optionName });
  fireEventFn.click(option);
};
