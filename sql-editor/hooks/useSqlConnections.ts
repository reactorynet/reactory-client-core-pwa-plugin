import { useCallback, useEffect, useRef, useState } from 'react';
import { REACTORY_SQL_DATA_CONNECTIONS } from '../graphql';
import type { SqlDataConnection } from '../types';

export interface UseSqlConnectionsResult {
  connections: SqlDataConnection[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads the SQL-capable connections available to the signed-in caller.
 *
 * The query is role-aware server-side and never returns credentials, so the
 * client has nothing to filter out. Loaded once per mount with
 * `cache-first` — the list is stable for a session.
 *
 * A request sequence number means a slow first response can never overwrite a
 * newer one (the same guard the execution hook uses).
 */
export const useSqlConnections = (reactory: any): UseSqlConnectionsResult => {
  const [connections, setConnections] = useState<SqlDataConnection[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);
  const sequenceRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!reactory || typeof reactory.graphqlQuery !== 'function') {
      setError('The Reactory API is not available; cannot load data connections.');
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setLoading(true);
    setError(null);

    try {
      const result: any = await reactory.graphqlQuery(
        REACTORY_SQL_DATA_CONNECTIONS,
        {},
        { fetchPolicy: 'cache-first' },
      );

      if (sequenceRef.current !== sequence || mountedRef.current === false) return;

      const errors = result?.errors || [];
      if (errors.length > 0) {
        setError(errors[0]?.message || 'Failed to load data connections.');
        return;
      }

      const list = result?.data?.ReactorySQLDataConnections;
      setConnections(Array.isArray(list) ? list : []);
    } catch (err: any) {
      if (sequenceRef.current !== sequence || mountedRef.current === false) return;
      setError(err?.message || 'Failed to load data connections.');
    } finally {
      if (sequenceRef.current === sequence && mountedRef.current !== false) {
        setLoading(false);
      }
    }
  }, [reactory]);

  useEffect(() => {
    load();
  }, [load]);

  return { connections, loading, error, reload: load };
};

export default useSqlConnections;
