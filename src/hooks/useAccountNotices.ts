import { useTranslation } from 'react-i18next';
import type { AccountNotice } from '../components/AccountNotices/AccountNotices';
import { useAuth } from '../context/useAuth';
import type { useCollections } from './useCollections';
import type { useFavorites } from './useFavorites';

interface AccountNoticeOptions {
  favorites: ReturnType<typeof useFavorites>;
  collections: ReturnType<typeof useCollections>;
  accountDeleted: boolean;
  onDismissAccountDeleted: () => void;
  onOpenAuth: () => void;
}

/** The messages that float over any page after an account action, most urgent first. */
export function useAccountNotices({
  favorites,
  collections,
  accountDeleted,
  onDismissAccountDeleted,
  onOpenAuth,
}: AccountNoticeOptions): AccountNotice[] {
  const { t } = useTranslation();
  const { sessionNotice, clearSessionNotice } = useAuth();
  const notices: AccountNotice[] = [];

  if (sessionNotice) {
    notices.push({
      id: 'session',
      message: sessionNotice,
      tone: 'warning',
      action: {
        label: t('common.signIn'),
        onClick: () => {
          clearSessionNotice();
          onOpenAuth();
        },
      },
      onDismiss: clearSessionNotice,
    });
  }
  if (accountDeleted) {
    notices.push({
      id: 'account-deleted',
      message: t('app.accountDeleted'),
      tone: 'success',
      onDismiss: onDismissAccountDeleted,
    });
  }
  if (favorites.notice) {
    notices.push({
      id: 'favorites',
      message: favorites.notice.message,
      tone: favorites.notice.error ? 'error' : 'success',
      action: favorites.notice.offerSignIn
        ? {
            label: t('common.signIn'),
            onClick: () => {
              favorites.dismissNotice();
              onOpenAuth();
            },
          }
        : undefined,
      onDismiss: favorites.dismissNotice,
    });
  }
  if (collections.saveError) {
    notices.push({
      id: 'collections',
      message: collections.saveError,
      tone: 'error',
      action:
        collections.status === 'ready' ? { label: t('common.tryAgain'), onClick: collections.retrySave } : undefined,
      onDismiss: collections.dismissSaveError,
    });
  }
  return notices;
}
