import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '../config';
import { ApiError, changePassword, deleteAccount, getMediaDetail, getTrending, getTvSeason, searchMedia } from './apiService';

// Only English has a catalog so far, so the active locale is stubbed to cover the others.
let locale = 'en';
vi.mock('../i18n', () => ({ currentLocale: () => locale }));

function stubFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () =>
    body === undefined ? new Response(null, { status }) : Response.json(body, { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const lastRequest = (fetchMock: ReturnType<typeof stubFetch>) => {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};

afterEach(() => vi.unstubAllGlobals());

describe('changePassword', () => {
  it('sends both passwords in the body with the bearer token and returns the new session', async () => {
    const fetchMock = stubFetch(200, { token: 'next', user: { id: 'u1' } });
    await expect(changePassword('tok', 'old secret', 'new secret')).resolves.toEqual({ token: 'next', user: { id: 'u1' } });

    const { url, init, headers } = lastRequest(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/password`);
    expect(url).not.toMatch(/secret/);
    expect(init.method).toBe('PUT');
    expect(headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ currentPassword: 'old secret', newPassword: 'new secret' });
  });

  it('rejects with the server’s code for a wrong current password', async () => {
    stubFetch(403, { error: 'That password isn’t right.', code: 'wrong_password' });
    const error = await changePassword('tok', 'nope', 'new secret').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'wrong_password', message: 'That password isn’t right.' });
  });

  it('rejects with the server’s wait when password attempts are rate-limited', async () => {
    const message = 'Too many password attempts. Try again in 15 minutes.';
    stubFetch(429, { error: message, code: 'rate_limited', retryAfterSeconds: 900 });
    const error = await changePassword('tok', 'nope', 'new secret').catch((err: unknown) => err);
    expect(error).toMatchObject({ status: 429, code: 'rate_limited', message });
  });
});

describe('rate-limit wait', () => {
  const failWith = async (body: unknown) => {
    stubFetch(429, body);
    return changePassword('tok', 'a', 'b').then(() => { throw new Error("expected rejection"); }, (err: unknown) => err as ApiError);
  };

  it('lands the server’s retryAfterSeconds on the error', async () => {
    expect((await failWith({ error: 'x', code: 'rate_limited', retryAfterSeconds: 900 })).retryAfterSeconds).toBe(900);
    expect((await failWith({ error: 'x', code: 'rate_limited', retryAfterSeconds: 0 })).retryAfterSeconds).toBe(0);
  });

  it('leaves it undefined when missing, non-numeric, negative, or not finite', async () => {
    for (const retryAfterSeconds of [undefined, '900', null, -1, Number.NaN, { n: 1 }]) {
      const error = await failWith({ error: 'x', code: 'rate_limited', retryAfterSeconds });
      expect(error.retryAfterSeconds).toBeUndefined();
    }
  });
});

describe('language on TMDb-backed requests', () => {
  afterEach(() => {
    locale = 'en';
  });

  const requestedUrl = async (call: () => Promise<unknown>, next = 'en') => {
    locale = next;
    const fetchMock = stubFetch(200, {});
    await call();
    return lastRequest(fetchMock).url;
  };

  it('appends the active locale after the existing search params', async () => {
    const url = await requestedUrl(() => searchMedia('a b&c', 'movie', 'all'), 'fr');
    expect(url).toBe(`${API_BASE_URL}/search?q=a+b%26c&type=movie&musicKind=all&lang=fr`);
  });

  it('adds it as the only param where there were none, encoded', async () => {
    expect(await requestedUrl(() => getTrending(), 'pt-PT')).toBe(`${API_BASE_URL}/trending?lang=pt-PT`);
    expect(await requestedUrl(() => getMediaDetail('movie', '603'))).toBe(`${API_BASE_URL}/media/movie/603?lang=en`);
    expect(await requestedUrl(() => getTvSeason('42', 2), 'es')).toBe(`${API_BASE_URL}/media/tv/42/season/2?lang=es`);
  });
});

describe('deleteAccount', () => {
  it('sends the password in a DELETE body and accepts an empty 204', async () => {
    const fetchMock = stubFetch(204);
    await expect(deleteAccount('tok', 'my secret')).resolves.toBeDefined();

    const { url, init, headers } = lastRequest(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/auth/account`);
    expect(init.method).toBe('DELETE');
    expect(headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ password: 'my secret' });
  });
});
