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
 * write, an object carrying at least its `id`).
 *
 * Emit only after a successful mutation — never from a `finally` block, and
 * never for a request that failed.
 */
export const ORGANIZATION_UPDATED_EVENT = 'core.OrganizationUpdatedEvent';

/**
 * Notify both event buses that an organization changed.
 *
 * `ReactoryApi` carries **two independent buses** and this event is consumed on
 * both, so one `emit` call is not enough (ORG-043 review finding RC-1):
 *
 *  - `reactory.emit` / `reactory.on` — eventemitter3 (`class ReactoryApi extends
 *    EventEmitter`). `MaterialTableWidget` binds its `refreshEvents` here, so a
 *    grid listing organizations refreshes on this signal.
 *  - `reactory.amq.$pub.def` — postal.js (`src/amq/index.ts`:
 *    `$pub.def -> postal.channel(channel).publish(eventId, data)`). The shell
 *    (`App.tsx`) subscribes with `amq.$sub.def(...)`, i.e. *this* bus, and
 *    re-resolves the organization theme from it.
 *
 * Nothing in the client bridges the two, so publishing on only one of them
 * silently strands the other consumer. Both calls are best effort: a throwing
 * listener or a missing bus must never fail a write the server already
 * accepted.
 *
 * The postal call passes the event id as the channel **and** as the postal
 * topic, matching the `$sub.def(event, handler, channel)` registration App
 * uses; a mismatch there would publish into a channel nobody reads.
 */
export const emitOrganizationUpdated = (reactory: any, organization: any): void => {
  if (!reactory || !organization) return;

  const attempt = (run: () => void): void => {
    try {
      run();
    } catch {
      // Notification is not part of the write contract; swallow and continue.
    }
  };

  if (typeof reactory.emit === 'function') {
    attempt(() => reactory.emit(ORGANIZATION_UPDATED_EVENT, organization));
  }

  const publish = reactory.amq && reactory.amq.$pub && reactory.amq.$pub.def;
  if (typeof publish === 'function') {
    attempt(() => publish(ORGANIZATION_UPDATED_EVENT, organization, ORGANIZATION_UPDATED_EVENT));
  }
};
