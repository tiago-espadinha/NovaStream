import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../services/apiService';
import { useAuth } from '../context/AuthContext';
import type { ContentType, MediaSummary } from '../types';
import { describeAccountError, isSessionEnded } from '../utils/accountErrors';
import {
  BUILT_IN_COLLECTIONS,
  EMPTY_COLLECTIONS,
  MAX_CUSTOM_COLLECTIONS,
  MAX_ORGANIZED_TITLES,
  countDropped,
  exceedsLimits,
  isEmptyCollections,
  mergeCollections,
  toSummary,
  type CollectionsDoc,
  type SavedCollection,
} from '../utils/collections';
import type { SavedListStatus } from './useFavorites';

const COLLECTIONS_KEY = 'nova-stream:collections';
const ASSIGNMENTS_KEY = 'nova-stream:collection-assignments';
const COLLECTION_MEDIA_KEY = 'nova-stream:collection-media';
const ALL_CONTENT_TYPES: ContentType[] = ['movie', 'tv', 'music', 'book', 'game'];

function readCustomCollections(): SavedCollection[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is { id: string; name: string; contentTypes?: unknown } =>
        item && typeof item.id === 'string' && typeof item.name === 'string',
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        contentTypes: Array.isArray(item.contentTypes)
          ? item.contentTypes.filter((type): type is ContentType =>
            ALL_CONTENT_TYPES.includes(type as ContentType),
          )
          : ALL_CONTENT_TYPES,
      }));
  } catch {
    return [];
  }
}

function readAssignments(): Record<string, string[]> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([id, assigned]) => {
        if (typeof assigned === 'string') return [[id, [assigned]]];
        if (Array.isArray(assigned)) return [[id, assigned.filter((item): item is string => typeof item === 'string')]];
        return [];
      }),
    );
  } catch {
    return {};
  }
}

function readCollectionMedia(): Record<string, MediaSummary> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COLLECTION_MEDIA_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, MediaSummary>
      : {};
  } catch {
    return {};
  }
}

function readGuestCollections(): CollectionsDoc {
  return { custom: readCustomCollections(), assignments: readAssignments(), media: readCollectionMedia() };
}

function writeGuestCollections(doc: CollectionsDoc) {
  try {
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(doc.custom));
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(doc.assignments));
    localStorage.setItem(COLLECTION_MEDIA_KEY, JSON.stringify(doc.media));
  } catch {
    // Keep collection changes usable for this session if browser storage is unavailable.
  }
}

/** Drops titles that left every collection, so the document doesn't grow forever. */
function pruned(doc: CollectionsDoc): CollectionsDoc {
  const assignments = Object.fromEntries(Object.entries(doc.assignments).filter(([, ids]) => ids.length > 0));
  const media = Object.fromEntries(Object.entries(doc.media).filter(([id]) => id in assignments));
  return { ...doc, assignments, media };
}

interface AccountCollections {
  token: string | null;
  doc: CollectionsDoc;
  status: SavedListStatus;
  /** Bumped by each local change; a change is what triggers a save. */
  edits: number;
}

/**
 * Guests keep collections in this browser; signed-in users keep them on their account, where
 * each change is saved in order (a change made mid-save is sent once that save finishes).
 * On sign-in, guest collections are merged into the account and cleared from the browser.
 */
export function useCollections() {
  const { token, endSession } = useAuth();
  const [guestDoc, setGuestDoc] = useState(readGuestCollections);
  const [account, setAccount] = useState<AccountCollections>({
    token: null,
    doc: EMPTY_COLLECTIONS,
    status: 'loading',
    edits: 0,
  });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  // The newest document waiting to be saved, tagged with the account it belongs to. Only the
  // newest matters: each save replaces the whole document.
  const nextSave = useRef<{ token: string; doc: CollectionsDoc } | null>(null);
  const saving = useRef(false);
  // The account whose document includes merged guest collections that are still in the browser.
  const guestMergedInto = useRef<string | null>(null);

  useEffect(() => writeGuestCollections(guestDoc), [guestDoc]);

  // An error is about the account it happened in; it doesn't survive signing in or out.
  useEffect(() => setSaveError(null), [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setAccount({ token, doc: EMPTY_COLLECTIONS, status: 'loading', edits: 0 });
    api
      .getCollections(token)
      .then(({ collections }) => {
        if (!active) return;
        // Read from storage, not memory: another tab may already have merged and cleared it.
        const guest = readGuestCollections();
        const merged = isEmptyCollections(guest) ? null : pruned(mergeCollections(collections, guest));
        if (merged && exceedsLimits(merged)) {
          setSaveError(
            `Your collections from this browser couldn’t be added: an account holds up to ${MAX_CUSTOM_COLLECTIONS} collections and ${MAX_ORGANIZED_TITLES} organized titles. They’re still saved in this browser.`,
          );
        }
        const merging = merged !== null && !exceedsLimits(merged);
        guestMergedInto.current = merging ? token : null;
        setAccount({ token, doc: merging ? merged : collections, status: 'ready', edits: merging ? 1 : 0 });
      })
      .catch((err) => {
        if (!active) return;
        setAccount((current) => ({ ...current, status: 'error' }));
        if (isSessionEnded(err)) endSession();
      });
    return () => {
      active = false;
    };
  }, [token, loadAttempt, endSession]);

  // Saves one document at a time. A save for an account that's no longer signed in is
  // dropped, so one account's collections can never be sent with another's token.
  const persist = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (nextSave.current) {
        const job = nextSave.current;
        nextSave.current = null;
        if (job.token !== tokenRef.current) continue;
        let stored: CollectionsDoc;
        try {
          stored = (await api.saveCollections(job.token, job.doc)).collections;
        } catch (err) {
          if (job.token !== tokenRef.current) continue;
          if (isSessionEnded(err)) endSession();
          else setSaveError(describeAccountError(err, 'Couldn’t save your collection changes.'));
          return;
        }
        if (job.token !== tokenRef.current) continue;
        const dropped = countDropped(job.doc, stored);
        if (dropped > 0) {
          setSaveError(
            guestMergedInto.current === job.token
              ? 'Some collections from this browser couldn’t be added to your account. They’re still saved in this browser.'
              : 'Some collection changes couldn’t be saved and were undone.',
          );
        } else {
          setSaveError(null);
          if (guestMergedInto.current === job.token) {
            guestMergedInto.current = null;
            setGuestDoc(EMPTY_COLLECTIONS);
          }
        }
        // Show what the server kept, unless a newer edit is already on its way.
        if (!nextSave.current) {
          setAccount((current) => (current.token === job.token ? { ...current, doc: stored } : current));
        }
      }
    } finally {
      saving.current = false;
    }
  }, [endSession]);

  // Keyed on the edit counter alone: a load replaces the document without counting as an
  // edit, so only local changes (and a guest merge) are saved.
  useEffect(() => {
    if (!token || account.token !== token || account.edits === 0) return;
    nextSave.current = { token, doc: account.doc };
    persist();
  }, [account.edits]);

  const accountReady = Boolean(token) && account.token === token && account.status === 'ready';
  const doc = token ? (account.token === token ? account.doc : EMPTY_COLLECTIONS) : guestDoc;
  const status: SavedListStatus = token ? (account.token === token ? account.status : 'loading') : 'ready';

  /** Applies a change to whichever document is active; refused while an account's isn't loaded. */
  const update = useCallback(
    (change: (current: CollectionsDoc) => CollectionsDoc) => {
      if (!token) {
        setGuestDoc((current) => pruned(change(current)));
        return true;
      }
      if (!accountReady) {
        setSaveError(
          account.status === 'error'
            ? 'Your collections couldn’t be loaded, so they can’t be changed yet. Open Saved and choose Try again.'
            : 'Your collections are still loading. Try again in a moment.',
        );
        return false;
      }
      setAccount((current) => ({ ...current, doc: pruned(change(current.doc)), edits: current.edits + 1 }));
      return true;
    },
    [token, accountReady, account.status],
  );

  const collections = useMemo(() => [...BUILT_IN_COLLECTIONS, ...doc.custom], [doc.custom]);
  const collectionItems = useMemo(() => Object.values(doc.media), [doc.media]);

  const collectionsFor = useCallback(
    (type: ContentType) => collections.filter((collection) => collection.contentTypes.includes(type)),
    [collections],
  );

  const toggleCollection = useCallback((item: MediaSummary, collectionId: string) => {
    const collection = collections.find(({ id }) => id === collectionId);
    if (!collection || !collection.contentTypes.includes(item.type)) return;
    const organized = Object.keys(doc.assignments).length;
    if (!(item.id in doc.assignments) && organized >= MAX_ORGANIZED_TITLES) {
      setSaveError(`You can organize up to ${MAX_ORGANIZED_TITLES} titles in collections. Remove some to add more.`);
      return;
    }

    update((current) => {
      const existing = current.assignments[item.id] ?? [];
      const removing = existing.includes(collectionId);
      let next = removing
        ? existing.filter((id) => id !== collectionId)
        : [...existing, collectionId];
      if (!removing && collection.exclusiveGroup) {
        const exclusiveIds = new Set(collections
          .filter(({ exclusiveGroup }) => exclusiveGroup === collection.exclusiveGroup)
          .map(({ id }) => id));
        next = next.filter((id) => !exclusiveIds.has(id) || id === collectionId);
      }
      return {
        ...current,
        assignments: { ...current.assignments, [item.id]: next },
        media: { ...current.media, [item.id]: toSummary(item) },
      };
    });
  }, [collections, doc.assignments, update]);

  const createCollection = useCallback((name: string, contentTypes: ContentType[]) => {
    const normalizedName = name.trim();
    if (!normalizedName || !contentTypes.length || collections.some(
      (collection) => collection.name.toLowerCase() === normalizedName.toLowerCase(),
    )) return null;
    if (doc.custom.length >= MAX_CUSTOM_COLLECTIONS) {
      setSaveError(`You can have up to ${MAX_CUSTOM_COLLECTIONS} collections. Delete one to add another.`);
      return null;
    }
    const id = `custom-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
    const collection = { id, name: normalizedName, contentTypes };
    return update((current) => ({ ...current, custom: [...current.custom, collection] })) ? collection : null;
  }, [collections, doc.custom.length, update]);

  const deleteCollection = useCallback((collectionId: string) => {
    update((current) => ({
      ...current,
      custom: current.custom.filter(({ id }) => id !== collectionId),
      assignments: Object.fromEntries(
        Object.entries(current.assignments).map(([itemId, ids]) => [itemId, ids.filter((id) => id !== collectionId)]),
      ),
    }));
  }, [update]);

  return {
    collections,
    collectionItems,
    assignments: doc.assignments,
    collectionsFor,
    toggleCollection,
    createCollection,
    deleteCollection,
    status,
    retryLoad: () => setLoadAttempt((n) => n + 1),
    saveError,
    retrySave: () => {
      if (!token || account.token !== token) return;
      nextSave.current = { token, doc: account.doc };
      persist();
    },
    dismissSaveError: () => setSaveError(null),
  };
}
