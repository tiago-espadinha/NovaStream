import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccountNotices } from './components/AccountNotices/AccountNotices';
import { Header } from './components/Header/Header';
import { SiteFooter } from './components/SiteFooter/SiteFooter';
import { USE_MOCK } from './config';
import { useAuth } from './context/useAuth';
import { mockContent } from './data/mockData';
import { useAccountNotices } from './hooks/useAccountNotices';
import { useCollections } from './hooks/useCollections';
import { useContentFilters } from './hooks/useContentFilters';
import { useDetailNavigation } from './hooks/useDetailNavigation';
import { useFavorites } from './hooks/useFavorites';
import { useHomeShelves } from './hooks/useHomeShelves';
import { useLiveSearch } from './hooks/useLiveSearch';
import { useTrending } from './hooks/useTrending';
import { AccountSettings } from './screens/account/AccountSettings';
import { LoginModal } from './screens/account/LoginModal';
import { DetailOverlay } from './screens/detail/DetailOverlay';
import { HomeScreen } from './screens/home/HomeScreen';
import { SavedPage } from './screens/saved/SavedPage';
import type { ContentType, MusicKind } from './types';

export default function App() {
  // TMDb content comes back in the active language, so loads below re-run when it changes.
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const [activeType, setActiveType] = useState<ContentType | 'all'>('all');
  const [musicKind, setMusicKind] = useState<MusicKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);

  const { user, status: sessionStatus, refreshUser } = useAuth();

  // Signing out anywhere (another tab, an expired session) closes account settings for good,
  // rather than leaving them open or reopening them at the next sign-in.
  if (sessionStatus === 'signedOut' && accountModalOpen) setAccountModalOpen(false);
  const favorites = useFavorites();
  const { isFavorite, toggleFavorite, savedMedia } = favorites;
  const collections = useCollections();
  const trending = useTrending(!USE_MOCK, language);
  const isSavedPage = window.location.pathname.replace(/\/$/, '') === '/saved';

  // Tabs, history, and screen readers name the page by its title.
  useEffect(() => {
    document.title = isSavedPage ? t('app.savedPageTitle') : t('app.pageTitle');
  }, [isSavedPage, t, language]);

  const search = useLiveSearch({ query, activeType, musicKind, language });
  const filters = useContentFilters({
    items: USE_MOCK ? mockContent : search.results,
    query,
    activeType,
    musicKind,
    onMusicKindChange: setMusicKind,
  });
  const navigation = useDetailNavigation(language);

  const trimmedQuery = query.trim();
  const shelves = useHomeShelves({
    trimmedQuery,
    activeType,
    displayedItems: filters.displayedItems,
    savedMedia,
    trending,
  });
  const notices = useAccountNotices({
    favorites,
    collections,
    accountDeleted,
    onDismissAccountDeleted: () => setAccountDeleted(false),
    onOpenAuth: () => setAuthModalOpen(true),
  });

  // The Saved page needs both lists: it's only ready when both are, and an error in either is an error.
  const savedStatuses = [favorites.status, collections.status];
  const savedStatus = savedStatuses.includes('error')
    ? 'error'
    : savedStatuses.includes('loading')
      ? 'loading'
      : 'ready';

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t('app.skipToContent')}
      </a>
      <Header
        activeType={activeType}
        onTypeChange={setActiveType}
        query={query}
        onQueryChange={setQuery}
        user={user}
        sessionStatus={sessionStatus}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenAccount={() => setAccountModalOpen(true)}
        savedPage={isSavedPage}
      />

      {isSavedPage ? (
        <main id="main-content" tabIndex={-1}>
          <AccountNotices notices={notices} />
          <SavedPage
            status={savedStatus}
            signedIn={sessionStatus !== 'signedOut'}
            onRetry={() => {
              if (favorites.status === 'error') favorites.retryLoad();
              if (collections.status === 'error') collections.retryLoad();
              if (sessionStatus === 'unreachable') refreshUser();
            }}
            onSignIn={() => setAuthModalOpen(true)}
            favoriteItems={savedMedia}
            collectionItems={collections.collectionItems}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onSelect={navigation.select}
            collections={collections.collections}
            assignments={collections.assignments}
            onCreateCollection={collections.createCollection}
            deleteCollection={collections.deleteCollection}
            toggleCollection={collections.toggleCollection}
          />
        </main>
      ) : (
        <HomeScreen
          notices={notices}
          trimmedQuery={trimmedQuery}
          awaitingLiveQuery={!USE_MOCK && !trimmedQuery}
          activeType={activeType}
          search={search}
          filters={filters}
          shelves={shelves}
          trending={trending}
          savedCount={savedMedia.length}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
          onSelect={navigation.select}
          onClearQuery={() => setQuery('')}
        />
      )}

      <SiteFooter />

      <DetailOverlay
        navigation={navigation}
        title={[...search.results, ...savedMedia].find((item) => item.id === navigation.selectedId)?.title}
        collections={collections}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
        onSearchTerm={setQuery}
      />

      {authModalOpen && <LoginModal onClose={() => setAuthModalOpen(false)} />}
      {accountModalOpen && sessionStatus !== 'signedOut' && (
        <AccountSettings
          onClose={() => setAccountModalOpen(false)}
          onDeleted={() => {
            setAccountModalOpen(false);
            setAccountDeleted(true);
          }}
        />
      )}
    </>
  );
}
