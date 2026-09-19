import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REACTORY_GRAPHQL_EXECUTE, REACTORY_GRAPHQL_MUTATE } from '../graphql';
import { isMutationDocument } from '../schema/resultShaper';
import type { GraphQLExecutionResult, GraphQLRunState } from '../types';

export const INITIAL_GRAPHQL_DOCUMENT = `query ApiStatus {
  apiStatus {
    status
    when
    version
  }
}`;

export const INITIAL_VARIABLES = '{\n}';

export interface UseGraphQLExecutionResult {
  document: string;
  variablesText: string;
  operationName: string;
  runState: GraphQLRunState;
  /** Set when the variables pane does not contain valid JSON (client-side only). */
  variablesError: string | null;
  /** The document behind the visible result, for the "dirty" indicator. */
  lastRunDocument: string | null;
  isDirty: boolean;
  isMutation: boolean;
  canRun: boolean;
  setDocument: (value: string) => void;
  setVariablesText: (value: string) => void;
  setOperationName: (value: string) => void;
  run: () => void;
  reset: () => void;
}

/**
 * Owns execution of user-authored GraphQL documents.
 *
 * Decisions worth stating:
 *
 *   - **Queries and mutations go through different APIs.** A mutation document
 *     sent via Apollo's `client.query` is not valid, and the schema declares
 *     `ReactoryGraphQLQuery` on both Query and Mutation precisely so a client
 *     can pick the right one. The document is parsed to decide — not
 *     prefix-matched — so a leading comment does not misroute it.
 *   - **Everything is sent network-only.** Replaying a cached response for an
 *     explicit execution is wrong, and for a mutation it would be a correctness
 *     bug.
 *   - **Both failure modes are handled.** The SDK can reject *or* throw before
 *     returning a promise (an uninitialised client does the latter), so the
 *     call and the await are inside one try/catch rather than a `.catch()` on
 *     the promise, which would miss a synchronous throw.
 *   - **A monotonic sequence guards overlapping runs.** Only the newest
 *     response is published.
 *   - **Variables are parsed client-side** only to give an immediate, precise
 *     error about the JSON the user typed. The server remains the authority on
 *     everything else.
 */
export const useGraphQLExecution = (reactory: any): UseGraphQLExecutionResult => {
  const [document, setDocument] = useState<string>(INITIAL_GRAPHQL_DOCUMENT);
  const [variablesText, setVariablesText] = useState<string>(INITIAL_VARIABLES);
  const [operationName, setOperationName] = useState<string>('');
  const [runState, setRunState] = useState<GraphQLRunState>({ status: 'idle' });
  const [variablesError, setVariablesError] = useState<string | null>(null);
  const [lastRunDocument, setLastRunDocument] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isMutation = useMemo(() => isMutationDocument(document), [document]);

  const canRun = useMemo(() => (document || '').trim().length > 0, [document]);

  const isDirty = useMemo(
    () => (lastRunDocument ? document !== lastRunDocument : false),
    [lastRunDocument, document],
  );

  const run = useCallback(() => {
    const trimmed = (document || '').trim();
    if (!trimmed) return;

    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setRunState({
        status: 'error',
        message: 'The Reactory API is not available; cannot execute the document.',
      });
      return;
    }

    // Parse the variables here so a typo is reported immediately and precisely,
    // rather than surfacing as an opaque server-side parse failure.
    let variables: Record<string, any> = {};
    const rawVariables = (variablesText || '').trim();

    if (rawVariables.length > 0 && rawVariables !== '{}') {
      try {
        const parsed = JSON.parse(rawVariables);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setVariablesError('Variables must be a JSON object.');
          return;
        }
        variables = parsed;
      } catch (error: any) {
        setVariablesError(`Variables are not valid JSON: ${error.message}`);
        return;
      }
    }

    setVariablesError(null);

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setRunState({ status: 'running' });

    const input: Record<string, any> = { query: trimmed, variables };
    const trimmedOperationName = (operationName || '').trim();
    if (trimmedOperationName) input.operationName = trimmedOperationName;

    const mutation = isMutationDocument(trimmed);

    const shouldPublish = () =>
      sequenceRef.current === sequence && mountedRef.current !== false;

    const execute = async (): Promise<void> => {
      let response: any;

      try {
        response =
          mutation && typeof reactory.graphqlMutation === 'function'
            ? await reactory.graphqlMutation(
                REACTORY_GRAPHQL_MUTATE,
                { input },
                { fetchPolicy: 'network-only' },
              )
            : await reactory.graphqlQuery(
                REACTORY_GRAPHQL_EXECUTE,
                { input },
                { fetchPolicy: 'network-only' },
              );
      } catch (error: any) {
        if (!shouldPublish()) return;
        setRunState({
          status: 'error',
          message: error?.message || 'The document failed to execute.',
        });
        return;
      }

      if (!shouldPublish()) return;

      // The execution API reports document-level failures in `errors` rather
      // than rejecting, so a GraphQL error is a successful HTTP call.
      const payload: GraphQLExecutionResult | undefined =
        response?.data?.ReactoryGraphQLQuery;
      const transportErrors = response?.errors || [];

      if (!payload) {
        setRunState({
          status: 'error',
          message:
            transportErrors[0]?.message || 'The server returned no result for the document.',
        });
        return;
      }

      setLastRunDocument(trimmed);
      setRunState({ status: 'success', result: payload });
    };

    void execute();
  }, [reactory, document, variablesText, operationName]);

  const reset = useCallback(() => {
    setRunState({ status: 'idle' });
    setLastRunDocument(null);
    setVariablesError(null);
  }, []);

  return {
    document,
    variablesText,
    operationName,
    runState,
    variablesError,
    lastRunDocument,
    isDirty,
    isMutation,
    canRun,
    setDocument,
    setVariablesText,
    setOperationName,
    run,
    reset,
  };
};

export default useGraphQLExecution;
