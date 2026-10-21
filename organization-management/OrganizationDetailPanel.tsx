import React from 'react';
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

import OrganizationStatusChip from './components/OrganizationStatusChip';
import { makeTranslator, resolveError } from './i18n';
import useOrganizationDetail, { resolveOrganizationId } from './hooks/useOrganizationDetail';

export interface OrganizationDetailPanelProps {
  reactory?: any;
  /** Route argument. */
  id?: string;
  /** Alternative route-argument name used by some route configs. */
  organizationId?: string;
  /** Called by the back action; defaults to navigating to `/organizations`. */
  onBack?: () => void;
}

/** Re-exported so route helpers and tests have one import site. */
export { organizationIdFromPath } from './utils';

/**
 * Organization detail shell (ORG-010).
 *
 * Presentational: `useOrganizationDetail` performs both reads and owns loading,
 * error and not-found state; this component only decides layout.
 *
 * Deliberately minimal — the create wizard needs a destination after creating an
 * organization and `/organizations/:id` needs a resolvable FQN. The full tabbed
 * shell (overview, branding, structure, people, demographics, settings) is
 * ORG-011 onwards, so this shows the identity header and the statistics that
 * already exist on the API.
 */
export const OrganizationDetailPanel: React.FC<OrganizationDetailPanelProps> = ({
  reactory: propReactory,
  id,
  organizationId,
  onBack,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;
  const t = makeTranslator(reactory);

  const resolvedId = resolveOrganizationId(reactory, id || organizationId);
  const { organization, statistics, loadState, error, isLoading, refresh } =
    useOrganizationDetail({ reactory, organizationId: resolvedId });

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    if (reactory && typeof reactory.navigation === 'function') {
      reactory.navigation('/organizations');
    }
  };

  const metric = (label: string, value: number | null | undefined) => (
    <Grid item xs={12} sm={4}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5">
            {value === null || value === undefined ? t('reactory.organizations.list.notSet') : value}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );

  return (
    <Box sx={{ width: '100%' }}>
      <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
        {t('reactory.organizations.detail.back')}
      </Button>

      {isLoading && (
        <Stack direction="row" spacing={1.5} alignItems="center" role="status">
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            {t('reactory.organizations.detail.loading')}
          </Typography>
        </Stack>
      )}

      {loadState === 'error' && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refresh()}>
              {t('reactory.organizations.detail.retry')}
            </Button>
          }
        >
          <AlertTitle>{t('reactory.organizations.detail.error')}</AlertTitle>
          {resolveError(t, error)}
        </Alert>
      )}

      {loadState === 'success' && !organization && (
        <Alert severity="info">
          <AlertTitle>{t('reactory.organizations.detail.notFound')}</AlertTitle>
          {t('reactory.organizations.detail.notFoundHint')}
        </Alert>
      )}

      {loadState === 'success' && organization && (
        <Stack spacing={3}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar
                  src={organization.avatarURL || organization.logoURL || undefined}
                  alt={organization.name}
                  sx={{ width: 64, height: 64 }}
                >
                  {organization.name ? organization.name.charAt(0).toUpperCase() : undefined}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" component="h1">
                    {organization.name}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ mt: 0.5 }}
                    flexWrap="wrap"
                  >
                    <OrganizationStatusChip status={organization.status} t={t} />
                    {organization.code && (
                      <Chip size="small" variant="outlined" label={organization.code} />
                    )}
                    {organization.tradingName && (
                      <Typography variant="body2" color="text.secondary">
                        {organization.tradingName}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>

              {organization.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  {organization.description}
                </Typography>
              )}

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                {organization.theme || t('reactory.organizations.detail.themeInherited')}
              </Typography>
            </CardContent>
          </Card>

          <Grid container spacing={2}>
            {metric(t('reactory.organizations.detail.members'), statistics?.members)}
            {metric(t('reactory.organizations.detail.businessUnits'), statistics?.businessUnits)}
            {metric(t('reactory.organizations.detail.teams'), statistics?.teams)}
          </Grid>

          <Alert severity="info">{t('reactory.organizations.detail.comingSoon')}</Alert>
        </Stack>
      )}
    </Box>
  );
};

export default OrganizationDetailPanel;
