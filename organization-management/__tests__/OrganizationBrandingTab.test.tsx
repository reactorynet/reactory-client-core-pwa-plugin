/**
 * @jest-environment jsdom
 *
 * Branding tab contract (ORG-013).
 *
 * Rendered directly with `OrganizationTabProps`, exactly as the detail shell
 * renders it. The stub SDK dispatches on GraphQL operation names, so these
 * tests assert both the document (operation name / mutation text) and the
 * variables the tab sends — the persistence contract the ticket asks for.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import OrganizationBrandingTab, {
  BRANDING_IMAGE_MAX_BYTES,
  nextThemeName,
  validateBrandingImage,
} from '../OrganizationBrandingTab';
import { ORGANIZATION_UPDATED_EVENT } from '../events';
import { ORGANIZATION_TABS } from '../organizationTabs';
import { makeTranslator } from '../i18n';
import type { OrganizationTabProps } from '../types';
import {
  makeOrganization,
  makeReactory,
  makeTheme,
  mutationCallsFor,
  queryCallsFor,
} from './testFixtures';

afterEach(cleanup);

const acmeThemes = () => [
  makeTheme(),
  makeTheme({ id: 'theme-2', name: 'Ocean', description: 'Ocean brand theme' }),
];

interface SetupOptions {
  canManage?: boolean;
  themes?: ReturnType<typeof makeTheme>[];
  organization?: Partial<ReturnType<typeof makeOrganization>>;
  reactory?: any;
}

const setup = (options: SetupOptions = {}) => {
  const themes = options.themes === undefined ? acmeThemes() : options.themes;
  const organization = makeOrganization({
    themes,
    theme: themes.length > 0 ? themes[0].name : null,
    themeMode: themes.length > 0 ? 'dark' : null,
    ...(options.organization || {}),
  });

  const reactory =
    options.reactory ||
    makeReactory({
      organizations: [organization],
      themeCss: { 'Acme Theme': '/* acme */' },
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

  const utils = render(<OrganizationBrandingTab {...props} />);
  return { ...utils, props, reactory, organization };
};

const fileOf = (name: string, type: string, size?: number): any => {
  const file = new File(['x'], name, { type });
  if (typeof size === 'number') Object.defineProperty(file, 'size', { value: size });
  return file;
};

/**
 * The `emit` calls (eventemitter3 bus) the tab made for `core.OrganizationUpdatedEvent`.
 *
 * Filtering by event name (rather than counting every emit) keeps these
 * assertions honest if the tab ever raises another event: only the update
 * notification is the contract here.
 */
const emitCallsFor = (reactory: any, event = ORGANIZATION_UPDATED_EVENT) =>
  reactory.emit.mock.calls.filter((call: any[]) => call[0] === event);

/**
 * The `amq.$pub.def` calls (postal.js bus) for `core.OrganizationUpdatedEvent`.
 *
 * This is the bus App.tsx actually subscribes on, so an assertion on `emit`
 * alone would pass while the shell never hears the event (ORG-043 review RC-1).
 */
const publishCallsFor = (reactory: any, event = ORGANIZATION_UPDATED_EVENT) =>
  reactory.amq.$pub.def.mock.calls.filter((call: any[]) => call[0] === event);
describe('branding tab wiring', () => {
  it('replaces only the branding registry entry', () => {
    const branding = ORGANIZATION_TABS.find((tab) => tab.id === 'branding');
    const structure = ORGANIZATION_TABS.find((tab) => tab.id === 'structure');

    expect(branding?.component).toBe(OrganizationBrandingTab);
    // ORG-022 has replaced the structure placeholder; branding's entry is
    // unchanged, which is what this assertion pins.
    expect(`${structure?.component.displayName || ''}`).toBe('OrganizationStructureTab');
  });

  it('renders the persisted logo and avatar URLs', async () => {
    const { reactory } = setup({
      organization: {
        logo: 'acme-logo',
        logoURL: 'https://cdn.example/acme-logo.png',
        avatar: 'acme-avatar',
        avatarURL: 'https://cdn.example/acme-avatar.png',
      },
    });

    expect(screen.getByTestId('organization-branding-logo-preview')).toHaveAttribute(
      'src',
      'https://cdn.example/acme-logo.png',
    );
    expect(screen.getByTestId('organization-branding-avatar-preview')).toHaveAttribute(
      'src',
      'https://cdn.example/acme-avatar.png',
    );

    // The branding read is owned by the hook, not by the shell's detail query.
    await waitFor(() =>
      expect(queryCallsFor(reactory, 'OrganizationBranding')).toHaveLength(1),
    );
  });
});

describe('image validation (client-side, before any network call)', () => {
  it('accepts the four allowed MIME types', () => {
    ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].forEach((type) => {
      expect(validateBrandingImage({ type, size: 1024 })).toBeNull();
    });
  });

  it('rejects other MIME types and files over 5 MB', () => {
    expect(validateBrandingImage({ type: 'image/gif', size: 1024 })).toBe(
      'reactory.organizations.branding.image.typeInvalid',
    );
    expect(validateBrandingImage({ type: 'application/pdf', size: 1024 })).toBe(
      'reactory.organizations.branding.image.typeInvalid',
    );
    expect(
      validateBrandingImage({ type: 'image/png', size: BRANDING_IMAGE_MAX_BYTES + 1 }),
    ).toBe('reactory.organizations.branding.image.tooLarge');
    expect(validateBrandingImage({ type: 'image/png', size: BRANDING_IMAGE_MAX_BYTES })).toBeNull();
  });

  it('rejects a wrong-type file without calling the upload mutation', async () => {
    const { props, reactory } = setup();

    const input = screen.getByTestId('organization-branding-logo-input');
    fireEvent.change(input, { target: { files: [fileOf('logo.gif', 'image/gif')] } });

    await waitFor(() => expect(props.notify).toHaveBeenCalled());
    expect(props.notify).toHaveBeenCalledWith(
      'Choose a PNG, JPEG, SVG or WebP image.',
      'error',
    );
    expect(mutationCallsFor(reactory, 'OrganizationUploadImage')).toHaveLength(0);
  });

  it('rejects an oversized file without calling the upload mutation', async () => {
    const { props, reactory } = setup();

    const input = screen.getByTestId('organization-branding-avatar-input');
    fireEvent.change(input, {
      target: { files: [fileOf('avatar.png', 'image/png', BRANDING_IMAGE_MAX_BYTES + 10)] },
    });

    await waitFor(() => expect(props.notify).toHaveBeenCalled());
    expect(props.notify).toHaveBeenCalledWith(
      'The image must be 5 MB or smaller.',
      'error',
    );
    expect(mutationCallsFor(reactory, 'OrganizationUploadImage')).toHaveLength(0);
  });

  it('uploads a valid logo and renders the returned URL', async () => {
    const { props, reactory } = setup();

    const file = fileOf('logo.png', 'image/png');
    fireEvent.change(screen.getByTestId('organization-branding-logo-input'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'OrganizationUploadImage')).toHaveLength(1),
    );

    const [call] = mutationCallsFor(reactory, 'OrganizationUploadImage');
    expect(call[0]).toContain('mutation OrganizationUploadImage');
    // `toBe` rather than a deep match: jest's structural equality walks the
    // jsdom File/Blob internals and never terminates, so the File is asserted
    // by identity and the surrounding variables explicitly.
    expect(call[1].id).toBe('org-1');
    expect(call[1].imageType).toBe('logo');
    expect(call[1].file).toBe(file);
    await waitFor(() =>
      expect(screen.getByTestId('organization-branding-logo-preview')).toHaveAttribute(
        'src',
        'https://cdn.example/uploaded-logo',
      ),
    );
    expect(props.notify).toHaveBeenCalledWith('Logo updated.', 'success');
    expect(props.refresh).toHaveBeenCalled();
  });

  it('removing the logo clears the field with updateOrganization({ logo: null })', async () => {
    const { props, reactory } = setup({
      organization: { logo: 'acme-logo', logoURL: 'https://cdn.example/acme-logo.png' },
    });

    const slot = screen.getByTestId('organization-branding-logo-slot');
    fireEvent.click(within(slot).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(1),
    );

    const [call] = mutationCallsFor(reactory, 'updateOrganization');
    expect(call[1]).toEqual({ id: 'org-1', input: { logo: null } });
    expect(props.notify).toHaveBeenCalledWith('Logo removed.', 'success');
    expect(props.refresh).toHaveBeenCalled();
  });
});

describe('theme inheritance', () => {
  it('clears the theme pointer when inheriting the client theme', async () => {
    const { props, reactory } = setup();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Inherit client theme' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(1),
    );

    const [call] = mutationCallsFor(reactory, 'updateOrganization');
    expect(call[1]).toEqual({ id: 'org-1', input: { theme: null, themeMode: null } });

    await waitFor(() =>
      expect(screen.getByTestId('organization-branding-effective-theme')).toHaveTextContent(
        'Effective theme: Client theme',
      ),
    );
    expect(props.notify).toHaveBeenCalledWith(
      'This organization now inherits the client theme.',
      'success',
    );
  });

  it('refuses to leave the client theme when the organization owns no themes', async () => {
    const { props, reactory } = setup({ themes: [], organization: { theme: null } });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Inherit client theme' }));

    await waitFor(() => expect(props.notify).toHaveBeenCalled());
    expect(props.notify).toHaveBeenCalledWith(
      'Create a theme for this organization before leaving the client theme.',
      'warning',
    );
    expect(mutationCallsFor(reactory, 'OrganizationSetActiveTheme')).toHaveLength(0);
    expect(mutationCallsFor(reactory, 'updateOrganization')).toHaveLength(0);
  });

  it('activating a theme persists the pointer and mode', async () => {
    const { props, reactory } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Activate Ocean' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'OrganizationSetActiveTheme')).toHaveLength(1),
    );

    const [call] = mutationCallsFor(reactory, 'OrganizationSetActiveTheme');
    expect(call[0]).toContain('mutation OrganizationSetActiveTheme');
    expect(call[1]).toEqual({ id: 'org-1', themeName: 'Ocean', mode: 'dark' });

    await waitFor(() =>
      expect(screen.getByTestId('organization-branding-effective-theme')).toHaveTextContent(
        'Ocean',
      ),
    );
    expect(props.notify).toHaveBeenCalledWith('Ocean is now the active theme.', 'success');
  });
});

describe('theme lifecycle', () => {
  it('creates a theme through the shared editor and saves it', async () => {
    const { props, reactory } = setup();

    expect(nextThemeName(acmeThemes())).toBe('theme-1');

    fireEvent.click(screen.getByRole('button', { name: 'New theme' }));
    expect(props.onUnsavedChanges).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'OrganizationSaveTheme')).toHaveLength(1),
    );

    const [call] = mutationCallsFor(reactory, 'OrganizationSaveTheme');
    expect(call[0]).toContain('mutation OrganizationSaveTheme');
    expect(call[1]).toMatchObject({
      id: 'org-1',
      theme: {
        name: 'theme-1',
        nameSpace: 'reactory',
        type: 'material',
        defaultThemeMode: 'dark',
      },
    });

    // The editor's payload went through `buildThemePayload`: modes are
    // normalised and the components override survives.
    expect((call[1].theme.modes || []).map((mode: any) => mode.mode)).toEqual(['dark', 'light']);

    await waitFor(() =>
      expect(screen.getByTestId('organization-branding-theme-theme-1')).toBeInTheDocument(),
    );
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(false);
    expect(props.notify).toHaveBeenCalledWith('Theme “theme-1” saved.', 'success');
    expect(props.refresh).toHaveBeenCalled();
  });

  it('keeps the draft (and the dirty flag) when the save fails', async () => {
    const reactory = makeReactory({
      organizations: [
        makeOrganization({ themes: acmeThemes(), theme: 'Acme Theme', themeMode: 'dark' }),
      ],
      mutationImpl: (operation) =>
        operation === 'OrganizationSaveTheme'
          ? { data: null, errors: [{ message: 'Theme name already exists' }] }
          : undefined,
    });

    const { props } = setup({ reactory });

    fireEvent.click(screen.getByRole('button', { name: 'New theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    await waitFor(() => expect(props.notify).toHaveBeenCalledWith(
      'Theme name already exists',
      'error',
    ));

    // The editor is still open with the draft, so the shell must keep guarding.
    expect(screen.getByRole('button', { name: 'Save theme' })).toBeInTheDocument();
    expect(props.onUnsavedChanges).toHaveBeenLastCalledWith(true);
  });

  it('deleting the active theme renders the server fallback pointer', async () => {
    const { props, reactory } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Acme Theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete theme' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'OrganizationDeleteTheme')).toHaveLength(1),
    );

    const [call] = mutationCallsFor(reactory, 'OrganizationDeleteTheme');
    expect(call[0]).toContain('mutation OrganizationDeleteTheme');
    expect(call[1]).toEqual({ id: 'org-1', themeName: 'Acme Theme' });

    // The stub mirrors the server: the first remaining theme becomes active.
    await waitFor(() =>
      expect(screen.getByTestId('organization-branding-effective-theme')).toHaveTextContent(
        'Ocean',
      ),
    );
    expect(screen.queryByTestId('organization-branding-theme-Acme Theme')).toBeNull();
    expect(props.notify).toHaveBeenCalledWith('Theme “Acme Theme” deleted.', 'success');
    expect(props.refresh).toHaveBeenCalled();
  });

  it('loads and publishes CSS through the CSS studio', async () => {
    const { props, reactory } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Edit CSS for Acme Theme' }));

    await waitFor(() =>
      expect(queryCallsFor(reactory, 'OrganizationThemeCss')).toHaveLength(1),
    );
    expect(queryCallsFor(reactory, 'OrganizationThemeCss')[0][1]).toEqual({
      themeName: 'Acme Theme',
    });
    await waitFor(() => expect(screen.getByDisplayValue('/* acme */')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Publish CSS to Theme Directory' }));

    await waitFor(() =>
      expect(mutationCallsFor(reactory, 'OrganizationPublishThemeCss')).toHaveLength(1),
    );
    const [call] = mutationCallsFor(reactory, 'OrganizationPublishThemeCss');
    expect(call[0]).toContain('mutation OrganizationPublishThemeCss');
    expect(call[1]).toEqual({ id: 'org-1', themeName: 'Acme Theme', css: '/* acme */' });

    expect(props.notify).toHaveBeenCalledWith('CSS for Acme Theme published.', 'success');
    expect(props.refresh).toHaveBeenCalled();
  });
});

describe('organization updated event (ORG-043)', () => {
  /**
   * ORG-014's acceptance criterion is "apply on theme change": saving branding
   * must make the admin's own shell re-resolve the theme without a reload.
   *
   * The shell carries **two independent buses** (review RC-1): `reactory.emit`
   * is eventemitter3 (what `MaterialTableWidget`'s refreshEvents listen on) and
   * `amq.$pub.def` is postal.js (what `App.tsx` subscribes on). Every test here
   * asserts both, because satisfying only the emitter is exactly the defect
   * this ticket was raised for.
   *
   * One notification per mutation — never one per field change, and never on
   * failure.
   */
  it('emits the saved organization once after a successful theme save', async () => {
    const { props, reactory } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'New theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Theme “theme-1” saved.', 'success'),
    );

    const calls = emitCallsFor(reactory);
    expect(calls).toHaveLength(1);
    const [event, payload] = calls[0];
    expect(event).toBe(ORGANIZATION_UPDATED_EVENT);
    // The payload is the organization the mutation returned, not the tab's
    // local draft: the new theme is already on it.
    expect(payload.id).toBe('org-1');
    expect((payload.themes || []).map((theme: any) => theme.name)).toContain('theme-1');

    // The postal publish App.tsx listens on: (event, organization, channel).
    const published = publishCallsFor(reactory);
    expect(published).toHaveLength(1);
    expect(published[0]).toHaveLength(3);
    expect(published[0][0]).toBe(ORGANIZATION_UPDATED_EVENT);
    expect(published[0][1]).toBe(payload);
    expect(published[0][2]).toBe(ORGANIZATION_UPDATED_EVENT);

    expect(reactory.emit).toHaveBeenCalledTimes(1);
    expect(reactory.amq.$pub.def).toHaveBeenCalledTimes(1);
  });

  it('does not notify once per field change, only once per save', async () => {
    // A save writes the whole theme payload at once, but the editor emits a
    // change for every keystroke and every option. A per-field implementation
    // would still pass a "New theme -> Save" test that never types anything, so
    // this one edits several fields and holds the count at zero until Save.
    const { props, reactory } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'New theme' }));
    expect(emitCallsFor(reactory)).toHaveLength(0);
    expect(publishCallsFor(reactory)).toHaveLength(0);

    const title = screen.getByLabelText('Application Title');
    fireEvent.change(title, { target: { value: 'A' } });
    fireEvent.change(title, { target: { value: 'Acme Portal' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited while the editor is open' },
    });

    // Editing is not a mutation: nothing is announced yet.
    expect(emitCallsFor(reactory)).toHaveLength(0);
    expect(publishCallsFor(reactory)).toHaveLength(0);
    expect(props.refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    await waitFor(() => expect(emitCallsFor(reactory)).toHaveLength(1));
    expect(publishCallsFor(reactory)).toHaveLength(1);
    expect(emitCallsFor(reactory)).toHaveLength(1);
    expect(reactory.emit).toHaveBeenCalledTimes(1);
    expect(reactory.amq.$pub.def).toHaveBeenCalledTimes(1);
    // The edited fields travelled with the saved payload, so the notification
    // describes the record the server acknowledged rather than the draft.
    const savedTheme = (emitCallsFor(reactory)[0][1].themes || [])
      .find((theme: any) => theme.name === 'theme-1');
    expect(savedTheme.content.appTitle).toBe('Acme Portal');
    expect(savedTheme.description).toBe('Edited while the editor is open');
  });

  it('emits the returned organization after activating a theme', async () => {
    const { reactory } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Activate Ocean' }));

    await waitFor(() => expect(emitCallsFor(reactory)).toHaveLength(1));
    await waitFor(() => expect(publishCallsFor(reactory)).toHaveLength(1));

    const [event, payload] = emitCallsFor(reactory)[0];
    expect(event).toBe(ORGANIZATION_UPDATED_EVENT);
    expect(payload.id).toBe('org-1');
    expect(payload.theme).toBe('Ocean');

    expect(publishCallsFor(reactory)[0][1]).toBe(payload);
    expect(reactory.emit).toHaveBeenCalledTimes(1);
    expect(reactory.amq.$pub.def).toHaveBeenCalledTimes(1);
  });

  it('emits the returned organization after deleting a theme', async () => {
    const { reactory } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Acme Theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete theme' }));

    await waitFor(() => expect(emitCallsFor(reactory)).toHaveLength(1));
    await waitFor(() => expect(publishCallsFor(reactory)).toHaveLength(1));

    const [event, payload] = emitCallsFor(reactory)[0];
    expect(event).toBe(ORGANIZATION_UPDATED_EVENT);
    expect(payload.id).toBe('org-1');
    // The server's deterministic fallback pointer is what the shell re-resolves
    // against, so the emitted record must carry it.
    expect(payload.theme).toBe('Ocean');
    expect((payload.themes || []).map((theme: any) => theme.name)).not.toContain('Acme Theme');
    expect(publishCallsFor(reactory)[0][1]).toBe(payload);
    expect(reactory.emit).toHaveBeenCalledTimes(1);
    expect(reactory.amq.$pub.def).toHaveBeenCalledTimes(1);
  });

  it('emits the returned organization after a logo upload', async () => {
    const { reactory } = setup();

    fireEvent.change(screen.getByTestId('organization-branding-logo-input'), {
      target: { files: [fileOf('logo.png', 'image/png')] },
    });

    await waitFor(() => expect(emitCallsFor(reactory)).toHaveLength(1));
    await waitFor(() => expect(publishCallsFor(reactory)).toHaveLength(1));

    const [event, payload] = emitCallsFor(reactory)[0];
    expect(event).toBe(ORGANIZATION_UPDATED_EVENT);
    expect(payload.id).toBe('org-1');
    expect(payload.logoURL).toBe('https://cdn.example/uploaded-logo');
    expect(publishCallsFor(reactory)[0][1]).toBe(payload);
    expect(reactory.emit).toHaveBeenCalledTimes(1);
    expect(reactory.amq.$pub.def).toHaveBeenCalledTimes(1);
  });

  it('emits the returned organization after a logo removal', async () => {
    const { reactory } = setup({
      organization: { logo: 'acme-logo', logoURL: 'https://cdn.example/acme-logo.png' },
    });

    const slot = screen.getByTestId('organization-branding-logo-slot');
    fireEvent.click(within(slot).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(emitCallsFor(reactory)).toHaveLength(1));
    await waitFor(() => expect(publishCallsFor(reactory)).toHaveLength(1));

    const [event, payload] = emitCallsFor(reactory)[0];
    expect(event).toBe(ORGANIZATION_UPDATED_EVENT);
    expect(payload.id).toBe('org-1');
    expect(payload.logo).toBeNull();
    expect(publishCallsFor(reactory)[0][1]).toBe(payload);
    expect(reactory.emit).toHaveBeenCalledTimes(1);
    expect(reactory.amq.$pub.def).toHaveBeenCalledTimes(1);
  });

  it('emits when the organization switches back to the client theme', async () => {
    const { reactory } = setup();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Inherit client theme' }));

    await waitFor(() => expect(emitCallsFor(reactory)).toHaveLength(1));
    await waitFor(() => expect(publishCallsFor(reactory)).toHaveLength(1));

    const [, payload] = emitCallsFor(reactory)[0];
    expect(payload.id).toBe('org-1');
    expect(payload.theme).toBeNull();
    expect(payload.themeMode).toBeNull();
    expect(publishCallsFor(reactory)[0][1]).toBe(payload);
  });

  it('emits nothing when the save fails', async () => {
    const reactory = makeReactory({
      organizations: [
        makeOrganization({ themes: acmeThemes(), theme: 'Acme Theme', themeMode: 'dark' }),
      ],
      mutationImpl: (operation) =>
        operation === 'OrganizationSaveTheme'
          ? { data: null, errors: [{ message: 'Theme name already exists' }] }
          : undefined,
    });

    const { props } = setup({ reactory });

    fireEvent.click(screen.getByRole('button', { name: 'New theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Theme name already exists', 'error'),
    );

    // A failed mutation must not make the shell re-resolve: notifying here (for
    // example from a `finally`) would report branding that was never stored.
    expect(emitCallsFor(reactory)).toHaveLength(0);
    expect(publishCallsFor(reactory)).toHaveLength(0);
    expect(reactory.emit).not.toHaveBeenCalled();
    expect(reactory.amq.$pub.def).not.toHaveBeenCalled();
  });

  it('emits nothing when activating a theme fails', async () => {
    const reactory = makeReactory({
      organizations: [
        makeOrganization({ themes: acmeThemes(), theme: 'Acme Theme', themeMode: 'dark' }),
      ],
      mutationImpl: (operation) =>
        operation === 'OrganizationSetActiveTheme'
          ? { data: null, errors: [{ message: 'Theme is not available' }] }
          : undefined,
    });

    const { props } = setup({ reactory });

    fireEvent.click(screen.getByRole('button', { name: 'Activate Ocean' }));

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Theme is not available', 'error'),
    );
    expect(emitCallsFor(reactory)).toHaveLength(0);
    expect(publishCallsFor(reactory)).toHaveLength(0);
  });

  it('emits nothing when deleting a theme fails', async () => {
    const reactory = makeReactory({
      organizations: [
        makeOrganization({ themes: acmeThemes(), theme: 'Acme Theme', themeMode: 'dark' }),
      ],
      mutationImpl: (operation) =>
        operation === 'OrganizationDeleteTheme'
          ? { data: null, errors: [{ message: 'Theme is in use' }] }
          : undefined,
    });

    const { props } = setup({ reactory });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Acme Theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete theme' }));

    await waitFor(() => expect(props.notify).toHaveBeenCalledWith('Theme is in use', 'error'));
    expect(emitCallsFor(reactory)).toHaveLength(0);
    expect(publishCallsFor(reactory)).toHaveLength(0);
  });

  it('emits nothing when an image upload fails', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ themes: acmeThemes() })],
      mutationImpl: (operation) =>
        operation === 'OrganizationUploadImage'
          ? { data: null, errors: [{ message: 'Image could not be stored' }] }
          : undefined,
    });

    const { props } = setup({ reactory });

    fireEvent.change(screen.getByTestId('organization-branding-logo-input'), {
      target: { files: [fileOf('logo.png', 'image/png')] },
    });

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Image could not be stored', 'error'),
    );
    expect(emitCallsFor(reactory)).toHaveLength(0);
    expect(publishCallsFor(reactory)).toHaveLength(0);
  });

  it('emits nothing when an image removal fails', async () => {
    const reactory = makeReactory({
      organizations: [
        makeOrganization({
          themes: acmeThemes(),
          logo: 'acme-logo',
          logoURL: 'https://cdn.example/acme-logo.png',
        }),
      ],
      mutationImpl: (operation) =>
        operation === 'updateOrganization'
          ? { data: null, errors: [{ message: 'Organization is locked' }] }
          : undefined,
    });

    const { props } = setup({
      reactory,
      // The Remove button renders from the organization the shell passes down;
      // the stub's state alone is only visible after the branding read lands.
      organization: { logo: 'acme-logo', logoURL: 'https://cdn.example/acme-logo.png' },
    });

    const slot = screen.getByTestId('organization-branding-logo-slot');
    fireEvent.click(within(slot).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith('Organization is locked', 'error'),
    );
    expect(emitCallsFor(reactory)).toHaveLength(0);
    expect(publishCallsFor(reactory)).toHaveLength(0);
  });
});

describe('read-only rendering', () => {
  it('renders no write controls and no Save when canManage is false', () => {
    setup({ canManage: false });

    expect(screen.getByTestId('organization-branding-readonly')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Acme Theme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Acme Theme' })).toBeNull();

    // The theme list stays visible for a reader.
    expect(screen.getByTestId('organization-branding-theme-Acme Theme')).toBeInTheDocument();
  });
});
