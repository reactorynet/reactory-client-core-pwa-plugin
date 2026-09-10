import React, { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Typography,
  Paper,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  Extension as ExtensionIcon,
  Description as DescriptionIcon,
  DataObject as DataObjectIcon,
} from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

export interface ReactoryClientSetting {
  __typename?: string;
  name: string;
  settingType: string | null;
  variant: string | null;
  title: string | null;
  description: string | null;
  componentFqn: string | null;
  formSchema: Record<string, unknown> | null;
  data: unknown;
}

export interface ApplicationSettingsPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: {
    settings?: ReactoryClientSetting[];
    menus?: any[];
  };
  applicationId?: string;
  mode?: 'view' | 'edit';
}

/**
 * Default uiSchema used when rendering a dynamic form from formSchema
 */
const DEFAULT_UI_SCHEMA: Reactory.Schema.IFormUISchema = {
  'ui:options': {
    submitButton: false,
  },
};

/**
 * Renders the editor for a single setting entry.
 * Uses componentFqn-based component if available, falls back to
 * ReactoryForm with formSchema, or shows raw JSON.
 */
const SettingEditor = ({
  setting,
  reactory,
  mode,
}: {
  setting: ReactoryClientSetting;
  reactory: any;
  mode: 'view' | 'edit';
}) => {
  // 1. If componentFqn is defined, resolve the component from the registry
  if (setting.componentFqn) {
    try {
      const SettingComponent = reactory.getComponent(setting.componentFqn) as React.ComponentType<any>;
      if (SettingComponent) {
        return (
          <Box sx={{ py: 1 }}>
            <SettingComponent
              reactory={reactory}
              formData={setting.data}
              mode={mode}
              setting={setting}
            />
          </Box>
        );
      }
    } catch (e: unknown) {
      if (reactory.log) {
        reactory.log(`SettingEditor: Could not resolve component "${setting.componentFqn}"`, { e }, 'warning');
      }
    }
  }

  // 2. If formSchema is defined (and no usable componentFqn), use ReactoryForm
  if (setting.formSchema) {
    const ReactoryForm = reactory.getComponent(
      'core.ReactoryForm@1.0.0'
    ) as React.ComponentType<Reactory.Client.IReactoryFormProps<unknown>>;

    if (ReactoryForm) {
      const formDef: Partial<Reactory.Forms.IReactoryForm> = {
        nameSpace: 'dynamic',
        name: `setting-${setting.name}`,
        version: '1.0.0',
        title: setting.title || setting.name,
        description: setting.description || undefined,
        schema: setting.formSchema as unknown as Reactory.Schema.AnySchema,
        uiSchema: DEFAULT_UI_SCHEMA,
      };

      return (
        <Box sx={{ py: 1 }}>
          <ReactoryForm
            formDef={formDef as Reactory.Forms.IReactoryForm}
            formData={setting.data}
            mode={mode}
          />
        </Box>
      );
    }
  }

  // 3. Fallback: display raw JSON data
  return (
    <Box sx={{ py: 1 }}>
      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          {setting.componentFqn
            ? `Component "${setting.componentFqn}" could not be resolved`
            : 'No form schema or component defined for this setting'}
        </Typography>
        <pre style={{ margin: 0, overflow: 'auto', fontSize: '0.85rem' }}>
          {JSON.stringify(setting.data, null, 2)}
        </pre>
      </Paper>
    </Box>
  );
};

/**
 * ApplicationSettingsPanel displays application settings with form editors
 * for each setting entry.
 */
export const ApplicationSettingsPanel: React.FC<ApplicationSettingsPanelProps> = ({
  reactory: propReactory,
  formData,
  mode = 'view',
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const [expandedPanel, setExpandedPanel] = useState<string | false>(false);

  const settings: ReactoryClientSetting[] = formData?.settings || [];

  const handlePanelChange = (panel: string) => (_event: unknown, isExpanded: boolean) => {
    setExpandedPanel(isExpanded ? panel : false);
  };

  /**
   * Returns an icon indicating the rendering strategy for the setting.
   */
  const getSettingIcon = (setting: ReactoryClientSetting) => {
    if (setting.componentFqn) return <ExtensionIcon fontSize="small" color="primary" />;
    if (setting.formSchema) return <DescriptionIcon fontSize="small" color="secondary" />;
    return <DataObjectIcon fontSize="small" color="action" />;
  };

  return (
    <Box sx={{ p: 2 }}>
      <Card>
        <CardHeader avatar={<SettingsIcon />} title="Application Settings" />
        <Divider />
        <CardContent>
          {settings.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No settings configured for this application.
            </Typography>
          ) : (
            <Box>
              {Array.isArray(settings) && settings.map((setting) => (
                <Accordion
                  key={setting.name}
                  expanded={expandedPanel === setting.name}
                  onChange={handlePanelChange(setting.name)}
                  variant="outlined"
                  sx={{ mb: 1 }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                      {getSettingIcon(setting)}
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2">{setting.title || setting.name}</Typography>
                        {setting.description && (
                          <Typography variant="caption" color="text.secondary">{setting.description}</Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {setting.settingType && (
                          <Chip label={setting.settingType} size="small" variant="outlined" />
                        )}
                        {setting.variant && (
                          <Chip label={setting.variant} size="small" color="default" />
                        )}
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <SettingEditor
                      setting={setting}
                      reactory={reactory}
                      mode={mode}
                    />
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ApplicationSettingsPanel;
