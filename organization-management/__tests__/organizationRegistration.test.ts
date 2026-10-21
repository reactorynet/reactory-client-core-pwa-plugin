import { components as organizationManagementComponents } from '../index';
import * as reactoryCoreRoot from '../../index';
import { components as reactoryCoreComponents } from '../../index';
import pluginComponents from '../../../__index';

/**
 * Verifies the registration path for the organization management FQNs.
 *
 * A route resolves its component by fully-qualified name out of the client
 * component registry, so a component that is authored but never reaches that
 * registry renders as NotFound. These assertions walk the chain the runtime
 * actually uses:
 *
 *   organization-management/index.ts  →  reactory-core/index.ts  →  plugins/__index.ts
 */

const findEntry = (list: any[], fqn: string) =>
  list.find((entry) => `${entry?.nameSpace}.${entry?.name}@${entry?.version}` === fqn);

const FQNS = [
  'reactory.OrganizationListPanel@1.0.0',
  'reactory.OrganizationCreatePage@1.0.0',
  'reactory.OrganizationDetailPanel@1.0.0',
];

describe('organization management registration', () => {
  it.each(FQNS)('declares %s in the module', (fqn) => {
    const entry = findEntry(organizationManagementComponents, fqn);
    expect(entry).toBeDefined();
    expect(entry.description.length).toBeGreaterThan(0);
    expect(entry.tags).toEqual(expect.arrayContaining(['organization']));
  });

  it.each(FQNS)('spreads %s into the reactory-core plugin list', (fqn) => {
    expect(findEntry(reactoryCoreComponents, fqn)).toBeDefined();
  });

  it.each(FQNS)('reaches %s through the generated plugin registry', (fqn) => {
    expect(findEntry(pluginComponents, fqn)).toBeDefined();
  });

  it('gates creation to ADMIN, because createOrganization is ADMIN/SYSTEM server-side', () => {
    const entry = findEntry(organizationManagementComponents, 'reactory.OrganizationCreatePage@1.0.0');
    expect(entry.roles).toEqual(['ADMIN']);
  });

  it('keeps the theme-editor re-exports on the plugin root (QA-1)', () => {
    // theme-editor is a public surface other hosts import from the package root.
    // Adding a module here must not drop it — nothing else in this repo would
    // notice, because in-repo consumers import '../theme-editor' relatively.
    expect(typeof (reactoryCoreRoot as any).ThemeEditor).toBe('function');
    expect(typeof (reactoryCoreRoot as any).ThemeCssStudio).toBe('function');
    expect(typeof (reactoryCoreRoot as any).createDefaultTheme).toBe('function');
    expect(typeof (reactoryCoreRoot as any).buildThemePayload).toBe('function');
  });

  it('still re-exports every sibling module from the plugin root', () => {
    // A missing module here is a silent public-API removal for any host that
    // imports from the package root.
    expect(reactoryCoreRoot).toHaveProperty('OrganizationListPanel');
    expect(reactoryCoreRoot).toHaveProperty('OrganizationCreatePage');
    expect(reactoryCoreRoot).toHaveProperty('OrganizationDetailPanel');
    expect(reactoryCoreRoot).toHaveProperty('SqlQueryEditor');
    expect(reactoryCoreRoot).toHaveProperty('GraphQLEditor');
    expect(reactoryCoreRoot).toHaveProperty('ContentManagementPage');
    expect(reactoryCoreRoot).toHaveProperty('ApplicationOverviewPanel');
  });

  it('does not register the controlled wizard dialog as a route target', () => {
    // A route mounting the wizard would render a closed Dialog (a blank page);
    // OrganizationCreatePage is the routable wrapper.
    expect(
      findEntry(organizationManagementComponents, 'reactory.OrganizationCreateWizard@1.0.0'),
    ).toBeUndefined();
    expect(
      findEntry(reactoryCoreComponents, 'reactory.OrganizationCreateWizard@1.0.0'),
    ).toBeUndefined();
  });

  it('uses the reactory namespace, so the FQNs carry the same prefix', () => {
    organizationManagementComponents.forEach((entry) => {
      expect(entry.nameSpace).toBe('reactory');
    });
  });

  it('exposes plain function components, not memo/forwardRef wrappers', () => {
    // react-is 18 with react 17 breaks isMemo/isForwardRef checks, so registry
    // components must be plain functions.
    FQNS.forEach((fqn) => {
      const entry = findEntry(reactoryCoreComponents, fqn);
      expect(typeof entry.component).toBe('function');
      expect((entry.component as any).$$typeof).toBeUndefined();
    });
  });
});
