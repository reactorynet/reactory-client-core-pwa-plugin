import type { Organization } from './types';

/**
 * Roles the server accepts for each write, mirroring the resolver decorators in
 * `reactory-express-server/src/modules/reactory-core/resolvers/Organization/Organization.ts`:
 *
 *   - `createOrganization` is `@auth(roles: ["ADMIN", "SYSTEM"])` — creation has
 *     no organization to scope against, so an ORGANIZATION_ADMIN cannot create.
 *   - `archiveOrganization` / `restoreOrganization` / `updateOrganization` are
 *     `ORGANIZATION_ADMIN`, `ADMIN`, `SYSTEM`, and the service additionally runs
 *     `assertOrgAdmin` against the target id.
 *
 * The client mirror exists so a plain USER is not shown affordances the server
 * will always deny; the server remains the authority.
 */
export const ORGANIZATION_CREATE_ROLES = ['ADMIN', 'SYSTEM'] as const;
export const ORGANIZATION_MANAGE_ROLES = ['ORGANIZATION_ADMIN', 'ADMIN', 'SYSTEM'] as const;

export interface OrganizationPermissions {
  /** May call `createOrganization`. */
  canCreate: boolean;
  /**
   * May archive / restore *any* organization in scope, without asking which one:
   * true for a platform administrator (or a host with no role API).
   */
  canManageAny: boolean;
  /**
   * May archive / restore *this* organization. Always use this for a row.
   *
   * An ORGANIZATION_ADMIN is normally granted through a membership
   * (`OrganizationService.addMember` / `setMemberRoles` write only
   * `membership.roles`), so a role check that ignores the organization answers
   * false for the very administrator the server would authorize.
   */
  canManageOrganization: (organizationId?: string | null) => boolean;
}

/**
 * Read the signed-in user's memberships.
 *
 * `hasRole` is the authority, but it only consults memberships when it is given
 * an organization *and* matches on the SDK's populated `organization.id` shape.
 * Reading the memberships here covers the payload shapes the SDK allows
 * (`organization`/`organizationId`, `businessUnit`/`businessUnitId`) so the
 * mirror does not depend on which one the host happened to hydrate.
 */
const loggedInMemberships = (reactory: any): any[] => {
  if (!reactory || typeof reactory.getUser !== 'function') return [];
  const user = reactory.getUser();
  const memberships = user && user.loggedIn ? user.loggedIn.memberships : null;
  return Array.isArray(memberships) ? memberships : [];
};

const membershipOrganizationId = (membership: any): string => {
  if (!membership) return '';
  const organization = membership.organization;
  if (organization && organization.id) return `${organization.id}`;
  if (membership.organizationId) return `${membership.organizationId}`;
  return '';
};

const membershipBusinessUnitId = (membership: any): string => {
  if (!membership) return '';
  const businessUnit = membership.businessUnit;
  if (businessUnit && businessUnit.id) return `${businessUnit.id}`;
  if (membership.businessUnitId) return `${membership.businessUnitId}`;
  return '';
};

/**
 * True when a membership confers organization-level administration.
 *
 * Mirrors `OrganizationService.hasOrganizationRole`: the membership must target
 * this organization, must not be a business-unit membership (a unit role does
 * not confer organization administration), must not be disabled, and must carry
 * the role.
 */
const membershipGrantsOrganizationRole = (
  membership: any,
  organizationId: string,
  role: string,
): boolean => {
  if (!membership) return false;
  if (membershipOrganizationId(membership) !== organizationId) return false;
  if (membershipBusinessUnitId(membership) !== '') return false;
  if (membership.enabled === false) return false;
  return Array.isArray(membership.roles) && membership.roles.indexOf(role) >= 0;
};

/**
 * Resolve the caller's organization write permissions.
 *
 * The three checks, in order:
 *
 *   1. **Host without `hasRole`** (a bare test double, the electron shell early
 *      in boot) — treated as permitted. Hiding every action there would make the
 *      screen look broken, and the server still denies anything unauthorized.
 *   2. **Platform roles** — `hasRole(roles)` with no organization compares
 *      `loggedIn.roles`, which covers ADMIN/SYSTEM and the provisioning-time
 *      path that unions membership roles into `user.roles`.
 *   3. **The organization's membership** — the authoritative form. The
 *      memberships are scanned directly, applying the same rules the server's
 *      `hasOrganizationRole` applies: the membership must target this
 *      organization, must be an organization-level (not business-unit)
 *      membership, must not be disabled, and must carry the role. `hasRole`'s own
 *      organization branch does *not* look at `enabled` and only recognises the
 *      populated `organization.id` shape, so it is used only as a fallback when
 *      the host has not hydrated `loggedIn.memberships` at all.
 *
 * Creation stays platform-only: `createOrganization` has no organization to
 * scope against, so an ORGANIZATION_ADMIN genuinely cannot create one.
 */
export const resolveOrganizationPermissions = (reactory: any): OrganizationPermissions => {
  if (!reactory || typeof reactory.hasRole !== 'function') {
    return {
      canCreate: true,
      canManageAny: true,
      canManageOrganization: () => true,
    };
  }

  const canCreate = reactory.hasRole([...ORGANIZATION_CREATE_ROLES]) === true;
  const platformManager = reactory.hasRole([...ORGANIZATION_MANAGE_ROLES]) === true;
  const memberships = loggedInMemberships(reactory);

  const canManageOrganization = (organizationId?: string | null): boolean => {
    if (platformManager) return true;

    const id = organizationId ? `${organizationId}` : '';
    if (!id) return false;

    // Memberships are the authoritative source when the host hydrated them:
    // this applies the enabled flag and the business-unit exclusion, which the
    // SDK's own organization branch does not.
    if (memberships.length > 0) {
      return memberships.some((membership) =>
        ORGANIZATION_MANAGE_ROLES.some((role) =>
          membershipGrantsOrganizationRole(membership, id, role),
        ),
      );
    }

    // No memberships on the session: ask the SDK, which may resolve them from a
    // payload shape this module does not read.
    return reactory.hasRole([...ORGANIZATION_MANAGE_ROLES], null, { id }) === true;
  };

  return { canCreate, canManageAny: platformManager, canManageOrganization };
};

/**
 * Helpers shared by the organization panels.
 *
 * Kept free of React so they can be unit tested directly and reused by both the
 * list and the detail shell.
 */

/** Read an error message out of a GraphQL envelope, a rejection or anything else. */
export const resolveErrorMessage = (error: any, fallback: string): string => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message.length > 0) return error.message;
  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors[0]?.message || fallback;
  }
  if (error.graphQLErrors && Array.isArray(error.graphQLErrors) && error.graphQLErrors.length > 0) {
    return error.graphQLErrors[0]?.message || fallback;
  }
  if (error.networkError && error.networkError.message) return error.networkError.message;
  return fallback;
};

/**
 * Read the server's message out of anything a GraphQL call can produce, or
 * `null` when it produced nothing usable.
 *
 * Hooks pass this as `OrganizationError.serverMessage`; the component decides
 * whether to show it verbatim or fall back to a translated key.
 */
export const serverMessageOf = (error: any): string | null => {
  const message = resolveErrorMessage(error, '');
  return message && message.length > 0 ? message : null;
};

/**
 * Detect the shape of a GraphQL envelope that reports failures.
 *
 * The SDK can resolve with `{ errors: [...] }` instead of rejecting, so every
 * call site has to check both the envelope and the rejection path.
 */
export const envelopeError = (result: any): string | null => {
  if (!result) return null;
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    return result.errors[0]?.message || 'GraphQL error';
  }
  return null;
};

/** Count business units from the embedded references. */
export const businessUnitCount = (organization: Organization): number =>
  Array.isArray(organization?.businessUnits) ? organization.businessUnits.length : 0;

/** Normalise the lifecycle status to a known value; unknown values are kept as-is. */
export const organizationStatus = (organization: Organization): string =>
  (organization?.status || 'active').toString().toLowerCase();

/**
 * Format an `updatedAt` value.
 *
 * The `Date` scalar may arrive as a Date, an ISO string or an epoch number
 * (seconds or milliseconds); all three are handled so the column never renders
 * `Invalid Date`.
 */
export const formatUpdated = (value?: string | number | Date | null): string => {
  if (value === undefined || value === null || value === '') return '';

  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    // Heuristic: values below 10^11 are epoch seconds, not milliseconds.
    date = new Date(value < 1e11 ? value * 1000 : value);
  } else {
    const numeric = Number(value);
    date = Number.isFinite(numeric) && `${value}`.trim() !== ''
      ? new Date(numeric < 1e11 ? numeric * 1000 : numeric)
      : new Date(value);
  }

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

/**
 * Read the id out of `/organizations/:id`.
 *
 * Route configuration passes `args` through the router, but not every host wires
 * that up, so the panel falls back to the location the router exposes on the
 * Reactory API.
 */
export const organizationIdFromPath = (pathname?: string | null): string => {
  if (!pathname) return '';
  const match = /\/organizations\/([^/?#]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : '';
};

/** Unwrap a `data.<operation>` payload from either a mutation or a query result. */
export const operationPayload = (result: any, operationName: string): any => {
  if (!result || !result.data) return null;
  return result.data[operationName] ?? null;
};
