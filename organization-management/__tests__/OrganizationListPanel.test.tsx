/**
 * @jest-environment jsdom
 *
 * Organization list panel contract (ORG-010).
 *
 * Covers the four rendering states (loading / empty / error / populated), the
 * status filter behaviour that makes archive reversible, both archive paths
 * (row action and bulk selection) — including the confirmation copy that states
 * archive is a status change rather than a delete — plus paging, header sorting,
 * the create-then-refresh flow and the read-only rendering for a plain USER.
 */
import React from 'react';
import { act, render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationListPanel from '../OrganizationListPanel';
import {
  activeOrganizations,
  makeOrganization,
  makeReactory,
  manyOrganizations,
  mutationCallsFor,
  queryCallsFor,
  selectOption,
} from './testFixtures';


/**
 * Let a mutation's follow-up work land inside `act`.
 *
 * Archive/restore/create all finish with `list.refresh()`, which re-reads the
 * list and re-hydrates the page's statistics. Those state updates can resolve
 * after the assertion that prompted them, so the test would otherwise leave
 * React with an unwrapped update (the ``not wrapped in act`` warning). One
 * macrotask is enough: every mocked GraphQL call resolves immediately.
 */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

/**
 * Mount the panel and flush its first load inside `act`.
 *
 * The list read and the per-page statistics hydration both resolve immediately
 * in these tests; without an act-scoped flush their `setState` calls land after
 * `render()` returns and React logs an "update was not wrapped in act" warning.
 */
const renderPanel = async (
  reactory: any,
  props: Partial<React.ComponentProps<typeof OrganizationListPanel>> = {},
) => {
  let view: ReturnType<typeof render> | undefined;
  await act(async () => {
    view = render(<OrganizationListPanel reactory={reactory} {...props} />);
    // Microtasks settle the list read; the macrotask lets the statistics effect
    // (scheduled after that commit) run and resolve its query in the same scope.
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
  return view as ReturnType<typeof render>;
};

afterEach(async () => {
  // Flush anything still in flight (a refresh, a statistics hydration) before
  // the tree is unmounted, so the update lands inside act rather than during
  // cleanup.
  await settle();
  cleanup();
});

const findRow = (name: string): HTMLElement => {
  const link = screen.getByText(name);
  const row = link.closest('tr');
  if (!row) throw new Error(`Row for ${name} not found`);
  return row as HTMLElement;
};

const openStatusFilter = async (option: string) => {
  // TablePagination also renders a combobox, so match the status filter by name.
  const combobox = screen.getByRole('combobox', { name: 'Status' });
  await selectOption(combobox, option, fireEvent, screen);
};

/**
 * The name cell is an MUI `Link component="button"` (so it renders a <button>,
 * not an <a>); its accessible name is "Open <name>". Read the visible order from
 * those buttons instead of from the markup.
 */
const rowNames = (): string[] =>
  screen
    .getAllByRole('button', { name: /^Open / })
    .map((button) => (button.textContent || '').trim())
    .filter((name) => name.length > 0);

/** Fill the wizard from wherever it currently is through to a submitted create. */
const completeWizard = async (name: string) => {
  await userEvent.type(await screen.findByLabelText(/^Name/), name);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));
};

describe('OrganizationListPanel', () => {
  it('shows a loading state while the list request is in flight', async () => {
    const reactory = makeReactory({ hangOrganizations: true });

    await renderPanel(reactory);

    expect(await screen.findByRole('status')).toHaveTextContent('Loading organizations…');
    expect(screen.queryByText('No organizations exist yet')).not.toBeInTheDocument();
  });

  it('distinguishes "no organizations exist" from "no matches for this filter"', async () => {
    const reactory = makeReactory({ organizations: [] });

    await renderPanel(reactory);

    expect(await screen.findByText('No organizations exist yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create the first organization to get started.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No organizations match this filter')).not.toBeInTheDocument();
  });

  it('reports "no matches" when organizations exist but the search excludes them', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    await userEvent.type(screen.getByLabelText('Search organizations'), 'zzz');

    // The search box is debounced; give the settled term time to apply.
    expect(
      await screen.findByText('No organizations match this filter', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No organizations exist yet')).not.toBeInTheDocument();
  });

  it('surfaces a load failure and retries without a reload', async () => {
    let fail = true;
    const organizations = activeOrganizations();
    const reactory = makeReactory({
      organizations,
      queryImpl: (operation) => {
        if (operation !== 'CoreOrganizations') return undefined;
        if (fail) return { data: null, errors: [{ message: 'Not authorized for this client' }] };
        return undefined;
      },
    });

    await renderPanel(reactory);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Organizations could not be loaded');
    // The server's own message is shown verbatim rather than replaced by copy.
    expect(alert).toHaveTextContent('Not authorized for this client');

    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Acme Holdings')).toBeInTheDocument();
    expect(screen.queryByText('Organizations could not be loaded')).not.toBeInTheDocument();
  });

  it('renders the identity, status, counts, theme and updated columns', async () => {
    const reactory = makeReactory({
      organizations: activeOrganizations(),
      statistics: { 'org-1': { members: 12 }, 'org-2': { members: 4 } },
    });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    const acme = findRow('Acme Holdings');
    expect(within(acme).getByText('ACME')).toBeInTheDocument();
    expect(within(acme).getByText('Acme Trading (Pty) Ltd')).toBeInTheDocument();
    expect(within(acme).getByText('Active')).toBeInTheDocument();
    expect(within(acme).getByText('Acme Theme')).toBeInTheDocument();
    // Business-unit count comes from the embedded references; members from stats.
    expect(within(acme).getByText('2')).toBeInTheDocument();
    // The member count is hydrated asynchronously; wait for it to land.
    expect(await within(acme).findByText('12')).toBeInTheDocument();

    const beta = findRow('Beta Industries');
    // No theme means the client theme is inherited.
    expect(within(beta).getByText('Client theme')).toBeInTheDocument();

    // Paging summary reflects the filtered total.
    expect(screen.getByText('1–2 of 2')).toBeInTheDocument();
  });

  it('pages through a longer list and reports the visible slice', async () => {
    const reactory = makeReactory({ organizations: manyOrganizations(12) });

    await renderPanel(reactory);

    await screen.findByText('Organization 01');
    expect(screen.getByText('1–10 of 12')).toBeInTheDocument();
    // Page 1 stops at the tenth row.
    expect(screen.queryByText('Organization 11')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /next page/i }));

    expect(await screen.findByText('11–12 of 12')).toBeInTheDocument();
    expect(screen.getByText('Organization 11')).toBeInTheDocument();
    expect(screen.getByText('Organization 12')).toBeInTheDocument();
    expect(screen.queryByText('Organization 01')).not.toBeInTheDocument();

    // Paging is local: the scoped list is read once.
    expect(queryCallsFor(reactory, 'CoreOrganizations')).toHaveLength(1);
  });

  it('sorts by a column header and reverses on the second click', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');
    // Name ascending is the default.
    expect(rowNames()).toEqual(['Acme Holdings', 'Beta Industries']);

    const codeHeader = screen.getByRole('button', { name: 'Code' });
    await userEvent.click(codeHeader);

    // Codes are ACME < BETA, so switching column keeps the order but makes the
    // code header the active sort.
    expect(rowNames()).toEqual(['Acme Holdings', 'Beta Industries']);
    expect(codeHeader.closest('th')).toHaveAttribute('aria-sort', 'ascending');

    await userEvent.click(codeHeader);

    // A second click on the active column reverses it.
    expect(rowNames()).toEqual(['Beta Industries', 'Acme Holdings']);
    expect(codeHeader.closest('th')).toHaveAttribute('aria-sort', 'descending');

    // A different column starts ascending again rather than inheriting desc.
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(rowNames()).toEqual(['Acme Holdings', 'Beta Industries']);
  });

  it('confirms archive, states that it is reversible, and only then mutates', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'Archive Acme Holdings' }));

    expect(screen.getByText('Archive Acme Holdings')).toBeInTheDocument();
    expect(screen.getByText(/This is a status change, not a delete/i)).toBeInTheDocument();
    expect(screen.getByText(/you can restore it at any time/i)).toBeInTheDocument();

    // Opening the dialog must not archive anything.
    expect(mutationCallsFor(reactory, 'archiveOrganization')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'archiveOrganization')).toHaveLength(1),
    );
    expect(mutationCallsFor(reactory, 'archiveOrganization')[0][1]).toEqual({ id: 'org-1' });

    // Archived organizations leave the default (active) list.
    await waitFor(() => expect(screen.queryByText('Acme Holdings')).not.toBeInTheDocument());

    // The list was refreshed from the server rather than patched locally.
    expect(queryCallsFor(reactory, 'CoreOrganizations').length).toBeGreaterThanOrEqual(2);
    expect(reactory.createNotification).toHaveBeenCalledWith(
      '1 organization archived',
      expect.anything(),
    );
  });

  it('cancelling the archive dialog mutates nothing', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'Archive Acme Holdings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByText(/This is a status change, not a delete/i)).not.toBeInTheDocument(),
    );
    expect(mutationCallsFor(reactory, 'archiveOrganization')).toHaveLength(0);
    expect(screen.getByText('Acme Holdings')).toBeInTheDocument();
  });

  it('reports a partial bulk archive instead of claiming full success', async () => {
    const reactory = makeReactory({
      organizations: activeOrganizations(),
      mutationImpl: (operation, variables) => {
        if (operation !== 'archiveOrganization') return undefined;
        if (variables.id === 'org-2') {
          return { data: null, errors: [{ message: 'Organization not found' }] };
        }
        return undefined;
      },
    });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select all organizations on this page' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Archive selected/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(reactory.createNotification).toHaveBeenCalledWith(
        '1 archived, 1 could not be archived.',
        expect.anything(),
      ),
    );
    // The successful archive is still reflected in the list.
    await waitFor(() => expect(screen.queryByText('Acme Holdings')).not.toBeInTheDocument());
  });

  it('reports an archive that fails for every selected row', async () => {
    const reactory = makeReactory({
      organizations: activeOrganizations(),
      mutationImpl: (operation) =>
        operation === 'archiveOrganization'
          ? { data: null, errors: [{ message: 'You may not archive this organization' }] }
          : undefined,
    });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'Archive Acme Holdings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(reactory.createNotification).toHaveBeenCalledWith(
        'You may not archive this organization',
        expect.anything(),
      ),
    );
    // Nothing was archived, so the row is still listed.
    expect(screen.getByText('Acme Holdings')).toBeInTheDocument();
  });

  it('hides archived organizations by default and exposes restore in the archived view', async () => {
    const reactory = makeReactory({
      organizations: [
        makeOrganization({ id: 'org-1', name: 'Acme Holdings', status: 'active' }),
        makeOrganization({ id: 'org-3', name: 'Retired Co', status: 'archived', theme: null }),
      ],
    });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');
    expect(screen.queryByText('Retired Co')).not.toBeInTheDocument();

    await openStatusFilter('Archived');

    expect(await screen.findByText('Retired Co')).toBeInTheDocument();
    expect(screen.queryByText('Acme Holdings')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Restore Retired Co' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'restoreOrganization')).toHaveLength(1),
    );
    expect(mutationCallsFor(reactory, 'restoreOrganization')[0][1]).toEqual({ id: 'org-3' });

    // Restored to active, so it no longer matches the archived filter.
    await waitFor(() => expect(screen.queryByText('Retired Co')).not.toBeInTheDocument());
  });

  it('surfaces a restore failure with the server message', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-3', name: 'Retired Co', status: 'archived' })],
      mutationImpl: (operation) =>
        operation === 'restoreOrganization'
          ? { data: null, errors: [{ message: 'Restore is not permitted' }] }
          : undefined,
    });

    await renderPanel(reactory);

    await openStatusFilter('Archived');
    await screen.findByText('Retired Co');

    await userEvent.click(screen.getByRole('button', { name: 'Restore Retired Co' }));

    await waitFor(() =>
      expect(reactory.createNotification).toHaveBeenCalledWith(
        'Restore is not permitted',
        expect.anything(),
      ),
    );
    expect(screen.getByText('Retired Co')).toBeInTheDocument();
  });

  it('archives every selected row through the bulk action', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select all organizations on this page' }),
    );

    const bulk = screen.getByRole('button', { name: /Archive selected/ });
    expect(bulk).toHaveTextContent('Archive selected (2)');

    await userEvent.click(bulk);

    expect(screen.getByText('Archive 2 organizations')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'archiveOrganization')).toHaveLength(2),
    );
    expect(
      mutationCallsFor(reactory, 'archiveOrganization').map((call: any[]) => call[1].id).sort(),
    ).toEqual(['org-1', 'org-2']);
  });

  it('creates through the wizard and shows the new row without a manual refresh', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'New organization' }));
    await completeWizard('Gamma Logistics');

    // The panel re-reads the list before navigating, so the new organization is
    // already present when the detail view is dismissed.
    await waitFor(() =>
      expect(queryCallsFor(reactory, 'CoreOrganizations').length).toBeGreaterThanOrEqual(2),
    );
    expect(await screen.findByText('Gamma Logistics')).toBeInTheDocument();
    expect(reactory.navigation).toHaveBeenCalledWith('/organizations/org-created-3');
    expect(reactory.createNotification).toHaveBeenCalledWith(
      'Gamma Logistics was created.',
      expect.anything(),
    );
  });

  it('warns when a create succeeded but its follow-up update did not', async () => {
    const reactory = makeReactory({
      organizations: activeOrganizations(),
      mutationImpl: (operation) =>
        operation === 'updateOrganization'
          ? { data: null, errors: [{ message: 'tradingName rejected' }] }
          : undefined,
    });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'New organization' }));
    await userEvent.type(await screen.findByLabelText(/^Name/), 'Gamma Logistics');
    await userEvent.type(screen.getByLabelText(/^Trading name/), 'Gamma Trading');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() =>
      expect(reactory.createNotification).toHaveBeenCalledWith(
        'Gamma Logistics was created, but some details could not be saved: tradingName rejected',
        expect.anything(),
      ),
    );
    // The organization exists, so the list still gains the row.
    expect(await screen.findByText('Gamma Logistics')).toBeInTheDocument();
  });

  it('renders read-only for a plain USER, who the server denies every write', async () => {
    const reactory = makeReactory({
      organizations: activeOrganizations(),
      roles: ['USER'],
    });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    // Reads are available...
    expect(screen.getByLabelText('Search organizations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Acme Holdings' })).toBeInTheDocument();

    // ...but no mutating affordance is offered.
    expect(screen.queryByRole('button', { name: 'New organization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archive selected/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Archive Acme Holdings' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore Retired Co' })).not.toBeInTheDocument();

    // The role check asked for exactly the server's two role sets.
    const requested = reactory.hasRole.mock.calls.map((call: any[]) => call[0]);
    expect(requested).toEqual(
      expect.arrayContaining([['ADMIN', 'SYSTEM'], ['ORGANIZATION_ADMIN', 'ADMIN', 'SYSTEM']]),
    );
  });

  it('keeps archive available to an ORGANIZATION_ADMIN but not creation', async () => {
    const reactory = makeReactory({
      organizations: activeOrganizations(),
      roles: ['ORGANIZATION_ADMIN', 'USER'],
    });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    // Creation has no organization to scope against: ADMIN/SYSTEM only.
    expect(screen.queryByRole('button', { name: 'New organization' })).not.toBeInTheDocument();
    // Archiving their own organization is theirs to do.
    expect(screen.getByRole('button', { name: 'Archive Acme Holdings' })).toBeInTheDocument();
  });

  it('honours an ORGANIZATION_ADMIN granted only through a membership (QA-2)', async () => {
    // The normal addMember / setMemberRoles path writes only membership.roles.
    // A role check that omits the organization would answer false here.
    const reactory = makeReactory({
      organizations: activeOrganizations(),
      roles: ['USER'],
      memberships: [
        { organization: { id: 'org-1' }, roles: ['ORGANIZATION_ADMIN'], enabled: true },
      ],
    });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    // They administer org-1, so its row action is offered...
    expect(screen.getByRole('button', { name: 'Archive Acme Holdings' })).toBeInTheDocument();
    // ...and the bulk action is available for the rows they control.
    expect(screen.getByRole('button', { name: /Archive selected/ })).toBeInTheDocument();
    // They do not administer org-2, so that row offers no action.
    expect(
      screen.queryByRole('button', { name: 'Archive Beta Industries' }),
    ).not.toBeInTheDocument();
    // Creation still needs a platform ADMIN.
    expect(screen.queryByRole('button', { name: 'New organization' })).not.toBeInTheDocument();

    // The bulk count reflects only the manageable rows.
    const all = screen.getByRole('checkbox', { name: 'Select all organizations on this page' });
    await userEvent.click(all);
    expect(screen.getByRole('button', { name: 'Archive selected (1)' })).toBeInTheDocument();
  });

  it('lets a membership admin archive only the organization they administer', async () => {
    const reactory = makeReactory({
      organizations: activeOrganizations(),
      roles: ['USER'],
      memberships: [
        { organization: { id: 'org-2' }, roles: ['ORGANIZATION_ADMIN'], enabled: true },
      ],
    });

    await renderPanel(reactory);

    await screen.findByText('Beta Industries');

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select all organizations on this page' }),
    );
    // Only org-2 is manageable, so only it is offered for bulk archive.
    expect(screen.getByRole('button', { name: 'Archive selected (1)' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Archive selected/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'archiveOrganization')).toHaveLength(1),
    );
    expect(mutationCallsFor(reactory, 'archiveOrganization')[0][1]).toEqual({ id: 'org-2' });
  });

  it('restores from the archived view for a membership admin', async () => {
    const reactory = makeReactory({
      organizations: [
        makeOrganization({ id: 'org-3', name: 'Retired Co', status: 'archived', theme: null }),
      ],
      roles: ['USER'],
      memberships: [
        { organization: { id: 'org-3' }, roles: ['ORGANIZATION_ADMIN'], enabled: true },
      ],
    });

    await renderPanel(reactory);
    await openStatusFilter('Archived');
    await screen.findByText('Retired Co');

    await userEvent.click(screen.getByRole('button', { name: 'Restore Retired Co' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'restoreOrganization')).toHaveLength(1),
    );
    expect(mutationCallsFor(reactory, 'restoreOrganization')[0][1]).toEqual({ id: 'org-3' });
  });

  it('renders every user-facing string through the i18n layer', async () => {
    const i18n = { t: jest.fn((key: string) => `T:${key}`) };
    const reactory = makeReactory({ organizations: activeOrganizations(), i18n });

    await renderPanel(reactory);

    expect(await screen.findByText('T:reactory.organizations.list.title')).toBeInTheDocument();
    expect(screen.getByText('T:reactory.organizations.list.column.name')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'T:reactory.organizations.list.newOrganization' }),
    ).toBeInTheDocument();
    expect(i18n.t).toHaveBeenCalledWith(
      'reactory.organizations.list.title',
      expect.objectContaining({ defaultValue: 'Organizations' }),
    );
  });
});

/**
 * Route configuration (ORG-016).
 *
 * ORG-015 mounted this surface at `/organizations/manage/*`, but the panel built
 * the detail link from a literal `/organizations/${id}` — so a row click landed
 * on `/organizations/<id>`, which has no route, and the detail view never opened.
 *
 * `basePath` is the fix: a plain string, because a route config's
 * `componentProps` is JSON and cannot carry the existing `detailRoute` function.
 * Every default stays `/organizations`, so a host that passes nothing (and the
 * legacy surface) behaves exactly as before.
 */
describe('OrganizationListPanel — basePath', () => {
  it('opens a row at `/organizations/<id>` when no base path is configured', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory);
    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'Open Acme Holdings' }));

    // The backwards-compatible default: the legacy surface, exactly as before.
    expect(reactory.navigation).toHaveBeenCalledWith('/organizations/org-1');
  });

  it('builds the row detail link from basePath', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory, { basePath: '/organizations/manage' });
    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'Open Acme Holdings' }));

    // The manage surface routes the detail view at `/organizations/manage/<id>`.
    expect(reactory.navigation).toHaveBeenCalledWith('/organizations/manage/org-1');
  });

  it('does not double the slash when basePath ends with one', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory, { basePath: '/organizations/manage/' });
    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'Open Acme Holdings' }));

    const path = reactory.navigation.mock.calls[0][0];
    expect(path).toBe('/organizations/manage/org-1');
    expect(path).not.toContain('//');
  });

  it('keeps the detailRoute function ahead of basePath', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });
    const detailRoute = jest.fn((organization: any) => `/orgs/${organization.id}`);

    await renderPanel(reactory, { basePath: '/organizations/manage', detailRoute });
    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'Open Acme Holdings' }));

    expect(detailRoute).toHaveBeenCalledTimes(1);
    expect(reactory.navigation).toHaveBeenCalledWith('/orgs/org-1');
  });

  it('uses basePath for the detail view opened after a create', async () => {
    const reactory = makeReactory({ organizations: activeOrganizations() });

    await renderPanel(reactory, { basePath: '/organizations/manage' });
    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'New organization' }));
    await completeWizard('Gamma Logistics');

    await waitFor(() =>
      expect(reactory.navigation).toHaveBeenCalledWith('/organizations/manage/org-created-3'),
    );
  });
});