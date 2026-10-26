import { email, user_id } from 'sigma:context';
import identity from 'sigma:identity:audience';
import leaderboard from 'sigma:datasource:solitaire-leaderboard';

const MAX_SCORE = 5000;
const MAX_MOVES = 3000;
const MAX_DURATION_SECONDS = 60 * 60 * 12; // 12 hours

/** Every valid game+difficulty combination a score can be recorded under. */
export const GAME_MODES = ['klondike', 'spider-1', 'spider-2', 'spider-4', 'freecell'] as const;
export type GameMode = (typeof GAME_MODES)[number];

function assertGameMode(value: string): GameMode {
  if (!(GAME_MODES as readonly string[]).includes(value)) {
    throw new Error(`Invalid game mode: ${value}`);
  }
  return value as GameMode;
}

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

function requireCallerId(): string {
  if (!user_id) {
    throw new Error('No authenticated user for this request.');
  }
  return user_id;
}

function callerDisplayName(callerId: string): string {
  const me = identity.getUser(callerId);
  if (me) {
    const full = `${me.firstName} ${me.lastName}`.trim();
    if (full.length > 0) return full;
    if (me.email) return me.email;
  }
  return email ?? 'Anonymous';
}

function assertFiniteInt(value: number, name: string, max: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return value;
}

/** Record a completed, won game for the signed-in player. */
export function recordWin(
  gameMode: string,
  score: number,
  moves: number,
  durationSeconds: number,
): { saved: boolean } {
  const safeMode = assertGameMode(gameMode);
  const safeScore = assertFiniteInt(score, 'score', MAX_SCORE);
  const safeMoves = assertFiniteInt(moves, 'moves', MAX_MOVES);
  const safeDuration = assertFiniteInt(durationSeconds, 'durationSeconds', MAX_DURATION_SECONDS);
  const callerId = requireCallerId();

  leaderboard.upsert([
    {
      primaryKey: { ID: Crypto.uuid() },
      updates: {
        user_id: callerId,
        user_name: callerDisplayName(callerId),
        score: safeScore,
        moves: safeMoves,
        duration_seconds: safeDuration,
        won: true,
        created_at: new Date().toISOString(),
        game_mode: safeMode,
      },
    },
  ]);

  const result = leaderboard.apply();
  const failed = result.results.find((r) => r.error != null);
  if (failed) {
    throw new Error(`Could not save score: ${failed.error}`);
  }
  return { saved: true };
}

const col = (name: keyof typeof leaderboard.columns) => ({
  type: 'nameRef' as const,
  path: ['solitaire-leaderboard', leaderboard.columns[name].sourceName],
});

/** Top scores for one game+difficulty, plus the caller's own best (even if outside the top list). */
export function getLeaderboard(gameMode: string, limit: number): LeaderboardResult {
  const safeMode = assertGameMode(gameMode);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 20));
  const callerId = requireCallerId();

  const { records } = leaderboard.query({
    type: 'table',
    queryName: 'solitaire-leaderboard-all',
    columns: {
      user_id: { expr: col('user_id') },
      user_name: { expr: col('user_name') },
      score: { expr: col('score') },
      moves: { expr: col('moves') },
      duration_seconds: { expr: col('duration_seconds') },
      created_at: { expr: col('created_at') },
      game_mode: { expr: col('game_mode') },
    },
    sort: [
      { key: 'score', dir: 'desc' },
      { key: 'duration_seconds', dir: 'asc' },
    ],
    limit: 500,
  });

  const toEntry = (row: Record<string, unknown>, rank: number): LeaderboardEntry => {
    const createdAt = row.created_at;
    const wonAt =
      typeof createdAt === 'string'
        ? createdAt
        : createdAt && typeof createdAt === 'object' && 'datetime' in createdAt
          ? String((createdAt as { datetime: string }).datetime)
          : '';
    return {
      rank,
      userName: typeof row.user_name === 'string' && row.user_name.length > 0 ? row.user_name : 'Anonymous',
      score: typeof row.score === 'number' ? row.score : 0,
      moves: typeof row.moves === 'number' ? row.moves : 0,
      durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : 0,
      wonAt,
      isYou: row.user_id === callerId,
    };
  };

  const ranked = records
    .filter((row) => row.game_mode === safeMode)
    .map((row, i) => toEntry(row, i + 1));
  const entries = ranked.slice(0, safeLimit);
  const you = ranked.find((e) => e.isYou) ?? null;

  return { entries, you };
}
