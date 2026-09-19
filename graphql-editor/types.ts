/** A row of GraphQL result data. Shape is not known until execution. */
export type GraphQLRow = Record<string, any>;

/** The `GraphQLQueryResult` payload returned by `ReactoryGraphQLQuery`. */
export interface GraphQLExecutionResult {
  data: Record<string, any> | null;
  errors: Array<{ message?: string; [key: string]: any }> | null;
  extensions?: Record<string, any> | null;
  success: boolean;
  executionTime?: number;
}

/** The `GraphQLSchemaInfo` payload returned by `ReactoryGraphQLSchema`. */
export interface GraphQLSchemaView {
  introspection: any;
  sdl?: string | null;
  typeCount?: number | null;
  compiledAt?: string | null;
}

/** Run lifecycle. Separate from the last good result so a failure keeps it. */
export type GraphQLRunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'error'; message: string }
  | { status: 'success'; result: GraphQLExecutionResult };

/** The three result presentations. */
export type ResultViewMode = 'grid' | 'raw' | 'component';

/** Raw output serialisation. */
export type RawFormat = 'json' | 'yaml';

/** A grid column derived from result rows. */
export interface ResultColumn {
  field: string;
  title: string;
}

export interface GridData {
  columns: ResultColumn[];
  rows: GraphQLRow[];
  /** The root field the rows were taken from, for labelling. */
  rootField?: string;
}
