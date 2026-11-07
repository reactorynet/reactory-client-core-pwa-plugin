import Reactory from '@reactorynet/reactory-core';
import { components as contentManagementComponents } from './content-management';
import { components as applicationManagementComponents } from './application-management';
import { components as organizationManagementComponents } from './organization-management';
import { components as sqlEditorComponents } from './sql-editor';
import { components as graphqlEditorComponents } from './graphql-editor';
import { components as passwordResetComponents } from './password-reset';

export * from './content-management';
export * from './application-management';
export * from './organization-management';
export * from './demographic-form';
export * from './theme-editor';
export * from './sql-editor';
export * from './graphql-editor';
export * from './password-reset';

export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  ...contentManagementComponents,
  ...applicationManagementComponents,
  ...organizationManagementComponents,
  ...sqlEditorComponents,
  ...graphqlEditorComponents,
  ...passwordResetComponents,
];

export default components;
