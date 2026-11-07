/**
 * @jest-environment jsdom
 *
 * `core.ResetPassword` contract.
 *
 * The component that previously held this FQN was a placeholder that threw:
 * `component: () => new Error('Complete core.ResetPassword Migratation to
 * reactory-user plugin')`. The real implementation lived in the CDN plugin and
 * posted a GraphQL mutation that requires a signed-in USER — impossible for
 * someone following a reset link.
 *
 * This page instead consumes the token from the URL and talks to the public REST
 * endpoints. The tests below pin the behaviour a user actually depends on:
 *
 *   - the token is taken from `?auth_token=` (the parameter the server mints),
 *   - a rejected link never shows a form that could not submit,
 *   - expired / used / invalid are distinguished, with the server's message shown,
 *   - the password rules that avoid a pointless round trip are enforced,
 *   - a successful reset clears the token from the address bar,
 *   - the server's message wins when it disagrees.
 */
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@reactory/client-core/api', () => ({
  useReactory: () => undefined,
}));

import PasswordReset from '../PasswordReset';

const USER = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  avatar: '',
};

const makeApi = (overrides: any = {}) => ({
  describeResetToken: jest.fn().mockResolvedValue({ ok: true, outcome: 'valid', message: '', user: USER }),
  submitNewPassword: jest.fn().mockResolvedValue({ ok: true, outcome: 'completed', message: 'Updated.' }),
  ...overrides,
});

/**
 * Field lookups.
 *
 * Anchored regexes, not plain strings: `required` makes MUI append a " *" to the
 * label, so an exact match fails, while an unanchored /new password/i also
 * matches "Confirm new password". `^` fixes both.
 */
const newPasswordField = () => screen.getByLabelText(/^new password/i);
const confirmPasswordField = () => screen.getByLabelText(/^confirm new password/i);

const makeReactory = () => ({
  API_ROOT: 'http://localhost:4000',
  CLIENT_KEY: 'reactory',
  CLIENT_PUBLIC_KEY: 'reactory-public',
  createNotification: jest.fn(),
  goto: jest.fn(),
});

const renderReset = (props: any = {}) =>
  render(<PasswordReset reactory={makeReactory()} initialToken="tok" {...props} />);

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('PasswordReset', () => {
  it('verifies the token and then shows the form', async () => {
    const api = makeApi();
    renderReset({ api });

    await waitFor(() => expect(newPasswordField()).toBeInTheDocument());

    expect(api.describeResetToken).toHaveBeenCalledWith(expect.anything(), 'tok');
    expect(screen.getByText(/ada@example.com/i)).toBeInTheDocument();
  });

  it('reads the token from ?auth_token= when none is passed as a prop', async () => {
    const api = makeApi();
    window.history.pushState({}, '', '/reset-password?auth_token=from-the-email');

    render(<PasswordReset reactory={makeReactory()} api={api} />);

    await waitFor(() =>
      expect(api.describeResetToken).toHaveBeenCalledWith(
        expect.anything(),
        'from-the-email',
      ),
    );

    window.history.pushState({}, '', '/');
  });

  it('shows a dead end, not a form, when the link has no token', async () => {
    const api = makeApi();
    window.history.pushState({}, '', '/reset-password');

    render(<PasswordReset reactory={makeReactory()} api={api} />);

    expect(screen.getByText(/no reset token in this link/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password/i)).not.toBeInTheDocument();
    expect(api.describeResetToken).not.toHaveBeenCalled();

    window.history.pushState({}, '', '/');
  });

  it.each([
    ['expired', 'This link has expired'],
    ['used', 'This link has already been used'],
    ['invalid', 'This link is not valid'],
  ])('shows the %s state without a form', async (outcome, title) => {
    const api = makeApi({
      describeResetToken: jest
        .fn()
        .mockResolvedValue({ ok: false, outcome, message: `server says ${outcome}` }),
    });

    renderReset({ api });

    await waitFor(() => expect(screen.getByText(`server says ${outcome}`)).toBeInTheDocument());
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toBeInTheDocument();
  });

  it('falls back to its own copy when the server sends no message', async () => {
    const api = makeApi({
      describeResetToken: jest.fn().mockResolvedValue({ ok: false, outcome: 'expired', message: '' }),
    });

    renderReset({ api });

    await waitFor(() =>
      expect(screen.getByText(/password reset links are valid for one hour/i)).toBeInTheDocument(),
    );
  });

  it('rejects a short password before calling the server', async () => {
    const api = makeApi();
    renderReset({ api });

    await waitFor(() => expect(newPasswordField()).toBeInTheDocument());

    await userEvent.type(newPasswordField(), 'short');
    await userEvent.type(confirmPasswordField(), 'short');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    // The field helper also mentions the minimum length, so scope to the alert.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/at least 8 characters/i);
    expect(api.submitNewPassword).not.toHaveBeenCalled();
  });

  it('keeps the submit button disabled while the confirmation does not match', async () => {
    const api = makeApi();
    renderReset({ api });

    await waitFor(() => expect(newPasswordField()).toBeInTheDocument());

    await userEvent.type(newPasswordField(), 'correct horse battery');
    await userEvent.type(confirmPasswordField(), 'something else');

    const submit = screen.getByRole('button', { name: /update password/i });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it('submits the new password and clears the token from the address bar', async () => {
    const api = makeApi();
    window.history.pushState({}, '', '/reset-password?auth_token=used-up');

    const reactory = makeReactory();
    render(<PasswordReset reactory={reactory} api={api} />);

    await waitFor(() => expect(newPasswordField()).toBeInTheDocument());

    await userEvent.type(newPasswordField(), 'correct horse battery');
    await userEvent.type(confirmPasswordField(), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(api.submitNewPassword).toHaveBeenCalledWith(expect.anything(), {
        token: 'used-up',
        password: 'correct horse battery',
        confirmPassword: 'correct horse battery',
      }),
    );

    expect(await screen.findByText(/your password has been updated/i)).toBeInTheDocument();
    expect(window.location.search).toBe('');

    window.history.pushState({}, '', '/');
  });

  it('sends the user on to sign in after a successful reset', async () => {
    const api = makeApi();
    const reactory = makeReactory();

    render(<PasswordReset reactory={reactory} api={api} initialToken="tok" successRoute="/login" />);

    await waitFor(() => expect(newPasswordField()).toBeInTheDocument());

    await userEvent.type(newPasswordField(), 'correct horse battery');
    await userEvent.type(confirmPasswordField(), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    // The component waits ~2.5s so the confirmation is readable.
    await waitFor(() => expect(reactory.goto).toHaveBeenCalledWith('/login'), { timeout: 5000 });
  });

  it('surfaces the server message when it rejects the password', async () => {
    const api = makeApi({
      submitNewPassword: jest
        .fn()
        .mockResolvedValue({ ok: false, outcome: 'weak_password', message: 'Server says: too weak' }),
    });

    renderReset({ api });

    await waitFor(() => expect(newPasswordField()).toBeInTheDocument());

    await userEvent.type(newPasswordField(), 'aaaaaaaaaaaa');
    await userEvent.type(confirmPasswordField(), 'aaaaaaaaaaaa');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText('Server says: too weak')).toBeInTheDocument();
    // Still on the form: a rejected password is retryable.
    expect(newPasswordField()).toBeInTheDocument();
  });

  it('drops to the unusable state when the link dies between load and submit', async () => {
    const api = makeApi({
      submitNewPassword: jest
        .fn()
        .mockResolvedValue({ ok: false, outcome: 'used', message: 'This link has already been used.' }),
    });

    renderReset({ api });

    await waitFor(() => expect(newPasswordField()).toBeInTheDocument());

    await userEvent.type(newPasswordField(), 'correct horse battery');
    await userEvent.type(confirmPasswordField(), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(screen.getByText('This link has already been used')).toBeInTheDocument(),
    );
    // The form is gone: submitting again can only fail.
    expect(screen.queryByLabelText(/^new password/i)).not.toBeInTheDocument();
  });

  it('marks the password inputs for password managers', async () => {
    const api = makeApi();
    renderReset({ api });

    await waitFor(() => expect(newPasswordField()).toBeInTheDocument());

    expect(newPasswordField()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmPasswordField()).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });
});
