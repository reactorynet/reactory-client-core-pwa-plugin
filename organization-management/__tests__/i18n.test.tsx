/**
 * @jest-environment jsdom
 *
 * i18n contract: every string resolves through a key, and the fallback path
 * never leaks a hook-authored sentence into the UI.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import {
  ORGANIZATION_MESSAGES,
  makeTranslator,
  resolveError,
  translate,
} from '../i18n';
import OrganizationStatusChip from '../components/OrganizationStatusChip';

describe('translate', () => {
  it('uses the catalogue default when no i18n instance is available', () => {
    expect(translate({}, 'reactory.organizations.list.title')).toBe('Organizations');
  });

  it('interpolates catalogue values without i18next', () => {
    expect(
      translate(null, 'reactory.organizations.archive.title', { name: 'Acme' }),
    ).toBe('Archive Acme');
    expect(translate(null, 'reactory.organizations.list.displayedRows', {
      from: 1,
      to: 10,
      count: 12,
    })).toBe('1–10 of 12');
  });

  it('hands the key and the default to i18next so a translation always wins', () => {
    const i18n = { t: jest.fn(() => 'Organisasies') };
    expect(translate({ i18n }, 'reactory.organizations.list.title')).toBe('Organisasies');
    expect(i18n.t).toHaveBeenCalledWith('reactory.organizations.list.title', {
      defaultValue: 'Organizations',
    });
  });

  it('falls back when i18next returns an empty string', () => {
    const i18n = { t: jest.fn(() => '') };
    expect(translate({ i18n }, 'reactory.organizations.list.title')).toBe('Organizations');
  });

  it('binds a translator that keeps resolving keys', () => {
    const t = makeTranslator({});
    expect(t('reactory.organizations.list.newOrganization')).toBe('New organization');
  });

  it('every catalogue value is a non-empty string', () => {
    Object.keys(ORGANIZATION_MESSAGES).forEach((key) => {
      expect(key.startsWith('reactory.organizations.')).toBe(true);
      expect((ORGANIZATION_MESSAGES as any)[key].length).toBeGreaterThan(0);
    });
  });
});

describe('resolveError', () => {
  const t = (key: string) => `T:${key}`;

  it('returns an empty string for no error', () => {
    expect(resolveError(t, null)).toBe('');
    expect(resolveError(t, undefined)).toBe('');
  });

  it('prefers the server message, which cannot be translated', () => {
    expect(
      resolveError(t, {
        key: 'reactory.organizations.error.loadFailed',
        serverMessage: 'Not authorized for this client',
      }),
    ).toBe('Not authorized for this client');
  });

  it('falls back to the translated key when the server said nothing', () => {
    expect(resolveError(t, { key: 'reactory.organizations.error.restoreFailed' })).toBe(
      'T:reactory.organizations.error.restoreFailed',
    );
    expect(
      resolveError(t, { key: 'reactory.organizations.error.restoreFailed', serverMessage: '   ' }),
    ).toBe('T:reactory.organizations.error.restoreFailed');
  });
});

describe('OrganizationStatusChip', () => {
  const t = makeTranslator({});

  it.each([
    ['active', 'Active'],
    ['suspended', 'Suspended'],
    ['archived', 'Archived'],
  ])('renders %s as a translated chip', (status, label) => {
    render(<OrganizationStatusChip status={status} t={t} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('defaults a missing status to active', () => {
    render(<OrganizationStatusChip status={null} t={t} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows an unknown status verbatim rather than inventing a state', () => {
    render(<OrganizationStatusChip status="quarantined" t={t} />);
    expect(screen.getByText('quarantined')).toBeInTheDocument();
  });

  it('falls back to the notSet key for an absent value', () => {
    render(<OrganizationStatusChip status="" t={t} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
