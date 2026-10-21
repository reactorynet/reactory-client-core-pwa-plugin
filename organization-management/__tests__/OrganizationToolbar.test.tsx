/**
 * @jest-environment jsdom
 *
 * Toolbar contract: it owns no state, but its optional props decide what a
 * caller may see. The defaults (an unconstrained host) must still render the
 * full bar, and `disabled` must disable the controls it covers.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationToolbar from '../OrganizationToolbar';

afterEach(cleanup);

const baseProps = {
  search: '',
  onSearchChange: jest.fn(),
  status: 'active' as const,
  onStatusChange: jest.fn(),
  onRefresh: jest.fn(),
  onNewOrganization: jest.fn(),
  onArchiveSelected: jest.fn(),
  selectedCount: 0,
};

describe('OrganizationToolbar', () => {
  it('renders every action by default when no permission props are supplied', async () => {
    const props = { ...baseProps };

    render(<OrganizationToolbar {...props} />);

    expect(screen.getByRole('button', { name: 'New organization' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive selected' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New organization' }));
    expect(props.onNewOrganization).toHaveBeenCalledTimes(1);
  });

  it('disables bulk archive until something is selected', () => {
    render(<OrganizationToolbar {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Archive selected' })).toBeDisabled();
  });

  it('hides creation for a caller without the ADMIN role', () => {
    render(<OrganizationToolbar {...baseProps} canCreate={false} />);

    expect(screen.queryByRole('button', { name: 'New organization' })).not.toBeInTheDocument();
    // Managing an organization they administer is still theirs to do.
    expect(screen.getByRole('button', { name: 'Archive selected' })).toBeInTheDocument();
  });

  it('hides every write for a plain reader', () => {
    render(<OrganizationToolbar {...baseProps} canCreate={false} canManage={false} />);

    expect(screen.queryByRole('button', { name: 'New organization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive selected' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('reports the selected count in the bulk label', () => {
    render(<OrganizationToolbar {...baseProps} selectedCount={3} />);
    expect(screen.getByRole('button', { name: 'Archive selected (3)' })).toBeInTheDocument();
  });

  it('forwards search and status changes', async () => {
    const props = { ...baseProps };

    render(<OrganizationToolbar {...props} />);

    await userEvent.type(screen.getByLabelText('Search organizations'), 'ac');

    // The toolbar is controlled: the parent owns the value, so each keystroke
    // reports just the character typed.
    expect(props.onSearchChange).toHaveBeenCalledTimes(2);
    expect(props.onSearchChange.mock.calls.map((call: any[]) => call[0])).toEqual(['a', 'c']);
  });

  it('disables the search and filter controls when disabled', () => {
    render(<OrganizationToolbar {...baseProps} disabled />);

    expect(screen.getByLabelText('Search organizations')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows progress in place of the refresh icon while refreshing', () => {
    render(<OrganizationToolbar {...baseProps} refreshing />);

    const refresh = screen.getByRole('button', { name: 'Refresh' });
    expect(refresh).toBeDisabled();
    expect(refresh.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
  });
});
