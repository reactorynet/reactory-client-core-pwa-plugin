import React, { useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Stack,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import { useReactory } from '@reactory/client-core/api';
import CMSContentEditor, { CMSContentData } from '@reactory/client-core/components/shared/StaticContent/CMSContentEditor';
import { ContentEditorDrawerProps } from '../types';

export const ContentEditorDrawer: React.FC<ContentEditorDrawerProps> = ({
  open,
  onClose,
  contentData,
  onSave,
  reactory: propReactory,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const handleSave = useCallback(
    async (saved: CMSContentData) => {
      await onSave?.(saved);
      if (reactory?.emit) {
        reactory.emit('core.ContentSavedEvent', saved);
      }
    },
    [onSave, reactory]
  );

  if (!contentData) return null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: '85vw', md: '75vw', lg: '65vw' },
          maxWidth: '1200px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
        },
      }}
    >
      {/* Drawer Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ p: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {contentData.id ? `Edit: ${contentData.title || contentData.slug}` : `New: ${contentData.title || contentData.slug}`}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            slug: {contentData.slug}
          </Typography>
        </Box>

        <IconButton onClick={onClose} size="small" edge="end">
          <CloseIcon />
        </IconButton>
      </Stack>

      <Divider />

      {/* Drawer Body */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: { xs: 1.5, sm: 2.5 } }}>
        <CMSContentEditor
          initialData={contentData}
          onSave={handleSave}
          onCancel={onClose}
          displayMode="drawer"
          reactory={reactory}
        />
      </Box>
    </Drawer>
  );
};

export default ContentEditorDrawer;
