import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Search as SearchIcon, Download as DownloadIcon } from '@mui/icons-material';
import ScrollArea from '../../data-grid/ScrollArea';
import { toCsv, downloadCsv } from '../../data-grid/csv';
import { cellText, rowMatches, columnsFromRows } from '../schema/resultShaper';
import type { GraphQLRow } from '../types';

export interface ResultDataGridProps {
  rows: GraphQLRow[];
  /** The root field the rows came from, used for the filename. */
  rootField?: string;
}

/**
 * Tabular view of a GraphQL result.
 *
 * The search box filters the rows currently in hand. Unlike the SQL editor
 * there is no server-side paging to contradict — the whole response is already
 * client-side — so this filter is over the full result, and says so.
 */
export const ResultDataGrid: React.FC<ResultDataGridProps> = ({ rows, rootField }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  const columns = useMemo(() => columnsFromRows(rows), [rows]);
  const trimmed = searchTerm.trim().toLowerCase();

  const visibleRows = useMemo(
    () => (trimmed ? rows.filter((row) => rowMatches(row, trimmed)) : rows),
    [rows, trimmed],
  );

  const handleExport = useCallback(() => {
    if (!columns.length || !visibleRows.length) return;
    downloadCsv(
      `${rootField || 'graphql'}-result.csv`,
      toCsv(columns, visibleRows.map((row) => {
        // Nested values are compacted for the grid, so export the same text the
        // user can see rather than a differently-shaped JSON blob.
        const flat: Record<string, any> = {};
        columns.forEach((column) => {
          flat[column.field] = cellText(row[column.field]);
        });
        return flat;
      })),
    );
  }, [columns, visibleRows, rootField]);

  if (rows.length === 0) {
    return (
      <Alert severity="info" role="status" sx={{ m: 2 }}>
        The query returned no rows to display.
      </Alert>
    );
  }

  return (
    <Box>
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
        <Typography variant="caption" color="text.secondary">
          {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          {rootField ? ` \u00b7 ${rootField}` : ''}
          {trimmed ? ` \u00b7 ${visibleRows.length} match` : ''}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search"
            inputProps={{ 'aria-label': 'Search results' }}
            helperText="Filters the result"
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
          <Tooltip title="Download the result as CSV">
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

      {visibleRows.length === 0 ? (
        <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No rows match &ldquo;{searchTerm}&rdquo;.
          </Typography>
        </Box>
      ) : (
        <ScrollArea tabIndex={0} role="region" aria-label="GraphQL results table">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={column.field}
                    scope="col"
                    sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    {column.title}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRows.map((row, rowIndex) => (
                <TableRow key={rowIndex} hover>
                  {columns.map((column) => (
                    <TableCell
                      key={column.field}
                      sx={{ fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      {cellText(row[column.field])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </Box>
  );
};

export default ResultDataGrid;
