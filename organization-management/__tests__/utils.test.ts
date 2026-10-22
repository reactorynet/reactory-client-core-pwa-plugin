/**
 * @jest-environment jsdom
 *
 * Unit contracts for the organization utilities.
 *
 * These are the branches the panels depend on for their error and formatting
 * behaviour, so they are exercised directly rather than only through a render.
 */
import {
  DEFAULT_ORGANIZATIONS_BASE_PATH,
  businessUnitCount,
  envelopeError,
  formatUpdated,
  normalizeOrganizationPath,
  operationPayload,
  organizationDetailPath,
  organizationIdFromPath,
  organizationStatus,
  resolveErrorMessage,
  resolveOrganizationBasePath,
  resolveOrganizationListRoute,
  resolveOrganizationPermissions,
  serverMessageOf,
} from '../utils';
import { makeOrganization, makeReactory } from './testFixtures';

describe('resolveErrorMessage', () => {
  it('prefers a plain message, then an errors array, then graphQLErrors', () => {
    expect(resolveErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
    expect(resolveErrorMessage({ message: 'direct' }, 'fallback')).toBe('direct');
    expect(resolveErrorMessage({ errors: [{ message: 'envelope' }] }, 'fallback')).toBe('envelope');
    expect(
      resolveErrorMessage({ graphQLErrors: [{ message: 'apollo' }] }, 'fallback'),
    ).toBe('apollo');
    expect(resolveErrorMessage({ networkError: { message: 'offline' } }, 'fallback')).toBe(
      'offline',
    );
  });

  it('accepts a bare string and falls back for anything unusable', () => {
    expect(resolveErrorMessage('just text', 'fallback')).toBe('just text');
    expect(resolveErrorMessage(null, 'fallback')).toBe('fallback');
    expect(resolveErrorMessage({}, 'fallback')).toBe('fallback');
    expect(resolveErrorMessage({ errors: [] }, 'fallback')).toBe('fallback');
    expect(resolveErrorMessage({ message: '' }, 'fallback')).toBe('fallback');
  });
});

describe('serverMessageOf', () => {
  it('returns the server text, or null when there is none', () => {
    expect(serverMessageOf({ errors: [{ message: 'Not authorized' }] })).toBe('Not authorized');
    expect(serverMessageOf(new Error('gone'))).toBe('gone');
    expect(serverMessageOf(null)).toBeNull();
    expect(serverMessageOf({})).toBeNull();
  });
});

describe('envelopeError', () => {
  it('extracts the first GraphQL error from a resolved envelope', () => {
    expect(envelopeError({ errors: [{ message: 'nope' }] })).toBe('nope');
    expect(envelopeError({ errors: [{}] })).toBe('GraphQL error');
  });

  it('returns null for a clean or absent envelope', () => {
    expect(envelopeError({ errors: [] })).toBeNull();
    expect(envelopeError({ data: {} })).toBeNull();
    expect(envelopeError(null)).toBeNull();
  });
});

describe('operationPayload', () => {
  it('unwraps data.<operation> and tolerates a missing payload', () => {
    expect(operationPayload({ data: { CoreOrganizations: [1, 2] } }, 'CoreOrganizations')).toEqual([
      1, 2,
    ]);
    expect(operationPayload({ data: {} }, 'CoreOrganizations')).toBeNull();
    expect(operationPayload({}, 'CoreOrganizations')).toBeNull();
    expect(operationPayload(null, 'CoreOrganizations')).toBeNull();
  });
});

describe('businessUnitCount / organizationStatus', () => {
  it('counts embedded references and defaults a missing status to active', () => {
    expect(businessUnitCount(makeOrganization())).toBe(2);
    expect(businessUnitCount(makeOrganization({ businessUnits: null }))).toBe(0);
    expect(businessUnitCount(makeOrganization({ businessUnits: [] }))).toBe(0);

    expect(organizationStatus(makeOrganization({ status: 'ARCHIVED' }))).toBe('archived');
    expect(organizationStatus(makeOrganization({ status: null }))).toBe('active');
  });
});

describe('formatUpdated', () => {
  it('formats ISO strings, Date values, epoch seconds and epoch milliseconds', () => {
    const iso = formatUpdated('2026-08-14T10:00:00.000Z');
    expect(iso).not.toBe('');
    expect(formatUpdated(new Date('2026-08-14T10:00:00.000Z'))).toBe(iso);

    const asDate = new Date('2026-08-14T10:00:00.000Z');
    expect(formatUpdated(asDate.getTime())).toBe(iso);
    expect(formatUpdated(Math.floor(asDate.getTime() / 1000))).toBe(iso);
  });

  it('returns an empty string for absent or unparseable values', () => {
    expect(formatUpdated(null)).toBe('');
    expect(formatUpdated(undefined)).toBe('');
    expect(formatUpdated('')).toBe('');
    expect(formatUpdated('not-a-date')).toBe('');
  });
});

describe('organizationIdFromPath', () => {
  it('reads the id and ignores query strings', () => {
    expect(organizationIdFromPath('/organizations/64f0aa')).toBe('64f0aa');
    expect(organizationIdFromPath('/organizations/64f0aa?tab=people')).toBe('64f0aa');
    expect(organizationIdFromPath('/organizations')).toBe('');
    expect(organizationIdFromPath(null)).toBe('');
  });
});

/**
 * A host that answers `hasRole` the way the real SDK does: with no organization
 * only `loggedIn.roles` counts; with an organization, that organization's
 * membership roles count (org-level only, business units excluded).
 */
const sdkLikeReader = ({
  roles = ['USER'],
  memberships = [],
}: {
  roles?: string[];
  memberships?: any[];
} = {}) => ({
  getUser: () => ({ loggedIn: { roles, memberships } }),
  hasRole: (required: string[], userRoles: string[] | null = null, organization?: any) => {
    let granted = userRoles;
    if (granted === null) {
      if (!organization) {
        granted = roles;
      } else {
        granted = memberships
          .filter(
            (membership) =>
              membership.organization &&
              membership.organization.id === organization.id &&
              (membership.businessUnit === null || membership.businessUnit === undefined),
          )
          .reduce<string[]>((all, membership) => all.concat(membership.roles || []), []);
      }
    }
    return required.some((role) => (granted || []).indexOf(role) >= 0);
  },
});

/**
 * The stub must answer `hasRole` the way the SDK does, or a permission bug is
 * invisible to every panel test built on it (review cycle 1, QA-3).
 */
describe('test fixture hasRole', () => {
  const orgAdmin = () =>
    makeReactory({
      roles: ['USER'],
      memberships: [{ organization: { id: 'org-1' }, roles: ['ORGANIZATION_ADMIN'] }],
    });

  it('reads platform roles when no organization is supplied', () => {
    const reactory = orgAdmin();
    expect(reactory.hasRole(['USER'])).toBe(true);
    // The membership role is NOT a platform role.
    expect(reactory.hasRole(['ORGANIZATION_ADMIN'])).toBe(false);
    expect(reactory.hasRole(['ADMIN'])).toBe(false);
  });

  it('reads that organization membership roles when one is supplied', () => {
    const reactory = orgAdmin();
    expect(reactory.hasRole(['ORGANIZATION_ADMIN'], null, { id: 'org-1' })).toBe(true);
    expect(reactory.hasRole(['ORGANIZATION_ADMIN'], null, { id: 'org-2' })).toBe(false);
  });

  it('ignores a business-unit membership for an organization-level check', () => {
    const reactory = makeReactory({
      roles: ['USER'],
      memberships: [
        {
          organization: { id: 'org-1' },
          businessUnit: { id: 'bu-1' },
          roles: ['ORGANIZATION_ADMIN'],
        },
      ],
    });

    expect(reactory.hasRole(['ORGANIZATION_ADMIN'], null, { id: 'org-1' })).toBe(false);
  });

  it('exposes the session so membership-aware helpers can read it', () => {
    const reactory = orgAdmin();
    expect(reactory.getUser().loggedIn.memberships).toHaveLength(1);
    expect(reactory.getUser().loggedIn.roles).toEqual(['USER']);
  });
});

describe('resolveOrganizationPermissions', () => {
  it('grants creation to ADMIN but not to a plain ORGANIZATION_ADMIN', () => {
    const admin = resolveOrganizationPermissions(sdkLikeReader({ roles: ['ADMIN'] }));
    expect(admin.canCreate).toBe(true);
    expect(admin.canManageAny).toBe(true);
    expect(admin.canManageOrganization('org-1')).toBe(true);

    const orgAdmin = resolveOrganizationPermissions(
      sdkLikeReader({ roles: ['ORGANIZATION_ADMIN'] }),
    );
    expect(orgAdmin.canCreate).toBe(false);
    expect(orgAdmin.canManageAny).toBe(true);
  });

  it('denies every write to a plain USER', () => {
    const reader = resolveOrganizationPermissions(sdkLikeReader({ roles: ['USER'] }));
    expect(reader.canCreate).toBe(false);
    expect(reader.canManageAny).toBe(false);
    expect(reader.canManageOrganization('org-1')).toBe(false);
    expect(reader.canManageOrganization(null)).toBe(false);
  });

  it('honours an ORGANIZATION_ADMIN granted through a membership (QA-2)', () => {
    const reader = resolveOrganizationPermissions(
      sdkLikeReader({
        roles: ['USER'],
        memberships: [
          { organization: { id: 'org-1' }, roles: ['ORGANIZATION_ADMIN'], enabled: true },
        ],
      }),
    );

    // The platform-level check cannot see it...
    expect(reader.canCreate).toBe(false);
    expect(reader.canManageAny).toBe(false);
    // ...but the organization-scoped check does, for that organization only.
    expect(reader.canManageOrganization('org-1')).toBe(true);
    expect(reader.canManageOrganization('org-2')).toBe(false);
  });

  it('scans memberships directly for payload shapes the SDK org branch misses', () => {
    // `organizationId` only, no populated `organization`.
    const reader = resolveOrganizationPermissions(
      sdkLikeReader({
        roles: ['USER'],
        memberships: [{ organizationId: 'org-9', roles: ['ORGANIZATION_ADMIN'] }],
      }),
    );

    expect(reader.canManageAny).toBe(false);
    expect(reader.canManageOrganization('org-9')).toBe(true);
    expect(reader.canManageOrganization('org-1')).toBe(false);
  });

  it('does not let a business-unit membership or a disabled membership administer the organization', () => {
    const busUnit = resolveOrganizationPermissions(
      sdkLikeReader({
        memberships: [
          {
            organization: { id: 'org-1' },
            businessUnit: { id: 'bu-1' },
            roles: ['ORGANIZATION_ADMIN'],
          },
        ],
      }),
    );
    expect(busUnit.canManageOrganization('org-1')).toBe(false);

    const disabled = resolveOrganizationPermissions(
      sdkLikeReader({
        memberships: [
          { organization: { id: 'org-1' }, roles: ['ORGANIZATION_ADMIN'], enabled: false },
        ],
      }),
    );
    expect(disabled.canManageOrganization('org-1')).toBe(false);
  });

  it('is permissive when the host exposes no hasRole, leaving enforcement to the server', () => {
    const permissive = resolveOrganizationPermissions({});
    expect(permissive.canCreate).toBe(true);
    expect(permissive.canManageAny).toBe(true);
    expect(permissive.canManageOrganization('org-1')).toBe(true);

    const missing = resolveOrganizationPermissions(null);
    expect(missing.canManageOrganization('org-1')).toBe(true);
  });
});

/**
 * Route helpers (ORG-016).
 *
 * The surfaces build their navigation targets from a configurable base path;
 * these pin the normalisation that keeps `'/organizations/manage'` and
 * `'/organizations/manage/'` from producing a doubled slash, and that keeps the
 * default identical to the pre-ORG-016 literal.
 */
describe('organization path helpers', () => {
  it('defaults the base path to the legacy surface', () => {
    expect(DEFAULT_ORGANIZATIONS_BASE_PATH).toBe('/organizations');
    expect(resolveOrganizationBasePath(undefined)).toBe('/organizations');
    expect(resolveOrganizationBasePath(null)).toBe('/organizations');
    expect(resolveOrganizationBasePath('')).toBe('/organizations');
    expect(resolveOrganizationBasePath('   ')).toBe('/organizations');
  });

  it('collapses duplicate and trailing slashes', () => {
    expect(normalizeOrganizationPath('/organizations/manage/')).toBe('/organizations/manage');
    expect(normalizeOrganizationPath('/organizations//manage//')).toBe('/organizations/manage');
    expect(resolveOrganizationBasePath('/organizations/manage/')).toBe('/organizations/manage');
    // A base path without a leading slash is still rooted.
    expect(resolveOrganizationBasePath('organizations/manage')).toBe('/organizations/manage');
  });

  it('joins the base path and the id with exactly one slash', () => {
    expect(organizationDetailPath(undefined, 'org-1')).toBe('/organizations/org-1');
    expect(organizationDetailPath('/organizations/manage', 'org-1')).toBe(
      '/organizations/manage/org-1',
    );
    expect(organizationDetailPath('/organizations/manage/', 'org-1')).toBe(
      '/organizations/manage/org-1',
    );
    expect(organizationDetailPath('/organizations/manage', 'org-1')).not.toContain('//');
  });

  it('resolves a back target from listRoute, then the base path, then the default', () => {
    expect(resolveOrganizationListRoute('/organizations/manage')).toBe('/organizations/manage');
    expect(resolveOrganizationListRoute('/organizations/manage/')).toBe('/organizations/manage');
    expect(resolveOrganizationListRoute(undefined, '/organizations/manage')).toBe(
      '/organizations/manage',
    );
    expect(resolveOrganizationListRoute(undefined, undefined)).toBe('/organizations');
    // The root itself survives normalisation rather than collapsing to ''.
    expect(resolveOrganizationListRoute('/')).toBe('/');
  });
});
