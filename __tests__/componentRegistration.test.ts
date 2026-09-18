import { components as sqlEditorComponents } from '../sql-editor';
import { components as reactoryCoreComponents } from '../index';
import pluginComponents from '../../__index';

/**
 * Verifies the registration path for `core.SQLQueryEditor@1.0.0`.
 *
 * The route resolves its component by fully-qualified name out of the client
 * component registry, so a component that is authored but never reaches that
 * registry renders as NotFound. These assertions walk the chain the runtime
 * actually uses:
 *
 *   sql-editor/index.ts  →  reactory-core/index.ts  →  plugins/__index.ts
 *
 * `plugins/__index.ts` is generated at startup from the plugin directories and
 * already imports `./reactory-core`, so adding this component inside that
 * plugin needs no regeneration — which is exactly what is asserted here.
 */

const FQN = 'core.SQLQueryEditor@1.0.0';

const findEntry = (list: any[], fqn: string) =>
  list.find(
    (entry) => `${entry?.nameSpace}.${entry?.name}@${entry?.version}` === fqn,
  );

describe('core.SQLQueryEditor registration', () => {
  it('is declared by the sql-editor module', () => {
    const entry = findEntry(sqlEditorComponents, FQN);
    expect(entry).toBeDefined();
    expect(entry.description).toMatch(/read-only SQL/i);
  });

  it('is spread into the reactory-core plugin component list', () => {
    expect(findEntry(reactoryCoreComponents, FQN)).toBeDefined();
  });

  it('reaches the generated plugin registry that the client registers from', () => {
    const entry = findEntry(pluginComponents, FQN);
    expect(entry).toBeDefined();

    // Gated to the screen's roles; the route is DEVELOPER/ADMIN only.
    expect(entry.roles).toEqual(['DEVELOPER', 'ADMIN']);
    expect(entry.tags).toEqual(expect.arrayContaining(['sql', 'data']));
  });

  it('exposes a plain function component, not a memo/forwardRef wrapper', () => {
    // react-is 18 with react 17 breaks isMemo/isForwardRef checks, so registry
    // components must be plain functions. A memo() wrapper would silently fail
    // to resolve in this app.
    const entry = findEntry(reactoryCoreComponents, FQN);
    expect(typeof entry.component).toBe('function');
    expect((entry.component as any).$$typeof).toBeUndefined();
  });

  it('does not collide with the retired form FQN', () => {
    expect(findEntry(reactoryCoreComponents, 'core.SQLQueryForm@1.0.0')).toBeUndefined();
    expect(findEntry(pluginComponents, 'core.SQLQueryForm@1.0.0')).toBeUndefined();
  });
});
