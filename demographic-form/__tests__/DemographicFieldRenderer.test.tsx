/**
 * @jest-environment jsdom
 *
 * DemographicFieldRenderer — widget resolution contract (ORG-032, plan D8).
 *
 * These assertions are the freeze on the custom-widget contract: anything that
 * changes the props a bound widget receives breaks three downstream tickets, so
 * the key set itself is asserted rather than a sample of it.
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import DemographicFieldRenderer from '../DemographicFieldRenderer';
import {
  makeDefinition,
  makeReactory,
  makeThrowingReactory,
} from './testFixtures';

/**
 * The shared `DateSelectorWidget` wraps a MUI `DatePicker`, which needs a
 * `LocalizationProvider`/adapter. Stubbing it keeps this suite about the
 * resolution decision — a `date` definition must land on that shared widget —
 * without standing up the date adapter stack in every test.
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

const widgetName = (testId: string): string | null =>
  screen.getByTestId(testId).getAttribute('data-demographic-widget');

describe('DemographicFieldRenderer — bound widget contract', () => {
  it('hands the documented contract plus the props resolved through componentPropsMap', () => {
    const Bound = jest.fn((_props: any) => <div data-testid="bound-widget" />);
    const reactory = makeReactory({ 'acme.EmploymentPicker@1.0.0': Bound });
    const onChange = jest.fn();

    const definition = makeDefinition({
      key: 'employmentType',
      title: 'Employment type',
      valueType: 'enum',
      required: true,
      options: [{ key: 'perm', label: 'Permanent' }],
      widget: {
        componentFqn: 'acme.EmploymentPicker@1.0.0',
        componentProps: { variant: 'outlined' },
        componentPropsMap: {
          'definition.options': 'options',
          'organization.id': 'organizationId',
          'definition.not.there': 'neverSet',
        },
      },
    });

    const organization = { id: 'org-9' };
    const user = { id: 'user-3' };

    render(
      <DemographicFieldRenderer
        definition={definition}
        value="perm"
        onChange={onChange}
        organization={organization}
        user={user}
        reactory={reactory}
        mode="edit"
      />,
    );

    expect(screen.getByTestId('bound-widget')).toBeInTheDocument();
    expect(Bound).toHaveBeenCalledTimes(1);

    const props = Bound.mock.calls[0][0];

    // The frozen D8 contract.
    expect(props.value).toBe('perm');
    expect(typeof props.onChange).toBe('function');
    expect(props.error).toBeNull();
    expect(props.disabled).toBe(false);
    expect(props.definition).toBe(definition);
    expect(props.organization).toBe(organization);
    expect(props.user).toBe(user);
    expect(props.reactory).toBe(reactory);
    expect(props.mode).toBe('edit');

    // `componentProps` first, then `componentPropsMap` over the render context.
    expect(props.variant).toBe('outlined');
    expect(props.options).toEqual(definition.options);
    expect(props.organizationId).toBe('org-9');

    // A mapping whose source path is absent is omitted, not set to undefined.
    expect('neverSet' in props).toBe(false);

    // Nothing internal leaks into a bound widget (`t`/`dataSources` are for the
    // built-in registry controls only).
    expect(Object.keys(props).sort()).toEqual(
      [
        'definition',
        'disabled',
        'error',
        'mode',
        'onChange',
        'options',
        'organization',
        'organizationId',
        'reactory',
        'user',
        'value',
        'variant',
      ].sort(),
    );
  });

  it('does not let a props map shadow the contract', () => {
    const Bound = jest.fn((_props: any) => <div data-testid="bound-widget" />);
    const reactory = makeReactory({ 'acme.Picker@1.0.0': Bound });

    const definition = makeDefinition({
      key: 'gender',
      widget: {
        componentFqn: 'acme.Picker@1.0.0',
        componentPropsMap: { 'organization.id': 'value', 'definition.key': 'definition' },
      },
    });

    render(
      <DemographicFieldRenderer
        definition={definition}
        value="female"
        organization={{ id: 'org-9' }}
        reactory={reactory}
      />,
    );

    const props = Bound.mock.calls[0][0];
    expect(props.value).toBe('female');
    expect(props.definition).toBe(definition);
    expect(props.definition.key).toBe('gender');
  });

  it('forwards onChange, the first error message and disabled state to the widget', () => {
    const Bound = jest.fn((_props: any) => <div data-testid="bound-widget" />);
    const reactory = makeReactory({ 'acme.Picker@1.0.0': Bound });
    const onChange = jest.fn();

    render(
      <DemographicFieldRenderer
        definition={makeDefinition({
          key: 'gender',
          widget: { componentFqn: 'acme.Picker@1.0.0' },
        })}
        value="female"
        error={['Rejected by the server', 'Also too long']}
        readOnly
        onChange={onChange}
        reactory={reactory}
      />,
    );

    const props = Bound.mock.calls[0][0];
    expect(props.error).toBe('Rejected by the server');
    expect(props.disabled).toBe(true);
    expect(props.mode).toBe('read');

    props.onChange('male');
    expect(onChange).toHaveBeenCalledWith('male');

    // The renderer still prints every message for the field.
    expect(screen.getByTestId('demographic-errors-gender')).toHaveTextContent(
      'Also too long',
    );
  });
});

describe('DemographicFieldRenderer — fallbacks', () => {
  it('resolves a memo-wrapped registry component', () => {
    // `React.memo` returns an object, not a function; the resolver must accept
    // both shapes or a memoised widget would silently fall back.
    const MemoWidget = React.memo(() => <div data-testid="memo-widget" />);
    const reactory = makeReactory({ 'acme.Memo@1.0.0': MemoWidget });

    render(
      <DemographicFieldRenderer
        definition={makeDefinition({
          key: 'gender',
          widget: { componentFqn: 'acme.Memo@1.0.0' },
        })}
        value="female"
        reactory={reactory}
      />,
    );

    expect(screen.getByTestId('memo-widget')).toBeInTheDocument();
    expect(screen.queryByTestId('demographic-widget-warning-gender')).not.toBeInTheDocument();
  });

  it('falls back by valueType and warns, naming the missing FQN', () => {
    const reactory = makeReactory();

    render(
      <DemographicFieldRenderer
        definition={makeDefinition({
          key: 'optIn',
          title: 'Opt in',
          valueType: 'boolean',
          widget: { componentFqn: 'acme.MissingWidget@9.9.9' },
        })}
        value
        reactory={reactory}
      />,
    );

    const warning = screen.getByTestId('demographic-widget-warning-optIn');
    expect(warning).toHaveTextContent('acme.MissingWidget@9.9.9');
    expect(warning).toHaveTextContent('boolean');

    // The built-in boolean control is what actually rendered.
    expect(widgetName('demographic-control-optIn')).toBe('Switch');
    expect(reactory.getComponent).toHaveBeenCalledWith('acme.MissingWidget@9.9.9');
  });

  it('falls back to the date widget for a date definition', () => {
    render(
      <DemographicFieldRenderer
        definition={makeDefinition({
          key: 'dob',
          title: 'Date of birth',
          valueType: 'date',
          widget: { componentFqn: 'acme.Gone@1.0.0' },
        })}
        reactory={makeReactory()}
      />,
    );

    expect(screen.getByTestId('demographic-widget-warning-dob')).toBeInTheDocument();
    expect(widgetName('demographic-control-dob')).toBe('DateSelectorWidget');
    expect(screen.getByTestId('shared-date-selector')).toHaveAttribute('aria-label', 'Date of birth');
  });

  it('survives a registry that throws', () => {
    render(
      <DemographicFieldRenderer
        definition={makeDefinition({
          key: 'nickname',
          title: 'Nickname',
          valueType: 'string',
          widget: { componentFqn: 'acme.Exploding@1.0.0' },
        })}
        reactory={makeThrowingReactory()}
      />,
    );

    expect(screen.getByTestId('demographic-widget-warning-nickname')).toHaveTextContent(
      'acme.Exploding@1.0.0',
    );
    expect(widgetName('demographic-control-nickname')).toBe('TextField');
  });

  it('falls back when no reactory instance is supplied', () => {
    render(
      <DemographicFieldRenderer
        definition={makeDefinition({
          key: 'nickname',
          title: 'Nickname',
          valueType: 'string',
          widget: { componentFqn: 'acme.Whatever@1.0.0' },
        })}
      />,
    );

    expect(screen.getByTestId('demographic-widget-warning-nickname')).toBeInTheDocument();
    expect(widgetName('demographic-control-nickname')).toBe('TextField');
  });

  it('does not warn when the definition has no binding', () => {
    render(
      <DemographicFieldRenderer
        definition={makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' })}
        reactory={makeReactory()}
      />,
    );

    expect(screen.queryByTestId('demographic-widget-warning-nickname')).not.toBeInTheDocument();
  });

  it('degrades an unknown value type to a text input with a visible note', () => {
    render(
      <DemographicFieldRenderer
        definition={makeDefinition({ key: 'externalId', title: 'External id', valueType: 'uuid' })}
        value="abc"
        reactory={makeReactory()}
      />,
    );

    expect(screen.getByTestId('demographic-widget-unsupported-externalId')).toHaveTextContent(
      'uuid',
    );
    expect(widgetName('demographic-control-externalId')).toBe('TextField');
    expect(
      screen.getByTestId('demographic-field-externalId').querySelector('input'),
    ).toHaveValue('abc');
  });

  it('honours a caller-supplied registry override', () => {
    const Custom = (_props: any) => <div data-testid="custom-string-control" />;

    render(
      <DemographicFieldRenderer
        definition={makeDefinition({ key: 'nickname', title: 'Nickname', valueType: 'string' })}
        reactory={makeReactory()}
        widgetRegistry={{ string: Custom }}
      />,
    );

    expect(screen.getByTestId('custom-string-control')).toBeInTheDocument();
    expect(screen.queryByTestId('demographic-control-nickname')).not.toBeInTheDocument();
  });
});

describe('DemographicFieldRenderer — reference data source', () => {
  it('names the missing model when no data source was supplied', () => {
    render(
      <DemographicFieldRenderer
        definition={makeDefinition({
          key: 'team',
          title: 'Team',
          valueType: 'reference',
          reference: { model: 'Team' },
        })}
        reactory={makeReactory()}
      />,
    );

    const note = screen.getByTestId('demographic-reference-missing-team');
    expect(note).toHaveTextContent('Team');
    // The select is disabled rather than silently empty and interactive.
    expect(
      screen.getByTestId('demographic-control-team').querySelector('.Mui-disabled'),
    ).not.toBeNull();
  });
});
