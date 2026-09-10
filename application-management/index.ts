import Reactory from '@reactorynet/reactory-core';

import ApplicationOverviewPanel from './ApplicationOverviewPanel';
import ApplicationSettingsPanel from './ApplicationSettingsPanel';
import ApplicationUsersPanel from './ApplicationUsersPanel';
import ApplicationOrganizationsPanel from './ApplicationOrganizationsPanel';
import ApplicationRolesPanel from './ApplicationRolesPanel';
import ApplicationThemesPanel from './ApplicationThemesPanel';
import ApplicationStatisticsPanel from './ApplicationStatisticsPanel';
import ApplicationRoutesPanel from './ApplicationRoutesPanel';
import ApplicationMenusPanel from './ApplicationMenusPanel';
import ApplicationFeatureFlagsPanel from './ApplicationFeatureFlagsPanel';

export {
  ApplicationOverviewPanel,
  ApplicationSettingsPanel,
  ApplicationUsersPanel,
  ApplicationOrganizationsPanel,
  ApplicationRolesPanel,
  ApplicationThemesPanel,
  ApplicationStatisticsPanel,
  ApplicationRoutesPanel,
  ApplicationMenusPanel,
  ApplicationFeatureFlagsPanel,
};

export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  {
    nameSpace: 'reactory',
    name: 'ApplicationOverviewPanel',
    version: '1.0.0',
    component: ApplicationOverviewPanel,
    description: 'Displays application overview, identity, site URL, and metadata.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'overview', 'panel'],
  },
  {
    nameSpace: 'reactory',
    name: 'ApplicationSettingsPanel',
    version: '1.0.0',
    component: ApplicationSettingsPanel,
    description: 'Manages application settings with dynamic schema forms and custom editors.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'settings', 'panel'],
  },
  {
    nameSpace: 'reactory',
    name: 'ApplicationUsersPanel',
    version: '1.0.0',
    component: ApplicationUsersPanel,
    description: 'Hosts the application users management view.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'users', 'panel'],
  },
  {
    nameSpace: 'reactory',
    name: 'ApplicationOrganizationsPanel',
    version: '1.0.0',
    component: ApplicationOrganizationsPanel,
    description: 'Hosts the application organizations management view.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'organizations', 'panel'],
  },
  {
    nameSpace: 'reactory',
    name: 'ApplicationRolesPanel',
    version: '1.0.0',
    component: ApplicationRolesPanel,
    description: 'Displays the list of roles configured for the application.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'roles', 'panel'],
  },
  {
    nameSpace: 'reactory',
    name: 'ApplicationThemesPanel',
    version: '1.0.0',
    component: ApplicationThemesPanel,
    description: 'Displays theme configurations and active theme for the application.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'themes', 'panel'],
  },
  {
    nameSpace: 'reactory',
    name: 'ApplicationStatisticsPanel',
    version: '1.0.0',
    component: ApplicationStatisticsPanel,
    description: 'Displays usage metrics, sessions, active users, and activity trends.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'statistics', 'panel'],
  },
  {
    nameSpace: 'reactory',
    name: 'ApplicationRoutesPanel',
    version: '1.0.0',
    component: ApplicationRoutesPanel,
    description: 'Manages client routing configuration, accessibility, reordering, and roles.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'routes', 'panel'],
  },
  {
    nameSpace: 'reactory',
    name: 'ApplicationMenusPanel',
    version: '1.0.0',
    component: ApplicationMenusPanel,
    description: 'Manages navigation menus, menu items hierarchy, roles, and feature flags.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'menus', 'panel'],
  },
  {
    nameSpace: 'reactory',
    name: 'ApplicationFeatureFlagsPanel',
    version: '1.0.0',
    component: ApplicationFeatureFlagsPanel,
    description: 'Manages application feature flags, catalogue lookups, and multi-dimensional targeting.',
    roles: ['USER', 'ADMIN'],
    tags: ['application', 'feature-flags', 'panel'],
  },
];

export default components;
