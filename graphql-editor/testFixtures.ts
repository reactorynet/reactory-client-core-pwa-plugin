import { buildSchema, introspectionFromSchema } from 'graphql';
import type { GraphQLExecutionResult } from './types';

/**
 * Test fixtures for the GraphQL editor suite.
 *
 * Not named `*.test.*`, so Jest's `testMatch` will not try to run it as a suite.
 */

/** Read the operation name from a `gql` DocumentNode (or a raw string). */
export const operationNameOf = (query: any): string => {
  if (typeof query === 'string') return query;
  const definition = (query?.definitions || []).find(
    (entry: any) => entry?.kind === 'OperationDefinition',
  );
  return definition?.name?.value || '';
};

/** A small schema whose introspection is genuinely consumable by buildClientSchema. */
export const TEST_SCHEMA_SDL = `
  """A person known to the platform."""
  type Person {
    id: ID!
    """Their full name."""
    name: String
    age: Int
    active: Boolean
    role: Role
  }

  """The role a user holds."""
  enum Role {
    ADMIN
    USER
  }

  type Query {
    """The status of the API."""
    apiStatus: Person
    people: [Person]
    count: Int
  }

  type Mutation {
    createPerson(name: String!): Person
  }
`;

export const testSchema = () => buildSchema(TEST_SCHEMA_SDL);

/** The `GraphQLSchemaInfo` payload, shaped as the server returns it. */
export const schemaViewResponse = () => {
  const introspection = introspectionFromSchema(testSchema());
  return {
    data: {
      ReactoryGraphQLSchema: {
        introspection,
        sdl: TEST_SCHEMA_SDL,
        typeCount: Object.keys(testSchema().getTypeMap()).filter(
          (name) => name.startsWith('__') === false,
        ).length,
        compiledAt: '2026-09-19T00:00:00.000Z',
      },
    },
    errors: [],
  };
};

/** A successful execution envelope. */
export const executionResponse = (result: Partial<GraphQLExecutionResult> = {}) => ({
  data: {
    ReactoryGraphQLQuery: {
      data: { apiStatus: { id: '1', name: 'Reactor', role: 'ADMIN' } },
      errors: null,
      extensions: null,
      success: true,
      executionTime: 7,
      ...result,
    },
  },
  errors: [],
});

/**
 * A stubbed Reactory SDK.
 *
 * Routes by operation name so a test can exercise both the execution and the
 * schema paths, and records calls on `graphqlQuery` / `graphqlMutation`
 * separately so a test can assert which API a document was sent through.
 */
export const makeGraphQLReactory = ({
  execute,
  schemaImpl,
}: {
  execute?: (variables: any, callIndex: number) => any;
  schemaImpl?: () => any;
} = {}) => {
  let executeCalls = 0;

  const graphqlQuery = jest.fn((query: any, variables: any) => {
    const operation = operationNameOf(query);

    if (operation === 'ReactoryGraphQLSchemaView') {
      return Promise.resolve(schemaImpl ? schemaImpl() : schemaViewResponse());
    }

    if (operation === 'ReactoryGraphQLExecute') {
      const callIndex = executeCalls;
      executeCalls += 1;
      return Promise.resolve(execute ? execute(variables, callIndex) : executionResponse());
    }

    return Promise.resolve({ data: null, errors: [{ message: `Unexpected query ${operation}` }] });
  });

  const graphqlMutation = jest.fn((query: any, variables: any) => {
    const operation = operationNameOf(query);

    if (operation === 'ReactoryGraphQLExecuteMutation') {
      const callIndex = executeCalls;
      executeCalls += 1;
      return Promise.resolve(execute ? execute(variables, callIndex) : executionResponse());
    }

    return Promise.resolve({ data: null, errors: [{ message: `Unexpected mutation ${operation}` }] });
  });

  return { graphqlQuery, graphqlMutation };
};

/** A manually-resolved promise, for exercising overlapping runs. */
export const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
