import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { PlayArrow as PlayArrowIcon } from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';
import { CodeEditorPane } from '../code-editor/CodeEditorPane';
import ResultsViewer from './components/ResultsViewer';
import { useGraphQLSchema } from './hooks/useGraphQLSchema';
import { useGraphQLExecution } from './hooks/useGraphQLExecution';

export interface GraphQLEditorProps {
  /** Injected when the host wraps the component with the API. */
  reactory?: any;
}

/**
 * GraphQL Query Editor.
 *
 * Runs queries and mutations against the Reactory GraphQL API, and presents the
 * result three ways:
 *
 *   - **Grid**   — tabular, for list-shaped results.
 *   - **Raw**    — the response envelope as JSON or YAML.
 *   - **Component** — a Reactory form generated from the result's schema type.
 *
 * The component view is what makes introspection necessary: the document says
 * which fields were selected, the schema says what they are. Everything the
 * editor knows about types comes from `useGraphQLSchema`; when that is
 * unavailable the component view explains itself and the other two views are
 * unaffected.
 *
 * No SQL-style read-only guard exists here, by design: this editor's whole
 * purpose is to run mutations. The route is role-gated at DEVELOPER/ADMIN, and
 * every operation executes under the caller's own credentials server-side.
 */
export const GraphQLEditor: React.FC<GraphQLEditorProps> = ({ reactory: propReactory }) => {
  // The plugin registry entry cannot carry `wrapWithApi` (not part of
  // `IReactoryComponentRegistryEntry`), so read the SDK from context with a
  // prop fallback — matching the other panels in this plugin.
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const {
    document,
    variablesText,
    operationName,
    runState,
    variablesError,
    isDirty,
    isMutation,
    canRun,
    setDocument,
    setVariablesText,
    setOperationName,
    run,
  } = useGraphQLExecution(reactory);

  const { schema, view, loading: schemaLoading, error: schemaError } = useGraphQLSchema(reactory);

  const running = runState.status === 'running';
  const result = runState.status === 'success' ? runState.result : null;
  const lastRunDocument = runState.status === 'success' ? document : document;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h5" component="h1">
              GraphQL Editor
            </Typography>
            <Chip
              size="small"
              label={isMutation ? 'mutation' : 'query'}
              color={isMutation ? 'warning' : 'default'}
              variant={isMutation ? 'filled' : 'outlined'}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Execute GraphQL queries and mutations against the Reactory API
          </Typography>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'flex-start' }}
          >
            <TextField
              size="small"
              label="Operation Name"
              value={operationName}
              onChange={(event) => setOperationName(event.target.value)}
              placeholder="Optional"
              helperText="Optional, when the document declares more than one operation"
              sx={{ flexGrow: 1, minWidth: 0, maxWidth: 420 }}
            />

            <Box sx={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
              <Button
                type="button"
                variant="contained"
                color={isMutation ? 'warning' : 'primary'}
                onClick={run}
                disabled={!canRun}
                title={canRun ? undefined : 'Enter a GraphQL document first'}
                aria-label={isMutation ? 'Execute Mutation' : 'Execute Query'}
                startIcon={
                  running ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />
                }
              >
                {isMutation ? 'Execute Mutation' : 'Execute Query'}
              </Button>
            </Box>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <CodeEditorPane
            language="graphql"
            value={document}
            onChange={setDocument}
            onRun={run}
            label="GraphQL Document"
            minRows={12}
            variant="plain"
            disabled={running}
            helperTone={isDirty ? 'warning' : 'muted'}
            defaultHelper={
              <>
                Enter a query or mutation. {'\u2318'}/Ctrl + Enter to run.
                {isDirty
                  ? ' The editor has changed since the last run \u2014 Run to apply it.'
                  : ''}
              </>
            }
          />
        </Paper>

        <Paper sx={{ p: 2 }}>
          <CodeEditorPane
            language="json"
            value={variablesText}
            onChange={setVariablesText}
            label="Variables (JSON)"
            minRows={4}
            variant="plain"
            disabled={running}
            helperText={
              variablesError ? (
                <span>{variablesError}</span>
              ) : (
                'A JSON object, or { } when the document takes no arguments.'
              )
            }
            helperTone={variablesError ? 'warning' : 'muted'}
          />
        </Paper>

        <Box aria-live="polite" aria-busy={running}>
          {running ? <LinearProgress sx={{ mb: 2, borderRadius: 1 }} /> : null}

          {runState.status === 'error' ? (
            <Alert severity="error" role="alert" sx={{ mb: 2 }}>
              {runState.message}
            </Alert>
          ) : null}

          {result ? (
            <ResultsViewer
              result={result}
              document={lastRunDocument}
              schema={schema}
              schemaError={schemaError}
              schemaView={view}
            />
          ) : (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Run a query or mutation to see results.
              </Typography>
              {schemaLoading ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Loading the schema for the component view{'\u2026'}
                </Typography>
              ) : null}
              {schemaError && !schemaLoading ? (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                  Schema unavailable ({schemaError}). The grid and raw views still work; the
                  component view will not.
                </Typography>
              ) : null}
            </Paper>
          )}
        </Box>
      </Stack>
    </Container>
  );
};

export default GraphQLEditor;
