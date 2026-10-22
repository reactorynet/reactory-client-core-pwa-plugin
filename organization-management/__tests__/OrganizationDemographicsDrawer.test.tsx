/**
 * @jest-environment jsdom
 *
 * Demographic definition drawer (ORG-031).
 *
 * The drawer is rendered directly rather than through the tab, so each named
 * deliverable can be driven in isolation:
 *   - enum option row editing (add/edit/remove, retired flag, duplicate + missing keys)
 *   - the `componentPropsMap` row editor (add/edit/remove, path safety, duplicates)
 *   - widget FQN resolution feedback (resolved / unresolved / registry unavailable)
 *   - every behaviour-flag switch, including its effect on the saved payload
 *   - the reference picker and the live `demographic-form` preview
 *
 * The assertions are deliberately on the *payload* the drawer hands to `onSave`
 * as well as on the rendered state: the defect this suite exists to catch is UI
 * that looks right and serialises wrong.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import DemographicDefinitionDrawer, {
  categoryLabel,
  valueTypeLabel,
} from '../components/DemographicDefinitionDrawer';
import { makeTranslator } from '../i18n';
import type { OrganizationTabProps } from '../types';
import { makeDemographicDefinition, makeOrganization, makeReactory } from './testFixtures';

afterEach(cleanup);

const t = makeTranslator({});
const organization = makeOrganization();

interface DrawerSetup {
  definition?: ReturnType<typeof makeDemographicDefinition> | null;
  ordinal?: number;
  saving?: boolean;
  /** A save failure the tab would pass down after a rejected request. */
  error?: OrganizationTabProps['notify'] extends never ? never : any;
  reactory?: any;
}

/**
 * Render the drawer. `reactory` defaults to the standard stub, which has no
 * `getComponent` — i.e. a host with no component registry.
 */
const openDrawer = (setup: DrawerSetup = {}) => {
  const reactory = setup.reactory || makeReactory({ organizations: [organization] });
  const onSave = jest.fn();
  const onClose = jest.fn();
  const onDirtyChange = jest.fn();

  const utils = render(
    <DemographicDefinitionDrawer
      reactory={reactory}
      t={t}
      organization={organization}
      definition={setup.definition === undefined ? null : setup.definition}
      ordinal={setup.ordinal ?? 4}
      saving={setup.saving === true}
      error={setup.error ?? null}
      onClose={onClose}
      onSave={onSave}
      onDirtyChange={onDirtyChange}
    />,
  );

  return { ...utils, reactory, onSave, onClose, onDirtyChange };
};

/** Choose an option from a MUI `select` TextField addressed by its label. */
const chooseOption = async (label: RegExp, optionName: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
};

/** The payload from the most recent `onSave` call. */
const lastSave = (onSave: jest.Mock) => onSave.mock.calls[onSave.mock.calls.length - 1][0];

/** Fill the two required identity fields. */
const fillIdentity = (key = 'shirtsize', title = 'Shirt size') => {
  fireEvent.change(screen.getByTestId('demographic-definition-field-key'), {
    target: { value: key },
  });
  fireEvent.change(screen.getByTestId('demographic-definition-field-title'), {
    target: { value: title },
  });
};

/** A reactory whose registry resolves exactly one FQN. */
const registryWith = (knownFqn: string) => ({
  ...makeReactory({ organizations: [organization] }),
  getComponent: jest.fn((fqn: string) => (fqn === knownFqn ? () => null : null)),
});

describe('identity fields', () => {
  it('renders the create title and the key hint', () => {
    openDrawer();

    expect(screen.getByText('New demographic definition')).toBeInTheDocument();
    expect(screen.getByText(/Lower case letters, digits and underscores/i)).toBeInTheDocument();
  });

  it('shows the edit title and reports the key as permanent', () => {
    openDrawer({ definition: makeDemographicDefinition({ title: 'Gender', key: 'gender' }) });

    expect(screen.getByText('Edit Gender')).toBeInTheDocument();
    expect(
      screen.getByText(/The key is permanent: stored values reference it/i),
    ).toBeInTheDocument();
  });

  it('edits description and icon and sends them on save', () => {
    const { onSave } = openDrawer();
    fillIdentity();

    fireEvent.change(screen.getByTestId('demographic-definition-field-description'), {
      target: { value: 'Used for uniform orders.' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-field-icon'), {
      target: { value: 'badge' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(lastSave(onSave).description).toBe('Used for uniform orders.');
    expect(lastSave(onSave).icon).toBe('badge');
  });

  it('sends null (not an empty string) for a cleared description and icon', () => {
    const { onSave } = openDrawer();
    fillIdentity();

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).description).toBeNull();
    expect(lastSave(onSave).icon).toBeNull();
  });

  it('surfaces the key and title errors only after the field is left', () => {
    openDrawer();

    expect(screen.queryByText('A key is required.')).toBeNull();

    fireEvent.blur(screen.getByTestId('demographic-definition-field-key'));
    expect(screen.getByText('A key is required.')).toBeInTheDocument();

    expect(screen.queryByText('A title is required.')).toBeNull();
    fireEvent.blur(screen.getByTestId('demographic-definition-field-title'));
    expect(screen.getByText('A title is required.')).toBeInTheDocument();
  });

  it('rejects an unusable key on blur', () => {
    openDrawer();

    const key = screen.getByTestId('demographic-definition-field-key');
    fireEvent.change(key, { target: { value: 'shirt size' } });
    fireEvent.blur(key);

    expect(
      screen.getByText(/Use lower case letters, digits and underscores, starting with a letter/i),
    ).toBeInTheDocument();
  });

  it('does not save an invalid draft, but does show every outstanding error', () => {
    const { onSave } = openDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('A key is required.')).toBeInTheDocument();
    expect(screen.getByText('A title is required.')).toBeInTheDocument();
  });

  it('closes through the header button', () => {
    const { onClose } = openDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables both actions and shows progress while saving', () => {
    openDrawer({ saving: true });

    expect(screen.getByTestId('demographic-definition-save')).toBeDisabled();
    expect(screen.getByTestId('demographic-definition-save')).toHaveTextContent('Saving…');
    expect(screen.getByTestId('demographic-definition-cancel')).toBeDisabled();
  });

  it('renders the save failure it is handed', () => {
    openDrawer({
      error: {
        key: 'reactory.organizations.demographics.saveFailed',
        serverMessage: 'A title is required',
      },
    });

    expect(screen.getByTestId('demographic-definition-save-error')).toHaveTextContent(
      'A title is required',
    );
  });
});

describe('category and ordinal', () => {
  it('changes the category through the picker', async () => {
    const { onSave } = openDrawer();
    fillIdentity();

    await chooseOption(/^Category$/, 'Employment');
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).category).toBe('employment');
  });

  it('rejects a fractional ordinal', () => {
    const { onSave } = openDrawer({ definition: makeDemographicDefinition({ system: false }) });

    const ordinal = screen.getByTestId('demographic-definition-field-ordinal');
    fireEvent.change(ordinal, { target: { value: '1.5' } });
    fireEvent.blur(ordinal);

    expect(
      screen.getByText('The ordinal must be a whole number of zero or more.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('demographic-definition-save'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('sends a valid ordinal as a number', () => {
    const { onSave } = openDrawer({
      definition: makeDemographicDefinition({ system: false, ordinal: 0 }),
    });

    fireEvent.change(screen.getByTestId('demographic-definition-field-ordinal'), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).ordinal).toBe(7);
  });

  it('labels every category and value type, and shows an unknown one verbatim', () => {
    expect(categoryLabel(t, 'personal')).toBe('Personal');
    expect(categoryLabel(t, 'employment')).toBe('Employment');
    expect(categoryLabel(t, 'organizational')).toBe('Organizational');
    expect(categoryLabel(t, 'compliance')).toBe('Compliance');
    expect(categoryLabel(t, 'bespoke')).toBe('bespoke');
    expect(categoryLabel(t, null)).toBe('');

    expect(valueTypeLabel(t, 'string')).toBe('Text');
    expect(valueTypeLabel(t, 'number')).toBe('Number');
    expect(valueTypeLabel(t, 'boolean')).toBe('Yes / no');
    expect(valueTypeLabel(t, 'date')).toBe('Date');
    expect(valueTypeLabel(t, 'enum')).toBe('Single choice');
    expect(valueTypeLabel(t, 'multi-enum')).toBe('Multiple choice');
    expect(valueTypeLabel(t, 'object')).toBe('Structured object');
    expect(valueTypeLabel(t, 'array')).toBe('List');
    expect(valueTypeLabel(t, 'reference')).toBe('Reference');
    expect(valueTypeLabel(t, 'geometry')).toBe('geometry');
  });
});

describe('enum options editor', () => {
  const openEnumDrawer = async () => {
    const setup = openDrawer();
    fillIdentity();
    await chooseOption(/Value type/, 'Multiple choice');
    return setup;
  };

  it('appears only for the two choice value types', async () => {
    openDrawer();
    expect(screen.queryByTestId('demographic-definition-options')).toBeNull();

    // `date` is deliberately not exercised here: its preview control is a MUI
    // DatePicker, which needs the host's LocalizationProvider and is ORG-032's
    // widget to cover (its own suite stubs it for the same reason).
    await chooseOption(/Value type/, 'Number');
    expect(screen.queryByTestId('demographic-definition-options')).toBeNull();

    await chooseOption(/Value type/, 'Single choice');
    expect(screen.getByTestId('demographic-definition-options')).toBeInTheDocument();

    await chooseOption(/Value type/, 'Text');
    expect(screen.queryByTestId('demographic-definition-options')).toBeNull();
  });

  it('adds rows, edits key, label, ordinal and the retired flag, then saves them', async () => {
    const { onSave } = await openEnumDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));

    fireEvent.change(screen.getByTestId('demographic-definition-option-0-key'), {
      target: { value: 'Small' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-option-0-label'), {
      target: { value: 'Small' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-option-0-ordinal'), {
      target: { value: '2' },
    });

    fireEvent.change(screen.getByTestId('demographic-definition-option-1-key'), {
      target: { value: 'medium' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-option-1-label'), {
      target: { value: 'Medium' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-option-1-deprecated'));

    expect(screen.getByTestId('demographic-definition-option-1-deprecated')).toBeChecked();

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(lastSave(onSave).options).toEqual([
      // The key is normalised to what the server stores.
      { key: 'small', label: 'Small', ordinal: 2, deprecated: false },
      { key: 'medium', label: 'Medium', ordinal: 1, deprecated: true },
    ]);
  });

  it('removes a row and keeps the remaining rows addressed by position', async () => {
    const { onSave } = await openEnumDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.change(screen.getByTestId('demographic-definition-option-0-key'), {
      target: { value: 'small' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-option-1-key'), {
      target: { value: 'medium' },
    });

    // Remove the *first* row: the second must slide into index 0.
    fireEvent.click(screen.getByTestId('demographic-definition-option-0-remove'));

    expect(screen.queryByTestId('demographic-definition-option-1')).toBeNull();
    expect(screen.getByTestId('demographic-definition-option-0-key')).toHaveValue('medium');

    fireEvent.click(screen.getByTestId('demographic-definition-save'));
    // Ordinals are left as the author set them (0 then 1); removing row 0 does
    // not rewrite the survivor, so it keeps ordinal 1.
    expect(lastSave(onSave).options).toEqual([
      { key: 'medium', label: null, ordinal: 1, deprecated: false },
    ]);
  });

  it('gives a row added after a removal an ordinal that cannot collide', async () => {
    await openEnumDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.click(screen.getByTestId('demographic-definition-option-0-remove'));

    // `length` would be 1 here and collide with the survivor's ordinal 1.
    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.change(screen.getByTestId('demographic-definition-option-1-key'), {
      target: { value: 'large' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-option-1-ordinal'), {
      target: { value: '2' },
    });

    expect(screen.getByTestId('demographic-definition-option-1-ordinal')).toHaveValue(2);
  });

  it('requires at least one option', async () => {
    const { onSave } = await openEnumDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(
      screen.getByText('A single or multiple choice definition needs at least one option.'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects duplicate option keys case-insensitively', async () => {
    const { onSave } = await openEnumDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.change(screen.getByTestId('demographic-definition-option-0-key'), {
      target: { value: 'small' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-option-1-key'), {
      target: { value: 'SMALL' },
    });

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(screen.getByTestId('demographic-definition-options-error')).toHaveTextContent(
      'Option keys must be unique.',
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects a labelled option that has no key', async () => {
    const { onSave } = await openEnumDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.change(screen.getByTestId('demographic-definition-option-0-key'), {
      target: { value: 'small' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-option-1-label'), {
      target: { value: 'Medium' },
    });

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(screen.getByTestId('demographic-definition-options-error')).toHaveTextContent(
      'Every option with a label needs a key.',
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears the option list when the type stops being a choice', async () => {
    const { onSave } = await openEnumDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.change(screen.getByTestId('demographic-definition-option-0-key'), {
      target: { value: 'small' },
    });

    await chooseOption(/Value type/, 'Text');
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).options).toEqual([]);
  });
});

describe('reference picker', () => {
  it('defaults to BusinessUnit and sends the chosen model plus the multiple flag', async () => {
    const { onSave } = openDrawer();
    fillIdentity('team', 'Team');

    await chooseOption(/Value type/, 'Reference');

    expect(screen.getByTestId('demographic-definition-reference')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Reference model/i })).toHaveTextContent(
      'BusinessUnit',
    );

    await chooseOption(/Reference model/, 'Team');
    fireEvent.click(screen.getByTestId('demographic-definition-field-reference-multiple'));

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).reference).toEqual({ model: 'Team', multiple: true });
  });

  it('sends null for the reference when the type is not a reference', async () => {
    const { onSave } = openDrawer({
      definition: makeDemographicDefinition({
        system: false,
        valueType: 'reference',
        reference: { model: 'Team', multiple: false },
      }),
    });

    await chooseOption(/Value type/, 'Text');
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).reference).toBeNull();
  });
});

describe('widget binding', () => {
  it('reports a resolved FQN through the component registry', () => {
    const reactory = registryWith('reactory.KnownWidget@1.0.0');
    openDrawer({ reactory });

    fireEvent.change(screen.getByTestId('demographic-definition-field-widget-fqn'), {
      target: { value: 'reactory.KnownWidget@1.0.0' },
    });

    expect(screen.getByTestId('demographic-definition-widget-status')).toHaveTextContent(
      'Resolved: reactory.KnownWidget@1.0.0',
    );
    expect(reactory.getComponent).toHaveBeenCalledWith('reactory.KnownWidget@1.0.0');
  });

  it('warns that an unregistered FQN will fall back to the built-in control', () => {
    openDrawer({ reactory: registryWith('reactory.KnownWidget@1.0.0') });

    fireEvent.change(screen.getByTestId('demographic-definition-field-widget-fqn'), {
      target: { value: 'reactory.MissingWidget@1.0.0' },
    });

    expect(screen.getByTestId('demographic-definition-widget-status')).toHaveTextContent(
      'No component is registered as reactory.MissingWidget@1.0.0. The form falls back to the built-in control.',
    );
  });

  it('says so when the host has no component registry at all', () => {
    openDrawer();

    fireEvent.change(screen.getByTestId('demographic-definition-field-widget-fqn'), {
      target: { value: 'reactory.KnownWidget@1.0.0' },
    });

    expect(screen.getByTestId('demographic-definition-widget-status')).toHaveTextContent(
      'The component registry is not available in this host, so the binding cannot be checked.',
    );
  });

  it('shows no status for an empty FQN', () => {
    openDrawer();
    expect(screen.queryByTestId('demographic-definition-widget-status')).toBeNull();
  });

  it('survives a registry that throws', () => {
    openDrawer({
      reactory: {
        ...makeReactory({ organizations: [organization] }),
        getComponent: jest.fn(() => {
          throw new Error('registry exploded');
        }),
      },
    });

    fireEvent.change(screen.getByTestId('demographic-definition-field-widget-fqn'), {
      target: { value: 'reactory.KnownWidget@1.0.0' },
    });

    // Treated as "not resolvable", never as a crash.
    expect(screen.getByTestId('demographic-definition-widget-status')).toHaveTextContent(
      /No component is registered as reactory.KnownWidget@1.0.0/i,
    );
  });

  it('sends the FQN, the component props and the props map', () => {
    const { onSave } = openDrawer({ reactory: registryWith('reactory.KnownWidget@1.0.0') });

    fillIdentity('region', 'Region');
    fireEvent.change(screen.getByTestId('demographic-definition-field-widget-fqn'), {
      target: { value: 'reactory.KnownWidget@1.0.0' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-field-widget-props'), {
      target: { value: '{"dense":true}' },
    });

    fireEvent.click(screen.getByTestId('demographic-definition-propsmap-add'));
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-0-source'), {
      target: { value: 'definition.options' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-0-prop'), {
      target: { value: 'options' },
    });

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).widget).toEqual({
      componentFqn: 'reactory.KnownWidget@1.0.0',
      componentProps: { dense: true },
      componentPropsMap: { 'definition.options': 'options' },
    });
  });

  it('sends a null widget when the FQN is cleared', () => {
    const { onSave } = openDrawer({
      definition: makeDemographicDefinition({
        system: false,
        widget: { componentFqn: 'reactory.KnownWidget@1.0.0', componentProps: { dense: true } },
      }),
    });

    fireEvent.change(screen.getByTestId('demographic-definition-field-widget-fqn'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).widget).toBeNull();
  });

  it('rejects component props that are not a JSON object', () => {
    const { onSave } = openDrawer();

    const props = screen.getByTestId('demographic-definition-field-widget-props');
    fireEvent.change(props, { target: { value: '[1,2]' } });
    fireEvent.blur(props);

    expect(screen.getByText('The component props must be a JSON object.')).toBeInTheDocument();

    fireEvent.change(props, { target: { value: '{' } });
    fireEvent.blur(props);
    expect(screen.getByText('The component props are not valid JSON.')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('demographic-definition-save'));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('componentPropsMap editor', () => {
  it('pre-loads the stored mappings in their authored order', () => {
    openDrawer({
      definition: makeDemographicDefinition({
        system: false,
        widget: {
          componentFqn: 'reactory.KnownWidget@1.0.0',
          componentPropsMap: {
            'definition.options': 'options',
            'organization.id': 'organizationId',
          },
        },
      }),
    });

    expect(screen.getByTestId('demographic-definition-propsmap-0-source')).toHaveValue(
      'definition.options',
    );
    expect(screen.getByTestId('demographic-definition-propsmap-0-prop')).toHaveValue('options');
    expect(screen.getByTestId('demographic-definition-propsmap-1-source')).toHaveValue(
      'organization.id',
    );
    expect(screen.getByTestId('demographic-definition-propsmap-1-prop')).toHaveValue(
      'organizationId',
    );
  });

  it('adds, edits and removes rows without disturbing the rest', () => {
    openDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-propsmap-add'));
    fireEvent.click(screen.getByTestId('demographic-definition-propsmap-add'));

    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-0-source'), {
      target: { value: 'definition.options' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-0-prop'), {
      target: { value: 'options' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-1-source'), {
      target: { value: 'organization.id' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-1-prop'), {
      target: { value: 'organizationId' },
    });

    fireEvent.click(screen.getByTestId('demographic-definition-propsmap-0-remove'));

    expect(screen.queryByTestId('demographic-definition-propsmap-1')).toBeNull();
    expect(screen.getByTestId('demographic-definition-propsmap-0-source')).toHaveValue(
      'organization.id',
    );
  });

  it('reports a rejected path, a missing prop and a duplicate source', () => {
    openDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-propsmap-add'));
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-0-source'), {
      target: { value: '__proto__.polluted' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-0-prop'), {
      target: { value: 'options' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(screen.getByTestId('demographic-definition-propsmap-error')).toHaveTextContent(
      'Every context path must be a dotted path without empty segments.',
    );

    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-0-source'), {
      target: { value: 'definition.options' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-0-prop'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(screen.getByTestId('demographic-definition-propsmap-error')).toHaveTextContent(
      'Every mapping needs a prop name.',
    );

    fireEvent.click(screen.getByTestId('demographic-definition-propsmap-add'));
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-0-prop'), {
      target: { value: 'options' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-1-source'), {
      target: { value: 'definition.options' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-propsmap-1-prop'), {
      target: { value: 'choices' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(screen.getByTestId('demographic-definition-propsmap-error')).toHaveTextContent(
      'A context path can only be mapped once.',
    );
  });

  it('drops a wholly blank row from the payload', () => {
    const { onSave } = openDrawer({
      definition: makeDemographicDefinition({
        system: false,
        widget: { componentFqn: 'reactory.KnownWidget@1.0.0' },
      }),
      reactory: registryWith('reactory.KnownWidget@1.0.0'),
    });

    fireEvent.click(screen.getByTestId('demographic-definition-propsmap-add'));
    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).widget.componentPropsMap).toEqual({});
  });

  it('reports unsaved input for a props-map edit, and clean again once reverted', () => {
    const { onDirtyChange } = openDrawer();

    fireEvent.click(screen.getByTestId('demographic-definition-propsmap-add'));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByTestId('demographic-definition-propsmap-0-remove'));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

describe('behaviour flags', () => {
  it('toggles every flag and sends each one', () => {
    const { onSave, onDirtyChange } = openDrawer();
    fillIdentity();

    // A new draft is optional, single-valued, non-sensitive, unsearchable and enabled.
    expect(screen.getByTestId('demographic-definition-flag-required')).not.toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-multiValued')).not.toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-sensitive')).not.toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-searchable')).not.toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-enabled')).toBeChecked();

    fireEvent.click(screen.getByTestId('demographic-definition-flag-required'));
    fireEvent.click(screen.getByTestId('demographic-definition-flag-multiValued'));
    fireEvent.click(screen.getByTestId('demographic-definition-flag-sensitive'));
    fireEvent.click(screen.getByTestId('demographic-definition-flag-searchable'));
    fireEvent.click(screen.getByTestId('demographic-definition-flag-enabled'));

    expect(screen.getByTestId('demographic-definition-flag-required')).toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-multiValued')).toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-sensitive')).toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-searchable')).toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-enabled')).not.toBeChecked();

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    const payload = lastSave(onSave);
    expect(payload.required).toBe(true);
    expect(payload.multiValued).toBe(true);
    expect(payload.sensitive).toBe(true);
    expect(payload.searchable).toBe(true);
    expect(payload.enabled).toBe(false);
  });

  it('renders each flag hint, so the guard rails are explained in place', () => {
    openDrawer();

    expect(
      screen.getByText('Members must supply a value before their demographics can be saved.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Stores a list of the declared value type.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Personal information: hidden from non-administrators and gated in reporting.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Indexed for reporting and member search.')).toBeInTheDocument();
    expect(
      screen.getByText('Disabled definitions keep their stored values but are not captured.'),
    ).toBeInTheDocument();
  });

  it('pre-loads the stored flags', () => {
    openDrawer({
      definition: makeDemographicDefinition({
        required: true,
        multiValued: true,
        sensitive: true,
        searchable: false,
        enabled: false,
        system: false,
      }),
    });

    expect(screen.getByTestId('demographic-definition-flag-required')).toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-multiValued')).toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-sensitive')).toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-searchable')).not.toBeChecked();
    expect(screen.getByTestId('demographic-definition-flag-enabled')).not.toBeChecked();
  });
});

describe('schema editor', () => {
  it('accepts a structured schema and sends it parsed', () => {
    const { onSave } = openDrawer();
    fillIdentity('address', 'Address');

    fireEvent.change(screen.getByTestId('demographic-definition-field-schema'), {
      target: {
        value: JSON.stringify({
          type: 'object',
          properties: { line1: { type: 'string' } },
          required: ['line1'],
        }),
      },
    });

    fireEvent.click(screen.getByTestId('demographic-definition-save'));

    expect(lastSave(onSave).schema).toEqual({
      type: 'object',
      properties: { line1: { type: 'string' } },
      required: ['line1'],
    });
  });

  it('replaces the hint with the problem only once the field is left', () => {
    openDrawer();

    const schema = screen.getByTestId('demographic-definition-field-schema');
    expect(
      screen.getByText(/Optional JSON Schema fragment validated on every write/i),
    ).toBeInTheDocument();

    fireEvent.change(schema, { target: { value: '{ "type": "widget" }' } });
    fireEvent.blur(schema);

    expect(
      screen.getByText(
        'schema.type must be one of object, array, string, number, integer, boolean or null.',
      ),
    ).toBeInTheDocument();
  });
});

describe('live preview', () => {
  it('renders the draft definition and accepts input', () => {
    openDrawer();
    fillIdentity();

    const preview = screen.getByTestId('demographic-definition-preview');
    const input = within(preview).getByLabelText('Shirt size');

    fireEvent.change(input, { target: { value: 'Large' } });

    expect(within(preview).getByLabelText('Shirt size')).toHaveValue('Large');
  });

  it('previews an enum definition with its option list', async () => {
    openDrawer();
    fillIdentity();

    await chooseOption(/Value type/, 'Single choice');
    fireEvent.click(screen.getByTestId('demographic-definition-option-add'));
    fireEvent.change(screen.getByTestId('demographic-definition-option-0-key'), {
      target: { value: 'large' },
    });
    fireEvent.change(screen.getByTestId('demographic-definition-option-0-label'), {
      target: { value: 'Large' },
    });

    const preview = screen.getByTestId('demographic-definition-preview');
    expect(within(preview).getByLabelText('Shirt size')).toBeInTheDocument();

    fireEvent.mouseDown(within(preview).getByRole('combobox'));
    expect(await screen.findAllByRole('option', { name: 'Large' })).not.toHaveLength(0);
  });

  it('keeps previewing a definition that is being disabled', () => {
    openDrawer();

    fireEvent.change(screen.getByTestId('demographic-definition-field-title'), {
      target: { value: 'Shirt size' },
    });
    fireEvent.click(screen.getByTestId('demographic-definition-flag-enabled'));

    // The renderer drops disabled definitions, so the preview forces enabled.
    expect(
      within(screen.getByTestId('demographic-definition-preview')).getByLabelText('Shirt size'),
    ).toBeInTheDocument();
  });
});
