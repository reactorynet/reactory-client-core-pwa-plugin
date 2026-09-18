import type { SqlDataConnection, SqlQueryResult } from './types';

/**
 * Test fixtures for the SQL Query Editor suite.
 *
 * Not named `*.test.*`, so Jest's `testMatch` will not try to run it as a
 * suite — it is a helper only.
 */

/** Read the operation name from a `gql` DocumentNode (or a raw string). */
export const operationNameOf = (query: any): string => {
  if (typeof query === 'string') return query;
  const definition = (query?.definitions || []).find(
    (entry: any) => entry?.kind === 'OperationDefinition',
  );
  return definition?.name?.value || '';
};

/** Build a paged `SQLQueryResult` with `rowCount` rows on the page. */
export const makeResult = ({
  rowCount = 10,
  total = 32,
  page = 1,
  pageSize = 10,
  provider = 'postgres',
  valuePrefix = 'row',
  columns,
}: {
  rowCount?: number;
  total?: number;
  page?: number;
  pageSize?: number;
  provider?: string;
  valuePrefix?: string;
  columns?: SqlQueryResult['columns'];
} = {}): SqlQueryResult => {
  const start = (page - 1) * pageSize + 1;
  const data = Array.from({ length: rowCount }, (_unused, index) => ({
    table_name: `${valuePrefix}_${start + index}`,
  }));

  return {
    paging: {
      total,
      page,
      hasNext: page * pageSize < total,
      pageSize,
    },
    columns: columns || [{ field: 'table_name', title: 'table_name', widget: 'text', selected: true }],
    context: { connectionId: 'reactory.postgres.connection', commandText: 'SELECT 1', provider },
    data,
  };
};

/** Successful GraphQL envelope for the execution query. */
export const successResponse = (result: SqlQueryResult) => ({
  data: { ReactorySQLQuery: result },
  errors: [],
});

/** GraphQL error envelope — the shape the read-only guard produces. */
export const errorResponse = (message: string) => ({
  data: null,
  errors: [{ message }],
});

export const connections: SqlDataConnection[] = [
  {
    connectionId: 'reactory.postgres.connection',
    variant: 'postgres',
    label: 'Reactory Postgres',
    database: 'reactory',
  },
  {
    connectionId: 'reactory.mssql.connection',
    variant: 'mssql',
    label: 'Legacy MSSQL',
    database: 'legacy',
  },
];

export const connectionsResponse = (list: SqlDataConnection[] = connections) => ({
  data: { ReactorySQLDataConnections: list },
  errors: [],
});

/**
 * A stubbed Reactory SDK.
 *
 * `execute` receives the GraphQL variables so a test can assert the exact
 * request that reached the API boundary — the only place a data-flow claim is
 * actually verifiable.
 */
export const makeReactory = ({
  connectionList = connections,
  execute,
  connectionsImpl,
}: {
  connectionList?: SqlDataConnection[];
  execute?: (variables: any, callIndex: number) => any;
  connectionsImpl?: () => any;
} = {}) => {
  let executeCalls = 0;

  const graphqlQuery = jest.fn((query: any, variables: any) => {
    const operation = operationNameOf(query);

    if (operation === 'ReactorySQLDataConnections') {
      return Promise.resolve(
        connectionsImpl ? connectionsImpl() : connectionsResponse(connectionList),
      );
    }

    if (operation === 'ReactorySQLQuery') {
      const callIndex = executeCalls;
      executeCalls += 1;
      if (execute) return Promise.resolve(execute(variables, callIndex));
      return Promise.resolve(successResponse(makeResult()));
    }

    return Promise.resolve({ data: null, errors: [] });
  });

  return { graphqlQuery };
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

/** Open a MUI `Select` and choose an option by its visible text. */
export const selectMuiOption = async (
  combobox: HTMLElement,
  optionName: string | RegExp,
  fireEvent: any,
  screen: any,
) => {
  fireEvent.mouseDown(combobox);
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.click(option);
};
