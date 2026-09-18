import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SqlQueryEditor from './SqlQueryEditor';
import {
  connections,
  errorResponse,
  makeReactory,
  makeResult,
  operationNameOf,
  successResponse,
} from './testFixtures';
import { INITIAL_COMMAND_TEXT } from './hooks/useSqlQuery';

const EXECUTE = /execute query/i;

const executeCalls = (reactory: any) =>
  reactory.graphqlQuery.mock.calls.filter(
    (call: any[]) => operationNameOf(call[0]) === 'ReactorySQLQuery',
  );

const connectionCalls = (reactory: any) =>
  reactory.graphqlQuery.mock.calls.filter(
    (call: any[]) => operationNameOf(call[0]) === 'ReactorySQLDataConnections',
  );

const runButton = () => screen.getByRole('button', { name: EXECUTE });
const editor = () => screen.getByLabelText('SQL Command');
const connectionControl = () => screen.getByLabelText(/database connection/i);

/**
 * Click Run and let the mocked request settle inside the act scope, so no
 * state update lands outside it.
 */
const runQuery = async () => {
  await act(async () => {
    await userEvent.click(runButton());
  });
};

/**
 * Open the MUI connection select and choose an option by label.
 *
 * The control is disabled while the connection list loads, and a disabled MUI
 * Select ignores the mouse-down that opens its menu — so wait for loading to
 * finish before interacting.
 */
const chooseConnection = async (optionName: RegExp) => {
  await waitFor(() =>
    expect(screen.queryByText(/Loading data connections/)).not.toBeInTheDocument(),
  );

  await act(async () => {
    fireEvent.mouseDown(connectionControl());
  });

  const option = await screen.findByRole('option', { name: optionName });

  await act(async () => {
    fireEvent.click(option);
  });
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe('SqlQueryEditor', () => {
  it('renders idle and executes nothing on mount (B1)', async () => {
    const reactory = makeReactory({ connectionList: [connections[0]] });
    render(<SqlQueryEditor reactory={reactory} />);

    expect(await screen.findByText('Run a query to see results.')).toBeInTheDocument();

    // Connections are loaded; no query has run.
    expect(connectionCalls(reactory)).toHaveLength(1);
    expect(executeCalls(reactory)).toHaveLength(0);
  });

  it('preselects the only available connection (B1)', async () => {
    const reactory = makeReactory({ connectionList: [connections[0]] });
    render(<SqlQueryEditor reactory={reactory} />);

    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(screen.getByText('Reactory Postgres')).toBeInTheDocument();
  });

  it('disables Run with an accessible reason while the statement is blank (B2)', async () => {
    const reactory = makeReactory({ connectionList: [connections[0]] });
    render(<SqlQueryEditor reactory={reactory} />);
    await waitFor(() => expect(runButton()).toBeEnabled());

    await act(async () => {
      await userEvent.clear(editor());
    });

    expect(runButton()).toBeDisabled();
    expect(runButton()).toHaveAttribute('title', 'Enter a SQL statement first');
    expect(executeCalls(reactory)).toHaveLength(0);
  });

  it('runs on click, requests page 1, and renders the rows and footer (B3, B5)', async () => {
    const reactory = makeReactory({ connectionList: [connections[0]] });
    render(<SqlQueryEditor reactory={reactory} />);
    await waitFor(() => expect(runButton()).toBeEnabled());

    await runQuery();

    expect(await screen.findByText('1\u201310 of 32')).toBeInTheDocument();
    expect(screen.getByText('row_1')).toBeInTheDocument();

    const calls = executeCalls(reactory);
    expect(calls).toHaveLength(1);
    expect(calls[0][1].input).toEqual({
      context: {
        connectionId: 'reactory.postgres.connection',
        commandText: INITIAL_COMMAND_TEXT,
      },
      paging: { page: 1, pageSize: 10 },
    });
  });

  it('runs on Cmd/Ctrl+Enter (B9)', async () => {
    const reactory = makeReactory({ connectionList: [connections[0]] });
    render(<SqlQueryEditor reactory={reactory} />);
    await waitFor(() => expect(runButton()).toBeEnabled());

    await act(async () => {
      fireEvent.keyDown(editor(), { key: 'Enter', ctrlKey: true });
    });

    await waitFor(() => expect(executeCalls(reactory)).toHaveLength(1));
  });

  it('shows the server message verbatim and keeps the previous results (B6)', async () => {
    const rejection = 'Statement rejected: read-only statements only (SELECT or WITH).';
    const reactory = makeReactory({
      connectionList: [connections[0]],
      execute: (_variables, callIndex) =>
        callIndex === 0 ? successResponse(makeResult()) : errorResponse(rejection),
    });
    render(<SqlQueryEditor reactory={reactory} />);
    await waitFor(() => expect(runButton()).toBeEnabled());

    await runQuery();
    await screen.findByText('1\u201310 of 32');

    await runQuery();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(rejection);
    // The last good page survives the failed run.
    expect(screen.getByText('row_1')).toBeInTheDocument();
    expect(screen.getByText('1\u201310 of 32')).toBeInTheDocument();
  });

  it('pages over the last run statement, not a subsequently edited editor (B7)', async () => {
    const reactory = makeReactory({ connectionList: [connections[0]] });
    render(<SqlQueryEditor reactory={reactory} />);
    await waitFor(() => expect(runButton()).toBeEnabled());

    await runQuery();
    await screen.findByText('1\u201310 of 32');

    // Edit the editor after the run.
    await act(async () => {
      await userEvent.type(editor(), ' ');
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/next page/i));
    });

    await waitFor(() => expect(executeCalls(reactory)).toHaveLength(2));
    const variables = executeCalls(reactory)[1][1] as any;
    expect(variables.input.paging.page).toBe(2);
    expect(variables.input.context.commandText).toBe(INITIAL_COMMAND_TEXT);
    // The edit is preserved for the next Run.
    expect((editor() as HTMLTextAreaElement).value).toContain(`${INITIAL_COMMAND_TEXT} `);
  });

  it('filters the current page only (B12)', async () => {
    const reactory = makeReactory({
      connectionList: [connections[0]],
      execute: () => successResponse(makeResult({ rowCount: 10, total: 32 })),
    });
    render(<SqlQueryEditor reactory={reactory} />);
    await waitFor(() => expect(runButton()).toBeEnabled());

    await runQuery();
    await screen.findByText('row_1');
    expect(screen.getByText('row_2')).toBeInTheDocument();

    await act(async () => {
      await userEvent.type(screen.getByLabelText(/search the current page/i), 'row_2');
    });

    expect(screen.getByText('row_2')).toBeInTheDocument();
    expect(screen.queryByText('row_1')).not.toBeInTheDocument();
    expect(screen.getByText('Filters the current page')).toBeInTheDocument();
  });

  it('renders a friendly empty state, not an error (B14)', async () => {
    const reactory = makeReactory({
      connectionList: [connections[0]],
      execute: () => successResponse(makeResult({ rowCount: 0, total: 0 })),
    });
    render(<SqlQueryEditor reactory={reactory} />);
    await waitFor(() => expect(runButton()).toBeEnabled());

    await runQuery();

    expect(await screen.findByText('Query returned no rows.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Query returned no rows.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears results on a connection change and does not auto-run (B10)', async () => {
    const reactory = makeReactory({ connectionList: connections });
    render(<SqlQueryEditor reactory={reactory} />);

    await chooseConnection(/Reactory Postgres/);
    await waitFor(() => expect(runButton()).toBeEnabled());

    await runQuery();
    await screen.findByText('1\u201310 of 32');
    expect(executeCalls(reactory)).toHaveLength(1);

    await chooseConnection(/Legacy MSSQL/);

    await waitFor(() => expect(screen.queryByText('1\u201310 of 32')).not.toBeInTheDocument());
    expect(screen.getByText('Run a query to see results.')).toBeInTheDocument();
    // Still only the one explicit run.
    expect(executeCalls(reactory)).toHaveLength(1);
  });

  it('issues exactly one execute request per Run (no duplicate fetches)', async () => {
    const reactory = makeReactory({ connectionList: [connections[0]] });
    render(<SqlQueryEditor reactory={reactory} />);
    await waitFor(() => expect(runButton()).toBeEnabled());

    await runQuery();
    await screen.findByText('1\u201310 of 32');

    await runQuery();
    await waitFor(() => expect(executeCalls(reactory)).toHaveLength(2));

    expect(executeCalls(reactory)).toHaveLength(2);
  });
});
