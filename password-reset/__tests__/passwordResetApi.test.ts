import {
  MIN_PASSWORD_LENGTH,
  describeResetToken,
  publicHeaders,
  resetEndpoint,
  submitNewPassword,
  tokenFromSearch,
} from '../passwordResetApi';

const SDK = {
  API_ROOT: 'http://localhost:4000',
  CLIENT_KEY: 'reactory',
  CLIENT_PUBLIC_KEY: 'reactory-local-public-key',
};

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

const nonJsonResponse = (status: number): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error('not json');
    },
  }) as unknown as Response;

describe('passwordResetApi', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('endpoint and headers', () => {
    it('targets the reset-password endpoint', () => {
      expect(resetEndpoint(SDK)).toBe('http://localhost:4000/useraccount/reset-password');
    });

    it('tolerates a trailing slash on API_ROOT', () => {
      expect(resetEndpoint({ ...SDK, API_ROOT: 'http://localhost:4000///' })).toBe(
        'http://localhost:4000/useraccount/reset-password',
      );
    });

    it('sends the tenant headers the ReactoryClient middleware requires', () => {
      const headers = publicHeaders(SDK);

      expect(headers['x-client-key']).toBe('reactory');
      expect(headers['x-client-public-key']).toBe('reactory-local-public-key');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('never sends an authorization header for a public endpoint', () => {
      // The endpoint authenticates the LINK, not the caller. Sending a session
      // token here would be meaningless at best.
      expect(publicHeaders(SDK)).not.toHaveProperty('authorization');
    });
  });

  describe('tokenFromSearch', () => {
    it('reads auth_token, which is how the server mints the link', () => {
      expect(tokenFromSearch('?auth_token=abc123')).toBe('abc123');
    });

    it('accepts token as a fallback', () => {
      expect(tokenFromSearch('?token=xyz')).toBe('xyz');
    });

    it('prefers auth_token when both are present', () => {
      expect(tokenFromSearch('?token=fallback&auth_token=preferred')).toBe('preferred');
    });

    it('trims whitespace', () => {
      expect(tokenFromSearch('?auth_token=%20abc%20')).toBe('abc');
    });

    it('returns null when absent or blank', () => {
      expect(tokenFromSearch('')).toBeNull();
      expect(tokenFromSearch('?other=1')).toBeNull();
      expect(tokenFromSearch('?auth_token=%20%20')).toBeNull();
    });
  });

  describe('describeResetToken', () => {
    it('GETs the token and returns the account identity', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          state: 'valid',
          user: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: 'a.png' },
        }),
      );
      global.fetch = fetchMock as any;

      const result = await describeResetToken(SDK, 'tok+en/with?chars');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        `http://localhost:4000/useraccount/reset-password?token=${encodeURIComponent('tok+en/with?chars')}`,
      );
      expect(init.method).toBe('GET');
      expect(result.ok).toBe(true);
      expect(result.user).toEqual({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        avatar: 'a.png',
      });
    });

    it('maps expired_token to expired and surfaces the server message', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse(410, { state: 'expired_token', message: 'This link has expired.' }),
      ) as any;

      const result = await describeResetToken(SDK, 'tok');

      expect(result.ok).toBe(false);
      expect(result.outcome).toBe('expired');
      expect(result.message).toBe('This link has expired.');
    });

    it('maps used_token to used', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse(410, { state: 'used_token', message: 'already used' }),
      ) as any;

      expect((await describeResetToken(SDK, 'tok')).outcome).toBe('used');
    });

    it('maps invalid_token to invalid', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse(400, { state: 'invalid_token', message: 'nope' }),
      ) as any;

      expect((await describeResetToken(SDK, 'tok')).outcome).toBe('invalid');
    });

    it('does not call the network for an empty token', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as any;

      const result = await describeResetToken(SDK, '   ');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
    });

    it('degrades to a readable message on a network failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

      const result = await describeResetToken(SDK, 'tok');

      expect(result.ok).toBe(false);
      expect(result.outcome).toBe('failed');
      expect(result.message).toMatch(/could not reach the server/i);
    });

    it('copes with a non-JSON error body', async () => {
      global.fetch = jest.fn().mockResolvedValue(nonJsonResponse(502)) as any;

      const result = await describeResetToken(SDK, 'tok');

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/no longer valid/i);
    });
  });

  describe('submitNewPassword', () => {
    it('POSTs token + password in the body, never in the URL', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, { state: 'completed', message: 'done' }),
      );
      global.fetch = fetchMock as any;

      const result = await submitNewPassword(SDK, {
        token: 'tok',
        password: 'correct horse battery',
        confirmPassword: 'correct horse battery',
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:4000/useraccount/reset-password');
      expect(url).not.toContain('tok');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({
        token: 'tok',
        password: 'correct horse battery',
        confirmPassword: 'correct horse battery',
      });
      expect(result.ok).toBe(true);
      expect(result.outcome).toBe('completed');
    });

    it('defaults confirmPassword to password when omitted', async () => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { state: 'completed' }));
      global.fetch = fetchMock as any;

      await submitNewPassword(SDK, { token: 'tok', password: 'abcdefgh' });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).confirmPassword).toBe('abcdefgh');
    });

    it('passes a weak_password rejection through', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse(400, { state: 'weak_password', message: 'too short' }),
      ) as any;

      const result = await submitNewPassword(SDK, { token: 'tok', password: 'short' });

      expect(result.ok).toBe(false);
      expect(result.outcome).toBe('weak_password');
      expect(result.message).toBe('too short');
    });

    it('passes a password_mismatch rejection through', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse(400, { state: 'password_mismatch', message: 'mismatch' }),
      ) as any;

      expect((await submitNewPassword(SDK, { token: 'tok', password: 'abcdefgh' })).outcome).toBe(
        'password_mismatch',
      );
    });

    it('treats a server 500 as a failure without leaking internals', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse(500, { state: 'failed', message: 'Your password could not be updated.' }),
      ) as any;

      const result = await submitNewPassword(SDK, { token: 'tok', password: 'abcdefgh' });

      expect(result.ok).toBe(false);
      expect(result.outcome).toBe('failed');
    });

    it('reports a network failure as retryable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;

      const result = await submitNewPassword(SDK, { token: 'tok', password: 'abcdefgh' });

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/try again/i);
    });
  });

  it('mirrors the server minimum password length', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });
});
