import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import DescriptionIcon from '@mui/icons-material/Description';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import { ContentFormat } from '../../types';

export interface ContentFormatBadgeProps {
  value?: ContentFormat | string;
  rowData?: { format?: ContentFormat | string; [key: string]: any };
  size?: 'small' | 'medium';
}

export const ContentFormatBadge: React.FC<ContentFormatBadgeProps> = ({
  value,
  rowData,
  size = 'small',
}) => {
  const format = ((value || rowData?.format || 'html') as string).toLowerCase();

  switch (format) {
    case 'markdown':
      return (
        <Tooltip title="Format: Markdown">
          <Chip
            icon={<DescriptionIcon fontSize="small" />}
            label="Markdown"
            size={size}
            variant="outlined"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              color: '#0288d1',
              borderColor: '#0288d1',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(2, 136, 209, 0.15)' : '#e1f5fe',
            }}
          />
        </Tooltip>
      );
    case 'text':
      return (
        <Tooltip title="Format: Plain text">
          <Chip
            icon={<TextFieldsIcon fontSize="small" />}
            label="Plain Text"
            size={size}
            variant="outlined"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              color: '#757575',
              borderColor: '#bdbdbd',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#f5f5f5',
            }}
          />
        </Tooltip>
      );
    case 'html':
    default:
      return (
        <Tooltip title="Format: HTML / Rich Text">
          <Chip
            icon={<CodeIcon fontSize="small" />}
            label="HTML"
            size={size}
            variant="outlined"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              color: '#7b1fa2',
              borderColor: '#7b1fa2',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(123, 31, 162, 0.15)' : '#f3e5f5',
            }}
          />
        </Tooltip>
      );
  }
};

export default ContentFormatBadge;
