import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  Divider,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Alert,
  AlertTitle,
  TextField,
  InputAdornment,
  FormControlLabel,
  Switch,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
} from '@mui/material';
import {
  AdminPanelSettings as RolesIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  ErrorOutline as ErrorOutlineIcon,
  ExpandMore as ExpandMoreIcon,
  VerifiedUser as PlatformIcon,
  LockOutlined as InternalIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

/**
 * A group of roles provided by one backend module.
 */
export interface IReactoryRoleModuleGroup {
  id: string;
  nameSpace: string;
  name: string;
  version: string;
  description?: string;
  priority: number;
  isCore: boolean;
  roles: string[];
}

/**
 * The backend role catalogue, as returned by the `ReactoryRoleCatalogue` query.
 *
 * `roles` is the complete set an application's `applicationRoles` must be a
 * subset of — that is the invariant the server enforces on save.
 */
export interface IReactoryRoleCatalogue {
  roles: string[];
  platformRoles: string[];
  systemRoles: string[];
  modules: IReactoryRoleModuleGroup[];
}

export interface ApplicationRolesPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: {
    applicationRoles?: string[];
  };
  formContext?: {
    props?: {
      applicationId?: string;
      mode?: string;
      application?: { _id?: string; id?: string };
    };
    formData?: {
      roles?: { applicationRoles?: string[] };
    };
  };
  onChange?: (formData: any) => void;
  applicationId?: string;
  mode?: 'view' | 'edit';
}

const ROLE_CATALOGUE_QUERY = `
  query ReactoryRoleCatalogue {
    ReactoryRoleCatalogue {
      roles
      platformRoles
      systemRoles
      modules {
        id
        nameSpace
        name
        version
        description
        priority
        isCore
        roles
      }
    }
  }
`;

const UPDATE_ROLES_MUTATION = `
  mutation ReactoryClientUpdateRoles($clientId: String!, $roles: [String!]!) {
    ReactoryClientUpdateRoles(clientId: $clientId, roles: $roles) {
      id
      applicationRoles
    }
  }
`;

const normaliseRoles = (roles?: string[] | null): string[] => {
  if (!Array.isArray(roles)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const role of roles) {
    if (typeof role !== 'string') continue;
    const trimmed = role.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.sort((a, b) => a.localeCompare(b));
};

/** Roles that are configured on the application, from either form-data shape. */
const readConfiguredRoles = (
  formData: ApplicationRolesPanelProps['formData'],
  formContext: ApplicationRolesPanelProps['formContext'],
): string[] => {
  const direct = formData?.applicationRoles;
  const nested = formContext?.formData?.roles?.applicationRoles;
  return normaliseRoles(Array.isArray(direct) ? direct : nested);
};

const groupTitle = (group: IReactoryRoleModuleGroup): string =>
  group.nameSpace && group.name ? `${group.nameSpace}.${group.name}` : group.id;

/**
 * Application roles panel.
 *
 * The backend role catalogue (grouped by the module that provides each role) is
 * the source of truth for what an application may expose. This panel shows:
 *
 * - every role the backend provides, grouped by module;
 * - which of those the application has configured (solid chip) and which it has
 *   not (outlined chip);
 * - any configured role that no module provides — an invalid configuration that
 *   must be removed, flagged in red.
 *
 * In edit mode roles can be added and removed; each change is persisted through
 * `ReactoryClientUpdateRoles`, which rejects invalid role sets server-side.
 */
export const ApplicationRolesPanel: React.FC<ApplicationRolesPanelProps> = ({
  reactory: propReactory,
  formData,
  formContext,
  onChange,
  applicationId,
  mode = 'view',
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const [catalogue, setCatalogue] = useState<IReactoryRoleCatalogue | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [configuredOnly, setConfiguredOnly] = useState<boolean>(false);

  const isEdit = mode === 'edit';
  const isAdmin = reactory?.hasRole ? reactory.hasRole(['ADMIN']) : false;

  const configuredRoles = useMemo(
    () => readConfiguredRoles(formData, formContext),
    [formData, formContext],
  );

  const resolveApplicationId = (): string | undefined =>
    applicationId ||
    formContext?.props?.applicationId ||
    formContext?.props?.application?.id ||
    formContext?.props?.application?._id;

  const notify = (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'success',
  ) => {
    if (reactory?.createNotification) {
      reactory.createNotification(message, {
        type,
        canDismiss: true,
        timeout: type === 'error' ? 7000 : 3000,
        showInAppNotification: true,
      });
    }
  };

  /**
   * Fetch the backend role catalogue. The query is ADMIN-guarded, so
   * non-admins fall back to a read-only view of the configured roles.
   */
  const fetchCatalogue = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const result: any = await reactory.graphqlQuery(ROLE_CATALOGUE_QUERY, {});
      const payload = result?.data?.ReactoryRoleCatalogue;
      if (!payload) {
        throw new Error('Role catalogue was empty');
      }
      setCatalogue({
        roles: normaliseRoles(payload.roles),
        platformRoles: normaliseRoles(payload.platformRoles),
        systemRoles: normaliseRoles(payload.systemRoles),
        modules: Array.isArray(payload.modules) ? payload.modules : [],
      });
    } catch (err: any) {
      setLoadError(
        err?.message ||
          'The role catalogue could not be loaded, so role validity cannot be verified.',
      );
      if (reactory?.log) {
        reactory.log('Error fetching role catalogue:', err, 'warning');
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin, reactory]);

  useEffect(() => {
    fetchCatalogue();
  }, [fetchCatalogue]);

  /** Every role the backend says it provides. */
  const availableRoles = useMemo(() => {
    if (!catalogue) return new Set<string>();
    return new Set<string>([
      ...catalogue.roles,
      ...catalogue.platformRoles,
      ...catalogue.systemRoles,
    ]);
  }, [catalogue]);

  /** Configured roles that no module provides — must be removed. */
  const invalidRoles = useMemo(() => {
    if (!catalogue) return [];
    return configuredRoles.filter((role) => !availableRoles.has(role));
  }, [availableRoles, catalogue, configuredRoles]);

  const configuredSet = useMemo(() => new Set<string>(configuredRoles), [configuredRoles]);

  const matchesSearch = (role: string): boolean =>
    !search.trim() || role.toLowerCase().includes(search.trim().toLowerCase());

  /**
   * Persist a new role set. The server validates the payload against the
   * catalogue and rejects unknown roles, so any failure is surfaced verbatim.
   */
  const persistRoles = async (nextRoles: string[]) => {
    const clientId = resolveApplicationId();
    if (!clientId) {
      notify('Unable to determine the application id.', 'error');
      return;
    }

    const next = normaliseRoles(nextRoles);
    setSaving(true);
    try {
      const result: any = await reactory.graphqlMutation(UPDATE_ROLES_MUTATION, {
        clientId,
        roles: next,
      });

      const serverRoles = result?.data?.ReactoryClientUpdateRoles?.applicationRoles;
      const applied = normaliseRoles(Array.isArray(serverRoles) ? serverRoles : next);

      if (typeof onChange === 'function') {
        onChange({ ...(formData || {}), applicationRoles: applied });
      }
      notify('Application roles updated');
    } catch (err: any) {
      const message =
        err?.graphQLErrors?.[0]?.message ||
        err?.message ||
        'The application roles could not be updated.';
      if (reactory?.log) {
        reactory.log('Error updating application roles:', err, 'error');
      }
      notify(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addRole = (role: string) => persistRoles([...configuredRoles, role]);
  const removeRole = (role: string) => persistRoles(configuredRoles.filter((r) => r !== role));

  const renderRoleChip = (role: string, variant: 'default' | 'invalid' | 'internal') => {
    const isConfigured = configuredSet.has(role);
    const canRemove = isEdit && isConfigured && !saving;
    // Adding is blocked while invalid roles remain: the server would reject the
    // whole payload, and the operator should fix the invalid set first.
    const canAdd = isEdit && !isConfigured && !saving && invalidRoles.length === 0;

    let color: 'default' | 'primary' | 'error' | 'warning' = 'default';
    let chipVariant: 'filled' | 'outlined' = isConfigured ? 'filled' : 'outlined';
    if (variant === 'invalid') {
      color = 'error';
      chipVariant = 'filled';
    } else if (variant === 'internal') {
      color = 'warning';
    } else if (isConfigured) {
      color = 'primary';
    }

    return (
      <Chip
        key={role}
        data-testid={`role-chip-${role}`}
        data-role={role}
        data-configured={isConfigured ? 'true' : 'false'}
        label={role}
        color={color}
        variant={chipVariant}
        size="small"
        icon={
          variant === 'invalid' ? (
            <ErrorOutlineIcon />
          ) : variant === 'internal' ? (
            <InternalIcon />
          ) : isConfigured ? (
            <CheckCircleIcon />
          ) : undefined
        }
        onClick={canAdd ? () => addRole(role) : undefined}
        onDelete={canRemove ? () => removeRole(role) : undefined}
        deleteIcon={<CloseIcon data-testid={`role-remove-${role}`} />}
        sx={{
          mr: 1,
          mb: 1,
          cursor: canAdd ? 'pointer' : 'default',
          ...(variant === 'invalid' ? { fontWeight: 600 } : {}),
        }}
      />
    );
  };

  /**
   * Build the render groups: invalid roles first, then the platform group, then
   * each module that contributes roles, then internal system roles.
   */
  const renderGroups = (): React.ReactNode => {
    if (!catalogue) return null;

    const nodes: React.ReactNode[] = [];

    const visibleInvalid = invalidRoles.filter(matchesSearch);

    if (visibleInvalid.length > 0) {
      nodes.push(
        <Accordion key="__invalid" defaultExpanded data-testid="role-group-invalid">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ErrorOutlineIcon color="error" />
              <Typography variant="subtitle2" color="error">
                Unrecognised roles
              </Typography>
              <Chip size="small" label={visibleInvalid.length} color="error" />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              These roles are configured on the application, but no activated module provides
              them. Remove them (or declare them on the providing module) before adding roles.
            </Typography>
            <Box>{visibleInvalid.map((role) => renderRoleChip(role, 'invalid'))}</Box>
          </AccordionDetails>
        </Accordion>,
      );
    }

    const renderGroup = (
      key: string,
      title: string,
      subtitle: string,
      roles: string[],
      variant: 'default' | 'internal',
      icon?: React.ReactNode,
      defaultExpanded = false,
    ) => {
      const visible = roles.filter(matchesSearch);
      const filtered = configuredOnly ? visible.filter((role) => configuredSet.has(role)) : visible;
      if (filtered.length === 0) return null;

      const configuredCount = roles.filter((role) => configuredSet.has(role)).length;

      return (
        <Accordion key={key} defaultExpanded={defaultExpanded} data-testid={`role-group-${key}`}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
              {icon}
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>
                  {title}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {subtitle}
                </Typography>
              </Box>
              <Chip
                size="small"
                label={`${configuredCount}/${roles.length}`}
                color={configuredCount > 0 ? 'primary' : 'default'}
                variant={configuredCount > 0 ? 'filled' : 'outlined'}
              />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Box>{filtered.map((role) => renderRoleChip(role, variant))}</Box>
          </AccordionDetails>
        </Accordion>
      );
    };

    nodes.push(
      renderGroup(
        'platform',
        'Platform',
        'Core roles provided by the Reactory platform',
        catalogue.platformRoles,
        'default',
        <PlatformIcon color="primary" fontSize="small" />,
        true,
      ),
    );

    catalogue.modules.forEach((group) => {
      const subtitle = [
        group.isCore ? 'Core module' : null,
        group.version ? `v${group.version}` : null,
        group.description,
      ]
        .filter(Boolean)
        .join(' · ');

      nodes.push(
        renderGroup(
          group.id,
          groupTitle(group),
          subtitle,
          group.roles,
          'default',
          undefined,
          group.isCore,
        ),
      );
    });

    nodes.push(
      renderGroup(
        'system',
        'Internal',
        'Elevation roles used by service accounts — not intended as application roles',
        catalogue.systemRoles,
        'internal',
        <InternalIcon color="warning" fontSize="small" />,
        false,
      ),
    );

    return nodes;
  };

  const catalogueUnconfigured = catalogue
    ? catalogue.roles.filter((role) => !configuredSet.has(role)).length
    : 0;

  return (
    <Box sx={{ p: 2 }} data-testid="application-roles-panel">
      <Card>
        <CardHeader
          avatar={<RolesIcon />}
          title="Application Roles"
          subheader={
            catalogue
              ? `${configuredRoles.length} configured · ${catalogue.roles.length} available · ${invalidRoles.length} invalid`
              : `${configuredRoles.length} configured`
          }
          action={
            isAdmin ? (
              <Tooltip title="Refresh role catalogue">
                <span>
                  <IconButton
                    aria-label="Refresh role catalogue"
                    onClick={fetchCatalogue}
                    disabled={loading || saving}
                  >
                    <RefreshIcon />
                  </IconButton>
                </span>
              </Tooltip>
            ) : undefined
          }
        />
        <Divider />
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
              <CircularProgress size={22} />
              <Typography variant="body2" color="text.secondary">
                Loading the role catalogue…
              </Typography>
            </Box>
          ) : (
            <>
              {loadError && (
                <Alert severity="warning" sx={{ mb: 2 }} data-testid="role-catalogue-error">
                  <AlertTitle>Role catalogue unavailable</AlertTitle>
                  {loadError}
                  <Box sx={{ mt: 1 }}>
                    <Button size="small" onClick={fetchCatalogue} startIcon={<RefreshIcon />}>
                      Retry
                    </Button>
                  </Box>
                </Alert>
              )}

              {invalidRoles.length > 0 && (
                <Alert severity="error" sx={{ mb: 2 }} data-testid="invalid-roles-alert">
                  <AlertTitle>
                    {invalidRoles.length} role{invalidRoles.length === 1 ? '' : 's'} not provided
                    by the backend
                  </AlertTitle>
                  {invalidRoles.join(', ')}
                  {isEdit
                    ? ' — remove these before adding other roles.'
                    : ' — switch to edit mode to remove them.'}
                </Alert>
              )}

              {!isEdit && (
                <Alert severity="info" sx={{ mb: 2 }} data-testid="roles-readonly-alert">
                  This application exposes <strong>{configuredRoles.length}</strong> role
                  {configuredRoles.length === 1 ? '' : 's'}. Switch to edit mode to change them.
                </Alert>
              )}

              {catalogue && (
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  sx={{ mb: 2 }}
                >
                  <TextField
                    size="small"
                    placeholder="Filter roles…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    inputProps={{ 'data-testid': 'role-search' }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ maxWidth: 320 }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={configuredOnly}
                        onChange={(event) => setConfiguredOnly(event.target.checked)}
                        inputProps={
                          { 'data-testid': 'role-configured-only' } as React.InputHTMLAttributes<
                            HTMLInputElement
                          >
                        }
                      />
                    }
                    label={<Typography variant="body2">Configured only</Typography>}
                  />
                  {catalogue && configuredRoles.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {catalogueUnconfigured} available role
                      {catalogueUnconfigured === 1 ? '' : 's'} not configured
                    </Typography>
                  )}
                </Stack>
              )}

              {renderGroups()}

              {!catalogue && configuredRoles.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Configured roles
                  </Typography>
                  <Box>{configuredRoles.map((role) => renderRoleChip(role, 'default'))}</Box>
                </Box>
              )}

              {catalogue && configuredRoles.length === 0 && invalidRoles.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }} data-testid="roles-empty-alert">
                  <AlertTitle>No roles configured</AlertTitle>
                  This application does not expose any roles yet.
                  {isEdit ? ' Select roles above to add them.' : ''}
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ApplicationRolesPanel;
