import { API_BASE_URL } from '../config';
import type {
  AuthUser,
  ContentItem,
  ContentType,
  MediaSummary,
  MusicKind,
  SeasonEpisodes,
  UserPreferences,
} from '../types';
import type { CollectionsDoc } from '../utils/collections';

export type ProviderErrorCode = 'not_configured' | 'not_found' | 'timeout' | 'unavailable';
export type ApiErrorCode = ProviderErrorCode | 'wrong_password' | 'rate_limited';

export class ApiError extends Error {
  status: number;
  code?: ApiErrorCode;
  constructor(status: number, message: string, code?: ApiErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error || `Request failed with ${res.status}`, body.code);
  }
  return body as T;
}

// ---- search & media detail (public, no auth required) ----

export interface SearchError {
  type: ContentType;
  code: ProviderErrorCode;
}

export interface SearchResponse {
  results: MediaSummary[];
  errors: SearchError[];
}

export function searchMedia(
  query: string,
  type: ContentType | 'all' = 'all',
  musicKind: MusicKind | 'all' = 'all',
) {
  const params = new URLSearchParams({ q: query, type, musicKind });
  return request<SearchResponse>(`/search?${params.toString()}`);
}

// Same shape as search: items from every source that answered, plus one error per source that didn't.
export function getTrending() {
  return request<SearchResponse>('/trending');
}

export function getMediaDetail(type: ContentType, externalId: string) {
  return request<ContentItem>(`/media/${type}/${externalId}`);
}

export function getTvSeason(externalId: string, season: number) {
  return request<SeasonEpisodes>(`/media/tv/${encodeURIComponent(externalId)}/season/${season}`);
}

/** `externalId` is the artist id after "music-", already URI-encoded like `getMediaDetail`'s. */
export function getArtistAlbums(externalId: string) {
  return request<{ albums: MediaSummary[] }>(`/media/music/${externalId}/albums`);
}

// ---- auth ----

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export function register(email: string, password: string, name?: string) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function fetchCurrentUser(token: string) {
  return request<{ user: AuthUser }>('/auth/me', {}, token);
}

export function updatePreferences(token: string, patch: Partial<UserPreferences>) {
  return request<{ user: AuthUser }>(
    '/auth/preferences',
    { method: 'PATCH', body: JSON.stringify(patch) },
    token,
  );
}

/** Ends every other session; the response carries this device's replacement token. */
export function changePassword(token: string, currentPassword: string, newPassword: string) {
  return request<AuthResponse>(
    '/auth/password',
    { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) },
    token,
  );
}

export function deleteAccount(token: string, password: string) {
  return request<void>('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) }, token);
}

// ---- saved media ----

export function getSavedMedia(token: string) {
  return request<{ savedMedia: MediaSummary[] }>('/saved', {}, token);
}

export function saveMedia(token: string, media: MediaSummary) {
  return request<{ savedMedia: MediaSummary[] }>(
    '/saved',
    { method: 'POST', body: JSON.stringify(media) },
    token,
  );
}

// ---- collections (signed-in users; guests keep theirs in localStorage) ----

export function getCollections(token: string) {
  return request<{ collections: CollectionsDoc }>('/collections', {}, token);
}

/** Replaces the whole document; the server drops entries it can't accept. */
export function saveCollections(token: string, collections: CollectionsDoc) {
  return request<{ collections: CollectionsDoc }>(
    '/collections',
    { method: 'PUT', body: JSON.stringify(collections) },
    token,
  );
}

export function removeSavedMedia(token: string, id: string) {
  return request<{ savedMedia: MediaSummary[] }>(`/saved/${id}`, { method: 'DELETE' }, token);
}
