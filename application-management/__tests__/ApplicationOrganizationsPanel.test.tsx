/**
 * @jest-environment jsdom
 *
 * Application organizations panel contract (ORG-042b).
 *
 * The panel used to be a shim: it resolved `core.ApplicationOrganizations@1.0.0`
 * (the server form) and rendered it, which is why ORG-042 could not delete the
 * server form. ORG-042b makes it a real surface — a thin container over
 * `OrganizationListPanel` + `OrganizationDetailPanel` from
 * `organization-management` — with the detail opening *in place* at both call
 * sites (the application dashboard `organizations` tab and the legacy
 * `/organizations/` route).
 *
 * These tests pin the replacement: no registry lookup, list data from the
 * organization documents, in-place detail with no navigation, a way back, and
 * the tolerated `applicationId`/`mode` props that must not become a filter.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ApplicationOrganizationsPanel from '../ApplicationOrganizationsPanel';
import {
  activeOrganizations,
  makeReactory,
  queryCallsFor,
} from '../../organization-management/__tests__/testFixtures';

/** The FQN the shim used to resolve. It must never be asked for again. */
const SHIM_FQN = 'core.ApplicationOrganizations@1.0.0';

/**
 * Let the panels' follow-up work land inside `act`.
 *
 * The list read, the per-page statistics hydration and (after a selection) the
 * detail read all resolve immediately against the stub; without an act-scoped
 * flush those `setState` calls land after the assertion that prompted them.
 */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

/**
 * Mount the panel and flush its first load inside `act`.
 *
 * Mirrors `OrganizationListPanel.test.tsx`: microtasks settle the list read, the
 * macrotask lets the statistics effect scheduled after that commit run, and a
 * second microtask flush catches its resolution.
 */
const renderPanel = async (
  reactory: any,
  props: Partial<React.ComponentProps<typeof ApplicationOrganizationsPanel>> = {},
) => {
  let view: ReturnType<typeof render> | undefined;
  await act(async () => {
    view = render(<ApplicationOrganizationsPanel reactory={reactory} {...props} />);
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
  return view as ReturnType<typeof render>;
};

/**
 * A stub whose component registry fails loudly if it is consulted at all.
 *
 * This is the structural form of "the shim is gone": a regression cannot quietly
 * render the server form, it throws.
 */
const withComponentRegistry = (options: Parameters<typeof makeReactory>[0] = {}) => {
  const getComponent = jest.fn((fqn: string) => {
    throw new Error(`ApplicationOrganizationsPanel resolved a component from the registry: ${fqn}`);
  });

  return { reactory: Object.assign(makeReactory(options), { getComponent }), getComponent };
};

afterEach(async () => {
  // Flush anything still in flight before unmount so the update lands inside act.
  await settle();
  cleanup();
});

describe('ApplicationOrganizationsPanel — real list, no shim', () => {
  it('renders the organization list without touching the component registry', async () => {
    const { reactory } = withComponentRegistry({ organizations: activeOrganizations() });

    await renderPanel(reactory);

    expect(await screen.findByText('Acme Holdings')).toBeInTheDocument();
    expect(screen.getByText('Beta Industries')).toBeInTheDocument();

    // The old delegation is gone — not merely tolerant of a missing entry.
    expect(reactory.getComponent).not.toHaveBeenCalled();
    expect(reactory.getComponent).not.toHaveBeenCalledWith(SHIM_FQN);
  });

  it('renders the list even when the registry would answer with the core form', async () => {
    const CoreForm = jest.fn(() => <div data-testid="core-organizations-form" />);
    const getComponent = jest.fn(() => CoreForm);
    const reactory = Object.assign(makeReactory({ organizations: activeOrganizations() }), {
      getComponent,
    });

    await renderPanel(reactory);

    expect(await screen.findByText('Acme Holdings')).toBeInTheDocument();
    expect(screen.queryByTestId('core-organizations-form')).not.toBeInTheDocument();
    expect(getComponent).not.toHaveBeenCalled();
    expect(CoreForm).not.toHaveBeenCalled();
  });

  it('has no "is not loaded" branch left to hit', async () => {
    const { reactory } = withComponentRegistry({ organizations: activeOrganizations() });

    await renderPanel(reactory);

    expect(await screen.findByText('Acme Holdings')).toBeInTheDocument();
    expect(screen.queryByText(/is not loaded/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/core\.ApplicationOrganizations/i)).not.toBeInTheDocument();
  });

  it('reads its data from the organization-management documents', async () => {
    const { reactory } = withComponentRegistry({ organizations: activeOrganizations() });

    await renderPanel(reactory);

    await screen.findByText('Acme Holdings');

    const listCalls = queryCallsFor(reactory, 'CoreOrganizations');
    expect(listCalls.length).toBeGreaterThan(0);
    expect(String(listCalls[0][0])).toContain('CoreOrganizations');

    // Same access path as the manage surface: the search term, nothing else.
    expect(listCalls[0][1]).toEqual({ search: null });
  });
});

describe('ApplicationOrganizationsPanel — in-place detail', () => {
  it('opens the detail panel in place and never navigates', async () => {
    const { reactory } = withComponentRegistry({ organizations: activeOrganizations() });

    await renderPanel(reactory);
    await screen.findByText('Acme Holdings');

    await userEvent.click(screen.getByRole('button', { name: 'Open Acme Holdings' }));

    // The detail shell, mounted inside the panel rather than behind a route.
    expect(await screen.findByRole('heading', { name: 'Acme Holdings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();

    // The list is replaced in place; the row affordances are gone.
    expect(screen.queryByRole('button', { name: 'Open Beta Industries' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New organization' })).not.toBeInTheDocument();

    // No route is involved anywhere in the flow.
    expect(reactory.navigation).not.toHaveBeenCalled();

    // And the detail was read through the organization-management document.
    const detailCalls = queryCallsFor(reactory, 'CoreOrganization');
    expect(detailCalls.length).toBeGreaterThan(0);
    expect(detailCalls[0][1]).toEqual({ id: 'org-1' });
  });

  it('returns to the list from the detail affordance without navigating', async () => {
    const { reactory } = withComponentRegistry({ organizations: activeOrganizations() });

    await renderPanel(reactory);
    await userEvent.click(await screen.findByRole('button', { name: 'Open Acme Holdings' }));
    await screen.findByRole('heading', { name: 'Acme Holdings' });

    await userEvent.click(screen.getByRole('button', { name: 'Back to organizations' }));

    // The list is back, in place.
    expect(await screen.findByRole('button', { name: 'Open Acme Holdings' })).toBeInTheDocument();
    expect(screen.getByText('Beta Industries')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument();

    expect(reactory.navigation).not.toHaveBeenCalled();
  });
});

describe('ApplicationOrganizationsPanel — tolerated host props', () => {
  it('accepts applicationId and mode without throwing and without filtering on them', async () => {
    const { reactory } = withComponentRegistry({ organizations: activeOrganizations() });

    await renderPanel(reactory, { applicationId: 'app-42', mode: 'edit' });

    // The full data set is rendered: no application-scoped narrowing.
    expect(await screen.findByText('Acme Holdings')).toBeInTheDocument();
    expect(screen.getByText('Beta Industries')).toBeInTheDocument();

    const listCalls = queryCallsFor(reactory, 'CoreOrganizations');
    expect(listCalls.length).toBeGreaterThan(0);
    expect(listCalls[0][1]).toEqual({ search: null });

    // The id is carried on the host element, never into a query.
    expect(document.querySelector('[data-application-id="app-42"]')).not.toBeNull();
    expect(
      JSON.stringify(listCalls.map((call: any[]) => call[1] || {})),
    ).not.toContain('app-42');
  });

  it('accepts the view mode used by the dashboard tab', async () => {
    const { reactory } = withComponentRegistry({ organizations: activeOrganizations() });

    await renderPanel(reactory, { applicationId: 'app-42', mode: 'view' });

    expect(await screen.findByText('Acme Holdings')).toBeInTheDocument();
  });
});

describe('ApplicationOrganizationsPanel — source guards', () => {
  const read = (file: string): string =>
    readFileSync(join(__dirname, '..', file), 'utf8');

  it('no longer references the core form or the registry', () => {
    const source = read('ApplicationOrganizationsPanel.tsx');

    expect(source).not.toContain('getComponent');
    // The prose above may *name* the FQN when explaining what was removed; a
    // quoted literal is what a registry lookup would need.
    expect(source).not.toMatch(/['"]core\.ApplicationOrganizations@/);
    expect(source).not.toContain('is not loaded');
  });

  it('registers no core.* alias for the panel', () => {
    const source = read('index.ts');

    expect(source).not.toMatch(/nameSpace:\s*['"]core['"]/);
    expect(source).not.toMatch(/['"]core\.ApplicationOrganizations/);
  });
});
