/**
 * Types for the organization management surface (ORG-010).
 *
 * These mirror the GraphQL `Organization` type in
 * `reactory-express-server/src/modules/reactory-core/graph/types/Organization`.
 * They are hand-written rather than generated because this plugin has no
 * codegen step of its own — it is compiled in the pwa-client workspace.
 */

import type { OrganizationMessageKey } from './i18n';

/** Lifecycle states exposed by `Organization.status`. */
export type OrganizationStatus = 'active' | 'suspended' | 'archived';

/** The list filter; `all` means "do not filter by status". */
export type OrganizationStatusFilter = OrganizationStatus | 'all';

/** Branding decision recorded by step 2 of the create wizard. ORG-013 owns the editor. */
export type OrganizationBrandingChoice = 'inherit' | 'blank';

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
  status?: OrganizationStatus | string | null;
  logo?: string | null;
  logoURL?: string | null;
  avatar?: string | null;
  avatarURL?: string | null;
  theme?: string | null;
  themeMode?: string | null;
  public?: boolean | null;
  businessUnits?: OrganizationBusinessUnitRef[] | null;
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
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
