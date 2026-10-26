import { Card, SpiderSuitCount, Suit, buildSpiderDeck, shuffled } from './cards';

const COLUMN_COUNT = 10;
const DEAL_SIZES = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]; // 4 columns of 6, 6 of 5 = 54 dealt cards
const RUN_LENGTH = 13; // a complete King-to-Ace same-suit run
const TOTAL_RUNS = 8; // always 8 complete runs across the 104-card deck, regardless of suit count

export interface SpiderGameState {
  suitCount: SpiderSuitCount;
  tableau: Card[][];
  stock: Card[];
  /** One entry per completed King-to-Ace run, in the order each was cleared. */
  completedRuns: Suit[];
  moves: number;
  /** Moves that count toward score — every successful tableau move, but not a stock deal. */
  scoreMoves: number;
  startedAt: number;
  wonAt: number | null;
  /** True once a won game's score has been saved to the leaderboard — guards against a reload re-submitting it. */
  submitted: boolean;
}

/** Every successful tableau move adds this many points. */
export const POINTS_PER_MOVE = 10;
/** Completing a full King-to-Ace run adds this many points — the real achievement in Spider. */
export const POINTS_PER_RUN = 100;
/** Score decays this many points for every interval below, continuously while the clock runs. */
export const DECAY_PER_INTERVAL = 0.5;
export const DECAY_INTERVAL_SECONDS = 10;

export function elapsedSeconds(state: SpiderGameState, now: number = Date.now()): number {
  const end = state.wonAt ?? now;
  return Math.max(0, Math.floor((end - state.startedAt) / 1000));
}

/**
 * Score is derived, not stored: additive progress from moves and completed
 * runs, minus a standing time penalty. Recompute it with the current clock
 * (or `wonAt` once the game is over) instead of reading a mutated field.
 */
export function computeScore(state: SpiderGameState, now: number = Date.now()): number {
  const base = state.scoreMoves * POINTS_PER_MOVE + state.completedRuns.length * POINTS_PER_RUN;
  const decay = Math.floor(elapsedSeconds(state, now) / DECAY_INTERVAL_SECONDS) * DECAY_PER_INTERVAL;
  return Math.max(0, base - decay);
}

export function newSpiderGame(suitCount: SpiderSuitCount): SpiderGameState {
  const deck = shuffled(buildSpiderDeck(suitCount));
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < COLUMN_COUNT; col++) {
    const size = DEAL_SIZES[col];
    const pile: Card[] = [];
    for (let row = 0; row < size; row++) {
      const card = deck[cursor++];
      pile.push({ ...card, faceUp: row === size - 1 });
    }
    tableau.push(pile);
  }
  const stock = deck.slice(cursor).map((c) => ({ ...c, faceUp: false }));
  return {
    suitCount,
    tableau,
    stock,
    completedRuns: [],
    moves: 0,
    scoreMoves: 0,
    startedAt: Date.now(),
    wonAt: null,
    submitted: false,
  };
}

function cloneState(state: SpiderGameState): SpiderGameState {
  return {
    suitCount: state.suitCount,
    tableau: state.tableau.map((pile) => pile.slice()),
    stock: state.stock.slice(),
    completedRuns: state.completedRuns,
    moves: state.moves,
    scoreMoves: state.scoreMoves,
    startedAt: state.startedAt,
    wonAt: state.wonAt,
    submitted: state.submitted,
  };
}

/**
 * The maximal movable group starting at `index`: every face-up card from
 * there to the top of the pile, only if they form one continuous
 * descending same-suit run. A lone top card is always valid (there's
 * nothing to check it against). Returns null when the cards at and above
 * `index` don't hang together as one unit.
 */
export function sequenceAt(pile: readonly Card[], index: number): Card[] | null {
  if (index < 0 || index >= pile.length) return null;
  const seq = pile.slice(index);
  if (!seq.every((c) => c.faceUp)) return null;
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i];
    const b = seq[i + 1];
    if (a.suit !== b.suit || a.rank !== b.rank + 1) return null;
  }
  return seq;
}

/** A sequence's head card (the one touching the destination pile) can land on any rank-plus-one card, any suit. */
export function canPlaceOnTableau(headCard: Card, destPile: readonly Card[]): boolean {
  if (destPile.length === 0) return true;
  const top = destPile[destPile.length - 1];
  return top.faceUp && top.rank === headCard.rank + 1;
}

function revealTopOfTableau(state: SpiderGameState, col: number): void {
  const pile = state.tableau[col];
  if (pile.length === 0) return;
  const top = pile[pile.length - 1];
  if (!top.faceUp) {
    pile[pile.length - 1] = { ...top, faceUp: true };
  }
}

/** Removes a completed run from the top of `col`, if one is there, and reveals what's underneath. Repeats in case removal exposes another complete run (rare, but cheap to check). */
function clearCompletedRuns(state: SpiderGameState, col: number): void {
  let pile = state.tableau[col];
  while (pile.length >= RUN_LENGTH) {
    const top13 = pile.slice(-RUN_LENGTH);
    if (!top13.every((c) => c.faceUp)) break;
    const suit = top13[0].suit;
    let isRun = top13[0].rank === RUN_LENGTH; // King on top of the run
    if (isRun) {
      for (let i = 0; i < top13.length - 1; i++) {
        const a = top13[i];
        const b = top13[i + 1];
        if (a.suit !== suit || b.suit !== suit || a.rank !== b.rank + 1) {
          isRun = false;
          break;
        }
      }
    }
    if (!isRun) break;
    state.tableau[col] = pile.slice(0, pile.length - RUN_LENGTH);
    state.completedRuns.push(suit);
    revealTopOfTableau(state, col);
    pile = state.tableau[col];
  }
}

export function isWon(state: SpiderGameState): boolean {
  return state.completedRuns.length >= TOTAL_RUNS;
}

function finalizeIfWon(state: SpiderGameState): void {
  if (state.wonAt == null && isWon(state)) {
    state.wonAt = Date.now();
  }
}

export interface SpiderMoveResult {
  state: SpiderGameState;
  ok: boolean;
}

/** Deals one card face-up onto every column — only legal when every column already has at least one card. */
export function dealFromStock(prev: SpiderGameState): SpiderMoveResult {
  if (prev.wonAt != null) return { state: prev, ok: false };
  if (prev.stock.length < COLUMN_COUNT) return { state: prev, ok: false };
  if (prev.tableau.some((pile) => pile.length === 0)) return { state: prev, ok: false };

  const state = cloneState(prev);
  for (let col = 0; col < COLUMN_COUNT; col++) {
    const card = state.stock.pop();
    if (!card) break;
    state.tableau[col].push({ ...card, faceUp: true });
  }
  state.moves += 1;
  for (let col = 0; col < COLUMN_COUNT; col++) clearCompletedRuns(state, col);
  finalizeIfWon(state);
  return { state, ok: true };
}

/** Moves the maximal valid sequence starting at `cardIndex` in `fromCol` onto `toCol`, if legal. */
export function moveSequence(prev: SpiderGameState, fromCol: number, cardIndex: number, toCol: number): SpiderMoveResult {
  if (prev.wonAt != null) return { state: prev, ok: false };
  if (fromCol === toCol) return { state: prev, ok: false };
  const seq = sequenceAt(prev.tableau[fromCol], cardIndex);
  if (!seq) return { state: prev, ok: false };
  if (!canPlaceOnTableau(seq[0], prev.tableau[toCol])) return { state: prev, ok: false };

  const state = cloneState(prev);
  state.tableau[fromCol] = state.tableau[fromCol].slice(0, cardIndex);
  state.tableau[toCol].push(...seq);
  revealTopOfTableau(state, fromCol);
  state.moves += 1;
  state.scoreMoves += 1;
  clearCompletedRuns(state, toCol);
  finalizeIfWon(state);
  return { state, ok: true };
}

/**
 * One click does the thinking: tries the clicked card's maximal sequence
 * against every other column and plays the first legal destination. A
 * no-op (ok: false) means that card has nowhere legal to go right now.
 */
export function autoMoveSpider(state: SpiderGameState, fromCol: number, cardIndex: number): SpiderMoveResult {
  const seq = sequenceAt(state.tableau[fromCol], cardIndex);
  if (!seq) return { state, ok: false };
  for (let col = 0; col < state.tableau.length; col++) {
    if (col === fromCol) continue;
    const attempt = moveSequence(state, fromCol, cardIndex, col);
    if (attempt.ok) return attempt;
  }
  return { state, ok: false };
}
