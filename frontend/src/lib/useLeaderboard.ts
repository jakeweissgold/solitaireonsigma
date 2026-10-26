import * as React from 'react';
import { callEndpoint } from '@sigmacomputing/runtime/endpoint';

export interface LeaderboardEntry {
  rank: number;
  userName: string;
  score: number;
  moves: number;
  durationSeconds: number;
  wonAt: string;
  isYou: boolean;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  you: LeaderboardEntry | null;
}

export interface UseLeaderboardResult {
  loading: boolean;
  error: string | null;
  entries: LeaderboardEntry[];
  you: LeaderboardEntry | null;
}

/**
 * Fetches one game mode's leaderboard. `active` gates the fetch — pass
 * `false` while the caller isn't visible (e.g. a closed modal) to skip the
 * round trip; a leaderboard shown inline on a page can just pass `true`.
 * Refetches whenever `gameMode` or `refreshKey` changes.
 */
export function useLeaderboard(gameMode: string, limit: number, active: boolean, refreshKey = 0): UseLeaderboardResult {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<LeaderboardResult | null>(null);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    callEndpoint('getLeaderboard', { args: [gameMode, limit] })
      .then((data) => {
        if (!cancelled) setResult(data as LeaderboardResult);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the leaderboard. Try again in a moment.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, gameMode, limit, refreshKey]);

  return { loading, error, entries: result?.entries ?? [], you: result?.you ?? null };
}
