/**
 * @jest-environment jsdom
 *
 * Route wrapper contract (QA-6).
 *
 * `OrganizationCreateWizard` is a controlled dialog, so registering it as a
 * route target would render a closed dialog — a blank page. `OrganizationCreatePage`
 * is the routable wrapper: it opens the wizard, and turns close/created into
 * navigation. This suite pins both behaviours.
 */
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationCreatePage from '../OrganizationCreatePage';
import { makeReactory, mutationCallsFor } from './testFixtures';

afterEach(cleanup);

describe('OrganizationCreatePage', () => {
  it('opens the wizard immediately, so the route is not a blank page', async () => {
    const reactory = makeReactory();

    render(<OrganizationCreatePage reactory={reactory} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New organization' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
  });

  it('navigates back to the list when the wizard is cancelled', async () => {
    const reactory = makeReactory();

    render(<OrganizationCreatePage reactory={reactory} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(reactory.navigation).toHaveBeenCalledWith('/organizations');
    expect(mutationCallsFor(reactory, 'createOrganization')).toHaveLength(0);
  });

  it('honours a custom list route', async () => {
    const reactory = makeReactory();

    render(<OrganizationCreatePage reactory={reactory} listRoute="/admin/organizations" />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(reactory.navigation).toHaveBeenCalledWith('/admin/organizations');
  });

  it('navigates to the new organization after a successful create', async () => {
    const reactory = makeReactory();

    render(<OrganizationCreatePage reactory={reactory} />);

    await userEvent.type(screen.getByLabelText(/^Name/), 'Acme Holdings');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(reactory.navigation).toHaveBeenCalledWith('/organizations/org-created-1'));
    expect(reactory.createNotification).toHaveBeenCalledWith(
      'Acme Holdings was created.',
      expect.anything(),
    );
  });

  it('supports a custom detail route', async () => {
    const reactory = makeReactory();

    render(
      <OrganizationCreatePage
        reactory={reactory}
        detailRoute={(organization) => `/orgs/${organization.id}`}
      />,
    );

    await userEvent.type(screen.getByLabelText(/^Name/), 'Acme Holdings');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(reactory.navigation).toHaveBeenCalledWith('/orgs/org-created-1'));
  });
});

/**
 * Route configuration (ORG-016).
 *
 * ORG-015 mounted the surface at `/organizations/manage/*` while this wrapper
 * still cancelled to the literal `/organizations` and sent a fresh organization
 * to `/organizations/<id>` — a path with no route. `basePath` is the
 * serialisable knob a route config can pass (`componentProps` is JSON, so
 * `detailRoute` cannot be configured); `listRoute` still overrides where
 * "cancel" goes, and the defaults remain `/organizations`.
 */
describe('OrganizationCreatePage — basePath', () => {
  /** Walk the wizard's four steps and submit. */
  const submitCreate = async (name = 'Acme Holdings') => {
    await userEvent.type(screen.getByLabelText(/^Name/), name);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));
  };

  it('sends the user to `${basePath}/<id>` after a successful create', async () => {
    const reactory = makeReactory();

    render(<OrganizationCreatePage reactory={reactory} basePath="/organizations/manage" />);

    await submitCreate();

    await waitFor(() =>
      expect(reactory.navigation).toHaveBeenCalledWith('/organizations/manage/org-created-1'),
    );
  });

  it('cancels to basePath when no list route is supplied', async () => {
    const reactory = makeReactory();

    render(<OrganizationCreatePage reactory={reactory} basePath="/organizations/manage" />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // The list now lives under the manage prefix too, so cancelling must not
    // fall back to the legacy panel.
    expect(reactory.navigation).toHaveBeenCalledWith('/organizations/manage');
  });

  it('does not double the slash for a basePath with a trailing slash', async () => {
    const reactory = makeReactory();

    render(<OrganizationCreatePage reactory={reactory} basePath="/organizations/manage/" />);

    await submitCreate();

    await waitFor(() => expect(reactory.navigation).toHaveBeenCalledTimes(1));
    const [path] = reactory.navigation.mock.calls[0];
    expect(path).toBe('/organizations/manage/org-created-1');
    expect(path).not.toContain('//');
  });

  it('keeps an explicit listRoute ahead of basePath', async () => {
    const reactory = makeReactory();

    render(
      <OrganizationCreatePage
        reactory={reactory}
        basePath="/organizations/manage"
        listRoute="/admin/organizations"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(reactory.navigation).toHaveBeenCalledWith('/admin/organizations');
  });

  it('keeps the detailRoute function ahead of basePath', async () => {
    const reactory = makeReactory();

    render(
      <OrganizationCreatePage
        reactory={reactory}
        basePath="/organizations/manage"
        detailRoute={(organization) => `/orgs/${organization.id}`}
      />,
    );

    await submitCreate();

    await waitFor(() => expect(reactory.navigation).toHaveBeenCalledWith('/orgs/org-created-1'));
  });
});