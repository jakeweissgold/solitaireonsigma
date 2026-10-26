import { Card, Suit } from './cards';
import { FreeCellGameState } from './freecellEngine';
import { loadJSON, saveJSON } from './storage';

const GAME_KEY = 'freecell';

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

function isFreeCellSlotArray(value: unknown): value is Array<Card | null> {
  return Array.isArray(value) && value.every((c) => c === null || isCard(c));
}

function isFreeCellGameState(value: unknown): value is FreeCellGameState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.tableau) || v.tableau.length !== 8 || !v.tableau.every(isCardArray)) return false;
  if (!isFreeCellSlotArray(v.freeCells) || v.freeCells.length !== 4) return false;
  if (typeof v.foundations !== 'object' || v.foundations === null) return false;
  const foundations = v.foundations as Record<Suit, unknown>;
  if (!(['S', 'H', 'D', 'C'] as Suit[]).every((suit) => isCardArray(foundations[suit]))) return false;
  if (typeof v.moves !== 'number' || typeof v.scoreMoves !== 'number' || typeof v.startedAt !== 'number') return false;
  if (v.wonAt !== null && typeof v.wonAt !== 'number') return false;
  if (typeof v.submitted !== 'boolean') return false;
  if (typeof v.penalty !== 'number') return false;
  return true;
}

/** Reads a previously saved FreeCell game for this viewer, or null if there isn't one (or it's corrupt). */
export function loadFreeCellGame(userId: string): FreeCellGameState | null {
  return loadJSON(userId, GAME_KEY, isFreeCellGameState);
}

/** Saves the in-progress FreeCell game so a reload can pick up where it left off. */
export function saveFreeCellGame(userId: string, state: FreeCellGameState): void {
  saveJSON(userId, GAME_KEY, state);
}
