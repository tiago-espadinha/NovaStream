import { useEffect, useRef, useState } from 'react';
import { mockContent } from '../data/mockData';
import * as api from '../services/apiService';
import type { ContentItem, ContentType, MediaSummary } from '../types';
import { describeDetailError, type LiveProblem } from '../utils/liveErrors';

/** A detail left for a related title, kept so Back can return without reloading it. */
interface DetailTrailEntry {
  id: string;
  item: ContentItem;
  /** The artist's albums when they had loaded. */
  albums?: MediaSummary[];
  /** The related title opened from it. */
  openedId: string;
}

/** Which title's detail is open, loading it, and the trail of related titles behind it. */
export function useDetailNavigation(language: string | undefined) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LiveProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Details left by opening a related title (an artist's album), oldest first; Back returns
  // to the last one without fetching it again.
  const [trail, setTrail] = useState<DetailTrailEntry[]>([]);
  // Read once by the detail effect, which then skips the fetch.
  const restoredDetail = useRef<DetailTrailEntry | null>(null);
  // The trail entry Back last returned to; its albums and opened card are reused on return.
  const [returnedTo, setReturnedTo] = useState<DetailTrailEntry | null>(null);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Starting a request: its loading state belongs here.
    setError(null);
    setLoading(false);
    if (!selectedId) {
      setDetail(null);
      setTrail([]);
      setReturnedTo(null);
      restoredDetail.current = null;
      return;
    }
    const restored = restoredDetail.current;
    restoredDetail.current = null;
    if (restored?.id === selectedId) {
      setDetail(restored.item);
      return;
    }
    const mockMatch = mockContent.find((item) => item.id === selectedId);
    if (mockMatch) {
      setDetail(mockMatch);
      return;
    }
    // Live id is shaped "type-externalId" (see server/src/services/normalize.js)
    const [type, ...rest] = selectedId.split('-');
    const externalId = rest.join('-');
    const request = new AbortController();
    setDetail(null);
    setLoading(true);
    api
      .getMediaDetail(type as ContentType, externalId)
      .then((item) => !request.signal.aborted && setDetail(item))
      .catch((err) => !request.signal.aborted && setError(describeDetailError(err)))
      .finally(() => !request.signal.aborted && setLoading(false));
    return () => request.abort();
  }, [selectedId, attempt, language]);

  const previous = trail[trail.length - 1];
  // The restore sets `detail` to the entry's own item.
  const returnedHere = returnedTo && returnedTo.item === detail ? returnedTo : null;

  const openRelated = (id: string, albums?: MediaSummary[]) => {
    if (selectedId && detail) {
      setTrail((current) => [...current, { id: selectedId, item: detail, albums, openedId: id }]);
    }
    setReturnedTo(null);
    setSelectedId(id);
  };

  const back = () => {
    if (!previous) return;
    restoredDetail.current = previous;
    setReturnedTo(previous);
    setTrail((current) => current.slice(0, -1));
    setSelectedId(previous.id);
  };

  return {
    selectedId,
    select: setSelectedId,
    detail,
    loading,
    error,
    retry: () => setAttempt((n) => n + 1),
    backTo: previous?.item.title,
    returnedHere,
    openRelated,
    back,
  };
}

export type DetailNavigation = ReturnType<typeof useDetailNavigation>;
