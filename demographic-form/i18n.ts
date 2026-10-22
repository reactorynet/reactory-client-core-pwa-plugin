/**
 * Message catalogue for the shared demographic form renderer.
 *
 * Every user-facing string in `demographic-form/` is a key in this catalogue —
 * no component renders a bare literal. Keys follow the client's
 * `reactory.<area>.<key>` convention (see `reactory-data/i18n/<lang>/reactory.json`)
 * so the renderer can be translated without touching a component.
 *
 * Translation resolution:
 *   1. `reactory.i18n.t(key, { defaultValue, ...values })` when the SDK exposes
 *      an i18n instance (the normal runtime).
 *   2. The English default below, so ORG-031's live preview and the tests still
 *      render when i18n is not initialised.
 */

export const DEMOGRAPHIC_MESSAGES = {
  // ---- Form ----
  'reactory.demographics.form.empty': 'No demographic fields are configured.',

  // ---- Field chrome ----
  'reactory.demographics.field.required': 'Required',
  'reactory.demographics.field.sensitive': 'Sensitive',
  'reactory.demographics.field.notSet': '—',

  // ---- Widget resolution ----
  'reactory.demographics.widget.missing':
    'The widget "{{fqn}}" is not registered. Showing the default {{valueType}} input instead.',
  'reactory.demographics.widget.unsupportedType':
    'No control is registered for the "{{valueType}}" value type. Showing a text input.',
  'reactory.demographics.widget.formUnavailable':
    'The form engine is not available, so this {{valueType}} value cannot be edited here.',

  // ---- Boolean ----
  'reactory.demographics.boolean.yes': 'Yes',
  'reactory.demographics.boolean.no': 'No',

  // ---- Select / autocomplete ----
  'reactory.demographics.select.placeholder': 'Select {{title}}',
  'reactory.demographics.select.noOptions': 'No options are configured for this field.',
  'reactory.demographics.multiEnum.placeholder': 'Select one or more',
  'reactory.demographics.multiEnum.noOptions': 'No options are configured for this field.',

  // ---- Array ----
  'reactory.demographics.array.empty': 'No items yet.',
  'reactory.demographics.array.add': 'Add {{title}}',
  'reactory.demographics.array.remove': 'Remove item {{index}}',
  'reactory.demographics.array.itemLabel': '{{title}} item {{index}}',

  // ---- Reference ----
  'reactory.demographics.reference.placeholder': 'Select {{title}}',
  'reactory.demographics.reference.loading': 'Loading options…',
  'reactory.demographics.reference.loadFailed': 'The options could not be loaded.',
  'reactory.demographics.reference.noSource':
    'No data source was supplied for the "{{model}}" reference. Options cannot be shown.',
  'reactory.demographics.reference.empty': 'No matching records were found.',
} as const;

export type DemographicMessageKey = keyof typeof DEMOGRAPHIC_MESSAGES;

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
  key: DemographicMessageKey,
  values?: MessageValues,
): string => {
  const fallback = DEMOGRAPHIC_MESSAGES[key] || key;
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
 * Deliberately a plain factory (not a hook), matching `organization-management`:
 * components already hold `reactory`, and a factory keeps them free of an extra
 * hook call while making key usage explicit at every call site.
 */
export const makeTranslator =
  (reactory: any) =>
  (key: DemographicMessageKey, values?: MessageValues): string =>
    translate(reactory, key, values);

export default DEMOGRAPHIC_MESSAGES;
