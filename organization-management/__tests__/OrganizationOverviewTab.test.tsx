/**
 * @jest-environment jsdom
 *
 * Overview tab contract (ORG-011).
 *
 * The tab is rendered directly with `OrganizationTabProps`: the shell supplies
 * the same props, so this exercises the real component without standing up the
 * whole detail panel for every form assertion.
 */
import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationOverviewTab, {
  buildOverviewUpdateInput,
  fieldForServerMessage,
  isHttpUrl,
  overviewDraftFromOrganization,
  overviewDraftIsDirty,
  validateOverviewDraft,
} from '../OrganizationOverviewTab';
import { makeTranslator } from '../i18n';
import { NAME_MAX_LENGTH } from '../OrganizationCreateWizard';
import type { OrganizationTabProps } from '../types';
import {
  makeOrganization,
  makeReactory,
  mutationCallsFor,
  selectOption,
} from './testFixtures';

afterEach(cleanup);

interface SetupOptions {
  canManage?: boolean;
  organization?: ReturnType<typeof makeOrganization>;
  reactory?: any;
}

const setup = (options: SetupOptions = {}) => {
  const organization = options.organization || makeOrganization();
  // The stub keeps the record in its mutation state, so a save round-trips and
  // a reload sees the updated payload exactly as the real API would.
  const reactory = options.reactory || makeReactory({ organizations: [organization] });
  const props: OrganizationTabProps = {
    reactory,
    t: makeTranslator({}),
    organization,
    statistics: null,
    canManage: options.canManage !== false,
    refresh: jest.fn().mockResolvedValue(undefined),
    onUnsavedChanges: jest.fn(),
    notify: jest.fn(),
  };

  const utils = render(<OrganizationOverviewTab {...props} />);
  return { ...utils, props, reactory };
};

describe('Overview validation helpers', () => {
  const draft = (overrides: Record<string, string> = {}) => ({
    ...overviewDraftFromOrganization(makeOrganization()),
    ...overrides,
  });

  it('requires a name', () => {
    const errors = validateOverviewDraft(draft({ name: '   ' }));
    expect(errors.name?.key).toBe('reactory.organizations.overview.field.nameRequired');
  });

  it('accepts a blank optional email and website', () => {
    expect(validateOverviewDraft(draft({ contactEmail: '', website: '' }))).toEqual({});
  });

  it('rejects a malformed email', () => {
    const errors = validateOverviewDraft(draft({ contactEmail: 'not-an-email' }));
    expect(errors.contactEmail?.key).toBe('reactory.organizations.overview.field.emailInvalid');
  });

  it('rejects a website that is not an absolute http(s) URL', () => {
    expect(isHttpUrl('acme.example')).toBe(false);
    expect(isHttpUrl('ftp://acme.example')).toBe(false);
    expect(isHttpUrl('https://acme.example')).toBe(true);

    const errors = validateOverviewDraft(draft({ website: 'acme.example' }));
    expect(errors.website?.key).toBe('reactory.organizations.overview.field.websiteInvalid');
  });

  it('projects an absent organization onto an empty draft', () => {
    // The tab is only rendered with a loaded organization, but the projector is
    // the single place the "field is missing" shape is handled.
    expect(overviewDraftFromOrganization(null)).toEqual({
      name: '',
      code: '',
      tradingName: '',
      legalName: '',
      description: '',
      website: '',
      contactEmail: '',
      contactPhone: '',
      status: 'active',
    });

    expect(
      overviewDraftFromOrganization(
        makeOrganization({
          name: 'Only a name',
          code: null,
          tradingName: null,
          legalName: null,
          description: null,
          website: null,
          contactEmail: null,
          contactPhone: null,
          status: null,
        }),
      ),
    ).toEqual({
      name: 'Only a name',
      code: '',
      tradingName: '',
      legalName: '',
      description: '',
      website: '',
      contactEmail: '',
      contactPhone: '',
      status: 'active',
    });
  });

  it('rejects a name longer than the create wizard allows', () => {
    const errors = validateOverviewDraft(
      draft({ name: 'a'.repeat(NAME_MAX_LENGTH + 1) }),
    );
    expect(errors.name?.key).toBe('reactory.organizations.overview.field.nameTooLong');
    expect(errors.name?.values).toEqual({ max: NAME_MAX_LENGTH });
  });

  it('treats trimmed whitespace as unchanged', () => {
    const baseline = overviewDraftFromOrganization(makeOrganization());
    expect(overviewDraftIsDirty(baseline, { ...baseline, name: '  Acme Holdings  ' })).toBe(false);
    expect(overviewDraftIsDirty(baseline, { ...baseline, name: 'Acme Holdings Ltd' })).toBe(true);
  });

  it('sends only changed fields and clears with null', () => {
    const baseline = overviewDraftFromOrganization(makeOrganization());
    expect(buildOverviewUpdateInput(baseline, baseline)).toEqual({});

    expect(
      buildOverviewUpdateInput(baseline, { ...baseline, tradingName: '', website: '' }),
    ).toEqual({ tradingName: null, website: null });

    expect(buildOverviewUpdateInput(baseline, { ...baseline, name: 'Acme Ltd' })).toEqual({
      name: 'Acme Ltd',
    });

    // A clearable field set to a new value travels as that value, not as null.
    expect(
      buildOverviewUpdateInput(baseline, {
        ...baseline,
        code: ' ACME2 ',
        website: 'https://acme.example/new',
      }),
    ).toEqual({ code: 'ACME2', website: 'https://acme.example/new' });

    // An emptied status is not a clearing field; it is simply not sent.
    expect(buildOverviewUpdateInput(baseline, { ...baseline, status: '' })).toEqual({});
  });

  it.each([
    ['contactEmail must be a valid email address', 'contactEmail'],
    ['e-mail is malformed', 'contactEmail'],
    ['website is not a valid URL', 'website'],
    ['contact phone must be a number', 'contactPhone'],
    ['telephone is invalid', 'contactPhone'],
    ['trading name is too long', 'tradingName'],
    ['legal name is required', 'legalName'],
    ['description is too long', 'description'],
    ['status must be active, suspended or archived', 'status'],
    ['code is already in use', 'code'],
    ['A name is required.', 'name'],
  ])('maps %s to %s', (message, field) => {
    expect(fieldForServerMessage(message)).toBe(field);
  });

  it('leaves a message that names no field unassigned', () => {
    expect(fieldForServerMessage('Not authorized for this client')).toBeNull();
    expect(fieldForServerMessage('')).toBeNull();
    expect(fieldForServerMessage(null)).toBeNull();
  });
});

describe('OrganizationOverviewTab — read and edit', () => {
  it('renders the loaded identity, contact and record fields', () => {
    setup();

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Acme Holdings');
    expect(screen.getByLabelText('Code')).toHaveValue('ACME');
    expect(screen.getByLabelText('Trading name')).toHaveValue('Acme Trading (Pty) Ltd');
    expect(screen.getByLabelText('Legal name')).toHaveValue('Acme Holdings (Pty) Ltd');
    expect(screen.getByLabelText('Description')).toHaveValue('A holding company.');
    expect(screen.getByLabelText('Website')).toHaveValue('https://acme.example');
    expect(screen.getByLabelText('Contact email')).toHaveValue('hello@acme.example');
    expect(screen.getByLabelText('Contact phone')).toHaveValue('+27 11 555 0100');

    // Read-only audit rows.
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });

  it('shows createdBy / updatedBy only when the payload carries them', () => {
    setup({
      organization: makeOrganization({ createdBy: 'user-1', updatedBy: 'user-2' }),
    });

    expect(screen.getByText('Created by')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByText('Updated by')).toBeInTheDocument();
    expect(screen.getByText('user-2')).toBeInTheDocument();
  });

  it('falls back to the notSet key for timestamps the payload does not carry', () => {
    // createdAt/updatedAt are optional on the type; an old record may omit them.
    setup({ organization: makeOrganization({ createdAt: null, updatedAt: null }) });

    const recordSection = screen.getByText('Record').closest('.MuiCardContent-root');
    expect(recordSection).not.toBeNull();
    expect(recordSection!.querySelectorAll('p.MuiTypography-body2').length).toBe(2);
    expect(screen.getAllByText('—').length).toBe(2);
  });

  it('edits every optional identity and contact field', async () => {
    const { reactory } = setup();

    const setField = async (label: string, value: string) => {
      const input = screen.getByLabelText(label);
      await userEvent.clear(input);
      await userEvent.type(input, value);
    };

    await setField('Code', 'ACME2');
    await setField('Legal name', 'Acme Legal (Pty) Ltd');
    await setField('Description', 'Updated description.');
    await setField('Contact phone', '+27 11 555 0199');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(1),
    );
    expect(mutationCallsFor(reactory, 'updateOrganization')[0][1]).toEqual({
      id: 'org-1',
      input: {
        code: 'ACME2',
        legalName: 'Acme Legal (Pty) Ltd',
        description: 'Updated description.',
        contactPhone: '+27 11 555 0199',
      },
    });
  });

  it('treats a whitespace-only edit as no edit at all', async () => {
    const { reactory } = setup();

    const code = screen.getByLabelText('Code');
    await userEvent.type(code, '   ');

    // Dirty is computed on trimmed values, so nothing is written.
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(0);
  });

  it('disables Save until something changes', async () => {
    const { reactory } = setup();

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^Name/), ' Ltd');
    expect(save).toBeEnabled();
    expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(0);
  });

  it('saves the changed fields, refreshes and emits the update event', async () => {
    const organization = makeOrganization();
    const { props, reactory } = setup({ organization });

    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Acme Holdings Ltd');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(1),
    );

    const [, variables] = mutationCallsFor(reactory, 'updateOrganization')[0];
    expect(variables).toEqual({ id: 'org-1', input: { name: 'Acme Holdings Ltd' } });

    expect(props.refresh).toHaveBeenCalled();
    expect(props.notify).toHaveBeenCalledWith('Acme Holdings Ltd was updated.', 'success');
    expect(reactory.emit).toHaveBeenCalledWith(
      'core.OrganizationUpdatedEvent',
      expect.objectContaining({ id: 'org-1', name: 'Acme Holdings Ltd' }),
    );
    // The shell listens on the postal bus, not the emitter (ORG-043 RC-1), so
    // the save must reach that bus too.
    expect(reactory.amq.$pub.def).toHaveBeenCalledWith(
      'core.OrganizationUpdatedEvent',
      expect.objectContaining({ id: 'org-1', name: 'Acme Holdings Ltd' }),
      'core.OrganizationUpdatedEvent',
    );
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('clears a field by sending null instead of the previous value', async () => {
    const organization = makeOrganization();
    const { reactory, props } = setup({ organization });

    await userEvent.clear(screen.getByLabelText('Trading name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(1),
    );

    expect(mutationCallsFor(reactory, 'updateOrganization')[0][1]).toEqual({
      id: 'org-1',
      input: { tradingName: null },
    });

    // The reloaded (stubbed) record has the field cleared, and the form settled
    // on it rather than restoring the loaded value.
    await waitFor(() => expect(screen.getByLabelText('Trading name')).toHaveValue(''));
    expect(props.notify).toHaveBeenCalledWith('Acme Holdings was updated.', 'success');
  });

  it('saves a status change', async () => {
    const { reactory } = setup();

    await selectOption(
      screen.getByRole('combobox'),
      'Suspended',
      fireEvent,
      screen,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(1),
    );
    expect(mutationCallsFor(reactory, 'updateOrganization')[0][1]).toEqual({
      id: 'org-1',
      input: { status: 'suspended' },
    });
  });

  it('restores the loaded values on Cancel', async () => {
    const { reactory, props } = setup();

    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Something else');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Acme Holdings');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(0);
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false);
  });
});

describe('OrganizationOverviewTab — validation', () => {
  it('blocks submit on an empty name and shows the field error', async () => {
    const { reactory } = setup();

    await userEvent.clear(screen.getByLabelText(/^Name/));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('A name is required.')).toBeInTheDocument();
    expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(0);
  });

  it('blocks submit on an invalid email', async () => {
    const { reactory } = setup();

    const email = screen.getByLabelText('Contact email');
    await userEvent.clear(email);
    await userEvent.type(email, 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('Enter a valid email address, for example name@example.com.'),
    ).toBeInTheDocument();
    expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(0);
  });

  it('blocks submit on an invalid website', async () => {
    const { reactory } = setup();

    const website = screen.getByLabelText('Website');
    await userEvent.clear(website);
    await userEvent.type(website, 'acme.example');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('Enter a valid http:// or https:// URL.'),
    ).toBeInTheDocument();
    expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(0);
  });

  it('clears a field error as soon as the user edits it', async () => {
    setup();

    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('A name is required.')).toBeInTheDocument();

    await userEvent.type(name, 'Acme');
    await waitFor(() =>
      expect(screen.queryByText('A name is required.')).not.toBeInTheDocument(),
    );
  });
});

describe('OrganizationOverviewTab — server failures', () => {
  it('surfaces a field-scoped server rejection against that field', async () => {
    const reactory = makeReactory({
      mutationImpl: (operation) =>
        operation === 'updateOrganization'
          ? { data: null, errors: [{ message: 'contactEmail must be a valid email address' }] }
          : undefined,
    });

    setup({ reactory });

    const email = screen.getByLabelText('Contact email');
    await userEvent.clear(email);
    await userEvent.type(email, 'someone@acme.example');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('contactEmail must be a valid email address'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('organization-overview-form-error')).not.toBeInTheDocument();
  });

  it('falls back to a form-level alert for a rejection that names no field', async () => {
    const reactory = makeReactory({
      mutationImpl: (operation) =>
        operation === 'updateOrganization'
          ? { data: null, errors: [{ message: 'Not authorized for this client' }] }
          : undefined,
    });

    setup({ reactory });

    await userEvent.type(screen.getByLabelText(/^Name/), ' Ltd');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByTestId('organization-overview-form-error');
    expect(alert).toHaveTextContent('Not authorized for this client');
  });
});

describe('OrganizationOverviewTab — read-only viewer', () => {
  it('renders no write affordances', () => {
    setup({ canManage: false });

    expect(screen.getByTestId('organization-overview-readonly')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeDisabled();
    expect(screen.getByLabelText('Contact email')).toBeDisabled();
  });
});
