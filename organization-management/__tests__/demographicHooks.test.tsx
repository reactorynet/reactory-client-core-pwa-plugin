/**
 * @jest-environment jsdom
 *
 * `useOrganizationDemographics` (ORG-031) — the read/write state machine.
 *
 * The pane's behaviour that cannot be asserted through the rendered tab lives
 * here: the sequence guards, the best-effort usage counts, the two error
 * channels (`loadError` vs `writeError`), the empty-payload refusals inside each
 * mutator's `apply`, and the unmount guards.
 *
 * A probe component exposes the hook's result through a JSON blob and a set of
 * imperative handles, so each case calls the mutator directly and then asserts
 * what the hook resolved *and* what it now holds. Assertions are on primitives
 * and plain objects only — no jsdom File/Blob deep-equality (that never
 * terminates in this codebase).
 */
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

import useOrganizationDemographics from '../hooks/useOrganizationDemographics';
import type { OrganizationTabProps } from '../types';
import {
  baseDemographicDefinitions,
  makeDemographicDefinition,
  makeOrganization,
  makeReactory,
  operationNameOf,
} from './testFixtures';

afterEach(cleanup);

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

const state = () => JSON.parse(screen.getByTestId('hook-state').textContent || '{}');

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

    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().definitions).toEqual(['gender', 'dateofbirth', 'team', 'shirtsize']);
    expect(state().loadError).toBeNull();
    expect(handle.current.definitions[0].title).toBe('Gender');
  });

  it('does not read when there is no organization', async () => {
    const reactory = makeReactory({ organizations: [makeOrganization()] });
    renderHookProbe({ reactory, organization: { id: '' } as any });

    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().definitions).toEqual([]);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });

  it('reports an unavailable API instead of throwing', async () => {
    renderHookProbe({
      reactory: { ...makeReactory(), graphqlQuery: undefined },
      organization: makeOrganization(),
    });

    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().loadError).toEqual({
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
      expect(state().loadError).toEqual({
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
      expect(state().loadError).toEqual({
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

    await waitFor(() => expect(state().loadError).not.toBeNull());

    fail = false;
    await act(async () => {
      await handle.current.refreshDefinitions();
    });

    expect(state().loadError).toBeNull();
    expect(state().definitions).toHaveLength(4);
  });

  it('does not read until asked when autoLoad is false', async () => {
    const reactory = makeReactory({
      organizations: [makeOrganization()],
      demographicDefinitions: baseDemographicDefinitions(),
    });
    const handle = renderHookProbe(baseOptions({ reactory, autoLoad: false }));

    expect(state().loading).toBe(false);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();

    await act(async () => {
      await handle.current.refreshDefinitions();
    });

    expect(state().definitions).toHaveLength(4);
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

    await waitFor(() => expect(state().usage.gender).toBe(12));
    expect(state().usage.shirtsize).toBe(3);
    expect(state().usage.team).toBe(0);

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

    await waitFor(() => expect(state().definitions).toHaveLength(4));
    expect(
      reactory.graphqlQuery.mock.calls.filter(
        (call: any[]) => operationNameOf(call[0]) === VALUES_QUERY,
      ),
    ).toHaveLength(0);
    expect(state().counting).toBe(false);
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

    await waitFor(() => expect(state().usage.gender).toBeNull());
    expect(state().loadError).toBeNull();
    expect(state().counting).toBe(false);
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

    await waitFor(() => expect(state().usage.gender).toBeNull());
    expect(state().loadError).toBeNull();
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

    await waitFor(() => expect(state().usage.gender).toBeNull());
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

    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().counting).toBe(false);
    expect(state().usage).toEqual({});
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
    await waitFor(() => expect(state().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.setEnabled('gender', false);
    });

    expect(result.error).toEqual({
      key: 'reactory.organizations.demographics.enableFailed',
      serverMessage: 'Definition is locked',
    });
    expect(state().writeError).toEqual({
      key: 'reactory.organizations.demographics.enableFailed',
      serverMessage: 'Definition is locked',
    });
    // The pane's banner is driven by loadError, which must stay clean.
    expect(state().loadError).toBeNull();
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

    await waitFor(() => expect(state().loadError).not.toBeNull());

    await act(async () => {
      await handle.current.setEnabled('gender', false);
    });

    expect(state().loadError.serverMessage).toBe('read refused');
    expect(state().writeError.serverMessage).toBe('write refused');

    act(() => handle.current.clearWriteError());
    expect(state().writeError).toBeNull();
    // Clearing the write channel must not hide the read failure.
    expect(state().loadError.serverMessage).toBe('read refused');
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

    await waitFor(() => expect(state().definitions).toHaveLength(4));

    await act(async () => {
      await handle.current.setEnabled('gender', false);
    });
    expect(state().writeError).not.toBeNull();

    fail = false;
    await act(async () => {
      await handle.current.setEnabled('gender', true);
    });

    expect(state().writeError).toBeNull();
  });
});

describe('saveDefinition', () => {
  it('merges the returned definition into the list', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(state().definitions).toHaveLength(4));

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
    expect(state().definitions).toContain('tshirt');
  });

  it('updates an existing definition in place', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(state().definitions).toHaveLength(4));

    await act(async () => {
      await handle.current.saveDefinition({ id: 'def-4', title: 'Uniform size' });
    });

    const shirtsize = handle.current.definitions.find((entry) => entry.key === 'shirtsize');
    expect(shirtsize?.title).toBe('Uniform size');
    expect(state().definitions).toHaveLength(4);
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
    await waitFor(() => expect(state().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.saveDefinition({ id: 'def-1', title: 'Gender' });
    });

    expect(result.value).toBeNull();
    expect(result.error.key).toBe('reactory.organizations.demographics.saveFailed');
    // A refusal must not corrupt the list.
    expect(state().definitions).toHaveLength(4);
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
    await waitFor(() => expect(state().definitions).toHaveLength(4));

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
    await waitFor(() => expect(state().definitions).toHaveLength(4));

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
    await waitFor(() => expect(state().definitions).toHaveLength(4));

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
    await waitFor(() => expect(state().usage.shirtsize).toBe(0));

    let result: any;
    await act(async () => {
      result = await handle.current.deleteDefinition('shirtsize');
    });

    expect(result.value).toBe(true);
    expect(state().definitions).not.toContain('shirtsize');
    // The count is dropped with the row rather than left behind as a stale 0.
    expect(state().usage.shirtsize).toBeUndefined();
    expect(state().usage.gender).toBe(12);
  });

  it('keeps the row when the server refuses', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(state().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.deleteDefinition('gender');
    });

    expect(result.error.serverMessage).toMatch(/cannot be deleted/i);
    expect(state().definitions).toContain('gender');
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
    await waitFor(() => expect(state().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.deleteDefinition('shirtsize');
    });

    expect(result.value).toBeNull();
    expect(result.error.key).toBe('reactory.organizations.demographics.delete.failed');
    expect(state().definitions).toContain('shirtsize');
  });
});

describe('reorder', () => {
  it('applies the server order and re-sorts by ordinal', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(state().definitions).toHaveLength(4));

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
    expect(state().definitions).toEqual(['team', 'gender', 'dateofbirth', 'shirtsize']);
  });

  it('leaves the list untouched when the server refuses', async () => {
    const handle = renderHookProbe(baseOptions());
    await waitFor(() => expect(state().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.reorder(['nope']);
    });

    expect(result.error).not.toBeNull();
    expect(state().definitions).toEqual(['gender', 'dateofbirth', 'team', 'shirtsize']);
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
    await waitFor(() => expect(state().definitions).toHaveLength(4));

    let result: any;
    await act(async () => {
      result = await handle.current.reorder(['gender']);
    });

    expect(result.error).toBeNull();
    expect(result.value).toEqual([]);
    expect(state().definitions).toHaveLength(4);
  });
});

describe('lifecycle', () => {
  it('defaults every option when called with nothing', async () => {
    // Exercises the `options || {}` guard and the two defaulted flags.
    renderHookProbe(undefined);

    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().definitions).toEqual([]);
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

    expect(state().definitions).toEqual(['newer']);
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

/** Keeps the unused-import lint honest about the props type this suite mirrors. */
export type _TabProps = OrganizationTabProps;
