/**
 * @jest-environment jsdom
 *
 * Demographics values pane (ORG-033).
 *
 * Rendered inside the real Demographics tab, exactly as the detail shell renders
 * it, so the pane switch and the untouched configuration view are part of what
 * is asserted. The stub SDK dispatches on GraphQL operation names, so these
 * tests pin the documents, the variables and the user-visible outcome.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import OrganizationDemographicsTab from '../OrganizationDemographicsTab';
import { makeTranslator } from '../i18n';
import type { OrganizationTabProps } from '../types';
import type { OrganizationDemographicAggregateReport, OrganizationDemographicValue, OrganizationMember } from '../types';
import type { DemographicDefinition } from '../../demographic-form';
import {
  baseDemographicDefinitions,
  demographicValueFixtures,
  makeDemographicAggregateReport,
  makeDemographicDefinition,
  makeDemographicValue,
  makeOrganization,
  makeReactory,
  mutationCallsFor,
  organizationMemberFixtures,
  queryCallsFor,
  selectOption,
} from './testFixtures';

/**
 * The shared `DateSelectorWidget` wraps a MUI `DatePicker`, which needs a
 * `LocalizationProvider`/adapter. The host provides one at runtime; stubbing it
 * here keeps these tests about the values pane (the same approach the ORG-032
 * suite takes) while still letting a `date` row render.
 */
jest.mock('@reactory/client-core/components/reactory/ux/mui/widgets/DateSelector', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    DateWidget: (props: any) =>
      ReactLib.createElement('input', {
        'data-testid': 'shared-date-selector',
        'aria-label': props.uiSchema?.['ui:options']?.label,
        value: props.formData || '',
        onChange: (event: any) => props.onChange(event.target.value),
      }),
  };
});

afterEach(cleanup);

const DEFINITIONS_QUERY = 'OrganizationDemographicDefinitions';
const VALUES_QUERY = 'OrganizationDemographicValues';
const AGGREGATES_QUERY = 'OrganizationDemographicAggregates';
const SAVE_VALUE = 'OrganizationSaveDemographicValue';
const BULK_SAVE = 'OrganizationBulkSaveDemographicValues';
const DELETE_VALUE = 'OrganizationDeleteDemographicValue';

/** A multi-enum definition, so the table has a list to render readably. */
const languageDefinition = (): DemographicDefinition =>
  makeDemographicDefinition({
    id: 'def-5',
    key: 'language',
    title: 'Language',
    category: 'personal',
    valueType: 'multi-enum',
    multiValued: false,
    options: [
      { key: 'English', label: 'English', ordinal: 0, deprecated: false },
      { key: 'French', label: 'French', ordinal: 1, deprecated: false },
    ],
    ordinal: 4,
  });

const definitionsFixture = (): DemographicDefinition[] => [
  ...baseDemographicDefinitions(),
  languageDefinition(),
];

const valuesFixture = (): OrganizationDemographicValue[] => [
  ...demographicValueFixtures(),
  makeDemographicValue({
    id: 'value-4',
    user: 'user-1',
    key: 'shirtsize',
    definition: 'def-4',
    value: 'Large',
    valueType: 'string',
    source: 'admin',
  }),
];

interface SetupOptions {
  canManage?: boolean;
  definitions?: DemographicDefinition[];
  values?: OrganizationDemographicValue[];
  members?: OrganizationMember[];
  aggregates?: OrganizationDemographicAggregateReport;
  mutationImpl?: (operation: string, variables: any, callIndex: number) => any;
  queryImpl?: (operation: string, variables: any, callIndex: number) => any;
}

const setup = (options: SetupOptions = {}) => {
  const definitions = options.definitions || definitionsFixture();
  const values = options.values || valuesFixture();
  const members = options.members || organizationMemberFixtures();

  const reactory = makeReactory({
    organizations: [makeOrganization()],
    demographicDefinitions: definitions,
    demographicValueCounts: { gender: 1, dateofbirth: 1, language: 1, shirtsize: 1 },
    demographicValues: values,
    demographicAggregates: options.aggregates || makeDemographicAggregateReport(),
    members,
    mutationImpl: options.mutationImpl,
    queryImpl: options.queryImpl,
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
  return { ...utils, props, reactory, values, definitions };
};

/** Wait for the ORG-031 configuration table (the tab's default view). */
const waitForConfiguration = async (): Promise<void> => {
  await waitFor(() =>
    expect(screen.getByTestId('organization-demographics-table')).toBeInTheDocument(),
  );
};

/** Switch to the Values view and wait for the first page. */
const openValues = async (): Promise<void> => {
  fireEvent.click(screen.getByTestId('organization-demographics-pane-values'));
  await waitFor(() =>
    expect(screen.getByTestId('organization-demographics-values')).toBeInTheDocument(),
  );
  await waitFor(() => expect(screen.getByTestId('demographic-values-table')).toBeInTheDocument());
};

/**
 * The pane's table read, excluding the configuration pane's one-row count reads
 * (which use `pageSize: 1` and are a different question).
 */
const tableQueries = (reactory: any) =>
  queryCallsFor(reactory, VALUES_QUERY).filter(
    (call: any[]) => Number(call[1]?.paging?.pageSize) !== 1,
  );

const lastTableQuery = (reactory: any) => {
  const calls = tableQueries(reactory);
  return calls[calls.length - 1];
};

describe('pane switch', () => {
  it('renders both views inside the one Demographics tab', async () => {
    setup();
    await waitForConfiguration();

    // Configuration is the default and is untouched.
    expect(screen.getByTestId('organization-demographics-new')).toBeInTheDocument();

    await openValues();
    expect(screen.queryByTestId('organization-demographics-table')).toBeNull();
    expect(screen.getByTestId('demographic-values-table')).toBeInTheDocument();

    // Back to configuration: the ORG-031 table and its create action still work.
    fireEvent.click(screen.getByTestId('organization-demographics-pane-configuration'));
    await waitForConfiguration();
    fireEvent.click(screen.getByTestId('organization-demographics-new'));
    expect(screen.getByTestId('demographic-definition-drawer')).toBeInTheDocument();
  });

  it('does not add a second entry to the tab registry', () => {
    // The registry is the shell's extension point; ORG-033 must not extend it.
    const { ORGANIZATION_TABS } = require('../organizationTabs');
    expect(ORGANIZATION_TABS.filter((tab: any) => tab.id === 'demographics')).toHaveLength(1);
    expect(ORGANIZATION_TABS.map((tab: any) => tab.id)).not.toContain('demographic-values');
  });
});

describe('values table', () => {
  it('renders the member, definition, value, source, verified and updated columns', async () => {
    setup();
    await openValues();

    const row = screen.getByTestId('demographic-value-row-gender-user-1');

    expect(within(row).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(row).getByText('ada@example.com')).toBeInTheDocument();
    expect(within(row).getByText('Gender')).toBeInTheDocument();
    expect(within(row).getByText('Female')).toBeInTheDocument();
    expect(within(row).getByText('Member')).toBeInTheDocument();
    expect(within(row).getByText('No')).toBeInTheDocument();
  });

  it('renders a multi-valued definition as a readable list, not raw JSON', async () => {
    setup();
    await openValues();

    const cell = screen.getByTestId('demographic-value-cell-language-user-1');

    expect(cell).toHaveTextContent('English, French');
    expect(cell.textContent).not.toContain('[');
    expect(cell.textContent).not.toContain('"');
  });

  it('pages through PagedDemographicValues.paging', async () => {
    const values = Array.from({ length: 30 }, (_unused, index) =>
      makeDemographicValue({
        id: `value-${index + 1}`,
        user: `member-${index + 1}`,
        key: 'shirtsize',
        definition: 'def-4',
        value: `Size ${index + 1}`,
        valueType: 'string',
      }),
    );

    const { reactory } = setup({ values });
    await openValues();

    expect(lastTableQuery(reactory)[1].paging).toEqual({ page: 1, pageSize: 25 });
    expect(screen.queryByTestId('demographic-value-row-shirtsize-member-30')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /go to next page/i }));

    await waitFor(() =>
      expect(screen.getByTestId('demographic-value-row-shirtsize-member-30')).toBeInTheDocument(),
    );
    expect(lastTableQuery(reactory)[1].paging).toEqual({ page: 2, pageSize: 25 });
  });

  it('sends the definition filter as DemographicValueFilter.key', async () => {
    const { reactory } = setup();
    await openValues();

    await selectOption(
      screen.getByRole('combobox', { name: 'Definition' }),
      'Gender',
      fireEvent,
      screen,
    );

    await waitFor(() => expect(lastTableQuery(reactory)[1].filter).toEqual({ key: 'gender' }));
    expect(screen.getByTestId('demographic-value-row-gender-user-1')).toBeInTheDocument();
    expect(screen.queryByTestId('demographic-value-row-shirtsize-user-1')).toBeNull();
  });

  it('resolves a member email and sends it as DemographicValueFilter.user', async () => {
    const { reactory } = setup();
    await openValues();

    const input = screen.getByTestId('demographic-values-filter-user');
    fireEvent.change(input, { target: { value: 'grace@example.com' } });
    fireEvent.blur(input);

    await waitFor(() => expect(lastTableQuery(reactory)[1].filter).toEqual({ user: 'user-2' }));
    expect(screen.getByTestId('demographic-value-row-dateofbirth-user-2')).toBeInTheDocument();
    expect(screen.queryByTestId('demographic-value-row-gender-user-1')).toBeNull();
  });
});

describe('completeness summary', () => {
  it('renders the threshold, the suppressed count and each definition', async () => {
    setup();
    await openValues();

    expect(screen.getByTestId('demographic-completeness-threshold')).toHaveTextContent(
      'Cohorts smaller than 5 members are suppressed.',
    );
    expect(screen.getByTestId('demographic-completeness-suppressed')).toHaveTextContent(
      '1 definition(s) withheld entirely',
    );
    expect(screen.getByTestId('demographic-completeness-row-gender')).toHaveTextContent(
      '12 member(s) covered',
    );
    expect(
      screen.getByTestId('demographic-completeness-row-dateofbirth'),
    ).toHaveTextContent('Withheld');
    expect(screen.getByTestId('demographic-completeness-caveat')).toHaveTextContent(
      'not organization totals',
    );
  });

  it('scopes the aggregate read to the definitions the tab loaded', async () => {
    const { reactory } = setup();
    await openValues();

    expect(queryCallsFor(reactory, AGGREGATES_QUERY)).toHaveLength(1);
    expect(queryCallsFor(reactory, AGGREGATES_QUERY)[0][1]).toEqual({
      organizationId: 'org-1',
      definitionKeys: ['gender', 'dateofbirth', 'team', 'shirtsize', 'language'],
    });
  });
});

describe('edit drawer', () => {
  it('saves through OrganizationSaveDemographicValue and refreshes', async () => {
    const { reactory, props } = setup();
    await openValues();

    fireEvent.click(screen.getByTestId('demographic-value-edit-shirtsize-user-1'));
    const drawer = await screen.findByTestId('demographic-value-drawer');

    const input = within(drawer).getByRole('textbox', { name: 'Shirt size' });
    fireEvent.change(input, { target: { value: 'X-Large' } });
    fireEvent.click(within(drawer).getByTestId('demographic-value-drawer-save'));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, SAVE_VALUE)).toHaveLength(1),
    );
    expect(mutationCallsFor(reactory, SAVE_VALUE)[0][1]).toEqual({
      organizationId: 'org-1',
      value: { user: 'user-1', key: 'shirtsize', value: 'X-Large', source: 'admin' },
    });

    await waitFor(() => expect(screen.queryByTestId('demographic-value-drawer')).toBeNull());
    expect(props.notify).toHaveBeenCalledWith('Value for shirtsize saved', 'success');
    expect(props.refresh).toHaveBeenCalled();
  });

  it('surfaces the server field-level errors and keeps the draft guarded', async () => {
    const { props } = setup({
      mutationImpl: (operation) => {
        if (operation !== SAVE_VALUE) return undefined;
        return {
          data: null,
          errors: [
            {
              message: 'Invalid value for demographic [shirtsize]',
              extensions: {
                fields: [{ path: 'value', message: 'Must be three characters or fewer' }],
              },
            },
          ],
        };
      },
    });
    await openValues();

    fireEvent.click(screen.getByTestId('demographic-value-edit-shirtsize-user-1'));
    const drawer = await screen.findByTestId('demographic-value-drawer');
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Shirt size' }), {
      target: { value: 'Way too long' },
    });
    fireEvent.click(within(drawer).getByTestId('demographic-value-drawer-save'));

    await waitFor(() =>
      expect(screen.getByTestId('demographic-value-drawer-errors')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('demographic-value-drawer-errors')).toHaveTextContent(
      'Must be three characters or fewer',
    );
    // A failed save leaves the drawer open and the guard raised — the request
    // being attempted is not the work being finished.
    expect(screen.getByTestId('demographic-value-drawer')).toBeInTheDocument();
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true);
  });

  it('raises and clears the unsaved-changes guard', async () => {
    const { props } = setup();
    await openValues();

    fireEvent.click(screen.getByTestId('demographic-value-edit-shirtsize-user-1'));
    const drawer = await screen.findByTestId('demographic-value-drawer');
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Shirt size' }), {
      target: { value: 'Medium' },
    });

    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true));

    fireEvent.click(within(drawer).getByTestId('demographic-value-drawer-cancel'));
    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false));
  });
});

describe('delete', () => {
  it('requires confirmation before sending OrganizationDeleteDemographicValue', async () => {
    const { reactory, props } = setup();
    await openValues();

    fireEvent.click(screen.getByTestId('demographic-value-delete-gender-user-1'));
    const dialog = await screen.findByTestId('demographic-value-delete-dialog');

    // Opening the confirmation is not a delete.
    expect(mutationCallsFor(reactory, DELETE_VALUE)).toHaveLength(0);

    fireEvent.click(within(dialog).getByTestId('demographic-value-delete-confirm'));

    await waitFor(() => expect(mutationCallsFor(reactory, DELETE_VALUE)).toHaveLength(1));
    expect(mutationCallsFor(reactory, DELETE_VALUE)[0][1]).toEqual({
      organizationId: 'org-1',
      key: 'gender',
      user: 'user-1',
    });
    expect(props.notify).toHaveBeenCalledWith('Value for gender deleted', 'success');
    expect(props.refresh).toHaveBeenCalled();
  });
});

describe('bulk save', () => {
  const changeTwoRows = async (drawer: HTMLElement) => {
    fireEvent.change(within(drawer).getByRole('textbox', { name: 'Shirt size' }), {
      target: { value: 'Medium' },
    });
    await selectOption(
      within(drawer).getByRole('combobox', { name: 'Gender' }),
      'Male',
      fireEvent,
      screen,
    );
  };

  it('submits only the changed rows and reports each outcome', async () => {
    const { reactory, props } = setup();
    await openValues();

    fireEvent.click(screen.getByTestId('demographic-values-bulk-open'));
    const drawer = await screen.findByTestId('demographic-bulk-drawer');
    await changeTwoRows(drawer);

    fireEvent.click(within(drawer).getByTestId('demographic-bulk-drawer-save'));

    await waitFor(() => expect(mutationCallsFor(reactory, BULK_SAVE)).toHaveLength(1));
    expect(mutationCallsFor(reactory, BULK_SAVE)[0][1]).toEqual({
      organizationId: 'org-1',
      values: [
        { user: 'user-1', key: 'gender', value: 'male', source: 'admin' },
        { user: 'user-1', key: 'shirtsize', value: 'Medium', source: 'admin' },
      ],
    });

    await waitFor(() =>
      expect(screen.getByTestId('demographic-bulk-results')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('demographic-bulk-outcome-0')).toHaveTextContent('Saved');
    expect(screen.getByTestId('demographic-bulk-outcome-1')).toHaveTextContent('Saved');
    expect(props.notify).toHaveBeenCalledWith('2 value(s) saved.', 'success');
    expect(props.refresh).toHaveBeenCalled();
  });

  it('never presents a partial batch as a success', async () => {
    const { props } = setup({
      mutationImpl: (operation, variables) => {
        if (operation !== BULK_SAVE) return undefined;
        // A partial response: only the first submitted row came back saved.
        const first = variables.values[0];
        return {
          data: {
            OrganizationBulkSaveDemographicValues: [{ ...first, id: 'saved-1' }],
          },
          errors: [],
        };
      },
    });
    await openValues();

    fireEvent.click(screen.getByTestId('demographic-values-bulk-open'));
    const drawer = await screen.findByTestId('demographic-bulk-drawer');
    await changeTwoRows(drawer);
    fireEvent.click(within(drawer).getByTestId('demographic-bulk-drawer-save'));

    await waitFor(() =>
      expect(screen.getByTestId('demographic-bulk-outcome-1')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('demographic-bulk-outcome-0')).toHaveTextContent('Saved');
    expect(screen.getByTestId('demographic-bulk-outcome-1')).toHaveTextContent('Not saved');
    expect(props.notify).toHaveBeenCalledWith('1 saved, 1 not saved.', 'error');
    // The drawer stays open with the unwritten row still guarded.
    expect(screen.getByTestId('demographic-bulk-drawer')).toBeInTheDocument();
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true);
  });
});

describe('CSV import', () => {
  it('previews per-row validation and submits only the valid rows', async () => {
    const { reactory } = setup();
    await openValues();

    fireEvent.click(screen.getByTestId('demographic-values-import-open'));
    const dialog = await screen.findByTestId('demographic-import-dialog');

    const csv = [
      'user,shirtsize,gender',
      'user-1,XL,female',
      'nobody@example.com,Medium,male',
      '',
    ].join('\n');
    const file = new File([csv], 'values.csv', { type: 'text/csv' });

    fireEvent.change(within(dialog).getByTestId('demographic-import-file'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(screen.getByTestId('demographic-import-preview')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('demographic-import-status-0')).toHaveTextContent('Ready');
    expect(screen.getByTestId('demographic-import-status-1')).toHaveTextContent('Not imported');
    expect(screen.getByTestId('demographic-import-status-1')).toHaveTextContent(
      'No member of this organization matches this user.',
    );
    expect(screen.getByTestId('demographic-import-summary')).toHaveTextContent(
      '1 row(s) ready, 1 row(s) will be skipped.',
    );

    fireEvent.click(screen.getByTestId('demographic-import-submit'));

    await waitFor(() => expect(mutationCallsFor(reactory, BULK_SAVE)).toHaveLength(1));
    // The invalid row is not in the payload.
    expect(mutationCallsFor(reactory, BULK_SAVE)[0][1].values).toEqual([
      { user: 'user-1', key: 'shirtsize', value: 'XL', source: 'import' },
      { user: 'user-1', key: 'gender', value: 'female', source: 'import' },
    ]);
  });

  it('keeps the import mapper guarded until the import completes', async () => {
    const { props } = setup();
    await openValues();

    fireEvent.click(screen.getByTestId('demographic-values-import-open'));
    const dialog = await screen.findByTestId('demographic-import-dialog');
    const file = new File(['user,shirtsize\nuser-1,XL\n'], 'values.csv', { type: 'text/csv' });

    fireEvent.change(within(dialog).getByTestId('demographic-import-file'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true));
    fireEvent.click(within(dialog).getByTestId('demographic-import-cancel'));
    await waitFor(() => expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false));
  });
});

describe('read-only viewer', () => {
  it('renders no write controls and issues no values or aggregates query', async () => {
    const { reactory } = setup({ canManage: false });
    await waitForConfiguration();

    fireEvent.click(screen.getByTestId('organization-demographics-pane-values'));
    await waitFor(() =>
      expect(
        screen.getByTestId('organization-demographics-values-readonly'),
      ).toBeInTheDocument(),
    );

    expect(queryCallsFor(reactory, VALUES_QUERY)).toHaveLength(0);
    expect(queryCallsFor(reactory, AGGREGATES_QUERY)).toHaveLength(0);
    expect(queryCallsFor(reactory, DEFINITIONS_QUERY)).toHaveLength(1);

    expect(screen.queryByTestId('demographic-values-table')).toBeNull();
    expect(screen.queryByTestId('demographic-values-import-open')).toBeNull();
    expect(screen.queryByTestId('demographic-values-export')).toBeNull();
    expect(screen.queryByTestId('demographic-values-bulk-open')).toBeNull();
  });
});
