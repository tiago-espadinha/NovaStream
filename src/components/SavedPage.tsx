import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { ContentType, MediaSummary } from '../types';
import { MAX_COLLECTION_NAME, newCollectionProblem, type SavedCollection } from '../utils/collections';
import { ContentCard } from './ContentCard';
import { CONTENT_TYPES, FormatChips } from './FormatChips';
import { DeleteCollection } from './DeleteCollection';
import Spinner from './Spinner';
import { StatusIcon } from './StatusIcon';
import type { SavedListStatus } from '../hooks/useFavorites';

interface SavedPageProps {
  /** Whether the favorites list has loaded; guests' local list is always ready. */
  status: SavedListStatus;
  signedIn: boolean;
  onRetry: () => void;
  onSignIn: () => void;
  favoriteItems: MediaSummary[];
  collectionItems: MediaSummary[];
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (item: MediaSummary) => void;
  onSelect: (id: string) => void;
  collections: SavedCollection[];
  assignments: Record<string, string[]>;
  onCreateCollection: (name: string, contentTypes: ContentType[]) => SavedCollection | null;
  deleteCollection: (id: string) => void;
  toggleCollection: (item: MediaSummary, id: string) => void;
}

export function SavedPage({
  status,
  signedIn,
  onRetry,
  onSignIn,
  favoriteItems,
  collectionItems,
  isFavorite,
  onToggleFavorite,
  onSelect,
  collections,
  assignments,
  onCreateCollection,
  deleteCollection,
  toggleCollection,
}: SavedPageProps) {
  // Counts are only shown once the lists have loaded; "0" while loading or failed would be false.
  const ready = status === 'ready';
  const [activeCollection, setActiveCollection] = useState('all');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(CONTENT_TYPES);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const items = useMemo(() => {
    const byId = new Map(collectionItems.map((item) => [item.id, item]));
    favoriteItems.forEach((item) => byId.set(item.id, item));
    return [...byId.values()];
  }, [collectionItems, favoriteItems]);
  const visibleItems = useMemo(
    () => activeCollection === 'all'
      ? favoriteItems
      : items.filter((item) => (assignments[item.id] ?? []).includes(activeCollection)),
    [activeCollection, assignments, favoriteItems, items],
  );

  const selectedCollection = collections.find((collection) => collection.id === activeCollection);
  const trimmedName = newCollectionName.trim();
  const problem = newCollectionProblem(newCollectionName, selectedTypes, collections);
  const formProblem = problem?.message ?? null;
  const formTone = formProblem ? 'warning' : createdName && ready ? 'success' : null;

  const createCollection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const collection = onCreateCollection(trimmedName, selectedTypes);
    if (!collection) return;
    setNewCollectionName('');
    setSelectedTypes(CONTENT_TYPES);
    setCreatedName(collection.name);
    setActiveCollection(collection.id);
  };

  return (
    <section className="saved-page">
      <div className="saved-heading">
        <p className="eyebrow">
          Your library
          {ready && (
            <>
              {' '}<span aria-hidden="true">·</span> {items.length} {items.length === 1 ? 'title' : 'titles'}
            </>
          )}
        </p>
        <h1>Saved</h1>
      </div>

      <div className="saved-layout">
        <aside className="collection-sidebar" aria-label="Saved collections">
          <div className="collection-list" role="group" aria-label="Show collection">
            <button
              type="button"
              className={`collection-link${activeCollection === 'all' ? ' active' : ''}`}
              aria-pressed={activeCollection === 'all'}
              onClick={() => setActiveCollection('all')}
            >
              <span>Favorites</span>
              {ready && <span className="collection-count">{favoriteItems.length}</span>}
            </button>
            {collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                className={`collection-link${activeCollection === collection.id ? ' active' : ''}`}
                aria-pressed={activeCollection === collection.id}
                onClick={() => setActiveCollection(collection.id)}
              >
                <span>{collection.name}</span>
                {ready && (
                  <span className="collection-count">
                    {items.filter((item) => (assignments[item.id] ?? []).includes(collection.id)).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        <div className="saved-results">
          <div className="saved-results-heading">
            <h2>{selectedCollection?.name ?? 'Favorites'}</h2>
            {ready && <span>{visibleItems.length} {visibleItems.length === 1 ? 'title' : 'titles'}</span>}
            {selectedCollection && !selectedCollection.builtIn && (
              <DeleteCollection
                key={selectedCollection.id}
                name={selectedCollection.name}
                onDelete={() => {
                  deleteCollection(selectedCollection.id);
                  setActiveCollection('all');
                  document.querySelector<HTMLElement>('.collection-link')?.focus();
                }}
              />
            )}
          </div>
          {status === 'loading' ? (
            <Spinner label="Loading your saved titles…" />
          ) : status === 'error' ? (
            // Never an empty state here: the list may well have titles we couldn't fetch.
            <div className="notice notice-error">
              <p role="alert">
                <StatusIcon tone="error" />
                Couldn’t load your saved titles. They’re safe on your account.
              </p>
              <button type="button" className="btn btn-ghost" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="empty-state saved-empty">
              <p>
                {items.length === 0
                  ? 'Your saved titles will appear here. Use the heart on any title to add it to Favorites.'
                  : activeCollection === 'all'
                    ? 'No favorites yet. Add titles to a collection from their detail view or the collection menu on a saved card.'
                    : 'Nothing in this collection yet. Add titles from their detail view or a saved card.'}
              </p>
              {!signedIn && items.length === 0 && (
                <>
                  <p>As a guest, what you save stays in this browser. Sign in to keep it on your account across devices.</p>
                  <div className="empty-actions">
                    <button type="button" className="btn btn-ghost" onClick={onSignIn}>
                      Sign in
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <ul className="grid">
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <ContentCard
                    item={item}
                    favorite={isFavorite(item.id)}
                    onToggleFavorite={onToggleFavorite}
                    onSelect={onSelect}
                    collectionIds={assignments[item.id] ?? []}
                    collectionOptions={collections.filter((collection) => collection.contentTypes.includes(item.type))}
                    onToggleCollection={(id) => toggleCollection(item, id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <form className="new-collection" onSubmit={createCollection} aria-labelledby="new-collection-title">
          <h3 id="new-collection-title">New collection</h3>
          <p className="new-collection-intro">Group titles your way — a mood, a trip, a club pick.</p>
          <label className="field-label" htmlFor="new-collection-name">
            Name
          </label>
          <input
            id="new-collection-name"
            value={newCollectionName}
            onChange={(event) => {
              setNewCollectionName(event.target.value);
              setCreatedName(null);
            }}
            placeholder="e.g. Rainy Sundays"
            maxLength={MAX_COLLECTION_NAME}
            disabled={!ready}
            aria-invalid={problem?.field === 'name'}
            aria-describedby="new-collection-status"
          />
          <fieldset className="toggle-group" disabled={!ready}>
            <legend>For</legend>
            <FormatChips selected={selectedTypes} onChange={setSelectedTypes} />
          </fieldset>
          <p
            id="new-collection-status"
            className={formTone === 'warning' ? 'field-error' : formTone === 'success' ? 'field-success' : 'field-hint'}
            aria-live="polite"
          >
            {formTone && <StatusIcon tone={formTone} />}
            {!ready
              ? 'Collections are unavailable until your library loads.'
              : formProblem ?? (createdName ? `Created “${createdName}”.` : `Up to ${MAX_COLLECTION_NAME} characters.`)}
          </p>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!ready || !newCollectionName.trim() || Boolean(formProblem)}
          >
            Create collection
          </button>
        </form>
      </div>
    </section>
  );
}