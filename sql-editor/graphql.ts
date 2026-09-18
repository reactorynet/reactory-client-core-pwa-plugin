import { gql } from '@apollo/client';

/**
 * GraphQL documents for the SQL Query Editor.
 *
 * These mirror the server contract in
 * `reactory-core/graph/types/SQL/ReactorySQL.graphql`. The server-side SQL
 * capability is reused unchanged — this is the only client-side artefact of
 * that API, so the documents live beside the component that consumes them.
 *
 * The host's `reactory.graphqlQuery(query, variables, options)` accepts either
 * a string or a DocumentNode; using `gql` validates the document shape at
 * import time so a typo fails loudly rather than at query time.
 */

/** Role-aware connection list. Never returns credentials. */
export const REACTORY_SQL_DATA_CONNECTIONS = gql`
  query ReactorySQLDataConnections {
    ReactorySQLDataConnections {
      connectionId
      variant
      label
      title
      host
      port
      database
      description
      roles
    }
  }
`;

/**
 * Execute a single read-only statement, paged in the database.
 *
 * `data` contains only the requested page; `paging.total` is the true row
 * count from a COUNT(*) over the same wrapper.
 */
export const REACTORY_SQL_QUERY = gql`
  query ReactorySQLQuery($input: SQLQuery) {
    ReactorySQLQuery(input: $input) {
      paging {
        total
        page
        hasNext
        pageSize
      }
      columns {
        field
        title
        widget
        selected
      }
      context {
        connectionId
        commandText
        provider
      }
      data
    }
  }
`;
