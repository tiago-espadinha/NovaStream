import { API_BASE_URL } from '../config';
import type { ContentItem, ContentType, MediaSummary, MusicKind } from '../types';

export type ProviderErrorCode = 'not_configured' | 'not_found' | 'timeout' | 'unavailable';

export class ApiError extends Error {
  status: number;
  code?: ProviderErrorCode;
  constructor(status: number, message: string, code?: ProviderErrorCode) {
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

export function getMediaDetail(type: ContentType, externalId: string) {
  return request<ContentItem>(`/media/${type}/${externalId}`);
}
