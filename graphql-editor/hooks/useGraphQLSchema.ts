import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildClientSchema, type GraphQLSchema } from 'graphql';
import { REACTORY_GRAPHQL_SCHEMA } from '../graphql';
import type { GraphQLSchemaView } from '../types';

export interface UseGraphQLSchemaResult {
  /** The parsed schema, or null when unavailable. */
  schema: GraphQLSchema | null;
  /** The raw server view (SDL, counts, compiled timestamp). */
  view: GraphQLSchemaView | null;
  loading: boolean;
  /** Populated when introspection failed. The other views stay usable. */
  error: string | null;
  reload: () => void;
}

/**
 * Loads and parses the Reactory GraphQL schema.
 *
 * Fetched through `ReactoryGraphQLSchema` rather than a `__schema` operation:
 * Apollo Server disables introspection outside development, so a client-issued
 * introspection query works locally and then fails in production. That endpoint
 * reads the in-process schema and is role-gated.
 *
 * Failure is a first-class outcome, not an exception: the component view needs
 * the schema, but the grid and raw views do not, so a failure here degrades one
 * tab rather than the page.
 */
export const useGraphQLSchema = (reactory: any): UseGraphQLSchemaResult => {
  const [schema, setSchema] = useState<GraphQLSchema | null>(null);
  const [view, setView] = useState<GraphQLSchemaView | null>(null);
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
      setError('The Reactory API is not available; cannot load the schema.');
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    setLoading(true);
    setError(null);

    try {
      const result: any = await reactory.graphqlQuery(
        REACTORY_GRAPHQL_SCHEMA,
        {},
        { fetchPolicy: 'cache-first' },
      );

      if (sequenceRef.current !== sequence || mountedRef.current === false) return;

      const errors = result?.errors || [];
      if (errors.length > 0) {
        setError(errors[0]?.message || 'The schema could not be introspected.');
        return;
      }

      const payload: GraphQLSchemaView | undefined = result?.data?.ReactoryGraphQLSchema;
      if (!payload || !payload.introspection) {
        setError('The schema introspection response was empty.');
        return;
      }

      // `buildClientSchema` wants the bare introspection result.
      const parsed = buildClientSchema(
        payload.introspection.__schema ? payload.introspection : payload.introspection,
      );

      setSchema(parsed);
      setView({
        introspection: payload.introspection,
        sdl: payload.sdl || null,
        typeCount: payload.typeCount ?? null,
        compiledAt: payload.compiledAt || null,
      });
    } catch (err: any) {
      if (sequenceRef.current !== sequence || mountedRef.current === false) return;
      // A role rejection or a network failure lands here. Report it and let the
      // caller decide — the schema is optional for two of the three views.
      setError(err?.message || 'The schema could not be introspected.');
    } finally {
      if (sequenceRef.current === sequence && mountedRef.current !== false) {
        setLoading(false);
      }
    }
  }, [reactory]);

  useEffect(() => {
    load();
  }, [load]);

  return useMemo(
    () => ({ schema, view, loading, error, reload: load }),
    [schema, view, loading, error, load],
  );
};

export default useGraphQLSchema;
