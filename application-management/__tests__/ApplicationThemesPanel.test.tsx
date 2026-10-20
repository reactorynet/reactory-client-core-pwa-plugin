/**
 * @jest-environment jsdom
 *
 * Behavioural coverage for `ApplicationThemesPanel` after the theme editor was
 * extracted into `theme-editor/`.
 *
 * The panel must keep doing exactly what it did before: render the theme list,
 * switch the active theme, host the editor, duplicate themes, open the CSS
 * studio and send the same GraphQL mutations. All persistence is mocked, so
 * this is a pure UI/host contract test.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ApplicationThemesPanel from '../ApplicationThemesPanel';
import { createDefaultTheme } from '../../theme-editor';

// The ThemeEditor dialog mounts MUI transitions and portals; on a loaded CI box
// a single interaction round trip can exceed the repo-wide 10s default.
jest.setTimeout(30000);

const makeTheme = (name: string, id: string) => ({
  ...createDefaultTheme(name),
  id,
  description: `${name} description`,
});

const themeA = makeTheme('reactory', 'theme-1');
const themeB = makeTheme('ocean', 'theme-2');

const createReactoryMock = (overrides: Record<string, any> = {}) => ({
  graphqlQuery: jest.fn(),
  graphqlMutation: jest.fn(),
  createNotification: jest.fn(),
  status: jest.fn().mockResolvedValue({}),
  ...overrides,
});

const renderPanel = (reactory: any) =>
  render(
    <ApplicationThemesPanel
      reactory={reactory}
      applicationId="app-1"
      formData={{ themes: [themeA, themeB], theme: 'reactory' }}
    />,
  );

describe('ApplicationThemesPanel (host of ThemeEditor)', () => {
  it('renders the theme list and the active theme exactly as before', () => {
    const reactory = createReactoryMock();
    renderPanel(reactory);

    expect(screen.getByText('Application Themes')).toBeInTheDocument();
    expect(screen.getByText('2 configured')).toBeInTheDocument();
    expect(screen.getByText('Active Theme: reactory')).toBeInTheDocument();
    expect(screen.getByText('reactory')).toBeInTheDocument();
    expect(screen.getByText('ocean')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set Active/i })).toBeInTheDocument();
    expect(screen.getAllByText('Palette Swatches:')).toHaveLength(2);
  });

  it('switches the active theme through the same mutation and refreshes status', async () => {
    const reactory = createReactoryMock({
      graphqlMutation: jest.fn().mockResolvedValue({
        data: {
          ReactoryClientSetActiveTheme: {
            theme: 'ocean',
            themes: [themeA, themeB],
          },
        },
      }),
    });
    renderPanel(reactory);

    fireEvent.click(screen.getByRole('button', { name: /Set Active/i }));

    await waitFor(() => expect(reactory.graphqlMutation).toHaveBeenCalledTimes(1));
    const [mutation, variables] = reactory.graphqlMutation.mock.calls[0];
    expect(mutation).toMatch(/mutation ReactoryClientSetActiveTheme/);
    expect(variables).toEqual({ clientId: 'app-1', themeName: 'ocean' });
    await waitFor(() => expect(reactory.status).toHaveBeenCalledWith({ theme: 'ocean' }));
  });

  it('opens the shared editor and saves through ReactoryClientSaveTheme', async () => {
    const reactory = createReactoryMock({
      graphqlMutation: jest.fn().mockResolvedValue({
        data: {
          ReactoryClientSaveTheme: {
            theme: 'reactory',
            themes: [themeA, themeB],
          },
        },
      }),
    });
    renderPanel(reactory);

    fireEvent.click(screen.getAllByTestId('EditIcon')[0]);

    expect(screen.getByText('Edit Theme: reactory')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Application Title'), {
      target: { value: 'Reactory Admin' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Theme/i }));

    await waitFor(() => expect(reactory.graphqlMutation).toHaveBeenCalledTimes(1));
    const [mutation, variables] = reactory.graphqlMutation.mock.calls[0];

    expect(mutation).toMatch(/mutation ReactoryClientSaveTheme/);
    expect(variables.clientId).toBe('app-1');
    expect(variables.theme.name).toBe('reactory');
    expect(variables.theme.id).toBe('theme-1');
    expect(variables.theme.content.appTitle).toBe('Reactory Admin');
    // Both modes survive the round trip; assets are normalized.
    expect(variables.theme.modes).toHaveLength(2);
    expect(variables.theme.modes.map((m: any) => m.mode)).toEqual(['dark', 'light']);
    expect(variables.theme.assets).toHaveLength(4);
  });

  it('duplicates a theme into the editor with a new key', () => {
    renderPanel(createReactoryMock());

    fireEvent.click(screen.getAllByTestId('FileCopyIcon')[0]);

    expect(screen.getByText('Edit Theme: reactory-copy')).toBeInTheDocument();
    expect(
      (screen.getByLabelText(/Theme Name/i) as HTMLInputElement).value,
    ).toBe('reactory-copy');
  });

  it('opens the CSS studio and loads the remote stylesheet', async () => {
    const reactory = createReactoryMock({
      graphqlQuery: jest.fn().mockResolvedValue({
        data: { ReactoryClientGetThemeCss: '/* remote styles */' },
      }),
    });
    renderPanel(reactory);

    fireEvent.click(screen.getAllByTestId('CodeIcon')[0]);

    expect(screen.getByText('CSS Studio: reactory/styles.css')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    await waitFor(() =>
      expect((within(dialog).getByRole('textbox') as HTMLTextAreaElement).value)
        .toBe('/* remote styles */'),
    );
    expect(reactory.graphqlQuery.mock.calls[0][0]).toMatch(/query ReactoryClientGetThemeCss/);
  });

  it('deletes a non-active theme after confirmation', async () => {
    const reactory = createReactoryMock({
      graphqlMutation: jest.fn().mockResolvedValue({
        data: {
          ReactoryClientDeleteTheme: { theme: 'reactory', themes: [themeA] },
        },
      }),
    });
    renderPanel(reactory);

    // Index 1 = `ocean`; the active theme's delete action is disabled.
    fireEvent.click(screen.getAllByTestId('DeleteIcon')[1]);
    expect(screen.getByText('Delete Theme')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => expect(reactory.graphqlMutation).toHaveBeenCalledTimes(1));
    expect(reactory.graphqlMutation.mock.calls[0][0]).toMatch(
      /mutation ReactoryClientDeleteTheme/,
    );
    expect(reactory.graphqlMutation.mock.calls[0][1]).toEqual({
      clientId: 'app-1',
      themeName: 'ocean',
    });
  });
});
