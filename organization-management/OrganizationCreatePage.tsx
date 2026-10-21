import React, { useCallback, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useReactory } from '@reactory/client-core/api';

import OrganizationCreateWizard from './OrganizationCreateWizard';
import { makeTranslator, resolveError } from './i18n';
import type { Organization, OrganizationError } from './types';

export interface OrganizationCreatePageProps {
  reactory?: any;
  /** Where "cancel" and a completed create send the user. */
  listRoute?: string;
  /** Detail route for the organization that was just created. */
  detailRoute?: (organization: Organization) => string;
}

/**
 * Route target for `/organizations/new`.
 *
 * The wizard itself is a controlled dialog (`open` / `onClose`), so registering
 * *it* as a component would render a closed dialog — a blank page. This thin
 * page owns the open state, mounts the wizard, and turns its close/created
 * callbacks into navigation. The wizard stays registered nowhere; it is an
 * implementation detail of this page and of `OrganizationListPanel`.
 */
export const OrganizationCreatePage: React.FC<OrganizationCreatePageProps> = ({
  reactory: propReactory,
  listRoute = '/organizations',
  detailRoute,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;
  const t = makeTranslator(reactory);

  const [open, setOpen] = useState(true);

  const navigate = useCallback(
    (path: string) => {
      if (reactory && typeof reactory.navigation === 'function') reactory.navigation(path);
    },
    [reactory],
  );

  const notify = useCallback(
    (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
      if (reactory && typeof reactory.createNotification === 'function') {
        reactory.createNotification(message, {
          type,
          canDismiss: true,
          timeout: type === 'error' ? 6000 : 4000,
          showInAppNotification: true,
        });
      }
    },
    [reactory],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    navigate(listRoute);
  }, [listRoute, navigate]);

  const handleCreated = useCallback(
    (organization: Organization, warning?: OrganizationError | null) => {
      setOpen(false);

      if (warning) {
        notify(
          t('reactory.organizations.wizard.review.createdWithWarning', {
            name: organization.name,
            message: resolveError(t, warning),
          }),
          'warning',
        );
      } else {
        notify(t('reactory.organizations.wizard.review.created', { name: organization.name }));
      }

      navigate(
        detailRoute ? detailRoute(organization) : `/organizations/${organization.id}`,
      );
    },
    [detailRoute, navigate, notify, t],
  );

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h5" component="h1" gutterBottom>
        {t('reactory.organizations.wizard.title')}
      </Typography>

      <OrganizationCreateWizard
        reactory={reactory}
        open={open}
        onClose={handleClose}
        onCreated={handleCreated}
      />
    </Box>
  );
};

export default OrganizationCreatePage;
