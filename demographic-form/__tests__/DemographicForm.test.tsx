/**
 * @jest-environment jsdom
 *
 * DemographicForm contract (ORG-032).
 *
 * The form is rendered directly with the props the hosts supply (ORG-031
 * preview, ORG-033 values pane, ORG-034 self-service), so these assertions cover
 * the real component rather than a wrapper.
 *
 * The shared `DateSelectorWidget` is stubbed: it wraps a MUI `DatePicker`, which
 * needs a `LocalizationProvider`/adapter and a stable clock to render in jsdom.
 * Stubbing keeps the assertion about *our* wiring precise — that a `date`
 * definition resolves to the shared widget and passes it the value and label.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DemographicForm from '../DemographicForm';
import type { DemographicDefinition } from '../types';
import { makeDefinition, makeReactory } from './testFixtures';

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

const widgetOf = (key: string): string | null =>
  screen.getByTestId(`demographic-control-${key}`).getAttribute('data-demographic-widget');

const fieldKeys = (): Array<string | null> =>
  screen
    .queryAllByTestId(/^demographic-field-/)
    .map((element) => element.getAttribute('data-demographic-key'));

/** A ReactoryForm stand-in that records the `formDef` it was given. */
const makeFormStub = () => jest.fn((_props: any) => <div data-testid="reactory-form-stub" />);

const addressSchema = {
  type: 'object',
  properties: { line1: { type: 'string' } },
};

describe('DemographicForm — one control per value type', () => {
  const definitions: DemographicDefinition[] = [
    makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string', ordinal: 1 }),
    makeDefinition({ key: 'age', title: 'Age', valueType: 'number', ordinal: 2 }),
    makeDefinition({ key: 'optIn', title: 'Opt in', valueType: 'boolean', ordinal: 3 }),
    makeDefinition({ key: 'dob', title: 'Date of birth', valueType: 'date', ordinal: 4 }),
    makeDefinition({
      key: 'employmentType',
      title: 'Employment type',
      valueType: 'enum',
      ordinal: 5,
      options: [{ key: 'perm', label: 'Permanent', ordinal: 1 }],
    }),
    makeDefinition({
      key: 'languages',
      title: 'Languages',
      valueType: 'multi-enum',
      ordinal: 6,
      options: [
        { key: 'en', label: 'English', ordinal: 1 },
        { key: 'af', label: 'Afrikaans', ordinal: 2 },
      ],
    }),
    makeDefinition({
      key: 'address',
      title: 'Address',
      valueType: 'object',
      ordinal: 7,
      schema: addressSchema,
    }),
    makeDefinition({
      key: 'certifications',
      title: 'Certifications',
      valueType: 'array',
      ordinal: 8,
      schema: { type: 'array', items: { type: 'string' } },
    }),
    makeDefinition({
      key: 'businessUnit',
      title: 'Business unit',
      valueType: 'reference',
      ordinal: 9,
      reference: { model: 'BusinessUnit' },
    }),
  ];

  const values = {
    nickname: 'Ada',
    age: 42,
    optIn: true,
    dob: '1990-05-01',
    employmentType: 'perm',
    languages: ['en', 'af'],
    address: { line1: '1 Main Road' },
    certifications: ['AWS'],
    businessUnit: 'bu-1',
  };

  const setup = () => {
    const FormStub = makeFormStub();
    const reactory = makeReactory({ 'core.ReactoryForm@1.0.0': FormStub });
    render(
      <DemographicForm
        definitions={definitions}
        values={values}
        reactory={reactory}
        organization={{ id: 'org-1' }}
        dataSources={[
          {
            model: 'BusinessUnit',
            items: [
              { value: 'bu-1', label: 'Engineering' },
              { value: 'bu-2', label: 'Finance' },
            ],
          },
        ]}
      />,
    );
    return { FormStub, reactory };
  };

  it('renders the fallback control for each value type', () => {
    setup();

    expect(widgetOf('nickname')).toBe('TextField');
    expect(widgetOf('age')).toBe('NumberField');
    expect(widgetOf('optIn')).toBe('Switch');
    expect(widgetOf('dob')).toBe('DateSelectorWidget');
    expect(widgetOf('employmentType')).toBe('Select');
    expect(widgetOf('languages')).toBe('Autocomplete');
    // object and array both go through the shared form engine, so the value
    // type is what distinguishes them here.
    expect(widgetOf('address')).toBe('ReactoryForm');
    expect(widgetOf('certifications')).toBe('ReactoryForm');
    expect(widgetOf('businessUnit')).toBe('ReferenceSelect');

    expect(
      screen.getByTestId('demographic-field-address').getAttribute('data-value-type'),
    ).toBe('object');
    expect(
      screen.getByTestId('demographic-field-certifications').getAttribute('data-value-type'),
    ).toBe('array');
  });

  it('renders a string value into a text input and a number into a numeric input', () => {
    setup();

    const text = screen.getByTestId('demographic-field-nickname').querySelector('input');
    expect(text).toHaveValue('Ada');
    expect(text?.getAttribute('type')).toBe('text');

    const number = screen.getByTestId('demographic-field-age').querySelector('input');
    expect(number).toHaveValue(42);
    expect(number?.getAttribute('type')).toBe('number');
  });

  it('renders a boolean as a switch reflecting the stored value', () => {
    setup();

    const toggle = screen.getByTestId('demographic-field-optIn').querySelector('input');
    expect(toggle?.getAttribute('type')).toBe('checkbox');
    expect(toggle).toBeChecked();
  });

  it('renders a date through the shared DateSelectorWidget', () => {
    setup();

    const date = screen.getByTestId('shared-date-selector');
    expect(date).toHaveValue('1990-05-01');
    expect(date).toHaveAttribute('aria-label', 'Date of birth');
  });

  it('renders an enum as a select carrying the current option label', () => {
    setup();

    const field = screen.getByTestId('demographic-field-employmentType');
    expect(field.querySelector('[role="combobox"]')).not.toBeNull();
    expect(within(field).getByText('Permanent')).toBeInTheDocument();
  });

  it('renders a multi-enum as a multiple autocomplete with one chip per value', () => {
    setup();

    const field = screen.getByTestId('demographic-field-languages');
    expect(field.querySelector('[role="combobox"]')).not.toBeNull();
    expect(within(field).getByText('English')).toBeInTheDocument();
    expect(within(field).getByText('Afrikaans')).toBeInTheDocument();
  });

  it('renders an object through ReactoryForm driven by the definition schema', () => {
    const { FormStub } = setup();

    // object and array both render the engine; the object one is first (lower ordinal)
    expect(screen.getAllByTestId('reactory-form-stub')).toHaveLength(2);
    expect(FormStub).toHaveBeenCalledTimes(2);

    const props = FormStub.mock.calls[0][0];
    expect(props.formDef.schema).toEqual(addressSchema);
    expect(props.formData).toEqual({ line1: '1 Main Road' });
    expect(props.mode).toBe('edit');
  });

  it('renders an array through ReactoryForm with its array schema', () => {
    const { FormStub } = setup();

    // The array form is the second engine call (object has the lower ordinal).
    const arrayProps = FormStub.mock.calls[1][0];
    expect(arrayProps.formDef.schema).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
    expect(arrayProps.formData).toEqual(['AWS']);
  });

  it('renders a reference select populated from the caller-supplied data source', () => {
    setup();

    const field = screen.getByTestId('demographic-field-businessUnit');
    expect(field.querySelector('[role="combobox"]')).not.toBeNull();
    expect(within(field).getByText('Engineering')).toBeInTheDocument();
  });
});

describe('DemographicForm — ordering and filtering', () => {
  it('renders enabled definitions in ordinal order', () => {
    render(
      <DemographicForm
        definitions={[
          makeDefinition({ key: 'charlie', title: 'Charlie', ordinal: 30 }),
          makeDefinition({ key: 'alpha', title: 'Alpha', ordinal: 10 }),
          makeDefinition({ key: 'bravo', title: 'Bravo', ordinal: 20 }),
        ]}
        reactory={makeReactory()}
      />,
    );

    expect(fieldKeys()).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('omits disabled definitions', () => {
    render(
      <DemographicForm
        definitions={[
          makeDefinition({ key: 'shown', title: 'Shown', ordinal: 1 }),
          makeDefinition({ key: 'hidden', title: 'Hidden', ordinal: 2, enabled: false }),
        ]}
        reactory={makeReactory()}
      />,
    );

    expect(fieldKeys()).toEqual(['shown']);
    expect(screen.queryByTestId('demographic-field-hidden')).not.toBeInTheDocument();
  });

  it('renders a translated note when nothing is renderable', () => {
    render(<DemographicForm definitions={[]} reactory={makeReactory()} />);

    expect(screen.getByTestId('demographic-form-empty')).toHaveTextContent(
      'No demographic fields are configured.',
    );
  });

  it('renders nothing when the caller hides the empty state', () => {
    const { container } = render(
      <DemographicForm definitions={[]} reactory={makeReactory()} hideEmptyState />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('honours a custom empty state', () => {
    render(
      <DemographicForm
        definitions={[]}
        reactory={makeReactory()}
        emptyState={<span data-testid="custom-empty">Nothing here</span>}
      />,
    );

    expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
  });
});

describe('DemographicForm — required, sensitive and read-only', () => {
  it('marks a required definition', () => {
    render(
      <DemographicForm
        definitions={[
          makeDefinition({ key: 'gender', title: 'Gender', required: true }),
          makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string', ordinal: 1 }),
        ]}
        reactory={makeReactory()}
      />,
    );

    expect(screen.getByTestId('demographic-required-gender')).toHaveTextContent('*');
    expect(screen.queryByTestId('demographic-required-nickname')).not.toBeInTheDocument();
  });

  it('marks a sensitive definition and still renders it', () => {
    render(
      <DemographicForm
        definitions={[
          makeDefinition({ key: 'disability', title: 'Disability status', sensitive: true }),
        ]}
        values={{ disability: 'female' }}
        reactory={makeReactory()}
      />,
    );

    expect(screen.getByTestId('demographic-sensitive-disability')).toHaveTextContent('Sensitive');
    expect(screen.getByTestId('demographic-field-disability')).toBeInTheDocument();
  });

  it('disables every input when readOnly is set', () => {
    render(
      <DemographicForm
        definitions={[
          makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' }),
          makeDefinition({ key: 'optIn', title: 'Opt in', valueType: 'boolean', ordinal: 1 }),
          makeDefinition({ key: 'employmentType', title: 'Employment type', ordinal: 2 }),
        ]}
        values={{ nickname: 'Ada', optIn: true, employmentType: 'female' }}
        reactory={makeReactory()}
        readOnly
      />,
    );

    expect(
      screen.getByTestId('demographic-field-nickname').querySelector('input'),
    ).toBeDisabled();
    expect(screen.getByTestId('demographic-field-optIn').querySelector('input')).toBeDisabled();
    expect(
      screen.getByTestId('demographic-field-employmentType').getAttribute('data-mode'),
    ).toBe('read');
  });

  it('disables every input in `read` mode', () => {
    render(
      <DemographicForm
        definitions={[makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' })]}
        values={{ nickname: 'Ada' }}
        reactory={makeReactory()}
        mode="read"
      />,
    );

    expect(screen.getByTestId('demographic-field-nickname').querySelector('input')).toBeDisabled();
  });

  it('points a single control\'s title at that control\'s input id', () => {
    render(
      <DemographicForm
        definitions={[makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' })]}
        values={{ nickname: 'Ada' }}
        reactory={makeReactory()}
      />,
    );

    const label = screen.getByText('Nickname').closest('label');
    expect(label).not.toBeNull();
    expect(label).toHaveAttribute('for', 'demographic-field-nickname');
    expect(document.getElementById('demographic-field-nickname')).toBe(
      screen.getByLabelText('Nickname'),
    );
  });

  it('points a multi-enum title at the autocomplete input id', () => {
    render(
      <DemographicForm
        definitions={[makeDefinition({ key: 'languages', title: 'Languages', valueType: 'multi-enum' })]}
        values={{ languages: ['female'] }}
        reactory={makeReactory()}
      />,
    );

    const label = screen.getByText('Languages').closest('label');
    expect(label).toHaveAttribute('for', 'demographic-field-languages');

    const input = document.getElementById('demographic-field-languages');
    expect(input).not.toBeNull();
    expect(input?.tagName).toBe('INPUT');
  });

  it('renders a read-only date as a disabled text value rather than a picker', () => {
    render(
      <DemographicForm
        definitions={[makeDefinition({ key: 'dob', title: 'Date of birth', valueType: 'date' })]}
        values={{ dob: '1990-05-01' }}
        reactory={makeReactory()}
        readOnly
      />,
    );

    const input = screen.getByTestId('demographic-field-dob').querySelector('input');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('1990-05-01');
    expect(screen.queryByTestId('shared-date-selector')).not.toBeInTheDocument();
  });
});

describe('DemographicForm — validation display', () => {
  it('renders every message returned for a field', () => {
    render(
      <DemographicForm
        definitions={[makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' })]}
        values={{ nickname: '' }}
        errors={{ nickname: ['This field is required.', 'Must be at least 2 characters.'] }}
        reactory={makeReactory()}
      />,
    );

    const errors = screen.getByTestId('demographic-errors-nickname');
    expect(errors).toHaveTextContent('This field is required.');
    expect(errors).toHaveTextContent('Must be at least 2 characters.');
    expect(
      screen.getByTestId('demographic-field-nickname').querySelector('input'),
    ).toHaveAttribute('aria-invalid', 'true');
  });

  it('accepts a single message', () => {
    render(
      <DemographicForm
        definitions={[makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' })]}
        errors={{ nickname: 'Rejected' }}
        reactory={makeReactory()}
      />,
    );

    expect(screen.getByTestId('demographic-errors-nickname')).toHaveTextContent('Rejected');
  });

  it('renders no error container when the field has none', () => {
    render(
      <DemographicForm
        definitions={[makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' })]}
        errors={{ other: 'Not this field' }}
        reactory={makeReactory()}
      />,
    );

    expect(screen.queryByTestId('demographic-errors-nickname')).not.toBeInTheDocument();
  });
});

describe('DemographicForm — editing', () => {
  it('reports the next values record and the single change', () => {
    const definition = makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' });
    const onChange = jest.fn();

    render(
      <DemographicForm
        definitions={[definition]}
        values={{ other: 'kept' }}
        onChange={onChange}
        reactory={makeReactory()}
      />,
    );

    fireEvent.change(screen.getByTestId('demographic-field-nickname').querySelector('input')!, {
      target: { value: 'Ada Lovelace' },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      { other: 'kept', nickname: 'Ada Lovelace' },
      { key: 'nickname', value: 'Ada Lovelace', definition },
    );
  });

  it('emits a number for a numeric field and null when it is cleared', () => {
    const onChange = jest.fn();

    render(
      <DemographicForm
        definitions={[makeDefinition({ key: 'age', title: 'Age', valueType: 'number' })]}
        values={{ age: 42 }}
        onChange={onChange}
        reactory={makeReactory()}
      />,
    );

    const input = screen.getByTestId('demographic-field-age').querySelector('input')!;
    fireEvent.change(input, { target: { value: '43' } });
    expect(onChange.mock.calls[0][0].age).toBe(43);

    fireEvent.change(input, { target: { value: '' } });
    expect(onChange.mock.calls[1][0].age).toBeNull();
  });

  it('toggles a boolean', async () => {
    const onChange = jest.fn();

    render(
      <DemographicForm
        definitions={[makeDefinition({ key: 'optIn', title: 'Opt in', valueType: 'boolean' })]}
        values={{ optIn: false }}
        onChange={onChange}
        reactory={makeReactory()}
      />,
    );

    await userEvent.click(
      screen.getByTestId('demographic-field-optIn').querySelector('input')!,
    );

    expect(onChange.mock.calls[0][0].optIn).toBe(true);
  });

  it('excludes a deprecated enum option unless it is the current value', async () => {
    const definition = makeDefinition({ key: 'gender', title: 'Gender' });

    const { unmount } = render(
      <DemographicForm
        definitions={[definition]}
        values={{ gender: 'female' }}
        reactory={makeReactory()}
      />,
    );

    const field = screen.getByTestId('demographic-field-gender');
    fireEvent.mouseDown(field.querySelector('[role="combobox"]')!);

    expect(await screen.findByRole('option', { name: 'Female' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Legacy value' })).not.toBeInTheDocument();

    unmount();

    render(
      <DemographicForm
        definitions={[definition]}
        values={{ gender: 'legacy' }}
        reactory={makeReactory()}
      />,
    );

    fireEvent.mouseDown(
      screen.getByTestId('demographic-field-gender').querySelector('[role="combobox"]')!,
    );

    expect(await screen.findByRole('option', { name: 'Legacy value' })).toBeInTheDocument();
  });

  it('emits an array edit from the form engine without corrupting its rows', () => {
    const onChange = jest.fn();
    const FormStub = makeFormStub();

    render(
      <DemographicForm
        definitions={[
          makeDefinition({
            key: 'qualifications',
            title: 'Qualifications',
            valueType: 'array',
            schema: {
              type: 'array',
              items: { type: 'object', properties: { issuer: { type: 'string' } } },
            },
          }),
        ]}
        values={{ qualifications: [{ issuer: 'AWS' }] }}
        onChange={onChange}
        reactory={makeReactory({ 'core.ReactoryForm@1.0.0': FormStub })}
      />,
    );

    // The engine receives the stored objects untouched...
    expect(FormStub.mock.calls[0][0].formData).toEqual([{ issuer: 'AWS' }]);

    // ...and its next array is what leaves the form.
    const next = [{ issuer: 'AWS' }, { issuer: 'Azure' }];
    FormStub.mock.calls[0][0].onChange({ formData: next });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].qualifications).toEqual(next);
    expect(onChange.mock.calls[0][0].qualifications[1]).toEqual({ issuer: 'Azure' });
  });
});

describe('DemographicForm — multiValued definitions', () => {
  const definition = makeDefinition({
    key: 'previousEmployers',
    title: 'Previous employers',
    valueType: 'string',
    multiValued: true,
  });

  it('wraps a scalar value type in a repeatable list', () => {
    render(
      <DemographicForm
        definitions={[definition]}
        values={{ previousEmployers: ['Acme', 'Beta'] }}
        reactory={makeReactory()}
      />,
    );

    expect(widgetOf('previousEmployers')).toBe('MultiValueField');
    expect(screen.getByTestId('demographic-multi-item-previousEmployers-0')).toBeInTheDocument();
    expect(screen.getByTestId('demographic-multi-item-previousEmployers-1')).toBeInTheDocument();
  });

  it('names each row separately and keeps ids unique', () => {
    render(
      <DemographicForm
        definitions={[definition]}
        values={{ previousEmployers: ['Acme', 'Beta'] }}
        reactory={makeReactory()}
      />,
    );

    // The field is a named group rather than a label pointing at one input.
    const field = screen.getByTestId('demographic-field-previousEmployers');
    expect(field).toHaveAttribute('role', 'group');
    expect(field).toHaveAttribute('aria-label', 'Previous employers');
    expect(field.querySelectorAll('label[for]')).toHaveLength(0);

    // Each row has its own name and its own input id.
    const first = screen.getByLabelText('Previous employers item 1');
    const second = screen.getByLabelText('Previous employers item 2');
    expect(first).toHaveValue('Acme');
    expect(second).toHaveValue('Beta');
    expect(first.id).not.toBe(second.id);
    expect(first.id).toBe('demographic-field-previousEmployers-0');
    expect(second.id).toBe('demographic-field-previousEmployers-1');
  });

  it('edits one row and leaves the others alone', async () => {
    const onChange = jest.fn();

    render(
      <DemographicForm
        definitions={[definition]}
        values={{ previousEmployers: ['Acme', 'Beta'] }}
        onChange={onChange}
        reactory={makeReactory()}
      />,
    );

    const second = screen.getByLabelText('Previous employers item 2');
    // The form is controlled: fire a complete replacement rather than typing
    // character by character, which would accumulate on the stale DOM value
    // because the parent does not re-render between keystrokes.
    fireEvent.change(second, { target: { value: 'Beta Ltd' } });

    const latest = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(latest.previousEmployers).toEqual(['Acme', 'Beta Ltd']);
  });
});
