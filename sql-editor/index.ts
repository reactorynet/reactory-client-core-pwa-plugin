import Reactory from '@reactorynet/reactory-core';
import SqlQueryEditor from './SqlQueryEditor';

export { default as SqlQueryEditor } from './SqlQueryEditor';
export { default as ConnectionSelect } from './components/ConnectionSelect';
export { default as SqlEditorPane } from './components/SqlEditorPane';
export { default as ResultsGrid } from './components/ResultsGrid';
export * from './types';

/**
 * Component registry entries contributed by the SQL editor.
 *
 * Note on API access: `IReactoryComponentRegistryEntry` has no `wrapWithApi`
 * field, so the component reads the SDK from `ReactoryContext` via
 * `useReactory()` rather than relying on prop injection — the same pattern the
 * application- and content-management panels use.
 */
export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  {
    nameSpace: 'core',
    name: 'SQLQueryEditor',
    version: '1.0.0',
    component: SqlQueryEditor,
    description: 'Execute read-only SQL against connected relational databases.',
    tags: ['data', 'sql', 'developer'],
    roles: ['DEVELOPER', 'ADMIN'],
  },
];

export default components;
