import type { Organization, OrganizationStatistics } from '../types';

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

export const statisticsFor = (
  overrides: Partial<OrganizationStatistics> = {},
): OrganizationStatistics => ({
  members: 12,
  businessUnits: 2,
  teams: 3,
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

    if (operation === 'OrganizationDemographicDefinitions') {
      // The query does not exist yet: this is the shape the schema returns.
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

    return Promise.resolve({
      data: null,
      errors: [{ message: `Unhandled mutation: ${operation}` }],
    });
  });

  return {
    graphqlQuery,
    graphqlMutation,
    state,
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
