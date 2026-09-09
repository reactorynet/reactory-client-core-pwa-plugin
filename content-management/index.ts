import Reactory from '@reactorynet/reactory-core';

import ContentStatusBadge from './components/widgets/ContentStatusBadge';
import ContentFormatBadge from './components/widgets/ContentFormatBadge';
import ContentDetailPanel from './components/ContentDetailPanel';
import ContentManagementToolbar from './components/ContentManagementToolbar';
import ContentEditorDrawer from './components/ContentEditorDrawer';
import NewContentDialog from './components/NewContentDialog';
import ContentManagementPage from './pages/ContentManagementPage';

export {
  ContentStatusBadge,
  ContentFormatBadge,
  ContentDetailPanel,
  ContentManagementToolbar,
  ContentEditorDrawer,
  NewContentDialog,
  ContentManagementPage,
};

export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  {
    nameSpace: 'core',
    name: 'ContentStatusBadge',
    version: '1.0.0',
    component: ContentStatusBadge,
    description: 'Displays a color-coded published or draft status badge for content items.',
    tags: ['content', 'cms', 'badge', 'status'],
  },
  {
    nameSpace: 'core',
    name: 'ContentFormatBadge',
    version: '1.0.0',
    component: ContentFormatBadge,
    description: 'Displays a badge representing the authoring format (markdown, html, text).',
    tags: ['content', 'cms', 'badge', 'format'],
  },
  {
    nameSpace: 'core',
    name: 'ContentDetailPanel',
    version: '1.0.0',
    component: ContentDetailPanel,
    description: 'Tabbed detail panel for grid rows: live preview, properties, translations, JSON.',
    tags: ['content', 'cms', 'detail', 'panel', 'preview'],
  },
  {
    nameSpace: 'core',
    name: 'ContentManagementToolbar',
    version: '1.0.0',
    component: ContentManagementToolbar,
    description: 'Header toolbar for content management with search, status/format filter pills, and new action.',
    tags: ['content', 'cms', 'toolbar', 'filter', 'search'],
  },
  {
    nameSpace: 'core',
    name: 'ContentEditorDrawer',
    version: '1.0.0',
    component: ContentEditorDrawer,
    description: 'Drawer hosting the full CMSContentEditor for in-context content editing.',
    tags: ['content', 'cms', 'editor', 'drawer'],
  },
  {
    nameSpace: 'core',
    name: 'NewContentDialog',
    version: '1.0.0',
    component: NewContentDialog,
    description: 'Modal dialog to quickly initialize and seed a new content item.',
    tags: ['content', 'cms', 'dialog', 'create'],
  },
  {
    nameSpace: 'core',
    name: 'ContentManagementPage',
    version: '1.0.0',
    component: ContentManagementPage,
    description: 'Top-level content management page integrating schema form grid, detail panels, and editing drawer.',
    tags: ['content', 'cms', 'page', 'management', 'admin'],
  },
];

export default components;
