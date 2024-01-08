// @vitest-environment jsdom
import '../helpers/dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollections } from '../../src/hooks/useCollections';
import * as api from '../../src/services/apiService';
import { ApiError } from '../../src/services/apiService';
import { EMPTY_COLLECTIONS, type CollectionsDoc, type SavedCollection } from '../../src/utils/collections';
import { deferred, media } from '../helpers/fixtures';

const auth = vi.hoisted(() => ({ token: null as string | null, endSession: vi.fn() }));

vi.mock('../../src/context/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../../src/services/apiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiService')>()),
  getCollections: vi.fn(),
  saveCollections: vi.fn(),
}));

const getCollections = vi.mocked(api.getCollections);
const saveCollections = vi.mocked(api.saveCollections);

const CUSTOM_KEY = 'nova-stream:collections';
const ASSIGNMENTS_KEY = 'nova-stream:collection-assignments';
const MEDIA_KEY = 'nova-stream:collection-media';
const movie = media('movie-1');
const book = media('book-1', { type: 'book' });
const custom = (id: string, name = id): SavedCollection => ({ id, name, contentTypes: ['movie'] });
const assignments = () => JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY) ?? 'null') as Record<string, string[]>;

function seedGuest(doc: CollectionsDoc) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(doc.custom));
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(doc.assignments));
  localStorage.setItem(MEDIA_KEY, JSON.stringify(doc.media));
}

const echoSave = () => saveCollections.mockImplementation(async (_token, collections) => ({ collections }));

beforeEach(() => {
  vi.resetAllMocks();
  auth.token = null;
});

describe('useCollections as a guest', () => {
  it('keeps a title in a collection in this browser, without the network', () => {
    const { result } = renderHook(() => useCollections());

    act(() => result.current.toggleCollection(movie, 'to-watch'));
    expect(result.current.assignments).toEqual({ 'movie-1': ['to-watch'] });
    expect(result.current.collectionItems.map(({ id }) => id)).toEqual(['movie-1']);
    expect(assignments()).toEqual({ 'movie-1': ['to-watch'] });
    expect(getCollections).not.toHaveBeenCalled();
    expect(saveCollections).not.toHaveBeenCalled();
  });

  it('allows one status per group: picking Watched replaces To Watch', () => {
    const { result } = renderHook(() => useCollections());

    act(() => result.current.toggleCollection(movie, 'to-watch'));
    act(() => result.current.toggleCollection(movie, 'watched'));
    expect(result.current.assignments['movie-1']).toEqual(['watched']);
  });

  it('forgets a title once it has left every collection', () => {
    const { result } = renderHook(() => useCollections());

    act(() => result.current.toggleCollection(movie, 'to-watch'));
    act(() => result.current.toggleCollection(movie, 'to-watch'));
    expect(result.current.assignments).toEqual({});
    expect(result.current.collectionItems).toEqual([]);
  });

  it('ignores a collection that cannot hold the title, or that does not exist', () => {
    const { result } = renderHook(() => useCollections());

    act(() => result.current.toggleCollection(book, 'to-watch'));
    act(() => result.current.toggleCollection(movie, 'nope'));
    expect(result.current.assignments).toEqual({});
  });

  it('offers only the collections that fit a format', () => {
    const { result } = renderHook(() => useCollections());
    expect(result.current.collectionsFor('book').map(({ id }) => id)).toEqual(['to-read', 'read']);
  });

  it('creates a collection and puts the title straight in it', () => {
    const { result } = renderHook(() => useCollections());
    let created: SavedCollection | null = null;

    act(() => {
      created = result.current.createCollection('  Rainy Sundays ', ['movie'], movie);
    });
    expect(created).toMatchObject({ name: 'Rainy Sundays', contentTypes: ['movie'] });
    expect(created!.id).toMatch(/^custom-/);
    expect(result.current.assignments['movie-1']).toEqual([created!.id]);
    expect(result.current.collections.at(-1)?.name).toBe('Rainy Sundays');
  });

  it.each([
    ['an empty name', '   ', ['movie']],
    ['a name that is too long', 'x'.repeat(33), ['movie']],
    ['no formats', 'Fine', []],
    ['a built-in name in another case', 'to watch', ['movie']],
  ] as const)('refuses %s', (_label, name, types) => {
    const { result } = renderHook(() => useCollections());
    let created: SavedCollection | null = custom('sentinel');
    act(() => {
      created = result.current.createCollection(name, [...types]);
    });
    expect(created).toBeNull();
    expect(result.current.saveError).toBeNull();
  });

  it('explains the limit on collections', () => {
    seedGuest({
      ...EMPTY_COLLECTIONS,
      custom: Array.from({ length: 50 }, (_, index) => custom(`c${index}`)),
    });
    const { result } = renderHook(() => useCollections());
    act(() => {
      result.current.createCollection('One more', ['movie']);
    });
    expect(result.current.saveError).toBe('You can have up to 50 collections. Delete one to add another.');
  });

  it('explains the limit on organized titles, but allows titles already organized', () => {
    const full = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`movie-${index}`, ['to-watch']]));
    seedGuest({ ...EMPTY_COLLECTIONS, assignments: full });
    const { result } = renderHook(() => useCollections());

    act(() => result.current.toggleCollection(media('movie-new'), 'to-watch'));
    expect(result.current.saveError).toBe('You can organize up to 500 titles in collections. Remove some to add more.');
    expect(result.current.assignments['movie-new']).toBeUndefined();

    act(() => result.current.dismissSaveError());
    act(() => result.current.toggleCollection(media('movie-1'), 'watched'));
    expect(result.current.saveError).toBeNull();
    expect(result.current.assignments['movie-1']).toEqual(['watched']);
  });

  it('deleting a collection takes it off every title and forgets titles left in none', () => {
    seedGuest({
      custom: [custom('mine')],
      assignments: { 'movie-1': ['mine'], 'movie-2': ['mine', 'to-watch'] },
      media: { 'movie-1': movie, 'movie-2': media('movie-2') },
    });
    const { result } = renderHook(() => useCollections());

    act(() => result.current.deleteCollection('mine'));
    expect(result.current.assignments).toEqual({ 'movie-2': ['to-watch'] });
    expect(result.current.collections.some(({ id }) => id === 'mine')).toBe(false);
  });

  it('reads older and damaged browser data safely', () => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify([{ id: 'old', name: 'Old' }, { id: 7 }]));
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify({ 'movie-1': 'old', 'movie-2': 5 }));
    localStorage.setItem(MEDIA_KEY, 'not json');
    const { result } = renderHook(() => useCollections());

    const old = result.current.collections.find(({ id }) => id === 'old');
    expect(old?.contentTypes).toEqual(['movie', 'tv', 'music', 'book', 'game']);
    expect(result.current.assignments).toEqual({ 'movie-1': ['old'] });
    expect(result.current.collectionItems).toEqual([]);
  });
});

describe('useCollections saving to an account', () => {
  beforeEach(() => {
    auth.token = 'token-a';
  });

  async function ready(doc: CollectionsDoc = EMPTY_COLLECTIONS) {
    getCollections.mockResolvedValue({ collections: doc });
    const hook = renderHook(() => useCollections());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
  }

  it('does not save on load: only a change is worth sending', async () => {
    await ready({ ...EMPTY_COLLECTIONS, custom: [custom('mine')] });
    expect(getCollections).toHaveBeenCalledWith('token-a');
    expect(saveCollections).not.toHaveBeenCalled();
  });

  it('refuses a change while the account is loading, and after a failed load', async () => {
    getCollections.mockReturnValueOnce(new Promise(() => {}));
    const loading = renderHook(() => useCollections());
    act(() => loading.result.current.toggleCollection(movie, 'to-watch'));
    expect(loading.result.current.saveError).toBe('Your collections are still loading. Try again in a moment.');
    loading.unmount();

    getCollections.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const failed = renderHook(() => useCollections());
    await waitFor(() => expect(failed.result.current.status).toBe('error'));
    act(() => failed.result.current.toggleCollection(movie, 'to-watch'));
    expect(failed.result.current.saveError).toMatch(/couldn’t be loaded/);
    expect(saveCollections).not.toHaveBeenCalled();

    getCollections.mockResolvedValueOnce({ collections: EMPTY_COLLECTIONS });
    act(() => failed.result.current.retryLoad());
    await waitFor(() => expect(failed.result.current.status).toBe('ready'));
  });

  it('sends a change with the account token, and shows what the server kept', async () => {
    const { result } = await ready();
    const stored: CollectionsDoc = {
      ...EMPTY_COLLECTIONS,
      assignments: { 'movie-1': ['to-watch'] },
      media: { 'movie-1': { ...movie, title: 'As stored' } },
    };
    saveCollections.mockResolvedValue({ collections: stored });

    act(() => result.current.toggleCollection(movie, 'to-watch'));
    await waitFor(() => expect(result.current.collectionItems[0]?.title).toBe('As stored'));
    expect(saveCollections).toHaveBeenCalledTimes(1);
    expect(saveCollections.mock.calls[0][0]).toBe('token-a');
    expect(saveCollections.mock.calls[0][1].assignments).toEqual({ 'movie-1': ['to-watch'] });
    expect(result.current.saveError).toBeNull();
  });

  it('saves in order: changes made mid-save become one save of the newest document', async () => {
    const { result } = await ready();
    const first = deferred<{ collections: CollectionsDoc }>();
    saveCollections.mockReturnValueOnce(first.promise);

    act(() => result.current.toggleCollection(movie, 'to-watch'));
    await waitFor(() => expect(saveCollections).toHaveBeenCalledTimes(1));
    act(() => result.current.toggleCollection(media('movie-2'), 'to-watch'));
    act(() => result.current.toggleCollection(media('movie-3'), 'to-watch'));
    await act(async () => {});
    expect(saveCollections).toHaveBeenCalledTimes(1);

    echoSave();
    await act(async () => first.resolve({ collections: saveCollections.mock.calls[0][1] }));
    await waitFor(() => expect(saveCollections).toHaveBeenCalledTimes(2));
    expect(Object.keys(saveCollections.mock.calls[1][1].assignments).sort()).toEqual(['movie-1', 'movie-2', 'movie-3']);
    expect(Object.keys(result.current.assignments)).toHaveLength(3);
  });

  it('never sends one account’s document with another account’s token', async () => {
    const { result, rerender } = await ready();
    const first = deferred<{ collections: CollectionsDoc }>();
    saveCollections.mockReturnValueOnce(first.promise);
    act(() => result.current.toggleCollection(movie, 'to-watch'));
    await waitFor(() => expect(saveCollections).toHaveBeenCalledTimes(1));
    act(() => result.current.toggleCollection(media('movie-2'), 'to-watch'));

    const other = { ...EMPTY_COLLECTIONS, custom: [custom('theirs')] };
    getCollections.mockResolvedValue({ collections: other });
    auth.token = 'token-b';
    rerender();
    await waitFor(() => expect(result.current.collections.some(({ id }) => id === 'theirs')).toBe(true));

    await act(async () => first.resolve({ collections: EMPTY_COLLECTIONS }));
    expect(saveCollections).toHaveBeenCalledTimes(1);
    expect(saveCollections.mock.calls[0][0]).toBe('token-a');
    expect(result.current.collections.some(({ id }) => id === 'theirs')).toBe(true);
    expect(result.current.saveError).toBeNull();
  });

  it('keeps the change and offers a retry when a save fails', async () => {
    const { result } = await ready();
    saveCollections.mockRejectedValueOnce(new ApiError(500, 'boom'));

    act(() => result.current.toggleCollection(movie, 'to-watch'));
    await waitFor(() => expect(result.current.saveError).toBe('Couldn’t save your collection changes.'));
    expect(result.current.assignments).toEqual({ 'movie-1': ['to-watch'] });

    echoSave();
    await act(async () => result.current.retrySave());
    expect(saveCollections).toHaveBeenCalledTimes(2);
    expect(saveCollections.mock.calls[1][1].assignments).toEqual({ 'movie-1': ['to-watch'] });
    expect(result.current.saveError).toBeNull();
  });

  it('says so when the server left a change out, and shows what it kept', async () => {
    const { result } = await ready();
    saveCollections.mockResolvedValue({ collections: EMPTY_COLLECTIONS });

    act(() => result.current.toggleCollection(movie, 'to-watch'));
    await waitFor(() =>
      expect(result.current.saveError).toBe('Some collection changes couldn’t be saved and were undone.'),
    );
    expect(result.current.assignments).toEqual({});
  });

  it('ends the session when a load or a save answers 401', async () => {
    const { result } = await ready();
    saveCollections.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    act(() => result.current.toggleCollection(movie, 'to-watch'));
    await waitFor(() => expect(auth.endSession).toHaveBeenCalledTimes(1));
    expect(result.current.saveError).toBeNull();

    getCollections.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    renderHook(() => useCollections());
    await waitFor(() => expect(auth.endSession).toHaveBeenCalledTimes(2));
  });

  it('drops an error when the account changes', async () => {
    const { result, rerender } = await ready();
    saveCollections.mockRejectedValue(new ApiError(500, 'boom'));
    act(() => result.current.toggleCollection(movie, 'to-watch'));
    await waitFor(() => expect(result.current.saveError).not.toBeNull());

    auth.token = null;
    rerender();
    expect(result.current.saveError).toBeNull();
  });
});

describe('useCollections guest merge at sign-in', () => {
  const guest: CollectionsDoc = {
    custom: [custom('guest-trip', 'Trip')],
    assignments: { 'movie-1': ['guest-trip', 'to-watch'] },
    media: { 'movie-1': movie },
  };

  function signIn(accountDoc: CollectionsDoc = EMPTY_COLLECTIONS) {
    seedGuest(guest);
    getCollections.mockResolvedValue({ collections: accountDoc });
    const hook = renderHook(() => useCollections());
    auth.token = 'token-a';
    hook.rerender();
    return hook;
  }

  it('sends the merged document, then clears the browser copy once the server kept it all', async () => {
    echoSave();
    const account: CollectionsDoc = {
      custom: [custom('acct-trip', 'trip')],
      assignments: { 'movie-1': ['watched'] },
      media: { 'movie-1': movie },
    };
    const { result } = signIn(account);

    await waitFor(() => expect(saveCollections).toHaveBeenCalledTimes(1));
    const [token, sent] = saveCollections.mock.calls[0];
    expect(token).toBe('token-a');
    // Same-named collections become one, and the account's status choice stands.
    expect(sent.custom.map(({ id }) => id)).toEqual(['acct-trip']);
    expect(sent.assignments['movie-1']).toEqual(['watched', 'acct-trip']);

    await waitFor(() => expect(assignments()).toEqual({}));
    expect(JSON.parse(localStorage.getItem(CUSTOM_KEY)!)).toEqual([]);
    expect(result.current.saveError).toBeNull();
    expect(result.current.assignments['movie-1']).toEqual(['watched', 'acct-trip']);
  });

  it('does not save when the guest has nothing organized', async () => {
    getCollections.mockResolvedValue({ collections: EMPTY_COLLECTIONS });
    const { result, rerender } = renderHook(() => useCollections());
    auth.token = 'token-a';
    rerender();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(saveCollections).not.toHaveBeenCalled();
  });

  it('keeps the browser copy when the server dropped part of the merge', async () => {
    saveCollections.mockResolvedValue({ collections: EMPTY_COLLECTIONS });
    const { result } = signIn();

    await waitFor(() =>
      expect(result.current.saveError).toBe(
        'Some collections from this browser couldn’t be added to your account. They’re still saved in this browser.',
      ),
    );
    expect(assignments()).toEqual(guest.assignments);
  });

  it('keeps the browser copy when the merge save fails', async () => {
    saveCollections.mockRejectedValue(new ApiError(500, 'boom'));
    const { result } = signIn();

    await waitFor(() => expect(result.current.saveError).toBe('Couldn’t save your collection changes.'));
    expect(assignments()).toEqual(guest.assignments);
  });

  it('refuses a merge past the account limits, leaving both sides as they were', async () => {
    const full = Array.from({ length: 50 }, (_, index) => custom(`c${index}`));
    const { result } = signIn({ ...EMPTY_COLLECTIONS, custom: full });

    await waitFor(() => expect(result.current.saveError).toMatch(/couldn’t be added: an account holds up to 50/));
    expect(saveCollections).not.toHaveBeenCalled();
    expect(result.current.collections.some(({ id }) => id === 'guest-trip')).toBe(false);
    expect(assignments()).toEqual(guest.assignments);
  });

  it('reads the guest list from storage, so another tab’s finished merge is not repeated', async () => {
    seedGuest(guest);
    const { result, rerender } = renderHook(() => useCollections());
    expect(result.current.assignments).toEqual(guest.assignments);
    seedGuest(EMPTY_COLLECTIONS);
    getCollections.mockResolvedValue({ collections: EMPTY_COLLECTIONS });
    auth.token = 'token-a';
    rerender();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(saveCollections).not.toHaveBeenCalled();
  });
});
