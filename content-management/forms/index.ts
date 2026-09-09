import Reactory from '@reactorynet/reactory-core';
import schema from './schema';
import uiSchema from './uiSchema';
import graphql from './graphql';

export const ContentManagementListForm: Reactory.Forms.IReactoryForm = {
  id: 'core.ContentManagementList@1.0.0',
  uiFramework: 'material',
  uiSupport: ['material'],
  uiResources: [],
  title: 'Content Management',
  tags: ['content', 'cms', 'forms', 'management'],
  name: 'ContentManagementList',
  nameSpace: 'core',
  version: '1.0.0',
  description: 'Manage, search, preview, and edit static content items.',
  author: {
    fullName: 'Werner Weber',
    email: 'werner.weber@reactory.net',
  },
  helpTopics: ['ContentManagement'],
  registerAsComponent: true,
  schema,
  uiSchema,
  graphql,
  roles: ['USER', 'CONTENT-EDITOR', 'ADMIN'],
};

export default ContentManagementListForm;
