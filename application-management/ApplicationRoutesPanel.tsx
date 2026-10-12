import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  Divider,
  Chip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Tooltip,
  InputAdornment,
  Autocomplete,
} from '@mui/material';
import {
  AltRoute as RouteIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  DragIndicator as DragIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { useReactory } from '@reactory/client-core/api';
import { ReactoryForm } from '@reactory/client-core/components/reactory/ReactoryForm/ReactoryForm';
import { TagsField } from '@reactory/client-core/components/shared/TagsField';
import { resolvePropsSchema } from '@reactory/client-core/components/reactory/form-engine/utils/inputFormInference';
import { JsonEditorWidget } from '@reactory/client-core/components/reactory/ux/mui/widgets/JsonEditorWidget';export interface ApplicationRoutesPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: any;
  onChange?: (formData: any) => void;
  applicationId?: string;
  mode?: 'view' | 'edit';
}

const ROUTE_SLOT_FIELDS = `
  show
  title
  componentFqn
  props
  propsMap
`;

const ROUTE_FIELDS = `
  id
  key
  path
  title
  exact
  public
  roles
  componentFqn
  redirect
  componentProps
  header { ${ROUTE_SLOT_FIELDS} }
  footer { ${ROUTE_SLOT_FIELDS} }
`;

const MUTATIONS = {
  addRoute: `mutation ReactoryClientAddRoute($clientId: String!, $route: ClientRouteInput!) {
    ReactoryClientAddRoute(clientId: $clientId, route: $route) {
      id
      routes { ${ROUTE_FIELDS} }
    }
  }`,
  updateRoute: `mutation ReactoryClientUpdateRoute($clientId: String!, $routeId: String!, $route: ClientRouteInput!) {
    ReactoryClientUpdateRoute(clientId: $clientId, routeId: $routeId, route: $route) {
      id
      routes { ${ROUTE_FIELDS} }
    }
  }`,
  deleteRoute: `mutation ReactoryClientDeleteRoute($clientId: String!, $routeId: String!) {
    ReactoryClientDeleteRoute(clientId: $clientId, routeId: $routeId) {
      id
      routes { ${ROUTE_FIELDS} }
    }
  }`,
  reorderRoutes: `mutation ReactoryClientReorderRoutes($clientId: String!, $routeIds: [String!]!) {
    ReactoryClientReorderRoutes(clientId: $clientId, routeIds: $routeIds) {
      id
      routes { ${ROUTE_FIELDS} }
    }
  }`,
};

const getRouteId = (route: any): string => {
  if (!route) return '';
  return String(route.id || route._id || route.key || route.path || '');
};

/**
 * Normalise a header/footer slot for persistence. Returns null when the slot
 * carries no configuration, so an explicitly cleared slot is removed from the
 * stored route (the server merge then drops it).
 */
export const normaliseSlot = (slot: any) => {
  if (!slot || typeof slot !== 'object') return null;
  const props = slot.props && typeof slot.props === 'object' ? slot.props : {};
  const propsMap = slot.propsMap && typeof slot.propsMap === 'object' ? slot.propsMap : {};
  const hasContent = Boolean(
    slot.componentFqn || slot.show || slot.title || Object.keys(props).length || Object.keys(propsMap).length,
  );
  if (!hasContent) return null;
  return {
    show: Boolean(slot.show),
    title: slot.title || null,
    componentFqn: slot.componentFqn || null,
    props,
    propsMap,
  };
};

const cleanRouteInput = (route: any) => ({
  key: route.key || route.path || '',
  path: route.path || '',
  title: route.title || '',
  exact: route.exact !== false,
  public: Boolean(route.public),
  roles: Array.isArray(route.roles) ? route.roles : [],
  componentFqn: route.componentFqn || '',
  redirect: route.redirect || null,
  componentProps: route.componentProps || {},
  header: normaliseSlot(route.header),
  footer: normaliseSlot(route.footer),
});

interface RouteSlotEditorProps {
  label: string;
  slotKey: 'header' | 'footer';
  slot: any;
  onChange: (slotKey: 'header' | 'footer', patch: Record<string, any>) => void;
  componentOptions: Array<{ fqn: string; title: string; componentType: string }>;
}

/**
 * Edits a single route slot (`header` / `footer`): show, title, component FQN,
 * `props` and `propsMap`. Mirrors `RouteSlotConfig` on the server, and uses
 * the JsonEditorWidget for the two free-form JSON maps.
 */
const RouteSlotEditor: React.FC<RouteSlotEditorProps> = ({
  label,
  slotKey,
  slot,
  onChange,
  componentOptions,
}) => {
  const value = slot && typeof slot === 'object' ? slot : {};
  const set = (patch: Record<string, any>) => onChange(slotKey, patch);
  const optionFqns = componentOptions.map((opt) => opt.fqn);

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={Boolean(value.show)}
              onChange={(e) => set({ show: e.target.checked })}
            />
          }
          label={<Typography variant="caption">Show</Typography>}
        />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Optional component mounted above (header) or below (footer) the route body.
      </Typography>
      <TextField
        label="Title"
        size="small"
        fullWidth
        value={value.title || ''}
        onChange={(e) => set({ title: e.target.value })}
      />
      <Autocomplete
        freeSolo
        size="small"
        options={optionFqns}
        value={value.componentFqn || ''}
        onInputChange={(_event: any, nextInput: string, reason: string) => {
          if (reason === 'reset') return;
          set({ componentFqn: nextInput });
        }}
        onChange={(_event: any, nextValue: any) => {
          const fqn = typeof nextValue === 'string' ? nextValue : (nextValue?.fqn || '');
          set({ componentFqn: fqn });
        }}
        renderInput={(params: any) => (
          <TextField {...params} label="Component FQN" helperText="Component to mount in this slot" />
        )}
      />
      <JsonEditorWidget
        id={`${slotKey}_props`}
        schema={{ type: 'object', title: 'Props' }}
        uiSchema={{ 'ui:options': { minRows: 4 } }}
        value={value.props || {}}
        onChange={(next) => set({ props: next || {} })}
      />
      <JsonEditorWidget
        id={`${slotKey}_propsMap`}
        schema={{ type: 'object', title: 'Props Map' }}
        uiSchema={{ 'ui:options': { minRows: 3 } }}
        value={value.propsMap || {}}
        onChange={(next) => set({ propsMap: next || {} })}
      />
    </Box>
  );
};

export const ApplicationRoutesPanel: React.FC<ApplicationRoutesPanelProps> = ({
  reactory: propReactory,
  formData,
  onChange,
  applicationId,
  mode = 'view',
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const isAdmin = reactory.hasRole ? reactory.hasRole(['ADMIN']) : true;

  const [routes, setRoutes] = useState<any[]>(formData?.routes || []);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Component FQN selector input (mirrors selectedRoute.componentFqn while typing).
  const [componentFqnInput, setComponentFqnInput] = useState('');

  // Extended properties (componentProps) editor state.
  const [propsSchema, setPropsSchema] = useState<any>(null);
  const [propsSource, setPropsSource] = useState<'form' | 'inferred' | 'none'>('none');
  const [propsMatchedId, setPropsMatchedId] = useState<string>('');
  const [propsUiSchema, setPropsUiSchema] = useState<Record<string, any>>({});
  const [propsWidgetMap, setPropsWidgetMap] = useState<any[]>([]);
  const [propsLoading, setPropsLoading] = useState(false);
  const [propsUseRawJson, setPropsUseRawJson] = useState(false);
  const [propsRawJson, setPropsRawJson] = useState('{}');
  const [propsError, setPropsError] = useState<string | null>(null);

  useEffect(() => {
    if (formData?.routes) {
      setRoutes(formData.routes);
    }
  }, [formData?.routes]);

  const totalRoutes = formData?.totalRoutes || routes.length;

  const updateRoutesFromResult = useCallback(
    (result: any, mutationKey: string) => {
      const data = result?.data?.[mutationKey];
      if (data?.routes) {
        setRoutes(data.routes);
        if (typeof onChange === 'function') {
          onChange({
            ...formData,
            routes: data.routes,
            totalRoutes: data.routes.length,
          });
        }
      }
    },
    [formData, onChange]
  );

  const handleAddRoute = () => {
    setSelectedRoute({
      id: '',
      key: '',
      path: '',
      title: '',
      exact: true,
      public: false,
      roles: [],
      componentFqn: '',
      redirect: '',
      componentProps: {},
      header: {},
      footer: {},
    });
    setComponentFqnInput('');
    setPropsSchema(null);
    setPropsSource('none');
    setPropsMatchedId('');
    setPropsUseRawJson(false);
    setPropsRawJson('{}');
    setPropsError(null);
    setIsEditing(false);
    setDialogOpen(true);
  };

  const handleEditRoute = (route: any) => {
    const routeIdentifier = getRouteId(route);
    setSelectedRoute({
      ...route,
      id: routeIdentifier,
      roles: Array.isArray(route.roles) ? [...route.roles] : [],
      componentProps: route.componentProps || {},
      header: route.header || {},
      footer: route.footer || {},
    });
    setComponentFqnInput(route.componentFqn || '');
    setPropsSchema(null);
    setPropsSource('none');
    setPropsMatchedId('');
    setPropsUseRawJson(false);
    setPropsRawJson(JSON.stringify(route.componentProps || {}, null, 2));
    setPropsError(null);
    setIsEditing(true);
    setDialogOpen(true);
  };

  const handleDeleteRoute = async (route: any) => {
    const routeIdentifier = getRouteId(route);
    if (!applicationId || !routeIdentifier) {
      if (reactory.createNotification) {
        reactory.createNotification('Cannot delete route: missing identifier or application ID', { type: 'warning' });
      }
      return;
    }

    if (!window.confirm(`Are you sure you want to delete route "${route.title || route.path}"?`)) {
      return;
    }

    setLoading(true);
    try {
      const result: any = await reactory.graphqlMutation(MUTATIONS.deleteRoute, {
        clientId: applicationId,
        routeId: routeIdentifier,
      });
      updateRoutesFromResult(result, 'ReactoryClientDeleteRoute');
      if (reactory.createNotification) {
        reactory.createNotification('Route deleted successfully', { type: 'success' });
      }
    } catch (error: any) {
      if (reactory.createNotification) {
        reactory.createNotification(error?.message || 'Error deleting route', { type: 'error' });
      }
      if (reactory.log) {
        reactory.log('Error deleting route:', error, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRoute = async () => {
    if (!applicationId || !selectedRoute) return;

    if (!selectedRoute.path || !selectedRoute.path.trim()) {
      if (reactory.createNotification) {
        reactory.createNotification('Route path is required', { type: 'warning' });
      }
      return;
    }

    setLoading(true);
    try {
      const routeInput = cleanRouteInput(selectedRoute);
      const routeIdentifier = selectedRoute.id || selectedRoute.key || selectedRoute.path;

      if (isEditing && routeIdentifier) {
        const result: any = await reactory.graphqlMutation(MUTATIONS.updateRoute, {
          clientId: applicationId,
          routeId: routeIdentifier,
          route: routeInput,
        });
        updateRoutesFromResult(result, 'ReactoryClientUpdateRoute');
        if (reactory.createNotification) {
          reactory.createNotification('Route updated successfully', { type: 'success' });
        }
      } else {
        const result: any = await reactory.graphqlMutation(MUTATIONS.addRoute, {
          clientId: applicationId,
          route: routeInput,
        });
        updateRoutesFromResult(result, 'ReactoryClientAddRoute');
        if (reactory.createNotification) {
          reactory.createNotification('Route added successfully', { type: 'success' });
        }
      }

      setDialogOpen(false);
      setSelectedRoute(null);
    } catch (error: any) {
      if (reactory.createNotification) {
        reactory.createNotification(error?.message || 'Error saving route', { type: 'error' });
      }
      if (reactory.log) {
        reactory.log('Error saving route:', error, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const persistReorderedRoutes = async (reordered: any[]) => {
    setRoutes(reordered);
    if (!applicationId) return;

    const routeIds = reordered.map(getRouteId).filter(Boolean);
    setLoading(true);
    try {
      const result: any = await reactory.graphqlMutation(MUTATIONS.reorderRoutes, {
        clientId: applicationId,
        routeIds,
      });
      updateRoutesFromResult(result, 'ReactoryClientReorderRoutes');
    } catch (error: any) {
      setRoutes(routes);
      if (reactory.createNotification) {
        reactory.createNotification(error?.message || 'Error reordering routes', { type: 'error' });
      }
      if (reactory.log) {
        reactory.log('Error reordering routes:', error, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMoveRoute = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= routes.length) return;

    const reordered = [...routes];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    persistReorderedRoutes(reordered);
  };

  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;

    const reordered = [...routes];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    persistReorderedRoutes(reordered);
  };

  const handleToggleAccess = async (route: any) => {
    const routeIdentifier = getRouteId(route);
    if (!applicationId || !isAdmin || !routeIdentifier) return;

    setLoading(true);
    try {
      const result: any = await reactory.graphqlMutation(MUTATIONS.updateRoute, {
        clientId: applicationId,
        routeId: routeIdentifier,
        route: {
          key: route.key,
          path: route.path,
          title: route.title,
          exact: route.exact,
          public: !route.public,
          roles: route.roles || [],
          componentFqn: route.componentFqn,
          redirect: route.redirect || null,
          componentProps: route.componentProps || {},
          header: route.header || null,
          footer: route.footer || null,
        },
      });
      updateRoutesFromResult(result, 'ReactoryClientUpdateRoute');
      if (reactory.createNotification) {
        reactory.createNotification(`Route access changed to ${!route.public ? 'Public' : 'Private'}`, { type: 'info' });
      }
    } catch (error: any) {
      if (reactory.createNotification) {
        reactory.createNotification(error?.message || 'Error updating route access', { type: 'error' });
      }
      if (reactory.log) {
        reactory.log('Error toggling route access:', error, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedRoute(null);
  };

  const handleSlotChange = (slotKey: 'header' | 'footer', patch: Record<string, any>) => {
    setSelectedRoute((prev: any) => ({
      ...prev,
      [slotKey]: { ...((prev && prev[slotKey]) || {}), ...patch },
    }));
  };

  const handleFieldChange = (field: string, value: any) => {
    setSelectedRoute((prev: any) => ({ ...prev, [field]: value }));
  };

  /**
   * Registered components/forms available to bind to a route, for the
   * Component FQN selector.
   */
  const componentOptions = React.useMemo(() => {
    const register = (reactory as any)?.componentRegister || {};
    return Object.keys(register)
      .map((fqn) => {
        const entry = register[fqn] || {};
        return {
          fqn,
          title: entry.title || entry.name || fqn,
          componentType: entry.componentType || 'component',
        };
      })
      .sort((a, b) => a.fqn.localeCompare(b.fqn));
  }, [reactory]);

  const componentOptionByFqn = React.useMemo(() => {
    const map: Record<string, { title: string; componentType: string }> = {};
    componentOptions.forEach((opt) => {
      map[opt.fqn] = { title: opt.title, componentType: opt.componentType };
    });
    return map;
  }, [componentOptions]);

  /**
   * Resolve the extended-properties (componentProps) schema whenever the dialog
   * opens or the target component changes. With an FQN we use the component's
   * input form; without one we infer the property shape from the props already
   * on the route — the same fallback the workflow QuickLauncher uses.
   */
  useEffect(() => {
    if (!dialogOpen || !selectedRoute) return undefined;
    let cancelled = false;
    setPropsLoading(true);
    setPropsError(null);
    resolvePropsSchema(reactory as any, selectedRoute.componentFqn, selectedRoute.componentProps)
      .then((resolved) => {
        if (cancelled) return;
        setPropsSchema(resolved.schema);
        setPropsSource(resolved.source);
        setPropsMatchedId(resolved.matchedId || '');
        setPropsUiSchema(resolved.uiSchema || {});
        setPropsWidgetMap(Array.isArray(resolved.widgetMap) ? resolved.widgetMap : []);
        const nextProps = resolved.initialData || {};
        setSelectedRoute((prev: any) => (prev ? { ...prev, componentProps: nextProps } : prev));
        setPropsRawJson(JSON.stringify(nextProps, null, 2));
      })
      .catch((err: any) => {
        if (cancelled) return;
        setPropsError(err?.message || 'Failed to resolve component properties');
      })
      .finally(() => {
        if (!cancelled) setPropsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, selectedRoute?.componentFqn]);

  const propsHasFields = Boolean(
    propsSchema && propsSchema.properties && Object.keys(propsSchema.properties).length > 0,
  );
  const propsShowRaw = propsUseRawJson || !propsHasFields;

  const propsFormDef = React.useMemo(() => {
    if (!propsSchema) return null;
    return {
      id: 'reactory.RouteComponentProps@1.0.0',
      name: 'RouteComponentProps',
      nameSpace: 'reactory',
      version: '1.0.0',
      schema: propsSchema,
      uiSchema: propsUiSchema,
      widgetMap: propsWidgetMap.length > 0 ? propsWidgetMap : undefined,
    } as any;
  }, [propsSchema, propsUiSchema, propsWidgetMap]);

  const handlePropsRawJsonChange = (text: string) => {
    setPropsRawJson(text);
    try {
      const parsed = JSON.parse(text);
      handleFieldChange('componentProps', parsed);
      setPropsError(null);
    } catch (err) {
      setPropsError('Invalid JSON');
    }
  };

  const filteredRoutes = routes.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.path && r.path.toLowerCase().includes(term)) ||
      (r.title && r.title.toLowerCase().includes(term)) ||
      (r.key && r.key.toLowerCase().includes(term)) ||
      (r.componentFqn && r.componentFqn.toLowerCase().includes(term))
    );
  });

  return (
    <Box sx={{ p: 2 }}>
      <Card>
        <CardHeader
          avatar={loading ? <CircularProgress size={24} /> : <RouteIcon />}
          title="Application Routes"
          subheader={`${routes.length} configured route${routes.length !== 1 ? 's' : ''}`}
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                size="small"
                placeholder="Search routes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: 220 }}
              />
              {isAdmin && (
                <Button
                  startIcon={<AddIcon />}
                  variant="contained"
                  size="small"
                  onClick={handleAddRoute}
                  disabled={loading}
                >
                  Add Route
                </Button>
              )}
            </Box>
          }
        />
        <Divider />
        <CardContent>
          {!isAdmin && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Only administrators can manage and reorder routes.
            </Alert>
          )}

          {filteredRoutes.length > 0 ? (
            <DragDropContext onDragEnd={handleDragEnd}>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {isAdmin && <TableCell width={100}>Order</TableCell>}
                      <TableCell>Path</TableCell>
                      <TableCell>Title</TableCell>
                      <TableCell>Component FQN</TableCell>
                      <TableCell>Access</TableCell>
                      <TableCell>Roles</TableCell>
                      {isAdmin && <TableCell align="right" width={110}>Actions</TableCell>}
                    </TableRow>
                  </TableHead>
                  <Droppable droppableId="routes-table-body" isDropDisabled={!isAdmin || loading || Boolean(searchTerm)}>
                    {(droppableProvided) => (
                      <TableBody ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
                        {filteredRoutes.map((route: any, index: number) => {
                          const routeId = getRouteId(route) || `route-${index}`;
                          return (
                            <Draggable
                              key={routeId}
                              draggableId={routeId}
                              index={index}
                              isDragDisabled={!isAdmin || loading || Boolean(searchTerm)}
                            >
                              {(draggableProvided, snapshot) => (
                                <TableRow
                                  ref={draggableProvided.innerRef}
                                  {...draggableProvided.draggableProps}
                                  sx={{
                                    backgroundColor: snapshot.isDragging ? 'action.hover' : 'inherit',
                                  }}
                                >
                                  {isAdmin && (
                                    <TableCell>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box
                                          {...draggableProvided.dragHandleProps}
                                          sx={{
                                            cursor: searchTerm ? 'default' : 'grab',
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: searchTerm ? 'action.disabled' : 'action.active',
                                          }}
                                        >
                                          <Tooltip title={searchTerm ? 'Clear search to drag' : 'Drag to reorder'}>
                                            <DragIcon fontSize="small" />
                                          </Tooltip>
                                        </Box>
                                        <Tooltip title="Move up">
                                          <span>
                                            <IconButton
                                              size="small"
                                              onClick={() => handleMoveRoute(index, 'up')}
                                              disabled={index === 0 || loading || Boolean(searchTerm)}
                                            >
                                              <ArrowUpwardIcon fontSize="small" />
                                            </IconButton>
                                          </span>
                                        </Tooltip>
                                        <Tooltip title="Move down">
                                          <span>
                                            <IconButton
                                              size="small"
                                              onClick={() => handleMoveRoute(index, 'down')}
                                              disabled={index === routes.length - 1 || loading || Boolean(searchTerm)}
                                            >
                                              <ArrowDownwardIcon fontSize="small" />
                                            </IconButton>
                                          </span>
                                        </Tooltip>
                                      </Box>
                                    </TableCell>
                                  )}
                                  <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Typography variant="body2" fontFamily="monospace" sx={{ fontWeight: 600 }}>
                                        {route.path}
                                      </Typography>
                                      {route.exact && <Chip label="exact" size="small" variant="outlined" />}
                                      {route.redirect && (
                                        <Chip label={`→ ${route.redirect}`} size="small" color="secondary" variant="outlined" />
                                      )}
                                    </Box>
                                  </TableCell>
                                  <TableCell>{route.title || '-'}</TableCell>
                                  <TableCell>
                                    <Typography variant="caption" fontFamily="monospace">
                                      {route.componentFqn || '-'}
                                    </Typography>
                                    {(route.header?.componentFqn || route.footer?.componentFqn) && (
                                      <Typography variant="caption" color="text.secondary" display="block">
                                        Slots: {[route.header?.componentFqn ? 'header' : null, route.footer?.componentFqn ? 'footer' : null].filter(Boolean).join(', ')}
                                      </Typography>
                                    )}
                                  </TableCell>                                  <TableCell>
                                    {isAdmin ? (
                                      <Tooltip title="Click to toggle access">
                                        <Chip
                                          icon={route.public ? <LockOpenIcon /> : <LockIcon />}
                                          label={route.public ? 'Public' : 'Private'}
                                          size="small"
                                          color={route.public ? 'success' : 'default'}
                                          onClick={() => handleToggleAccess(route)}
                                          disabled={loading}
                                          sx={{ cursor: 'pointer' }}
                                        />
                                      </Tooltip>
                                    ) : (
                                      <Chip
                                        icon={route.public ? <LockOpenIcon /> : <LockIcon />}
                                        label={route.public ? 'Public' : 'Private'}
                                        size="small"
                                        color={route.public ? 'success' : 'default'}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                      {route.roles && route.roles.length > 0 ? (
                                        route.roles.map((role: string) => (
                                          <Chip key={role} label={role} size="small" />
                                        ))
                                      ) : (
                                        <Typography variant="caption" color="text.secondary">
                                          All roles
                                        </Typography>
                                      )}
                                    </Box>
                                  </TableCell>
                                  {isAdmin && (
                                    <TableCell align="right">
                                      <Tooltip title="Edit route">
                                        <IconButton
                                          size="small"
                                          onClick={() => handleEditRoute(route)}
                                          disabled={loading}
                                        >
                                          <EditIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete route">
                                        <IconButton
                                          size="small"
                                          color="error"
                                          onClick={() => handleDeleteRoute(route)}
                                          disabled={loading}
                                        >
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    </TableCell>
                                  )}
                                </TableRow>
                              )}
                            </Draggable>
                          );
                        })}
                        {droppableProvided.placeholder}
                      </TableBody>
                    )}
                  </Droppable>
                </Table>
              </TableContainer>
            </DragDropContext>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {searchTerm ? 'No routes matched your search query.' : 'No routes configured. Click Add Route to configure routes for this application.'}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Route Dialog */}
      <Dialog open={dialogOpen} onClose={handleDialogClose} maxWidth="md" fullWidth>
        <DialogTitle>{isEditing ? 'Edit Route' : 'Add New Route'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Route Key"
              value={selectedRoute?.key || ''}
              onChange={(e) => handleFieldChange('key', e.target.value)}
              fullWidth
              helperText="Unique identifier for the route (e.g., dashboard, user-profile)"
            />
            <TextField
              label="Path"
              value={selectedRoute?.path || ''}
              onChange={(e) => handleFieldChange('path', e.target.value)}
              fullWidth
              required
              helperText="URL route path pattern (e.g., /dashboard or /users/:id)"
            />
            <TextField
              label="Title"
              value={selectedRoute?.title || ''}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              fullWidth
              helperText="Human-readable title for page and breadcrumb navigation"
            />
            <Autocomplete
              freeSolo
              options={componentOptions.map((opt) => opt.fqn)}
              value={selectedRoute?.componentFqn || ''}
              inputValue={componentFqnInput}
              onInputChange={(_event: any, nextInput: string, reason: string) => {
                if (reason === 'reset') return;
                setComponentFqnInput(nextInput);
                handleFieldChange('componentFqn', nextInput);
              }}
              onChange={(_event: any, nextValue: any) => {
                const fqn = typeof nextValue === 'string' ? nextValue : (nextValue?.fqn || '');
                setComponentFqnInput(fqn);
                handleFieldChange('componentFqn', fqn);
              }}
              renderOption={(optionProps: any, option: string) => {
                const meta = componentOptionByFqn[option];
                return (
                  <Box component="li" {...optionProps} key={option}>
                    <Box>
                      <Typography variant="body2" fontFamily="monospace">{option}</Typography>
                      {meta && (
                        <Typography variant="caption" color="text.secondary">
                          {meta.title} · {meta.componentType}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              }}
              renderInput={(params: any) => (
                <TextField
                  {...params}
                  label="Component FQN"
                  fullWidth
                  helperText="Fully qualified component or form to bind (e.g. core.UserProfile@1.0.0). Leave empty to infer properties."
                />
              )}
            />
            <TextField
              label="Redirect Path (Optional)"
              value={selectedRoute?.redirect || ''}
              onChange={(e) => handleFieldChange('redirect', e.target.value)}
              fullWidth
              helperText="Optional redirect target URL path if route redirects elsewhere"
            />
            <TagsField
              label="Roles"
              value={selectedRoute?.roles}
              onChange={(next) => handleFieldChange('roles', next)}
              placeholder="Add a role..."
              helperText="Roles allowed to access this route (leave empty for all roles)"
            />
            {/* Extended properties (componentProps) passed to the bound component */}
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2">Extended Properties</Typography>
                  {propsSource === 'form' && (
                    <Chip
                      size="small"
                      color="success"
                      variant="outlined"
                      label={`From ${propsMatchedId || 'component'}`}
                    />
                  )}
                  {propsSource === 'inferred' && (
                    <Chip size="small" color="info" variant="outlined" label="Inferred schema" />
                  )}
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={propsUseRawJson}
                      onChange={(e) => {
                        setPropsUseRawJson(e.target.checked);
                        if (!e.target.checked) {
                          setPropsRawJson(JSON.stringify(selectedRoute?.componentProps || {}, null, 2));
                        }
                      }}
                    />
                  }
                  label={<Typography variant="caption">Raw JSON</Typography>}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {selectedRoute?.componentFqn
                  ? 'Props passed to the bound component. The shape is resolved from the component when an input form exists, otherwise inferred.'
                  : 'No component FQN set — property shape is inferred from the values below (same as the workflow QuickLauncher).'}
              </Typography>

              {propsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={20} />
                </Box>
              ) : propsShowRaw || !propsFormDef ? (
                <TextField
                  label="Component Props (JSON)"
                  value={propsRawJson}
                  onChange={(e) => handlePropsRawJsonChange(e.target.value)}
                  fullWidth
                  multiline
                  minRows={4}
                  error={Boolean(propsError)}
                  helperText={propsError || 'JSON object of props passed to the component'}
                  InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                />
              ) : (
                <Box sx={{ '& .MuiPaper-root': { bgcolor: 'transparent' } }}>
                  <ReactoryForm
                    key={`routeProps_${propsMatchedId || 'inferred'}`}
                    formDef={propsFormDef}
                    data={selectedRoute?.componentProps || {}}
                    onChange={(val: any) => {
                      const next = val?.formData || val || {};
                      handleFieldChange('componentProps', next);
                      setPropsRawJson(JSON.stringify(next, null, 2));
                    }}
                  />
                </Box>
              )}
            </Box>

            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Route Slots (Optional)
            </Typography>
            <RouteSlotEditor
              label="Header Slot"
              slotKey="header"
              slot={selectedRoute?.header}
              onChange={handleSlotChange}
              componentOptions={componentOptions}
            />
            <RouteSlotEditor
              label="Footer Slot"
              slotKey="footer"
              slot={selectedRoute?.footer}
              onChange={handleSlotChange}
              componentOptions={componentOptions}
            />

            <Box sx={{ display: 'flex', gap: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={selectedRoute?.exact !== false}
                    onChange={(e) => handleFieldChange('exact', e.target.checked)}
                  />
                }
                label="Exact Match"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(selectedRoute?.public)}
                    onChange={(e) => handleFieldChange('public', e.target.checked)}
                  />
                }
                label="Public Route (No login required)"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSaveRoute} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : isEditing ? 'Update & Save' : 'Create & Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApplicationRoutesPanel;
