import React from 'react';
import { Chip } from '@mui/material';
import type { OrganizationMessageKey } from '../i18n';

export interface OrganizationStatusChipProps {
  status?: string | null;
  /** Translator bound to the Reactory API (see `makeTranslator`). */
  t: (key: OrganizationMessageKey, values?: Record<string, any>) => string;
}

/** Colour per lifecycle state; unknown states fall back to the neutral chip. */
const CHIP_COLOR: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  suspended: 'warning',
  archived: 'default',
};

const LABEL_KEY: Record<string, OrganizationMessageKey> = {
  active: 'reactory.organizations.list.statusActive',
  suspended: 'reactory.organizations.list.statusSuspended',
  archived: 'reactory.organizations.list.statusArchived',
};

/**
 * Renders an organization's lifecycle status as a translated chip.
 *
 * `status` is a plain string on the server type; an unknown value is shown
 * verbatim rather than being coerced into a misleading state.
 */
export const OrganizationStatusChip: React.FC<OrganizationStatusChipProps> = ({ status, t }) => {
  const normalised = (status || 'active').toString().toLowerCase();
  const labelKey = LABEL_KEY[normalised];

  return (
    <Chip
      size="small"
      variant={normalised === 'archived' ? 'outlined' : 'filled'}
      color={CHIP_COLOR[normalised] || 'default'}
      label={labelKey ? t(labelKey) : status || t('reactory.organizations.list.notSet')}
    />
  );
};

export default OrganizationStatusChip;
