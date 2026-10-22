import type { DemographicDefinition } from '../../demographic-form';
import type { Organization, OrganizationStatistics, OrganizationTheme } from '../types';

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
      const key = variables?.filter?.key;
      const total = Number((options.demographicValueCounts || {})[key] || 0);

      return Promise.resolve({
        data: {
          OrganizationDemographicValues: {
            values: [],
            paging: { page: 1, pageSize: 1, total, hasNext: total > 1 },
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
