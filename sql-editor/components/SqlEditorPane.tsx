import React, { useCallback, useMemo, useRef } from 'react';
import { styled } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import hljs from 'highlight.js/lib/core';
import sqlLanguage from 'highlight.js/lib/languages/sql';

// Register the SQL grammar on the shared highlight.js core instance. The host
// registers yaml/json/javascript/typescript; `registerLanguage` is idempotent
// for a repeated call with the same grammar, so this is safe on re-import.
hljs.registerLanguage('sql', sqlLanguage);

const INDENT = '  ';

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const editorTypography = (theme: any) => ({
  margin: 0,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '0.8125rem',
  lineHeight: 1.7,
  letterSpacing: 0,
  padding: theme.spacing(1.5),
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  overflowWrap: 'break-word' as const,
  tabSize: 2,
});

const EditorRoot = styled(Box)(({ theme }) => ({
  position: 'relative',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  overflow: 'hidden',
  transition: theme.transitions.create('border-color'),
  '&:focus-within': {
    borderColor: theme.palette.primary.main,
  },
}));

/**
 * Highlight overlay. Sits behind the transparent textarea and mirrors its
 * scroll position. `aria-hidden` because the textarea is the real control —
 * screen readers must read the value once, not twice.
 */
const EditorHighlight = styled('pre')(({ theme }) => {
  const isDark = theme.palette.mode === 'dark';
  return {
    ...editorTypography(theme),
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'auto',
    pointerEvents: 'none',
    color: theme.palette.text.primary,
    '& .hljs-keyword': { color: isDark ? '#c792ea' : '#7c4dff', fontWeight: 600 },
    '& .hljs-built_in': { color: isDark ? '#82aaff' : '#1565c0' },
    '& .hljs-string': { color: isDark ? '#c3e88d' : '#2e7d32' },
    '& .hljs-number': { color: isDark ? '#f78c6c' : '#c62828' },
    '& .hljs-comment': { color: theme.palette.text.disabled, fontStyle: 'italic' },
    '& .hljs-operator': { color: theme.palette.text.secondary },
    '& .hljs-punctuation': { color: theme.palette.text.secondary },
  };
});

const EditorTextarea = styled('textarea')(({ theme }) => ({
  ...editorTypography(theme),
  position: 'relative',
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  border: 'none',
  outline: 'none',
  resize: 'vertical',
  background: 'transparent',
  // The glyphs are painted by the overlay; the textarea supplies the caret,
  // selection and input behaviour. Keeping it transparent avoids double text.
  color: 'transparent',
  caretColor: theme.palette.text.primary,
  overflow: 'auto',
}));

export interface SqlEditorPaneProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  /** Invoked when the editor may be out of sync with the rendered results. */
  dirty?: boolean;
  disabled?: boolean;
  minRows?: number;
  label?: string;
}

/**
 * SQL input with syntax colouring.
 *
 * Deliberately a plain `<textarea>` with a highlight.js overlay rather than the
 * form-engine `RichEditor`: RichEditor is a form widget (it takes
 * `formData`/`onChange` and lives under `ux/mui/widgets`), and this plugin must
 * not depend on form-engine or widget internals. The overlay gives the same
 * colouring with none of that coupling.
 *
 * Behaviour: monospace, preserves whitespace, Tab inserts two spaces,
 * Cmd/Ctrl+Enter runs the query, and the caret is never fought (the textarea
 * remains the single source of input and selection).
 */
export const SqlEditorPane: React.FC<SqlEditorPaneProps> = ({
  value,
  onChange,
  onRun,
  dirty = false,
  disabled = false,
  minRows = 10,
  label = 'SQL Command',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  const id = 'sql-query-editor-command';
  const helperId = `${id}-helper`;

  const highlighted = useMemo(() => {
    const source = value || '';
    try {
      const html = hljs.highlight(source, {
        language: 'sql',
        ignoreIllegals: true,
      }).value;
      // A trailing newline needs a trailing glyph or the overlay collapses by
      // one line and the caret drifts away from the highlighted text.
      return source.endsWith('\n') ? `${html} ` : html;
    } catch (error) {
      return escapeHtml(source);
    }
  }, [value]);

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (!textarea || !highlight) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        onRun();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        const textarea = event.currentTarget;
        const { selectionStart, selectionEnd } = textarea;
        const next = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`;
        onChange(next);
        // Restore the caret after React commits the new value.
        const caret = selectionStart + INDENT.length;
        window.requestAnimationFrame(() => {
          const node = textareaRef.current;
          if (!node) return;
          node.selectionStart = caret;
          node.selectionEnd = caret;
        });
      }
    },
    [onChange, onRun, value],
  );

  return (
    <Box>
      <Typography
        component="label"
        htmlFor={id}
        variant="subtitle2"
        sx={{ display: 'block', mb: 0.5 }}
      >
        {label}
      </Typography>

      <EditorRoot>
        <EditorHighlight
          ref={highlightRef}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
        <EditorTextarea
          id={id}
          ref={textareaRef}
          value={value}
          rows={minRows}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-describedby={helperId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
        />
      </EditorRoot>

      <Typography
        id={helperId}
        variant="caption"
        color={dirty ? 'warning.main' : 'text.secondary'}
        sx={{ display: 'block', mt: 0.5 }}
      >
        Enter a single read-only SELECT statement. {'\u2318'}/Ctrl + Enter to run.
        {dirty ? ' The editor has changed since the last run \u2014 Run to apply it.' : ''}
      </Typography>
    </Box>
  );
};

export default SqlEditorPane;
