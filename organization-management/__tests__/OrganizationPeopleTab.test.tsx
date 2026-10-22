/**
 * @jest-environment jsdom
 *
 * People tab contract (ORG-024).
 *
 * Rendered directly with `OrganizationTabProps`, exactly as the detail shell
 * renders it — the same harness the structure, branding and demographics suites
 * use. The stub SDK dispatches on GraphQL operation names, so these tests assert
 * both the document and the variables the tab sends, which is the persistence
 * contract the ticket asks for.
 *
 * The assignment tests matter as much as the role/deactivate ones: there is no
 * "set member's business unit" mutation, so the tab must go through the
 * business-unit and team membership mutations, and a test that only checked the
 * rendered list would not notice if someone invented one.
 */
import React from 'react';
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationPeopleTab from '../OrganizationPeopleTab';
import { ORGANIZATION_TABS } from '../organizationTabs';
import { makeTranslator } from '../i18n';
import type { OrganizationMember, OrganizationTabProps } from '../types';
import {
  makeOrganization,
  makeOrganizationMember,
  makeReactory,
  manyOrganizationMembers,
  mutationCallsFor,
  organizationMemberFixtures,
  queryCallsFor,
  selectOption,
  structureFixtures,
} from './testFixtures';

// This suite drives several sequential server reads per test (search, then a
// filter, then a page change). The default 1s `findBy` window and 10s test
// budget are too tight when the whole plugin folder runs on a loaded machine,
// and a timeout there would look like a product failure.
configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(30000);

afterEach(cleanup);

interface SetupOptions {
  canManage?: boolean;
  members?: OrganizationMember[];
  reactory?: any;
}

const setup = (options: SetupOptions = {}) => {
  const organization = makeOrganization({ id: 'org-1' });
  const structure = structureFixtures();

  const reactory =
    options.reactory ||
    makeReactory({
      organizations: [organization],
      businessUnits: structure.businessUnits,
      teams: structure.teams,
      members: options.members || organizationMemberFixtures(),
    });

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

  const utils = render(<OrganizationPeopleTab {...props} />);
  return { ...utils, props, reactory };
};

/** Wait until the member page has rendered. */
const ready = async (): Promise<void> => {
  await screen.findByTestId('people-table');
};

/**
 * Wait for a closing MUI dialog to unmount.
 *
 * A mounted Dialog marks its siblings `aria-hidden` during the exit transition,
 * so role queries against the tab race the animation.
 */
const settled = async (): Promise<void> => {
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), {
    timeout: 5000,
  });
};

const lastQuery = (reactory: any) => {
  const calls = queryCallsFor(reactory, 'OrganizationMembers');
  return calls[calls.length - 1];
};

const lastMutation = (reactory: any, operation: string) => {
  const calls = mutationCallsFor(reactory, operation);
  return calls[calls.length - 1];
};

/**
 * Open a MUI Select by its label and choose an option.
 *
 * `selectOption` already opens the control; a second `mouseDown` here would
 * close it again and the combobox would be gone by the time the option query
 * runs.
 */
const chooseOption = async (label: string | RegExp, option: string) => {
  await selectOption(
    screen.getByRole('combobox', { name: label }),
    option,
    fireEvent,
    screen,
  );
};

describe('member table', () => {
  it('renders members with roles, business unit and multiple teams', async () => {
    const members = organizationMemberFixtures();
    // A third team on the first member exercises the overflow chip: the column
    // must never grow past its box just because a member has many teams.
    members[0] = makeOrganizationMember({
      ...members[0],
      teamIds: ['team-1', 'team-2', 'team-3'],
      teams: [
        { id: 'team-1', name: 'Platform', title: 'Platform' },
        { id: 'team-2', name: 'Field Ops', title: 'Field Ops' },
        { id: 'team-3', name: 'Data', title: 'Data' },
      ],
    });

    const { reactory } = setup({ members });
    await ready();

    const first = screen.getByTestId('people-row-member-1');
    expect(within(first).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(first).getByText('ada@example.com')).toBeInTheDocument();
    expect(within(first).getByText('ORGANIZATION_ADMIN')).toBeInTheDocument();
    expect(within(first).getByText('Engineering')).toBeInTheDocument();

    // Two teams render as chips; the third collapses into "+1" rather than
    // forcing the column wider.
    expect(within(first).getByText('Platform')).toBeInTheDocument();
    expect(within(first).getByText('Field Ops')).toBeInTheDocument();
    expect(within(first).queryByText('Data')).not.toBeInTheDocument();
    expect(within(first).getByTestId('people-teams-member-1-more')).toHaveTextContent('+1');

    // The second member has no unit, one team and has never signed in.
    const second = screen.getByTestId('people-row-member-2');
    expect(within(second).getByText('Unassigned')).toBeInTheDocument();
    expect(within(second).getByText('Field Ops')).toBeInTheDocument();
    expect(within(second).getByText('Never')).toBeInTheDocument();

    // The default view is the server's `active` status, so the deactivated
    // member and the pending invitation are not in it.
    expect(screen.queryByTestId('people-row-member-3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('people-row-invite-1')).not.toBeInTheDocument();

    const [document, variables] = lastQuery(reactory);
    expect(String(document)).toContain('OrganizationMembers(');
    expect(String(document)).toContain('businessUnitId');
    expect(variables).toEqual({
      organizationId: 'org-1',
      filter: { status: 'active' },
      paging: { page: 1, pageSize: 25 },
    });
  });

  it('shows the pending/invited state when the invited filter is selected', async () => {
    setup();
    await ready();

    await chooseOption('Status', 'Invited');

    const row = await screen.findByTestId('people-row-invite-1');
    expect(row).toHaveAttribute('data-status', 'invited');
    expect(within(row).getByTestId('people-status-invite-1')).toHaveTextContent('Invited');
    // With no name yet, the member cell falls back to the address, so the
    // address appears in both the member and the email column.
    expect(within(row).getAllByText('pending@example.com').length).toBeGreaterThan(0);
    // A pending invitation has no user yet, so it offers no write actions.
    expect(screen.queryByTestId('people-roles-open-invite-1')).not.toBeInTheDocument();
  });

  it('renders no write controls when canManage is false', async () => {
    setup({ canManage: false });
    await ready();

    expect(screen.queryByTestId('people-invite-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('people-roles-open-member-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('people-assign-open-member-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('people-deactivate-open-member-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('people-remove-open-member-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();

    // The read view is unchanged.
    expect(screen.getByTestId('people-row-member-1')).toBeInTheDocument();
  });
});

describe('search debounce', () => {
  it('collapses a keystroke burst into a single read carrying the final value', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1' })],
      businessUnits: structureFixtures().businessUnits,
      teams: structureFixtures().teams,
      members: manyOrganizationMembers(30),
    });

    setup({ reactory });
    await ready();

    const before = queryCallsFor(reactory, 'OrganizationMembers').length;
    expect(before).toBe(1);

    // Fake timers only for the burst: mounting and the initial read already
    // happened on real ones, so nothing here depends on wall-clock timing.
    jest.useFakeTimers();

    try {
      const search = screen.getByTestId('people-search');

      // Four keystrokes, one per character, as a person types them.
      ['M', 'Me', 'Mem', 'Memb'].forEach((value) => {
        fireEvent.change(search, { target: { value } });
      });

      // The burst is still in progress: nothing has been asked of the server.
      expect(queryCallsFor(reactory, 'OrganizationMembers')).toHaveLength(before);

      await act(async () => {
        jest.advanceTimersByTime(299);
      });
      expect(queryCallsFor(reactory, 'OrganizationMembers')).toHaveLength(before);

      await act(async () => {
        jest.advanceTimersByTime(1);
      });

      // Exactly one read follows the burst, and it carries the final value.
      const calls = queryCallsFor(reactory, 'OrganizationMembers');
      expect(calls).toHaveLength(before + 1);
      expect(lastQuery(reactory)[1].filter.search).toBe('Memb');
      expect(lastQuery(reactory)[1].paging).toEqual({ page: 1, pageSize: 25 });
    } finally {
      // Never leave the suite on fake timers if an assertion above fails.
      jest.useRealTimers();
    }

    expect(screen.getByTestId('people-search')).toHaveValue('Memb');
  });
});

describe('filters and paging', () => {
  it('sends the filter to the server and resets paging', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1' })],
      businessUnits: structureFixtures().businessUnits,
      teams: structureFixtures().teams,
      members: manyOrganizationMembers(30),
    });

    setup({ reactory });
    await ready();

    // Move off page 1 first, so a filter change resetting to page 1 is visible.
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(lastQuery(reactory)[1].paging.page).toBe(2));

    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'Member 01' } });
    await waitFor(() => expect(lastQuery(reactory)[1].filter.search).toBe('Member 01'));
    expect(lastQuery(reactory)[1].paging).toEqual({ page: 1, pageSize: 25 });

    await chooseOption('Role', 'USER');
    await waitFor(() => expect(lastQuery(reactory)[1].filter.role).toBe('USER'));
    expect(lastQuery(reactory)[1].paging.page).toBe(1);

    await chooseOption('Status', 'Deactivated');
    await waitFor(() => expect(lastQuery(reactory)[1].filter.status).toBe('deactivated'));
    expect(lastQuery(reactory)[1].paging.page).toBe(1);

    await chooseOption('Business unit', 'Engineering');
    await waitFor(() => expect(lastQuery(reactory)[1].filter.businessUnitId).toBe('bu-1'));
    expect(lastQuery(reactory)[1].paging.page).toBe(1);

    await chooseOption('Team', 'Platform');
    await waitFor(() => expect(lastQuery(reactory)[1].filter.teamId).toBe('team-1'));
    expect(lastQuery(reactory)[1]).toEqual({
      organizationId: 'org-1',
      filter: {
        search: 'Member 01',
        role: 'USER',
        status: 'deactivated',
        businessUnitId: 'bu-1',
        teamId: 'team-1',
      },
      paging: { page: 1, pageSize: 25 },
    });
  });

  it('advances through pages using the server paging envelope', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1' })],
      businessUnits: structureFixtures().businessUnits,
      teams: structureFixtures().teams,
      members: manyOrganizationMembers(30),
    });

    setup({ reactory });
    await ready();

    expect(screen.getByTestId('organization-people-total')).toHaveTextContent('30 members');
    expect(screen.queryByTestId('people-row-member-26')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /next page/i }));

    await screen.findByTestId('people-row-member-26');
    expect(lastQuery(reactory)[1]).toEqual({
      organizationId: 'org-1',
      filter: { status: 'active' },
      paging: { page: 2, pageSize: 25 },
    });
    expect(screen.queryByTestId('people-row-member-01')).not.toBeInTheDocument();
  });
});

describe('role editing', () => {
  it('sends setOrganizationMemberRoles with the exact ids and roles', async () => {
    const { reactory, props } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('people-roles-open-member-1'));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByTestId('people-roles-input'), {
      target: { value: 'ORGANIZATION_ADMIN, TEAM_ADMIN ,, ORGANIZATION_ADMIN' },
    });

    await userEvent.click(within(dialog).getByTestId('people-roles-save'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'SetOrganizationMemberRoles')).toHaveLength(1),
    );

    const [document, variables] = lastMutation(reactory, 'SetOrganizationMemberRoles');
    expect(String(document)).toContain('setOrganizationMemberRoles');
    // Duplicates and blanks are dropped, order is preserved.
    expect(variables).toEqual({
      id: 'org-1',
      userId: 'user-1',
      roles: ['ORGANIZATION_ADMIN', 'TEAM_ADMIN'],
    });

    await settled();
    expect(props.refresh).toHaveBeenCalled();
    expect(props.notify).toHaveBeenCalledWith('Roles for Ada Lovelace saved.', 'success');
    // The dialog closed because the save completed, so the shell may stop
    // guarding for unsaved input.
    const dirtyCalls = props.onUnsavedChanges.mock.calls.map((call) => call[0]);
    expect(dirtyCalls[dirtyCalls.length - 1]).toBe(false);
  });

  it('keeps the unsaved flag set when a save fails and clears it on discard', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1' })],
      businessUnits: structureFixtures().businessUnits,
      teams: structureFixtures().teams,
      members: organizationMemberFixtures(),
      mutationImpl: (operation: string) =>
        operation === 'SetOrganizationMemberRoles'
          ? { data: null, errors: [{ message: 'Roles rejected by the server' }] }
          : undefined,
    });

    const { props } = setup({ reactory });
    await ready();

    await userEvent.click(screen.getByTestId('people-roles-open-member-1'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByTestId('people-roles-input'), {
      target: { value: 'USER' },
    });

    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenCalledWith(true));

    await userEvent.click(within(dialog).getByTestId('people-roles-save'));
    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Roles rejected by the server', 'error'),
    );

    // The write was attempted but did not complete: the dialog and the flag stay.
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // A rejected write is not a failed read: no page-level banner and the table
    // is untouched behind the dialog.
    expect(screen.queryByTestId('organization-people-load-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('people-table')).toBeInTheDocument();
    const dirtyCalls = props.onUnsavedChanges.mock.calls.map((call) => call[0]);
    expect(dirtyCalls[dirtyCalls.length - 1]).toBe(true);

    await userEvent.click(within(dialog).getByText('Cancel'));
    await settled();
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false);
  });
});

describe('row actions', () => {
  it('deactivates a member and the row reflects the new state after refresh', async () => {
    const { reactory } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('people-deactivate-open-member-1'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByTestId('people-deactivate-confirm'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'DeactivateOrganizationMember')).toHaveLength(1),
    );
    expect(lastMutation(reactory, 'DeactivateOrganizationMember')[1]).toEqual({
      id: 'org-1',
      userId: 'user-1',
    });

    await settled();

    // The read is the server's `active` view, so the refreshed page no longer
    // lists the member...
    await waitFor(() =>
      expect(screen.queryByTestId('people-row-member-1')).not.toBeInTheDocument(),
    );
    expect(queryCallsFor(reactory, 'OrganizationMembers').length).toBeGreaterThan(1);

    // ...and the deactivated view shows the state the server now reports.
    await chooseOption('Status', 'Deactivated');
    const row = await screen.findByTestId('people-row-member-1');
    expect(row).toHaveAttribute('data-status', 'deactivated');
    expect(within(row).getByTestId('people-status-member-1')).toHaveTextContent('Deactivated');
  });

  it('requires confirmation before removing a member', async () => {
    const { reactory } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('people-remove-open-member-1'));
    const dialog = await screen.findByRole('dialog');

    // Opening the dialog is not a removal.
    expect(mutationCallsFor(reactory, 'RemoveOrganizationMember')).toHaveLength(0);

    await userEvent.click(within(dialog).getByTestId('people-remove-confirm'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'RemoveOrganizationMember')).toHaveLength(1),
    );
    const [document, variables] = lastMutation(reactory, 'RemoveOrganizationMember');
    expect(String(document)).toContain('removeOrganizationMember');
    expect(variables).toEqual({ id: 'org-1', userId: 'user-1' });

    await settled();
    await waitFor(() =>
      expect(screen.queryByTestId('people-row-member-1')).not.toBeInTheDocument(),
    );
  });

  it('assigns a business unit through the business-unit mutations', async () => {
    const { reactory } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('people-assign-open-member-1'));
    const dialog = await screen.findByRole('dialog');

    // Moving units is remove-then-add: there is no member field to write.
    fireEvent.mouseDown(within(dialog).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Operations' }));
    await userEvent.click(within(dialog).getByTestId('people-assign-save'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'RemoveBusinessUnitMember')).toHaveLength(1),
    );
    expect(lastMutation(reactory, 'RemoveBusinessUnitMember')[1]).toEqual({
      id: 'bu-1',
      memberId: 'user-1',
    });
    expect(lastMutation(reactory, 'AddBusinessUnitMember')[1]).toEqual({
      id: 'bu-2',
      memberId: 'user-1',
    });

    // The team set did not change, so no team mutation was invented.
    expect(mutationCallsFor(reactory, 'AddTeamMember')).toHaveLength(0);
    expect(mutationCallsFor(reactory, 'RemoveTeamMember')).toHaveLength(0);
  });

  it('assigns teams through the team membership mutations', async () => {
    const { reactory } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('people-assign-open-member-1'));
    const dialog = await screen.findByRole('dialog');

    // member-1 is in bu-1, so only team-1 is offered; unchecking it removes the
    // team membership and leaves the unit alone.
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Platform' }));
    await userEvent.click(within(dialog).getByTestId('people-assign-save'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'RemoveTeamMember')).toHaveLength(1),
    );
    expect(lastMutation(reactory, 'RemoveTeamMember')[1]).toEqual({
      id: 'team-1',
      memberId: 'user-1',
    });
    expect(mutationCallsFor(reactory, 'AddTeamMember')).toHaveLength(0);
    expect(mutationCallsFor(reactory, 'AddBusinessUnitMember')).toHaveLength(0);
    expect(mutationCallsFor(reactory, 'RemoveBusinessUnitMember')).toHaveLength(0);
  });
});

describe('invitations', () => {
  it('invites one address and surfaces the pending state', async () => {
    const { reactory, props } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('people-invite-open'));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByTestId('people-invite-emails'), {
      target: { value: 'new.person@example.com' },
    });
    await userEvent.click(within(dialog).getByTestId('people-invite-submit'));

    const result = await screen.findByTestId('people-invite-result-new.person@example.com');
    expect(result).toHaveAttribute('data-status', 'invited');
    expect(within(result).getByText(/Invited/)).toBeInTheDocument();
    expect(within(result).getByText('new.person@example.com')).toBeInTheDocument();

    const [document, variables] = lastMutation(reactory, 'InviteOrganizationMember');
    expect(String(document)).toContain('inviteOrganizationMember');
    expect(variables).toEqual({
      id: 'org-1',
      email: 'new.person@example.com',
      roles: null,
      businessUnitId: null,
    });

    expect(props.notify).toHaveBeenCalledWith('new.person@example.com invited.', 'success');
    expect(props.refresh).toHaveBeenCalled();
  });

  it('surfaces a duplicate invite without adding a row or a load error', async () => {
    const { reactory, props } = setup();
    await ready();

    const before = reactory.members.length;

    await userEvent.click(screen.getByTestId('people-invite-open'));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByTestId('people-invite-emails'), {
      target: { value: 'ada@example.com' },
    });
    await userEvent.click(within(dialog).getByTestId('people-invite-submit'));

    const result = await screen.findByTestId('people-invite-result-ada@example.com');
    expect(result).toHaveAttribute('data-status', 'already-member');
    expect(within(result).getByText(/already belongs to a member/)).toBeInTheDocument();

    // F2 regression: a rejected invite is a per-address outcome, not a failed
    // list read. The page-level load-error banner must stay absent, the table
    // must stay on screen, and the reason must reach `notify` instead.
    expect(screen.queryByTestId('organization-people-load-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('people-table')).toBeInTheDocument();
    expect(props.notify).toHaveBeenCalledWith(
      expect.stringContaining('already belongs to a member'),
      'error',
    );

    expect(reactory.members).toHaveLength(before);
    expect(
      reactory.members.filter((member: OrganizationMember) => member.email === 'ada@example.com'),
    ).toHaveLength(1);
  });

  it('reports per-row outcomes for a mixed pasted batch', async () => {
    const { reactory, props } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('people-invite-open'));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByTestId('people-invite-emails'), {
      target: {
        value: [
          'first@example.com',
          'not-an-email',
          'ada@example.com',
          'second@example.com',
        ].join('\n'),
      },
    });
    await userEvent.click(within(dialog).getByTestId('people-invite-submit'));

    const first = await screen.findByTestId('people-invite-result-first@example.com');
    const invalid = screen.getByTestId('people-invite-result-not-an-email');
    const duplicate = screen.getByTestId('people-invite-result-ada@example.com');
    const second = screen.getByTestId('people-invite-result-second@example.com');

    expect(first).toHaveAttribute('data-status', 'invited');
    expect(invalid).toHaveAttribute('data-status', 'invalid-email');
    expect(duplicate).toHaveAttribute('data-status', 'already-member');
    // The row after the failures still succeeded: one bad address does not
    // discard the rest of the batch.
    expect(second).toHaveAttribute('data-status', 'invited');

    // One call per address that could be attempted; the invalid address never
    // reached the server.
    expect(mutationCallsFor(reactory, 'InviteOrganizationMember')).toHaveLength(3);

    expect(props.notify).toHaveBeenCalledWith('2 invited, 2 not invited.', 'warning');
    expect(reactory.members).toHaveLength(organizationMemberFixtures().length + 2);

    // Two of the four rows failed, and the list is still a list — not a
    // "could not be loaded" page.
    expect(screen.queryByTestId('organization-people-load-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('people-table')).toBeInTheDocument();
  });
});

describe('tab registration', () => {
  it('replaces only the people entry in the tab registry', () => {
    const people = ORGANIZATION_TABS.find((tab) => tab.id === 'people');
    expect(people?.component).toBe(OrganizationPeopleTab);

    // The other entries are untouched.
    expect(ORGANIZATION_TABS.map((tab) => tab.id)).toEqual([
      'overview',
      'branding',
      'structure',
      'people',
      'demographics',
      'settings',
    ]);
  });
});
