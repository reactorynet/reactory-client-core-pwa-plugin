/**
 * @jest-environment jsdom
 *
 * Detail shell contract (ORG-010).
 *
 * The wizard routes to `/organizations/:id` after a create, so the detail
 * component must resolve that route's id and render the identity header plus
 * the statistics the API already exposes. All reads go through
 * `useOrganizationDetail`; the panel is presentational.
 */
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationDetailPanel from '../OrganizationDetailPanel';
import { makeOrganization, makeReactory, queryCallsFor } from './testFixtures';

afterEach(cleanup);

describe('organizationIdFromPath', () => {
  it('reads the id from the detail route', async () => {
    const { organizationIdFromPath } = await import('../utils');
    expect(organizationIdFromPath('/organizations/64f0aa')).toBe('64f0aa');
    expect(organizationIdFromPath('/organizations/64f0aa/people')).toBe('64f0aa');
  });

  it('returns an empty string when the path carries no id', async () => {
    const { organizationIdFromPath } = await import('../utils');
    expect(organizationIdFromPath('/organizations')).toBe('');
    expect(organizationIdFromPath(undefined)).toBe('');
  });
});

describe('OrganizationDetailPanel', () => {
  it('renders the identity header and the member / unit / team counts', async () => {
    const organization = makeOrganization({ id: 'org-1' });
    const reactory = makeReactory({
      organizations: [organization],
      statistics: { 'org-1': { members: 9, businessUnits: 2, teams: 5 } },
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);

    expect(await screen.findByRole('heading', { name: 'Acme Holdings' })).toBeInTheDocument();
    expect(screen.getByText('ACME')).toBeInTheDocument();

    expect(await screen.findByText('9')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('resolves the id from the router path when no prop is supplied', async () => {
    const organization = makeOrganization({ id: 'org-1' });
    const reactory = makeReactory({ organizations: [organization] });
    reactory.location = { pathname: '/organizations/org-1' } as any;

    render(<OrganizationDetailPanel reactory={reactory} />);

    expect(await screen.findByRole('heading', { name: 'Acme Holdings' })).toBeInTheDocument();
    expect(queryCallsFor(reactory, 'CoreOrganization')[0][1]).toEqual({ id: 'org-1' });
  });

  it('reports a missing organization instead of rendering an empty shell', async () => {
    const reactory = makeReactory({ organizations: [] });

    render(<OrganizationDetailPanel reactory={reactory} id="missing" />);

    expect(await screen.findByText('Organization not found')).toBeInTheDocument();
    // A missing organization must not trigger the counts query.
    expect(queryCallsFor(reactory, 'OrganizationStatistics')).toHaveLength(0);
  });

  it('uses the notSet key for a metric that has not loaded', async () => {
    const organization = makeOrganization({ id: 'org-1' });
    const reactory = makeReactory({
      organizations: [organization],
      queryImpl: (operation) =>
        operation === 'OrganizationStatistics'
          ? { data: null, errors: [{ message: 'Counts unavailable' }] }
          : undefined,
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);

    await screen.findByRole('heading', { name: 'Acme Holdings' });
    // The failed counts leave the header intact and render the placeholder.
    await waitFor(() => expect(screen.getAllByText('—')).toHaveLength(3));
    // The counts failure is swallowed: no load error is shown, only the info
    // banner that advertises the follow-up tabs.
    expect(screen.queryByText('The organization could not be loaded')).not.toBeInTheDocument();
  });

  it('navigates back to the list', async () => {
    const organization = makeOrganization();
    const reactory = makeReactory({ organizations: [organization] });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);

    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await userEvent.click(screen.getByRole('button', { name: 'Back to organizations' }));

    expect(reactory.navigation).toHaveBeenCalledWith('/organizations');
  });
});
