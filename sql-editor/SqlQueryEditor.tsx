import React, { useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { PlayArrow as PlayArrowIcon } from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

import ConnectionSelect from './components/ConnectionSelect';
import SqlEditorPane from './components/SqlEditorPane';
import ResultsGrid from './components/ResultsGrid';
import { useSqlConnections } from './hooks/useSqlConnections';
import { useSqlQuery } from './hooks/useSqlQuery';

/** Remembers the last chosen connection between visits. */
const CONNECTION_STORAGE_KEY = 'reactory.sqlQueryEditor.connectionId';

export interface SqlQueryEditorProps {
  /** Injected when the host wraps the component with the API. */
  reactory?: any;
}

/**
 * SQL Query Editor.
 *
 * A purpose-built page component — no form engine, no widgets, no schema. It
 * owns its own run lifecycle so each of the (previously leaky) concerns stays
 * local:
 *
 *   - the connection picker reads its options from the connection query,
 *   - nothing executes until the user asks,
 *   - results derive *only* from a completed run,
 *   - paging re-runs the last-run statement, not a possibly-edited editor,
 *   - a failed run keeps the last good page on screen.
 *
 * All enforcement — single statement, SELECT/WITH only, no write keywords — is
 * server-side. The client surfaces the server's message verbatim and never
 * pre-validates the SQL (one implementation, one source of truth).
 */
export const SqlQueryEditor: React.FC<SqlQueryEditorProps> = ({ reactory: propReactory }) => {
  // The plugin registry entry cannot carry `wrapWithApi` (not part of
  // `IReactoryComponentRegistryEntry`), so read the SDK from context, falling
  // back to a prop when the host injects one.
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const {
    connections,
    loading: connectionsLoading,
    error: connectionsError,
  } = useSqlConnections(reactory);

  const {
    connectionId,
    commandText,
    searchTerm,
    runState,
    lastResult,
    isDirty,
    canRun,
    setConnectionId,
    setCommandText,
    setSearchTerm,
    run,
    goToPage,
    changePageSize,
  } = useSqlQuery(reactory);

  /**
   * Spec B1: preselect a remembered connection, or the only one available.
   * Never executes a query.
   */
  useEffect(() => {
    if (connectionsLoading || connections.length === 0) return;
    if (connectionId && connections.some((c) => c.connectionId === connectionId)) return;

    let remembered: string | null = null;
    try {
      remembered = window.localStorage.getItem(CONNECTION_STORAGE_KEY);
    } catch (error) {
      remembered = null;
    }

    const rememberedIsAvailable =
      Boolean(remembered) && connections.some((c) => c.connectionId === remembered);

    if (rememberedIsAvailable) {
      setConnectionId(remembered as string);
      return;
    }

    if (connections.length === 1) {
      setConnectionId(connections[0].connectionId);
    }
  }, [connections, connectionsLoading, connectionId, setConnectionId]);

  /** Persist the selection so a reload returns the user to the same connection. */
  useEffect(() => {
    if (!connectionId) return;
    try {
      window.localStorage.setItem(CONNECTION_STORAGE_KEY, connectionId);
    } catch (error) {
      /* storage unavailable (private mode) — selection simply is not remembered */
    }
  }, [connectionId]);

  const running = runState.status === 'running';
  const runDisabledReason = !connectionId
    ? 'Select a connection first'
    : !commandText || commandText.trim().length === 0
      ? 'Enter a SQL statement first'
      : undefined;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h1">
            SQL Query Editor
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Execute read-only SQL against connected relational databases
          </Typography>
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <ConnectionSelect
              connections={connections}
              value={connectionId}
              onChange={setConnectionId}
              loading={connectionsLoading}
              error={connectionsError}
              disabled={running}
            />
          </Box>

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'flex-start',
              pt: { xs: 0, md: 3 },
            }}
          >
            <Button
              type="button"
              variant="contained"
              color="primary"
              onClick={run}
              disabled={!canRun || connectionsLoading}
              title={runDisabledReason}
              aria-label="Execute Query"
              startIcon={
                running ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />
              }
            >
              Execute Query
            </Button>
          </Box>
        </Stack>

        <SqlEditorPane
          value={commandText}
          onChange={setCommandText}
          onRun={run}
          dirty={isDirty}
          disabled={running}
        />

        {running ? <LinearProgress /> : null}

        <Box aria-live="polite" aria-busy={running}>
          {runState.status === 'error' ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {runState.message}
            </Alert>
          ) : null}

          <ResultsGrid
            result={lastResult}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onPageChange={goToPage}
            onPageSizeChange={changePageSize}
            busy={running}
            idle={runState.status === 'idle'}
          />
        </Box>
      </Stack>
    </Container>
  );
};

export default SqlQueryEditor;
