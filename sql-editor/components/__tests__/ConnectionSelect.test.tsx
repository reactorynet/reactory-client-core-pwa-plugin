import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConnectionSelect from '../ConnectionSelect';
import { connections } from '../../testFixtures';

describe('ConnectionSelect', () => {
  it('associates a real label with the control (accessibility)', () => {
    render(<ConnectionSelect connections={connections} value="" onChange={jest.fn()} />);

    const combobox = screen.getByLabelText(/database connection/i);
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveAttribute('role', 'combobox');
  });

  it('renders an option per connection returned by the query', async () => {
    render(<ConnectionSelect connections={connections} value="" onChange={jest.fn()} />);

    fireEvent.mouseDown(screen.getByLabelText(/database connection/i));

    expect(await screen.findByRole('option', { name: /Reactory Postgres/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Legacy MSSQL/ })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('returns the connection id the API expects', async () => {
    const onChange = jest.fn();
    render(<ConnectionSelect connections={connections} value="" onChange={onChange} />);

    fireEvent.mouseDown(screen.getByLabelText(/database connection/i));
    fireEvent.click(await screen.findByRole('option', { name: /Legacy MSSQL/ }));

    expect(onChange).toHaveBeenCalledWith('reactory.mssql.connection');
  });

  it('never renders credential fields', async () => {
    // Even if a caller hands it credential-bearing objects, nothing may leak:
    // the API does not return credentials and the client must not display them.
    const withCredentials = [
      {
        connectionId: 'conn',
        variant: 'postgres',
        label: 'Credentialed',
        username: 'admin',
        password: 'hunter2',
      },
    ] as any;

    const { container } = render(
      <ConnectionSelect connections={withCredentials} value="" onChange={jest.fn()} />,
    );

    fireEvent.mouseDown(screen.getByLabelText(/database connection/i));
    await screen.findByRole('option', { name: /Credentialed/ });

    expect(container.innerHTML).not.toMatch(/hunter2/);
    expect(container.innerHTML).not.toMatch(/password/i);
    expect(container.innerHTML).not.toMatch(/username/i);
  });

  it('explains the loading and idle states', () => {
    const { unmount } = render(
      <ConnectionSelect connections={[]} value="" onChange={jest.fn()} loading />,
    );
    expect(screen.getByText(/Loading data connections/)).toBeInTheDocument();
    unmount();

    render(<ConnectionSelect connections={connections} value="" onChange={jest.fn()} />);
    expect(screen.getByText('Select the connection to query')).toBeInTheDocument();
  });

  it('surfaces a connection loading error', () => {
    render(
      <ConnectionSelect
        connections={[]}
        value=""
        onChange={jest.fn()}
        error="Failed to load data connections."
      />,
    );
    expect(screen.getByText('Failed to load data connections.')).toBeInTheDocument();
  });
});
