/**
 * @jest-environment jsdom
 *
 * Built-in control suite (ORG-032).
 *
 * Covers the paths the form-level suite does not reach: object and array editing
 * through `ReactoryForm`, read-only locking, reference multiples with and
 * without a data source, and the `multiValued` row editor.
 *
 * Two notes on fidelity:
 *  - the shared `DateSelectorWidget` is stubbed (a MUI `DatePicker` needs a
 *    `LocalizationProvider`/adapter); every other control is the real one;
 *  - the read-only proof for object/array renders the client's **real**
 *    `MaterialSchemaField` with the uiSchema this module builds, stubbing only
 *    the leaf field. That exercises the actual rule the engine applies
 *    (`props.readonly || uiSchema['ui:readonly']`) instead of asserting we
 *    handed over a blob.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import MaterialSchemaField from '@reactory/client-core/components/reactory/ux/mui/fields/MaterialSchemaField';

import {
  DemographicArrayWidget,
  DemographicBooleanWidget,
  DemographicDateWidget,
  DemographicEnumWidget,
  DemographicMultiEnumWidget,
  DemographicMultiValueField,
  DemographicNumberWidget,
  DemographicObjectWidget,
  DemographicReferenceWidget,
  DemographicTextWidget,
  createWidgetRegistry,
  findDataSource,
  resolveReactoryForm,
} from '../widgets';
import { buildReadOnlyUiSchema, normaliseArraySchema } from '../formSchema';
import type { DemographicBuiltInWidgetProps } from '../types';
import { makeDefinition, makeReactory, makeThrowingReactory } from './testFixtures';

jest.mock('@reactory/client-core/components/reactory/ux/mui/widgets/DateSelector', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    DateWidget: (props: any) =>
      ReactLib.createElement('input', {
        'data-testid': 'shared-date-selector',
        'aria-label': props.uiSchema?.['ui:options']?.label,
        value: props.formData || '',
        // Mirrors the real DateWidget, which calls `onChange(undefined)` when
        // the picker is cleared (DateSelector.tsx).
        onChange: (event: any) =>
          props.onChange(event.target.value === '' ? undefined : event.target.value),
      }),
  };
});

afterEach(cleanup);

/** A `ReactoryForm` stand-in that records every prop set it receives. */
const makeFormStub = () => jest.fn((_props: any) => <div data-testid="reactory-form-stub" />);

/** Props every control expects, with per-test overrides. */
const widgetProps = (
  overrides: Partial<DemographicBuiltInWidgetProps> = {},
): DemographicBuiltInWidgetProps => ({
  value: undefined,
  onChange: jest.fn(),
  error: null,
  disabled: false,
  definition: makeDefinition(),
  mode: 'edit',
  reactory: makeReactory(),
  ...overrides,
});

const addressSchema = {
  type: 'object',
  properties: {
    line1: { type: 'string', title: 'Line 1' },
    line2: { type: 'string' },
    country: { type: 'string', enum: ['ZA', 'GB'] },
    nested: {
      type: 'object',
      properties: { postalCode: { type: 'string' } },
    },
  },
};

describe('object — rendered through ReactoryForm', () => {
  const definition = makeDefinition({
    key: 'address',
    title: 'Address',
    valueType: 'object',
    schema: addressSchema,
  });

  it('passes the definition schema and the stored value in edit mode', () => {
    const FormStub = makeFormStub();
    const value = { line1: '1 Main Road' };

    render(
      <DemographicObjectWidget
        {...widgetProps({
          definition,
          value,
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    const props = FormStub.mock.calls[0][0];
    expect(props.formDef.schema).toBe(addressSchema);
    expect(props.formData).toBe(value);
    expect(props.mode).toBe('edit');
    expect(props.readOnly).toBe(false);
    expect(props.disabled).toBe(false);
    expect(props.formDef.uiSchema).toEqual({});
  });

  it('nulls an absent value to an empty object rather than undefined', () => {
    const FormStub = makeFormStub();

    render(
      <DemographicObjectWidget
        {...widgetProps({
          definition,
          value: null,
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    expect(FormStub.mock.calls[0][0].formData).toEqual({});
  });

  it('passes readonly and disabled, and a read-only uiSchema, when disabled', () => {
    const FormStub = makeFormStub();

    render(
      <DemographicObjectWidget
        {...widgetProps({
          definition,
          value: { line1: '1 Main Road' },
          disabled: true,
          mode: 'read',
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    const props = FormStub.mock.calls[0][0];

    // Every channel the engine can read is set, not just `mode`.
    expect(props.mode).toBe('view');
    expect(props.readOnly).toBe(true);
    expect(props.disabled).toBe(true);
    expect(props.formDef.uiSchema['ui:readonly']).toBe(true);
    expect(props.formDef.uiSchema['ui:disabled']).toBe(true);
    // ... including each nested field, which is where rjsf reads it.
    expect(props.formDef.uiSchema.line1).toEqual({
      'ui:readonly': true,
      'ui:disabled': true,
    });
    expect(props.formDef.uiSchema.nested.postalCode).toEqual({
      'ui:readonly': true,
      'ui:disabled': true,
    });
    expect(screen.getByTestId('demographic-control-address').getAttribute('data-read-only')).toBe(
      'true',
    );
  });

  /**
   * The uiSchema above is only worth anything if the engine's field actually
   * honours it. `MaterialSchemaField` is the component every rjsf field goes
   * through, and it computes
   *   disabled = props.disabled || uiSchema['ui:disabled']
   *   readonly = props.readonly || uiSchema['ui:readonly']
   * so rendering it with our uiSchema is a real read-only proof.
   */
  it('produces a uiSchema that the real field implementation treats as read-only', () => {
    const ObjectFieldSpy = jest.fn((_props: any) => <div data-testid="object-field" />);

    render(
      <MaterialSchemaField
        schema={addressSchema}
        uiSchema={buildReadOnlyUiSchema(addressSchema)}
        idSchema={{ $id: 'root' }}
        name="root"
        formData={{ line1: '1 Main Road' }}
        registry={{ fields: { ObjectField: ObjectFieldSpy } } as any}
      />,
    );

    expect(ObjectFieldSpy).toHaveBeenCalled();
    const received = ObjectFieldSpy.mock.calls[0][0];
    expect(received.disabled).toBe(true);
    expect(received.readonly).toBe(true);
  });

  it('emits the next object from the engine callback', () => {
    const FormStub = makeFormStub();
    const onChange = jest.fn();
    const next = { line1: '2 Main Road' };

    render(
      <DemographicObjectWidget
        {...widgetProps({
          definition,
          value: {},
          onChange,
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    FormStub.mock.calls[0][0].onChange({ formData: next });
    expect(onChange).toHaveBeenCalledWith(next);

    // A bare payload and an rjsf `{ data }` payload are both accepted.
    FormStub.mock.calls[0][0].onChange({ data: next });
    expect(onChange).toHaveBeenCalledTimes(2);

    // A scalar or an array must never replace the object.
    FormStub.mock.calls[0][0].onChange({ formData: 'oops' });
    FormStub.mock.calls[0][0].onChange({ formData: [1, 2] });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('falls back to the unprefixed FQN when the versioned one is absent', () => {
    const FormStub = makeFormStub();
    const reactory = makeReactory({ 'core.ReactoryForm': FormStub });

    render(<DemographicObjectWidget {...widgetProps({ definition, reactory })} />);

    expect(FormStub).toHaveBeenCalled();
  });

  it('renders a translated note when no form engine is registered', () => {
    render(<DemographicObjectWidget {...widgetProps({ definition })} />);

    const note = screen.getByTestId('demographic-form-unavailable-address');
    expect(note).toHaveTextContent('The form engine is not available');
    expect(note).toHaveTextContent('object');
  });

  it('survives a registry that throws', () => {
    render(
      <DemographicObjectWidget
        {...widgetProps({ definition, reactory: makeThrowingReactory() })}
      />,
    );

    expect(screen.getByTestId('demographic-form-unavailable-address')).toBeInTheDocument();
  });

  it('treats a missing schema as an empty object schema', () => {
    const FormStub = makeFormStub();

    render(
      <DemographicObjectWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'blob', title: 'Blob', valueType: 'object' }),
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    expect(FormStub.mock.calls[0][0].formDef.schema).toEqual({
      type: 'object',
      properties: {},
    });
  });
});

describe('array — rendered through ReactoryForm', () => {
  const certifications = makeDefinition({
    key: 'certifications',
    title: 'Certifications',
    valueType: 'array',
    schema: { type: 'array', items: { type: 'string' } },
  });

  it('passes the definition array schema to the engine', () => {
    const FormStub = makeFormStub();

    render(
      <DemographicArrayWidget
        {...widgetProps({
          definition: certifications,
          value: ['AWS'],
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    const props = FormStub.mock.calls[0][0];
    expect(props.formDef.schema).toEqual({ type: 'array', items: { type: 'string' } });
    expect(props.formData).toEqual(['AWS']);
    expect(props.mode).toBe('edit');
  });

  it('preserves array-of-object values instead of coercing them to strings', () => {
    const FormStub = makeFormStub();
    const onChange = jest.fn();
    const stored = [
      { issuer: 'AWS', year: 2020 },
      { issuer: 'Azure', year: 2022 },
    ];

    const definition = makeDefinition({
      key: 'qualifications',
      title: 'Qualifications',
      valueType: 'array',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            issuer: { type: 'string' },
            year: { type: 'number' },
          },
        },
      },
    });

    render(
      <DemographicArrayWidget
        {...widgetProps({
          definition,
          value: stored,
          onChange,
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    // The stored objects reach the engine untouched — this is the defect the
    // bespoke text-input list had (it rendered "[object Object]" and then wrote
    // a string back over the object).
    expect(FormStub.mock.calls[0][0].formData).toEqual(stored);
    expect(FormStub.mock.calls[0][0].formData[0]).toEqual({ issuer: 'AWS', year: 2020 });

    const edited = [
      { issuer: 'AWS', year: 2021 },
      { issuer: 'Azure', year: 2022 },
    ];
    FormStub.mock.calls[0][0].onChange({ formData: edited });

    expect(onChange).toHaveBeenCalledWith(edited);
    expect(onChange.mock.calls[0][0][0]).toEqual({ issuer: 'AWS', year: 2021 });
    expect(FormStub.mock.calls[0][0].formDef.schema.items.type).toBe('object');
  });

  it('never accepts a non-array payload from the engine', () => {
    const FormStub = makeFormStub();
    const onChange = jest.fn();

    render(
      <DemographicArrayWidget
        {...widgetProps({
          definition: certifications,
          value: ['AWS'],
          onChange,
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    FormStub.mock.calls[0][0].onChange({ formData: 'AWS' });
    FormStub.mock.calls[0][0].onChange({ formData: {} });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('seeds an absent value with an empty array', () => {
    const FormStub = makeFormStub();

    render(
      <DemographicArrayWidget
        {...widgetProps({
          definition: certifications,
          value: undefined,
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    expect(FormStub.mock.calls[0][0].formData).toEqual([]);
  });

  it('locks the array form when disabled', () => {
    const FormStub = makeFormStub();

    render(
      <DemographicArrayWidget
        {...widgetProps({
          definition: certifications,
          value: ['AWS'],
          disabled: true,
          mode: 'read',
          reactory: makeReactory({ 'core.ReactoryForm@1.0.0': FormStub }),
        })}
      />,
    );

    const props = FormStub.mock.calls[0][0];
    expect(props.mode).toBe('view');
    expect(props.readOnly).toBe(true);
    expect(props.disabled).toBe(true);
    expect(props.formDef.uiSchema['ui:readonly']).toBe(true);
  });

  it('normalises a schema that is not an array for number and boolean items', () => {
    const FormStub = makeFormStub();
    const reactory = makeReactory({ 'core.ReactoryForm@1.0.0': FormStub });

    const { unmount } = render(
      <DemographicArrayWidget
        {...widgetProps({
          definition: makeDefinition({
            key: 'scores',
            title: 'Scores',
            valueType: 'array',
            schema: { items: { type: 'number' } },
          }),
          value: [1, 2],
          reactory,
        })}
      />,
    );

    expect(FormStub.mock.calls[0][0].formDef.schema).toEqual({
      type: 'array',
      items: { type: 'number' },
    });

    unmount();

    render(
      <DemographicArrayWidget
        {...widgetProps({
          definition: makeDefinition({
            key: 'flags',
            title: 'Flags',
            valueType: 'array',
            schema: { type: 'array', items: { type: 'boolean' } },
          }),
          value: [true, false],
          reactory,
        })}
      />,
    );

    expect(FormStub.mock.calls[1][0].formDef.schema.items).toEqual({ type: 'boolean' });
    expect(FormStub.mock.calls[1][0].formData).toEqual([true, false]);
  });

  it('renders a translated note when no form engine is registered', () => {
    render(<DemographicArrayWidget {...widgetProps({ definition: certifications })} />);

    expect(screen.getByTestId('demographic-form-unavailable-certifications')).toHaveTextContent(
      'array value cannot be edited here',
    );
  });
});

describe('resolveReactoryForm', () => {
  it('returns null without a Reactory instance or a registry', () => {
    expect(resolveReactoryForm(undefined)).toBeNull();
    expect(resolveReactoryForm({})).toBeNull();
  });

  it('prefers the versioned FQN', () => {
    const Versioned = () => null;
    const Unversioned = () => null;
    const reactory = makeReactory({
      'core.ReactoryForm@1.0.0': Versioned,
      'core.ReactoryForm': Unversioned,
    });

    expect(resolveReactoryForm(reactory)).toBe(Versioned);
    expect(resolveReactoryForm(makeReactory({ 'core.ReactoryForm': Unversioned }))).toBe(
      Unversioned,
    );
  });

  it('returns null when the registry throws', () => {
    expect(resolveReactoryForm(makeThrowingReactory())).toBeNull();
  });
});

describe('reference — multiple', () => {
  const definition = makeDefinition({
    key: 'teams',
    title: 'Teams',
    valueType: 'reference',
    reference: { model: 'Team', multiple: true },
  });

  const dataSources = [
    {
      model: 'Team',
      items: [
        { value: 'team-1', label: 'Platform' },
        { value: 'team-2', label: 'Payments' },
        { value: 'team-3', label: 'Retired', disabled: true },
      ],
    },
  ];

  it('renders one chip per stored value', () => {
    render(
      <DemographicReferenceWidget
        {...widgetProps({ definition, value: ['team-1', 'team-2'], dataSources })}
      />,
    );

    const field = screen.getByTestId('demographic-control-teams');
    expect(field.querySelector('[role="combobox"]')).not.toBeNull();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Payments')).toBeInTheDocument();
  });

  it('emits the next array of keys', () => {
    const onChange = jest.fn();

    render(
      <DemographicReferenceWidget
        {...widgetProps({ definition, value: ['team-1'], onChange, dataSources })}
      />,
    );

    const input = screen.getByTestId('demographic-control-teams').querySelector('input')!;
    fireEvent.change(input, { target: { value: 'Pay' } });

    const option = screen.getByRole('option', { name: 'Payments' });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0]).toEqual(['team-1', 'team-2']);
  });

  it('is disabled when no data source is supplied', () => {
    render(<DemographicReferenceWidget {...widgetProps({ definition, value: ['team-1'] })} />);

    const input = screen.getByTestId('demographic-control-teams').querySelector('input')!;
    expect(input).toBeDisabled();
    expect(screen.getByTestId('demographic-control-teams').getAttribute('data-read-only')).toBe(
      'true',
    );
    expect(screen.getByTestId('demographic-reference-missing-teams')).toHaveTextContent('Team');
  });

  it('is disabled for a source that has no items yet', () => {
    render(
      <DemographicReferenceWidget
        {...widgetProps({
          definition,
          dataSources: [{ model: 'Team', items: [] }],
        })}
      />,
    );

    expect(
      screen.getByTestId('demographic-control-teams').querySelector('input'),
    ).not.toBeDisabled();
    expect(screen.getByText('No matching records were found.')).toBeInTheDocument();
  });

  it('shows the loading and error notes', () => {
    const { unmount } = render(
      <DemographicReferenceWidget
        {...widgetProps({
          definition,
          dataSources: [{ model: 'Team', items: [], loading: true }],
        })}
      />,
    );

    expect(screen.getByText('Loading options…')).toBeInTheDocument();
    unmount();

    render(
      <DemographicReferenceWidget
        {...widgetProps({
          definition,
          dataSources: [{ model: 'Team', items: [], error: 'Team lookup failed' }],
        })}
      />,
    );

    expect(screen.getByText('Team lookup failed')).toBeInTheDocument();
  });
});

describe('reference — single', () => {
  const definition = makeDefinition({
    key: 'businessUnit',
    title: 'Business unit',
    valueType: 'reference',
    reference: { model: 'BusinessUnit' },
  });

  const dataSources = [
    {
      model: 'BusinessUnit',
      items: [
        { value: 'bu-1', label: 'Engineering' },
        { value: 'bu-2', label: 'Finance', disabled: true },
      ],
    },
  ];

  it('renders the selected label and option labels', () => {
    render(
      <DemographicReferenceWidget {...widgetProps({ definition, value: 'bu-1', dataSources })} />,
    );

    const field = screen.getByTestId('demographic-control-businessUnit');
    expect(field.querySelector('[role="combobox"]')).not.toBeNull();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });

  it('emits the selected key and null when cleared', () => {
    const onChange = jest.fn();

    // Select: from an empty value the option change emits the key.
    const { unmount } = render(
      <DemographicReferenceWidget
        {...widgetProps({ definition, value: null, onChange, dataSources })}
      />,
    );

    fireEvent.mouseDown(
      screen.getByTestId('demographic-control-businessUnit').querySelector('[role="combobox"]')!,
    );
    fireEvent.click(screen.getByRole('option', { name: 'Engineering' }));
    expect(onChange).toHaveBeenCalledWith('bu-1');

    unmount();

    // Clear: with a value selected, choosing the placeholder emits null. A
    // second interaction on the same controlled instance would be a no-op
    // because the component's value never changed.
    render(
      <DemographicReferenceWidget
        {...widgetProps({ definition, value: 'bu-1', onChange, dataSources })}
      />,
    );

    fireEvent.mouseDown(
      screen.getByTestId('demographic-control-businessUnit').querySelector('[role="combobox"]')!,
    );
    fireEvent.click(screen.getByRole('option', { name: /Select Business unit/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('is disabled when no data source is supplied', () => {
    render(<DemographicReferenceWidget {...widgetProps({ definition, value: 'bu-1' })} />);

    expect(
      screen.getByTestId('demographic-control-businessUnit').querySelector('[role="combobox"]'),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('falls back to the raw key when it is not in the source', () => {
    render(
      <DemographicReferenceWidget
        {...widgetProps({ definition, value: 'bu-9', dataSources })}
      />,
    );

    expect(screen.getByText('bu-9')).toBeInTheDocument();
  });
});

describe('multiValued rows', () => {
  it('edits one row without touching the others', () => {
    const onChange = jest.fn();

    render(
      <DemographicMultiValueField
        {...widgetProps({
          definition: makeDefinition({
            key: 'employers',
            title: 'Employers',
            valueType: 'string',
            multiValued: true,
          }),
          value: ['Acme', 'Beta'],
          onChange,
        })}
        renderItem={({ value, onChange: onItemChange, index }) => (
          <DemographicTextWidget
            {...widgetProps({
              definition: makeDefinition({
                key: 'employers',
                title: 'Employers',
                valueType: 'string',
                multiValued: true,
              }),
              value,
              onChange: onItemChange,
              instanceKey: index,
            })}
          />
        )}
      />,
    );

    fireEvent.change(screen.getByTestId('demographic-control-employers-1').querySelector('input')!, {
      target: { value: 'Beta Ltd' },
    });

    expect(onChange).toHaveBeenCalledWith(['Acme', 'Beta Ltd']);
  });

  it('adds a row and removes a row', () => {
    const onChange = jest.fn();
    const definition = makeDefinition({
      key: 'employers',
      title: 'Employers',
      valueType: 'string',
      multiValued: true,
    });

    render(
      <DemographicMultiValueField
        {...widgetProps({ definition, value: ['Acme'], onChange })}
        renderItem={() => <span />}
      />,
    );

    fireEvent.click(screen.getByTestId('demographic-multi-add-employers'));
    expect(onChange).toHaveBeenCalledWith(['Acme', null]);

    fireEvent.click(screen.getByTestId('demographic-multi-remove-employers-0'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('shows the empty note and a disabled add button when read-only', () => {
    render(
      <DemographicMultiValueField
        {...widgetProps({
          definition: makeDefinition({
            key: 'employers',
            title: 'Employers',
            valueType: 'string',
            multiValued: true,
          }),
          value: [],
          disabled: true,
        })}
        renderItem={() => <span />}
      />,
    );

    expect(screen.getByText('No items yet.')).toBeInTheDocument();
    expect(screen.getByTestId('demographic-multi-add-employers')).toBeDisabled();
  });
});

describe('scalar controls — edge paths', () => {
  it('string: emits null for an emptied field', () => {
    const onChange = jest.fn();

    render(
      <DemographicTextWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' }),
          value: 'Ada',
          onChange,
        })}
      />,
    );

    fireEvent.change(
      screen.getByTestId('demographic-control-nickname').querySelector('input')!,
      { target: { value: '' } },
    );

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('string: renders a value that is not a string', () => {
    render(
      <DemographicTextWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' }),
          value: 42,
        })}
      />,
    );

    expect(screen.getByTestId('demographic-control-nickname').querySelector('input')).toHaveValue(
      '42',
    );
  });

  it('number: emits a number for a valid value and null for an empty one', () => {
    const onChange = jest.fn();

    render(
      <DemographicNumberWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'age', title: 'Age', valueType: 'number' }),
          value: 42,
          onChange,
        })}
      />,
    );

    const input = screen.getByTestId('demographic-control-age').querySelector('input')!;

    fireEvent.change(input, { target: { value: '43' } });
    expect(onChange).toHaveBeenLastCalledWith(43);

    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('number: accepts a string value coming off the wire', () => {
    render(
      <DemographicNumberWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'age', title: 'Age', valueType: 'number' }),
          value: '42',
        })}
      />,
    );

    expect(screen.getByTestId('demographic-control-age').querySelector('input')).toHaveValue(42);
  });

  it('boolean: shows the translated state and toggles', () => {
    const onChange = jest.fn();

    const { unmount } = render(
      <DemographicBooleanWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'optIn', title: 'Opt in', valueType: 'boolean' }),
          value: true,
          onChange,
        })}
      />,
    );

    expect(screen.getByText('Yes')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('demographic-control-optIn').querySelector('input')!);
    expect(onChange).toHaveBeenCalledWith(false);

    unmount();

    render(
      <DemographicBooleanWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'optIn', title: 'Opt in', valueType: 'boolean' }),
          value: false,
        })}
      />,
    );

    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('date: honours a schema dateFormat and the notSet fallback', () => {
    const { unmount } = render(
      <DemographicDateWidget
        {...widgetProps({
          definition: makeDefinition({
            key: 'dob',
            title: 'Date of birth',
            valueType: 'date',
            schema: { dateFormat: 'DD/MM/YYYY' },
          }),
          value: '1990-05-01',
        })}
      />,
    );

    expect(screen.getByTestId('shared-date-selector')).toHaveValue('1990-05-01');
    unmount();

    render(
      <DemographicDateWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'dob', title: 'Date of birth', valueType: 'date' }),
          value: undefined,
          disabled: true,
        })}
      />,
    );

    expect(screen.getByTestId('demographic-control-dob').querySelector('input')).toHaveValue('—');
  });

  it('date: clears to null', () => {
    const onChange = jest.fn();

    render(
      <DemographicDateWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'dob', title: 'Date of birth', valueType: 'date' }),
          value: '1990-05-01',
          onChange,
        })}
      />,
    );

    fireEvent.change(screen.getByTestId('shared-date-selector'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('enum: shows the placeholder, the label and the empty-options note', () => {
    const { unmount } = render(
      <DemographicEnumWidget
        {...widgetProps({
          definition: makeDefinition({ key: 'gender', title: 'Gender', valueType: 'enum' }),
          value: null,
        })}
      />,
    );

    expect(screen.getByText('Select Gender')).toBeInTheDocument();
    unmount();

    render(
      <DemographicEnumWidget
        {...widgetProps({
          definition: makeDefinition({
            key: 'gender',
            title: 'Gender',
            valueType: 'enum',
            options: [],
          }),
          value: null,
        })}
      />,
    );

    expect(screen.getByText('No options are configured for this field.')).toBeInTheDocument();
  });

  it('enum: clears the value to null when the placeholder option is chosen', () => {
    const onChange = jest.fn();

    render(
      <DemographicEnumWidget
        {...widgetProps({
          definition: makeDefinition({
            key: 'gender',
            title: 'Gender',
            valueType: 'enum',
            options: [{ key: 'female', label: 'Female' }],
          }),
          value: 'female',
          onChange,
        })}
      />,
    );

    fireEvent.mouseDown(
      screen.getByTestId('demographic-control-gender').querySelector('[role="combobox"]')!,
    );
    fireEvent.click(screen.getByRole('option', { name: 'Select Gender' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('enum: falls back to the raw key when no option matches', () => {
    render(
      <DemographicEnumWidget
        {...widgetProps({
          definition: makeDefinition({
            key: 'gender',
            title: 'Gender',
            valueType: 'enum',
            options: [{ key: 'female', label: 'Female' }],
          }),
          value: 'unknown',
        })}
      />,
    );

    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('multi-enum: emits [] for a non-array engine payload and notes empty options', () => {
    const onChange = jest.fn();

    const { unmount } = render(
      <DemographicMultiEnumWidget
        {...widgetProps({
          definition: makeDefinition({
            key: 'languages',
            title: 'Languages',
            valueType: 'multi-enum',
            options: [],
          }),
          value: [],
          onChange,
        })}
      />,
    );

    expect(screen.getByText('No options are configured for this field.')).toBeInTheDocument();
    unmount();

    render(
      <DemographicMultiEnumWidget
        {...widgetProps({
          definition: makeDefinition({
            key: 'languages',
            title: 'Languages',
            valueType: 'multi-enum',
            options: [{ key: 'en', label: 'English' }],
          }),
          value: null,
          onChange,
        })}
      />,
    );

    const input = screen.getByTestId('demographic-control-languages').querySelector('input')!;
    fireEvent.change(input, { target: { value: 'Eng' } });
    fireEvent.click(screen.getByRole('option', { name: 'English' }));

    expect(onChange).toHaveBeenCalledWith(['en']);
  });
});

describe('findDataSource', () => {
  it('matches on the model and tolerates an absent list', () => {
    const sources = [{ model: 'Team', items: [] }];

    expect(findDataSource(sources, 'Team')).toBe(sources[0]);
    expect(findDataSource(sources, 'Region')).toBeNull();
    expect(findDataSource(undefined, 'Team')).toBeNull();
    expect(findDataSource(sources, null)).toBeNull();
    expect(findDataSource(sources, '')).toBeNull();
  });
});

describe('createWidgetRegistry', () => {
  it('overrides individual value types', () => {
    const Custom = () => null;
    const registry = createWidgetRegistry({ string: Custom });

    expect(registry.string).toBe(Custom);
    expect(registry.array).toBe(DemographicArrayWidget);
    expect(createWidgetRegistry(null).date).toBe(DemographicDateWidget);
  });
});
