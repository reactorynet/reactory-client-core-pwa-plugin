/**
 * @jest-environment jsdom
 *
 * Organization creation wizard contract (ORG-010).
 *
 * The wizard is the only place an organization is created, so these tests walk
 * the actual steps: per-step validation must block progress, the branding step
 * must only record a choice, the demographics step must degrade to "configure
 * later", and submitting must produce the two-call create/update sequence that
 * the server input shape requires.
 */
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationCreateWizard from '../OrganizationCreateWizard';
import { makeReactory, mutationCallsFor, queryCallsFor } from './testFixtures';

afterEach(cleanup);

const renderWizard = (reactory: any, props: Record<string, any> = {}) => {
  const onCreated = jest.fn();
  const onClose = jest.fn();

  const result = render(
    <OrganizationCreateWizard
      reactory={reactory}
      open
      onClose={onClose}
      onCreated={onCreated}
      {...props}
    />,
  );

  return { ...result, onCreated, onClose };
};

const fillIdentity = async (values: {
  name?: string;
  code?: string;
  tradingName?: string;
  description?: string;
}) => {
  // The required name field renders a `*` inside its label, so match by prefix.
  if (values.name !== undefined) {
    await userEvent.type(screen.getByLabelText(/^Name/), values.name);
  }
  if (values.code !== undefined) {
    await userEvent.type(screen.getByLabelText(/^Code/), values.code);
  }
  if (values.tradingName !== undefined) {
    await userEvent.type(screen.getByLabelText(/^Trading name/), values.tradingName);
  }
  if (values.description !== undefined) {
    await userEvent.type(screen.getByLabelText(/^Description/), values.description);
  }
};

describe('OrganizationCreateWizard', () => {
  it('blocks the identity step until a name is provided', async () => {
    const reactory = makeReactory();

    renderWizard(reactory);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('A name is required.')).toBeInTheDocument();
    // Still on step 1: the branding choice is not rendered yet.
    expect(screen.queryByRole('radio', { name: 'Inherit the client theme' })).not.toBeInTheDocument();
    expect(mutationCallsFor(reactory, 'createOrganization')).toHaveLength(0);
  });

  it('rejects a code that is not integration friendly', async () => {
    const reactory = makeReactory();

    renderWizard(reactory);

    await fillIdentity({ name: 'Acme Holdings', code: 'acme holdings!' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByText('Use letters, numbers, dots, dashes or underscores only.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Inherit the client theme' })).not.toBeInTheDocument();
  });

  it('moves through branding and demographics, then creates on review', async () => {
    const reactory = makeReactory();

    const { onCreated } = renderWizard(reactory);

    await fillIdentity({
      name: 'Acme Holdings',
      code: 'ACME',
      tradingName: 'Acme Trading',
      description: 'A holding company.',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2 only records the choice; it is not a theme editor.
    expect(screen.getByRole('radio', { name: 'Inherit the client theme' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Start with no theme' }));

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3 degrades to a placeholder instead of querying a missing API.
    expect(screen.getByTestId('organization-demographics-placeholder')).toBeInTheDocument();
    expect(screen.getByText('Configure demographics later')).toBeInTheDocument();
    expect(queryCallsFor(reactory, 'OrganizationDemographicDefinitions')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Review shows exactly what will be sent.
    expect(screen.getByText('Acme Holdings')).toBeInTheDocument();
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('Acme Trading')).toBeInTheDocument();
    expect(screen.getByText('A holding company.')).toBeInTheDocument();
    expect(screen.getByText('Start with no theme')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'createOrganization')).toHaveLength(1),
    );

    // CreateOrganizationInput only carries name/code.
    expect(mutationCallsFor(reactory, 'createOrganization')[0][1]).toEqual({
      input: { name: 'Acme Holdings', code: 'ACME' },
    });

    // Identity extras and the branding decision follow in one update.
    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(1),
    );
    expect(mutationCallsFor(reactory, 'updateOrganization')[0][1]).toEqual({
      id: 'org-created-1',
      input: {
        tradingName: 'Acme Trading',
        description: 'A holding company.',
        theme: null,
      },
    });

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0][0]).toMatchObject({ id: 'org-created-1', name: 'Acme Holdings' });
    expect(onCreated.mock.calls[0][1]).toBeNull();
  });

  it('does not clear the theme when the client theme is inherited', async () => {
    const reactory = makeReactory();

    renderWizard(reactory);

    await fillIdentity({ name: 'Acme Holdings' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'createOrganization')).toHaveLength(1),
    );

    // Nothing beyond the create input is required: inherit is the default.
    expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(0);
  });

  it('keeps the dialog open and reports a create failure', async () => {
    const reactory = makeReactory({
      mutationImpl: (operation) =>
        operation === 'createOrganization'
          ? { data: null, errors: [{ message: 'An organization with this code already exists' }] }
          : undefined,
    });

    const { onCreated } = renderWizard(reactory);

    await fillIdentity({ name: 'Acme Holdings' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An organization with this code already exists');
    expect(onCreated).not.toHaveBeenCalled();
    // The wizard is still usable — the create button is back to its label.
    expect(
      screen.getByRole('button', { name: 'Create organization' }),
    ).toBeInTheDocument();
  });

  it('still reports success when the follow-up update fails', async () => {
    const reactory = makeReactory({
      mutationImpl: (operation) =>
        operation === 'updateOrganization'
          ? { data: null, errors: [{ message: 'tradingName rejected' }] }
          : undefined,
    });

    const { onCreated } = renderWizard(reactory);

    await fillIdentity({ name: 'Acme Holdings', tradingName: 'Acme Trading' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    // The organization exists, so creation is not reported as failed. The
    // warning is a key + the server's text, not a rendered sentence: the host
    // decides how to display it.
    expect(onCreated.mock.calls[0][0]).toMatchObject({ name: 'Acme Holdings' });
    expect(onCreated.mock.calls[0][1]).toEqual({
      key: 'reactory.organizations.error.saveFailed',
      serverMessage: 'tradingName rejected',
    });
  });

  it('warns that demographics are unavailable when an organization id is supplied', async () => {
    const reactory = makeReactory();

    renderWizard(reactory, { organizationId: 'org-1' });

    await fillIdentity({ name: 'Acme Holdings' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByText(/demographic definitions API is not available/i),
    ).toBeInTheDocument();
    // The schema rejection was classified, not thrown.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
