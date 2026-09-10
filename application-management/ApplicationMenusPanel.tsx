import React, { useState, useEffect, useCallback, Fragment } from 'react';
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
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Alert,
  Autocomplete,
  Switch,
  Tooltip,
  FormControlLabel,
  CircularProgress,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Link as LinkIcon,
  ToggleOn as ToggleOnIcon,
  ToggleOff as ToggleOffIcon,
  Flag as FlagIcon,
  DragIndicator as DragIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { useReactory } from '@reactory/client-core/api';

export interface ApplicationMenusPanelProps {
  reactory?: Reactory.Client.IReactoryApi;
  formData?: any;
  onChange?: (formData: any) => void;
  applicationId?: string;
  mode?: 'view' | 'edit';
  availableFeatureFlags?: { feature: string; enabled?: boolean }[];
}

const MENU_ITEM_FIELDS = `
  id
  ordinal
  title
  link
  external
  icon
  roles
  enabled
  featureFlags
  items {
    id
    ordinal
    title
    link
    external
    icon
    roles
    enabled
    featureFlags
    items {
      id
      ordinal
      title
      link
      external
      icon
      roles
      enabled
      featureFlags
    }
  }
`;

const MUTATIONS = {
  updateMenus: `mutation ReactoryClientUpdateMenus($clientId: String!, $menus: [MenuInput!]!) {
    ReactoryClientUpdateMenus(clientId: $clientId, menus: $menus) {
      id
      menus {
        id
        name
        key
        target
        roles
        enabled
        featureFlags
        entries {
          ${MENU_ITEM_FIELDS}
        }
      }
    }
  }`,
};

const cleanMenuItem = (item: any, index: number): any => {
  const isTempId = !item.id || (typeof item.id === 'string' && item.id.startsWith('item_'));
  return {
    id: isTempId ? undefined : item.id,
    ordinal: typeof item.ordinal === 'number' ? item.ordinal : index,
    title: item.title || item.label || '',
    link: item.link || item.route || '',
    external: Boolean(item.external),
    icon: item.icon || null,
    roles: Array.isArray(item.roles) ? item.roles : [],
    enabled: item.enabled !== false,
    featureFlags: Array.isArray(item.featureFlags) ? item.featureFlags : [],
    items: Array.isArray(item.items) ? item.items.map(cleanMenuItem) : [],
  };
};

const cleanMenuForMutation = (menu: any): any => {
  const isTempId = !menu.id || (typeof menu.id === 'string' && menu.id.startsWith('menu_'));
  const rawItems = menu.entries || menu.items || [];
  return {
    id: isTempId ? undefined : menu.id,
    name: menu.name || '',
    key: menu.key || '',
    target: menu.target || '',
    roles: Array.isArray(menu.roles) ? menu.roles : [],
    enabled: menu.enabled !== false,
    featureFlags: Array.isArray(menu.featureFlags) ? menu.featureFlags : [],
    entries: rawItems.map(cleanMenuItem),
  };
};

const normalizeMenuItem = (item: any): any => ({
  id: item.id || `item_${Math.random().toString(36).substr(2, 9)}`,
  label: item.title || item.label || '',
  title: item.title || item.label || '',
  route: item.link || item.route || '',
  link: item.link || item.route || '',
  icon: item.icon || '',
  external: Boolean(item.external),
  roles: Array.isArray(item.roles) ? item.roles : [],
  enabled: item.enabled !== false,
  featureFlags: Array.isArray(item.featureFlags) ? item.featureFlags : [],
  items: Array.isArray(item.items) ? item.items.map(normalizeMenuItem) : [],
});

const normalizeMenu = (menu: any): any => {
  const rawItems = menu.entries || menu.items || [];
  return {
    id: menu.id || menu._id || `menu_${Math.random().toString(36).substr(2, 9)}`,
    name: menu.name || '',
    key: menu.key || '',
    target: menu.target || '',
    roles: Array.isArray(menu.roles) ? menu.roles : [],
    enabled: menu.enabled !== false,
    featureFlags: Array.isArray(menu.featureFlags) ? menu.featureFlags : [],
    items: rawItems.map(normalizeMenuItem),
    entries: rawItems.map(normalizeMenuItem),
  };
};

interface MenuItemsListProps {
  items: any[];
  menuIndex: number;
  depth: number;
  isAdmin: boolean;
  onToggleEnabled: (menuIndex: number, itemIndex: number) => void;
  onMoveItem?: (menuIndex: number, itemIndex: number, direction: 'up' | 'down') => void;
  onEditItem?: (item: any, itemIndex: number) => void;
  onDeleteItem?: (itemIndex: number) => void;
}

const MenuItemsList: React.FC<MenuItemsListProps> = ({
  items,
  menuIndex,
  depth,
  isAdmin,
  onToggleEnabled,
  onMoveItem,
  onEditItem,
  onDeleteItem,
}) => (
  <List disablePadding sx={depth > 0 ? { pl: 3, borderLeft: '2px solid', borderColor: 'divider' } : {}}>
    {items.map((item: any, itemIndex: number) => (
      <Fragment key={item.id || itemIndex}>
        <ListItem
          divider
          sx={{
            opacity: item.enabled !== false ? 1 : 0.55,
            py: 1,
          }}
          secondaryAction={
            isAdmin && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {onMoveItem && (
                  <>
                    <Tooltip title="Move up">
                      <span>
                        <IconButton
                          size="small"
                          disabled={itemIndex === 0}
                          onClick={() => onMoveItem(menuIndex, itemIndex, 'up')}
                        >
                          <ArrowUpwardIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton
                          size="small"
                          disabled={itemIndex === items.length - 1}
                          onClick={() => onMoveItem(menuIndex, itemIndex, 'down')}
                        >
                          <ArrowDownwardIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </>
                )}
                {onEditItem && (
                  <Tooltip title="Edit item">
                    <IconButton size="small" onClick={() => onEditItem(item, itemIndex)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {onDeleteItem && (
                  <Tooltip title="Delete item">
                    <IconButton size="small" color="error" onClick={() => onDeleteItem(itemIndex)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title={item.enabled !== false ? 'Disable item' : 'Enable item'}>
                  <IconButton
                    size="small"
                    onClick={() => onToggleEnabled(menuIndex, itemIndex)}
                    color={item.enabled !== false ? 'success' : 'default'}
                  >
                    {item.enabled !== false ? (
                      <ToggleOnIcon fontSize="small" />
                    ) : (
                      <ToggleOffIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              </Box>
            )
          }
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {item.label || item.title}
                </Typography>
                <Chip
                  label={item.enabled !== false ? 'On' : 'Off'}
                  size="small"
                  color={item.enabled !== false ? 'success' : 'error'}
                  variant="outlined"
                  sx={{ height: 20, fontSize: 11 }}
                />
                {item.items?.length > 0 && (
                  <Chip
                    label={`${item.items.length} sub-item${item.items.length !== 1 ? 's' : ''}`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: 11 }}
                  />
                )}
              </Box>
            }
            secondary={
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                <Typography variant="caption" fontFamily="monospace">
                  {item.route || item.link || '-'}
                </Typography>
                {item.featureFlags?.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {item.featureFlags.map((flag: string) => (
                      <Chip
                        key={flag}
                        icon={<FlagIcon sx={{ fontSize: 12 }} />}
                        label={flag}
                        size="small"
                        variant="outlined"
                        color="primary"
                        sx={{ height: 20, fontSize: 11 }}
                      />
                    ))}
                  </Box>
                )}
                {item.roles?.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {item.roles.map((role: string) => (
                      <Chip key={role} label={role} size="small" sx={{ height: 20, fontSize: 11 }} />
                    ))}
                  </Box>
                )}
              </Box>
            }
          />
        </ListItem>
        {item.items?.length > 0 && (
          <MenuItemsList
            items={item.items}
            menuIndex={menuIndex}
            depth={depth + 1}
            isAdmin={isAdmin}
            onToggleEnabled={onToggleEnabled}
            onMoveItem={onMoveItem}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
          />
        )}
      </Fragment>
    ))}
  </List>
);

export const ApplicationMenusPanel: React.FC<ApplicationMenusPanelProps> = (props) => {
  const {
    reactory: propReactory,
    formData,
    onChange,
    applicationId,
    mode = 'view',
    availableFeatureFlags = [],
  } = props;

  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;
  const isAdmin = reactory.hasRole ? reactory.hasRole(['ADMIN']) : true;

  const [menus, setMenus] = useState<any[]>(() => (formData?.menus || []).map(normalizeMenu));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (formData?.menus) {
      setMenus(formData.menus.map(normalizeMenu));
    }
  }, [formData?.menus]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [currentMenuIndex, setCurrentMenuIndex] = useState<number>(-1);
  const [editItemIndex, setEditItemIndex] = useState<number>(-1);

  const featureFlagOptions: string[] = availableFeatureFlags
    .map((f: any) => f.feature)
    .filter(Boolean);

  /**
   * Persists the full menus array to the backend GraphQL service and syncs parent form.
   */
  const saveMenusToServer = useCallback(
    async (updatedMenus: any[]) => {
      setMenus(updatedMenus.map(normalizeMenu));
      if (typeof onChange === 'function') {
        onChange({
          ...formData,
          menus: updatedMenus,
          totalMenus: updatedMenus.length,
        });
      }

      if (!applicationId) {
        return;
      }

      setSaving(true);
      try {
        const payload = updatedMenus.map(cleanMenuForMutation);
        const result: any = await reactory.graphqlMutation(MUTATIONS.updateMenus, {
          clientId: applicationId,
          menus: payload,
        });

        const serverMenus = result?.data?.ReactoryClientUpdateMenus?.menus;
        if (serverMenus) {
          const normalized = serverMenus.map(normalizeMenu);
          setMenus(normalized);
          if (typeof onChange === 'function') {
            onChange({
              ...formData,
              menus: normalized,
              totalMenus: normalized.length,
            });
          }
        }
        if (reactory.createNotification) {
          reactory.createNotification('Menus saved successfully', { type: 'success' });
        }
      } catch (error: any) {
        if (reactory.log) {
          reactory.log('Error saving menus:', error, 'error');
        }
        if (reactory.createNotification) {
          reactory.createNotification(error?.message || 'Error saving menus', { type: 'error' });
        }
      } finally {
        setSaving(false);
      }
    },
    [applicationId, formData, onChange, reactory]
  );

  /**
   * Toggle menu enabled/disabled state inline and persist.
   */
  const handleToggleMenuEnabled = (menuIndex: number) => {
    const updated = menus.map((m: any, i: number) =>
      i === menuIndex ? { ...m, enabled: !m.enabled } : m
    );
    saveMenusToServer(updated);
  };

  /**
   * Toggle menu item enabled/disabled state inline and persist.
   */
  const handleToggleItemEnabled = (menuIndex: number, itemIndex: number) => {
    const updated = menus.map((m: any, mi: number) => {
      if (mi !== menuIndex) return m;
      const updatedItems = (m.items || []).map((item: any, ii: number) =>
        ii === itemIndex ? { ...item, enabled: !item.enabled } : item
      );
      return { ...m, items: updatedItems, entries: updatedItems };
    });
    saveMenusToServer(updated);
  };

  /**
   * Move a menu up or down by index.
   */
  const handleMoveMenu = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= menus.length) return;

    const reordered = [...menus];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    saveMenusToServer(reordered);
  };

  /**
   * Move a menu item within a menu up or down.
   */
  const handleMoveMenuItem = (menuIndex: number, itemIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
    const menu = menus[menuIndex];
    if (!menu || !menu.items || targetIndex < 0 || targetIndex >= menu.items.length) return;

    const updatedItems = [...menu.items];
    const [moved] = updatedItems.splice(itemIndex, 1);
    updatedItems.splice(targetIndex, 0, moved);

    const updatedMenus = menus.map((m, idx) =>
      idx === menuIndex ? { ...m, items: updatedItems, entries: updatedItems } : m
    );
    saveMenusToServer(updatedMenus);
  };

  /**
   * Handle Drag & Drop reordering of root menus.
   */
  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || source.index === destination.index) return;

    const reordered = [...menus];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    saveMenusToServer(reordered);
  };

  /**
   * Handle Drag & Drop reordering of items inside the edit menu dialog.
   */
  const handleItemDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination || source.index === destination.index || !selectedMenu) return;

    const updatedItems = [...(selectedMenu.items || [])];
    const [moved] = updatedItems.splice(source.index, 1);
    updatedItems.splice(destination.index, 0, moved);

    setSelectedMenu((prev: any) => ({ ...prev, items: updatedItems, entries: updatedItems }));
  };

  const handleAddMenu = () => {
    setSelectedMenu({
      id: `menu_${Math.random().toString(36).substr(2, 9)}`,
      key: '',
      name: '',
      target: '',
      roles: [],
      featureFlags: [],
      enabled: true,
      items: [],
      entries: [],
    });
    setCurrentMenuIndex(-1);
    setIsEditing(false);
    setDialogOpen(true);
  };

  const handleEditMenu = (menu: any, index: number) => {
    setSelectedMenu({
      ...menu,
      items: [...(menu.items || menu.entries || [])],
      entries: [...(menu.items || menu.entries || [])],
    });
    setCurrentMenuIndex(index);
    setIsEditing(true);
    setDialogOpen(true);
  };

  const handleDeleteMenu = (menuIndex: number) => {
    if (!window.confirm('Are you sure you want to delete this menu?')) return;
    const updated = menus.filter((_: any, i: number) => i !== menuIndex);
    saveMenusToServer(updated);
  };

  const handleSaveMenu = () => {
    let updated: any[];
    if (isEditing && currentMenuIndex >= 0) {
      updated = menus.map((m: any, i: number) =>
        i === currentMenuIndex ? { ...selectedMenu } : m
      );
    } else {
      updated = [...menus, { ...selectedMenu }];
    }
    saveMenusToServer(updated);
    setDialogOpen(false);
    setSelectedMenu(null);
    setCurrentMenuIndex(-1);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedMenu(null);
    setCurrentMenuIndex(-1);
  };

  const handleFieldChange = (field: string, value: any) => {
    setSelectedMenu((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleAddMenuItem = () => {
    setSelectedItem({
      id: `item_${Math.random().toString(36).substr(2, 9)}`,
      label: '',
      title: '',
      icon: '',
      route: '',
      link: '',
      roles: [],
      enabled: true,
      featureFlags: [],
      items: [],
    });
    setEditItemIndex(-1);
    setItemDialogOpen(true);
  };

  const handleEditMenuItem = (item: any, index: number) => {
    setSelectedItem({ ...item });
    setEditItemIndex(index);
    setItemDialogOpen(true);
  };

  const handleDeleteMenuItem = (itemIndex: number) => {
    const updatedItems = (selectedMenu?.items || []).filter(
      (_: any, idx: number) => idx !== itemIndex
    );
    setSelectedMenu((prev: any) => ({ ...prev, items: updatedItems, entries: updatedItems }));
  };

  const handleSaveMenuItem = () => {
    let updatedItems: any[];
    const normalized = {
      ...selectedItem,
      title: selectedItem.label || selectedItem.title,
      link: selectedItem.route || selectedItem.link,
    };

    if (editItemIndex >= 0) {
      updatedItems = (selectedMenu?.items || []).map((item: any, idx: number) =>
        idx === editItemIndex ? normalized : item
      );
    } else {
      updatedItems = [...(selectedMenu?.items || []), normalized];
    }
    setSelectedMenu((prev: any) => ({ ...prev, items: updatedItems, entries: updatedItems }));
    setItemDialogOpen(false);
    setSelectedItem(null);
    setEditItemIndex(-1);
  };

  const handleItemDialogClose = () => {
    setItemDialogOpen(false);
    setSelectedItem(null);
    setEditItemIndex(-1);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Card>
        <CardHeader
          avatar={saving ? <CircularProgress size={24} /> : <MenuIcon />}
          title="Application Menus"
          subheader={`${menus.length} menu${menus.length !== 1 ? 's' : ''} configured`}
          action={
            isAdmin && (
              <Button
                startIcon={<AddIcon />}
                variant="contained"
                size="small"
                onClick={handleAddMenu}
                disabled={saving}
              >
                Add Menu
              </Button>
            )
          }
        />
        <Divider />
        <CardContent>
          {!isAdmin && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Only administrators can edit menus, reorder navigation, and manage feature flags.
            </Alert>
          )}

          {menus.length > 0 ? (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="menus-droppable" type="MENU">
                {(provided) => (
                  <Box
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                    {menus.map((menu: any, menuIndex: number) => (
                      <Draggable
                        key={menu.id || menu.key || `menu-${menuIndex}`}
                        draggableId={String(menu.id || menu.key || `menu-${menuIndex}`)}
                        index={menuIndex}
                        isDragDisabled={!isAdmin || saving}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <Paper
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            variant="outlined"
                            sx={{
                              opacity: dragSnapshot.isDragging ? 0.85 : 1,
                              borderColor: dragSnapshot.isDragging ? 'primary.main' : 'divider',
                              boxShadow: dragSnapshot.isDragging ? 4 : 0,
                            }}
                          >
                            <Accordion defaultExpanded={false} disableGutters>
                              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    width: '100%',
                                  }}
                                >
                                  {isAdmin && (
                                    <Box
                                      {...dragProvided.dragHandleProps}
                                      onClick={(e) => e.stopPropagation()}
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: 'action.active',
                                        cursor: 'grab',
                                        p: 0.5,
                                      }}
                                    >
                                      <Tooltip title="Drag to reorder">
                                        <DragIcon fontSize="small" />
                                      </Tooltip>
                                    </Box>
                                  )}

                                  <MenuIcon color="primary" />

                                  <Box sx={{ flex: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                        {menu.name || menu.key}
                                      </Typography>
                                      <Chip
                                        label={menu.enabled !== false ? 'Enabled' : 'Disabled'}
                                        size="small"
                                        color={menu.enabled !== false ? 'success' : 'error'}
                                        variant="outlined"
                                      />
                                      {menu.key && (
                                        <Chip
                                          label={`key: ${menu.key}`}
                                          size="small"
                                          variant="outlined"
                                          sx={{ fontFamily: 'monospace' }}
                                        />
                                      )}
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">
                                      Target: <strong>{menu.target || 'Not set'}</strong> &bull;{' '}
                                      {menu.items?.length || 0} item{(menu.items?.length || 0) !== 1 ? 's' : ''}
                                    </Typography>
                                    {menu.featureFlags?.length > 0 && (
                                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                                        {menu.featureFlags.map((flag: string) => (
                                          <Chip
                                            key={flag}
                                            icon={<FlagIcon sx={{ fontSize: 14 }} />}
                                            label={flag}
                                            size="small"
                                            variant="outlined"
                                            color="primary"
                                          />
                                        ))}
                                      </Box>
                                    )}
                                  </Box>

                                  {isAdmin && (
                                    <Box
                                      onClick={(e: any) => e.stopPropagation()}
                                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                                    >
                                      <Tooltip title="Move up">
                                        <span>
                                          <IconButton
                                            size="small"
                                            disabled={menuIndex === 0 || saving}
                                            onClick={() => handleMoveMenu(menuIndex, 'up')}
                                          >
                                            <ArrowUpwardIcon fontSize="small" />
                                          </IconButton>
                                        </span>
                                      </Tooltip>
                                      <Tooltip title="Move down">
                                        <span>
                                          <IconButton
                                            size="small"
                                            disabled={menuIndex === menus.length - 1 || saving}
                                            onClick={() => handleMoveMenu(menuIndex, 'down')}
                                          >
                                            <ArrowDownwardIcon fontSize="small" />
                                          </IconButton>
                                        </span>
                                      </Tooltip>
                                      <Tooltip title={menu.enabled !== false ? 'Disable menu' : 'Enable menu'}>
                                        <IconButton
                                          size="small"
                                          disabled={saving}
                                          onClick={() => handleToggleMenuEnabled(menuIndex)}
                                          color={menu.enabled !== false ? 'success' : 'default'}
                                        >
                                          {menu.enabled !== false ? <ToggleOnIcon /> : <ToggleOffIcon />}
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Edit menu">
                                        <IconButton
                                          size="small"
                                          disabled={saving}
                                          onClick={() => handleEditMenu(menu, menuIndex)}
                                        >
                                          <EditIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete menu">
                                        <IconButton
                                          size="small"
                                          color="error"
                                          disabled={saving}
                                          onClick={() => handleDeleteMenu(menuIndex)}
                                        >
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    </Box>
                                  )}
                                </Box>
                              </AccordionSummary>
                              <AccordionDetails>
                                <Box>
                                  <Box sx={{ mb: 2 }}>
                                    <Typography variant="caption" color="text.secondary">
                                      Roles:
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                                      {menu.roles?.length > 0 ? (
                                        menu.roles.map((role: string) => (
                                          <Chip key={role} label={role} size="small" />
                                        ))
                                      ) : (
                                        <Typography variant="caption" color="text.secondary">
                                          No roles specified (available to all permitted users)
                                        </Typography>
                                      )}
                                    </Box>
                                  </Box>
                                  <Divider sx={{ my: 1.5 }} />
                                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                                    Menu Items
                                  </Typography>
                                  {menu.items?.length > 0 ? (
                                    <MenuItemsList
                                      items={menu.items}
                                      menuIndex={menuIndex}
                                      depth={0}
                                      isAdmin={isAdmin}
                                      onToggleEnabled={handleToggleItemEnabled}
                                      onMoveItem={handleMoveMenuItem}
                                    />
                                  ) : (
                                    <Typography variant="caption" color="text.secondary">
                                      No menu items configured in this menu
                                    </Typography>
                                  )}
                                </Box>
                              </AccordionDetails>
                            </Accordion>
                          </Paper>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </Box>
                )}
              </Droppable>
            </DragDropContext>
          ) : (
            <Alert severity="info">
              No menus configured. Click <strong>Add Menu</strong> to create your first navigation menu.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Menu Edit/Create Dialog */}
      <Dialog open={dialogOpen} onClose={handleDialogClose} maxWidth="md" fullWidth>
        <DialogTitle>{isEditing ? 'Edit Menu' : 'Add New Menu'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Menu Name"
              value={selectedMenu?.name || ''}
              onChange={(e: any) => handleFieldChange('name', e.target.value)}
              fullWidth
              helperText="Display name for the menu"
            />
            <TextField
              label="Menu Key"
              value={selectedMenu?.key || ''}
              onChange={(e: any) => handleFieldChange('key', e.target.value)}
              fullWidth
              helperText="Unique identifier for the menu (e.g., main, left-nav, profile)"
            />
            <TextField
              label="Target"
              value={selectedMenu?.target || ''}
              onChange={(e: any) => handleFieldChange('target', e.target.value)}
              fullWidth
              helperText="Target location in layout (e.g., left-nav, top-nav, header, footer)"
            />
            <TextField
              label="Roles"
              value={selectedMenu?.roles?.join(', ') || ''}
              onChange={(e: any) =>
                handleFieldChange(
                  'roles',
                  e.target.value
                    .split(',')
                    .map((r: string) => r.trim())
                    .filter(Boolean)
                )
              }
              fullWidth
              helperText="Comma-separated list of roles allowed to view this menu"
            />
            <Autocomplete
              multiple
              options={featureFlagOptions}
              value={selectedMenu?.featureFlags || []}
              onChange={(_: any, newValue: string[]) => handleFieldChange('featureFlags', newValue)}
              freeSolo
              renderTags={(value: string[], getTagProps: any) =>
                value.map((option: string, index: number) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    size="small"
                    color="primary"
                    {...getTagProps({ index })}
                  />
                ))
              }
              renderInput={(params: any) => (
                <TextField
                  {...params}
                  label="Feature Flags"
                  helperText="Select feature flags required for this menu"
                />
              )}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={selectedMenu?.enabled !== false}
                  onChange={(e: any) => handleFieldChange('enabled', e.target.checked)}
                />
              }
              label="Enabled"
            />

            <Divider sx={{ my: 1 }} />

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Menu Items ({selectedMenu?.items?.length || 0})
              </Typography>
              <Button startIcon={<AddIcon />} size="small" variant="outlined" onClick={handleAddMenuItem}>
                Add Item
              </Button>
            </Box>

            {selectedMenu?.items?.length > 0 ? (
              <DragDropContext onDragEnd={handleItemDragEnd}>
                <Droppable droppableId="items-droppable" type="ITEM">
                  {(itemDropProvided) => (
                    <Paper
                      ref={itemDropProvided.innerRef}
                      {...itemDropProvided.droppableProps}
                      variant="outlined"
                      sx={{ p: 1 }}
                    >
                      <List dense>
                        {selectedMenu.items.map((item: any, idx: number) => (
                          <Draggable
                            key={item.id || `dialog-item-${idx}`}
                            draggableId={String(item.id || `dialog-item-${idx}`)}
                            index={idx}
                          >
                            {(itemDragProvided, itemDragSnapshot) => (
                              <ListItem
                                ref={itemDragProvided.innerRef}
                                {...itemDragProvided.draggableProps}
                                divider
                                sx={{
                                  opacity: item.enabled !== false ? 1 : 0.55,
                                  backgroundColor: itemDragSnapshot.isDragging
                                    ? 'action.hover'
                                    : 'inherit',
                                }}
                                secondaryAction={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleEditMenuItem(item, idx)}
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => handleDeleteMenuItem(idx)}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                }
                              >
                                <Box
                                  {...itemDragProvided.dragHandleProps}
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: 'action.active',
                                    cursor: 'grab',
                                    mr: 1,
                                  }}
                                >
                                  <DragIcon fontSize="small" />
                                </Box>
                                <ListItemText
                                  primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                        {item.label || item.title}
                                      </Typography>
                                      <Chip
                                        label={item.enabled !== false ? 'On' : 'Off'}
                                        size="small"
                                        color={item.enabled !== false ? 'success' : 'error'}
                                        variant="outlined"
                                        sx={{ height: 20, fontSize: 11 }}
                                      />
                                    </Box>
                                  }
                                  secondary={
                                    <Typography variant="caption" fontFamily="monospace">
                                      {item.route || item.link || '-'}
                                    </Typography>
                                  }
                                />
                              </ListItem>
                            )}
                          </Draggable>
                        ))}
                        {itemDropProvided.placeholder}
                      </List>
                    </Paper>
                  )}
                </Droppable>
              </DragDropContext>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No items added yet. Click &quot;Add Item&quot; to define entries for this menu.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSaveMenu} variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={20} /> : isEditing ? 'Update & Save' : 'Create & Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Menu Item Edit/Create Dialog */}
      <Dialog open={itemDialogOpen} onClose={handleItemDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editItemIndex >= 0 ? 'Edit Menu Item' : 'Add Menu Item'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Label / Title"
              value={selectedItem?.label || selectedItem?.title || ''}
              onChange={(e: any) =>
                setSelectedItem((prev: any) => ({
                  ...prev,
                  label: e.target.value,
                  title: e.target.value,
                }))
              }
              fullWidth
            />
            <TextField
              label="Icon"
              value={selectedItem?.icon || ''}
              onChange={(e: any) =>
                setSelectedItem((prev: any) => ({
                  ...prev,
                  icon: e.target.value,
                }))
              }
              fullWidth
              helperText="Material icon name (e.g., dashboard, settings, people)"
            />
            <TextField
              label="Route / Link"
              value={selectedItem?.route || selectedItem?.link || ''}
              onChange={(e: any) =>
                setSelectedItem((prev: any) => ({
                  ...prev,
                  route: e.target.value,
                  link: e.target.value,
                }))
              }
              fullWidth
              helperText="Route path or external URL (e.g., /dashboard, /users)"
            />
            <TextField
              label="Roles"
              value={selectedItem?.roles?.join(', ') || ''}
              onChange={(e: any) =>
                setSelectedItem((prev: any) => ({
                  ...prev,
                  roles: e.target.value
                    .split(',')
                    .map((r: string) => r.trim())
                    .filter(Boolean),
                }))
              }
              fullWidth
              helperText="Comma-separated list of required roles"
            />
            <Autocomplete
              multiple
              options={featureFlagOptions}
              value={selectedItem?.featureFlags || []}
              onChange={(_: any, newValue: string[]) =>
                setSelectedItem((prev: any) => ({
                  ...prev,
                  featureFlags: newValue,
                }))
              }
              freeSolo
              renderTags={(value: string[], getTagProps: any) =>
                value.map((option: string, index: number) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    size="small"
                    color="primary"
                    {...getTagProps({ index })}
                  />
                ))
              }
              renderInput={(params: any) => (
                <TextField
                  {...params}
                  label="Feature Flags"
                  helperText="Select feature flags required for this menu item"
                />
              )}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={selectedItem?.enabled !== false}
                  onChange={(e: any) =>
                    setSelectedItem((prev: any) => ({
                      ...prev,
                      enabled: e.target.checked,
                    }))
                  }
                />
              }
              label="Enabled"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleItemDialogClose}>Cancel</Button>
          <Button onClick={handleSaveMenuItem} variant="contained">
            {editItemIndex >= 0 ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApplicationMenusPanel;
