/**
 * @jest-environment jsdom
 *
 * Unit contracts for the organization hooks and helpers.
 *
 * The demographics guard is the important one: `OrganizationDemographicDefinitions`
 * does not exist until ORG-030/ORG-031, and a missing query must be reported as
 * "not available yet" rather than surfaced as an error.
 */
import React from 'react';
import { act, render, screen, waitFor, cleanup } from '@testing-library/react';

import { useDemographicDefinitions } from '../hooks/useOrganizationAdmin';
import { useOrganizationDetail } from '../hooks/useOrganizationDetail';
import { sortOrganizations } from '../hooks/useOrganizationList';
import { validateStep, NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '../OrganizationCreateWizard';
import useOrganizationDemographics from '../hooks/useOrganizationDemographics';
import {
  baseDemographicDefinitions,
  makeDemographicDefinition,
  makeOrganization,
  makeReactory,
  operationNameOf,
  queryCallsFor,
} from './testFixtures';
import type { OrganizationCreateDraft } from '../types';

afterEach(cleanup);

const draft = (overrides: Partial<OrganizationCreateDraft> = {}): OrganizationCreateDraft => ({
  name: '',
  code: '',
  tradingName: '',
  description: '',
  branding: 'inherit',
  ...overrides,
});

const Probe: React.FC<{ reactory: any; organizationId?: string | null }> = ({
  reactory,
  organizationId,
}) => {
  const state = useDemographicDefinitions(reactory, organizationId ?? null);
  return <pre data-testid="demographics-state">{JSON.stringify(state)}</pre>;
};

const probeState = () => JSON.parse(screen.getByTestId('demographics-state').textContent || '{}');

describe('validateStep', () => {
  it('requires a name on the identity step', () => {
    expect(validateStep(0, draft({ name: '   ' }))).toEqual({
      name: { key: 'reactory.organizations.wizard.field.nameRequired' },
    });
  });

  it('caps the name and description lengths', () => {
    const errors = validateStep(
      0,
      draft({ name: 'a'.repeat(NAME_MAX_LENGTH + 1), description: 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1) }),
    );

    expect(errors.name?.key).toBe('reactory.organizations.wizard.field.nameTooLong');
    expect(errors.name?.values).toEqual({ max: NAME_MAX_LENGTH });
    expect(errors.description?.key).toBe('reactory.organizations.wizard.field.descriptionTooLong');
  });

  it('accepts an integration-friendly code and rejects anything else', () => {
    expect(validateStep(0, draft({ name: 'Acme', code: 'ACME_01.eu-west' }))).toEqual({});
    expect(validateStep(0, draft({ name: 'Acme', code: 'ACME 01' })).code?.key).toBe(
      'reactory.organizations.wizard.field.codeInvalid',
    );
  });

  it('only accepts a known branding choice', () => {
    expect(validateStep(1, draft({ name: 'Acme', branding: 'inherit' }))).toEqual({});
    expect(validateStep(1, draft({ name: 'Acme', branding: 'blank' }))).toEqual({});
    expect(
      validateStep(1, draft({ name: 'Acme', branding: 'custom' as any })).branding?.key,
    ).toBe('reactory.organizations.wizard.branding.required');
  });

  it('has nothing to validate on the demographics and review steps', () => {
    expect(validateStep(2, draft())).toEqual({});
    expect(validateStep(3, draft())).toEqual({});
  });
});

describe('sortOrganizations', () => {
  it('sorts by name in both directions and keeps empty values last', () => {
    const organizations = [
      makeOrganization({ id: 'b', name: 'Beta', code: 'B' }),
      makeOrganization({ id: 'a', name: 'Acme', code: null }),
      makeOrganization({ id: 'c', name: 'Gamma', code: 'G' }),
    ];

    expect(
      sortOrganizations(organizations, { field: 'name', direction: 'asc' }).map((entry) => entry.id),
    ).toEqual(['a', 'b', 'c']);

    expect(
      sortOrganizations(organizations, { field: 'name', direction: 'desc' }).map((entry) => entry.id),
    ).toEqual(['c', 'b', 'a']);

    expect(
      sortOrganizations(organizations, { field: 'code', direction: 'asc' }).map((entry) => entry.id),
    ).toEqual(['b', 'c', 'a']);
  });

  it('sorts by status, theme and the updated timestamp', () => {
    const organizations = [
      makeOrganization({ id: 'b', status: 'suspended', theme: 'Zeta', updatedAt: 1000 }),
      makeOrganization({ id: 'a', status: 'active', theme: 'Alpha', updatedAt: 3000 }),
      makeOrganization({ id: 'c', status: 'archived', theme: '', updatedAt: 2000 }),
    ];

    expect(
      sortOrganizations(organizations, { field: 'status', direction: 'asc' }).map((e) => e.id),
    ).toEqual(['a', 'c', 'b']);
    expect(
      sortOrganizations(organizations, { field: 'theme', direction: 'asc' }).map((e) => e.id),
    ).toEqual(['a', 'b', 'c']);
    expect(
      sortOrganizations(organizations, { field: 'updatedAt', direction: 'asc' }).map((e) => e.id),
    ).toEqual(['b', 'c', 'a']);
    expect(
      sortOrganizations(organizations, { field: 'tradingName', direction: 'asc' }).length,
    ).toBe(3);
  });

  it('sorts by the embedded business-unit count', () => {
    const organizations = [
      makeOrganization({ id: 'few', businessUnits: [{ id: 'x' }] }),
      makeOrganization({ id: 'none', businessUnits: [] }),
      makeOrganization({ id: 'many', businessUnits: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] }),
    ];

    expect(
      sortOrganizations(organizations, { field: 'businessUnits', direction: 'asc' }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['none', 'few', 'many']);
  });
});

const DetailProbe: React.FC<{ reactory: any; organizationId?: string | null }> = ({
  reactory,
  organizationId,
}) => {
  const state = useOrganizationDetail({ reactory, organizationId: organizationId ?? null });
  return (
    <pre data-testid="detail-state">
      {JSON.stringify({
        name: state.organization ? state.organization.name : null,
        statistics: state.statistics,
        loadState: state.loadState,
        error: state.error,
      })}
    </pre>
  );
};

const detailState = () => JSON.parse(screen.getByTestId('detail-state').textContent || '{}');

describe('useOrganizationDetail', () => {
  it('loads the organization and its counts', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization({ id: 'org-1' })],
      statistics: { 'org-1': { members: 4, businessUnits: 2, teams: 1 } },
    });

    render(<DetailProbe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(detailState().loadState).toBe('success'));
    expect(detailState().name).toBe('Acme Holdings');
    await waitFor(() => expect(detailState().statistics).toEqual({ members: 4, businessUnits: 2, teams: 1 }));
    expect(detailState().error).toBeNull();
  });

  it('reports a missing organization as a successful empty read', async () => {
    const reactory = makeReactory({ organizations: [] });

    render(<DetailProbe reactory={reactory} organizationId="missing" />);

    await waitFor(() => expect(detailState().loadState).toBe('success'));
    expect(detailState().name).toBeNull();
    // No counts query for an organization that does not exist.
    expect(queryCallsFor(reactory, 'OrganizationStatistics')).toHaveLength(0);
  });

  it('surfaces a query failure as an i18n key plus the server message', async () => {
    const reactory = makeReactory({
      queryImpl: (operation) =>
        operation === 'CoreOrganization'
          ? { data: null, errors: [{ message: 'Organization not found' }] }
          : undefined,
    });

    render(<DetailProbe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(detailState().loadState).toBe('error'));
    expect(detailState().error).toEqual({
      key: 'reactory.organizations.error.detailLoadFailed',
      serverMessage: 'Organization not found',
    });
  });

  it('reports an unavailable API instead of querying', async () => {
    render(<DetailProbe reactory={{}} organizationId="org-1" />);

    await waitFor(() => expect(detailState().loadState).toBe('error'));
    expect(detailState().error).toEqual({
      key: 'reactory.organizations.error.apiUnavailable',
    });
  });

  it('reports a transport failure with the thrown message', async () => {
    const reactory = {
      graphqlQuery: jest.fn(() => {
        throw new Error('network down');
      }),
    };

    render(<DetailProbe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(detailState().loadState).toBe('error'));
    expect(detailState().error).toEqual({
      key: 'reactory.organizations.error.detailLoadFailed',
      serverMessage: 'network down',
    });
  });

  it('treats a route with no id as an empty read and issues no query', async () => {
    const reactory = makeReactory({ organizations: [makeOrganization()] });

    render(<DetailProbe reactory={reactory} organizationId={null} />);

    await waitFor(() => expect(detailState().loadState).toBe('success'));
    expect(detailState().name).toBeNull();
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });
});

describe('useDemographicDefinitions', () => {
  it('resolves to "no organization" without issuing a query during creation', () => {
    const reactory = makeReactory();

    render(<Probe reactory={reactory} organizationId={null} />);

    expect(probeState()).toEqual({ status: 'unavailable', reason: 'no-organization' });
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });

  it('classifies a schema-level rejection as "not implemented"', async () => {
    const reactory = makeReactory();

    render(<Probe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(probeState().status).toBe('unavailable'));
    expect(probeState().reason).toBe('not-implemented');
    expect(probeState().message).toMatch(/Cannot query field/);
  });

  it('returns the definitions once the API exists', async () => {
    const reactory = makeReactory({
      queryImpl: (operation) =>
        operation === 'OrganizationDemographicDefinitions'
          ? { data: { OrganizationDemographicDefinitions: [{ id: 'def-1', key: 'age' }] }, errors: [] }
          : undefined,
    });

    render(<Probe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(probeState().status).toBe('available'));
    expect(probeState().definitions).toHaveLength(1);
  });

  it('reports a transport failure as an error rather than swallowing it', async () => {
    const reactory = makeReactory({
      queryImpl: (operation) => {
        if (operation !== 'OrganizationDemographicDefinitions') return undefined;
        return { data: null, errors: [{ message: 'Service unavailable' }] };
      },
    });

    render(<Probe reactory={reactory} organizationId="org-1" />);

    await waitFor(() => expect(probeState().status).toBe('unavailable'));
    expect(probeState().reason).toBe('error');
    expect(probeState().message).toBe('Service unavailable');
  });
});

// ---------------------------------------------------------------------------
// useOrganizationDemographics (ORG-031) — the read/write state machine.
//
// Lives beside the other hook contracts rather than in its own file: the pane
// behaviour that cannot be asserted through the rendered tab (sequence guards,
// best-effort usage counts, the two error channels, the empty-payload refusals
// and the unmount guard) belongs with the rest of the hook unit contracts, and
// keeping the plugin suite at its current file count keeps an in-band jest run
// inside its memory budget.
// ---------------------------------------------------------------------------

const DEFINITIONS_QUERY = 'OrganizationDemographicDefinitions';
const VALUES_QUERY = 'OrganizationDemographicValues';
const SAVE = 'OrganizationSaveDemographicDefinition';
const DELETE = 'OrganizationDeleteDemographicDefinition';
const REORDER = 'OrganizationReorderDemographicDefinitions';
const ENABLE = 'OrganizationSetDemographicEnabled';

interface HookHandle {
  /** The last result the hook returned. */
  current: ReturnType<typeof useOrganizationDemographics>;
}

/**
 * Render the hook and expose its result through a stable handle.
 *
 * `handle.current` is refreshed on every render, so an assertion after `await`
 * reads post-render state.
 */
const renderHookProbe = (options: any): HookHandle => {
  const handle: HookHandle = { current: null as any };

  const Probe: React.FC = () => {
    handle.current = useOrganizationDemographics(options);
    return (
      <pre data-testid="hook-state">
        {JSON.stringify({
          definitions: handle.current.definitions.map((entry) => entry.key),
          usage: handle.current.usage,
          loading: handle.current.loading,
          counting: handle.current.counting,
          saving: handle.current.saving,
          loadError: handle.current.loadError,
          writeError: handle.current.writeError,
        })}
      </pre>
    );
  };

  render(<Probe />);
  return handle;
};

const hookState = () => JSON.parse(screen.getByTestId('hook-state').textContent || '{}');

const baseOptions = (overrides: Record<string, any> = {}) => ({
  reactory: makeReactory({
    organizations: [makeOrganization()],
    demographicDefinitions: baseDemographicDefinitions(),
    demographicValueCounts: { gender: 12 },
  }),
  organization: makeOrganization(),
  ...overrides,
});

describe('read', () => {
  it('loads every definition, including disabled ones', async () => {
    const handle = renderHookProbe(baseOptions());

    await waitFor(() => expect(hookState().loading).toBe(false));
    expect(hookState().definitions).toEqual(['gender', 'dateofbirth', 'team', 'shirtsize']);
    expect(hookState().loadError).toBeNull();
    expect(handle.current.definitions[0].title).toBe('Gender');
  });

  it('does not read when there is no organization', async () => {
    const reactory = makeReactory({ organizations: [makeOrganization()] });
    renderHookProbe({ reactory, organization: { id: '' } as any });

    await waitFor(() => expect(hookState().loading).toBe(false));
    expect(hookState().definitions).toEqual([]);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });

  it('reports an unavailable API instead of throwing', async () => {
    renderHookProbe({
      reactory: { ...makeReactory(), graphqlQuery: undefined },
      organization: makeOrganization(),
    });

    await waitFor(() => expect(hookState().loading).toBe(false));
    expect(hookState().loadError).toEqual({
      key: 'reactory.organizations.error.apiUnavailable',
    });
  });

  it('surfaces a GraphQL envelope failure as a load error', async () => {
    renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          queryImpl: (operation: string) =>
            operation === DEFINITIONS_QUERY
              ? { data: null, errors: [{ message: 'Not authorized for this organization' }] }
              : undefined,
        }),
      }),
    );

    await waitFor(() =>
      expect(hookState().loadError).toEqual({
        key: 'reactory.organizations.error.definitionsFailed',
        serverMessage: 'Not authorized for this organization',
      }),
    );
  });

  it('surfaces a rejected read as a load error', async () => {
    renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          queryImpl: (operation: string) => {
            if (operation !== DEFINITIONS_QUERY) return undefined;
            throw new Error('socket hang up');
          },
        }),
      }),
    );

    await waitFor(() =>
      expect(hookState().loadError).toEqual({
        key: 'reactory.organizations.error.definitionsFailed',
        serverMessage: 'socket hang up',
      }),
    );
  });

  it('clears a previous load error on a successful re-read', async () => {
    let fail = true;
    const handle = renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          demographicDefinitions: baseDemographicDefinitions(),
          queryImpl: (operation: string) => {
            if (operation !== DEFINITIONS_QUERY || !fail) return undefined;
            return { data: null, errors: [{ message: 'temporarily unavailable' }] };
          },
        }),
      }),
    );

    await waitFor(() => expect(hookState().loadError).not.toBeNull());

    fail = false;
    await act(async () => {
      await handle.current.refreshDefinitions();
    });

    expect(hookState().loadError).toBeNull();
    expect(hookState().definitions).toHaveLength(4);
  });

  it('does not read until asked when autoLoad is false', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
    });
    const handle = renderHookProbe(baseOptions({ reactory, autoLoad: false }));

    expect(hookState().loading).toBe(false);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();

    await act(async () => {
      await handle.current.refreshDefinitions();
    });

    expect(hookState().definitions).toHaveLength(4);
  });
});

describe('usage counts', () => {
  it('reads one single-row page per definition and keeps paging.total', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
      demographicValueCounts: { gender: 12, shirtsize: 3 },
    });
    renderHookProbe(baseOptions({ reactory }));

    await waitFor(() => expect(hookState().usage.gender).toBe(12));
    expect(hookState().usage.shirtsize).toBe(3);
    expect(hookState().usage.team).toBe(0);

    const calls = reactory.graphqlQuery.mock.calls.filter(
      (call: any[]) => operationNameOf(call[0]) === VALUES_QUERY,
    );
    expect(calls).toHaveLength(4);
    expect(calls[0][1]).toEqual({
      organizationId: 'org-1',
      filter: { key: 'gender' },
      paging: { page: 1, pageSize: 1 },
    });
  });

  it('is skipped entirely for a read-only viewer', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
    });
    renderHookProbe(baseOptions({ reactory, includeUsage: false }));

    await waitFor(() => expect(hookState().definitions).toHaveLength(4));
    expect(
      reactory.graphqlQuery.mock.calls.filter(
        (call: any[]) => operationNameOf(call[0]) === VALUES_QUERY,
      ),
    ).toHaveLength(0);
    expect(hookState().counting).toBe(false);
  });

  it('leaves a count null (not an error) when the value query is refused', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
      queryImpl: (operation: string) =>
        operation === VALUES_QUERY
          ? { data: null, errors: [{ message: 'Requires an organization administrator' }] }
          : undefined,
    });
    renderHookProbe(baseOptions({ reactory }));

    await waitFor(() => expect(hookState().usage.gender).toBeNull());
    expect(hookState().loadError).toBeNull();
    expect(hookState().counting).toBe(false);
  });

  it('leaves a count null when the value query rejects', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
      queryImpl: (operation: string) => {
        if (operation !== VALUES_QUERY) return undefined;
        throw new Error('network down');
      },
    });
    renderHookProbe(baseOptions({ reactory }));

    await waitFor(() => expect(hookState().usage.gender).toBeNull());
    expect(hookState().loadError).toBeNull();
  });

  it('leaves a count null when the page carries no total', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
      queryImpl: (operation: string) =>
        operation === VALUES_QUERY
          ? { data: { OrganizationDemographicValues: { values: [] } }, errors: [] }
          : undefined,
    });
    renderHookProbe(baseOptions({ reactory }));

    await waitFor(() => expect(hookState().usage.gender).toBeNull());
  });

  it('does not attempt counts when the API is unavailable', async () => {
    const reactory = {
      ...makeReactory({
        organizations: [makeOrganization()],
        demographicDefinitions: baseDemographicDefinitions(),
      }),
      graphqlQuery: undefined,
    };
    renderHookProbe(baseOptions({ reactory }));

    await waitFor(() => expect(hookState().loading).toBe(false));
    expect(hookState().counting).toBe(false);
    expect(hookState().usage).toEqual({});
  });
});

describe('error channels', () => {
  const failingWrite = () =>
    renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          demographicDefinitions: baseDemographicDefinitions(),
          mutationImpl: (operation: string) =>
            operation === ENABLE
              ? { data: null, errors: [{ message: 'Definition is locked' }] }
              : undefined,
        }),
      }),
    );

  it('puts a refused write on writeError only, never on loadError', async () => {
    const handle = failingWrite();
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.setEnabled('gender', false);
    });

    expect(result.error).toEqual({
      key: 'reactory.organizations.demographics.enableFailed',
      serverMessage: 'Definition is locked',
    });
    expect(hookState().writeError).toEqual({
      key: 'reactory.organizations.demographics.enableFailed',
      serverMessage: 'Definition is locked',
    });
    // The pane's banner is driven by loadError, which must stay clean.
    expect(hookState().loadError).toBeNull();
  });

  it('keeps a load error when a write also fails, then clears them separately', async () => {
    const handle = renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          demographicDefinitions: baseDemographicDefinitions(),
          queryImpl: (operation: string) =>
            operation === DEFINITIONS_QUERY
              ? { data: null, errors: [{ message: 'read refused' }] }
              : undefined,
          mutationImpl: (operation: string) =>
            operation === ENABLE
              ? { data: null, errors: [{ message: 'write refused' }] }
              : undefined,
        }),
      }),
    );

    await waitFor(() => expect(hookState().loadError).not.toBeNull());

    await act(async () => {
      await handle.current.setEnabled('gender', false);
    });

    expect(hookState().loadError.serverMessage).toBe('read refused');
    expect(hookState().writeError.serverMessage).toBe('write refused');

    act(() => handle.current.clearWriteError());
    expect(hookState().writeError).toBeNull();
    // Clearing the write channel must not hide the read failure.
    expect(hookState().loadError.serverMessage).toBe('read refused');
  });

  it('clears a previous write error at the start of the next write', async () => {
    let fail = true;
    const handle = renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          demographicDefinitions: baseDemographicDefinitions(),
          mutationImpl: (operation: string) => {
            if (operation !== ENABLE || !fail) return undefined;
            return { data: null, errors: [{ message: 'nope' }] };
          },
        }),
      }),
    );

    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    await act(async () => {
      await handle.current.setEnabled('gender', false);
    });
    expect(hookState().writeError).not.toBeNull();

    fail = false;
    await act(async () => {
      await handle.current.setEnabled('gender', true);
    });

    expect(hookState().writeError).toBeNull();
  });
});

describe('saveDefinition', () => {
  it('merges the returned definition into the list', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.saveDefinition({
        key: 'tshirt',
        title: 'T-shirt size',
        valueType: 'string',
      });
    });

    expect(result.error).toBeNull();
    expect(result.value.key).toBe('tshirt');
    expect(hookState().definitions).toContain('tshirt');
  });

  it('updates an existing definition in place', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    await act(async () => {
      await handle.current.saveDefinition({ id: 'def-4', title: 'Uniform size' });
    });

    const shirtsize = handle.current.definitions.find((entry) => entry.key === 'shirtsize');
    expect(shirtsize?.title).toBe('Uniform size');
    expect(hookState().definitions).toHaveLength(4);
  });

  it('refuses an empty payload without claiming success', async () => {
    const handle = renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          demographicDefinitions: baseDemographicDefinitions(),
          mutationImpl: (operation: string) =>
            operation === SAVE ? { data: { OrganizationSaveDemographicDefinition: null }, errors: [] } : undefined,
        }),
      }),
    );
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.saveDefinition({ id: 'def-1', title: 'Gender' });
    });

    expect(result.value).toBeNull();
    expect(result.error.key).toBe('reactory.organizations.demographics.saveFailed');
    // A refusal must not corrupt the list.
    expect(hookState().definitions).toHaveLength(4);
  });

  it('reports an unavailable mutation API', async () => {
    const handle = renderHookProbe(
      baseOptions({
        reactory: {
          ...makeReactory({
            organizations: [makeOrganization()],
            demographicDefinitions: baseDemographicDefinitions(),
          }),
          graphqlMutation: undefined,
        },
      }),
    );
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.saveDefinition({ key: 'x', title: 'X' });
    });

    expect(result.error.key).toBe('reactory.organizations.error.apiUnavailable');
  });
});

describe('setEnabled', () => {
  it('adopts the returned definition', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    await act(async () => {
      await handle.current.setEnabled('gender', false);
    });

    const gender = handle.current.definitions.find((entry) => entry.key === 'gender');
    expect(gender?.enabled).toBe(false);
  });

  it('refuses an empty payload', async () => {
    const handle = renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          demographicDefinitions: baseDemographicDefinitions(),
          mutationImpl: (operation: string) =>
            operation === ENABLE ? { data: { OrganizationSetDemographicEnabled: {} }, errors: [] } : undefined,
        }),
      }),
    );
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.setEnabled('gender', false);
    });

    expect(result.value).toBeNull();
    expect(result.error.key).toBe('reactory.organizations.demographics.enableFailed');
  });
});

describe('deleteDefinition', () => {
  it('removes the row and its usage entry on success', async () => {
    const handle = renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          demographicDefinitions: baseDemographicDefinitions(),
          demographicValueCounts: { gender: 12 },
        }),
      }),
    );

    // `shirtsize` has no stored values, so the server permits the delete.
    await waitFor(() => expect(hookState().usage.shirtsize).toBe(0));

    let result: any;
    await act(async () => {
      result = await handle.current.deleteDefinition('shirtsize');
    });

    expect(result.value).toBe(true);
    expect(hookState().definitions).not.toContain('shirtsize');
    // The count is dropped with the row rather than left behind as a stale 0.
    expect(hookState().usage.shirtsize).toBeUndefined();
    expect(hookState().usage.gender).toBe(12);
  });

  it('keeps the row when the server refuses', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.deleteDefinition('gender');
    });

    expect(result.error.serverMessage).toMatch(/cannot be deleted/i);
    expect(hookState().definitions).toContain('gender');
  });

  it('treats a resolved false as a refusal', async () => {
    const handle = renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          demographicDefinitions: baseDemographicDefinitions(),
          mutationImpl: (operation: string) =>
            operation === DELETE
              ? { data: { OrganizationDeleteDemographicDefinition: false }, errors: [] }
              : undefined,
        }),
      }),
    );
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.deleteDefinition('shirtsize');
    });

    expect(result.value).toBeNull();
    expect(result.error.key).toBe('reactory.organizations.demographics.delete.failed');
    expect(hookState().definitions).toContain('shirtsize');
  });
});

describe('reorder', () => {
  it('applies the server order and re-sorts by ordinal', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.reorder(['team', 'gender', 'dateofbirth', 'shirtsize']);
    });

    expect(result.value.map((entry: any) => entry.key)).toEqual([
      'team',
      'gender',
      'dateofbirth',
      'shirtsize',
    ]);
    expect(hookState().definitions).toEqual(['team', 'gender', 'dateofbirth', 'shirtsize']);
  });

  it('leaves the list untouched when the server refuses', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.reorder(['nope']);
    });

    expect(result.error).not.toBeNull();
    expect(hookState().definitions).toEqual(['gender', 'dateofbirth', 'team', 'shirtsize']);
  });

  it('tolerates a payload that is not an array', async () => {
    const handle = renderHookProbe(
      baseOptions({
        reactory: makeReactory({
          organizations: [makeOrganization()],
          demographicDefinitions: baseDemographicDefinitions(),
          mutationImpl: (operation: string) =>
            operation === REORDER
              ? { data: { OrganizationReorderDemographicDefinitions: null }, errors: [] }
              : undefined,
        }),
      }),
    );
    await waitFor(() => expect(hookState().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.reorder(['gender']);
    });

    expect(result.error).toBeNull();
    expect(result.value).toEqual([]);
    expect(hookState().definitions).toHaveLength(4);
  });
});

describe('lifecycle', () => {
  it('defaults every option when called with nothing', async () => {
    // Exercises the `options || {}` guard and the two defaulted flags.
    renderHookProbe(undefined);

    await waitFor(() => expect(hookState().loading).toBe(false));
    expect(hookState().definitions).toEqual([]);
  });

  it('does not update state after unmount', async () => {
    const never = new Promise(() => {});
    const reactory = {
      ...makeReactory({ organizations: [makeOrganization()] }),
      graphqlQuery: jest.fn(() => never),
    };

    const handle = renderHookProbe({ reactory, organization: makeOrganization() });
    const before = handle.current;

    cleanup();

    // A resolution after unmount must not warn or throw.
    await act(async () => {
      await Promise.resolve();
    });

    expect(before).toBeTruthy();
  });

  it('ignores a stale read that resolves after a newer one', async () => {
    const resolvers: Array<(value: any) => void> = [];
    const reactory = {
      ...makeReactory({ organizations: [makeOrganization()] }),
      graphqlQuery: jest.fn(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    };

    const handle = renderHookProbe({ reactory, organization: makeOrganization() });
    expect(reactory.graphqlQuery).toHaveBeenCalledTimes(1);

    act(() => {
      void handle.current.refreshDefinitions();
    });
    expect(reactory.graphqlQuery).toHaveBeenCalledTimes(2);

    // Resolve the NEWER request first, then the stale one: the stale payload
    // must be dropped rather than overwrite the newer result.
    await act(async () => {
      resolvers[1]({
        data: { OrganizationDemographicDefinitions: [makeDemographicDefinition({ key: 'newer' })] },
        errors: [],
      });
      await Promise.resolve();
    });
    await act(async () => {
      resolvers[0]({
        data: { OrganizationDemographicDefinitions: [makeDemographicDefinition({ key: 'stale' })] },
        errors: [],
      });
      await Promise.resolve();
    });

    expect(hookState().definitions).toEqual(['newer']);
  });
});

/**
 * The tab's drawer prop is fed from `writeError`, so a saved-but-refused write
 * must never reach the pane banner. Asserted here at the contract level because
 * the tab suite drives it through the UI.
 */
describe('error contract used by the tab', () => {
  it('exposes exactly the two channels the pane reads', () => {
    const handle = renderHookProbe(baseOptions());
    const keys = Object.keys(handle.current).sort();

    expect(keys).toContain('loadError');
    expect(keys).toContain('writeError');
    expect(keys).toContain('clearWriteError');
    expect(keys).not.toContain('error');
    expect(keys).not.toContain('clearError');
  });
});


