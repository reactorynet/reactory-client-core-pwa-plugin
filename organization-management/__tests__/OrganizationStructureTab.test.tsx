/**
 * @jest-environment jsdom
 *
 * Structure tab contract (ORG-022).
 *
 * Rendered directly with `OrganizationTabProps`, exactly as the detail shell
 * renders it — the same harness the branding and demographics suites use. The
 * stub SDK dispatches on GraphQL operation names, so these tests assert both the
 * document and the variables the tab sends, which is the persistence contract
 * the ticket asks for.
 *
 * The hierarchy assertions matter as much as the mutation assertions: the tab
 * must render one tree, not two flat lists, and a team must never be lost
 * because of the unit filter.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationStructureTab from '../OrganizationStructureTab';
import useOrganizationStructure from '../hooks/useOrganizationStructure';
import { ORGANIZATION_TABS } from '../organizationTabs';
import { makeTranslator } from '../i18n';
import {
  buildOrganizationStructure,
  currentUserId,
  movableBusinessUnits,
  referenceId,
  teamBusinessUnitId,
  teamDisplayName,
  userDisplayName,
} from '../organizationStructure';
import type { OrganizationTabProps } from '../types';
import {
  makeBusinessUnit,
  makeOrganization,
  makeReactory,
  makeTeam,
  mutationCallsFor,
  queryCallsFor,
  structureFixtures,
} from './testFixtures';

afterEach(cleanup);

interface SetupOptions {
  canManage?: boolean;
  fixture?: ReturnType<typeof structureFixtures>;
  reactory?: any;
}

const setup = (options: SetupOptions = {}) => {
  const fixture = options.fixture || structureFixtures();
  const organization = makeOrganization({ id: 'org-1' });

  const reactory =
    options.reactory ||
    makeReactory({
      organizations: [organization],
      businessUnits: fixture.businessUnits,
      teams: fixture.teams,
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

  const utils = render(<OrganizationStructureTab {...props} />);
  return { ...utils, props, reactory, fixture };
};

/** Wait until the structure read has rendered the tree. */
const ready = async (): Promise<void> => {
  await screen.findByTestId('organization-structure-tree');
};

/**
 * Wait for a closing MUI dialog to unmount.
 *
 * A mounted Dialog marks its siblings `aria-hidden` during the exit
 * transition, so role queries against the tab race the animation.
 */
const settled = async (): Promise<void> => {
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), {
    timeout: 5000,
  });
};

const lastCall = (reactory: any, operation: string) => {
  const calls = mutationCallsFor(reactory, operation);
  return calls[calls.length - 1];
};

const openUnitDialog = async (testId: string) => {
  await userEvent.click(screen.getByTestId(testId));
  return screen.findByRole('dialog');
};

const fill = async (container: HTMLElement, testId: string, value: string) => {
  const field = within(container).getByTestId(testId);
  await userEvent.clear(field);
  await userEvent.type(field, value);
};

describe('hierarchy', () => {
  it('renders business units as nodes with their teams nested beneath', async () => {
    const { reactory } = setup();
    await ready();

    const engineering = screen.getByTestId('structure-unit-bu-1');
    expect(within(engineering).getByText('Engineering')).toBeInTheDocument();
    expect(within(engineering).getByTestId('structure-team-team-1')).toBeInTheDocument();

    // The team is nested inside its unit, not duplicated at the top level.
    expect(within(engineering).queryByTestId('structure-team-team-2')).not.toBeInTheDocument();

    const documents = queryCallsFor(reactory, 'OrganizationStructureBusinessUnits');
    expect(String(documents[0][0])).toContain('pagedBusinessUnits');
    expect(documents[0][1]).toEqual({ organizationId: 'org-1', includeDeleted: false });

    const teamDocuments = queryCallsFor(reactory, 'OrganizationStructureTeams');
    expect(String(teamDocuments[0][0])).toContain('pagedTeams');
    expect(teamDocuments[0][1]).toEqual({ organizationId: 'org-1' });
  });

  it('groups teams with no business unit under Unassigned teams', async () => {
    setup();
    await ready();

    const unassigned = screen.getByTestId('structure-unassigned-teams');
    expect(within(unassigned).getByText('Unassigned teams')).toBeInTheDocument();
    expect(within(unassigned).getByTestId('structure-team-team-2')).toBeInTheDocument();
    expect(within(unassigned).getByText('Field Ops')).toBeInTheDocument();
  });

  it('shows an inline empty state for a unit with no teams', async () => {
    setup();
    await ready();

    const operations = screen.getByTestId('structure-unit-bu-2');
    const empty = within(operations).getByTestId('structure-unit-bu-2-empty');
    expect(empty).toHaveTextContent('No teams in this business unit');
    expect(within(operations).queryByTestId('structure-unit-bu-2-teams')).not.toBeInTheDocument();
  });

  it('keeps a team visible when its unit is filtered out of the view', async () => {
    // A soft-deleted unit is hidden by default; its team must land in the
    // unassigned group rather than vanish.
    const fixture = structureFixtures();
    fixture.businessUnits = fixture.businessUnits.map((unit) =>
      unit.id === 'bu-1' ? { ...unit, deleted: true } : unit,
    );

    setup({ fixture });
    await ready();

    expect(screen.queryByTestId('structure-unit-bu-1')).not.toBeInTheDocument();
    const unassigned = screen.getByTestId('structure-unassigned-teams');
    expect(within(unassigned).getByTestId('structure-team-team-1')).toBeInTheDocument();
  });

  it('shows the empty state when the organization has no units at all', async () => {
    setup({ fixture: { businessUnits: [], teams: [] } });

    const empty = await screen.findByTestId('organization-structure-empty');
    expect(empty).toHaveTextContent('No business units yet');
  });
});

describe('business unit writes', () => {
  it('creates a business unit with the organization, owner and description', async () => {
    const { props, reactory } = setup();
    await ready();

    const dialog = await openUnitDialog('structure-unit-create');
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true);

    await fill(dialog, 'structure-unit-name', 'Finance');
    await fill(dialog, 'structure-unit-description', 'Money matters');
    await fill(dialog, 'structure-unit-owner', 'user-owner-9');

    await userEvent.click(within(dialog).getByTestId('structure-unit-save'));

    await waitFor(() => expect(mutationCallsFor(reactory, 'CreateBusinessUnit')).toHaveLength(1));

    const [document, variables] = lastCall(reactory, 'CreateBusinessUnit');
    expect(String(document)).toContain('createBusinessUnit');
    expect(variables).toEqual({
      input: {
        organization: 'org-1',
        name: 'Finance',
        description: 'Money matters',
        owner: 'user-owner-9',
      },
    });

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Business unit Finance created.', 'success'),
    );
    expect(props.refresh).toHaveBeenCalled();
    // The tab's own hierarchy read is refreshed too, so the new unit appears.
    expect(queryCallsFor(reactory, 'OrganizationStructureBusinessUnits').length).toBeGreaterThan(1);

    await settled();
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false);
  });

  it('edits a business unit through updateBusinessUnit', async () => {
    const { props, reactory } = setup();
    await ready();

    const dialog = await openUnitDialog('structure-unit-edit-bu-1');
    await fill(dialog, 'structure-unit-name', 'Engineering and Platform');
    await userEvent.click(within(dialog).getByTestId('structure-unit-save'));

    await waitFor(() => expect(mutationCallsFor(reactory, 'UpdateBusinessUnit')).toHaveLength(1));

    const [document, variables] = lastCall(reactory, 'UpdateBusinessUnit');
    expect(String(document)).toContain('updateBusinessUnit');
    expect(variables).toEqual({
      id: 'bu-1',
      input: {
        name: 'Engineering and Platform',
        description: 'Builds and runs the platform.',
        owner: 'user-owner-1',
      },
    });

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith(
        'Business unit Engineering and Platform saved.',
        'success',
      ),
    );
    await settled();
  });

  it('soft-deletes a business unit and hides it from the default view', async () => {
    const { props, reactory } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('structure-unit-delete-bu-2'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete Operations?')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByTestId('structure-delete-confirm'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'DeleteBusinessUnit')).toHaveLength(1),
    );
    expect(lastCall(reactory, 'DeleteBusinessUnit')[1]).toEqual({ id: 'bu-2' });
    expect(props.notify).toHaveBeenCalledWith('Business unit Operations deleted.', 'success');

    await settled();
    await waitFor(() => expect(screen.queryByTestId('structure-unit-bu-2')).not.toBeInTheDocument());
  });

  it('restores a soft-deleted business unit from the deleted node', async () => {
    const fixture = structureFixtures();
    fixture.businessUnits = fixture.businessUnits.map((unit) =>
      unit.id === 'bu-2' ? { ...unit, deleted: true } : unit,
    );

    const { props, reactory } = setup({ fixture });
    await ready();

    // Hidden by default …
    expect(screen.queryByTestId('structure-unit-bu-2')).not.toBeInTheDocument();

    // … until the server's own `includeDeleted` filter is requested.
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Show deleted business units' }),
    );

    const legacy = await screen.findByTestId('structure-unit-bu-2');
    expect(within(legacy).getByText('Deleted')).toBeInTheDocument();

    const calls = queryCallsFor(reactory, 'OrganizationStructureBusinessUnits');
    expect(calls[calls.length - 1][1]).toEqual({ organizationId: 'org-1', includeDeleted: true });

    await userEvent.click(within(legacy).getByTestId('structure-unit-restore-bu-2'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'RestoreBusinessUnit')).toHaveLength(1),
    );
    expect(lastCall(reactory, 'RestoreBusinessUnit')[1]).toEqual({ id: 'bu-2' });
    expect(props.notify).toHaveBeenCalledWith('Business unit Operations restored.', 'success');
  });
});

describe('team writes', () => {
  it('creates a team inside the unit it was created from', async () => {
    const { props, reactory } = setup();
    await ready();

    const dialog = await openUnitDialog('structure-team-create-bu-2');
    await fill(dialog, 'structure-team-name', 'Data');
    await userEvent.click(within(dialog).getByTestId('structure-team-save'));

    await waitFor(() => expect(mutationCallsFor(reactory, 'CreateTeam')).toHaveLength(1));

    const [document, variables] = lastCall(reactory, 'CreateTeam');
    expect(String(document)).toContain('createTeam');
    expect(variables).toEqual({
      input: { organization: 'org-1', name: 'Data', businessUnit: 'bu-2' },
    });

    await waitFor(() => expect(props.notify).toHaveBeenCalledWith('Team Data created.', 'success'));
    await settled();
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false);
  });

  it('edits a team through updateTeam without sending businessUnit', async () => {
    const { props, reactory } = setup();
    await ready();

    const dialog = await openUnitDialog('structure-team-edit-team-1');
    await fill(dialog, 'structure-team-description', 'Platform engineering');
    await fill(dialog, 'structure-team-owner', 'user-owner-7');
    await userEvent.click(within(dialog).getByTestId('structure-team-save'));

    await waitFor(() => expect(mutationCallsFor(reactory, 'UpdateTeam')).toHaveLength(1));

    const [document, variables] = lastCall(reactory, 'UpdateTeam');
    expect(String(document)).toContain('updateTeam');
    expect(variables).toEqual({
      id: 'team-1',
      input: {
        name: 'Platform',
        description: 'Platform engineering',
        owner: 'user-owner-7',
      },
    });
    // A unit change is never smuggled through updateTeam.
    expect(variables.input.businessUnit).toBeUndefined();

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Team Platform saved.', 'success'),
    );
    await settled();
  });

  it('deletes a team through deleteTeam', async () => {
    const { props, reactory } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('structure-team-delete-team-1'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete Platform?')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByTestId('structure-delete-confirm'));

    await waitFor(() => expect(mutationCallsFor(reactory, 'DeleteTeam')).toHaveLength(1));
    expect(lastCall(reactory, 'DeleteTeam')[1]).toEqual({ id: 'team-1' });
    expect(props.notify).toHaveBeenCalledWith('Team Platform deleted.', 'success');
    await settled();
  });
});

describe('moving a team between units', () => {
  it('sends moveTeamToBusinessUnit with the team and target unit ids', async () => {
    const { props, reactory } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('structure-team-move-team-1'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Move Platform')).toBeInTheDocument();

    // Accessible, keyboard-reachable select — not drag-and-drop only.
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Business unit' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Operations' }));

    await userEvent.click(within(dialog).getByTestId('structure-move-confirm'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'MoveTeamToBusinessUnit')).toHaveLength(1),
    );

    const [document, variables] = lastCall(reactory, 'MoveTeamToBusinessUnit');
    expect(String(document)).toContain('moveTeamToBusinessUnit');
    expect(variables).toEqual({ id: 'team-1', businessUnitId: 'bu-2' });

    // The acceptance criterion: the move does not ride on updateTeam.
    expect(mutationCallsFor(reactory, 'UpdateTeam')).toHaveLength(0);

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Team Platform moved to Operations.', 'success'),
    );

    await settled();
    // …and the refreshed hierarchy nests the team under its new unit.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('structure-unit-bu-2')).getByTestId('structure-team-team-1'),
      ).toBeInTheDocument(),
    );
  });

  it('excludes the current unit from the move targets', async () => {
    setup();
    await ready();

    await userEvent.click(screen.getByTestId('structure-team-move-team-1'));

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Business unit' }));
    expect(await screen.findByRole('option', { name: 'Operations' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Engineering' })).not.toBeInTheDocument();
  });
});

describe('membership', () => {
  it('adds and removes a business unit member', async () => {
    const { reactory } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('structure-unit-members-bu-1'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Members of Engineering')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByTestId('structure-member-input'), 'user-new-1');
    await userEvent.click(within(dialog).getByTestId('structure-member-add'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'AddBusinessUnitMember')).toHaveLength(1),
    );
    expect(lastCall(reactory, 'AddBusinessUnitMember')[1]).toEqual({
      id: 'bu-1',
      memberId: 'user-new-1',
    });

    await userEvent.click(await screen.findByTestId('structure-member-remove-user-member-1'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'RemoveBusinessUnitMember')).toHaveLength(1),
    );
    expect(lastCall(reactory, 'RemoveBusinessUnitMember')[1]).toEqual({
      id: 'bu-1',
      memberId: 'user-member-1',
    });
  });

  it('adds and removes a team member', async () => {
    const { reactory } = setup();
    await ready();

    await userEvent.click(screen.getByTestId('structure-team-members-team-1'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Members of Platform')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByTestId('structure-member-input'), 'user-new-2');
    await userEvent.click(within(dialog).getByTestId('structure-member-add'));

    await waitFor(() => expect(mutationCallsFor(reactory, 'AddTeamMember')).toHaveLength(1));
    expect(lastCall(reactory, 'AddTeamMember')[1]).toEqual({
      id: 'team-1',
      memberId: 'user-new-2',
    });

    await userEvent.click(await screen.findByTestId('structure-member-remove-user-member-2'));

    await waitFor(() => expect(mutationCallsFor(reactory, 'RemoveTeamMember')).toHaveLength(1));
    expect(lastCall(reactory, 'RemoveTeamMember')[1]).toEqual({
      id: 'team-1',
      memberId: 'user-member-2',
    });
  });
});

describe('unsaved input', () => {
  it('reports dirty while a form holds input and keeps it set when the save fails', async () => {
    const fixture = structureFixtures();
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1' })],
      businessUnits: fixture.businessUnits,
      teams: fixture.teams,
      mutationImpl: (operation: string) =>
        operation === 'CreateBusinessUnit'
          ? { data: null, errors: [{ message: 'Not authorized for this organization' }] }
          : undefined,
    });

    const { props } = setup({ reactory });
    await ready();

    const dialog = await openUnitDialog('structure-unit-create');
    // A brand-new record is uncommitted from the moment the dialog opens.
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true);

    await fill(dialog, 'structure-unit-name', 'Finance');
    // Owner is required by `BusinessUnitInput`; fill it so the request is
    // actually attempted and the server's refusal is what the tab reports.
    await fill(dialog, 'structure-unit-owner', 'user-owner-9');
    await userEvent.click(within(dialog).getByTestId('structure-unit-save'));

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Not authorized for this organization', 'error'),
    );

    // The attempted request must not clear the guard; the draft is still there.
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByTestId('structure-unit-name')).toHaveValue(
      'Finance',
    );
  });

  it('clears the flag when the user discards', async () => {
    const { props } = setup();
    await ready();

    const dialog = await openUnitDialog('structure-unit-create');
    await fill(dialog, 'structure-unit-name', 'Finance');
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await settled();
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false);
  });
});

describe('read-only viewer', () => {
  it('renders the hierarchy but no write controls', async () => {
    setup({ canManage: false });
    await ready();

    expect(screen.getByTestId('organization-structure-readonly')).toBeInTheDocument();
    expect(screen.getByTestId('structure-unit-bu-1')).toBeInTheDocument();
    expect(screen.getByTestId('structure-team-team-1')).toBeInTheDocument();

    [
      'structure-unit-create',
      'structure-unit-edit-bu-1',
      'structure-unit-delete-bu-1',
      'structure-unit-members-bu-1',
      'structure-unit-restore-bu-1',
      'structure-team-create-bu-1',
      'structure-team-edit-team-1',
      'structure-team-move-team-1',
      'structure-team-delete-team-1',
      'structure-team-members-team-1',
    ].forEach((testId) => {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    });

    // No write affordance leaks through as a button either.
    expect(screen.queryByRole('button', { name: /Add business unit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
  });

  it('hides restore for a deleted unit when the viewer cannot manage', async () => {
    const fixture = structureFixtures();
    fixture.businessUnits = fixture.businessUnits.map((unit) =>
      unit.id === 'bu-2' ? { ...unit, deleted: true } : unit,
    );

    setup({ canManage: false, fixture });
    await ready();

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Show deleted business units' }),
    );

    const legacy = await screen.findByTestId('structure-unit-bu-2');
    expect(within(legacy).getByText('Deleted')).toBeInTheDocument();
    expect(screen.queryByTestId('structure-unit-restore-bu-2')).not.toBeInTheDocument();
  });
});

describe('registry wiring', () => {
  it('replaces only the structure registry entry', () => {
    const structure = ORGANIZATION_TABS.find((tab) => tab.id === 'structure');
    const people = ORGANIZATION_TABS.find((tab) => tab.id === 'people');
    const demographics = ORGANIZATION_TABS.find((tab) => tab.id === 'demographics');

    expect(structure?.component).toBe(OrganizationStructureTab);
    // The entries this ticket must leave alone.
    expect(`${people?.component.displayName || ''}`).toContain('ORG-024');
    expect(demographics?.component).not.toBe(OrganizationStructureTab);
  });
});

describe('organizationStructure helpers', () => {
  it('nests teams by their business unit link and never drops one', () => {
    const units = [makeBusinessUnit({ id: 'bu-1' }), makeBusinessUnit({ id: 'bu-2' })];
    const teams = [
      makeTeam({ id: 'team-1', businessUnit: { id: 'bu-1', name: 'Engineering' } }),
      makeTeam({ id: 'team-2', businessUnit: null }),
      makeTeam({ id: 'team-3', businessUnit: { id: 'bu-missing', name: 'Gone' } }),
    ];

    const tree = buildOrganizationStructure(units, teams);

    expect(tree.nodes[0].teams.map((team) => team.id)).toEqual(['team-1']);
    expect(tree.nodes[1].teams).toEqual([]);
    expect(tree.unassignedTeams.map((team) => team.id)).toEqual(['team-2', 'team-3']);
  });

  it('reads references and display names defensively', () => {
    expect(referenceId('bu-1')).toBe('bu-1');
    expect(referenceId({ id: 'bu-1' })).toBe('bu-1');
    expect(referenceId(null)).toBe('');
    expect(teamBusinessUnitId(makeTeam())).toBe('bu-1');
    expect(teamBusinessUnitId(makeTeam({ businessUnit: null }))).toBe('');
    expect(teamDisplayName(makeTeam({ name: null, title: 'Legacy title' }))).toBe('Legacy title');
    expect(userDisplayName({ id: 'u1', firstName: 'Ada', lastName: 'Lovelace' })).toBe(
      'Ada Lovelace',
    );
    expect(userDisplayName({ id: 'u2', email: 'solo@example.com' })).toBe('solo@example.com');
    expect(userDisplayName(null)).toBe('');
  });

  it('offers only live units other than the team current unit as move targets', () => {
    const units = [
      makeBusinessUnit({ id: 'bu-1' }),
      makeBusinessUnit({ id: 'bu-2' }),
      makeBusinessUnit({ id: 'bu-3', deleted: true }),
    ];

    expect(movableBusinessUnits(units, 'bu-1').map((unit) => unit.id)).toEqual(['bu-2']);
    expect(movableBusinessUnits(units, null).map((unit) => unit.id)).toEqual(['bu-1', 'bu-2']);
  });

  it('reads the current user id from the SDK session shapes', () => {
    expect(currentUserId({ getUser: () => ({ loggedIn: { id: 'u1' } }) })).toBe('u1');
    expect(currentUserId({ getUser: () => ({ user: { id: 'u2' } }) })).toBe('u2');
    expect(currentUserId({ getUser: () => ({}) })).toBe('');
    expect(currentUserId(null)).toBe('');
  });
});

describe('useOrganizationStructure', () => {
  /**
   * The sequence guard is the hook's reason for existing: the units and teams
   * of one read are one unit of work. A stale response — the one still in flight
   * when the deleted filter flips — must not overwrite the newer result.
   */
  it('discards a stale read so a newer response wins', async () => {
    const fixture = structureFixtures();
    const resolvers: Array<(value: any) => void> = [];

    const reactory: any = {
      graphqlQuery: jest.fn(
        (document: string) =>
          new Promise((resolve) => {
            const operation = /query\s+([A-Za-z0-9_]+)/.exec(String(document))?.[1];
            resolvers.push((value) => resolve({ data: value, errors: [] }));
            // Tag the pending call so the test can resolve them out of order.
            (resolvers[resolvers.length - 1] as any).operation = operation;
          }),
      ),
      graphqlMutation: jest.fn(),
    };

    const Harness: React.FC = () => {
      const structure = useOrganizationStructure({
        reactory,
        organization: makeOrganization({ id: 'org-1' }),
      });
      return (
        <div>
          <span data-testid="unit-count">{structure.businessUnits.length}</span>
          <button type="button" onClick={() => structure.setIncludeDeleted(true)}>
            toggle
          </button>
        </div>
      );
    };

    render(<Harness />);

    await waitFor(() => expect(resolvers.length).toBe(2));

    // Flip the filter: the first read is now stale, a second pair is in flight.
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await waitFor(() => expect(resolvers.length).toBe(4));

    const [, , unitsNew, teamsNew] = resolvers;
    unitsNew({
      OrganizationStructureBusinessUnits: {
        businessUnits: [makeBusinessUnit({ id: 'bu-new' })],
        paging: { total: 1 },
      },
    });
    teamsNew({ OrganizationStructureTeams: { teams: [], paging: { total: 0 } } });

    await waitFor(() => expect(screen.getByTestId('unit-count')).toHaveTextContent('1'));

    // Now the stale first read lands. It must be ignored, not applied.
    const [unitsOld, teamsOld] = resolvers;
    unitsOld({
      OrganizationStructureBusinessUnits: {
        businessUnits: fixture.businessUnits,
        paging: { total: fixture.businessUnits.length },
      },
    });
    teamsOld({ OrganizationStructureTeams: { teams: fixture.teams, paging: { total: 2 } } });

    await waitFor(() => expect(screen.getByTestId('unit-count')).toHaveTextContent('1'));
  });
});
