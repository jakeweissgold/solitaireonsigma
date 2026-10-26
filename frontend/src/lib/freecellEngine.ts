import { Card, Suit, SUITS, buildDeck, isRed, shuffled } from './cards';

const COLUMN_COUNT = 8;
const FREE_CELL_COUNT = 4;
const DEAL_SIZES = [7, 7, 7, 7, 6, 6, 6, 6]; // 52 cards total, all dealt face-up

export interface FreeCellGameState {
  tableau: Card[][];
  freeCells: Array<Card | null>;
  foundations: Record<Suit, Card[]>;
  moves: number;
  scoreMoves: number;
  startedAt: number;
  wonAt: number | null;
  /** True once a won game's score has been saved to the leaderboard — guards against a reload re-submitting it. */
  submitted: boolean;
  /** Cumulative point cost of every undo used this game. */
  penalty: number;
}

/** Every successful move adds this many points — there's no non-scoring "deal" action in FreeCell. */
export const POINTS_PER_MOVE = 10;
/** Score decays this many points for every interval below, continuously while the clock runs. */
export const DECAY_PER_INTERVAL = 0.5;
export const DECAY_INTERVAL_SECONDS = 10;
/** Flat point cost charged every time the player undoes a move. */
export const UNDO_PENALTY = 50;

export function elapsedSeconds(state: FreeCellGameState, now: number = Date.now()): number {
  const end = state.wonAt ?? now;
  return Math.max(0, Math.floor((end - state.startedAt) / 1000));
}

/**
 * Score is derived, not stored: additive progress from moves, minus a
 * standing time penalty. Recompute it with the current clock (or `wonAt`
 * once the game is over) instead of reading a mutated field.
 */
export function computeScore(state: FreeCellGameState, now: number = Date.now()): number {
  const base = state.scoreMoves * POINTS_PER_MOVE;
  const decay = Math.floor(elapsedSeconds(state, now) / DECAY_INTERVAL_SECONDS) * DECAY_PER_INTERVAL;
  return Math.max(0, base - decay - state.penalty);
}

export function newFreeCellGame(): FreeCellGameState {
  const deck = shuffled(buildDeck());
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < COLUMN_COUNT; col++) {
    const size = DEAL_SIZES[col];
    const pile: Card[] = [];
    for (let row = 0; row < size; row++) {
      pile.push({ ...deck[cursor++], faceUp: true });
    }
    tableau.push(pile);
  }
  return {
    tableau,
    freeCells: new Array(FREE_CELL_COUNT).fill(null),
    foundations: { S: [], H: [], D: [], C: [] },
    moves: 0,
    scoreMoves: 0,
    startedAt: Date.now(),
    wonAt: null,
    submitted: false,
    penalty: 0,
  };
}

function cloneState(state: FreeCellGameState): FreeCellGameState {
  return {
    tableau: state.tableau.map((pile) => pile.slice()),
    freeCells: state.freeCells.slice(),
    foundations: {
      S: state.foundations.S.slice(),
      H: state.foundations.H.slice(),
      D: state.foundations.D.slice(),
      C: state.foundations.C.slice(),
    },
    moves: state.moves,
    scoreMoves: state.scoreMoves,
    startedAt: state.startedAt,
    wonAt: state.wonAt,
    submitted: state.submitted,
    penalty: state.penalty,
  };
}

export function canPlaceOnFoundation(card: Card, pile: readonly Card[]): boolean {
  if (pile.length === 0) return card.rank === 1;
  const top = pile[pile.length - 1];
  return top.suit === card.suit && top.rank === card.rank - 1;
}

export function canPlaceOnTableau(card: Card, pile: readonly Card[]): boolean {
  if (pile.length === 0) return true;
  const top = pile[pile.length - 1];
  return isRed(top.suit) !== isRed(card.suit) && top.rank === card.rank + 1;
}

/**
 * The maximal movable group starting at `index`: every card from there to
 * the top of the pile, only if they form one continuous descending
 * alternating-color run. A lone top card is always valid.
 */
export function sequenceAt(pile: readonly Card[], index: number): Card[] | null {
  if (index < 0 || index >= pile.length) return null;
  const seq = pile.slice(index);
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i];
    const b = seq[i + 1];
    if (isRed(a.suit) === isRed(b.suit) || a.rank !== b.rank + 1) return null;
  }
  return seq;
}

function freeCellCount(state: FreeCellGameState): number {
  return state.freeCells.filter((c) => c === null).length;
}

function emptyColumnCount(state: FreeCellGameState, excludingCol?: number): number {
  return state.tableau.filter((pile, i) => pile.length === 0 && i !== excludingCol).length;
}

/**
 * How many cards can move together as one "supermove" — using empty free
 * cells and empty columns as temporary holding space. Moving into an empty
 * column doesn't count that column toward its own capacity.
 */
export function maxSupermoveLength(state: FreeCellGameState, destCol?: number): number {
  const cells = freeCellCount(state);
  const columns = emptyColumnCount(state, destCol);
  return (cells + 1) * Math.pow(2, columns);
}

export function isWon(state: FreeCellGameState): boolean {
  return SUITS.every((s) => state.foundations[s].length === 13);
}

function finalizeIfWon(state: FreeCellGameState): void {
  if (state.wonAt == null && isWon(state)) {
    state.wonAt = Date.now();
  }
}

export interface FreeCellMoveResult {
  state: FreeCellGameState;
  ok: boolean;
}

/** Moves a sequence (length 1 or more) from a tableau column onto another tableau column. */
export function moveTableauToTableau(
  prev: FreeCellGameState,
  fromCol: number,
  cardIndex: number,
  toCol: number,
): FreeCellMoveResult {
  if (prev.wonAt != null || fromCol === toCol) return { state: prev, ok: false };
  const seq = sequenceAt(prev.tableau[fromCol], cardIndex);
  if (!seq) return { state: prev, ok: false };
  if (!canPlaceOnTableau(seq[0], prev.tableau[toCol])) return { state: prev, ok: false };
  if (seq.length > maxSupermoveLength(prev, toCol)) return { state: prev, ok: false };

  const state = cloneState(prev);
  state.tableau[fromCol] = state.tableau[fromCol].slice(0, cardIndex);
  state.tableau[toCol].push(...seq);
  state.moves += 1;
  state.scoreMoves += 1;
  return { state, ok: true };
}

/** Moves the single top card of a tableau column to its foundation. */
export function moveTableauToFoundation(prev: FreeCellGameState, fromCol: number): FreeCellMoveResult {
  if (prev.wonAt != null) return { state: prev, ok: false };
  const pile = prev.tableau[fromCol];
  const card = pile[pile.length - 1];
  if (!card) return { state: prev, ok: false };
  if (!canPlaceOnFoundation(card, prev.foundations[card.suit])) return { state: prev, ok: false };

  const state = cloneState(prev);
  state.tableau[fromCol] = state.tableau[fromCol].slice(0, -1);
  state.foundations[card.suit].push(card);
  state.moves += 1;
  state.scoreMoves += 1;
  finalizeIfWon(state);
  return { state, ok: true };
}

/** Moves the single top card of a tableau column into an empty free cell. */
export function moveTableauToFreeCell(prev: FreeCellGameState, fromCol: number): FreeCellMoveResult {
  if (prev.wonAt != null) return { state: prev, ok: false };
  const pile = prev.tableau[fromCol];
  const card = pile[pile.length - 1];
  if (!card) return { state: prev, ok: false };
  const slot = prev.freeCells.findIndex((c) => c === null);
  if (slot === -1) return { state: prev, ok: false };

  const state = cloneState(prev);
  state.tableau[fromCol] = state.tableau[fromCol].slice(0, -1);
  state.freeCells[slot] = card;
  state.moves += 1;
  state.scoreMoves += 1;
  return { state, ok: true };
}

/** Moves a free cell's card onto a tableau column. */
export function moveFreeCellToTableau(prev: FreeCellGameState, cellIndex: number, toCol: number): FreeCellMoveResult {
  if (prev.wonAt != null) return { state: prev, ok: false };
  const card = prev.freeCells[cellIndex];
  if (!card) return { state: prev, ok: false };
  if (!canPlaceOnTableau(card, prev.tableau[toCol])) return { state: prev, ok: false };

  const state = cloneState(prev);
  state.freeCells[cellIndex] = null;
  state.tableau[toCol].push(card);
  state.moves += 1;
  state.scoreMoves += 1;
  return { state, ok: true };
}

/** Moves a free cell's card to its foundation. */
export function moveFreeCellToFoundation(prev: FreeCellGameState, cellIndex: number): FreeCellMoveResult {
  if (prev.wonAt != null) return { state: prev, ok: false };
  const card = prev.freeCells[cellIndex];
  if (!card) return { state: prev, ok: false };
  if (!canPlaceOnFoundation(card, prev.foundations[card.suit])) return { state: prev, ok: false };

  const state = cloneState(prev);
  state.freeCells[cellIndex] = null;
  state.foundations[card.suit].push(card);
  state.moves += 1;
  state.scoreMoves += 1;
  finalizeIfWon(state);
  return { state, ok: true };
}

/** Moves a foundation's top card back onto a tableau column, if it fits — undoes a premature foundation move. */
export function moveFoundationToTableau(prev: FreeCellGameState, suit: Suit, toCol: number): FreeCellMoveResult {
  if (prev.wonAt != null) return { state: prev, ok: false };
  const pile = prev.foundations[suit];
  const card = pile[pile.length - 1];
  if (!card) return { state: prev, ok: false };
  if (!canPlaceOnTableau(card, prev.tableau[toCol])) return { state: prev, ok: false };

  const state = cloneState(prev);
  state.foundations[suit] = state.foundations[suit].slice(0, -1);
  state.tableau[toCol].push(card);
  state.moves += 1;
  state.scoreMoves += 1;
  return { state, ok: true };
}

export type FreeCellClickTarget =
  | { zone: 'tableau'; col: number; index: number }
  | { zone: 'freeCell'; index: number }
  | { zone: 'foundation'; suit: Suit };

/**
 * Tries `attemptMove` against every tableau column, preferring a column
 * that already holds a matching card to stack onto over an empty one —
 * stacking makes real progress, while parking a card in an empty column is
 * only a fallback. Only once no stacking destination works does it try the
 * empty columns.
 */
function pickTableauDestination(
  state: FreeCellGameState,
  excludeCol: number | null,
  attemptMove: (col: number) => FreeCellMoveResult,
): FreeCellMoveResult {
  for (let col = 0; col < state.tableau.length; col++) {
    if (col === excludeCol || state.tableau[col].length === 0) continue;
    const res = attemptMove(col);
    if (res.ok) return res;
  }
  for (let col = 0; col < state.tableau.length; col++) {
    if (col === excludeCol || state.tableau[col].length !== 0) continue;
    const res = attemptMove(col);
    if (res.ok) return res;
  }
  return { state, ok: false };
}

/**
 * One click does the thinking. A tableau card tries its foundation first
 * (single card only), then every other tableau column — stacking onto a
 * matching card before falling back to an empty one — respecting the
 * supermove capacity for a multi-card sequence, then an empty free cell as
 * a last resort. A free-cell card tries its foundation, then any tableau
 * column (same stack-before-empty preference). A foundation card tries
 * sending itself back to a tableau column. Returns `ok: false` with the
 * state unchanged when nothing legal is available.
 */
export function autoMoveFreeCell(state: FreeCellGameState, target: FreeCellClickTarget): FreeCellMoveResult {
  if (state.wonAt != null) return { state, ok: false };

  if (target.zone === 'tableau') {
    const seq = sequenceAt(state.tableau[target.col], target.index);
    if (!seq) return { state, ok: false };

    if (seq.length === 1) {
      const toFoundation = moveTableauToFoundation(state, target.col);
      if (toFoundation.ok) return toFoundation;
    }
    const toTableau = pickTableauDestination(state, target.col, (col) =>
      moveTableauToTableau(state, target.col, target.index, col),
    );
    if (toTableau.ok) return toTableau;
    if (seq.length === 1) {
      const toFreeCell = moveTableauToFreeCell(state, target.col);
      if (toFreeCell.ok) return toFreeCell;
    }
    return { state, ok: false };
  }

  if (target.zone === 'freeCell') {
    const toFoundation = moveFreeCellToFoundation(state, target.index);
    if (toFoundation.ok) return toFoundation;
    return pickTableauDestination(state, null, (col) => moveFreeCellToTableau(state, target.index, col));
  }

  // target.zone === 'foundation'
  return pickTableauDestination(state, null, (col) => moveFoundationToTableau(state, target.suit, col));
}

/** Sweeps the board and sends every currently-eligible card — tableau tops and free cells — to its foundation, cascading as newly-exposed cards themselves become eligible. */
export function autoCompleteFreeCellFoundations(state: FreeCellGameState): FreeCellMoveResult {
  let current = state;
  let movedAny = false;
  let movedThisPass = true;

  while (movedThisPass) {
    movedThisPass = false;

    for (let col = 0; col < current.tableau.length; col++) {
      if (current.tableau[col].length === 0) continue;
      const attempt = moveTableauToFoundation(current, col);
      if (attempt.ok) {
        current = attempt.state;
        movedAny = true;
        movedThisPass = true;
      }
    }

    for (let i = 0; i < current.freeCells.length; i++) {
      if (!current.freeCells[i]) continue;
      const attempt = moveFreeCellToFoundation(current, i);
      if (attempt.ok) {
        current = attempt.state;
        movedAny = true;
        movedThisPass = true;
      }
    }
  }

  return { state: current, ok: movedAny };
}

/** Reverts to a previous snapshot and charges the fixed undo penalty — the reverted position doesn't need to be a legal placement, since it's just restoring history rather than making a new move. */
export function undoFreeCellMove(previousState: FreeCellGameState, currentPenalty: number): FreeCellGameState {
  return { ...previousState, penalty: currentPenalty + UNDO_PENALTY };
}
