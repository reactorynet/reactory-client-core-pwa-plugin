/**
 * Message catalogue resolution.
 *
 * The fallback path matters as much as i18next: ORG-031's live preview and the
 * suite itself run without an i18n instance, and a missing translation must
 * still produce a sensible English string rather than a raw key.
 */
import { DEMOGRAPHIC_MESSAGES, makeTranslator, translate } from '../i18n';

describe('translate', () => {
  it('interpolates the English default when no i18n instance is present', () => {
    expect(
      translate({}, 'reactory.demographics.widget.missing', {
        fqn: 'acme.Gone@1.0.0',
        valueType: 'boolean',
      }),
    ).toBe(
      'The widget "acme.Gone@1.0.0" is not registered. Showing the default boolean input instead.',
    );
  });

  it('interpolates without values at all', () => {
    expect(translate(undefined, 'reactory.demographics.field.required')).toBe('Required');
  });

  it('leaves an unreplaced token alone when its value is missing', () => {
    expect(translate({}, 'reactory.demographics.array.remove')).toBe('Remove item {{index}}');
  });

  it('prefers a translation from the SDK i18n instance', () => {
    const reactory = {
      i18n: { t: jest.fn(() => 'Vereiste veld') },
    };

    expect(translate(reactory, 'reactory.demographics.field.required')).toBe('Vereiste veld');
    expect(reactory.i18n.t).toHaveBeenCalledWith('reactory.demographics.field.required', {
      defaultValue: 'Required',
    });
  });

  it('falls back when i18n returns an empty string or a non-string', () => {
    expect(
      translate({ i18n: { t: () => '' } }, 'reactory.demographics.field.required'),
    ).toBe('Required');
    expect(
      translate({ i18n: { t: () => undefined as any } }, 'reactory.demographics.field.required'),
    ).toBe('Required');
  });

  it('uses the key itself for a key outside the catalogue', () => {
    expect(translate({}, 'reactory.demographics.unknown.key' as any)).toBe(
      'reactory.demographics.unknown.key',
    );
  });

  it('binds the translator through makeTranslator', () => {
    const t = makeTranslator({});

    expect(t('reactory.demographics.field.sensitive')).toBe('Sensitive');
    expect(t('reactory.demographics.array.add', { title: 'Employers' })).toBe('Add Employers');
  });
});

describe('DEMOGRAPHIC_MESSAGES', () => {
  it('namespaces every key so it can be translated', () => {
    Object.keys(DEMOGRAPHIC_MESSAGES).forEach((key) => {
      expect(key.startsWith('reactory.demographics.')).toBe(true);
    });
  });

  it('has no empty message', () => {
    Object.entries(DEMOGRAPHIC_MESSAGES).forEach(([, message]) => {
      expect(String(message).trim().length).toBeGreaterThan(0);
    });
  });
});
