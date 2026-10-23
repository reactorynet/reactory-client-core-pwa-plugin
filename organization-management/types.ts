/**
 * Types for the organization management surface (ORG-010).
 *
 * These mirror the GraphQL `Organization` type in
 * `reactory-express-server/src/modules/reactory-core/graph/types/Organization`.
 * They are hand-written rather than generated because this plugin has no
 * codegen step of its own — it is compiled in the pwa-client workspace.
 */

import type { ComponentType, ReactElement } from 'react';
import type { IThemeRecord } from '../theme-editor';
import type { OrganizationMessageKey } from './i18n';

/** Lifecycle states exposed by `Organization.status`. */
export type OrganizationStatus = 'active' | 'suspended' | 'archived';

/** The list filter; `all` means "do not filter by status". */
export type OrganizationStatusFilter = OrganizationStatus | 'all';

/** Branding decision recorded by step 2 of the create wizard. ORG-013 owns the editor. */
export type OrganizationBrandingChoice = 'inherit' | 'blank';

/** `ApplicationThemeModeType` — the modes the server accepts for a theme. */
export type OrganizationThemeMode = 'light' | 'dark' | 'os';

/**
 * A theme owned by an organization.
 *
 * Aliased to the shared editor's `IThemeRecord` rather than re-declared: the
 * server's `ApplicationTheme` is the same shape a client theme uses, and the
 * branding tab hands these records straight to `ThemeEditor`.
 */
export type OrganizationTheme = IThemeRecord;

/** The two image slots `OrganizationUploadImage` accepts. */
export type OrganizationImageType = 'logo' | 'avatar';

export interface OrganizationBusinessUnitRef {
  id?: string | null;
  name?: string | null;
}

/** The subset of the `Organization` GraphQL type the admin screens read. */
export interface Organization {
  id: string;
  name: string;
  code?: string | null;
  tradingName?: string | null;
  legalName?: string | null;
  description?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status?: OrganizationStatus | string | null;
  logo?: string | null;
  logoURL?: string | null;
  avatar?: string | null;
  avatarURL?: string | null;
  theme?: string | null;
  themeMode?: OrganizationThemeMode | string | null;
  /** Themes owned by this organization (`Organization.themes`). */
  themes?: OrganizationTheme[] | null;
  public?: boolean | null;
  businessUnits?: OrganizationBusinessUnitRef[] | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
  /**
   * Audit fields. Named here because the detail Overview tab renders them when
   * a payload carries them; the current server type does not select them yet,
   * so they stay optional and the tab omits the rows when they are absent.
   */
  createdBy?: string | null;
  updatedBy?: string | null;
}

/**
 * Translator bound to the Reactory API (see `makeTranslator`).
 *
 * Aliased here so the tab contract below can name it without importing the
 * i18n module's implementation.
 */
export type OrganizationTranslator = (
  key: OrganizationMessageKey,
  values?: Record<string, string | number>,
) => string;

/** Notification severity accepted by the Reactory notification API. */
export type OrganizationNotifyType = 'success' | 'error' | 'info' | 'warning';

/**
 * Props every organization detail tab receives from the shell.
 *
 * The shell renders exactly one tab at a time and passes everything a tab
 * needs, which is what keeps the tab registry data-driven: a new ticket adds a
 * `component` that implements this contract and appends one registry entry —
 * no change to the shell's structure.
 */
export interface OrganizationTabProps {
  reactory: any;
  t: OrganizationTranslator;
  organization: Organization;
  statistics: OrganizationStatistics | null;
  /** False for a viewer who may read but not write; tabs must hide write UI. */
  canManage: boolean;
  /** Reloads the organization and its counts after a write. */
  refresh: () => Promise<void>;
  /**
   * Report whether the tab holds unsaved input. The shell uses it to guard tab
   * switches and Back navigation; a tab must clear it after save or cancel.
   */
  onUnsavedChanges: (dirty: boolean) => void;
  notify: (message: string, type?: OrganizationNotifyType) => void;
}

/**
 * One entry in the detail tab bar.
 *
 * `icon` is an element rather than a component so a registry entry stays a
 * plain data literal.
 */
export interface OrganizationTabDefinition {
  id: string;
  labelKey: OrganizationMessageKey;
  icon: ReactElement;
  component: ComponentType<OrganizationTabProps>;
}

/** `OrganizationStatistics(id)` — the per-organization dashboard counts. */
export interface OrganizationStatistics {
  members: number;
  businessUnits: number;
  teams: number;
}

/** A list row: the organization plus the counts the grid renders. */
export interface OrganizationListRow extends Organization {
  /** Member count from `OrganizationStatistics`; null until loaded / on failure. */
  members?: number | null;
  /** Business-unit count, taken from the embedded `businessUnits` references. */
  businessUnitCount: number;
}

export interface OrganizationSort {
  field: OrganizationSortField;
  direction: 'asc' | 'desc';
}

/**
 * Sortable columns. `members` is deliberately absent: member counts come from a
 * per-organization query, so only the visible page is loaded and sorting the
 * whole result set by that column would be misleading.
 */
export type OrganizationSortField =
  | 'name'
  | 'code'
  | 'tradingName'
  | 'status'
  | 'businessUnits'
  | 'theme'
  | 'updatedAt';

export interface OrganizationPaging {
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}

/** Identity fields captured by the wizard's first step. */
export interface OrganizationIdentityDraft {
  name: string;
  code: string;
  tradingName: string;
  description: string;
}

/** Everything the create wizard collects across its four steps. */
export interface OrganizationCreateDraft extends OrganizationIdentityDraft {
  branding: OrganizationBrandingChoice;
}

/**
 * What `useOrganizationAdmin.create` sends.
 *
 * `createOrganization`'s GraphQL input only exposes `name` and `code` (plus
 * `logo`/`legacyId`), so `tradingName`, `description` and the branding decision
 * are applied with a follow-up `updateOrganization`.
 */
export interface OrganizationCreateRequest extends OrganizationIdentityDraft {
  branding?: OrganizationBrandingChoice;
}

export interface OrganizationCreateResult {
  organization: Organization;
  /**
   * Set when the organization was created but the follow-up update (identity
   * extras / branding) failed. The record exists and is visible in the list.
   */
  warning?: OrganizationError | null;
}

/**
 * Result of a restore.
 *
 * The failure is returned rather than only stored on the hook because the
 * caller has to decide what to say *now*; reading the hook's `error` state
 * immediately after `await` would still see the pre-render value.
 */
export interface OrganizationRestoreResult {
  organization: Organization | null;
  error: OrganizationError | null;
}

export interface OrganizationArchiveFailure {
  id: string;
  error: OrganizationError;
}

export interface OrganizationArchiveResult {
  succeeded: string[];
  failed: OrganizationArchiveFailure[];
}

/** Load state shared by the list hook and the detail panel. */
export type OrganizationLoadState = 'idle' | 'loading' | 'success' | 'error';

/**
 * A failure the hooks hand to a component instead of a rendered sentence.
 *
 * `key` is the translatable fallback and the component resolves it through
 * `t()`; `serverMessage` is the untranslatable text the server returned and is
 * shown verbatim when present (the server remains the authority on the reason).
 * Returning a key rather than an English string is what keeps the "all
 * user-facing strings are i18n keys" guarantee true even on the error path.
 */
export interface OrganizationError {
  key: OrganizationMessageKey;
  serverMessage?: string | null;
}

/**
 * A user reference as the structure queries select it.
 *
 * `BusinessUnit.owner` / `Team.owner` and the `members` arrays are `User`
 * references, not free text. Only the display fields are selected: the tab
 * renders a name (falling back to the email, then the id) and never needs the
 * rest of the user record.
 */
export interface OrganizationStructureUserRef {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

/**
 * A `BusinessUnit` as the Structure tab reads it (ORG-022).
 *
 * Mirrors `BusinessUnit` in
 * `reactory-express-server/src/modules/reactory-core/graph/types/Organization/BusinessUnit.graphql`.
 * `deleted` is the soft-delete flag: soft-deleted units are excluded from
 * `pagedBusinessUnits` unless `filter.includeDeleted` is set, and are brought
 * back with `restoreBusinessUnit`.
 */
export interface OrganizationBusinessUnit {
  id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  organization?: string | OrganizationBusinessUnitRef | null;
  owner?: OrganizationStructureUserRef | null;
  members?: OrganizationStructureUserRef[] | null;
  deleted?: boolean | null;
}

/**
 * A `Team` as the Structure tab reads it (ORG-022).
 *
 * `businessUnit` is the link that makes the hierarchy possible: a team is
 * nested under the unit whose id it carries. `null` means the team is not (yet)
 * assigned and belongs in the "Unassigned teams" group.
 *
 * The server resolves `title`/`name` to the same value (see
 * `TeamResolver.title`/`.name`), so the tab reads both and prefers whichever is
 * present rather than assuming which one a payload carries.
 */
export interface OrganizationTeam {
  id: string;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  avatar?: string | null;
  organization?: string | OrganizationBusinessUnitRef | null;
  businessUnit?: OrganizationBusinessUnitRef | null;
  owner?: OrganizationStructureUserRef | null;
  members?: OrganizationStructureUserRef[] | null;
  deleted?: boolean | null;
}

/** One business unit node with the teams nested beneath it. */
export interface OrganizationStructureNode {
  businessUnit: OrganizationBusinessUnit;
  teams: OrganizationTeam[];
}

/**
 * The rendered hierarchy.
 *
 * `nodes` keeps the order the server returned (the paged query sorts by name).
 * `unassignedTeams` holds teams whose `businessUnit` is null **and** teams that
 * point at a unit the current view does not contain (a soft-deleted unit while
 * the deleted filter is off) — a team must never disappear just because its
 * parent did.
 */
export interface OrganizationStructureTree {
  nodes: OrganizationStructureNode[];
  unassignedTeams: OrganizationTeam[];
}

/**
 * Result of a structure write.
 *
 * The failure is returned alongside the record for the same reason the branding
 * hook does it: the caller has to decide what to say *now*, and reading hook
 * state immediately after `await` would still see the pre-render value.
 */
export interface OrganizationStructureWriteResult<T> {
  record: T | null;
  error: OrganizationError | null;
}

/** Result of a mutation that only answers with a boolean. */
export interface OrganizationStructureFlagResult {
  ok: boolean;
  error: OrganizationError | null;
}

/**
 * Input for creating a business unit.
 *
 * `owner` is required by `BusinessUnitInput` server-side, and `organization` is
 * supplied by the hook from the tab's own organization — the form never asks
 * the user which organization a unit belongs to.
 */
export interface OrganizationBusinessUnitCreateInput {
  name: string;
  description?: string | null;
  owner: string;
}

/** Input for updating a business unit (`BusinessUnitUpdateInput`). */
export interface OrganizationBusinessUnitUpdateInput {
  name?: string;
  description?: string | null;
  owner?: string | null;
}

/**
 * Input for creating a team.
 *
 * `createTeam` server-side only persists the organization, the name and the
 * optional business unit — owner and description are applied through
 * `updateTeam`, which is why they live on the update input only.
 */
export interface OrganizationTeamCreateInput {
  name: string;
  businessUnitId?: string | null;
}

/** Input for updating a team. `businessUnit` is deliberately absent. */
export interface OrganizationTeamUpdateInput {
  name?: string;
  description?: string | null;
  owner?: string | null;
}

/**
 * Result of the guarded demographics-definitions probe.
 *
 * `OrganizationDemographicDefinitions` ships with ORG-030/ORG-031. Until then
 * the query is unknown to the schema, so the guard reports `unavailable`
 * instead of surfacing a GraphQL error to the user.
 */
export type DemographicDefinitionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'available'; definitions: any[] }
  | {
      status: 'unavailable';
      reason: 'no-organization' | 'not-implemented' | 'error';
      message?: string | null;
    };

/* ------------------------------------------------------------------------- *
 * Organization members (ORG-024)
 *
 * Mirrors the `OrganizationMember` type added by ORG-023 in
 * `reactory-express-server/src/modules/reactory-core/graph/types/Organization/Organization.graphql`.
 *
 * Two fields deserve a note, because the People tab is built on them:
 *
 *   - `businessUnitId` / `businessUnit` are read from the membership
 *     subdocument (`User.memberships[n].businessUnitId`). There is **no**
 *     mutation that accepts a member's business unit: assigning one goes
 *     through `addMemberToBusinessUnit` / `removeMemberFromBusinessUnit`.
 *   - `teamIds` / `teams` are **derived** server-side from `Team.members`; the
 *     membership itself has no team field. Assigning a team goes through
 *     `addMemberToTeam` / `removeMemberFromTeam`.
 *
 * Both are therefore read-only on this shape and the tab never sends them back.
 * ------------------------------------------------------------------------- */

/** Lifecycle states of a member row; `invited` means a pending invitation. */
export type OrganizationMemberStatus = 'active' | 'deactivated' | 'invited';

/** A team reference on a member row, derived from `Team.members`. */
export interface OrganizationMemberTeamRef {
  id?: string | null;
  name?: string | null;
  title?: string | null;
}

/** The identity slice of the `User` a membership points at. */
export interface OrganizationMemberUserRef {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatar?: string | null;
}

/**
 * One membership row (`PagedOrganizationMembers.members`).
 *
 * `id` is the membership id, or the invitation id for a pending invitation.
 * `userId` is null for an invitation, which is why every write is keyed on
 * `userId` and the tab hides row actions when it is absent.
 */
export interface OrganizationMember {
  id: string;
  userId?: string | null;
  user?: OrganizationMemberUserRef | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  roles?: string[] | null;
  enabled?: boolean | null;
  status?: OrganizationMemberStatus | string | null;
  businessUnitId?: string | null;
  businessUnit?: OrganizationBusinessUnitRef | null;
  teamIds?: string[] | null;
  teams?: OrganizationMemberTeamRef[] | null;
  created?: string | number | Date | null;
  lastLogin?: string | number | Date | null;
  authProvider?: string | null;
  invited?: boolean | null;
}

/**
 * `OrganizationMemberFilter`.
 *
 * `search` matches name and email case-insensitively. `status` is the canonical
 * switch: `active` (the server default), `deactivated` or `invited`;
 * `includeDeactivated` widens the active view rather than replacing `status`,
 * because `status: 'invited'` switches the server to the invitation collection
 * entirely.
 */
export interface OrganizationMemberFilter {
  search?: string | null;
  role?: string | null;
  enabled?: boolean | null;
  status?: OrganizationMemberStatus | string | null;
  includeDeactivated?: boolean | null;
  deactivatedOnly?: boolean | null;
  businessUnitId?: string | null;
  teamId?: string | null;
}

/** `PagingResult`, as the member envelope returns it. */
export interface OrganizationMemberPaging {
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
}

/** `PagedOrganizationMembers` — the same envelope as business units and teams. */
export interface OrganizationMemberPage {
  members: OrganizationMember[];
  paging: OrganizationMemberPaging;
}

/** Result of a mutation that only reports success or failure. */
export interface OrganizationMemberWriteResult {
  ok: boolean;
  error: OrganizationError | null;
}

/** What `inviteOrganizationMember` accepts. `roles`/`businessUnitId` are optional. */
export interface OrganizationMemberInviteInput {
  email: string;
  roles?: string[] | null;
  businessUnitId?: string | null;
}

/** Result of a single invite: the pending member the server returned. */
export interface OrganizationMemberInviteResult {
  member: OrganizationMember | null;
  error: OrganizationError | null;
}

/**
 * How one email in an invite batch fared.
 *
 * The server has no bulk-invite mutation, so the tab invites one address at a
 * time and reports every row independently — a duplicate or an invalid address
 * must not discard the outcomes of the addresses around it.
 */
export type OrganizationMemberInviteOutcomeStatus =
  | 'invited'
  | 'already-member'
  | 'invalid-email'
  | 'error';

export interface OrganizationMemberInviteOutcome {
  email: string;
  status: OrganizationMemberInviteOutcomeStatus;
  /** The server's own message (untranslatable), or null. */
  message: string | null;
  /** The pending member returned for a successful invite. */
  member?: OrganizationMember | null;
}

/**
 * A member's desired assignment.
 *
 * `businessUnitId` is single-valued because a membership points at one unit;
 * `teamIds` is a set because a user may belong to several teams.
 */
export interface OrganizationMemberAssignment {
  businessUnitId: string | null;
  teamIds: string[];
}
/* ------------------------------------------------------------------------- *
 * Organization demographic values (ORG-033)
 *
 * Mirrors the `DemographicValue`, `DemographicValueFilter` and ORG-035
 * aggregate types in
 * `reactory-express-server/src/modules/reactory-core/graph/types/Demographics/Demographics.graphql`.
 *
 * Two server facts shape this surface and are deliberately visible here:
 *
 *   - `DemographicValue.user` is a **String id**, not a populated `User`. The
 *     table therefore resolves a display name from the organization's member
 *     list and falls back to the id; nothing pretends the value payload carries
 *     a name.
 *   - `DemographicValueFilter` has exactly seven fields. There is no `search`,
 *     no sort and no completeness filter, so neither the pane nor this type
 *     invents one.
 * ------------------------------------------------------------------------- */

/** A failure the server attached to a field, e.g. `values[2].value`. */
export interface OrganizationFieldError {
  path: string;
  message: string;
}

/** Where a stored value came from (`DemographicValue.source`). */
export type DemographicValueSource = 'user' | 'admin' | 'import' | 'api';

/** One stored value (`DemographicValue`). */
export interface OrganizationDemographicValue {
  id?: string | null;
  organization?: string | null;
  /** `User` id. Resolved to a name/email by the pane when it can be. */
  user?: string | null;
  membership?: string | null;
  definition?: string | null;
  /** Definition key snapshot taken at write time. */
  key: string;
  value?: unknown;
  /** Value-type snapshot taken at write time. */
  valueType?: string | null;
  source?: DemographicValueSource | string | null;
  verified?: boolean | null;
  effectiveFrom?: string | number | Date | null;
  effectiveTo?: string | number | Date | null;
  updatedBy?: string | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}

/**
 * `DemographicValueFilter`.
 *
 * Only the fields the server documents. `user` must be an ObjectId, which is
 * why the pane resolves an email to a user id before it sends the filter.
 */
export interface OrganizationDemographicValueFilter {
  user?: string | null;
  membership?: string | null;
  key?: string | null;
  definition?: string | null;
  value?: unknown;
  source?: string | null;
  verified?: boolean | null;
}

/** One page of stored values (`PagedDemographicValues`). */
export interface OrganizationDemographicValuePage {
  values: OrganizationDemographicValue[];
  paging: OrganizationPaging;
}

/**
 * `DemographicAggregateFilter`.
 *
 * Not exposed by the values pane (the ticket asks for definition and user
 * filters only), but typed so the hook can pass a filter without inventing a
 * document.
 */
export interface OrganizationDemographicAggregateFilter {
  businessUnit?: string | null;
  team?: string | null;
  region?: string | null;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
}

/** One bucket of a distribution. Counts are distinct members, not selections. */
export interface OrganizationDemographicAggregateBucket {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

/**
 * Aggregation of one definition (`DemographicDefinitionAggregate`).
 *
 * `suppressed: true` means nothing may be reported — nobody answered **or**
 * every cohort was below the threshold; the payload makes the two
 * indistinguishable on purpose. `suppressedCohorts` is null in that case, and a
 * bucket count when only part of the distribution was withheld.
 */
export interface OrganizationDemographicDefinitionAggregate {
  definitionKey: string;
  title: string;
  category?: string | null;
  valueType: string;
  multiValued: boolean;
  sensitive: boolean;
  suppressed: boolean;
  suppressedCohorts?: number | null;
  /** Distinct members behind the **surviving** buckets — never a population count. */
  cohortTotal: number;
  percentageDenominator: number;
  /** Always `respondents` today, so a percentage is never read as headcount. */
  denominatorKind: string;
  buckets?: OrganizationDemographicAggregateBucket[] | null;
}

/** Echo of the filters the aggregate query actually applied. */
export interface OrganizationDemographicAggregateFilterEcho {
  businessUnit?: string | null;
  team?: string | null;
  region?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  definitionKeys: string[];
  cohortRestricted: boolean;
}

/** `DemographicAggregateReport` — the thresholded completeness source. */
export interface OrganizationDemographicAggregateReport {
  organization: string;
  minimumAggregationGroupSize: number;
  filter?: OrganizationDemographicAggregateFilterEcho | null;
  definitions: OrganizationDemographicDefinitionAggregate[];
  reportedDefinitions: number;
  suppressedDefinitions: number;
}

/**
 * A value write payload (`DemographicValueInput`).
 *
 * `user` + `key` identify the row: the server upserts on
 * (organization, definition, user), so the document id is optional.
 */
export interface OrganizationDemographicValueInput {
  user: string;
  key: string;
  value: unknown;
  source?: string | null;
  verified?: boolean | null;
  membership?: string | null;
}

/** Result of a value write: the accepted records, plus per-field detail. */
export interface OrganizationDemographicValueWriteResult {
  values: OrganizationDemographicValue[];
  error: OrganizationError | null;
  fieldErrors: OrganizationFieldError[];
}

/** How one row of a bulk submission fared. */
export type OrganizationDemographicBulkOutcomeStatus = 'saved' | 'rejected';

export interface OrganizationDemographicBulkOutcome {
  /** Position in the submitted array. */
  index: number;
  user: string;
  key: string;
  status: OrganizationDemographicBulkOutcomeStatus;
  /** Untranslatable server text, or null. */
  message: string | null;
}