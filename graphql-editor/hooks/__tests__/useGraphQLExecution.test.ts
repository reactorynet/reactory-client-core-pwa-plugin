import { act, renderHook } from '@testing-library/react-hooks';
import { useGraphQLExecution, INITIAL_GRAPHQL_DOCUMENT } from '../useGraphQLExecution';
import { deferred, makeGraphQLReactory } from '../../testFixtures';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const runAndSettle = async (result: any) => {
  await act(async () => {
    result.current.run();
    await flush();
  });
};

describe('useGraphQLExecution', () => {
  it('executes nothing on mount', () => {
    const reactory = makeGraphQLReactory();
    renderHook(() => useGraphQLExecution(reactory));

    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
    expect(reactory.graphqlMutation).not.toHaveBeenCalled();
  });

  it('runs a query through graphqlQuery on page load', async () => {
    const reactory = makeGraphQLReactory();
    const { result } = renderHook(() => useGraphQLExecution(reactory));

    await runAndSettle(result);

    expect(reactory.graphqlQuery).toHaveBeenCalledTimes(1);
    expect(reactory.graphqlMutation).not.toHaveBeenCalled();

    const variables = reactory.graphqlQuery.mock.calls[0][1] as any;
    expect(variables.input.query).toBe(INITIAL_GRAPHQL_DOCUMENT);
    expect(variables.input.variables).toEqual({});

    expect(result.current.runState.status).toBe('success');
  });

  it('runs a mutation through graphqlMutation, not graphqlQuery', async () => {
    // Apollo's client.query is not valid for a mutation document; the schema
    // declares the field on Mutation precisely so clients can route correctly.
    const reactory = makeGraphQLReactory();
    const { result } = renderHook(() => useGraphQLExecution(reactory));

    act(() => result.current.setDocument('mutation M { doThing }'));
    await runAndSettle(result);

    expect(reactory.graphqlMutation).toHaveBeenCalledTimes(1);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
    expect(result.current.isMutation).toBe(true);
  });

  it('routes a mutation behind a leading comment correctly', async () => {
    const reactory = makeGraphQLReactory();
    const { result } = renderHook(() => useGraphQLExecution(reactory));

    act(() => result.current.setDocument('# note\nmutation M { doThing }'));
    await runAndSettle(result);

    expect(reactory.graphqlMutation).toHaveBeenCalledTimes(1);
  });

  it('reports invalid variables JSON without calling the server', async () => {
    const reactory = makeGraphQLReactory();
    const { result } = renderHook(() => useGraphQLExecution(reactory));

    act(() => result.current.setVariablesText('{ not json'));
    await runAndSettle(result);

    expect(result.current.variablesError).toMatch(/not valid JSON/i);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
    expect(reactory.graphqlMutation).not.toHaveBeenCalled();
  });

  it('rejects a variables value that is not an object', async () => {
    const reactory = makeGraphQLReactory();
    const { result } = renderHook(() => useGraphQLExecution(reactory));

    act(() => result.current.setVariablesText('[1,2,3]'));
    await runAndSettle(result);

    expect(result.current.variablesError).toMatch(/must be a JSON object/i);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });

  it('sends parsed variables as an object', async () => {
    const reactory = makeGraphQLReactory();
    const { result } = renderHook(() => useGraphQLExecution(reactory));

    act(() => result.current.setVariablesText('{ "id": "42" }'));
    await runAndSettle(result);

    const variables = reactory.graphqlQuery.mock.calls[0][1] as any;
    expect(variables.input.variables).toEqual({ id: '42' });
  });

  it('includes the operation name only when one was given', async () => {
    const reactory = makeGraphQLReactory();
    const { result } = renderHook(() => useGraphQLExecution(reactory));

    await runAndSettle(result);
    expect((reactory.graphqlQuery.mock.calls[0][1] as any).input.operationName).toBeUndefined();

    act(() => result.current.setOperationName('  ApiStatus  '));
    await runAndSettle(result);

    const last = reactory.graphqlQuery.mock.calls[1][1] as any;
    expect(last.input.operationName).toBe('ApiStatus');
  });

  it('surfaces GraphQL errors without discarding the result', async () => {
    const reactory = makeGraphQLReactory({
      execute: () => ({
        data: {
          ReactoryGraphQLQuery: {
            data: null,
            errors: [{ message: 'Cannot query field "nope"' }],
            extensions: null,
            success: false,
            executionTime: 5,
          },
        },
        errors: [],
      }),
    });

    const { result } = renderHook(() => useGraphQLExecution(reactory));
    await runAndSettle(result);

    expect(result.current.runState.status).toBe('success');
    const state = result.current.runState as any;
    expect(state.result.errors[0].message).toBe('Cannot query field "nope"');
    expect(state.result.success).toBe(false);
  });

  it('reports a transport failure as an error state', async () => {
    const reactory = makeGraphQLReactory({
      execute: () => ({ data: null, errors: [{ message: 'Unauthorized' }] }),
    });

    const { result } = renderHook(() => useGraphQLExecution(reactory));
    await runAndSettle(result);

    expect(result.current.runState).toEqual({ status: 'error', message: 'Unauthorized' });
  });

  it('recovers from a thrown request', async () => {
    const reactory = makeGraphQLReactory({
      execute: () => {
        throw new Error('network down');
      },
    });

    const { result } = renderHook(() => useGraphQLExecution(reactory));
    await runAndSettle(result);

    expect(result.current.runState).toEqual({ status: 'error', message: 'network down' });
  });

  it('marks the editor dirty only after an edit following a run', async () => {
    const reactory = makeGraphQLReactory();
    const { result } = renderHook(() => useGraphQLExecution(reactory));

    expect(result.current.isDirty).toBe(false);

    await runAndSettle(result);
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setDocument(`${INITIAL_GRAPHQL_DOCUMENT}\n# edited`));
    expect(result.current.isDirty).toBe(true);
  });

  it('publishes only the newest response when runs overlap', async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    const reactory = {
      graphqlQuery: jest
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
      graphqlMutation: jest.fn(),
    };

    const { result } = renderHook(() => useGraphQLExecution(reactory as any));

    act(() => result.current.run());
    act(() => result.current.run());
    expect(reactory.graphqlQuery).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({
        data: {
          ReactoryGraphQLQuery: {
            data: { newest: true },
            errors: null,
            success: true,
            executionTime: 1,
          },
        },
        errors: [],
      });
      await flush();
    });

    await act(async () => {
      first.resolve({
        data: {
          ReactoryGraphQLQuery: {
            data: { newest: false },
            errors: null,
            success: true,
            executionTime: 2,
          },
        },
        errors: [],
      });
      await flush();
    });

    const state = result.current.runState as any;
    expect(state.result.data).toEqual({ newest: true });
  });

  it('will not run a blank document', async () => {
    const reactory = makeGraphQLReactory();
    const { result } = renderHook(() => useGraphQLExecution(reactory));

    act(() => result.current.setDocument('   '));
    expect(result.current.canRun).toBe(false);

    await runAndSettle(result);
    expect(reactory.graphqlQuery).not.toHaveBeenCalled();
  });
});
