import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../services/apiService";
import { ApiError } from "../services/apiService";
import { useAuth } from "../context/AuthContext";
import type { MediaSummary } from "../types";
import { describeAccountError, describeGuestMerge, isSessionEnded, pluralFavorites } from "../utils/accountErrors";

const LOCAL_FAVORITES_KEY = "nova-stream:favorites";

export type SavedListStatus = "loading" | "ready" | "error";

function readLocalFavorites(): MediaSummary[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) || "null");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (media): media is MediaSummary =>
        media && typeof media.id === "string" && typeof media.title === "string" &&
        ["movie", "tv", "music", "book", "game"].includes(media.type),
    );
  } catch {
    return [];
  }
}

function notReadyMessage(merging: boolean, status: SavedListStatus): string {
  if (merging) return "Still adding favorites from this browser to your account. Try again in a moment.";
  if (status === "error") return "Your favorites couldn’t be loaded, so they can’t be changed yet. Open Saved and choose Try again.";
  return "Your favorites are still loading. Try again in a moment.";
}

interface AccountFavorites {
  token: string | null;
  media: MediaSummary[];
  status: SavedListStatus;
}

/**
 * Guests keep favorites in this browser; signed-in users keep them on their account. On
 * sign-in, guest favorites move to the account so nothing is lost or shown twice.
 */
export function useFavorites() {
  const { token, endSession } = useAuth();
  const [localSavedMedia, setLocalSavedMedia] = useState<MediaSummary[]>(readLocalFavorites);
  const [account, setAccount] = useState<AccountFavorites>({ token: null, media: [], status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  // A message about the last save, unsave, or guest merge: an error or a confirmation.
  const [notice, setNotice] = useState<{ message: string; error: boolean; offerSignIn?: boolean } | null>(null);
  // Guests hear once per visit where their favorites are kept; after that the heart speaks for itself.
  const guestSaveExplained = useRef(false);
  const pending = useRef(new Set<string>());
  // The merge run in progress, if any. Each run clears only itself, so a cancelled run
  // finishing late can't unblock clicks during the run that replaced it.
  const mergeRun = useRef<object | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(localSavedMedia));
    } catch {
      // Keep favorites usable for this session if browser storage is unavailable.
    }
  }, [localSavedMedia]);

  // A notice is about the account it happened in; it doesn't survive signing in or out.
  useEffect(() => setNotice(null), [token]);

  // Authenticated favorites belong to the account; guests never hit the network.
  useEffect(() => {
    if (!token) return;
    let active = true;
    setAccount((current) => ({
      token,
      media: current.token === token ? current.media : [],
      status: "loading",
    }));
    api
      .getSavedMedia(token)
      .then((res) => {
        if (active) setAccount({ token, media: res.savedMedia, status: "ready" });
      })
      .catch((err) => {
        if (!active) return;
        setAccount((current) => ({ ...current, status: "error" }));
        if (isSessionEnded(err)) endSession();
      });
    return () => {
      active = false;
    };
  }, [token, loadAttempt, endSession]);

  const accountReady = Boolean(token) && account.token === token && account.status === "ready";

  // Move guest favorites into the account once it has loaded. Items that fail stay local,
  // so the next load tries them again. The guest list is read from storage, not this tab's
  // memory, so a tab that was open during another tab's merge doesn't merge stale items again.
  useEffect(() => {
    if (!token || !accountReady) return;
    const guest = readLocalFavorites();
    if (guest.length === 0) return;
    let active = true;
    const run = {};
    mergeRun.current = run;
    const accountIds = new Set(account.media.map((media) => media.id));
    const toUpload = guest.filter((media) => !accountIds.has(media.id));
    (async () => {
      const moved = new Set(guest.filter((media) => accountIds.has(media.id)).map((media) => media.id));
      let latest = account.media;
      let notAdded = 0;
      let limitMessage: string | null = null;
      try {
        for (const [index, media] of toUpload.entries()) {
          if (!active) return;
          try {
            latest = (await api.saveMedia(token, media)).savedMedia;
            moved.add(media.id);
          } catch (err) {
            if (isSessionEnded(err)) return endSession();
            // The account is full: the rest would fail the same way.
            if (err instanceof ApiError && err.status === 409) {
              notAdded += toUpload.length - index;
              limitMessage = err.message;
              break;
            }
            notAdded += 1;
          }
        }
        if (!active) return;
        setAccount({ token, media: latest, status: "ready" });
        setLocalSavedMedia(readLocalFavorites().filter((media) => !moved.has(media.id)));
        const notice = limitMessage
          ? { message: `${limitMessage} ${pluralFavorites(notAdded)} from this browser stay here for now.`, error: true }
          : describeGuestMerge(toUpload.length - notAdded, notAdded);
        if (notice) setNotice(notice);
      } finally {
        if (mergeRun.current === run) mergeRun.current = null;
      }
    })();
    return () => {
      active = false;
    };
    // Deliberately runs only when the account becomes ready (after sign-in or a retried load).
  }, [token, accountReady]);

  const savedMedia = token ? (account.token === token ? account.media : []) : localSavedMedia;
  const status: SavedListStatus = token ? (account.token === token ? account.status : "loading") : "ready";

  const favoriteIds = useMemo(
    () => new Set(savedMedia.map((media) => media.id)),
    [savedMedia],
  );

  const isFavorite = useCallback(
    (id: string) => favoriteIds.has(id),
    [favoriteIds],
  );

  const toggleFavorite = useCallback(
    async (item: MediaSummary) => {
      if (!token) {
        setNotice(null);
        setLocalSavedMedia((current) =>
          current.some((media) => media.id === item.id)
            ? current.filter((media) => media.id !== item.id)
            : [...current, item],
        );
        if (!favoriteIds.has(item.id) && !guestSaveExplained.current) {
          guestSaveExplained.current = true;
          setNotice({
            message: `Saved “${item.title}” in this browser. Sign in to keep your favorites on any device.`,
            error: false,
            offerSignIn: true,
          });
        }
        return;
      }
      // Until the list has loaded (and any guest merge has finished), "is this saved?" isn't
      // settled, so a click could do the opposite of what the heart shows.
      const merging = mergeRun.current !== null;
      if (!accountReady || merging) {
        setNotice({ message: notReadyMessage(merging, account.status), error: true });
        return;
      }
      // Ignore repeat clicks until the server has answered the first one.
      if (pending.current.has(item.id)) return;
      pending.current.add(item.id);
      setNotice(null);
      const removing = favoriteIds.has(item.id);
      try {
        const res = removing ? await api.removeSavedMedia(token, item.id) : await api.saveMedia(token, item);
        setAccount({ token, media: res.savedMedia, status: "ready" });
      } catch (err) {
        if (isSessionEnded(err)) {
          endSession(`Your session expired, so “${item.title}” wasn’t ${removing ? "removed" : "saved"}. Sign in and try again.`);
        } else {
          const fallback = removing ? `Couldn’t remove “${item.title}”. Try again.` : `Couldn’t save “${item.title}”. Try again.`;
          setNotice({ message: describeAccountError(err, fallback), error: true });
        }
      } finally {
        pending.current.delete(item.id);
      }
    },
    [token, accountReady, account.status, favoriteIds, endSession],
  );

  return {
    isFavorite,
    toggleFavorite,
    savedMedia,
    status,
    retryLoad: () => setLoadAttempt((n) => n + 1),
    notice,
    dismissNotice: () => setNotice(null),
  };
}
