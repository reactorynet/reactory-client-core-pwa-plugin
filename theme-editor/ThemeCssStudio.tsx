/**
 * ThemeCssStudio — controlled CSS editor/publisher dialog for a theme's
 * `styles.css`.
 *
 * Transport agnostic by design: the caller supplies `content`, `onChange` and
 * `onPublish` (where its GraphQL mutation lives). No GraphQL here.
 */
import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Typography,
} from '@mui/material';
import { AutoAwesome as AutoAwesomeIcon, Code as CodeIcon, Publish as PublishIcon } from '@mui/icons-material';
import { DEFAULT_CSS_TEMPLATE } from './themeDefaults';
import type { ThemeCssStudioProps } from './types';

const ThemeCssStudio: React.FC<ThemeCssStudioProps> = ({
  open,
  themeName,
  content,
  onChange,
  onPublish,
  onClose,
  publishing = false,
  readOnly = false,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CodeIcon color="secondary" />
        <Typography variant="h6">CSS Studio: {themeName}/styles.css</Typography>
      </Box>
      {!readOnly && (
        <Button
          variant="contained"
          color="secondary"
          startIcon={<PublishIcon />}
          onClick={onPublish}
          disabled={publishing}
        >
          {publishing ? <CircularProgress size={20} /> : 'Publish CSS to Theme Directory'}
        </Button>
      )}
    </DialogTitle>
    <Divider />
    <DialogContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Published directly to: <code>themes/{themeName}/styles.css</code> (Served via CDN)
        </Typography>
        <Button
          size="small"
          startIcon={<AutoAwesomeIcon />}
          disabled={readOnly}
          onClick={() => onChange(DEFAULT_CSS_TEMPLATE)}
        >
          Insert Starter Snippet
        </Button>
      </Box>
      <TextField
        fullWidth
        multiline
        rows={18}
        value={content}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        InputProps={{
          sx: {
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            bgcolor: 'background.default',
          },
        }}
      />
    </DialogContent>
    <Divider />
    <DialogActions sx={{ p: 2 }}>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
);

export default ThemeCssStudio;
