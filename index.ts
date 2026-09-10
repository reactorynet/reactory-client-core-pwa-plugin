import Reactory from '@reactorynet/reactory-core';
import { components as contentManagementComponents } from './content-management';
import { components as applicationManagementComponents } from './application-management';

export * from './content-management';
export * from './application-management';

export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  ...contentManagementComponents,
  ...applicationManagementComponents,
];

export default components;
