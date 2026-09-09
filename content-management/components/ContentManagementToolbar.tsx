import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Chip,
  Stack,
  Tooltip,
  ButtonGroup,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewListIcon from '@mui/icons-material/ViewList';

import {
  ContentManagementToolbarProps,
  ContentStatusFilter,
  ContentFormatFilter,
  ContentFilterEntry,
  ContentFormat,
} from '../types';
import NewContentDialog from './NewContentDialog';
import { ContentEditorDrawer } from './ContentEditorDrawer';

export const ContentManagementToolbar: React.FC<ContentManagementToolbarProps> = ({
  reactory,
  data,
  filterState,
  onFilterChange,
  onRefresh,
  onAddNew,
  onSearchChange,
  viewMode = 'grid',
  onViewModeChange,
}) => {
  const [search, setSearch] = useState(filterState?.searchString || '');
  const [activeStatus, setActiveStatus] = useState<ContentStatusFilter>(filterState?.status || 'all');
  const [activeFormat, setActiveFormat] = useState<ContentFormatFilter>(filterState?.format || 'all');
  const [newContentDialogOpen, setNewContentDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeItemForEdit, setActiveItemForEdit] = useState<any>(null);

  const emitFilters = useCallback(
    (status: ContentStatusFilter, format: ContentFormatFilter) => {
      const filters: ContentFilterEntry[] = [];
      if (status !== 'all') {
        filters.push({ field: 'status', value: status });
      }
      if (format !== 'all') {
        filters.push({ field: 'format', value: format });
      }
      onFilterChange?.(filters);
    },
    [onFilterChange]
  );

  // Debounced search trigger
  useEffect(() => {
    const handler = setTimeout(() => {
      onSearchChange?.(search);
    }, 300);

    return () => clearTimeout(handler);
  }, [search, onSearchChange]);

  const handleClearSearch = useCallback(() => {
    setSearch('');
    onSearchChange?.('');
  }, [onSearchChange]);

  const handleStatusClick = (status: ContentStatusFilter) => {
    setActiveStatus(status);
    emitFilters(status, activeFormat);
  };

  const handleFormatClick = (format: ContentFormatFilter) => {
    setActiveFormat(format);
    emitFilters(activeStatus, format);
  };

  const handleResetFilters = useCallback(() => {
    setActiveStatus('all');
    setActiveFormat('all');
    setSearch('');
    onSearchChange?.('');
    emitFilters('all', 'all');
  }, [onSearchChange, emitFilters]);

  const hasActiveFilters = activeStatus !== 'all' || activeFormat !== 'all' || Boolean(search);

  const handleAddClick = () => {
    if (onAddNew) {
      onAddNew();
    } else {
      setNewContentDialogOpen(true);
    }
  };

  const handleCreateNewSubmit = async (newContent: {
    title: string;
    slug: string;
    description: string;
    format: ContentFormat;
    locale: string;
    topics: string[];
  }) => {
    setNewContentDialogOpen(false);
    try {
      const createInput = {
        title: newContent.title,
        slug: newContent.slug,
        description: newContent.description,
        format: newContent.format,
        locale: newContent.locale || 'en',
        topics: newContent.topics || [],
        content: '',
        published: false,
      };

      const result: any = await reactory.graphqlMutation(
        `mutation ReactoryCreateContent($createInput: CreateContentInput!) {
          ReactoryCreateContent(createInput: $createInput) {
            id
            slug
            title
            description
            content
            format
            locale
            topics
            published
            version
            template
            engine
            createdAt
            updatedAt
          }
        }`,
        { createInput }
      );

      const created = result?.data?.ReactoryCreateContent;
      if (created) {
        if (reactory?.emit) {
          reactory.emit('core.ContentSavedEvent', created);
          reactory.emit('core.ContentRefreshRequested', {});
        }
        onRefresh?.();
        setActiveItemForEdit(created);
        setEditorOpen(true);
      }
    } catch (err: any) {
      reactory?.log?.('Error creating new content item', err, 'error');
    }
  };

  useEffect(() => {
    const handleEditRequested = (item: any) => {
      setActiveItemForEdit(item);
      setEditorOpen(true);
    };

    reactory?.on?.('core.ContentEditRequested', handleEditRequested);
    return () => {
      reactory?.removeListener?.('core.ContentEditRequested', handleEditRequested);
    };
  }, [reactory]);

  const handleRefreshClick = () => {
    if (onRefresh) {
      onRefresh();
    } else if (reactory?.emit) {
      reactory.emit('core.ContentRefreshRequested', {});
    }
  };

  const totalCount = data?.paging?.total ?? data?.data?.length ?? 0;

  return (
    <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      {/* Top Row: Title, Total, View Mode, Actions */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Content Management
          </Typography>
          <Chip label={`${totalCount} items`} size="small" variant="outlined" color="default" />
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1}>
          {onViewModeChange && (
            <ButtonGroup size="small" sx={{ mr: 1 }}>
              <Button
                variant={viewMode === 'grid' ? 'contained' : 'outlined'}
                onClick={() => onViewModeChange('grid')}
                title="Grid View"
              >
                <TableViewIcon fontSize="small" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'contained' : 'outlined'}
                onClick={() => onViewModeChange('list')}
                title="List View"
              >
                <ViewListIcon fontSize="small" />
              </Button>
            </ButtonGroup>
          )}

          <Tooltip title="Refresh Content">
            <IconButton onClick={handleRefreshClick} size="small" sx={{ border: 1, borderColor: 'divider' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddClick}
            sx={{ fontWeight: 600 }}
          >
            New Content
          </Button>
        </Stack>
      </Stack>

      {/* Bottom Row: Search & Filters */}
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', lg: 'center' }}
        spacing={2}
      >
        {/* Search Field */}
        <TextField
          size="small"
          placeholder="Search content by title, slug or topic..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 320 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClearSearch} edge="end">
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />

        {/* Filter Pills */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mr: 0.5 }}>
            STATUS:
          </Typography>
          <Chip
            label="All"
            size="small"
            clickable
            color={activeStatus === 'all' ? 'primary' : 'default'}
            variant={activeStatus === 'all' ? 'filled' : 'outlined'}
            onClick={() => handleStatusClick('all')}
          />
          <Chip
            label="Published"
            size="small"
            clickable
            color={activeStatus === 'published' ? 'success' : 'default'}
            variant={activeStatus === 'published' ? 'filled' : 'outlined'}
            onClick={() => handleStatusClick('published')}
          />
          <Chip
            label="Drafts"
            size="small"
            clickable
            color={activeStatus === 'draft' ? 'warning' : 'default'}
            variant={activeStatus === 'draft' ? 'filled' : 'outlined'}
            onClick={() => handleStatusClick('draft')}
          />

          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: 'text.secondary', ml: 1.5, mr: 0.5 }}
          >
            FORMAT:
          </Typography>
          <Chip
            label="All"
            size="small"
            clickable
            color={activeFormat === 'all' ? 'primary' : 'default'}
            variant={activeFormat === 'all' ? 'filled' : 'outlined'}
            onClick={() => handleFormatClick('all')}
          />
          <Chip
            label="Markdown"
            size="small"
            clickable
            color={activeFormat === 'markdown' ? 'info' : 'default'}
            variant={activeFormat === 'markdown' ? 'filled' : 'outlined'}
            onClick={() => handleFormatClick('markdown')}
          />
          <Chip
            label="HTML"
            size="small"
            clickable
            color={activeFormat === 'html' ? 'secondary' : 'default'}
            variant={activeFormat === 'html' ? 'filled' : 'outlined'}
            onClick={() => handleFormatClick('html')}
          />
          {hasActiveFilters && (
            <Button
              size="small"
              color="inherit"
              variant="text"
              startIcon={<ClearIcon fontSize="small" />}
              onClick={handleResetFilters}
              sx={{ fontSize: '0.75rem', textTransform: 'none', ml: 1 }}
            >
              Reset all
            </Button>
          )}
        </Stack>
      </Stack>

      <NewContentDialog
        open={newContentDialogOpen}
        onClose={() => setNewContentDialogOpen(false)}
        onSubmit={handleCreateNewSubmit}
        reactory={reactory}
      />

      {editorOpen && activeItemForEdit && (
        <ContentEditorDrawer
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setActiveItemForEdit(null);
            onRefresh?.();
          }}
          contentData={activeItemForEdit}
          onSave={async (saved) => {
            if (reactory?.emit) {
              reactory.emit('core.ContentSavedEvent', saved);
              reactory.emit('core.ContentRefreshRequested', {});
            }
            onRefresh?.();
          }}
          reactory={reactory}
        />
      )}
    </Box>
  );
};

export default ContentManagementToolbar;
