import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  Alert,
} from '@mui/material';
import { NewContentDialogProps, ContentFormat } from '../types';

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const NewContentDialog: React.FC<NewContentDialogProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<ContentFormat>('markdown');
  const [locale, setLocale] = useState('en');
  const [topicsText, setTopicsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!slugManuallyEdited) {
      setSlug(slugify(newTitle));
    }
  };

  const handleSlugChange = (newSlug: string) => {
    setSlugManuallyEdited(true);
    setSlug(slugify(newSlug));
  };

  const handleSubmit = useCallback(() => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!slug.trim()) {
      setError('Slug is required.');
      return;
    }

    setError(null);
    const topics = topicsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSubmit({
      title: title.trim(),
      slug: slug.trim(),
      description: description.trim(),
      format,
      locale: locale.trim() || 'en',
      topics,
    });

    // Reset form
    setTitle('');
    setSlug('');
    setSlugManuallyEdited(false);
    setDescription('');
    setFormat('markdown');
    setLocale('en');
    setTopicsText('');
  }, [title, slug, description, format, locale, topicsText, onSubmit]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Create New Content Item</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Content Title"
            required
            fullWidth
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. Terms of Service, Getting Started"
            autoFocus
          />

          <TextField
            label="Slug (URL identifier)"
            required
            fullWidth
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            helperText="Unique identifier used in routes and static content lookups"
            InputProps={{
              sx: { fontFamily: 'monospace' },
            }}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Format"
              fullWidth
              value={format}
              onChange={(e) => setFormat(e.target.value as ContentFormat)}
            >
              <MenuItem value="markdown">Markdown</MenuItem>
              <MenuItem value="html">HTML / Rich Text</MenuItem>
              <MenuItem value="text">Plain Text</MenuItem>
            </TextField>

            <TextField
              label="Default Locale"
              fullWidth
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              placeholder="en"
            />
          </Stack>

          <TextField
            label="Topics / Tags"
            fullWidth
            value={topicsText}
            onChange={(e) => setTopicsText(e.target.value)}
            placeholder="Comma-separated (e.g. docs, legal, footer)"
            helperText="Separate multiple tags with commas"
          />

          <TextField
            label="Description"
            fullWidth
            multiline
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief summary of this content item"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} color="primary">
          Create & Open Editor
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewContentDialog;
