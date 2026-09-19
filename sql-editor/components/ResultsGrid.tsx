import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { Search as SearchIcon, Download as DownloadIcon } from '@mui/icons-material';
import type { SqlColumn, SqlQueryResult, SqlQueryRow } from '../types';

/**
 * Scroll region for the result table.
 *
 * A wide result set needs a horizontal scrollbar the user can actually find.
 * macOS overlay scrollbars are hidden until you scroll, which makes the table
 * look unscrollable; these rules give the track and thumb explicit, always
 * visible geometry in WebKit/Blink, plus `scrollbar-color`/`scrollbar-width`
 * for Firefox. The region is also focusable so the table can be panned with
 * the keyboard instead of a drag.
 */
const ScrollArea = styled(TableContainer)(({ theme }) => ({
  maxHeight: 460,
  overflow: 'auto',
  scrollbarWidth: 'thin',
  scrollbarColor: `${theme.palette.text.disabled} ${theme.palette.action.hover}`,
  '&::-webkit-scrollbar': {
    width: 12,
    height: 12,
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: theme.palette.action.hover,
    borderRadius: 6,
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: theme.palette.text.disabled,
    borderRadius: 6,
    border: `3px solid ${theme.palette.background.paper}`,
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: theme.palette.text.secondary,
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: -2,
  },
}));

/** Footer label, e.g. `1\u201310 of 32`. Exported so the arithmetic is unit-testable. */
export const formatDisplayedRows = ({ from, to, count }: { from: number; to: number; count: number }): string =>
  `${from}\u2013${to} of ${count}`;

/**
 * Columns for the grid.
 *
 * Raw SQL cannot declare its shape, so the server derives `columns` from the
 * returned rows. When that list is absent (or all columns were deselected) the
 * shape is taken from the first row as a last resort, so a dynamic result set
 * still renders instead of showing an empty grid.
 */
export const deriveColumns = (result: SqlQueryResult | null): SqlColumn[] => {
  if (!result) return [];

  const declared = (result.columns || []).filter(
    (column) => column && column.field && column.selected !== false,
  );
  if (declared.length > 0) return declared;

  const first = Array.isArray(result.data) && result.data.length > 0 ? result.data[0] : null;
  if (first && typeof first === 'object') {
    return Object.keys(first).map((field) => ({
      field,
      title: field,
      widget: 'text',
      selected: true,
    }));
  }

  return [];
};

/** Case-insensitive match across every value in the row. */
export const rowMatches = (row: SqlQueryRow, term: string): boolean => {
  if (!term) return true;
  return Object.keys(row || {}).some((key) => {
    const value = row[key];
    if (value === null || value === undefined) return false;
    return String(value).toLowerCase().includes(term);
  });
};

const csvCell = (value: any): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV for the rows currently shown (the current page, after the client filter). */
export const toCsv = (columns: SqlColumn[], rows: SqlQueryRow[]): string => {
  const header = columns.map((column) => csvCell(column.title || column.field)).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.field])).join(','));
  return [header, ...body].join('\r\n');
};

export const downloadCsv = (filename: string, csv: string): void => {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export interface ResultsGridProps {
  result: SqlQueryResult | null;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** A run is in flight: keep the grid visible but dimmed (spec B4). */
  busy?: boolean;
  /** Render the idle prompt instead of an empty-result message. */
  idle?: boolean;
}

/**
 * Results table with server-side paging.
 *
 * A plain `<table>` with scoped header cells (not a data grid) — the result
 * shape is not known until execution, and the server already pages the data.
 * The search box filters the *current page* only; the footer always reflects
 * the server's paging metadata.
 */
export const ResultsGrid: React.FC<ResultsGridProps> = ({
  result,
  searchTerm,
  onSearchTermChange,
  onPageChange,
  onPageSizeChange,
  busy = false,
  idle = false,
}) => {
  const columns = useMemo(() => deriveColumns(result), [result]);

  const pageRows = useMemo<SqlQueryRow[]>(
    () => (result && Array.isArray(result.data) ? result.data : []),
    [result],
  );

  const trimmedTerm = (searchTerm || '').trim().toLowerCase();

  const visibleRows = useMemo(
    () => (trimmedTerm ? pageRows.filter((row) => rowMatches(row, trimmedTerm)) : pageRows),
    [pageRows, trimmedTerm],
  );

  const total = result?.paging?.total ?? 0;
  const page = result?.paging?.page ?? 1;
  const pageSize = result?.paging?.pageSize ?? 10;
  const provider = result?.context?.provider;

  const handleExport = useCallback(() => {
    if (!columns.length || !visibleRows.length) return;
    downloadCsv(`sql-results-page-${page}.csv`, toCsv(columns, visibleRows));
  }, [columns, visibleRows, page]);

  const showPager = total > pageSize;

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: 2,
          py: 1.25,
          borderBottom: 1,
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="baseline">
          <Typography variant="subtitle1" component="h3">
            Query Results
          </Typography>
          {result ? (
            <Typography variant="caption" color="text.secondary">
              {total} {total === 1 ? 'row' : 'rows'}
              {provider ? ` \u00b7 ${provider}` : ''}
              {trimmedTerm ? ` \u00b7 ${visibleRows.length} on this page match` : ''}
            </Typography>
          ) : null}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Search"
            disabled={!result || pageRows.length === 0}
            inputProps={{ 'aria-label': 'Search the current page' }}
            helperText="Filters the current page"
            sx={{ minWidth: 200 }}
            FormHelperTextProps={{ sx: { mt: 0.25, mx: 0, whiteSpace: 'nowrap' } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Tooltip title="Download the current page as CSV">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleExport}
                disabled={!visibleRows.length}
              >
                CSV
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      <Box
        sx={{
          opacity: busy ? 0.55 : 1,
          transition: 'opacity 150ms ease',
          pointerEvents: busy ? 'none' : 'auto',
        }}
      >
        {idle && !result ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Run a query to see results.
            </Typography>
          </Box>
        ) : null}

        {result && total === 0 ? (
          // `role="status"`, not the Alert default of "alert": an empty result
          // is information, and must be distinguishable from the error alert
          // that reports a rejected statement.
          <Alert severity="info" role="status" sx={{ m: 2 }}>
            Query returned no rows.
          </Alert>
        ) : null}

        {result && total > 0 && visibleRows.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No rows on this page match &ldquo;{searchTerm}&rdquo;.
            </Typography>
          </Box>
        ) : null}

        {result && visibleRows.length > 0 ? (
          <ScrollArea
            tabIndex={0}
            role="region"
            aria-label="Query results table"
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell key={column.field} scope="col" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {column.title || column.field}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex} hover>
                    {columns.map((column) => (
                      <TableCell key={column.field} sx={{ fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        {row[column.field] === null || row[column.field] === undefined
                          ? ''
                          : String(row[column.field])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : null}

        {result && showPager ? (
          <TablePagination
            component="div"
            count={total}
            page={Math.max(0, page - 1)}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[10, 25, 50, 100]}
            onPageChange={(_event, nextPage) => onPageChange(nextPage + 1)}
            onRowsPerPageChange={(event) => onPageSizeChange(Number(event.target.value))}
            labelDisplayedRows={({ from, to, count }) => formatDisplayedRows({ from, to, count })}
            labelRowsPerPage="Rows per page:"
            sx={{ borderTop: 1, borderColor: 'divider' }}
          />
        ) : null}
      </Box>
    </Paper>
  );
};

export default ResultsGrid;
