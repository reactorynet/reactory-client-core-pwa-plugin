import Reactory from '@reactorynet/reactory-core';
import { components as contentManagementComponents } from './content-management';
import { components as applicationManagementComponents } from './application-management';
import { components as sqlEditorComponents } from './sql-editor';
import { components as graphqlEditorComponents } from './graphql-editor';

export * from './content-management';
export * from './application-management';
export * from './sql-editor';
export * from './graphql-editor';

export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  ...contentManagementComponents,
  ...applicationManagementComponents,
  ...sqlEditorComponents,
  ...graphqlEditorComponents,
];

export default components;
