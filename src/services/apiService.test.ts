import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '../config';
import { ApiError, changePassword, deleteAccount } from './apiService';

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
