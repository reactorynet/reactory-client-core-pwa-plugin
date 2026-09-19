import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultsGrid, { formatDisplayedRows, deriveColumns, rowMatches, toCsv } from '../ResultsGrid';
import { makeResult } from '../../testFixtures';

const noop = () => undefined;

const renderGrid = (overrides: Partial<React.ComponentProps<typeof ResultsGrid>> = {}) =>
  render(
    <ResultsGrid
      result={null}
      searchTerm=""
      onSearchTermChange={noop}
      onPageChange={noop}
      onPageSizeChange={noop}
      {...overrides}
    />,
  );

describe('ResultsGrid label arithmetic', () => {
  it('formats the footer range with an en dash', () => {
    expect(formatDisplayedRows({ from: 1, to: 10, count: 32 })).toBe('1\u201310 of 32');
    expect(formatDisplayedRows({ from: 11, to: 20, count: 32 })).toBe('11\u201320 of 32');
    expect(formatDisplayedRows({ from: 31, to: 32, count: 32 })).toBe('31\u201332 of 32');
  });

  it('renders the first page range and the next page range', () => {
    const { unmount } = renderGrid({ result: makeResult({ page: 1, pageSize: 10, total: 32 }) });
    expect(screen.getByText('1\u201310 of 32')).toBeInTheDocument();
    unmount();

    renderGrid({ result: makeResult({ page: 2, pageSize: 10, total: 32 }) });
    expect(screen.getByText('11\u201320 of 32')).toBeInTheDocument();
  });

  it('hides the pager when the result fits on one page (B11)', () => {
    renderGrid({ result: makeResult({ rowCount: 2, total: 2, pageSize: 10 }) });
    expect(screen.queryByText(/of 2$/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/rows per page/i)).not.toBeInTheDocument();
  });

  it('reports the true total, not the page length (B5)', () => {
    renderGrid({ result: makeResult({ rowCount: 10, total: 32, pageSize: 10 }) });
    expect(screen.getByText(/32 rows/)).toBeInTheDocument();
  });

  it('shows the serving variant (B13)', () => {
    renderGrid({ result: makeResult({ provider: 'postgres' }) });
    expect(screen.getByText(/postgres/)).toBeInTheDocument();
  });
});

describe('ResultsGrid states', () => {
  it('renders a friendly empty state rather than an error (B14)', () => {
    renderGrid({ result: makeResult({ rowCount: 0, total: 0 }) });
    expect(screen.getByText('Query returned no rows.')).toBeInTheDocument();
    // Informational, so it must not be announced as an error alert.
    expect(screen.getByRole('status')).toHaveTextContent('Query returned no rows.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the idle prompt before any run', () => {
    renderGrid({ result: null, idle: true });
    expect(screen.getByText('Run a query to see results.')).toBeInTheDocument();
  });

  it('filters only the current page, labelled as such (B12)', () => {
    renderGrid({
      result: makeResult({ rowCount: 10, total: 32, page: 1, pageSize: 10 }),
      searchTerm: 'row_2',
    });
    expect(screen.getByText('row_2')).toBeInTheDocument();
    expect(screen.queryByText('row_1')).not.toBeInTheDocument();
    // The footer still describes server-side paging, not the filtered count.
    expect(screen.getByText('1\u201310 of 32')).toBeInTheDocument();
  });

  it('reports a partial final page using the server metadata (B5)', () => {
    renderGrid({ result: makeResult({ rowCount: 2, total: 32, page: 4, pageSize: 10 }) });
    expect(screen.getByText('31\u201332 of 32')).toBeInTheDocument();
  });

  it('explains the helper text for the search box', () => {
    renderGrid({ result: makeResult() });
    expect(screen.getByText('Filters the current page')).toBeInTheDocument();
  });

  it('calls onSearchTermChange as the user types', async () => {
    const onSearchTermChange = jest.fn();
    renderGrid({ result: makeResult(), onSearchTermChange });

    await userEvent.type(screen.getByLabelText(/search the current page/i), 'abc');
    expect(onSearchTermChange).toHaveBeenCalled();
  });

  it('exposes scoped column headers in a real table (accessibility)', () => {
    renderGrid({ result: makeResult() });
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveAttribute('scope', 'col');
    expect(headers[0]).toHaveTextContent('table_name');
  });

  it('puts a wide table in a focusable, labelled scroll region', () => {
    // A wide result set must be pannable without a mouse: the scroll container
    // is keyboard-focusable and named, so it can be scrolled with arrow keys.
    renderGrid({ result: makeResult() });

    const region = screen.getByRole('region', { name: /query results table/i });
    expect(region).toHaveAttribute('tabindex', '0');
  });
});

describe('ResultsGrid helpers', () => {
  it('derives columns from the first row when the server declares none', () => {
    const result = makeResult({ columns: [] });
    expect(deriveColumns(result).map((column) => column.field)).toEqual(['table_name']);
  });

  it('drops deselected columns', () => {
    const result = makeResult({
      columns: [
        { field: 'a', selected: true },
        { field: 'b', selected: false },
      ],
    });
    expect(deriveColumns(result).map((column) => column.field)).toEqual(['a']);
  });

  it('matches rows case-insensitively across all values', () => {
    expect(rowMatches({ table_name: 'Reactor_Audit' }, 'audit')).toBe(true);
    expect(rowMatches({ table_name: 'Reactor_Audit' }, 'nope')).toBe(false);
    expect(rowMatches({ table_name: null }, 'null')).toBe(false);
  });

  it('escapes CSV values containing commas and quotes', () => {
    const csv = toCsv(
      [{ field: 'table_name', title: 'table_name' }],
      [{ table_name: 'a,b' }, { table_name: 'say "hi"' }],
    );
    expect(csv.split('\r\n')).toEqual(['table_name', '"a,b"', '"say ""hi"""']);
  });
});
