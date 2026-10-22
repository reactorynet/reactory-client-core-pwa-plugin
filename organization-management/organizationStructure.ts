/**
 * Pure helpers for the organization Structure tab (ORG-022).
 *
 * The hierarchy is not a server concept: the API returns two flat collections
 * and `Team.businessUnit` is the only link between them. Keeping the folding
 * rule here — as plain functions over plain data — means the nesting the tab
 * renders is testable without a DOM and cannot drift between the tree and the
 * move dialog, which both need to reason about the same relationship.
 */

import type {
  OrganizationBusinessUnit,
  OrganizationStructureTree,
  OrganizationStructureUserRef,
  OrganizationTeam,
} from './types';

/** Read an id from a value that may be an id, an object reference, or absent. */
export const referenceId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.id) return `${value.id}`;
  return '';
};

/**
 * A user reference's display name.
 *
 * `firstName`/`lastName` are what the queries select; `email` and finally the id
 * are fallbacks so a partially hydrated reference still renders something the
 * administrator can recognise.
 */
export const userDisplayName = (
  user?: OrganizationStructureUserRef | string | null,
): string => {
  if (!user) return '';
  if (typeof user === 'string') return user;

  const first = `${user.firstName || ''}`.trim();
  const last = `${user.lastName || ''}`.trim();
  const full = `${first} ${last}`.trim();
  if (full.length > 0) return full;

  const email = `${user.email || ''}`.trim();
  if (email.length > 0) return email;

  return `${user.id || ''}`;
};

/** A team's display name. The server resolves both fields to the same value. */
export const teamDisplayName = (team?: OrganizationTeam | null): string => {
  if (!team) return '';
  const name = `${team.name || ''}`.trim();
  if (name.length > 0) return name;
  return `${team.title || ''}`.trim();
};

/** The business unit a team is nested under, as an id; `''` when unassigned. */
export const teamBusinessUnitId = (team?: OrganizationTeam | null): string =>
  referenceId(team && team.businessUnit);

/**
 * Fold the two flat collections into the rendered hierarchy.
 *
 * Rules:
 *   - units keep the order the server returned (the paged query sorts by name);
 *   - a team is nested under the unit whose id matches `team.businessUnit`;
 *   - a team whose `businessUnit` is null goes to `unassignedTeams`;
 *   - a team pointing at a unit that is *not in this view* (typically a
 *     soft-deleted unit while "show deleted" is off) also goes to
 *     `unassignedTeams`. Dropping it would hide a real team because of a filter
 *     the administrator applied to something else.
 */
export const buildOrganizationStructure = (
  businessUnits: OrganizationBusinessUnit[] = [],
  teams: OrganizationTeam[] = [],
): OrganizationStructureTree => {
  const nodes = (businessUnits || []).map((businessUnit) => ({
    businessUnit,
    teams: [] as OrganizationTeam[],
  }));

  const byId = new Map<string, (typeof nodes)[number]>();
  nodes.forEach((node) => {
    const id = `${node.businessUnit?.id || ''}`;
    if (id) byId.set(id, node);
  });

  const unassignedTeams: OrganizationTeam[] = [];

  (teams || []).forEach((team) => {
    const businessUnitId = teamBusinessUnitId(team);
    const node = businessUnitId ? byId.get(businessUnitId) : undefined;
    if (node) node.teams.push(team);
    else unassignedTeams.push(team);
  });

  return { nodes, unassignedTeams };
};

/**
 * The signed-in user's id, used as the default owner of a new business unit.
 *
 * `createBusinessUnit` requires an owner (`BusinessUnitInput.owner: String!`).
 * The SDK exposes the session through `getUser()`; the shapes below cover the
 * documented `loggedIn.id` and the hydrated `user.id` variant, and an
 * unauthenticated host simply gets `''` (the form then asks for an owner).
 */
export const currentUserId = (reactory: any): string => {
  if (!reactory || typeof reactory.getUser !== 'function') return '';

  try {
    const user = reactory.getUser();
    if (!user) return '';
    return (
      referenceId(user.loggedIn) ||
      referenceId(user.user) ||
      referenceId(user)
    );
  } catch {
    return '';
  }
};

/** Units a team may be moved to: live ones, excluding where it already is. */
export const movableBusinessUnits = (
  businessUnits: OrganizationBusinessUnit[] = [],
  currentBusinessUnitId?: string | null,
): OrganizationBusinessUnit[] => {
  const current = `${currentBusinessUnitId || ''}`;
  return (businessUnits || []).filter(
    (unit) => unit && unit.deleted !== true && `${unit.id}` !== current,
  );
};

export default buildOrganizationStructure;
