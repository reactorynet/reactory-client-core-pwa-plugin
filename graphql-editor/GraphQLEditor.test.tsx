import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The generated form is stubbed here on purpose.
 *
 * This test is about the editor: which views exist, what they receive, and what
 * happens when introspection fails. Rendering the real form engine in jsdom
 * would test the engine, not this component — and the engine's own suite covers
 * it. The form *definition* is asserted through the stub's props instead.
 */
jest.mock('@reactory/client-core/components/reactory/ReactoryForm', () => ({
  ReactoryForm: (props: any) => (
    <div data-testid="generated-form">
      {JSON.stringify({
        id: props.formDef?.id,
        type: props.formDef?.schema?.type,
        properties: props.formDef?.schema?.properties
          ? Object.keys(props.formDef.schema.properties).sort()
          : null,
        enum: props.formDef?.schema?.enum || null,
        readOnly: props.formDef?.uiSchema?.['ui:readonly'],
      })}
    </div>
  ),
}));

import GraphQLEditor from './GraphQLEditor';
import { executionResponse, makeGraphQLReactory, operationNameOf } from './testFixtures';

const EXECUTE_QUERY = /execute query/i;
const EXECUTE_MUTATION = /execute mutation/i;

const runButton = () => screen.getByRole('button', { name: EXECUTE_QUERY });
const documentEditor = () => screen.getByLabelText('GraphQL Document');
const variablesEditor = () => screen.getByLabelText('Variables (JSON)');

const executeCalls = (reactory: any) => [
  ...reactory.graphqlQuery.mock.calls.filter(
    (call: any[]) => operationNameOf(call[0]) === 'ReactoryGraphQLExecute',
  ),
  ...reactory.graphqlMutation.mock.calls,
];

const runAndSettle = async () => {
  await act(async () => {
    await userEvent.click(runButton());
  });
};

afterEach(cleanup);

describe('GraphQLEditor', () => {
  it('renders idle and executes nothing on mount', async () => {
    const reactory = makeGraphQLReactory();
    render(<GraphQLEditor reactory={reactory} />);

    expect(screen.getByText('Run a query or mutation to see results.')).toBeInTheDocument();
    expect(executeCalls(reactory)).toHaveLength(0);
  });

  it('loads the schema for the component view', async () => {
    const reactory = makeGraphQLReactory();
    render(<GraphQLEditor reactory={reactory} />);

    await waitFor(() =>
      expect(
        reactory.graphqlQuery.mock.calls.some(
          (call: any[]) => operationNameOf(call[0]) === 'ReactoryGraphQLSchemaView',
        ),
      ).toBe(true),
    );
  });

  it('runs a query and shows the result in the grid', async () => {
    const reactory = makeGraphQLReactory();
    render(<GraphQLEditor reactory={reactory} />);

    await runAndSettle();

    expect(await screen.findByText('Result')).toBeInTheDocument();

    // The fixture's `apiStatus` resolves to a single object, so the grid shows
    // one row whose columns are the selected fields.
    const region = await screen.findByRole('region', { name: /graphql results table/i });
    expect(region).toBeInTheDocument();

    expect(screen.getByRole('columnheader', { name: 'Id' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByText('Reactor')).toBeInTheDocument();
  });

  it('labels the operation type and routes a mutation to the mutation API', async () => {
    const reactory = makeGraphQLReactory();
    render(<GraphQLEditor reactory={reactory} />);

    await act(async () => {
      fireEvent.change(documentEditor(), { target: { value: 'mutation M { doThing }' } });
    });

    // Scoped to the chip: "mutation" also appears inside the document itself.
    expect(screen.getByText('mutation', { selector: '.MuiChip-label' })).toBeInTheDocument();

    const button = screen.getByRole('button', { name: EXECUTE_MUTATION });
    await act(async () => {
      await userEvent.click(button);
    });

    expect(reactory.graphqlMutation).toHaveBeenCalledTimes(1);
    // The schema hook legitimately uses graphqlQuery on mount, so assert that no
    // *execution* was routed through it.
    expect(
      reactory.graphqlQuery.mock.calls.filter(
        (call: any[]) => operationNameOf(call[0]) === 'ReactoryGraphQLExecute',
      ),
    ).toHaveLength(0);
  });

  it('offers Grid, Raw and Component views and switches between them', async () => {
    const reactory = makeGraphQLReactory();
    render(<GraphQLEditor reactory={reactory} />);
    await runAndSettle();

    // Grid is the default.
    expect(
      await screen.findByRole('region', { name: /graphql results table/i }),
    ).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: /raw/i }));
    });
    expect(screen.getByLabelText(/raw result \(json\)/i)).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: /component/i }));
    });
    expect(await screen.findByTestId('generated-form')).toBeInTheDocument();
  });

  it('gives each editor a distinct DOM id so labels bind to the right control', async () => {
    // Two JSON panes render together (variables and raw output). Deriving the id
    // from the language produced duplicate ids and a label pointing at the wrong
    // field; this asserts they are unique.
    const reactory = makeGraphQLReactory();
    const { container } = render(<GraphQLEditor reactory={reactory} />);
    await runAndSettle();

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: /raw/i }));
    });

    const ids = Array.from(container.querySelectorAll('textarea'))
      .map((node) => node.id)
      .filter(Boolean);

    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getByLabelText('Variables (JSON)').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/raw result \(json\)/i).tagName).toBe('TEXTAREA');
  });

  it('builds the component view from the introspected type', async () => {
    const reactory = makeGraphQLReactory();
    render(<GraphQLEditor reactory={reactory} />);
    await runAndSettle();

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: /component/i }));
    });

    const form = await screen.findByTestId('generated-form');
    const definition = JSON.parse(form.textContent || '{}');

    // The fixture returns an object for `apiStatus` in the test schema, whose
    // fields were selected as id/name/role.
    expect(definition.readOnly).toBe(true);
    expect(definition.properties).toEqual(['id', 'name', 'role']);
  });

  it('switches the raw view between JSON and YAML', async () => {
    const reactory = makeGraphQLReactory();
    render(<GraphQLEditor reactory={reactory} />);
    await runAndSettle();

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: /raw/i }));
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'YAML' }));
    });

    expect(screen.getByLabelText(/raw result \(yaml\)/i)).toBeInTheDocument();
  });

  it('explains an introspection failure without blocking the other views', async () => {
    const reactory = makeGraphQLReactory({
      schemaImpl: () => ({ data: null, errors: [{ message: 'Unauthorized' }] }),
    });
    render(<GraphQLEditor reactory={reactory} />);

    await runAndSettle();

    // The result is still shown in the grid.
    expect(
      await screen.findByRole('region', { name: /graphql results table/i }),
    ).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByRole('tab', { name: /component/i }));
    });

    expect(await screen.findByText(/component view is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Unauthorized/)).toBeInTheDocument();
  });

  it('surfaces GraphQL errors from the execution', async () => {
    const reactory = makeGraphQLReactory({
      execute: () =>
        executionResponse({
          data: null,
          errors: [{ message: 'Cannot query field "nope" on type "Query"' }],
          success: false,
        }),
    });
    render(<GraphQLEditor reactory={reactory} />);

    await runAndSettle();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Cannot query field "nope"/);
  });

  it('reports invalid variables before reaching the server', async () => {
    const reactory = makeGraphQLReactory();
    render(<GraphQLEditor reactory={reactory} />);

    await act(async () => {
      fireEvent.change(variablesEditor(), { target: { value: '{ broken' } });
    });

    await runAndSettle();

    expect(screen.getByText(/not valid JSON/i)).toBeInTheDocument();
    expect(executeCalls(reactory)).toHaveLength(0);
  });

  it('runs on Cmd/Ctrl+Enter', async () => {
    const reactory = makeGraphQLReactory();
    render(<GraphQLEditor reactory={reactory} />);

    await act(async () => {
      fireEvent.keyDown(documentEditor(), { key: 'Enter', ctrlKey: true });
    });

    await waitFor(() => expect(executeCalls(reactory)).toHaveLength(1));
  });

  it('gives each page section its own surface', async () => {
    const reactory = makeGraphQLReactory();
    const { container } = render(<GraphQLEditor reactory={reactory} />);

    // Title, operation name + actions, document, variables, idle results.
    expect(container.querySelectorAll('.MuiPaper-root').length).toBeGreaterThanOrEqual(5);
  });
});
