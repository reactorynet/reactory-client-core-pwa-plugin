import React, { useState, useEffect, useCallback } from 'react';
import { Box, Paper } from '@mui/material';
import { compose } from 'redux';
import { withReactory } from '@reactory/client-core/api/ApiProvider';
import { ReactoryForm } from '@reactory/client-core/components/reactory/ReactoryForm';
import { CMSContentData } from '@reactory/client-core/components/shared/StaticContent/CMSContentEditor';

import ContentEditorDrawer from '../components/ContentEditorDrawer';
import NewContentDialog from '../components/NewContentDialog';
import { ContentManagementListForm } from '../forms';
import { IContentItem, ContentFormat } from '../types';
import amq from '@reactory/client-core/amq';

export interface ContentManagementPageProps {
  reactory: Reactory.Client.ReactorySDK;
}

export const ContentManagementPageComponent: React.FC<ContentManagementPageProps> = ({
  reactory,
}) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedContent, setSelectedContent] = useState<CMSContentData | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const handleOpenEditor = useCallback((item: IContentItem | CMSContentData) => {
    setSelectedContent({
      id: item.id,
      slug: item.slug,
      title: item.title,
      description: item.description,
      content: item.content || '',
      format: item.format || 'markdown',
      locale: item.locale || 'en',
      topics: item.topics || [],
      published: item.published ?? true,
      version: item.version || '1.0.0',
      template: item.template ?? false,
      engine: item.engine || 'none',
      helpTopic: item.helpTopic || '',
    });
    setEditorOpen(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditorOpen(false);
    setSelectedContent(null);
  }, []);

  const handleOpenNewDialog = useCallback(() => {
    setNewDialogOpen(true);
  }, []);

  const handleCloseNewDialog = useCallback(() => {
    setNewDialogOpen(false);
  }, []);

  const handleNewContentSubmit = useCallback(
    (newData: {
      slug: string;
      title: string;
      description: string;
      format: ContentFormat;
      locale: string;
      topics: string[];
    }) => {
      setNewDialogOpen(false);
      handleOpenEditor({
        slug: newData.slug,
        title: newData.title,
        description: newData.description,
        format: newData.format,
        locale: newData.locale,
        topics: newData.topics,
        published: true,
        content: '',
      } as any);
    },
    [handleOpenEditor]
  );

  // Subscribe to bus events
  useEffect(() => {
    const editSubscription = amq.$sub.def('core.ContentEditRequested', (data: any) => {
      if (data) handleOpenEditor(data);
    });

    const createSubscription = amq.$sub.def('core.ContentCreateRequested', () => {
      handleOpenNewDialog();
    });

    return () => {
      if (editSubscription?.unsubscribe) editSubscription.unsubscribe();
      if (createSubscription?.unsubscribe) createSubscription.unsubscribe();
    };
  }, [handleOpenEditor, handleOpenNewDialog]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, width: '100%' }}>
      <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <ReactoryForm
          formDef={ContentManagementListForm}
          formId="core.ContentManagementList@1.0.0"
          reactory={reactory}
        />
      </Paper>

      {/* Slide-out Content Editor Drawer */}
      <ContentEditorDrawer
        open={editorOpen}
        onClose={handleCloseEditor}
        contentData={selectedContent}
        reactory={reactory}
      />

      {/* New Content Dialog */}
      <NewContentDialog
        open={newDialogOpen}
        onClose={handleCloseNewDialog}
        onSubmit={handleNewContentSubmit}
        reactory={reactory}
      />
    </Box>
  );
};

export const ContentManagementPage = compose(withReactory)(ContentManagementPageComponent);
export default ContentManagementPage;
