import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import { hljs, type CodeLanguage } from './languages';

/**
 * Monospace code input with syntax colouring.
 *
 * A plain `<textarea>` with a highlight.js overlay painted behind it, rather
 * than the form-engine `RichEditor`. RichEditor is a form widget (it takes
 * `formData`/`onChange` and lives under `ux/mui/widgets`), and this plugin must
 * not depend on form-engine or widget internals — it also pulls in react-is /
 * rjsf, whose memo checks are broken under react 17 + react-is 18.
 *
 * The overlay matches the textarea's typography, padding and wrapping exactly,
 * and its scroll position is mirrored on scroll, so the two stay in register.
 * The textarea keeps a transparent foreground and owns the caret and selection,
 * which is what stops the overlay fighting the user's cursor.
 */

const INDENT = '  ';

/**
 * Instance counter for the control's DOM id.
 *
 * The id cannot be derived from the language: two panes of the same language
 * render on one page (a JSON variables pane and a JSON raw-output pane), which
 * would produce duplicate ids and — worse — a `<label for>` that resolves to
 * whichever element the browser finds first, associating the label with the
 * wrong control. React 17 has no `useId`, so a counter is used instead.
 */
let instanceCounter = 0;

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const MONOSPACE =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace';

const editorTypography = (theme: any) => ({
  margin: 0,
  fontFamily: MONOSPACE,
  fontSize: '0.8125rem',
  lineHeight: 1.7,
  letterSpacing: 0,
  padding: theme.spacing(1.5),
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  overflowWrap: 'break-word' as const,
  tabSize: 2,
});

/**
 * `plain` drops the border and background so the pane can sit inside a Paper
 * without producing a box-in-a-box; the focus affordance moves to an outline.
 */
const EditorRoot = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'plain',
})<{ plain?: boolean }>(({ theme, plain }) => ({
  position: 'relative',
  overflow: 'hidden',
  borderRadius: theme.shape.borderRadius,
  transition: theme.transitions.create(['border-color', 'outline-color']),
  ...(plain === true
    ? {
        outline: '2px solid transparent',
        outlineOffset: -2,
        '&:focus-within': {
          outlineColor: theme.palette.primary.main,
        },
      }
    : {
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
        '&:focus-within': {
          borderColor: theme.palette.primary.main,
        },
      }),
}));

/** Highlight overlay: `aria-hidden` so the textarea is the single source to AT. */
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
    '& .hljs-variable': { color: isDark ? '#f07178' : '#ad1457' },
    '& .hljs-attr': { color: isDark ? '#ffcb6b' : '#ef6c00' },
    '& .hljs-symbol': { color: isDark ? '#f07178' : '#ad1457' },
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
  color: 'transparent',
  caretColor: theme.palette.text.primary,
  overflow: 'auto',
  // A read-only view needs its text visible: there is no caret to follow.
  '&[readonly]': {
    color: theme.palette.text.primary,
  },
}));

export interface CodeEditorPaneProps {
  language: CodeLanguage;
  value: string;
  onChange?: (value: string) => void;
  /** Bound to Cmd/Ctrl+Enter. Omit to disable the shortcut. */
  onRun?: () => void;
  label?: string;
  /** Rendered under the editor. Takes precedence over `defaultHelper`. */
  helperText?: React.ReactNode;
  /** Muted guidance shown when `helperText` is absent. */
  defaultHelper?: React.ReactNode;
  /** Tints the helper to signal an unsaved change. */
  helperTone?: 'muted' | 'warning';
  minRows?: number;
  variant?: 'outlined' | 'plain';
  readOnly?: boolean;
  disabled?: boolean;
  /** Override the generated DOM id. Rarely needed; ids are unique by default. */
  id?: string;
}

export const CodeEditorPane: React.FC<CodeEditorPaneProps> = ({
  language,
  value,
  onChange,
  onRun,
  label,
  helperText,
  defaultHelper,
  helperTone = 'muted',
  minRows = 10,
  variant = 'outlined',
  readOnly = false,
  disabled = false,
  id: idProp,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  // Stable per instance, unique across instances.
  const [generatedId] = useState(() => {
    instanceCounter += 1;
    return `code-editor-${instanceCounter}`;
  });

  const id = idProp || generatedId;
  const helperId = `${id}-helper`;

  const highlighted = useMemo(() => {
    const source = value || '';
    try {
      const html = hljs.highlight(source, { language, ignoreIllegals: true }).value;
      // A trailing newline needs a trailing glyph, or the overlay collapses by
      // one line and the caret drifts away from the highlighted text.
      return source.endsWith('\n') ? `${html} ` : html;
    } catch (error) {
      return escapeHtml(source);
    }
  }, [value, language]);

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (!textarea || !highlight) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }, []);

  // Keep the overlay aligned when the value changes outside a keystroke (e.g. a
  // programmatic reset), which does not fire onScroll.
  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        if (!onRun) return;
        event.preventDefault();
        onRun();
        return;
      }

      if (event.key === 'Tab' && readOnly === false && onChange) {
        event.preventDefault();
        const textarea = event.currentTarget;
        const { selectionStart, selectionEnd } = textarea;
        const next = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`;
        onChange(next);
        const caret = selectionStart + INDENT.length;
        window.requestAnimationFrame(() => {
          const node = textareaRef.current;
          if (!node) return;
          node.selectionStart = caret;
          node.selectionEnd = caret;
        });
      }
    },
    [onChange, onRun, readOnly, value],
  );

  const resolvedHelper = helperText !== undefined ? helperText : defaultHelper;

  return (
    <Box>
      {label ? (
        <Typography
          component="label"
          htmlFor={id}
          variant="subtitle2"
          sx={{ display: 'block', mb: 0.5 }}
        >
          {label}
        </Typography>
      ) : null}

      <EditorRoot plain={variant === 'plain'}>
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
          readOnly={readOnly}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-label={label || `${language} editor`}
          aria-describedby={resolvedHelper ? helperId : undefined}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
        />
      </EditorRoot>

      {resolvedHelper ? (
        <Typography
          id={helperId}
          variant="caption"
          color={helperTone === 'warning' ? 'warning.main' : 'text.secondary'}
          sx={{ display: 'block', mt: 0.5 }}
        >
          {resolvedHelper}
        </Typography>
      ) : null}
    </Box>
  );
};

export default CodeEditorPane;
