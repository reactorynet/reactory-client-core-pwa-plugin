import { act, renderHook } from '@testing-library/react-hooks';
import { useSqlQuery, INITIAL_COMMAND_TEXT } from '../useSqlQuery';
import {
  deferred,
  errorResponse,
  makeReactory,
  makeResult,
  successResponse,
} from '../../testFixtures';

/** Yield to the macrotask queue so a resolved promise chain has fully settled. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const runAndSettle = async (result: any) => {
  await act(async () => {
    result.current.run();
    await flush();
  });
};

describe('useSqlQuery', () => {
  it('does not execute anything on mount', () => {
    const reactory = makeReactory();
    renderHook(() => useSqlQuery(reactory));

    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });

  it('runs the editor text at page 1 with the configured page size (B3)', async () => {
    const reactory = makeReactory();
    const { result } = renderHook(() => useSqlQuery(reactory));

    act(() => result.current.setConnectionId('reactory.postgres.connection'));
    await runAndSettle(result);

    expect(reactory.graphqlQuery).toHaveBeenCalledTimes(1);
    const variables = reactory.graphqlQuery.mock.calls[0][1] as any;
    expect(variables.input.paging).toEqual({ page: 1, pageSize: 10 });
    expect(variables.input.context.connectionId).toBe('reactory.postgres.connection');
    expect(variables.input.context.commandText).toBe(INITIAL_COMMAND_TEXT);

    expect(result.current.runState.status).toBe('success');
    expect(result.current.lastResult).not.toBeNull();
    expect(result.current.lastRun).toEqual({
      connectionId: 'reactory.postgres.connection',
      commandText: INITIAL_COMMAND_TEXT,
    });
  });

  it('refuses to run without a connection or with a blank statement (B2)', async () => {
    const reactory = makeReactory();
    const { result } = renderHook(() => useSqlQuery(reactory));

    // No connection yet.
    expect(result.current.canRun).toBe(false);
    await runAndSettle(result);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();

    // Connection present but the statement is blank.
    act(() => result.current.setConnectionId('reactory.postgres.connection'));
    act(() => result.current.setCommandText('   '));
    expect(result.current.canRun).toBe(false);

    await runAndSettle(result);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });

  it('pages over the LAST RUN statement, not the edited editor text (B7)', async () => {
    const reactory = makeReactory();
    const { result } = renderHook(() => useSqlQuery(reactory));

    act(() => result.current.setConnectionId('reactory.postgres.connection'));
    await runAndSettle(result);

    // Edit the editor after the run — the grid must still page over the run.
    act(() => result.current.setCommandText('SELECT * FROM something_else'));
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      result.current.goToPage(2);
      await flush();
    });

    expect(reactory.graphqlQuery).toHaveBeenCalledTimes(2);
    const variables = reactory.graphqlQuery.mock.calls[1][1] as any;
    expect(variables.input.paging).toEqual({ page: 2, pageSize: 10 });
    expect(variables.input.context.commandText).toBe(INITIAL_COMMAND_TEXT);
    // The edit is retained in the editor, ready for the next Run.
    expect(result.current.commandText).toBe('SELECT * FROM something_else');
  });

  it('resets to page 1 when the page size changes (B8)', async () => {
    const reactory = makeReactory();
    const { result } = renderHook(() => useSqlQuery(reactory));

    act(() => result.current.setConnectionId('reactory.postgres.connection'));
    await runAndSettle(result);

    await act(async () => {
      result.current.goToPage(3);
      await flush();
    });

    await act(async () => {
      result.current.changePageSize(25);
      await flush();
    });

    const lastCall = reactory.graphqlQuery.mock.calls[reactory.graphqlQuery.mock.calls.length - 1];
    const variables = lastCall[1] as any;
    expect(variables.input.paging).toEqual({ page: 1, pageSize: 25 });
    expect(result.current.pageSize).toBe(25);
    expect(result.current.page).toBe(1);
  });

  it('clears results on a connection change without executing (B10)', async () => {
    const reactory = makeReactory();
    const { result } = renderHook(() => useSqlQuery(reactory));

    act(() => result.current.setConnectionId('reactory.postgres.connection'));
    await runAndSettle(result);
    expect(result.current.lastResult).not.toBeNull();

    const callsBefore = reactory.graphqlQuery.mock.calls.length;
    act(() => result.current.setConnectionId('reactory.mssql.connection'));

    expect(result.current.lastResult).toBeNull();
    expect(result.current.lastRun).toBeNull();
    expect(result.current.runState.status).toBe('idle');
    expect(reactory.graphqlQuery.mock.calls.length).toBe(callsBefore);
  });

  it('surfaces the server message verbatim and keeps the previous results (B6)', async () => {
    const rejection = 'Statement rejected: only a single read-only SELECT or WITH statement is allowed.';
    const reactory = makeReactory({
      execute: (_variables, callIndex) =>
        callIndex === 0 ? successResponse(makeResult()) : errorResponse(rejection),
    });
    const { result } = renderHook(() => useSqlQuery(reactory));

    act(() => result.current.setConnectionId('reactory.postgres.connection'));
    await runAndSettle(result);

    const firstResult = result.current.lastResult;
    expect(firstResult).not.toBeNull();

    await runAndSettle(result);

    expect(result.current.runState).toEqual({ status: 'error', message: rejection });
    // The last good page is still on screen.
    expect(result.current.lastResult).toBe(firstResult);
  });

  it('publishes only the newest response when runs overlap (B15)', async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    const reactory = {
      graphqlQuery: jest
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    };

    const { result } = renderHook(() => useSqlQuery(reactory as any));
    act(() => result.current.setConnectionId('reactory.postgres.connection'));

    act(() => result.current.run());
    act(() => result.current.run());
    expect(reactory.graphqlQuery).toHaveBeenCalledTimes(2);

    // The newer run resolves first...
    await act(async () => {
      second.resolve(successResponse(makeResult({ valuePrefix: 'second' })));
      await flush();
    });

    // ...then the stale one resolves late and must be discarded.
    await act(async () => {
      first.resolve(successResponse(makeResult({ valuePrefix: 'first' })));
      await flush();
    });

    expect(result.current.runState.status).toBe('success');
    expect(result.current.lastResult?.data[0].table_name).toBe('second_1');
  });
});
