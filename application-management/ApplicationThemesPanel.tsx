import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  Divider,
  Grid,
  Paper,
  Chip,
} from '@mui/material';
import { Palette as PaletteIcon } from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

export interface ApplicationThemesPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: any;
  applicationId?: string;
  mode?: 'view' | 'edit';
  activeTheme?: string;
}

export const ApplicationThemesPanel: React.FC<ApplicationThemesPanelProps> = ({
  reactory: propReactory,
  formData,
  applicationId,
  mode = 'view',
  activeTheme,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const themes = formData?.themes || [];

  return (
    <Box sx={{ p: 2 }}>
      <Card>
        <CardHeader avatar={<PaletteIcon />} title="Application Themes" subheader={`Active: ${activeTheme || 'Default'}`} />
        <Divider />
        <CardContent>
          {themes.length > 0 ? (
            <Grid container spacing={2}>
              {themes.map((theme: any) => (
                <Grid item xs={12} sm={6} md={4} key={theme.id || theme.name}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      border: theme.name === activeTheme ? 2 : 1,
                      borderColor: theme.name === activeTheme ? 'primary.main' : 'divider',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6">{theme.name}</Typography>
                      {theme.name === activeTheme && <Chip label="Active" color="primary" size="small" />}
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <Chip label={theme.defaultThemeMode || 'light'} size="small" variant="outlined" />
                      {theme.type && <Chip label={theme.type} size="small" variant="outlined" />}
                    </Box>

                    {theme.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {theme.description}
                      </Typography>
                    )}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No themes configured. Theme data will be populated here when available.
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ApplicationThemesPanel;
