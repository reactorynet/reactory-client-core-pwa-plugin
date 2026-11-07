import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useReactory } from '@reactory/client-core/api';

import {
  MIN_PASSWORD_LENGTH,
  describeResetToken,
  submitNewPassword,
  tokenFromSearch,
  type IResetTokenUser,
  type ResetOutcome,
} from './passwordResetApi';

/**
 * `core.ResetPassword` — the page that consumes a password-reset link.
 *
 * ## Why this replaces the previous component
 *
 * The former implementation lived in the CDN plugin
 * (`reactory-data/plugins/reactory-client-core/src/components/User/ResetPassword.tsx`)
 * and rendered the generic form engine with a schema. Two things made it
 * unusable:
 *
 *   1. It submitted through `reactory.resetPassword(...)`, a GraphQL
 *      `Users.setPassword` mutation gated `@auth(roles: ["USER","ADMIN"])` that
 *      sent the SESSION token and `resetToken: null`. Someone locked out had no
 *      session, so the call could only ever be rejected.
 *   2. It read the token from `localStorage.getItem("auth_token")`, and nothing
 *      ever wrote the emailed token there.
 *
 * This component is a plain React page: no form engine, no schema, no widgets. It
 * takes the token from the URL, asks the server whether the link is still good,
 * and posts the new password to the public REST endpoint. All authorisation is
 * server-side; the only client-side checks are the two that avoid a pointless
 * round trip (minimum length, matching confirmation) and the server's own message
 * is surfaced verbatim when it disagrees.
 *
 * ## States
 *
 *   no token      → dead end, no form (a form that cannot submit is a trap)
 *   verifying     → spinner while GET resolves
 *   unusable      → expired / already used / invalid, each with its own copy
 *   ready         → the form
 *   submitting    → form disabled, progress shown
 *   done          → confirmation, then on to /login
 */
export interface PasswordResetProps {
  /** Injected when the host wraps the component with the API. */
  reactory?: any;
  /**
   * Token override. The route normally supplies none and the component reads the
   * query string; tests and embedded flows can pass one explicitly.
   */
  initialToken?: string;
  /** Where to send the user after a successful reset. */
  successRoute?: string;
  /** Injectable API for tests; defaults to the real REST client. */
  api?: {
    describeResetToken: typeof describeResetToken;
    submitNewPassword: typeof submitNewPassword;
  };
}

type Phase = 'no-token' | 'verifying' | 'unusable' | 'ready' | 'submitting' | 'done';

const UNUSABLE_COPY: Record<string, { title: string; body: string }> = {
  expired: {
    title: 'This link has expired',
    body: 'Password reset links are valid for one hour. Request a new one and it will arrive in a moment.',
  },
  used: {
    title: 'This link has already been used',
    body: 'If you have already set a new password you can sign in with it. Otherwise request a fresh link.',
  },
  invalid: {
    title: 'This link is not valid',
    body: 'The link may be incomplete, or it may belong to a different application. Request a new one.',
  },
  failed: {
    title: 'We could not check this link',
    body: 'The server could not be reached. Check your connection and try again.',
  },
};

export const PasswordReset: React.FC<PasswordResetProps> = ({
  reactory: propReactory,
  initialToken,
  successRoute = '/login',
  api,
}) => {
  // The registry entry cannot carry `wrapWithApi`, so read the SDK from context
  // and fall back to a prop when the host injects one.
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const client = api ?? { describeResetToken, submitNewPassword };

  /** Parsed once: the query string does not change underneath this page. */
  const [token] = useState<string | null>(() => {
    if (typeof initialToken === 'string' && initialToken.trim().length > 0) {
      return initialToken.trim();
    }
    if (typeof window === 'undefined') return null;
    return tokenFromSearch(window.location?.search ?? '');
  });

  const [phase, setPhase] = useState<Phase>(token ? 'verifying' : 'no-token');
  const [outcome, setOutcome] = useState<ResetOutcome>('invalid');
  const [reason, setReason] = useState<string>('');
  const [user, setUser] = useState<IResetTokenUser | undefined>(undefined);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /** Guards the post-success redirect so it runs once. */
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;
    setPhase('verifying');

    client
      .describeResetToken(reactory, token)
      .then((result) => {
        if (cancelled) return;

        if (result.ok) {
          setUser(result.user);
          setOutcome('valid');
          setPhase('ready');
          return;
        }

        setOutcome(result.outcome);
        setReason(result.message);
        setPhase('unusable');
      })
      .catch(() => {
        if (cancelled) return;
        setOutcome('failed');
        setReason('');
        setPhase('unusable');
      });

    return () => {
      cancelled = true;
    };
    // `client` is stable per render source; re-running on it would re-verify on
    // every keystroke because the inline default object is recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reactory]);

  /** Clear the redirect timer if the page unmounts mid-countdown. */
  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    [],
  );

  const greetName = useMemo(() => {
    const first = (user?.firstName ?? '').trim();
    return first.length > 0 ? first : null;
  }, [user]);

  /**
   * The token is removed from the address bar on success.
   *
   * It is single-use, so leaving it in history serves no purpose and would only
   * offer the user a link that now fails. `replaceState` keeps the back button
   * clean.
   */
  const clearTokenFromLocation = useCallback(() => {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch {
      /* a locked-down history object is not worth failing the flow over */
    }
  }, []);

  const onSubmit = useCallback(
    async (event?: React.FormEvent) => {
      if (event) event.preventDefault();
      if (!token || phase === 'submitting') return;

      // Two checks only, both to avoid a pointless round trip. The server owns
      // the real policy and its message wins below.
      if (password.length < MIN_PASSWORD_LENGTH) {
        setFormError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }

      if (password !== confirmPassword) {
        setFormError('The passwords do not match.');
        return;
      }

      setFormError(null);
      setPhase('submitting');

      const result = await client.submitNewPassword(reactory, {
        token,
        password,
        confirmPassword,
      });

      if (result.ok) {
        setPhase('done');
        clearTokenFromLocation();

        reactory?.createNotification?.(result.message, {
          type: 'success',
          canDismiss: true,
          timeOut: 3500,
          showInAppNotification: true,
        });

        redirectTimer.current = setTimeout(() => {
          reactory?.goto?.(successRoute);
        }, 2500);
        return;
      }

      // A rejected token means the form can no longer succeed: stop pretending
      // it can and show the reason.
      if (result.outcome === 'expired' || result.outcome === 'used' || result.outcome === 'invalid') {
        setOutcome(result.outcome);
        setReason(result.message);
        setPhase('unusable');
        clearTokenFromLocation();
        return;
      }

      setFormError(result.message);
      setPhase('ready');
    },
    [
      token,
      phase,
      password,
      confirmPassword,
      client,
      reactory,
      successRoute,
      clearTokenFromLocation,
    ],
  );

  const busy = phase === 'submitting';
  const strengthHelper =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `At least ${MIN_PASSWORD_LENGTH} characters.`
      : `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
      <Paper elevation={1} sx={{ p: { xs: 3, sm: 4 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h5" component="h1" gutterBottom>
              {phase === 'done' ? 'Password updated' : 'Set a new password'}
            </Typography>

            {phase === 'ready' || phase === 'submitting' ? (
              <Typography variant="body2" color="text.secondary">
                {user?.email
                  ? `Resetting the password for ${user.email}.`
                  : 'Choose a new password for your account.'}
              </Typography>
            ) : null}
          </Box>

          {phase === 'no-token' ? (
            <Alert severity="warning">
              <Typography variant="subtitle2" gutterBottom>
                No reset token in this link
              </Typography>
              <Typography variant="body2">
                Open the link from your password reset email, or{' '}
                <Link href="/forgot" underline="hover">
                  request a new one
                </Link>
                .
              </Typography>
            </Alert>
          ) : null}

          {phase === 'verifying' ? (
            <Stack direction="row" spacing={2} alignItems="center" role="status" aria-live="polite">
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Checking your reset link…
              </Typography>
            </Stack>
          ) : null}

          {phase === 'unusable' ? (
            <Alert severity="error" role="alert">
              <Typography variant="subtitle2" gutterBottom>
                {UNUSABLE_COPY[outcome]?.title ?? UNUSABLE_COPY.invalid.title}
              </Typography>
              <Typography variant="body2">
                {/* The server's own message is shown when it sent one: it knows
                    which of the three cases applied and says so precisely. */}
                {reason || UNUSABLE_COPY[outcome]?.body || UNUSABLE_COPY.invalid.body}
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Button variant="outlined" href="/forgot">
                  Request a new link
                </Button>
              </Box>
            </Alert>
          ) : null}

          {phase === 'ready' || phase === 'submitting' ? (
            <Box component="form" onSubmit={onSubmit} noValidate>
              <Stack spacing={2}>
                {user && (user.firstName || user.avatar) ? (
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar src={user.avatar || undefined} alt="">
                      {(user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')}
                    </Avatar>
                    <Typography variant="body2">
                      {greetName ? `Hi ${greetName}, ` : ''}
                      choose a new password below.
                    </Typography>
                  </Stack>
                ) : null}

                {formError ? (
                  <Alert severity="error" role="alert">
                    {formError}
                  </Alert>
                ) : null}

                <TextField
                  label="New password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                  autoFocus
                  fullWidth
                  required
                  helperText={strengthHelper}
                  inputProps={{ 'aria-describedby': 'reset-password-helper' }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((value) => !value)}
                          onMouseDown={(event) => event.preventDefault()}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <TextField
                  label="Confirm new password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                  fullWidth
                  required
                  error={confirmPassword.length > 0 && confirmPassword !== password}
                  helperText={
                    confirmPassword.length > 0 && confirmPassword !== password
                      ? 'The passwords do not match.'
                      : ' '
                  }
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={
                    busy ||
                    password.length === 0 ||
                    confirmPassword.length === 0 ||
                    password !== confirmPassword
                  }
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                  {busy ? 'Updating…' : 'Update password'}
                </Button>
              </Stack>
            </Box>
          ) : null}

          {phase === 'done' ? (
            <Alert severity="success" role="status" aria-live="polite">
              <Typography variant="subtitle2" gutterBottom>
                Your password has been updated
              </Typography>
              <Typography variant="body2">
                You can now sign in with your new password. For your security, any
                sessions that were open on this account have been signed out.
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Button variant="contained" href={successRoute}>
                  Go to sign in
                </Button>
              </Box>
            </Alert>
          ) : null}
        </Stack>
      </Paper>
    </Container>
  );
};

export default PasswordReset;
