import React from 'react';
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  FormHelperText,
  Stack,
  Typography,
} from '@mui/material';
import type { SqlDataConnection } from '../types';

export interface ConnectionSelectProps {
  connections: SqlDataConnection[];
  value: string;
  onChange: (connectionId: string) => void;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
}

const ID = 'sql-query-editor-connection';
const LABEL_ID = `${ID}-label`;
const HELPER_ID = `${ID}-helper`;

/** Display name for a connection: authored label, else title, else the setting name. */
export const connectionLabel = (connection: SqlDataConnection): string =>
  connection.label || connection.title || connection.connectionId;

/** Cheap secondary line: variant and database, when present. */
export const connectionDetail = (connection: SqlDataConnection): string =>
  [connection.variant, connection.database].filter(Boolean).join(' \u00b7 ');

/**
 * Connection picker.
 *
 * Uses a real `FormControl` + `InputLabel` + `Select` association so the
 * control is properly labelled for assistive technology, and renders only the
 * fields the server returns — the API never sends credentials and the client
 * must not ask for them.
 */
export const ConnectionSelect: React.FC<ConnectionSelectProps> = ({
  connections,
  value,
  onChange,
  loading = false,
  error = null,
  disabled = false,
}) => {
  const helper = error
    ? error
    : loading
      ? 'Loading data connections\u2026'
      : 'Select the connection to query';

  return (
    <FormControl
      fullWidth
      size="small"
      disabled={disabled || loading}
      error={Boolean(error)}
    >
      <InputLabel id={LABEL_ID}>Database Connection</InputLabel>
      <Select
        labelId={LABEL_ID}
        id={ID}
        label="Database Connection"
        value={value || ''}
        aria-describedby={HELPER_ID}
        onChange={(event) => onChange(String(event.target.value))}
        renderValue={(selected) => {
          const found = connections.find(
            (connection) => connection.connectionId === selected,
          );
          if (found) return <span>{connectionLabel(found)}</span>;
          return (
            <Typography component="span" variant="body2" color="text.secondary">
              Select a connection
            </Typography>
          );
        }}
      >
        {connections.map((connection) => {
          const detail = connectionDetail(connection);
          return (
            <MenuItem key={connection.connectionId} value={connection.connectionId}>
              <Stack spacing={0}>
                <Typography variant="body2">{connectionLabel(connection)}</Typography>
                {detail ? (
                  <Typography variant="caption" color="text.secondary">
                    {detail}
                  </Typography>
                ) : null}
              </Stack>
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText id={HELPER_ID}>{helper}</FormHelperText>
    </FormControl>
  );
};

export default ConnectionSelect;
