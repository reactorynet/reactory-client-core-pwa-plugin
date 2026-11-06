/**
 * @jest-environment jsdom
 *
 * Application roles panel contract.
 *
 * The panel's job is to stop an application advertising a role the backend
 * cannot honour. It therefore has to know two things and show the difference:
 * the roles the backend provides (from `ReactoryRoleCatalogue`, grouped by
 * module) and the roles the application has configured. Configured roles that
 * nothing provides must be impossible to miss.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ApplicationRolesPanel from '../ApplicationRolesPanel';

const CATALOGUE = {
  roles: [
    'ADMIN',
    'ANON',
    'DEVELOPER',
    'FINANCE_MANAGER',
    'ORGANIZATION_ADMIN',
    'PRODUCT_MANAGER',
    'SUPPORT_ADMIN',
    'SYSTEM',
    'USER',
  ],
  platformRoles: ['ADMIN', 'ANON', 'DEVELOPER', 'USER'],
  systemRoles: ['SYSTEM'],
  modules: [
    {
      id: 'reactory-core',
      nameSpace: 'core',
      name: 'ReactoryServer',
      version: '1.0.0',
      description: 'Reactory Core Module',
      priority: 0,
      isCore: true,
      roles: ['ORGANIZATION_ADMIN', 'SUPPORT_ADMIN'],
    },
    {
      id: 'reactory-payment',
      nameSpace: 'payment',
      name: 'ReactoryPayment',
      version: '1.0.0',
      priority: 15,
      isCore: false,
      roles: ['FINANCE_MANAGER'],
    },
    {
      id: 'reactory-product',
      nameSpace: 'product',
      name: 'ReactoryProduct',
      version: '1.0.0',
      priority: 20,
      isCore: false,
      roles: ['PRODUCT_MANAGER'],
    },
  ],
};

interface StubOptions {
  configuredRoles?: string[];
  catalogue?: typeof CATALOGUE | null;
  catalogueError?: Error;
  mutationError?: Error;
  isAdmin?: boolean;
}

const makeReactory = (options: StubOptions = {}) => {
  const graphqlQuery = jest.fn(async (document: any) => {
    if (String(document).includes('ReactoryRoleCatalogue')) {
      if (options.catalogueError) throw options.catalogueError;
      return { data: { ReactoryRoleCatalogue: options.catalogue === undefined ? CATALOGUE : options.catalogue } };
    }
    return { data: {} };
  });

  const graphqlMutation = jest.fn(async (document: any, variables: any) => {
    if (options.mutationError) throw options.mutationError;
    return {
      data: {
        ReactoryClientUpdateRoles: {
          id: variables.clientId,
          applicationRoles: variables.roles,
        },
      },
    };
  });

  return {
    hasRole: jest.fn(() => options.isAdmin !== false),
    graphqlQuery,
    graphqlMutation,
    createNotification: jest.fn(),
    log: jest.fn(),
  };
};

const renderPanel = async (
  reactory: ReturnType<typeof makeReactory>,
  props: Partial<React.ComponentProps<typeof ApplicationRolesPanel>> = {},
) => {
  const view = render(
    <ApplicationRolesPanel reactory={reactory as any} applicationId="client-1" {...props} />,
  );
  await waitFor(() => expect(reactory.graphqlQuery).toHaveBeenCalled());
  return view;
};

const chip = (role: string) => screen.getByTestId(`role-chip-${role}`);

describe('ApplicationRolesPanel', () => {
  it('groups the catalogue by module, with a platform group listed first', async () => {
    const reactory = makeReactory({ configuredRoles: [] });
    await renderPanel(reactory, { mode: 'view', formData: { applicationRoles: [] } });

    expect(await screen.findByTestId('role-group-platform')).toBeInTheDocument();
    expect(screen.getByTestId('role-group-reactory-core')).toBeInTheDocument();
    expect(screen.getByTestId('role-group-reactory-payment')).toBeInTheDocument();
    expect(screen.getByTestId('role-group-reactory-product')).toBeInTheDocument();
    expect(screen.getByText('core.ReactoryServer')).toBeInTheDocument();
    expect(screen.getByText('payment.ReactoryPayment')).toBeInTheDocument();
  });

  it('marks which supplied roles the application has configured', async () => {
    const reactory = makeReactory();
    await renderPanel(reactory, {
      mode: 'view',
      formData: { applicationRoles: ['USER', 'FINANCE_MANAGER'] },
    });

    await screen.findByTestId('role-group-reactory-payment');
    expect(chip('USER')).toHaveAttribute('data-configured', 'true');
    expect(chip('FINANCE_MANAGER')).toHaveAttribute('data-configured', 'true');
    expect(chip('PRODUCT_MANAGER')).toHaveAttribute('data-configured', 'false');
  });

  it('surfaces configured roles that no module provides', async () => {
    const reactory = makeReactory();
    await renderPanel(reactory, {
      mode: 'view',
      formData: { applicationRoles: ['USER', 'CONTENT_MANAGER', 'BILLING_MANAGER'] },
    });

    const alert = await screen.findByTestId('invalid-roles-alert');
    expect(alert).toHaveTextContent('2 roles not provided by the backend');
    expect(alert).toHaveTextContent('CONTENT_MANAGER');
    expect(alert).toHaveTextContent('BILLING_MANAGER');

    expect(screen.getByTestId('role-group-invalid')).toBeInTheDocument();
    expect(chip('CONTENT_MANAGER')).toHaveAttribute('data-configured', 'true');
  });

  it('reads configured roles from the nested form-context shape too', async () => {
    const reactory = makeReactory();
    await renderPanel(reactory, {
      mode: 'view',
      formContext: {
        props: { applicationId: 'client-1' },
        formData: { roles: { applicationRoles: ['PRODUCT_MANAGER'] } },
      },
    });

    await screen.findByTestId('role-group-reactory-product');
    expect(chip('PRODUCT_MANAGER')).toHaveAttribute('data-configured', 'true');
  });

  it('does not offer add or remove actions in view mode', async () => {
    const reactory = makeReactory();
    await renderPanel(reactory, {
      mode: 'view',
      formData: { applicationRoles: ['USER'] },
    });

    await screen.findByTestId('role-group-platform');
    expect(screen.queryByTestId('role-remove-USER')).not.toBeInTheDocument();

    fireEvent.click(chip('PRODUCT_MANAGER'));
    expect(reactory.graphqlMutation).not.toHaveBeenCalled();
  });

  it('adds an available role in edit mode', async () => {
    const reactory = makeReactory();
    const onChange = jest.fn();
    await renderPanel(reactory, {
      mode: 'edit',
      formData: { applicationRoles: ['USER'] },
      onChange,
    });

    await screen.findByTestId('role-group-reactory-product');
    fireEvent.click(chip('PRODUCT_MANAGER'));

    await waitFor(() => expect(reactory.graphqlMutation).toHaveBeenCalledTimes(1));
    expect(reactory.graphqlMutation).toHaveBeenCalledWith(expect.any(String), {
      clientId: 'client-1',
      roles: ['PRODUCT_MANAGER', 'USER'],
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ applicationRoles: ['PRODUCT_MANAGER', 'USER'] }),
    );
  });

  it('removes an invalid role in edit mode', async () => {
    const reactory = makeReactory();
    await renderPanel(reactory, {
      mode: 'edit',
      formData: { applicationRoles: ['USER', 'CONTENT_MANAGER'] },
    });

    await screen.findByTestId('role-group-invalid');
    fireEvent.click(screen.getByTestId('role-remove-CONTENT_MANAGER'));

    await waitFor(() => expect(reactory.graphqlMutation).toHaveBeenCalledTimes(1));
    expect(reactory.graphqlMutation).toHaveBeenCalledWith(expect.any(String), {
      clientId: 'client-1',
      roles: ['USER'],
    });
  });

  it('blocks adding while invalid roles remain', async () => {
    const reactory = makeReactory();
    await renderPanel(reactory, {
      mode: 'edit',
      formData: { applicationRoles: ['CONTENT_MANAGER'] },
    });

    await screen.findByTestId('role-group-invalid');
    fireEvent.click(chip('PRODUCT_MANAGER'));

    expect(reactory.graphqlMutation).not.toHaveBeenCalled();
    expect(screen.getByTestId('invalid-roles-alert')).toHaveTextContent(
      'remove these before adding other roles',
    );
  });

  it('surfaces the server rejection message when a save fails', async () => {
    const error: any = new Error('save failed');
    error.graphQLErrors = [
      { message: 'the following roles are not provided by any activated module: GHOST' },
    ];
    const reactory = makeReactory({ mutationError: error });

    await renderPanel(reactory, {
      mode: 'edit',
      formData: { applicationRoles: ['USER'] },
    });

    await screen.findByTestId('role-group-platform');
    fireEvent.click(chip('PRODUCT_MANAGER'));

    await waitFor(() =>
      expect(reactory.createNotification).toHaveBeenCalledWith(
        expect.stringContaining('GHOST'),
        expect.objectContaining({ type: 'error' }),
      ),
    );
  });

  it('degrades to a configured-role list when the catalogue cannot be loaded', async () => {
    const reactory = makeReactory({ catalogueError: new Error('unauthorised') });
    await renderPanel(reactory, {
      mode: 'view',
      formData: { applicationRoles: ['USER', 'GHOST_ROLE'] },
    });

    expect(await screen.findByTestId('role-catalogue-error')).toHaveTextContent(
      'Role catalogue unavailable',
    );
    // Without a catalogue validity cannot be asserted, so no invalid alert.
    expect(screen.queryByTestId('invalid-roles-alert')).not.toBeInTheDocument();
    expect(chip('GHOST_ROLE')).toHaveAttribute('data-configured', 'true');
  });

  it('filters by search text', async () => {
    const reactory = makeReactory();
    await renderPanel(reactory, {
      mode: 'view',
      formData: { applicationRoles: [] },
    });

    await screen.findByTestId('role-group-platform');
    fireEvent.change(screen.getByTestId('role-search'), { target: { value: 'product' } });

    expect(screen.queryByTestId('role-chip-USER')).not.toBeInTheDocument();
    expect(screen.getByTestId('role-chip-PRODUCT_MANAGER')).toBeInTheDocument();
  });

  it('hides unconfigured roles when "configured only" is on', async () => {
    const reactory = makeReactory();
    await renderPanel(reactory, {
      mode: 'view',
      formData: { applicationRoles: ['USER'] },
    });

    await screen.findByTestId('role-group-platform');
    fireEvent.click(screen.getByTestId('role-configured-only'));

    expect(screen.getByTestId('role-chip-USER')).toBeInTheDocument();
    expect(screen.queryByTestId('role-chip-PRODUCT_MANAGER')).not.toBeInTheDocument();
  });
});
