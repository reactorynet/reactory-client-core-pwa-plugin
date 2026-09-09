import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Button,
  Chip,
  Paper,
  Divider,
  Stack,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TranslateIcon from '@mui/icons-material/Translate';
import VisibilityIcon from '@mui/icons-material/Visibility';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CodeIcon from '@mui/icons-material/Code';
import CheckIcon from '@mui/icons-material/Check';

import { useReactory } from '@reactory/client-core/api';
import StaticContent from '@reactory/client-core/components/shared/StaticContent/StaticContent';
import useStaticContent from '@reactory/client-core/components/shared/StaticContent/hooks/useStaticContent';
import { useContentRender } from '@reactory/client-core/components/shared/hooks/useContentRender';
import { coerceFormat, markdownToHtml } from '@reactory/client-core/components/shared/StaticContent/format';
import { ContentDetailPanelProps, IContentItem } from '../types';
import ContentStatusBadge from './widgets/ContentStatusBadge';
import ContentFormatBadge from './widgets/ContentFormatBadge';

export const ContentDetailPanel: React.FC<ContentDetailPanelProps> = ({
  reactory: propReactory,
  content,
  rowData,
  onEdit,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;
  const rawItem: IContentItem = (content || rowData) as IContentItem;
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const { record, loadState, reload } = useStaticContent({
    reactory,
    slug: rawItem?.slug,
    canEdit: true,
  });

  const item: IContentItem = (record as unknown as IContentItem) || rawItem;

  const { renderContent } = useContentRender(reactory);

  const handleCopySlug = useCallback(() => {
    if (item?.slug && navigator.clipboard) {
      navigator.clipboard.writeText(item.slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [item?.slug]);

  const handleEditClick = useCallback(() => {
    if (onEdit) {
      onEdit(item);
    } else {
      setIsEditing(true);
    }
  }, [item, onEdit]);

  const previewHtml = useMemo(() => {
    if (!item?.content) return null;
    const format = coerceFormat(item.format, item.content);
    const body = format === 'markdown' ? markdownToHtml(item.content) : item.content;
    return renderContent(body);
  }, [item?.content, item?.format, renderContent]);

  if (isEditing && item?.slug) {
    return (
      <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Editing: {item?.title || item?.slug}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setIsEditing(false)}
          >
            Back to Details
          </Button>
        </Stack>
        <StaticContent
          id={`content-editor-${item.slug}`}
          slug={item.slug}
          isEditing={true}
          editDisplayMode="inline"
          editRoles={['USER', 'ADMIN', 'DEVELOPER']}
          onSaved={(savedRecord) => {
            setIsEditing(false);
            reload();
            if (reactory?.emit) {
              reactory.emit('core.ContentSavedEvent', savedRecord);
            }
          }}
          onCancel={() => setIsEditing(false)}
        />
      </Box>
    );
  }

  if (!item) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No content record available.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50') }}>
      {/* Detail Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
              {item.title || item.slug}
            </Typography>
            <ContentStatusBadge value={item.published} />
            <ContentFormatBadge value={item.format} />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
              slug: {item.slug}
            </Typography>
            <Tooltip title={copied ? 'Copied!' : 'Copy slug'}>
              <IconButton size="small" onClick={handleCopySlug} sx={{ p: 0.25 }}>
                {copied ? <CheckIcon fontSize="inherit" color="success" /> : <ContentCopyIcon fontSize="inherit" />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            startIcon={<EditIcon />}
            onClick={handleEditClick}
          >
            Edit Content
          </Button>
        </Stack>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {/* Navigation Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, val) => setActiveTab(val)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 38 }}
      >
        <Tab icon={<VisibilityIcon fontSize="small" />} iconPosition="start" label="Live Preview" sx={{ minHeight: 38 }} />
        <Tab icon={<InfoOutlinedIcon fontSize="small" />} iconPosition="start" label="Overview & Properties" sx={{ minHeight: 38 }} />
        <Tab
          icon={<TranslateIcon fontSize="small" />}
          iconPosition="start"
          label={`Translations (${item.translations?.length || 0})`}
          sx={{ minHeight: 38 }}
        />
        <Tab icon={<CodeIcon fontSize="small" />} iconPosition="start" label="JSON Source" sx={{ minHeight: 38 }} />
      </Tabs>

      {/* Tab Panels */}
      <Box sx={{ mt: 2 }}>
        {/* Tab 0: Live Preview */}
        {activeTab === 0 && (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              minHeight: 180,
              bgcolor: 'background.paper',
              borderRadius: 1,
            }}
          >
            {item.content ? (
              <Box className="content-render-preview">{previewHtml}</Box>
            ) : (
              <Typography color="text.secondary" fontStyle="italic">
                No content body entered yet.
              </Typography>
            )}
          </Paper>
        )}

        {/* Tab 1: Properties Table */}
        {activeTab === 1 && (
          <Paper variant="outlined" sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, width: 180 }}>Title</TableCell>
                  <TableCell>{item.title || '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Slug</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{item.slug}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                  <TableCell>{item.description || '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Format</TableCell>
                  <TableCell>{item.format || 'html'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Source Locale</TableCell>
                  <TableCell>{item.locale || 'en'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Version</TableCell>
                  <TableCell>{item.version || '1.0.0'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Template</TableCell>
                  <TableCell>{item.template ? 'Yes' : 'No'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Topics</TableCell>
                  <TableCell>
                    {item.topics && item.topics.length > 0 ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {item.topics.map((t) => (
                          <Chip key={t} label={t} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Roles</TableCell>
                  <TableCell>
                    {item.roles && item.roles.length > 0 ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {item.roles.map((r) => (
                          <Chip key={r} label={r} size="small" color="secondary" variant="outlined" />
                        ))}
                      </Stack>
                    ) : (
                      'All permitted users'
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Updated At</TableCell>
                  <TableCell>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Created At</TableCell>
                  <TableCell>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>
        )}

        {/* Tab 2: Translations */}
        {activeTab === 2 && (
          <Box>
            {item.translations && item.translations.length > 0 ? (
              <Stack spacing={1.5}>
                {item.translations.map((tr) => (
                  <Paper
                    key={tr.lang}
                    variant="outlined"
                    sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1 }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={tr.lang.toUpperCase()} size="small" color="primary" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {tr.title || 'Untitled Translation'}
                        </Typography>
                        {tr.stale && (
                          <Chip label="Stale" size="small" color="warning" variant="outlined" />
                        )}
                        {tr.machineTranslated && (
                          <Chip label="AI Translated" size="small" color="info" variant="outlined" />
                        )}
                      </Stack>
                    </Stack>
                    {tr.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {tr.description}
                      </Typography>
                    )}
                    {tr.content && (
                      <Box
                        sx={{
                          p: 1.5,
                          bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                          borderRadius: 1,
                          maxHeight: 120,
                          overflow: 'auto',
                          fontSize: '0.85rem',
                        }}
                      >
                        {tr.content.slice(0, 300)}
                        {tr.content.length > 300 && '...'}
                      </Box>
                    )}
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', bgcolor: 'background.paper' }}>
                <Typography color="text.secondary">
                  No translations recorded for this content item.
                </Typography>
              </Paper>
            )}
          </Box>
        )}

        {/* Tab 3: Raw JSON */}
        {activeTab === 3 && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 1,
              maxHeight: 320,
              overflow: 'auto',
            }}
          >
            <pre style={{ margin: 0, fontSize: '0.8rem', fontFamily: 'monospace' }}>
              {JSON.stringify(item, null, 2)}
            </pre>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default ContentDetailPanel;
