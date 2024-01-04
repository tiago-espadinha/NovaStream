import { useEffect, useState } from 'react';
import * as api from '../services/apiService';
import type { MediaSummary } from '../types';
import { describeSearchFailure, describeTrendingErrors, type LiveProblem } from '../utils/liveErrors';

interface TrendingState {
  items: MediaSummary[];
  loading: boolean;
  problem: LiveProblem | null;
}

/** Live trending feed for Home. Loads once per visit and language (the server caches it) and can be retried. */
export function useTrending(enabled: boolean, language?: string) {
  const [state, setState] = useState<TrendingState>({ items: [], loading: enabled, problem: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, problem: null }));
    api
      .getTrending()
      .then((res) => {
        if (cancelled) return;
        setState({
          items: res.results,
          loading: false,
          problem: describeTrendingErrors(res.errors, res.results.length),
        });
      })
      .catch((err) => {
        if (!cancelled) setState({ items: [], loading: false, problem: describeSearchFailure(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt, language]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
