import Reactory from '@reactorynet/reactory-core';
import { components as contentManagementComponents } from './content-management';

export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  ...contentManagementComponents,
];

export default components;
