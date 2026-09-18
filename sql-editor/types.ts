/**
 * Types for the SQL Query Editor.
 *
 * These mirror the server's GraphQL contract
 * (`reactory-core/graph/types/SQL/ReactorySQL.graphql`) and the shapes
 * returned by the `ReactorySQLResolver`. They are intentionally local to the
 * plugin: the plugin must not depend on form-engine or widget internals.
 */

/** A SQL-capable data connection as returned by `ReactorySQLDataConnections`. */
export interface SqlDataConnection {
  /** Setting name; pass as `input.context.connectionId`. */
  connectionId: string;
  /** postgres | mysql | mssql | databricks */
  variant: string;
  /** Display label (setting title, else the setting name). */
  label?: string;
  title?: string;
  host?: string;
  port?: number;
  database?: string;
  description?: string;
  /** Roles required to use the connection. Empty/absent means open. */
  roles?: string[];
}

/** A column descriptor derived by the server from the returned rows. */
export interface SqlColumn {
  field: string;
  title?: string;
  widget?: string;
  selected?: boolean;
}

/** Server-side paging metadata. `total` is the true row count, not `data.length`. */
export interface SqlPaging {
  total: number;
  page: number;
  hasNext: boolean;
  pageSize: number;
}

/** Echo of the request, plus the variant that served it. */
export interface SqlContext {
  schema?: string;
  table?: string;
  commandText?: string;
  /** The variant that served the query — useful diagnostic UI. */
  provider?: string;
  connectionId?: string;
}

/** The `SQLQueryResult` payload. `data` contains only the requested page. */
export interface SqlQueryResult {
  paging: SqlPaging;
  columns: SqlColumn[];
  context: SqlContext;
  data: SqlQueryRow[];
}

/** A single result row. Column shape is not known until execution. */
export type SqlQueryRow = Record<string, any>;

/** The statement + connection a run belongs to. */
export interface SqlRunTarget {
  connectionId: string;
  commandText: string;
}

/** A fully-resolved execution request. */
export interface SqlRunRequest extends SqlRunTarget {
  page: number;
  pageSize: number;
}

/**
 * Run lifecycle. `success`/`error` describe the *most recent attempt*; the
 * visible grid is driven separately by `lastResult` so a failed run does not
 * destroy the last good result (spec B4/B6).
 */
export type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'error'; message: string }
  | { status: 'success' };

/** Sort direction is not supported server-side; kept for future use. */
export type SqlSortDirection = 'asc' | 'desc';
