// @vitest-environment jsdom
import '../helpers/dom';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountNotices } from '../../src/hooks/useAccountNotices';
import type { useCollections } from '../../src/hooks/useCollections';
import type { useFavorites } from '../../src/hooks/useFavorites';

const auth = vi.hoisted(() => ({ sessionNotice: null as string | null, clearSessionNotice: vi.fn() }));

vi.mock('../../src/context/useAuth', () => ({ useAuth: () => auth }));

type Favorites = ReturnType<typeof useFavorites>;
type Collections = ReturnType<typeof useCollections>;

function notices({
  favorites = {},
  collections = {},
  accountDeleted = false,
}: {
  favorites?: Partial<Favorites>;
  collections?: Partial<Collections>;
  accountDeleted?: boolean;
} = {}) {
  const onOpenAuth = vi.fn();
  const onDismissAccountDeleted = vi.fn();
  const dismissNotice = vi.fn();
  const dismissSaveError = vi.fn();
  const retrySave = vi.fn();
  const { result } = renderHook(() =>
    useAccountNotices({
      favorites: { notice: null, dismissNotice, ...favorites } as Favorites,
      collections: { saveError: null, status: 'ready', dismissSaveError, retrySave, ...collections } as Collections,
      accountDeleted,
      onDismissAccountDeleted,
      onOpenAuth,
    }),
  );
  return { list: result.current, onOpenAuth, onDismissAccountDeleted, dismissNotice, dismissSaveError, retrySave };
}

beforeEach(() => {
  auth.sessionNotice = null;
  auth.clearSessionNotice.mockReset();
});

describe('useAccountNotices', () => {
  it('has nothing to say by default', () => {
    expect(notices().list).toEqual([]);
  });

  it('puts the most urgent first: session, deleted account, favorites, collections', () => {
    auth.sessionNotice = 'Session ended';
    const { list } = notices({
      accountDeleted: true,
      favorites: { notice: { message: 'Favorite failed', error: true } },
      collections: { saveError: 'Collection failed' },
    });
    expect(list.map(({ id }) => id)).toEqual(['session', 'account-deleted', 'favorites', 'collections']);
    expect(list.map(({ tone }) => tone)).toEqual(['warning', 'success', 'error', 'error']);
  });

  it('offers sign-in after a session ends, clearing the notice as the form opens', () => {
    auth.sessionNotice = 'Session ended';
    const { list, onOpenAuth } = notices();
    expect(list[0].action?.label).toBe('Sign in');

    list[0].action?.onClick();
    expect(auth.clearSessionNotice).toHaveBeenCalledTimes(1);
    expect(onOpenAuth).toHaveBeenCalledTimes(1);

    list[0].onDismiss();
    expect(auth.clearSessionNotice).toHaveBeenCalledTimes(2);
  });

  it('confirms an account deletion, dismissed by the caller', () => {
    const { list, onDismissAccountDeleted } = notices({ accountDeleted: true });
    expect(list[0].message).toBe('Your account was deleted, with its saved titles and collections.');
    expect(list[0].action).toBeUndefined();

    list[0].onDismiss();
    expect(onDismissAccountDeleted).toHaveBeenCalled();
  });

  it('shows a favorites confirmation as a success, with sign-in only when offered', () => {
    const plain = notices({ favorites: { notice: { message: 'Added', error: false } } });
    expect(plain.list[0].tone).toBe('success');
    expect(plain.list[0].action).toBeUndefined();

    const offer = notices({ favorites: { notice: { message: 'Saved', error: false, offerSignIn: true } } });
    offer.list[0].action?.onClick();
    expect(offer.dismissNotice).toHaveBeenCalled();
    expect(offer.onOpenAuth).toHaveBeenCalled();
  });

  it('offers a retry for a failed collection save only once the account has loaded', () => {
    const ready = notices({ collections: { saveError: 'Failed', status: 'ready' } });
    expect(ready.list[0].action?.label).toBe('Try again');
    ready.list[0].action?.onClick();
    expect(ready.retrySave).toHaveBeenCalled();
    ready.list[0].onDismiss();
    expect(ready.dismissSaveError).toHaveBeenCalled();

    expect(notices({ collections: { saveError: 'Failed', status: 'error' } }).list[0].action).toBeUndefined();
    expect(notices({ collections: { saveError: 'Failed', status: 'loading' } }).list[0].action).toBeUndefined();
  });
});
