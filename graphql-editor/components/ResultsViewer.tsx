import React, { useMemo } from 'react';
import { Alert, Box, Paper, Tab, Tabs, Typography } from '@mui/material';
import {
  GridOn as GridIcon,
  Code as CodeIcon,
  AccountTree as ComponentIcon,
} from '@mui/icons-material';
import ResultDataGrid from './ResultDataGrid';
import RawResultView from './RawResultView';
import DynamicResultView from './DynamicResultView';
import { toGridData } from '../schema/resultShaper';
import type { GraphQLExecutionResult, GraphQLSchemaView, ResultViewMode } from '../types';

export interface ResultsViewerProps {
  result: GraphQLExecutionResult;
  /** The document that produced the result, needed to resolve its type. */
  document: string;
  schema: any | null;
  schemaError?: string | null;
  schemaView?: GraphQLSchemaView | null;
}

/**
 * The three result presentations.
 *
 * The tab is deliberately not persisted across runs: a mutation returning a
 * scalar should not be forced into whatever view the previous query used.
 */
export const ResultsViewer: React.FC<ResultsViewerProps> = ({
  result,
  document,
  schema,
  schemaError,
  schemaView,
}) => {
  const [mode, setMode] = React.useState<ResultViewMode>('grid');

  const data = result?.data ?? null;
  const errors = result?.errors ?? null;
  const hasErrors = Boolean(errors && errors.length > 0);

  const gridData = useMemo(() => toGridData(data), [data]);

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Typography variant="subtitle1" component="h3">
            Result
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {result.executionTime !== undefined ? `${result.executionTime} ms` : ''}
            {result.success === false ? ' \u00b7 failed' : ''}
          </Typography>
        </Box>

        <Tabs
          value={mode}
          onChange={(_event, next: ResultViewMode) => setMode(next)}
          aria-label="Result view"
        >
          <Tab value="grid" icon={<GridIcon />} iconPosition="start" label="Grid" />
          <Tab value="raw" icon={<CodeIcon />} iconPosition="start" label="Raw" />
          <Tab
            value="component"
            icon={<ComponentIcon />}
            iconPosition="start"
            label="Component"
          />
        </Tabs>
      </Box>

      {hasErrors ? (
        <Alert severity="error" role="alert" sx={{ m: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            GraphQL returned {errors!.length} error{errors!.length === 1 ? '' : 's'}
          </Typography>
          {errors!.map((error, index) => (
            <Typography key={index} variant="body2" component="div">
              {error?.message || JSON.stringify(error)}
            </Typography>
          ))}
        </Alert>
      ) : null}

      {mode === 'grid' ? (
        <ResultDataGrid rows={gridData.rows} rootField={gridData.rootField} />
      ) : null}

      {mode === 'raw' ? (
        <RawResultView
          value={data}
          errors={errors}
          extensions={result.extensions ?? null}
        />
      ) : null}

      {mode === 'component' ? (
        <DynamicResultView
          schema={schema}
          schemaError={schemaError}
          document={document}
          data={data}
          schemaView={schemaView}
        />
      ) : null}
    </Paper>
  );
};

export default ResultsViewer;
