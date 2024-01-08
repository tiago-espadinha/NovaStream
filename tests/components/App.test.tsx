// @vitest-environment jsdom
import '../helpers/dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { AuthProvider } from '../../src/context/AuthContext';
import * as api from '../../src/services/apiService';
import { ApiError } from '../../src/services/apiService';
import type { ContentItem } from '../../src/types';
import { EMPTY_COLLECTIONS } from '../../src/utils/collections';
import { contentItem, deferred, media, user } from '../helpers/fixtures';

// The real hooks and screens, wired together; only the network is replaced, and the mock catalog
// is pinned so a developer's VITE_USE_MOCK can't change what these tests see.
vi.mock('../../src/config', () => ({ USE_MOCK: true, API_BASE_URL: 'http://test/api' }));
vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  fetchCurrentUser: vi.fn(),
  login: vi.fn(),
  getSavedMedia: vi.fn(),
  saveMedia: vi.fn(),
  getCollections: vi.fn(),
  saveCollections: vi.fn(),
  getMediaDetail: vi.fn(),
  getArtistAlbums: vi.fn(),
  deleteAccount: vi.fn(),
}));

const fetchCurrentUser = vi.mocked(api.fetchCurrentUser);
const login = vi.mocked(api.login);
const getSavedMedia = vi.mocked(api.getSavedMedia);
const saveMedia = vi.mocked(api.saveMedia);
const getCollections = vi.mocked(api.getCollections);
const saveCollections = vi.mocked(api.saveCollections);
const getMediaDetail = vi.mocked(api.getMediaDetail);
const getArtistAlbums = vi.mocked(api.getArtistAlbums);
const deleteAccount = vi.mocked(api.deleteAccount);

const TOKEN_KEY = 'nova-stream:token';

const app = () =>
  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );

const signOutElsewhere = () =>
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, newValue: null }));
  });

async function openSettings() {
  fireEvent.click(await screen.findByRole('button', { name: 'Account settings (Ana)' }));
  return screen.getByRole('dialog', { name: 'Ana' });
}

async function signIn() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'password1' } });
  const dialog = screen.getByRole('dialog', { name: 'Welcome back' });
  fireEvent.submit(dialog.querySelector('form')!);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Welcome back' })).toBeNull());
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.pushState({}, '', '/');
  fetchCurrentUser.mockResolvedValue({ user });
  login.mockResolvedValue({ token: 'fresh', user });
  getSavedMedia.mockResolvedValue({ savedMedia: [] });
  getCollections.mockResolvedValue({ collections: EMPTY_COLLECTIONS });
  saveCollections.mockImplementation(async (_token, collections) => ({ collections }));
});

describe('App: sign-out closes settings', () => {
  beforeEach(() => {
    localStorage.setItem(TOKEN_KEY, 'stored');
  });

  it('closes settings when the user signs out from them', async () => {
    app();
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('closes settings when another tab signs out', async () => {
    app();
    await openSettings();
    signOutElsewhere();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('closes them for good: signing in again does not reopen them', async () => {
    app();
    await openSettings();
    signOutElsewhere();

    await signIn();
    expect(await screen.findByRole('button', { name: 'Account settings (Ana)' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes settings when the session expires while they are open', async () => {
    app();
    await openSettings();
    await act(async () => {});

    // Any account request can find the session over; here, a favorite saved from a card.
    saveMedia.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    fireEvent.click(screen.getAllByRole('button', { name: /^Save / })[0]);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The header's button and the notice's.
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(2);
    expect(screen.getByText(/^Your session expired, so “.*” wasn’t saved/)).toBeTruthy();
  });

  it('confirms an account deletion after closing settings', async () => {
    deleteAccount.mockResolvedValue(undefined);
    app();
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }));
    fireEvent.change(screen.getByLabelText('Enter your password to confirm'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText('Your account was deleted, with its saved titles and collections.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('App: guest merge at sign-in', () => {
  it('moves guest favorites and collections to the account, leaving the browser empty', async () => {
    const guestFavorite = media('movie-guest', { title: 'Guest film' });
    localStorage.setItem('nova-stream:favorites', JSON.stringify([guestFavorite]));
    localStorage.setItem(
      'nova-stream:collections',
      JSON.stringify([{ id: 'trip', name: 'Trip', contentTypes: ['movie'] }]),
    );
    localStorage.setItem('nova-stream:collection-assignments', JSON.stringify({ 'movie-guest': ['trip'] }));
    localStorage.setItem('nova-stream:collection-media', JSON.stringify({ 'movie-guest': guestFavorite }));
    saveMedia.mockResolvedValue({ savedMedia: [guestFavorite] });

    app();
    await signIn();

    expect(await screen.findByText('Added 1 favorite from this browser to your account.')).toBeTruthy();
    expect(saveMedia).toHaveBeenCalledWith('fresh', guestFavorite);
    await waitFor(() => expect(saveCollections).toHaveBeenCalledTimes(1));
    expect(saveCollections.mock.calls[0][0]).toBe('fresh');
    expect(saveCollections.mock.calls[0][1].assignments).toEqual({ 'movie-guest': ['trip'] });

    await waitFor(() => expect(localStorage.getItem('nova-stream:favorites')).toBe('[]'));
    await waitFor(() => expect(localStorage.getItem('nova-stream:collections')).toBe('[]'));
    expect(localStorage.getItem('nova-stream:collection-assignments')).toBe('{}');
  });
});

describe('App: detail back navigation', () => {
  it('returns from an album to its artist without fetching, focus on the album', async () => {
    const artist = contentItem('music-artist', {
      type: 'music',
      title: 'The Artist',
      musicKind: 'artist',
      creatorRole: 'artist',
    });
    const album = contentItem('music-album', { type: 'music', title: 'The Album', musicKind: 'album' });
    localStorage.setItem('nova-stream:favorites', JSON.stringify([artist]));
    getMediaDetail.mockResolvedValueOnce(artist).mockResolvedValueOnce(album);
    getArtistAlbums.mockResolvedValue({ albums: [album] });

    app();
    fireEvent.click(screen.getAllByRole('button', { name: 'The Artist' })[0]);
    const openAlbum = await screen.findByRole('button', { name: 'The Album' });
    fireEvent.click(openAlbum);

    // Wait for the album itself: the loading dialog before it has a Back button of its own.
    await screen.findByRole('dialog', { name: 'The Album' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to The Artist' }));
    await screen.findByRole('dialog', { name: 'The Artist' });
    expect(getMediaDetail).toHaveBeenCalledTimes(2);
    expect(getArtistAlbums).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'The Album' }));
  });

  it('can leave a related title that is still loading, ignoring its late answer', async () => {
    const artist = contentItem('music-artist', {
      type: 'music',
      title: 'The Artist',
      musicKind: 'artist',
      creatorRole: 'artist',
    });
    const album = contentItem('music-album', { type: 'music', title: 'The Album', musicKind: 'album' });
    const slow = deferred<ContentItem>();
    localStorage.setItem('nova-stream:favorites', JSON.stringify([artist]));
    getMediaDetail.mockResolvedValueOnce(artist).mockReturnValueOnce(slow.promise);
    getArtistAlbums.mockResolvedValue({ albums: [album] });

    app();
    fireEvent.click(screen.getAllByRole('button', { name: 'The Artist' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'The Album' }));
    await screen.findByRole('dialog', { name: 'Loading details' });

    fireEvent.click(screen.getByRole('button', { name: 'Back to The Artist' }));
    await screen.findByRole('dialog', { name: 'The Artist' });

    await act(async () => slow.resolve(album));
    expect(screen.getByRole('dialog', { name: 'The Artist' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'The Album' })).toBeNull();
  });
});

describe('App: page', () => {
  it('names the page and renders the home screen and footer', () => {
    app();
    expect(document.title).toBe('Nova Stream');
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main-content');
    expect(screen.getByRole('main').id).toBe('main-content');
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });

  it('serves the Saved page at /saved', () => {
    window.history.pushState({}, '', '/saved/');
    app();
    expect(document.title).toBe('Saved · Nova Stream');
    expect(screen.getByRole('heading', { level: 1, name: 'Saved' })).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
