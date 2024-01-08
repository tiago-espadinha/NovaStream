import type { DetailNavigation } from '../../hooks/useDetailNavigation';
import type { useCollections } from '../../hooks/useCollections';
import type { MediaSummary } from '../../types';
import { DetailStatus } from './DetailStatus';
import { MediaDetail } from './MediaDetail';

interface DetailOverlayProps {
  navigation: DetailNavigation;
  /** Known from the card that opened the detail, so a failed lookup can still name the title. */
  title: string | undefined;
  collections: ReturnType<typeof useCollections>;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (media: MediaSummary) => void;
  onSearchTerm: (query: string) => void;
}

export function DetailOverlay({
  navigation,
  title,
  collections,
  isFavorite,
  onToggleFavorite,
  onSearchTerm,
}: DetailOverlayProps) {
  const { selectedId, detail, loading, error, backTo, returnedHere } = navigation;
  if (!selectedId) return null;

  return (
    <>
      {(loading || error) && (
        <DetailStatus
          title={title}
          error={error}
          onRetry={navigation.retry}
          backTo={backTo}
          onBack={navigation.back}
          onClose={() => navigation.select(null)}
        />
      )}
      {detail && (
        <MediaDetail
          // A new dialog per title, so focus moves into it as it does when a card opens one.
          key={detail.id}
          item={detail}
          favorite={isFavorite(detail.id)}
          onToggleFavorite={onToggleFavorite}
          isFavorite={isFavorite}
          onOpenRelated={navigation.openRelated}
          backTo={backTo}
          onBack={navigation.back}
          initialAlbums={returnedHere?.albums}
          returnFocusTo={returnedHere?.openedId}
          collections={collections.collectionsFor(detail.type)}
          allCollections={collections.collections}
          collectionIds={collections.assignments[detail.id] ?? []}
          collectionsReady={collections.status === 'ready'}
          onToggleCollection={(collectionId) => collections.toggleCollection(detail, collectionId)}
          onCreateCollection={(name, contentTypes) => collections.createCollection(name, contentTypes, detail)}
          onSearchTerm={(searchQuery) => {
            onSearchTerm(searchQuery);
            navigation.select(null);
          }}
          onClose={() => navigation.select(null)}
        />
      )}
    </>
  );
}
