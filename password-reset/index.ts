import Reactory from '@reactorynet/reactory-core';

import PasswordReset from './PasswordReset';

export { default as PasswordReset } from './PasswordReset';
export * from './passwordResetApi';

/**
 * Component registry entries contributed by the password-reset page.
 *
 * `nameSpace: 'core'` and `name: 'ResetPassword'` are what the client route
 * `reset-password` resolves (`componentFqn: 'core.ResetPassword@1.0.0'`), and the
 * version matches, so this entry replaces the throwing placeholder that previously
 * occupied that FQN in the app's component list.
 *
 * Roles are `ANON` + `USER` deliberately: anyone following a reset link is signed
 * out, so a USER-only gate would hide the page from the only people who need it.
 */
export const components: Reactory.Client.IReactoryComponentRegistryEntry<any>[] = [
  {
    nameSpace: 'core',
    name: 'ResetPassword',
    version: '1.0.0',
    component: PasswordReset,
    description:
      'Consumes a password-reset link and sets a new password via the public reset endpoint.',
    tags: ['user', 'account', 'password', 'reset'],
    roles: ['ANON', 'USER'],
  },
];

export default components;
