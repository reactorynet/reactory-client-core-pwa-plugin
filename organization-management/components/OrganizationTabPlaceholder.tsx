import React from 'react';
import { Alert, AlertTitle, Box, Typography } from '@mui/material';

export interface OrganizationTabPlaceholderProps {
  /** Ticket that replaces this placeholder, e.g. `ORG-013`. */
  ticket: string;
  /** Translated explanation of what the ticket delivers. */
  description: string;
  /** Translated heading; defaults to the ticket line. */
  title?: string;
}

/**
 * Placeholder body for a detail tab that a later ticket implements.
 *
 * Deliberately an `Alert severity="info"`: a tab that does not exist yet is not
 * a failure, so it must not look like one. The panel keeps its normal padding
 * and heading structure, which is what stops a placeholder from breaking the
 * shell's layout — it renders inside the same tab container as a real tab.
 */
export const OrganizationTabPlaceholder: React.FC<OrganizationTabPlaceholderProps> = ({
  ticket,
  description,
  title,
}) => (
  <Box data-testid="organization-tab-placeholder" data-ticket={ticket}>
    <Alert severity="info">
      <AlertTitle>{title || ticket}</AlertTitle>
      <Typography variant="body2">{description}</Typography>
    </Alert>
  </Box>
);

export default OrganizationTabPlaceholder;
