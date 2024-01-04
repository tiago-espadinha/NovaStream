import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          {t('saved.library')}
          {ready && (
            <>
              {' '}<span aria-hidden="true">·</span> {t('shelf.titles', { count: items.length })}
            </>
          )}
        </p>
        <h1>{t('common.saved')}</h1>
      </div>

      <div className="saved-layout">
        <aside className="collection-sidebar" aria-label={t('saved.collectionsLabel')}>
          <div className="collection-list" role="group" aria-label={t('saved.showCollection')}>
            <button
              type="button"
              className={`collection-link${activeCollection === 'all' ? ' active' : ''}`}
              aria-pressed={activeCollection === 'all'}
              onClick={() => setActiveCollection('all')}
            >
              <span>{t('saved.favorites')}</span>
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
            <h2>{selectedCollection?.name ?? t('saved.favorites')}</h2>
            {ready && <span>{t('shelf.titles', { count: visibleItems.length })}</span>}
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
            <Spinner label={t('saved.loading')} />
          ) : status === 'error' ? (
            // Never an empty state here: the list may well have titles we couldn't fetch.
            <div className="notice notice-error">
              <p role="alert">
                <StatusIcon tone="error" />
                {t('saved.loadFailed')}
              </p>
              <button type="button" className="btn btn-ghost" onClick={onRetry}>
                {t('common.tryAgain')}
              </button>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="empty-state saved-empty">
              <p>
                {items.length === 0
                  ? t('saved.emptyNone')
                  : activeCollection === 'all'
                    ? t('saved.emptyFavorites')
                    : t('saved.emptyCollection')}
              </p>
              {!signedIn && items.length === 0 && (
                <>
                  <p>{t('saved.guestNote')}</p>
                  <div className="empty-actions">
                    <button type="button" className="btn btn-ghost" onClick={onSignIn}>
                      {t('common.signIn')}
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
          <h3 id="new-collection-title">{t('collections.newCollection')}</h3>
          <p className="new-collection-intro">{t('saved.newIntro')}</p>
          <label className="field-label" htmlFor="new-collection-name">
            {t('common.name')}
          </label>
          <input
            id="new-collection-name"
            value={newCollectionName}
            onChange={(event) => {
              setNewCollectionName(event.target.value);
              setCreatedName(null);
            }}
            placeholder={t('collections.namePlaceholder')}
            maxLength={MAX_COLLECTION_NAME}
            disabled={!ready}
            aria-invalid={problem?.field === 'name'}
            aria-describedby="new-collection-status"
          />
          <fieldset className="toggle-group" disabled={!ready}>
            <legend>{t('collections.formats')}</legend>
            <FormatChips selected={selectedTypes} onChange={setSelectedTypes} />
          </fieldset>
          <p
            id="new-collection-status"
            className={formTone === 'warning' ? 'field-error' : formTone === 'success' ? 'field-success' : 'field-hint'}
            aria-live="polite"
          >
            {formTone && <StatusIcon tone={formTone} />}
            {!ready
              ? t('saved.unavailable')
              : formProblem ?? (createdName
                ? t('collections.created', { name: createdName })
                : t('collections.nameHint', { max: MAX_COLLECTION_NAME }))}
          </p>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!ready || !newCollectionName.trim() || Boolean(formProblem)}
          >
            {t('saved.create')}
          </button>
        </form>
      </div>
    </section>
  );
}