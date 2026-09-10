import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

export interface ApplicationOrganizationsPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: any;
  applicationId?: string;
  mode?: 'view' | 'edit';
}

export const ApplicationOrganizationsPanel: React.FC<ApplicationOrganizationsPanelProps> = ({
  reactory: propReactory,
  formData,
  applicationId,
  mode = 'view',
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  // If no application ID is available, show a message
  if (!applicationId) {
    return (
      <Box sx={{ p: 2 }}>
        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <WarningIcon color="warning" />
            <Typography variant="body2" color="text.secondary">
              No application ID provided. Please provide an applicationId to view organizations.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const ApplicationOrganizations = reactory?.getComponent<React.ComponentType<any>>('core.ApplicationOrganizations@1.0.0');

  if (!ApplicationOrganizations) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          ApplicationOrganizations component (core.ApplicationOrganizations@1.0.0) is not loaded.
        </Typography>
      </Box>
    );
  }

  // Render the ApplicationOrganizations form component
  return (
    <Box sx={{ width: '100%', height: '100%' }}>
      <ApplicationOrganizations
        applicationId={applicationId}
        mode={mode}
      />
    </Box>
  );
};

export default ApplicationOrganizationsPanel;
