import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  Divider,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Chip,
  Switch,
  FormControlLabel,
  Alert,
  Tooltip,
  Autocomplete,
} from '@mui/material';
import {
  Flag as FlagIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  ToggleOn as ToggleOnIcon,
  ToggleOff as ToggleOffIcon,
} from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';
import { TagsField } from '@reactory/client-core/components/shared/TagsField';

export interface FeatureFlag {
  feature: string;
  partner?: string;
  organization?: string;
  businessUnit?: string;
  regions?: string[];
  roles?: string[];
  users?: string[];
  timezones?: string[];
  value?: any;
  enabled?: boolean;
}

export interface CatalogueFlag {
  id?: string;
  nameSpace: string;
  name: string;
  version: string;
  title: string;
  description?: string;
}

export interface ApplicationFeatureFlagsPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: {
    featureFlags?: FeatureFlag[];
    totalFeatureFlags?: number;
  };
  formContext?: {
    props?: {
      applicationId?: string;
      mode?: string;
      application?: { _id?: string; id?: string };
    };
  };
  onChange?: (formData: any) => void;
  applicationId?: string;
  mode?: 'view' | 'edit';
}

const CATALOGUE_QUERY = `
  query ReactoryFeatureFlagCatalogue {
    ReactoryFeatureFlagCatalogue {
      id
      nameSpace
      name
      version
      title
      description
    }
  }
`;

const FEATURE_FLAG_FIELDS = `
  feature
  partner
  organization
  businessUnit
  regions
  roles
  timezones
  value
  enabled
`;

const MUTATIONS = {
  addFeatureFlag: `mutation ReactoryClientAddFeatureFlag($clientId: String!, $featureFlag: FeatureFlagValueInput!) {
    ReactoryClientAddFeatureFlag(clientId: $clientId, featureFlag: $featureFlag) {
      id
      featureFlags { ${FEATURE_FLAG_FIELDS} }
    }
  }`,
  updateFeatureFlag: `mutation ReactoryClientUpdateFeatureFlag($clientId: String!, $feature: String!, $featureFlag: FeatureFlagValueInput!) {
    ReactoryClientUpdateFeatureFlag(clientId: $clientId, feature: $feature, featureFlag: $featureFlag) {
      id
      featureFlags { ${FEATURE_FLAG_FIELDS} }
    }
  }`,
  deleteFeatureFlag: `mutation ReactoryClientDeleteFeatureFlag($clientId: String!, $feature: String!) {
    ReactoryClientDeleteFeatureFlag(clientId: $clientId, feature: $feature) {
      id
      featureFlags { ${FEATURE_FLAG_FIELDS} }
    }
  }`,
};

export const ApplicationFeatureFlagsPanel: React.FC<ApplicationFeatureFlagsPanelProps> = ({
  reactory: propReactory,
  formData,
  formContext,
  onChange,
  applicationId,
  mode = 'view',
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const isAdmin = reactory.hasRole ? reactory.hasRole(['ADMIN']) : true;

  const [flags, setFlags] = useState<FeatureFlag[]>(formData?.featureFlags || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (formData?.featureFlags) {
      setFlags(formData.featureFlags);
    }
  }, [formData?.featureFlags]);

  const featureFlags = flags;
  const totalFeatureFlags = formData?.totalFeatureFlags || featureFlags.length;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [isEditing, setIsEditing] = useState(false);
  const [featureInput, setFeatureInput] = useState('');
  const [catalogue, setCatalogue] = useState<CatalogueFlag[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number>(-1);

  /**
   * Resolve the application id.
   *
   * On the v5 form engine the `ui:props-map` that wires
   * `formContext.props.applicationId` → `applicationId` used to be ignored, so
   * the prop arrived undefined and every mutation silently no-oped. The v5
   * adapter now honours the map, but we also fall back to `formContext` here so
   * the panel keeps working regardless of how it was mounted.
   */
  const resolveApplicationId = (): string | undefined =>
    applicationId
    || formContext?.props?.applicationId
    || formContext?.props?.application?.id
    || formContext?.props?.application?._id;

  const notify = (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'success',
  ) => {
    if (reactory.createNotification) {
      reactory.createNotification(message, {
        type,
        canDismiss: true,
        timeout: type === 'error' ? 5000 : 3000,
        showInAppNotification: true,
      });
    }
  };

  /**
   * Publish the flag list to local state and the parent form.
   */
  const publishFlags = (nextFlags: FeatureFlag[]) => {
    setFlags(nextFlags);
    if (typeof onChange === 'function') {
      onChange({ ...(formData || {}), featureFlags: nextFlags, totalFeatureFlags: nextFlags.length });
    }
  };

  /**
   * Pull the updated featureFlags array out of a mutation result.
   */
  const extractFlags = (result: any, mutationKey: string): FeatureFlag[] | null => {
    const data = result?.data?.[mutationKey];
    return data?.featureFlags ? data.featureFlags : null;
  };

  /**
   * Strip __typename and build a clean input object for mutations.
   */
  const cleanFlagInput = (flag: FeatureFlag) => {
    const cleaned: any = reactory.utils && reactory.utils.omitDeep ? reactory.utils.omitDeep({ ...flag }) : { ...flag };
    delete cleaned.__typename;
    return {
      feature: cleaned.feature,
      partner: cleaned.partner || null,
      organization: cleaned.organization || null,
      businessUnit: cleaned.businessUnit || null,
      regions: cleaned.regions || [],
      roles: cleaned.roles || [],
      timezones: cleaned.timezones || [],
      value: cleaned.value ?? null,
      enabled: cleaned.enabled ?? false,
    };
  };

  /**
   * Fetch feature flag catalogue from the server.
   */
  const fetchCatalogue = useCallback(async () => {
    setCatalogueLoading(true);
    try {
      const result: any = await reactory.graphqlQuery(CATALOGUE_QUERY, {});
      if (result?.data?.ReactoryFeatureFlagCatalogue) {
        setCatalogue(result.data.ReactoryFeatureFlagCatalogue);
      }
    } catch (err) {
      if (reactory.log) {
        reactory.log('Error fetching feature flag catalogue:', err, 'warning');
      }
    } finally {
      setCatalogueLoading(false);
    }
  }, [reactory]);

  // Fetch catalogue on mount
  useEffect(() => {
    if (isAdmin) {
      fetchCatalogue();
    }
  }, [isAdmin, fetchCatalogue]);

  /**
   * Build FQN string for a catalogue flag.
   */
  const flagFqn = (f: CatalogueFlag): string =>
    `${f.nameSpace}.${f.name}@${f.version}`;

  /**
   * Get catalogue flags not already configured.
   */
  const availableCatalogueOptions = catalogue.filter(
    (cf) => !featureFlags.some((ff) => ff.feature === flagFqn(cf)),
  );

  /**
   * Toggle enabled/disabled state inline for a specific flag.
   *
   * Applies the change optimistically so the switch moves immediately, then
   * reverts if the mutation fails.
   */
  const handleToggleEnabled = async (index: number) => {
    const clientId = resolveApplicationId();
    if (!clientId) {
      notify('Unable to determine the application id.', 'error');
      return;
    }
    const flag = featureFlags[index];
    if (!flag) return;

    const nextEnabled = !flag.enabled;
    const previous = featureFlags;
    publishFlags(featureFlags.map((f, i) => (i === index ? { ...f, enabled: nextEnabled } : f)));
    setSaving(true);
    try {
      const result = await reactory.graphqlMutation(MUTATIONS.updateFeatureFlag, {
        clientId,
        feature: flag.feature,
        featureFlag: cleanFlagInput({ ...flag, enabled: nextEnabled }),
      });
      const serverFlags = extractFlags(result, 'ReactoryClientUpdateFeatureFlag');
      if (serverFlags) publishFlags(serverFlags);
      notify(nextEnabled ? 'Feature flag enabled' : 'Feature flag disabled');
    } catch (err) {
      publishFlags(previous);
      if (reactory.log) reactory.log('Error toggling feature flag:', err, 'error');
      notify('Error toggling feature flag', 'error');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Open the add dialog for a new feature flag value.
   */
  const handleAddFlag = () => {
    setSelectedFlag({
      feature: '',
      partner: '',
      organization: '',
      businessUnit: '',
      regions: [],
      roles: [],
      timezones: [],
      value: {},
      enabled: true,
    });
    setFeatureInput('');
    setEditIndex(-1);
    setIsEditing(false);
    setDialogOpen(true);
  };

  /**
   * Open the edit dialog for an existing feature flag value.
   */
  const handleEditFlag = (flag: FeatureFlag, index: number) => {
    setSelectedFlag({ ...flag });
    setFeatureInput(flag.feature || '');
    setEditIndex(index);
    setIsEditing(true);
    setDialogOpen(true);
  };

  /**
   * Prompt deletion confirmation for a feature flag value.
   */
  const handleDeleteFlag = (index: number) => {
    setDeleteIndex(index);
    setDeleteConfirmOpen(true);
  };

  /**
   * Execute deletion after confirmation.
   */
  const confirmDeleteFlag = async () => {
    const clientId = resolveApplicationId();
    const flag = deleteIndex >= 0 ? featureFlags[deleteIndex] : undefined;
    if (flag && clientId) {
      setSaving(true);
      try {
        const result = await reactory.graphqlMutation(MUTATIONS.deleteFeatureFlag, {
          clientId,
          feature: flag.feature,
        });
        const serverFlags = extractFlags(result, 'ReactoryClientDeleteFeatureFlag');
        publishFlags(serverFlags || featureFlags.filter((_, i) => i !== deleteIndex));
        notify('Feature flag removed');
      } catch (err) {
        if (reactory.log) reactory.log('Error deleting feature flag:', err, 'error');
        notify('Error deleting feature flag', 'error');
      } finally {
        setSaving(false);
      }
    } else if (flag && !clientId) {
      notify('Unable to determine the application id.', 'error');
    }
    setDeleteConfirmOpen(false);
    setDeleteIndex(-1);
  };

  /**
   * Save (add or update) a feature flag value via individual mutation.
   */
  const handleSaveFlag = async () => {
    if (!selectedFlag?.feature) return;
    const clientId = resolveApplicationId();
    if (!clientId) {
      notify('Unable to determine the application id.', 'error');
      return;
    }
    setSaving(true);
    try {
      const input = cleanFlagInput(selectedFlag);
      if (isEditing && editIndex >= 0) {
        const originalFeature = featureFlags[editIndex]?.feature || selectedFlag.feature;
        const result = await reactory.graphqlMutation(MUTATIONS.updateFeatureFlag, {
          clientId,
          feature: originalFeature,
          featureFlag: input,
        });
        const serverFlags = extractFlags(result, 'ReactoryClientUpdateFeatureFlag');
        publishFlags(
          serverFlags || featureFlags.map((f, i) => (i === editIndex ? { ...selectedFlag } : f)),
        );
        notify('Feature flag updated');
      } else {
        const result = await reactory.graphqlMutation(MUTATIONS.addFeatureFlag, {
          clientId,
          featureFlag: input,
        });
        const serverFlags = extractFlags(result, 'ReactoryClientAddFeatureFlag');
        publishFlags(serverFlags || [...featureFlags, { ...selectedFlag }]);
        notify('Feature flag added');
      }
      setDialogOpen(false);
      setSelectedFlag(null);
      setEditIndex(-1);
    } catch (err) {
      // Keep the dialog open so the user does not lose their edits.
      if (reactory.log) reactory.log('Error saving feature flag:', err, 'error');
      notify('Error saving feature flag', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedFlag(null);
    setEditIndex(-1);
  };

  const handleFieldChange = (field: string, value: any) => {
    setSelectedFlag((prev: FeatureFlag | null) => ({ ...prev, [field]: value } as FeatureFlag));
  };

  /**
   * Handle catalogue selection in the add dialog.
   */
  const handleCatalogueSelect = (
    _event: any,
    catalogueFlag: CatalogueFlag | string | null,
  ) => {
    if (!catalogueFlag) return;
    const fqn = typeof catalogueFlag === 'string' ? catalogueFlag : flagFqn(catalogueFlag);
    setFeatureInput(fqn);
    handleFieldChange('feature', fqn);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Card>
        <CardHeader
          avatar={<FlagIcon />}
          title="Feature Flags"
          subheader={`${featureFlags.length} configured flag${featureFlags.length !== 1 ? 's' : ''}`}
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {saving && <CircularProgress size={20} />}
              {isAdmin && (
                <Button
                  startIcon={<AddIcon />}
                  variant="contained"
                  size="small"
                  onClick={handleAddFlag}
                  disabled={saving}
                >
                  Add Flag
                </Button>
              )}
            </Box>
          }
        />
        <Divider />
        <CardContent>
          {!isAdmin && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Only administrators can manage feature flags.
            </Alert>
          )}
          {featureFlags.length > 0 ? (
            <List disablePadding>
              {featureFlags.map((flag: FeatureFlag, index: number) => (
                <ListItem
                  key={flag.feature || index}
                  divider
                  sx={{
                    opacity: flag.enabled ? 1 : 0.6,
                    backgroundColor: flag.enabled
                      ? 'inherit'
                      : 'action.disabledBackground',
                    py: 1.5,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 48 }}>
                    {isAdmin ? (
                      <Tooltip
                        title={flag.enabled ? 'Click to disable' : 'Click to enable'}
                      >
                        <IconButton
                          size="small"
                          onClick={() => handleToggleEnabled(index)}
                          color={flag.enabled ? 'success' : 'default'}
                          disabled={saving}
                          aria-label={flag.enabled ? 'Disable feature flag' : 'Enable feature flag'}
                        >
                          {flag.enabled ? (
                            <ToggleOnIcon />
                          ) : (
                            <ToggleOffIcon />
                          )}
                        </IconButton>
                      </Tooltip>
                    ) : flag.enabled ? (
                      <CheckIcon color="success" />
                    ) : (
                      <CloseIcon color="error" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {flag.feature}
                        </Typography>
                        <Chip
                          label={flag.enabled ? 'Enabled' : 'Disabled'}
                          size="small"
                          color={flag.enabled ? 'success' : 'error'}
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 1 }}>
                        {flag.roles && flag.roles.length > 0 && (
                          <Box
                            sx={{
                              display: 'flex',
                              gap: 0.5,
                              flexWrap: 'wrap',
                              mb: 0.5,
                              alignItems: 'center',
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ mr: 0.5 }}
                            >
                              Roles:
                            </Typography>
                            {flag.roles.map((role: string) => (
                              <Chip key={role} label={role} size="small" />
                            ))}
                          </Box>
                        )}
                        {flag.regions && flag.regions.length > 0 && (
                          <Box
                            sx={{
                              display: 'flex',
                              gap: 0.5,
                              flexWrap: 'wrap',
                              mb: 0.5,
                              alignItems: 'center',
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ mr: 0.5 }}
                            >
                              Regions:
                            </Typography>
                            {flag.regions.map((region: string) => (
                              <Chip
                                key={region}
                                label={region}
                                size="small"
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        )}
                        {flag.timezones && flag.timezones.length > 0 && (
                          <Box
                            sx={{
                              display: 'flex',
                              gap: 0.5,
                              flexWrap: 'wrap',
                              mb: 0.5,
                              alignItems: 'center',
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ mr: 0.5 }}
                            >
                              Timezones:
                            </Typography>
                            {flag.timezones.map((tz: string) => (
                              <Chip
                                key={tz}
                                label={tz}
                                size="small"
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        )}
                        {flag.partner && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            Partner: {flag.partner}
                          </Typography>
                        )}
                        {flag.organization && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            Organization: {flag.organization}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  {isAdmin && (
                    <ListItemSecondaryAction>
                      <Tooltip title="Edit flag targeting">
                        <IconButton
                          size="small"
                          onClick={() => handleEditFlag(flag, index)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete flag">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteFlag(index)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              ))}
            </List>
          ) : (
            <Alert severity="info">
              No feature flags configured. Feature flags allow you to toggle
              functionality and control feature rollouts for your application.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Feature Flag Edit/Create Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleDialogClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {isEditing ? 'Edit Feature Flag' : 'Add Feature Flag'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {/* Feature selection: catalogue autocomplete for add, read-only for edit */}
            {isEditing ? (
              <TextField
                label="Feature Key (FQN)"
                value={selectedFlag?.feature || ''}
                fullWidth
                disabled
                helperText="Feature key cannot be changed after creation"
              />
            ) : (
              <Autocomplete
                options={availableCatalogueOptions}
                loading={catalogueLoading}
                getOptionLabel={(option: CatalogueFlag | string) =>
                  typeof option === 'string'
                    ? option
                    : `${option.title} (${flagFqn(option)})`
                }
                inputValue={featureInput}
                onInputChange={(_event: any, nextInput: string, reason: string) => {
                  if (reason === 'reset') return;
                  setFeatureInput(nextInput);
                  handleFieldChange('feature', nextInput);
                }}
                onChange={handleCatalogueSelect}
                freeSolo
                renderOption={(optionProps: any, option: CatalogueFlag) => (
                  <Box component="li" {...optionProps}>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        {option.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {flagFqn(option)}
                        {option.description
                          ? ` — ${option.description}`
                          : ''}
                      </Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params: any) => (
                  <TextField
                    {...params}
                    label="Feature Flag"
                    fullWidth
                    helperText="Select from the catalogue or enter an FQN manually"
                  />
                )}
              />
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(selectedFlag?.enabled)}
                  onChange={(e: any) =>
                    handleFieldChange('enabled', e.target.checked)
                  }
                />
              }
              label="Enabled"
            />
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary">
              Targeting (Optional)
            </Typography>
            <TextField
              label="Partner"
              value={selectedFlag?.partner || ''}
              onChange={(e: any) =>
                handleFieldChange('partner', e.target.value)
              }
              fullWidth
              helperText="Apply to specific partner only"
            />
            <TextField
              label="Organization"
              value={selectedFlag?.organization || ''}
              onChange={(e: any) =>
                handleFieldChange('organization', e.target.value)
              }
              fullWidth
              helperText="Apply to specific organization only"
            />
            <TextField
              label="Business Unit"
              value={selectedFlag?.businessUnit || ''}
              onChange={(e: any) =>
                handleFieldChange('businessUnit', e.target.value)
              }
              fullWidth
              helperText="Apply to specific business unit only"
            />
            <TagsField
              label="Roles"
              value={selectedFlag?.roles}
              onChange={(next) => handleFieldChange('roles', next)}
              placeholder="Type a role and press Enter"
              helperText="Roles that can access this feature (press Enter or comma to add)"
            />
            <TagsField
              label="Regions"
              value={selectedFlag?.regions}
              onChange={(next) => handleFieldChange('regions', next)}
              placeholder="e.g. ZA, US"
              helperText="2-digit ISO country codes (press Enter or comma to add)"
            />
            <TagsField
              label="Timezones"
              value={selectedFlag?.timezones}
              onChange={(next) => handleFieldChange('timezones', next)}
              placeholder="e.g. Africa/Johannesburg"
              helperText="Timezones (press Enter or comma to add)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>Cancel</Button>
          <Button
            onClick={handleSaveFlag}
            variant="contained"
            disabled={!selectedFlag?.feature || saving}
          >
            {saving ? <CircularProgress size={20} /> : isEditing ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove the feature flag
            {deleteIndex >= 0 && featureFlags[deleteIndex]
              ? ` "${featureFlags[deleteIndex].feature}"`
              : ''}
            ? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={confirmDeleteFlag}
            variant="contained"
            color="error"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApplicationFeatureFlagsPanel;
