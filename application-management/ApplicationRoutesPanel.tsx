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

export interface ApplicationRoutesPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: any;
  onChange?: (formData: any) => void;
  applicationId?: string;
  mode?: 'view' | 'edit';
}

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
});

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
    });
    setIsEditing(false);
    setDialogOpen(true);
  };

  const handleEditRoute = (route: any) => {
    const routeIdentifier = getRouteId(route);
    setSelectedRoute({
      ...route,
      id: routeIdentifier,
      roles: Array.isArray(route.roles) ? [...route.roles] : [],
    });
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

  const handleFieldChange = (field: string, value: any) => {
    setSelectedRoute((prev: any) => ({ ...prev, [field]: value }));
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
                                  </TableCell>
                                  <TableCell>
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
            <TextField
              label="Component FQN"
              value={selectedRoute?.componentFqn || ''}
              onChange={(e) => handleFieldChange('componentFqn', e.target.value)}
              fullWidth
              helperText="Fully qualified React component name (e.g., core.UserProfile@1.0.0)"
            />
            <TextField
              label="Redirect Path (Optional)"
              value={selectedRoute?.redirect || ''}
              onChange={(e) => handleFieldChange('redirect', e.target.value)}
              fullWidth
              helperText="Optional redirect target URL path if route redirects elsewhere"
            />
            <TextField
              label="Roles"
              value={selectedRoute?.roles?.join(', ') || ''}
              onChange={(e) =>
                handleFieldChange(
                  'roles',
                  e.target.value
                    .split(',')
                    .map((r: string) => r.trim())
                    .filter(Boolean)
                )
              }
              fullWidth
              helperText="Comma-separated list of roles allowed to access this route"
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
