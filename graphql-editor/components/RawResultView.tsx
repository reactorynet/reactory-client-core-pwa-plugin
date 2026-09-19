import React, { useMemo, useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { CodeEditorPane } from '../../code-editor/CodeEditorPane';
import { toJsonText, toYaml } from '../schema/yaml';
import type { RawFormat } from '../types';

export interface RawResultViewProps {
  /** The payload to serialise — the GraphQL `data`, not the whole envelope. */
  value: any;
  /** Errors are worth showing here too: they are part of the raw response. */
  errors?: any[] | null;
  extensions?: Record<string, any> | null;
}

/**
 * Raw serialisation of a result.
 *
 * Read-only: the editor pane is reused purely for its monospace rendering and
 * syntax colouring, with `onChange` omitted so it cannot be typed into.
 */
export const RawResultView: React.FC<RawResultViewProps> = ({
  value,
  errors,
  extensions,
}) => {
  const [format, setFormat] = useState<RawFormat>('json');

  const payload = useMemo(() => {
    const envelope: Record<string, any> = { data: value ?? null };
    if (errors && errors.length > 0) envelope.errors = errors;
    if (extensions && Object.keys(extensions).length > 0) envelope.extensions = extensions;
    return envelope;
  }, [value, errors, extensions]);

  const text = useMemo(
    () => (format === 'yaml' ? toYaml(payload) : toJsonText(payload)),
    [payload, format],
  );

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={format}
          onChange={(_event, next: RawFormat | null) => {
            if (next) setFormat(next);
          }}
          aria-label="Raw output format"
        >
          <ToggleButton value="json" aria-label="JSON">
            JSON
          </ToggleButton>
          <ToggleButton value="yaml" aria-label="YAML">
            YAML
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <CodeEditorPane
        language={format === 'yaml' ? 'yaml' : 'json'}
        value={text}
        readOnly
        minRows={18}
        label={format === 'yaml' ? 'Raw result (YAML)' : 'Raw result (JSON)'}
      />
    </Box>
  );
};

export default RawResultView;
