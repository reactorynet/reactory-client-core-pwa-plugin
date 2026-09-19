import Reactory from '@reactorynet/reactory-core';
import GraphQLEditor from './GraphQLEditor';

export { default as GraphQLEditor } from './GraphQLEditor';
export { default as ResultsViewer } from './components/ResultsViewer';
export { default as ResultDataGrid } from './components/ResultDataGrid';
export { default as RawResultView } from './components/RawResultView';
export { default as DynamicResultView } from './components/DynamicResultView';
export * from './types';

/**
 * Component registry entries contributed by the GraphQL editor.
 *
 * As with the SQL editor, the entry cannot carry `wrapWithApi` (it is not part
 * of `IReactoryComponentRegistryEntry`), so the component reads the SDK from
 * `ReactoryContext` via `useReactory()`.
 */
export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  {
    nameSpace: 'core',
    name: 'GraphQLEditor',
    version: '1.0.0',
    component: GraphQLEditor,
    description:
      'Execute GraphQL queries and mutations, viewing results as a grid, raw JSON/YAML, or a generated component.',
    tags: ['data', 'graphql', 'developer'],
    roles: ['DEVELOPER', 'ADMIN'],
  },
];

export default components;
