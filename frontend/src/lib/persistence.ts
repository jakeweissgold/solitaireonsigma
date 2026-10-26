import { Card, Suit } from './cards';
import { GameState } from './engine';
import { loadJSON, saveJSON } from './storage';

const GAME_KEY = 'klondike';

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

function isGameState(value: unknown): value is GameState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isCardArray(v.stock) || !isCardArray(v.waste)) return false;
  if (!Array.isArray(v.tableau) || v.tableau.length !== 7 || !v.tableau.every(isCardArray)) return false;
  if (typeof v.foundations !== 'object' || v.foundations === null) return false;
  const foundations = v.foundations as Record<Suit, unknown>;
  if (!(['S', 'H', 'D', 'C'] as Suit[]).every((suit) => isCardArray(foundations[suit]))) return false;
  if (typeof v.moves !== 'number' || typeof v.scoreMoves !== 'number' || typeof v.startedAt !== 'number') return false;
  if (v.wonAt !== null && typeof v.wonAt !== 'number') return false;
  if (typeof v.submitted !== 'boolean') return false;
  return true;
}

/** Reads a previously saved Klondike game for this viewer, or null if there isn't one (or it's corrupt). */
export function loadGameState(userId: string): GameState | null {
  return loadJSON(userId, GAME_KEY, isGameState);
}

/** Saves the in-progress Klondike game so a reload can pick up where it left off. */
export function saveGameState(userId: string, state: GameState): void {
  saveJSON(userId, GAME_KEY, state);
}
