import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

export interface ApplicationUsersPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: Partial<Reactory.Models.IReactoryClient>;
  mode?: 'view' | 'edit';
  applicationId?: string;
}

export const ApplicationUsersPanel: React.FC<ApplicationUsersPanelProps> = ({
  reactory: propReactory,
  formData,
  mode = 'view',
  applicationId,
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
              No application ID provided. Please provide an applicationId to view users.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const ApplicationUsers = reactory?.getComponent<React.ComponentType<any>>('core.ApplicationUsers@1.0.0');

  if (!ApplicationUsers) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          ApplicationUsers component (core.ApplicationUsers@1.0.0) is not loaded.
        </Typography>
      </Box>
    );
  }

  // Render the ApplicationUsers form component
  return (
    <Box sx={{ width: '100%', height: '100%' }}>
      <ApplicationUsers
        applicationId={applicationId}
        mode={mode}
      />
    </Box>
  );
};

export default ApplicationUsersPanel;
