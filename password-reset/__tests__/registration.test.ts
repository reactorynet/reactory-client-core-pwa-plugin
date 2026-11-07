/**
 * Registration path for `core.ResetPassword@1.0.0`.
 *
 * The route resolves its component by fully-qualified name out of the client
 * registry, so a component that is authored but never registered renders as
 * NotFound — and until now this FQN resolved to a placeholder that *threw*:
 *
 *   component: () => new Error('Complete core.ResetPassword Migratation to
 *   reactory-user plugin')
 *
 * These assertions walk the chain the runtime actually uses:
 *
 *   password-reset/index.ts  →  plugins/reactory-core/index.ts  →  registry
 *
 * `plugins/__index.ts` is generated at startup from the plugin directories and
 * already imports `./reactory-core`, so adding a module inside that plugin needs
 * no regeneration. It is deliberately not imported here: it is gitignored, and a
 * test that depends on it cannot run in a clean checkout.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { components as passwordResetComponents } from '../index';
import { components as reactoryCoreComponents } from '../../index';
import PasswordReset from '../PasswordReset';

const FQN = 'core.ResetPassword@1.0.0';

const findEntry = (list: any[], fqn: string) =>
  list.find((entry) => `${entry?.nameSpace}.${entry?.name}@${entry?.version}` === fqn);

describe('core.ResetPassword registration', () => {
  it('is declared by the password-reset module', () => {
    const entry = findEntry(passwordResetComponents, FQN);

    expect(entry).toBeDefined();
    expect(entry.description).toMatch(/password/i);
  });

  it('is spread into the reactory-core plugin component list', () => {
    expect(findEntry(reactoryCoreComponents, FQN)).toBeDefined();
  });

  it('points at the real component, not a throwing placeholder', () => {
    const entry = findEntry(reactoryCoreComponents, FQN) as any;

    expect(entry.component).toBe(PasswordReset);

    // The previous occupant rendered an Error. Guard against that returning.
    expect(entry.component).not.toBeInstanceOf(Error);
    expect(String(entry.description)).not.toMatch(/placeholder|migrat/i);
  });

  it('exposes a plain function component, not a memo/forwardRef wrapper', () => {
    // react-is 18 with react 17 breaks isMemo/isForwardRef checks, so registry
    // components must be plain functions.
    const entry = findEntry(reactoryCoreComponents, FQN) as any;

    expect(typeof entry.component).toBe('function');
    expect(entry.component.$$typeof).toBeUndefined();
  });

  it('is reachable by signed-out visitors', () => {
    // Anyone following a reset link has no session. A USER-only gate would hide
    // the page from the only people who need it.
    const entry = findEntry(reactoryCoreComponents, FQN) as any;

    expect(entry.roles).toEqual(expect.arrayContaining(['ANON', 'USER']));
  });

  it('is registered exactly once in the plugin list', () => {
    const matches = reactoryCoreComponents.filter(
      (entry: any) => `${entry?.nameSpace}.${entry?.name}@${entry?.version}` === FQN,
    );

    expect(matches).toHaveLength(1);
  });

  /**
   * Guards the OTHER registrant.
   *
   * `core.ResetPassword` used to be registered twice: once by this plugin and
   * once as a throwing placeholder in the app's own component list. Registration
   * is last-wins, so the placeholder could shadow a working page depending on
   * load order. It has been deleted; this asserts it does not come back.
   */
  it('has no competing registrant in the app component list', () => {
    const appComponents = readFileSync(
      resolve(process.cwd(), 'src/components/index.tsx'),
      'utf8',
    );

    expect(appComponents).not.toMatch(/name:\s*['"]ResetPassword['"]/);
    expect(appComponents).not.toMatch(/Migratation to reactory-user plugin/);
  });
});
