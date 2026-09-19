import { gql } from '@apollo/client';

/**
 * GraphQL documents for the GraphQL editor.
 *
 * These mirror the server contract in
 * `reactory-core/graph/types/GraphQL/ReactoryGraphQL.graphql`. The server
 * capability is reused unchanged; this is the client side of that API.
 *
 * Note the `input.variables` field is typed `Any` server-side, whose
 * `parseValue` passes objects through unchanged but JSON-parses strings. The
 * editor sends an already-parsed object, so the value arrives intact.
 */

/**
 * Executes a query document.
 *
 * The server detects a `mutation` document and routes it internally, so this
 * field also works for mutations — but the editor sends mutations through the
 * Mutation field below, which is what the schema declares it for.
 */
export const REACTORY_GRAPHQL_EXECUTE = gql`
  query ReactoryGraphQLExecute($input: GraphQLQueryInput!) {
    ReactoryGraphQLQuery(input: $input) {
      data
      errors
      extensions
      success
      executionTime
    }
  }
`;

/** Executes a mutation document, via the Mutation field of the same name. */
export const REACTORY_GRAPHQL_MUTATE = gql`
  mutation ReactoryGraphQLExecuteMutation($input: GraphQLQueryInput!) {
    ReactoryGraphQLQuery(input: $input) {
      data
      errors
      extensions
      success
      executionTime
    }
  }
`;

/**
 * Reads the compiled schema for the component view.
 *
 * Deliberately not a `__schema` operation: Apollo Server disables introspection
 * outside development, so that would fail in production. This resolver reads
 * the in-process schema and is role-gated (DEVELOPER/ADMIN).
 */
export const REACTORY_GRAPHQL_SCHEMA = gql`
  query ReactoryGraphQLSchemaView {
    ReactoryGraphQLSchema {
      introspection
      sdl
      typeCount
      compiledAt
    }
  }
`;
