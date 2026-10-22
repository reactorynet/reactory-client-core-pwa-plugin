/**
 * @jest-environment jsdom
 *
 * Demographics configuration pane (ORG-031).
 *
 * Rendered directly with `OrganizationTabProps`, exactly as the detail shell
 * renders it. The stub SDK dispatches on GraphQL operation names, so these tests
 * assert the document, the variables and the user-visible outcome — the
 * persistence and guard-rail contract the ticket asks for.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import OrganizationDemographicsTab from '../OrganizationDemographicsTab';
import OrganizationPeopleTab from '../OrganizationPeopleTab';
import { ORGANIZATION_TABS } from '../organizationTabs';
import { makeTranslator } from '../i18n';
import type { OrganizationTabProps } from '../types';
import {
  baseDemographicDefinitions,
  makeDemographicDefinition,
  makeOrganization,
  makeReactory,
  mutationCallsFor,
  queryCallsFor,
} from './testFixtures';

afterEach(cleanup);

const DEFINITIONS_QUERY = 'OrganizationDemographicDefinitions';
const VALUES_QUERY = 'OrganizationDemographicValues';
const SAVE = 'OrganizationSaveDemographicDefinition';
const DELETE = 'OrganizationDeleteDemographicDefinition';
const REORDER = 'OrganizationReorderDemographicDefinitions';
const ENABLE = 'OrganizationSetDemographicEnabled';

interface SetupOptions {
  canManage?: boolean;
  definitions?: ReturnType<typeof baseDemographicDefinitions>;
  counts?: Record<string, number>;
  reactory?: any;
}

const setup = (options: SetupOptions = {}) => {
  const definitions = options.definitions || baseDemographicDefinitions();
  const counts = options.counts || { gender: 12 };

  const reactory =
    options.reactory ||
    makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: definitions,
      demographicValueCounts: counts,
    });

  const props: OrganizationTabProps = {
    reactory,
    t: makeTranslator({}),
    organization: makeOrganization(),
    statistics: null,
    canManage: options.canManage !== false,
    refresh: jest.fn().mockResolvedValue(undefined),
    onUnsavedChanges: jest.fn(),
    notify: jest.fn(),
  };

  const utils = render(<OrganizationDemographicsTab {...props} />);
  return { ...utils, props, reactory, definitions };
};

/** Wait for the definitions read to land. */
const waitForList = async () => {
  await waitFor(() => expect(screen.getByTestId('organization-demographics-table')).toBeInTheDocument());
};

const savedInput = (reactory: any, call = 0) =>
  mutationCallsFor(reactory, SAVE)[call][1].definition;

describe('registry wiring', () => {
  it('replaces only the demographics registry entry', () => {
    const demographics = ORGANIZATION_TABS.find((tab) => tab.id === 'demographics');
    const structure = ORGANIZATION_TABS.find((tab) => tab.id === 'structure');
    const people = ORGANIZATION_TABS.find((tab) => tab.id === 'people');
    const settings = ORGANIZATION_TABS.find((tab) => tab.id === 'settings');

    expect(demographics?.component).toBe(OrganizationDemographicsTab);
    // ORG-022 and ORG-024 have replaced their placeholders; the settings
    // placeholder this ticket must leave alone is still in place.
    expect(`${structure?.component.displayName || ''}`).toBe('OrganizationStructureTab');
    expect(people?.component).toBe(OrganizationPeopleTab);
    expect(`${settings?.component.displayName || ''}`).toContain('ORG-011+');
  });
});

describe('definition list', () => {
  it('reads every definition, including disabled ones', async () => {
    const { reactory } = setup({
      definitions: [
        ...baseDemographicDefinitions(),
        makeDemographicDefinition({ id: 'def-5', key: 'pronoun', title: 'Pronoun', ordinal: 4, enabled: false }),
      ],
    });

    await waitForList();

    expect(queryCallsFor(reactory, DEFINITIONS_QUERY)).toHaveLength(1);
    expect(queryCallsFor(reactory, DEFINITIONS_QUERY)[0][1]).toEqual({
      organizationId: 'org-1',
      includeDisabled: true,
    });
    expect(screen.getByTestId('demographic-definition-row-pronoun')).toBeInTheDocument();
  });

  it('marks system definitions and shows the stored-value count', async () => {
    setup({ counts: { gender: 12, shirtsize: 3 } });
    await waitForList();

    expect(screen.getByTestId('demographic-definition-system-gender')).toBeInTheDocument();
    expect(screen.queryByTestId('demographic-definition-system-shirtsize')).toBeNull();

    await waitFor(() =>
      expect(screen.getByTestId('demographic-definition-usage-gender')).toHaveTextContent('12'),
    );
    expect(screen.getByTestId('demographic-definition-usage-shirtsize')).toHaveTextContent('3');
    // A definition nobody has answered yet renders an explicit zero, not a dash.
    expect(screen.getByTestId('demographic-definition-usage-team')).toHaveTextContent('0');
  });

  it('counts values once per definition, not once per pane', async () => {
    const { reactory } = setup();

    await waitForList();
    await waitFor(() => expect(queryCallsFor(reactory, VALUES_QUERY).length).toBe(4));

    const keys = queryCallsFor(reactory, VALUES_QUERY).map((call) => call[1].filter.key);
    expect(keys.sort()).toEqual(['dateofbirth', 'gender', 'shirtsize', 'team']);
    expect(queryCallsFor(reactory, VALUES_QUERY)[0][1].paging).toEqual({ page: 1, pageSize: 1 });
  });

  it('surfaces a load failure with a retry', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      queryImpl: (operation: string) =>
        operation === DEFINITIONS_QUERY
          ? { data: null, errors: [{ message: 'Not authorized for this organization' }] }
          : undefined,
    });

    setup({ reactory });

    const error = await screen.findByTestId('organization-demographics-load-error');
    expect(error).toHaveTextContent('Not authorized for this organization');
    expect(within(error).getByText('Retry')).toBeInTheDocument();
  });
});

describe('read-only viewer', () => {
  it('hides every write control', async () => {
    const { reactory } = setup({ canManage: false });
    await waitForList();

    expect(screen.getByTestId('organization-demographics-readonly')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-demographics-new')).toBeNull();
    expect(screen.queryByTestId('demographic-definition-enabled-gender')).toBeNull();
    expect(screen.queryByTestId('demographic-definition-required-gender')).toBeNull();
    expect(screen.queryByTestId('demographic-definition-edit-gender')).toBeNull();
    expect(screen.queryByTestId('demographic-definition-delete-gender')).toBeNull();
    expect(screen.queryByTestId('demographic-definition-move-down-gender')).toBeNull();

    // The value listing is administrator-only server-side, so it is never asked for.
    expect(queryCallsFor(reactory, VALUES_QUERY)).toHaveLength(0);
  });
});

describe('inline toggles', () => {
  it('enables and disables through the dedicated mutation', async () => {
    const { reactory, props } = setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-enabled-gender'));

    await waitFor(() => expect(mutationCallsFor(reactory, ENABLE)).toHaveLength(1));
    expect(mutationCallsFor(reactory, ENABLE)[0][1]).toEqual({
      organizationId: 'org-1',
      key: 'gender',
      enabled: false,
    });

    await waitFor(() => expect(props.refresh).toHaveBeenCalledTimes(1));
    expect(props.notify).toHaveBeenCalledWith('Gender is now disabled.', 'success');
  });

  it('patches only required, and never sends the frozen key', async () => {
    const { reactory, props } = setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-required-gender'));

    await waitFor(() => expect(mutationCallsFor(reactory, SAVE)).toHaveLength(1));
    const input = savedInput(reactory);

    expect(input).toEqual({ id: 'def-1', required: true });
    expect(input).not.toHaveProperty('key');
    expect(props.notify).toHaveBeenCalledWith('Gender is now required.', 'success');
  });
});

describe('ordering', () => {
  it('persists the key order when a row is moved with the keyboard-accessible control', async () => {
    const { reactory, props } = setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-move-down-gender'));

    await waitFor(() => expect(mutationCallsFor(reactory, REORDER)).toHaveLength(1));
    expect(mutationCallsFor(reactory, REORDER)[0][1]).toEqual({
      organizationId: 'org-1',
      keys: ['dateofbirth', 'gender', 'team', 'shirtsize'],
    });
    expect(props.notify).toHaveBeenCalledWith('Order saved.', 'success');
  });

  it('persists the key order when a row is dragged onto another', async () => {
    const { reactory } = setup();
    await waitForList();

    const source = screen.getByTestId('demographic-definition-row-gender');
    const target = screen.getByTestId('demographic-definition-row-team');

    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    await waitFor(() => expect(mutationCallsFor(reactory, REORDER)).toHaveLength(1));
    expect(mutationCallsFor(reactory, REORDER)[0][1].keys).toEqual([
      'dateofbirth',
      'team',
      'gender',
      'shirtsize',
    ]);
  });

  it('does not raise the pane load banner for a refused write', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
      demographicValueCounts: { gender: 12 },
      mutationImpl: (operation: string) =>
        operation === REORDER
          ? { data: null, errors: [{ message: 'At least one demographic definition key is required to reorder' }] }
          : undefined,
    });

    const { props } = setup({ reactory });
    await waitForList();

    // The read succeeded, so there is no load failure to retry.
    expect(screen.queryByTestId('organization-demographics-load-error')).toBeNull();

    fireEvent.click(screen.getByTestId('demographic-definition-move-down-gender'));

    await waitFor(() => expect(props.notify).toHaveBeenCalledWith(expect.any(String), 'error'));

    // A refused write is reported by notify(); it must NOT be rendered as the
    // pane's load banner, whose Retry re-reads instead of retrying the write.
    expect(screen.queryByTestId('organization-demographics-load-error')).toBeNull();
    expect(queryCallsFor(reactory, DEFINITIONS_QUERY)).toHaveLength(1);
  });

  it('keeps the current order when the server refuses the change', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
      demographicValueCounts: { gender: 12 },
      mutationImpl: (operation: string) =>
        operation === REORDER
          ? { data: null, errors: [{ message: 'At least one demographic definition key is required to reorder' }] }
          : undefined,
    });

    const { props } = setup({ reactory });
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-move-down-gender'));

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith(
        'At least one demographic definition key is required to reorder',
        'error',
      ),
    );
    expect(props.refresh).not.toHaveBeenCalled();
  });
});

describe('create drawer', () => {
  it('opens an empty draft, previews it, and reports unsaved input', async () => {
    const { props } = setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('organization-demographics-new'));

    const drawer = await screen.findByTestId('demographic-definition-drawer');
    expect(within(drawer).getByTestId('demographic-definition-field-key')).not.toBeDisabled();
    expect(screen.getByTestId('demographic-definition-preview')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('demographic-definition-field-title'), {
      target: { value: 'Shirt size' },
    });

    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true));
  });

  it('discards without a request and releases the guard', async () => {
    const { reactory, props } = setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('organization-demographics-new'));
    fireEvent.change(await screen.findByTestId('demographic-definition-field-title'), {
      target: { value: 'Shirt size' },
    });
    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByTestId('demographic-definition-cancel'));

    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false));
    expect(mutationCallsFor(reactory, SAVE)).toHaveLength(0);
  });

  it('saves a new definition with its key and no id, then refreshes', async () => {
    const { reactory, props } = setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('organization-demographics-new'));

    fireEvent.change(await screen.findByTestId('demographic-definition-field-key'), {
      target: { value: 'ShirtSize' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-field-title'), {
      target: { value: 'Shirt size' },
    });

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    await waitFor(() => expect(mutationCallsFor(reactory, SAVE)).toHaveLength(1));
    const input = savedInput(reactory);

    expect(input.key).toBe('shirtsize');
    expect(input).not.toHaveProperty('id');
    expect(input.title).toBe('Shirt size');
    expect(input.enabled).toBe(true);

    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false));
    expect(props.notify).toHaveBeenCalledWith('Shirt size was saved.', 'success');
    await waitFor(() => expect(props.refresh).toHaveBeenCalledTimes(1));
    // A create changes the set, so the counts are re-collected from a fresh read.
    await waitFor(() =>
      expect(queryCallsFor(reactory, DEFINITIONS_QUERY).length).toBeGreaterThan(1),
    );
  });

  it('blocks the save on an inline schema error and keeps the draft dirty', async () => {
    const { reactory, props } = setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('organization-demographics-new'));
    fireEvent.change(await screen.findByTestId('demographic-definition-field-key'), {
      target: { value: 'shirtsize' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-field-title'), {
      target: { value: 'Shirt size' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-field-schema'), {
      target: { value: '{ "type": "object", }' },
    });

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(await screen.findByText('The schema is not valid JSON.')).toBeInTheDocument();
    expect(mutationCallsFor(reactory, SAVE)).toHaveLength(0);
    expect(screen.getByTestId('demographic-definition-drawer')).toBeInTheDocument();
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true);
  });

  it('shows the enum options editor only for choice types', async () => {
    setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('organization-demographics-new'));
    await screen.findByTestId('demographic-definition-drawer');

    // A new draft starts as `string`, so there is nothing to enumerate.
    expect(screen.queryByTestId('demographic-definition-options')).toBeNull();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /value type/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'Single choice' }));

    expect(await screen.findByTestId('demographic-definition-options')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    expect(await screen.findByTestId('demographic-definition-option-0')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('demographic-definition-option-0-key'), {
      target: { value: 'small' },
    });
    expect(screen.getByTestId('demographic-definition-option-0-key')).toHaveValue('small');
  });
});

describe('edit drawer', () => {
  it('renders the key read-only and never sends it on update', async () => {
    const { reactory, props } = setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-edit-shirtsize'));

    const key = await screen.findByTestId('demographic-definition-field-key');
    expect(key).toBeDisabled();
    expect(key).toHaveValue('shirtsize');
    expect(
      screen.getByText(/The key is permanent: stored values reference it/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('demographic-definition-field-title'), {
      target: { value: 'T-shirt size' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    await waitFor(() => expect(mutationCallsFor(reactory, SAVE)).toHaveLength(1));
    const input = savedInput(reactory);

    expect(input.id).toBe('def-4');
    expect(input).not.toHaveProperty('key');
    expect(input.title).toBe('T-shirt size');

    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false));
  });

  it('explains why a system definition cannot change its value type', async () => {
    setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-edit-gender'));
    await screen.findByTestId('demographic-definition-drawer');

    expect(
      screen.getByRole('combobox', { name: /value type/i }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText(/This is a system definition, so its value type cannot change/i),
    ).toBeInTheDocument();
  });

  it('leaves a custom definition’s value type editable', async () => {
    setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-edit-shirtsize'));
    await screen.findByTestId('demographic-definition-drawer');

    expect(screen.getByRole('combobox', { name: /value type/i })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows the reference picker for a reference definition', async () => {
    setup();
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-edit-team'));
    await screen.findByTestId('demographic-definition-drawer');

    expect(screen.getByTestId('demographic-definition-reference')).toBeInTheDocument();
    expect(screen.getByTestId('demographic-definition-field-reference-multiple')).toBeInTheDocument();
  });

  it('keeps the drawer open and dirty when the save fails', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
      demographicValueCounts: { gender: 12 },
      mutationImpl: (operation: string) =>
        operation === SAVE
          ? { data: null, errors: [{ message: 'A title is required' }] }
          : undefined,
    });

    const { props } = setup({ reactory });
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-edit-shirtsize'));
    fireEvent.change(await screen.findByTestId('demographic-definition-field-title'), {
      target: { value: 'T-shirt size' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(await screen.findByTestId('demographic-definition-save-error')).toHaveTextContent(
      'A title is required',
    );

    // The request was attempted; the work is not finished, so the drawer stays
    // open and the shell keeps guarding.
    expect(screen.getByTestId('demographic-definition-drawer')).toBeInTheDocument();
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true);
    expect(props.notify).toHaveBeenCalledWith('A title is required', 'error');
  });
});

describe('delete guard rail', () => {
  it('surfaces the server refusal and keeps the row', async () => {
    const { reactory, props } = setup({ counts: { gender: 12, shirtsize: 3 } });
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-delete-shirtsize'));
    await screen.findByTestId('demographic-definition-delete-dialog');

    fireEvent.click(screen.getByTestId('demographic-definition-delete-confirm'));

    const refusal = await screen.findByTestId('demographic-definition-delete-error');
    expect(refusal).toHaveTextContent(
      'Demographic definition [shirtsize] cannot be deleted because 3 value(s) still reference it. Disable the definition instead.',
    );

    // Nothing was removed optimistically.
    expect(screen.getByTestId('demographic-definition-row-shirtsize')).toBeInTheDocument();
    expect(props.refresh).not.toHaveBeenCalled();
    expect(props.notify).toHaveBeenLastCalledWith(
      'Demographic definition [shirtsize] cannot be deleted because 3 value(s) still reference it. Disable the definition instead.',
      'error',
    );
    expect(mutationCallsFor(reactory, DELETE)).toHaveLength(1);
  });

  it('removes the row only after the server confirms the delete', async () => {
    const { reactory, props } = setup({ counts: {} });
    await waitForList();

    fireEvent.click(screen.getByTestId('demographic-definition-delete-shirtsize'));
    await screen.findByTestId('demographic-definition-delete-dialog');

    expect(screen.getByTestId('demographic-definition-row-shirtsize')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('demographic-definition-delete-confirm'));

    await waitFor(() =>
      expect(screen.queryByTestId('demographic-definition-row-shirtsize')).toBeNull(),
    );
    expect(mutationCallsFor(reactory, DELETE)[0][1]).toEqual({
      organizationId: 'org-1',
      key: 'shirtsize',
    });
    expect(props.notify).toHaveBeenCalledWith('Shirt size was deleted.', 'success');
    await waitFor(() => expect(props.refresh).toHaveBeenCalledTimes(1));
  });
});

describe('empty state', () => {
  it('offers the create affordance when the organization has no definitions', async () => {
    setup({ definitions: [] });

    expect(await screen.findByTestId('organization-demographics-empty')).toBeInTheDocument();
    expect(screen.getByTestId('organization-demographics-new')).toBeInTheDocument();
  });
});
