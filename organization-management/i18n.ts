/**
 * Message catalogue for the organization management surface.
 *
 * Every user-facing string in this folder is a key in this catalogue — no
 * component renders a bare literal. The key namespace follows the client's
 * `reactory.<area>.<key>` convention (see `reactory-data/i18n/<lang>/reactory.json`),
 * so these strings can be translated without touching a component.
 *
 * Translation resolution:
 *   1. `reactory.i18n.t(key, { defaultValue, ...values })` when the SDK exposes
 *      an i18n instance (the normal runtime).
 *   2. The English default below, so the screen still renders when i18n is not
 *      initialised (tests, early boot, the electron shell).
 */

export const ORGANIZATION_MESSAGES = {
  // ---- List ----
  'reactory.organizations.list.title': 'Organizations',
  'reactory.organizations.list.subtitle':
    'Organizations you administer, with their branding and membership at a glance.',
  'reactory.organizations.list.newOrganization': 'New organization',
  'reactory.organizations.list.search': 'Search organizations',
  'reactory.organizations.list.searchPlaceholder': 'Name, code or trading name',
  'reactory.organizations.list.statusFilter': 'Status',
  'reactory.organizations.list.statusAll': 'All statuses',
  'reactory.organizations.list.statusActive': 'Active',
  'reactory.organizations.list.statusSuspended': 'Suspended',
  'reactory.organizations.list.statusArchived': 'Archived',
  'reactory.organizations.list.refresh': 'Refresh',
  'reactory.organizations.list.archiveSelected': 'Archive selected',
  'reactory.organizations.list.column.logo': 'Logo',
  'reactory.organizations.list.column.name': 'Name',
  'reactory.organizations.list.column.code': 'Code',
  'reactory.organizations.list.column.tradingName': 'Trading name',
  'reactory.organizations.list.column.status': 'Status',
  'reactory.organizations.list.column.businessUnits': 'Business units',
  'reactory.organizations.list.column.members': 'Members',
  'reactory.organizations.list.column.theme': 'Theme',
  'reactory.organizations.list.column.updated': 'Updated',
  'reactory.organizations.list.column.actions': 'Actions',
  'reactory.organizations.list.loading': 'Loading organizations…',
  'reactory.organizations.list.errorTitle': 'Organizations could not be loaded',
  // ---- Errors ----
  // Hooks return these keys (plus the server's own text) instead of an English
  // sentence, so a failure is as translatable as any other string.
  'reactory.organizations.error.apiUnavailable':
    'The Reactory API is not available. Reload the page and try again.',
  'reactory.organizations.error.loadFailed': 'The organizations could not be loaded.',
  'reactory.organizations.error.detailLoadFailed': 'The organization could not be loaded.',
  'reactory.organizations.error.createFailed': 'The organization could not be created.',
  'reactory.organizations.error.updateFailed': 'The organization could not be updated.',
  'reactory.organizations.error.saveFailed': 'Some details could not be saved.',
  'reactory.organizations.error.archiveFailed': 'The organization could not be archived.',
  'reactory.organizations.error.restoreFailed': 'The organization could not be restored.',
  'reactory.organizations.error.definitionsFailed': 'The demographic definitions could not be read.',
  'reactory.organizations.list.retry': 'Retry',
  'reactory.organizations.list.emptyNoOrganizations': 'No organizations exist yet',
  'reactory.organizations.list.emptyNoOrganizationsHint':
    'Create the first organization to get started.',
  'reactory.organizations.list.emptyNoMatches': 'No organizations match this filter',
  'reactory.organizations.list.emptyNoMatchesHint':
    'Adjust the search or the status filter to see more results.',
  'reactory.organizations.list.themeInherited': 'Client theme',
  'reactory.organizations.list.notSet': '—',
  'reactory.organizations.list.selectAll': 'Select all organizations on this page',
  'reactory.organizations.list.selectRow': 'Select {{name}}',
  'reactory.organizations.list.openOrganization': 'Open {{name}}',
  'reactory.organizations.list.rowsPerPage': 'Rows per page',
  'reactory.organizations.list.displayedRows': '{{from}}–{{to}} of {{count}}',

  // ---- Archive / restore ----
  'reactory.organizations.archive.title': 'Archive {{name}}',
  'reactory.organizations.archive.titlePlural': 'Archive {{count}} organizations',
  'reactory.organizations.archive.reversibleHint':
    'This is a status change, not a delete. The organization and its data are retained, and you can restore it at any time.',
  'reactory.organizations.archive.confirm': 'Archive',
  'reactory.organizations.archive.cancel': 'Cancel',
  'reactory.organizations.archive.success': '{{count}} organization archived',
  'reactory.organizations.archive.successPlural': '{{count}} organizations archived',
  'reactory.organizations.archive.partial':
    '{{succeeded}} archived, {{failed}} could not be archived.',
  'reactory.organizations.archive.failed': 'The organization could not be archived.',
  'reactory.organizations.archive.rowAction': 'Archive {{name}}',
  'reactory.organizations.restore.success': '{{name}} restored',
  'reactory.organizations.restore.failed': '{{name}} could not be restored.',
  'reactory.organizations.restore.rowAction': 'Restore {{name}}',

  // ---- Create wizard ----
  'reactory.organizations.wizard.title': 'New organization',
  'reactory.organizations.wizard.step.identity': 'Identity',
  'reactory.organizations.wizard.step.branding': 'Branding',
  'reactory.organizations.wizard.step.demographics': 'Demographics',
  'reactory.organizations.wizard.step.review': 'Review',
  'reactory.organizations.wizard.next': 'Next',
  'reactory.organizations.wizard.back': 'Back',
  'reactory.organizations.wizard.cancel': 'Cancel',
  'reactory.organizations.wizard.create': 'Create organization',
  'reactory.organizations.wizard.creating': 'Creating…',
  'reactory.organizations.wizard.identityHint':
    'The name is how the organization appears throughout Reactory. The code is an optional short reference used by integrations.',
  'reactory.organizations.wizard.field.name': 'Name',
  'reactory.organizations.wizard.field.nameRequired': 'A name is required.',
  'reactory.organizations.wizard.field.nameTooLong':
    'The name must be {{max}} characters or fewer.',
  'reactory.organizations.wizard.field.code': 'Code',
  'reactory.organizations.wizard.field.codeInvalid':
    'Use letters, numbers, dots, dashes or underscores only.',
  'reactory.organizations.wizard.field.codeTooLong':
    'The code must be {{max}} characters or fewer.',
  'reactory.organizations.wizard.field.tradingName': 'Trading name',
  'reactory.organizations.wizard.field.description': 'Description',
  'reactory.organizations.wizard.field.descriptionTooLong':
    'The description must be {{max}} characters or fewer.',
  'reactory.organizations.wizard.branding.title': 'Branding',
  'reactory.organizations.wizard.branding.hint':
    'This step records the choice only. Theme editing lives in the organization branding tab.',
  'reactory.organizations.wizard.branding.inherit': 'Inherit the client theme',
  'reactory.organizations.wizard.branding.inheritHint':
    'The organization follows the logged-in client theme until it defines its own.',
  'reactory.organizations.wizard.branding.blank': 'Start with no theme',
  'reactory.organizations.wizard.branding.blankHint':
    'The organization starts without a theme. You can create one later in branding.',
  'reactory.organizations.wizard.branding.required':
    'Choose how this organization should be branded.',
  'reactory.organizations.wizard.demographics.loading':
    'Checking demographic definitions…',
  'reactory.organizations.wizard.demographics.placeholderTitle': 'Configure demographics later',
  'reactory.organizations.wizard.demographics.placeholderBody':
    'Demographic definitions are not part of organization creation yet. You can configure them from the organization Demographics tab once the definitions API is available.',
  'reactory.organizations.wizard.demographics.unavailableBody':
    'The demographic definitions API is not available in this environment, so demographics can be configured later.',
  'reactory.organizations.wizard.demographics.loadFailedBody':
    'The demographic definitions could not be read. You can configure demographics later.',
  'reactory.organizations.wizard.review.title': 'Review and create',
  'reactory.organizations.wizard.review.hint':
    'Review the details below, then create the organization.',
  'reactory.organizations.wizard.review.branding': 'Branding',
  'reactory.organizations.wizard.review.notSet': 'Not set',
  'reactory.organizations.wizard.review.created': '{{name}} was created.',
  'reactory.organizations.wizard.review.createdWithWarning':
    '{{name}} was created, but some details could not be saved: {{message}}',
  'reactory.organizations.wizard.review.error': 'The organization could not be created.',

  // ---- Detail shell ----
  'reactory.organizations.detail.loading': 'Loading organization…',
  'reactory.organizations.detail.notFound': 'Organization not found',
  'reactory.organizations.detail.notFoundHint':
    'The organization may have been removed, or the link may be incomplete.',
  'reactory.organizations.detail.error': 'The organization could not be loaded',
  'reactory.organizations.detail.retry': 'Retry',
  'reactory.organizations.detail.back': 'Back to organizations',
  'reactory.organizations.detail.members': 'Members',
  'reactory.organizations.detail.businessUnits': 'Business units',
  'reactory.organizations.detail.teams': 'Teams',
  'reactory.organizations.detail.comingSoon':
    'Overview, branding, structure, people, demographics and settings tabs follow in ORG-011 onwards.',
  'reactory.organizations.detail.themeInherited': 'Inherits the client theme',
} as const;

export type OrganizationMessageKey = keyof typeof ORGANIZATION_MESSAGES;

type MessageValues = Record<string, string | number>;

/**
 * Minimal `{{token}}` interpolation for the fallback path. i18next does this
 * itself when it is available; the fallback must not depend on it.
 */
const interpolate = (template: string, values?: MessageValues): string => {
  if (!values) return template;
  return Object.keys(values).reduce(
    (message, token) => message.split(`{{${token}}}`).join(`${values[token]}`),
    template,
  );
};

/**
 * Resolve a message key against the Reactory i18n instance, falling back to the
 * catalogue's English default.
 *
 * `defaultValue` is passed to i18next rather than pre-resolving the text so a
 * translation that exists always wins, even before this plugin ships its own
 * bundle.
 */
export const translate = (
  reactory: any,
  key: OrganizationMessageKey,
  values?: MessageValues,
): string => {
  const fallback = ORGANIZATION_MESSAGES[key] || key;
  const i18n = reactory && reactory.i18n;

  if (i18n && typeof i18n.t === 'function') {
    const translated = i18n.t(key, { ...(values || {}), defaultValue: fallback });
    return typeof translated === 'string' && translated.length > 0 ? translated : fallback;
  }

  return interpolate(fallback, values);
};

/**
 * Bind the translator to a Reactory API instance.
 *
 * Deliberately a plain factory (not a hook): components already hold
 * `reactory`, and a factory keeps the components free of an extra hook call
 * while still making the key usage explicit at every call site.
 */
export const makeTranslator =
  (reactory: any) =>
  (key: OrganizationMessageKey, values?: MessageValues): string =>
    translate(reactory, key, values);

/**
 * Resolve a hook-returned error into display text.
 *
 * The server's message wins when it sent one — it names the actual reason
 * ("Organization not found", "Not authorized for this client") and cannot be
 * translated. Otherwise the key's translation is used.
 */
export const resolveError = (
  t: (key: OrganizationMessageKey, values?: MessageValues) => string,
  error?: { key: OrganizationMessageKey; serverMessage?: string | null } | null,
): string => {
  if (!error) return '';
  const serverMessage = typeof error.serverMessage === 'string' ? error.serverMessage.trim() : '';
  return serverMessage.length > 0 ? serverMessage : t(error.key);
};

export default ORGANIZATION_MESSAGES;
