import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REACTORY_SQL_QUERY } from '../graphql';
import type {
  RunState,
  SqlQueryResult,
  SqlRunRequest,
  SqlRunTarget,
} from '../types';

/** Sensible starting statement. Demonstrates the read-only contract. */
export const INITIAL_COMMAND_TEXT = [
  'SELECT table_name',
  'FROM information_schema.tables',
  "WHERE table_schema = 'public'",
].join('\n');

export interface UseSqlQueryResult {
  connectionId: string;
  commandText: string;
  page: number;
  pageSize: number;
  searchTerm: string;
  runState: RunState;
  /** The last *successful* result. Survives a later failed run (spec B4/B6). */
  lastResult: SqlQueryResult | null;
  /** The statement + connection that produced `lastResult` (spec B7). */
  lastRun: SqlRunTarget | null;
  /** True when the editor text differs from the statement behind the grid. */
  isDirty: boolean;
  /** True when a run is permissible: connection set and statement non-blank. */
  canRun: boolean;
  setConnectionId: (id: string) => void;
  setCommandText: (text: string) => void;
  setSearchTerm: (term: string) => void;
  /** Executes the editor's current text at page 1. */
  run: () => void;
  /** Re-runs the LAST RUN's statement at a new page (spec B7). */
  goToPage: (page: number) => void;
  /** Resets to page 1 and re-runs the LAST RUN's statement (spec B8). */
  changePageSize: (pageSize: number) => void;
  /** Drops any results and returns to idle, without executing. */
  reset: () => void;
}

/**
 * Owns the SQL editor's execution and paging state.
 *
 * Design notes
 * ------------
 * - **Nothing executes on mount.** `run()` is the only entry point that
 *   executes the editor's text; a page change belongs to the last run.
 * - **`lastResult` is separate from `runState`.** A failed run sets the state
 *   to `error` but leaves the last good page on screen (spec B4/B6). Results
 *   are never seeded from anything other than a completed run.
 * - **A monotonic request sequence guards overlapping runs** (spec B15). Only
 *   the newest response is published; an earlier in-flight response is
 *   discarded instead of interleaving.
 * - Execution always uses `network-only`. The default for
 *   `reactory.graphqlQuery` is already `network-only`; it is passed explicitly
 *   so a future default change cannot silently turn "execute" into a cache read.
 */
export const useSqlQuery = (
  reactory: any,
  initialCommandText: string = INITIAL_COMMAND_TEXT,
): UseSqlQueryResult => {
  const [connectionId, setConnectionIdState] = useState<string>('');
  const [commandText, setCommandText] = useState<string>(initialCommandText);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [runState, setRunState] = useState<RunState>({ status: 'idle' });
  const [lastResult, setLastResult] = useState<SqlQueryResult | null>(null);
  const [lastRun, setLastRun] = useState<SqlRunTarget | null>(null);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (request: SqlRunRequest): Promise<void> => {
      if (!reactory || typeof reactory.graphqlQuery !== 'function') {
        setRunState({
          status: 'error',
          message: 'The Reactory API is not available; cannot execute the query.',
        });
        return;
      }

      const sequence = sequenceRef.current + 1;
      sequenceRef.current = sequence;

      setRunState({ status: 'running' });

      try {
        const result: any = await reactory.graphqlQuery(
          REACTORY_SQL_QUERY,
          {
            input: {
              context: {
                connectionId: request.connectionId,
                commandText: request.commandText,
              },
              paging: { page: request.page, pageSize: request.pageSize },
            },
          },
          { fetchPolicy: 'network-only' },
        );

        // Publish only the newest response (spec B15).
        if (sequenceRef.current !== sequence || mountedRef.current === false) return;

        const errors = result?.errors || [];
        if (errors.length > 0) {
          // Surface the server's message verbatim (spec 4.2 / B6).
          setRunState({
            status: 'error',
            message: errors[0]?.message || 'The query failed.',
          });
          return;
        }

        const payload = result?.data?.ReactorySQLQuery as SqlQueryResult | undefined;
        if (!payload) {
          setRunState({
            status: 'error',
            message: 'The server returned no result for the query.',
          });
          return;
        }

        setLastResult(payload);
        setLastRun({
          connectionId: request.connectionId,
          commandText: request.commandText,
        });
        setRunState({ status: 'success' });
      } catch (err: any) {
        if (sequenceRef.current !== sequence || mountedRef.current === false) return;
        setRunState({
          status: 'error',
          message: err?.message || 'The query failed.',
        });
      }
    },
    [reactory],
  );

  /** Spec B3: Run always executes the editor text, starting at page 1. */
  const run = useCallback((): void => {
    const statement = (commandText || '').trim();
    if (!connectionId || !statement) return;

    setPage(1);
    setSearchTerm('');
    execute({ connectionId, commandText, page: 1, pageSize });
  }, [connectionId, commandText, pageSize, execute]);

  /**
   * Spec B7: paging belongs to the *last run*. If the editor has been edited
   * since, the grid still pages over `lastRun` and the editor shows as dirty;
   * the next Run picks up the edits.
   */
  const goToPage = useCallback(
    (nextPage: number): void => {
      if (!lastRun || nextPage < 1) return;
      setPage(nextPage);
      execute({
        connectionId: lastRun.connectionId,
        commandText: lastRun.commandText,
        page: nextPage,
        pageSize,
      });
    },
    [lastRun, pageSize, execute],
  );

  /** Spec B8: page size change resets to page 1 and re-runs the last run. */
  const changePageSize = useCallback(
    (nextPageSize: number): void => {
      setPageSize(nextPageSize);
      setPage(1);
      if (!lastRun) return;
      execute({
        connectionId: lastRun.connectionId,
        commandText: lastRun.commandText,
        page: 1,
        pageSize: nextPageSize,
      });
    },
    [lastRun, execute],
  );

  /**
   * Spec B10: a connection change does not auto-run. Results from a different
   * connection would be misleading, so they are cleared and the pane returns
   * to idle.
   */
  const setConnectionId = useCallback((id: string): void => {
    setConnectionIdState(id);
    setRunState({ status: 'idle' });
    setLastResult(null);
    setLastRun(null);
    setPage(1);
    setSearchTerm('');
  }, []);

  const reset = useCallback((): void => {
    setRunState({ status: 'idle' });
    setLastResult(null);
    setLastRun(null);
    setPage(1);
    setSearchTerm('');
  }, []);

  const isDirty = useMemo(
    () => (lastRun ? commandText !== lastRun.commandText : false),
    [lastRun, commandText],
  );

  const canRun = useMemo(
    () => Boolean(connectionId) && (commandText || '').trim().length > 0,
    [connectionId, commandText],
  );

  return {
    connectionId,
    commandText,
    page,
    pageSize,
    searchTerm,
    runState,
    lastResult,
    lastRun,
    isDirty,
    canRun,
    setConnectionId,
    setCommandText,
    setSearchTerm,
    run,
    goToPage,
    changePageSize,
    reset,
  };
};

export default useSqlQuery;
