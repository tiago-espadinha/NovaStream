import i18n from '../i18n';
import type { ContentType, MediaSummary } from '../types';

export interface SavedCollection {
  id: string;
  name: string;
  contentTypes: ContentType[];
  builtIn?: boolean;
  exclusiveGroup?: string;
}

// Names are read through getters so they follow the active language.
// The server keeps a copy of these ids (BUILT_IN_COLLECTION_IDS) to validate assignments.
export const BUILT_IN_COLLECTIONS: SavedCollection[] = [
  { id: 'to-watch', get name() { return i18n.t('collections.builtIn.toWatch'); }, contentTypes: ['movie', 'tv'], builtIn: true, exclusiveGroup: 'watch' },
  { id: 'watched', get name() { return i18n.t('collections.builtIn.watched'); }, contentTypes: ['movie', 'tv'], builtIn: true, exclusiveGroup: 'watch' },
  { id: 'to-read', get name() { return i18n.t('collections.builtIn.toRead'); }, contentTypes: ['book'], builtIn: true, exclusiveGroup: 'read' },
  { id: 'read', get name() { return i18n.t('collections.builtIn.read'); }, contentTypes: ['book'], builtIn: true, exclusiveGroup: 'read' },
  { id: 'to-listen', get name() { return i18n.t('collections.builtIn.toListen'); }, contentTypes: ['music'], builtIn: true, exclusiveGroup: 'listen' },
  { id: 'listened', get name() { return i18n.t('collections.builtIn.listened'); }, contentTypes: ['music'], builtIn: true, exclusiveGroup: 'listen' },
  { id: 'to-play', get name() { return i18n.t('collections.builtIn.toPlay'); }, contentTypes: ['game'], builtIn: true, exclusiveGroup: 'play' },
  { id: 'playing', get name() { return i18n.t('collections.builtIn.playing'); }, contentTypes: ['game'], builtIn: true, exclusiveGroup: 'play' },
  { id: 'played', get name() { return i18n.t('collections.builtIn.played'); }, contentTypes: ['game'], builtIn: true, exclusiveGroup: 'play' },
];

/** Everything a user has organized: their own collections, which titles are in which, and a card snapshot per title. */
export interface CollectionsDoc {
  custom: SavedCollection[];
  assignments: Record<string, string[]>;
  media: Record<string, MediaSummary>;
}

export const EMPTY_COLLECTIONS: CollectionsDoc = { custom: [], assignments: {}, media: {} };

// Same limits the server enforces (server/src/utils/validate.js), so nothing is silently dropped there.
export const MAX_CUSTOM_COLLECTIONS = 50;
export const MAX_ORGANIZED_TITLES = 500;
export const MAX_COLLECTION_NAME = 32;

export interface CollectionProblem {
  field: 'name' | 'formats';
  message: string;
}

/**
 * What stops a new collection from being created, or null. An empty name has no message:
 * the create button just stays disabled until one is typed.
 */
export function newCollectionProblem(
  name: string,
  contentTypes: ContentType[],
  collections: SavedCollection[],
): CollectionProblem | null {
  const trimmed = name.trim().toLowerCase();
  const duplicate = trimmed && collections.find((collection) => collection.name.toLowerCase() === trimmed);
  if (duplicate) return { field: 'name', message: i18n.t('collections.duplicateName', { name: duplicate.name }) };
  if (contentTypes.length === 0) return { field: 'formats', message: i18n.t('collections.pickFormat') };
  return null;
}

export function exceedsLimits(doc: CollectionsDoc): boolean {
  return doc.custom.length > MAX_CUSTOM_COLLECTIONS || Object.keys(doc.assignments).length > MAX_ORGANIZED_TITLES;
}

/** How many collections and title assignments the server left out of what was sent. */
export function countDropped(sent: CollectionsDoc, stored: CollectionsDoc): number {
  const storedIds = new Set(stored.custom.map(({ id }) => id));
  const droppedCollections = sent.custom.filter(({ id }) => !storedIds.has(id)).length;
  const droppedTitles = Object.keys(sent.assignments).filter((id) => !(id in stored.assignments)).length;
  return droppedCollections + droppedTitles;
}

/** Card fields only: collections keep a snapshot to render, never a full detail record. */
export function toSummary(item: MediaSummary): MediaSummary {
  const { id, title, type, rating, genres, tags, releaseYear, posterUrl, gradientFrom, gradientTo, artist, musicKind, playStats } = item;
  return { id, title, type, rating, genres, tags, releaseYear, posterUrl, gradientFrom, gradientTo, artist, musicKind, playStats };
}

/** Adds a collection and, when given one it can hold, a title to it in the same change. */
export function addCollection(doc: CollectionsDoc, collection: SavedCollection, item?: MediaSummary): CollectionsDoc {
  const next = { ...doc, custom: [...doc.custom, collection] };
  if (!item || !collection.contentTypes.includes(item.type)) return next;
  return {
    ...next,
    assignments: { ...doc.assignments, [item.id]: [...(doc.assignments[item.id] ?? []), collection.id] },
    media: { ...doc.media, [item.id]: toSummary(item) },
  };
}

export function isEmptyCollections(doc: CollectionsDoc): boolean {
  return doc.custom.length === 0 && Object.values(doc.assignments).every((ids) => ids.length === 0);
}

const groupOf = new Map(BUILT_IN_COLLECTIONS.map(({ id, exclusiveGroup }) => [id, exclusiveGroup]));

/**
 * Folds a guest's collections into an account's. Same-named custom collections become one
 * (keeping the account's), assignments are combined, and where both sides chose a different
 * status in an exclusive group (e.g. To Watch vs Watched), the account's choice stands.
 */
export function mergeCollections(account: CollectionsDoc, guest: CollectionsDoc): CollectionsDoc {
  const accountIdByName = new Map(account.custom.map(({ id, name }) => [name.toLowerCase(), id]));
  const renamed = new Map<string, string>();
  const custom = [...account.custom];
  for (const collection of guest.custom) {
    const existing = accountIdByName.get(collection.name.toLowerCase());
    if (existing) renamed.set(collection.id, existing);
    else custom.push(collection);
  }

  const assignments = { ...account.assignments };
  const media = { ...account.media };
  for (const [itemId, guestIds] of Object.entries(guest.assignments)) {
    const current = assignments[itemId] ?? [];
    const takenGroups = new Set(current.map((id) => groupOf.get(id)).filter(Boolean));
    const additions = guestIds
      .map((id) => renamed.get(id) ?? id)
      .filter((id) => !current.includes(id) && !takenGroups.has(groupOf.get(id)));
    if (!additions.length) continue;
    assignments[itemId] = [...current, ...additions];
    if (!media[itemId] && guest.media[itemId]) media[itemId] = guest.media[itemId];
  }
  return { custom, assignments, media };
}
