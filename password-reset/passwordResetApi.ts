/**
 * REST client for the password-reset endpoints.
 *
 * WHY THIS EXISTS
 * ---------------
 * The old `PasswordResetForm` (reactory-data/plugins/.../User/ResetPassword.tsx)
 * called `reactory.resetPassword(...)`, which is a GraphQL `Users.setPassword`
 * mutation posting `authToken: getAuthToken()` — the caller's SESSION token — and
 * `resetToken: null`. It could not work for anyone who was actually locked out:
 * the mutation is `@auth(roles: ["USER","ADMIN"])`, so an anonymous visitor got
 * "does not have permissions", and the reset token from the email was never sent.
 *
 * The server exposes purpose-built public endpoints instead:
 *
 *   GET  /useraccount/reset-password?token=…   → is this link usable, and for whom
 *   POST /useraccount/reset-password           → set the new password
 *
 * `POST` is the only unauthenticated way to change a password in the platform, so
 * the token does all the work. Deliberately no `authorization` header is sent:
 * the session token has no business here, and sending a stale one could only
 * confuse the tenant middleware.
 *
 * The tenant headers are still required — `ReactoryClient` answers 401 without a
 * client key, and it caches a validated tenant for five minutes, so a missing
 * header can hide itself until a restart. Same idiom as
 * `ReactorChat/components/Shell/shellApi.ts`.
 */

/** The parts of the Reactory SDK this module needs. */
export type ReactoryResetSDK = {
  API_ROOT: string;
  CLIENT_KEY: string;
  CLIENT_PUBLIC_KEY: string;
};

/** The four presentation fields the server returns for a valid token. */
export interface IResetTokenUser {
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
}

/**
 * Normalised outcome of a reset call.
 *
 * The server distinguishes `expired` from `used` because they are actionable in
 * different ways ("request a new link" vs "you already changed it"), and it
 * distinguishes both from `invalid`. Collapsing them would show a misleading
 * message, so the states are preserved here and the component decides the copy.
 */
export type ResetOutcome =
  | 'valid'
  | 'completed'
  | 'expired'
  | 'used'
  | 'invalid'
  | 'weak_password'
  | 'password_mismatch'
  | 'failed';

export interface IDescribeTokenResult {
  ok: boolean;
  outcome: ResetOutcome;
  message: string;
  user?: IResetTokenUser;
}

export interface ISubmitPasswordResult {
  ok: boolean;
  outcome: ResetOutcome;
  message: string;
}

/**
 * Query parameter carrying the token.
 *
 * The server mints links as `…?auth_token=…` (`buildPasswordResetLink`'s default
 * parameter name). `token` is accepted as a fallback because the activation flow
 * uses that name and older links may carry it.
 */
export const RESET_TOKEN_PARAMS = ['auth_token', 'token'] as const;

/** Client-side mirror of the server's minimum. The server remains authoritative. */
export const MIN_PASSWORD_LENGTH = 8;

/** Absolute URL of an endpoint, tolerant of a trailing slash on API_ROOT. */
export const resetEndpoint = (reactory: ReactoryResetSDK, path = 'useraccount/reset-password'): string =>
  `${String(reactory.API_ROOT || '').replace(/\/+$/, '')}/${path}`;

/**
 * Tenant headers for a public endpoint.
 *
 * No `authorization`: these endpoints authenticate the *link*, not the caller.
 */
export const publicHeaders = (reactory: ReactoryResetSDK): Record<string, string> => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'x-client-key': reactory.CLIENT_KEY,
  'x-client-public-key': reactory.CLIENT_PUBLIC_KEY,
});

/**
 * Read the reset token out of a location search string.
 *
 * Pure and exported so the parsing is testable without a DOM. Returns `null` when
 * neither parameter is present, which is the "no link" case the component renders
 * as a dead-end message rather than as an empty form.
 */
export const tokenFromSearch = (search: string): string | null => {
  if (typeof search !== 'string' || search.length === 0) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  for (const name of RESET_TOKEN_PARAMS) {
    const value = params.get(name);
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }

  return null;
};

/** Map a server `state` string onto the outcome union. */
const outcomeFor = (state: unknown): ResetOutcome => {
  switch (state) {
    case 'valid':
    case 'completed':
    case 'expired':
    case 'used':
    case 'weak_password':
    case 'password_mismatch':
      return state;
    case 'expired_token':
      return 'expired';
    case 'used_token':
      return 'used';
    case 'missing_token':
    case 'invalid_token':
    case 'invalid_password':
      return 'invalid';
    default:
      return 'failed';
  }
};

/** Body of a failed response, or an empty object when it is not JSON. */
const readJson = async (response: Response): Promise<any> => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

/**
 * Ask the server whether a reset link is still usable.
 *
 * Returns `{ ok: false }` with the server's own message for a rejected link; the
 * component shows that message verbatim rather than reinterpreting it.
 */
export const describeResetToken = async (
  reactory: ReactoryResetSDK,
  token: string,
): Promise<IDescribeTokenResult> => {
  if (!token || token.trim().length === 0) {
    return {
      ok: false,
      outcome: 'invalid',
      message: 'This password reset link is missing its token. Request a new one.',
    };
  }

  try {
    const response = await fetch(
      `${resetEndpoint(reactory)}?token=${encodeURIComponent(token)}`,
      { method: 'GET', headers: publicHeaders(reactory) },
    );

    const body = await readJson(response);

    if (!response.ok) {
      return {
        ok: false,
        outcome: outcomeFor(body?.state),
        message:
          typeof body?.message === 'string' && body.message.length > 0
            ? body.message
            : 'This password reset link is no longer valid. Request a new one.',
      };
    }

    return {
      ok: true,
      outcome: 'valid',
      message: '',
      user: {
        firstName: String(body?.user?.firstName ?? ''),
        lastName: String(body?.user?.lastName ?? ''),
        email: String(body?.user?.email ?? ''),
        avatar: String(body?.user?.avatar ?? ''),
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      outcome: 'failed',
      message: 'We could not reach the server to check this link. Please try again.',
    };
  }
};

/**
 * Submit the new password.
 *
 * The token is sent in the body, never as a header: it must not end up in a
 * proxy access log the way a query string on a POST would.
 */
export const submitNewPassword = async (
  reactory: ReactoryResetSDK,
  input: { token: string; password: string; confirmPassword?: string },
): Promise<ISubmitPasswordResult> => {
  try {
    const response = await fetch(resetEndpoint(reactory), {
      method: 'POST',
      headers: publicHeaders(reactory),
      body: JSON.stringify({
        token: input.token,
        password: input.password,
        confirmPassword: input.confirmPassword ?? input.password,
      }),
    });

    const body = await readJson(response);

    if (!response.ok) {
      return {
        ok: false,
        outcome: outcomeFor(body?.state),
        message:
          typeof body?.message === 'string' && body.message.length > 0
            ? body.message
            : 'Your password could not be updated. Please request a new reset link.',
      };
    }

    return {
      ok: true,
      outcome: 'completed',
      message:
        typeof body?.message === 'string' && body.message.length > 0
          ? body.message
          : 'Your password has been updated. You can now sign in with it.',
    };
  } catch (error: any) {
    return {
      ok: false,
      outcome: 'failed',
      message: 'We could not reach the server to update your password. Please try again.',
    };
  }
};
