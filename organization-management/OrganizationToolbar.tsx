import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

import { makeTranslator } from './i18n';
import type { OrganizationStatusFilter } from './types';

export interface OrganizationToolbarProps {
  reactory?: any;
  search: string;
  onSearchChange: (value: string) => void;
  status: OrganizationStatusFilter;
  onStatusChange: (value: OrganizationStatusFilter) => void;
  onRefresh: () => void;
  onNewOrganization: () => void;
  onArchiveSelected: () => void;
  selectedCount: number;
  refreshing?: boolean;
  disabled?: boolean;
  /** May call `createOrganization` (ADMIN/SYSTEM server-side). */
  canCreate?: boolean;
  /** May call archive/restore (ORGANIZATION_ADMIN/ADMIN server-side). */
  canManage?: boolean;
}

const STATUS_OPTIONS: Array<{ value: OrganizationStatusFilter; key: any }> = [
  { value: 'all', key: 'reactory.organizations.list.statusAll' },
  { value: 'active', key: 'reactory.organizations.list.statusActive' },
  { value: 'suspended', key: 'reactory.organizations.list.statusSuspended' },
  { value: 'archived', key: 'reactory.organizations.list.statusArchived' },
];

/**
 * Search / filter / actions bar for the organization list.
 *
 * Presentational only: the search term, status filter and selection live in
 * `useOrganizationList`. The bulk-archive action is delegated upward so the
 * confirmation dialog stays in one place.
 *
 * Mutating buttons are conditional on `canCreate` / `canManage`, which the panel
 * derives from `reactory.hasRole` using the same roles the server enforces. A
 * USER therefore sees search, filter and refresh only.
 */
export const OrganizationToolbar: React.FC<OrganizationToolbarProps> = ({
  reactory: propReactory,
  search,
  onSearchChange,
  status,
  onStatusChange,
  onRefresh,
  onNewOrganization,
  onArchiveSelected,
  selectedCount,
  refreshing = false,
  disabled = false,
  canCreate = true,
  canManage = true,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;
  const t = makeTranslator(reactory);

  return (
    <Box sx={{ p: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
          <TextField
            size="small"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            label={t('reactory.organizations.list.search')}
            placeholder={t('reactory.organizations.list.searchPlaceholder')}
            disabled={disabled}
            sx={{ minWidth: { xs: '100%', sm: 280 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            select
            size="small"
            value={status}
            onChange={(event) => onStatusChange(event.target.value as OrganizationStatusFilter)}
            label={t('reactory.organizations.list.statusFilter')}
            disabled={disabled}
            sx={{ minWidth: 170 }}
          >
            {STATUS_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {t(option.key)}
              </MenuItem>
            ))}
          </TextField>

          <Tooltip title={t('reactory.organizations.list.refresh')}>
            <span>
              <IconButton
                onClick={onRefresh}
                disabled={disabled || refreshing}
                aria-label={t('reactory.organizations.list.refresh')}
                size="small"
              >
                {refreshing ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end">
          {canManage && (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<ArchiveIcon />}
              onClick={onArchiveSelected}
              disabled={disabled || selectedCount === 0}
            >
              {`${t('reactory.organizations.list.archiveSelected')}${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
            </Button>
          )}

          {canCreate && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onNewOrganization}
              disabled={disabled}
            >
              {t('reactory.organizations.list.newOrganization')}
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

export default OrganizationToolbar;
