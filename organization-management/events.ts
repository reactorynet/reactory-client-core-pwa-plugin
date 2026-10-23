/**
 * Cross-surface events raised by the organization management UI.
 *
 * The constant lives here rather than in `OrganizationDetailPanel` because the
 * tabs are loaded *by* that panel through the tab registry
 * (`OrganizationDetailPanel` -> `organizationTabs` -> tab). A tab importing the
 * constant back from the panel would close that cycle, and the registry entry
 * would be `undefined` whenever the tab module happened to be evaluated first.
 * `OrganizationDetailPanel` re-exports this symbol, so every existing import
 * site keeps working.
 */

/**
 * Raised after an organization write has been confirmed by the server.
 *
 * Payload: the organization the mutation returned (or, for a status-only
 * write, an object carrying at least its `id`). The shell's
 * `OrganizationThemeService` subscribes to this event and re-resolves the
 * active organization's theme, which is what makes a saved theme visible
 * without a reload (ORG-014's "apply on theme change").
 *
 * Emit only after a successful mutation — never from a `finally` block, and
 * never for a request that failed.
 */
export const ORGANIZATION_UPDATED_EVENT = 'core.OrganizationUpdatedEvent';

export default ORGANIZATION_UPDATED_EVENT;
