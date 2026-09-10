import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import { AdminPanelSettings as RolesIcon } from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

export interface ApplicationRolesPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: any;
  applicationId?: string;
  mode?: 'view' | 'edit';
}

export const ApplicationRolesPanel: React.FC<ApplicationRolesPanelProps> = ({
  reactory: propReactory,
  formData,
  applicationId,
  mode = 'view',
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const roles: string[] = formData?.applicationRoles || [];
  const totalRoles = roles.length;

  return (
    <Box sx={{ p: 2 }}>
      <Card>
        <CardHeader avatar={<RolesIcon />} title="Application Roles" subheader={`Total: ${totalRoles}`} />
        <Divider />
        <CardContent>
          {roles.length > 0 ? (
            <List>
              {roles.map((role: string) => (
                <ListItem key={role}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={role} color="primary" />
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No roles found. Role data will be populated here when available.
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ApplicationRolesPanel;
