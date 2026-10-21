/**
 * @jest-environment jsdom
 *
 * Detail shell contract (ORG-011).
 *
 * ORG-010 shipped a `comingSoon` banner. ORG-011 replaces it with a real
 * header, a data-driven tab bar and the Overview tab, and adds the guards
 * around leaving the panel with unsaved input. These tests pin the shell's
 * observable behaviour: the states it must render, the tabs it must build from
 * the registry, the org-admin actions it may offer, and what a read-only viewer
 * must *not* see.
 */
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationDetailPanel from '../OrganizationDetailPanel';
import { ORGANIZATION_TABS, OVERVIEW_TAB_ID } from '../organizationTabs';
import { makeOrganization, makeReactory, mutationCallsFor, queryCallsFor } from './testFixtures';

afterEach(cleanup);

const pendingPromise = () => new Promise(() => {});

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

describe('OrganizationDetailPanel — header and states', () => {
  it('renders the identity header and the member / unit / team counts', async () => {
    const organization = makeOrganization({ id: 'org-1' });
    const reactory = makeReactory({
      organizations: [organization],
      statistics: { 'org-1': { members: 9, businessUnits: 2, teams: 5 } },
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);

    expect(await screen.findByRole('heading', { name: 'Acme Holdings' })).toBeInTheDocument();
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.getByText('Acme Trading (Pty) Ltd')).toBeInTheDocument();

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

  it('shows the loading state while the organization is in flight', async () => {
    const reactory = makeReactory({
      queryImpl: (operation) => (operation === 'CoreOrganization' ? pendingPromise() : undefined),
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading organization…');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('reports a missing organization instead of rendering an empty shell', async () => {
    const reactory = makeReactory({ organizations: [] });

    render(<OrganizationDetailPanel reactory={reactory} id="missing" />);

    expect(await screen.findByText('Organization not found')).toBeInTheDocument();
    // A missing organization must not trigger the counts query.
    expect(queryCallsFor(reactory, 'OrganizationStatistics')).toHaveLength(0);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('renders the error state and recovers through Retry', async () => {
    let attempts = 0;
    const organization = makeOrganization({ id: 'org-1' });
    const reactory = makeReactory({
      organizations: [organization],
      queryImpl: (operation) => {
        if (operation !== 'CoreOrganization') return undefined;
        attempts += 1;
        return attempts === 1
          ? { data: null, errors: [{ message: 'Organization service unavailable' }] }
          : undefined;
      },
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);

    expect(await screen.findByText('The organization could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('Organization service unavailable')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Acme Holdings' })).toBeInTheDocument();
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

  it('hands Back to the host when it supplies an onBack handler', async () => {
    const organization = makeOrganization();
    const reactory = makeReactory({ organizations: [organization] });
    const onBack = jest.fn();

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" onBack={onBack} />);

    await screen.findByRole('heading', { name: 'Acme Holdings' });
    await userEvent.click(screen.getByRole('button', { name: 'Back to organizations' }));

    // The host owns the destination; the shell must not also navigate.
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(reactory.navigation).not.toHaveBeenCalled();
  });
});

describe('OrganizationDetailPanel — tab registry', () => {
  it('builds the tab bar from the registry, with Overview selected', async () => {
    const reactory = makeReactory({ organizations: [makeOrganization()] });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    const tabs = screen.getAllByRole('tab');
    // One tab per registry entry, in registry order: adding a tab is a data
    // change, not a shell change.
    expect(tabs).toHaveLength(ORGANIZATION_TABS.length);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Branding',
      'Structure',
      'People',
      'Demographics',
      'Settings',
    ]);
    expect(ORGANIZATION_TABS[0].id).toBe(OVERVIEW_TAB_ID);

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // The Overview tab is the implemented one: its form is on screen.
    expect(screen.getByTestId('organization-overview-tab')).toBeInTheDocument();
  });

  it('renders a named placeholder for a tab a later ticket owns', async () => {
    const reactory = makeReactory({ organizations: [makeOrganization()] });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await userEvent.click(screen.getByRole('tab', { name: 'Structure' }));

    expect(await screen.findByTestId('organization-tab-placeholder')).toHaveAttribute(
      'data-ticket',
      'ORG-022',
    );
    expect(screen.getByText('ORG-022 delivers this tab')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-overview-tab')).not.toBeInTheDocument();
  });

  it('renders the real branding tab from the registry', async () => {
    const reactory = makeReactory({ organizations: [makeOrganization()] });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await userEvent.click(screen.getByRole('tab', { name: 'Branding' }));

    expect(await screen.findByTestId('organization-branding-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-tab-placeholder')).not.toBeInTheDocument();
  });

  it('does not ship the ORG-010 comingSoon banner', async () => {
    const reactory = makeReactory({ organizations: [makeOrganization()] });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    expect(
      screen.queryByText(/Overview, branding, structure, people, demographics and settings tabs/),
    ).not.toBeInTheDocument();
  });
});

describe('OrganizationDetailPanel — archive and restore', () => {
  it('archives from the overflow menu and refreshes the panel', async () => {
    const organization = makeOrganization({ id: 'org-1', status: 'active' });
    const reactory = makeReactory({ organizations: [organization] });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await userEvent.click(screen.getByRole('button', { name: 'Organization actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive organization' }));

    expect(await screen.findByText('Archive Acme Holdings')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'archiveOrganization')).toHaveLength(1),
    );
    expect(mutationCallsFor(reactory, 'archiveOrganization')[0][1]).toEqual({ id: 'org-1' });

    // The panel reloads, so the header reflects the new lifecycle state.
    await waitFor(() =>
      expect(screen.getByTestId('organization-detail-status')).toHaveTextContent('Archived'),
    );
    expect(reactory.createNotification).toHaveBeenCalled();
    expect(reactory.emit).toHaveBeenCalledWith(
      'core.OrganizationUpdatedEvent',
      expect.objectContaining({ id: 'org-1', status: 'archived' }),
    );
  });

  it('restores an archived organization from the overflow menu', async () => {
    const organization = makeOrganization({ id: 'org-1', status: 'archived' });
    const reactory = makeReactory({ organizations: [organization] });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await userEvent.click(screen.getByRole('button', { name: 'Organization actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Restore organization' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'restoreOrganization')).toHaveLength(1),
    );
    await waitFor(() =>
      expect(screen.getByTestId('organization-detail-status')).toHaveTextContent('Active'),
    );
  });
});

describe('OrganizationDetailPanel — permissions', () => {
  it('offers only copy-id to a read-only viewer', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1', status: 'active' })],
      roles: ['USER'],
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    // No write affordance on the tab either.
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByTestId('organization-overview-readonly')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Organization actions' }));

    expect(screen.getByRole('menuitem', { name: 'Copy organization id' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Archive organization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Restore organization' })).not.toBeInTheDocument();
  });

  it('honours an ORGANIZATION_ADMIN membership for this organization', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1', status: 'active' })],
      roles: ['USER'],
      memberships: [{ organization: { id: 'org-1' }, roles: ['ORGANIZATION_ADMIN'] }],
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await userEvent.click(screen.getByRole('button', { name: 'Organization actions' }));
    expect(screen.getByRole('menuitem', { name: 'Archive organization' })).toBeInTheDocument();
  });

  it('does not grant administration of a different organization', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1', status: 'active' })],
      roles: ['USER'],
      memberships: [{ organization: { id: 'org-other' }, roles: ['ORGANIZATION_ADMIN'] }],
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await userEvent.click(screen.getByRole('button', { name: 'Organization actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Archive organization' })).not.toBeInTheDocument();
  });
});

describe('OrganizationDetailPanel — unsaved-changes guard', () => {
  const renderWithEdit = async () => {
    const organization = makeOrganization({ id: 'org-1' });
    const reactory = makeReactory({ organizations: [organization] });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    const nameField = screen.getByLabelText(/^Name/);
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'Acme Holdings Ltd');

    return { reactory, nameField };
  };

  it('asks before a tab switch discards unsaved input, and can keep editing', async () => {
    await renderWithEdit();

    await userEvent.click(screen.getByRole('tab', { name: 'Branding' }));

    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    // Still on Overview, with the edit intact.
    expect(screen.getByTestId('organization-overview-tab')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Acme Holdings Ltd');
    expect(screen.queryByText('ORG-013 delivers this tab')).not.toBeInTheDocument();
  });

  it('switches tabs once the user agrees to discard', async () => {
    await renderWithEdit();

    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(await screen.findByText('ORG-024 delivers this tab')).toBeInTheDocument();
  });

  it('asks before Back discards unsaved input', async () => {
    const { reactory } = await renderWithEdit();

    await userEvent.click(screen.getByRole('button', { name: 'Back to organizations' }));

    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(reactory.navigation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(reactory.navigation).toHaveBeenCalledWith('/organizations'));
  });

  /**
   * Regression (review round 1): the guard must not desynchronise from the tab.
   *
   * Confirming the dialog runs the pending action. When that action does *not*
   * discard anything — the archive dialog is cancelled, or the archive/restore
   * mutation fails — the form still holds the edit, so the shell must still be
   * guarding. The first implementation cleared its flag on confirm, and because
   * the tab only reports when its own dirty flag *changes*, nothing ever told
   * the shell it was dirty again: the next tab switch or Back lost the edit
   * silently.
   */
  it('keeps guarding when an archive is confirmed past the dialog but then cancelled', async () => {
    await renderWithEdit();

    await userEvent.click(screen.getByRole('button', { name: 'Organization actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive organization' }));

    // Archiving reloads the organization, so the shell warns first.
    expect(await screen.findByText('Unsaved changes will be lost')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // The archive dialog opens; cancelling it changes nothing at all.
    expect(await screen.findByText('Archive Acme Holdings')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // The form still holds the edit, so leaving must still ask.
    await userEvent.click(await screen.findByRole('tab', { name: 'Branding' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Acme Holdings Ltd');
  });

  it('keeps guarding when the archive mutation fails', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1', status: 'active' })],
      mutationImpl: (operation) =>
        operation === 'archiveOrganization'
          ? { data: null, errors: [{ message: 'Archive service unavailable' }] }
          : undefined,
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    const nameField = screen.getByLabelText(/^Name/);
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'Acme Holdings Ltd');

    await userEvent.click(screen.getByRole('button', { name: 'Organization actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive organization' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(reactory.createNotification).toHaveBeenCalledWith(
        'Archive service unavailable',
        expect.objectContaining({ type: 'error' }),
      ),
    );

    // Nothing was archived and nothing was reloaded: the edit is still there.
    await userEvent.click(await screen.findByRole('tab', { name: 'People' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
  });

  it('keeps guarding when the restore mutation fails', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1', status: 'archived' })],
      mutationImpl: (operation) =>
        operation === 'restoreOrganization'
          ? { data: null, errors: [{ message: 'Restore service unavailable' }] }
          : undefined,
    });

    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    const nameField = screen.getByLabelText(/^Name/);
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'Acme Holdings Ltd');

    await userEvent.click(screen.getByRole('button', { name: 'Organization actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Restore organization' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(reactory.createNotification).toHaveBeenCalledWith(
        'Restore service unavailable',
        expect.objectContaining({ type: 'error' }),
      ),
    );

    await userEvent.click(await screen.findByRole('tab', { name: 'Structure' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
  });

  it('stops guarding once a discard really did leave the tab', async () => {
    // The mirror image of the regression: the guard must not lock the user into
    // the tab either. Unmounting the tab is what clears it.
    await renderWithEdit();

    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByText('ORG-024 delivers this tab')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('tab', { name: 'Structure' }));
    expect(await screen.findByText('ORG-022 delivers this tab')).toBeInTheDocument();
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
  });
});

describe('OrganizationDetailPanel — overflow menu actions', () => {
  const openMenu = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Organization actions' }));
  };

  it('copies the organization id to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const reactory = makeReactory({ organizations: [makeOrganization({ id: 'org-1' })] });
    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy organization id' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('org-1'));
    expect(reactory.createNotification).toHaveBeenCalledWith(
      'Organization id copied',
      expect.objectContaining({ type: 'success' }),
    );

    delete (navigator as any).clipboard;
  });

  it('degrades to a message when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    const reactory = makeReactory({ organizations: [makeOrganization({ id: 'org-1' })] });
    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy organization id' }));

    await waitFor(() =>
      expect(reactory.createNotification).toHaveBeenCalledWith(
        expect.stringContaining('Copying is not available'),
        expect.objectContaining({ type: 'info' }),
      ),
    );

    delete (navigator as any).clipboard;
  });

  it('reports a rejected clipboard write instead of claiming success', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const reactory = makeReactory({ organizations: [makeOrganization({ id: 'org-1' })] });
    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy organization id' }));

    await waitFor(() =>
      expect(reactory.createNotification).toHaveBeenCalledWith(
        expect.stringContaining('Copying is not available'),
        expect.objectContaining({ type: 'info' }),
      ),
    );
    expect(reactory.createNotification).not.toHaveBeenCalledWith(
      'Organization id copied',
      expect.anything(),
    );

    delete (navigator as any).clipboard;
  });

  it('warns the browser before leaving the page with unsaved changes', async () => {
    const reactory = makeReactory({ organizations: [makeOrganization({ id: 'org-1' })] });
    render(<OrganizationDetailPanel reactory={reactory} id="org-1" />);
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    const nameField = screen.getByLabelText(/^Name/);
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'Acme Holdings Ltd');

    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
