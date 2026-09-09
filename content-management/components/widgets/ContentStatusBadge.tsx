import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditNoteIcon from '@mui/icons-material/EditNote';

export interface ContentStatusBadgeProps {
  value?: boolean | string;
  rowData?: { published?: boolean; [key: string]: any };
  size?: 'small' | 'medium';
}

export const ContentStatusBadge: React.FC<ContentStatusBadgeProps> = ({
  value,
  rowData,
  size = 'small',
}) => {
  const isPublished =
    value !== undefined
      ? value === true || value === 'true' || value === 'published'
      : Boolean(rowData?.published);

  if (isPublished) {
    return (
      <Tooltip title="Published content available to users">
        <Chip
          icon={<CheckCircleOutlineIcon fontSize="small" />}
          label="Published"
          size={size}
          color="success"
          variant="outlined"
          sx={{
            fontWeight: 600,
            fontSize: '0.75rem',
            borderColor: 'success.main',
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.15)' : '#e8f5e9',
          }}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title="Draft - not published">
      <Chip
        icon={<EditNoteIcon fontSize="small" />}
        label="Draft"
        size={size}
        color="warning"
        variant="outlined"
        sx={{
          fontWeight: 600,
          fontSize: '0.75rem',
          borderColor: 'warning.main',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.15)' : '#fff8e1',
        }}
      />
    </Tooltip>
  );
};

export default ContentStatusBadge;
