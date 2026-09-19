import React from 'react';
import CodeEditorPane from '../../code-editor/CodeEditorPane';

export interface SqlEditorPaneProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  /** Invoked when the editor may be out of sync with the rendered results. */
  dirty?: boolean;
  disabled?: boolean;
  minRows?: number;
  label?: string;
  /**
   * `plain` renders the editor without its own border/background, for use
   * inside a Paper. Defaults to `outlined` for standalone use.
   */
  variant?: 'outlined' | 'plain';
}

/**
 * SQL input.
 *
 * A thin configuration of the shared `CodeEditorPane`: the editor mechanics
 * (monospace, highlight.js overlay, Tab indentation, Cmd/Ctrl+Enter) live there
 * so the GraphQL editor shares them rather than reimplementing them.
 */
export const SqlEditorPane: React.FC<SqlEditorPaneProps> = ({
  value,
  onChange,
  onRun,
  dirty = false,
  disabled = false,
  minRows = 10,
  label = 'SQL Command',
  variant = 'outlined',
}) => (
  <CodeEditorPane
    language="sql"
    value={value}
    onChange={onChange}
    onRun={onRun}
    label={label}
    minRows={minRows}
    variant={variant}
    disabled={disabled}
    helperTone={dirty ? 'warning' : 'muted'}
    defaultHelper={
      <>
        Enter a single read-only SELECT statement. {'\u2318'}/Ctrl + Enter to run.
        {dirty
          ? ' The editor has changed since the last run \u2014 Run to apply it.'
          : ''}
      </>
    }
  />
);

export default SqlEditorPane;
