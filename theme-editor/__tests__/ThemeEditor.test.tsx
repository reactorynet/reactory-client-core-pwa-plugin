/**
 * @jest-environment jsdom
 *
 * Verifies `ThemeEditor` as a standalone, controlled component: it edits the
 * theme it is given, emits complete theme records, and saves a sanitized
 * payload. No Reactory API/provider and no GraphQL are involved.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import * as fs from 'fs';
import * as path from 'path';
import ThemeEditor from '../ThemeEditor';
import { createDefaultTheme } from '../themeDefaults';
import { prepareThemeForEditing } from '../themeModel';

const makeTheme = (name = 'demo') => prepareThemeForEditing(createDefaultTheme(name));

const ControlledEditor: React.FC<{
  initial: any;
  onSave?: (payload: any) => void;
  readOnly?: boolean;
  onError?: (message: string) => void;
}> = ({ initial, onSave, readOnly, onError }) => {
  const [theme, setTheme] = React.useState(initial);
  return (
    <ThemeEditor
      variant="inline"
      theme={theme}
      onChange={setTheme}
      onSave={onSave}
      onCancel={() => undefined}
      onError={onError}
      readOnly={readOnly}
    />
  );
};

describe('ThemeEditor (standalone, controlled)', () => {
  it('renders the supplied theme and edits run through onChange', () => {
    render(<ControlledEditor initial={makeTheme('ocean')} />);

    expect(screen.getByText('Edit Theme: ocean')).toBeInTheDocument();

    const title = screen.getByLabelText('Application Title') as HTMLInputElement;
    expect(title.value).toBe('My Reactory App');

    fireEvent.change(title, { target: { value: 'Acme Portal' } });

    // Controlled: the wrapper's state flowed back into the input.
    expect((screen.getByLabelText('Application Title') as HTMLInputElement).value)
      .toBe('Acme Portal');
  });

  it('edits the light palette without touching dark', () => {
    const onChange = jest.fn();
    const theme = makeTheme('ocean');
    render(<ThemeEditor variant="inline" theme={theme} onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: /MUI Palettes/i }));
    fireEvent.click(screen.getByRole('button', { name: /Light Mode Palette/i }));

    const mainInput = screen.getAllByLabelText('Main')[0] as HTMLInputElement;
    fireEvent.change(mainInput, { target: { value: '#00ff00' } });

    const emitted = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    const light = emitted.modes.find((m: any) => m.mode === 'light');
    const dark = emitted.modes.find((m: any) => m.mode === 'dark');

    expect(light.options.palette.primary.main).toBe('#00ff00');
    expect(dark.options.palette.primary.main).toBe(theme.modes?.find((m) => m.mode === 'dark')
      ?.options?.palette?.primary?.main);
  });

  it('supports typography, shape and spacing edits', () => {
    const onChange = jest.fn();
    render(<ThemeEditor variant="inline" theme={makeTheme()} onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: /Typography & Shape/i }));
    fireEvent.change(screen.getByLabelText('Custom Font Family String'), {
      target: { value: 'Inter, sans-serif' },
    });

    const emitted = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(emitted.options.typography.fontFamily).toBe('Inter, sans-serif');
  });

  it('saves a sanitized payload with normalised modes and assets', () => {
    const onSave = jest.fn();
    const theme = { ...makeTheme('ocean'), __typename: 'ApplicationTheme', id: 'theme-1' };
    render(<ControlledEditor initial={theme} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Application Title'), {
      target: { value: 'Acme Portal' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Theme/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];

    expect(payload.__typename).toBeUndefined();
    expect(payload.id).toBe('theme-1');
    expect(payload.content.appTitle).toBe('Acme Portal');
    expect(payload.modes).toHaveLength(2);
    expect(payload.modes.map((m: any) => m.mode)).toEqual(['dark', 'light']);
    expect(payload.modes[0].id).toBe('dark');
    expect(payload.assets).toHaveLength(4);
    expect(payload.assets[0]).toEqual({
      id: 'logo',
      name: 'logo.png',
      assetType: 'image',
      url: 'themes/ocean/images/logo.png',
      loader: null,
      options: null,
      data: null,
    });
  });

  it('accepts a raw ThemeOptions JSON edit and reports syntax errors', () => {
    render(<ControlledEditor initial={makeTheme()} onSave={jest.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: /Raw ThemeOptions/i }));
    const editor = screen.getByRole('textbox');

    fireEvent.change(editor, { target: { value: '{ invalid' } });
    expect(screen.getByText(/JSON Syntax Error/i)).toBeInTheDocument();
  });

  it('is read-only when asked: no save action and disabled inputs', () => {
    render(<ControlledEditor initial={makeTheme()} readOnly onSave={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /Save Theme/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Application Title')).toBeDisabled();
    expect(screen.getByLabelText('Namespace')).toBeDisabled();

    // Navigation remains available in read-only mode.
    fireEvent.click(screen.getByRole('tab', { name: /Live Preview/i }));
    expect(screen.getByText('Live MUI Component & Palette Preview')).toBeInTheDocument();
  });

  it('surfaces validation errors inline when no onError sink is supplied', () => {
    const nameless = { ...makeTheme(), name: '' };
    render(<ControlledEditor initial={nameless} onSave={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Save Theme/i }));

    expect(screen.getByText('Theme name is required')).toBeInTheDocument();
  });

  it('routes validation errors to the caller when onError is supplied', () => {
    const onError = jest.fn();
    const onSave = jest.fn();
    const nameless = { ...makeTheme(), name: '' };

    render(
      <ThemeEditor variant="inline" theme={nameless} onChange={jest.fn()} onSave={onSave} onError={onError} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Save Theme/i }));

    expect(onError).toHaveBeenCalledWith('Theme name is required');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('contains no GraphQL transport calls', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../ThemeEditor.tsx'), 'utf8');
    expect(source).not.toMatch(/graphqlMutation|graphqlQuery/);
  });

  it('renders the general tab fields inside the dialog variant', () => {
    render(<ThemeEditor theme={makeTheme('dialog-theme')} onChange={jest.fn()} onCancel={jest.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit Theme: dialog-theme')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Theme Name/i)).toBeInTheDocument();
  });
});
