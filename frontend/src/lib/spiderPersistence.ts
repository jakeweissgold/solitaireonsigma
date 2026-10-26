import { Card, SpiderSuitCount } from './cards';
import { SpiderGameState } from './spiderEngine';
import { loadJSON, saveJSON } from './storage';

function gameKey(suitCount: SpiderSuitCount): string {
  return `spider-${suitCount}`;
}

function isCard(value: unknown): value is Card {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.suit === 'string' &&
    typeof v.rank === 'number' &&
    typeof v.faceUp === 'boolean'
  );
}

function isCardArray(value: unknown): value is Card[] {
  return Array.isArray(value) && value.every(isCard);
}

function isSpiderGameState(value: unknown): value is SpiderGameState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.suitCount !== 1 && v.suitCount !== 2 && v.suitCount !== 4) return false;
  if (!Array.isArray(v.tableau) || v.tableau.length !== 10 || !v.tableau.every(isCardArray)) return false;
  if (!isCardArray(v.stock)) return false;
  if (!Array.isArray(v.completedRuns) || !v.completedRuns.every((s) => typeof s === 'string')) return false;
  if (typeof v.moves !== 'number' || typeof v.scoreMoves !== 'number') return false;
  if (typeof v.startedAt !== 'number') return false;
  if (v.wonAt !== null && typeof v.wonAt !== 'number') return false;
  if (typeof v.submitted !== 'boolean') return false;
  return true;
}

/** Reads a previously saved Spider game at this difficulty for this viewer, or null if there isn't one (or it's corrupt). */
export function loadSpiderGame(userId: string, suitCount: SpiderSuitCount): SpiderGameState | null {
  const state = loadJSON(userId, gameKey(suitCount), isSpiderGameState);
  return state && state.suitCount === suitCount ? state : null;
}

/** Saves the in-progress Spider game so a reload can pick up where it left off. */
export function saveSpiderGame(userId: string, state: SpiderGameState): void {
  saveJSON(userId, gameKey(state.suitCount), state);
}
