import { Card, Suit, SUITS, buildDeck, isRed, shuffled } from './cards';

export interface GameState {
  stock: Card[];
  waste: Card[];
  foundations: Record<Suit, Card[]>;
  tableau: Card[][];
  moves: number;
  /** Moves that count toward score — every successful move except drawing from the stock. */
  scoreMoves: number;
  startedAt: number;
  wonAt: number | null;
  /** True once a won game's score has been saved to the leaderboard — guards against a reload re-submitting it. */
  submitted: boolean;
}

/** Every successful move — a click that actually goes somewhere — adds this many points. */
export const POINTS_PER_MOVE = 10;
/** Score decays this many points for every interval below, continuously while the clock runs. */
export const DECAY_PER_INTERVAL = 0.5;
export const DECAY_INTERVAL_SECONDS = 10;

/**
 * Score is derived, not stored: additive progress from moves, minus a
 * standing time penalty. Recompute it with the current clock (or `wonAt`
 * once the game is over) instead of reading a mutated field.
 */
export function computeScore(state: GameState, now: number = Date.now()): number {
  const base = state.scoreMoves * POINTS_PER_MOVE;
  const decay = Math.floor(elapsedSeconds(state, now) / DECAY_INTERVAL_SECONDS) * DECAY_PER_INTERVAL;
  return Math.max(0, base - decay);
}

export type Move =
  | { type: 'draw' }
  | { type: 'wasteToFoundation' }
  | { type: 'wasteToTableau'; toCol: number }
  | { type: 'tableauToFoundation'; fromCol: number }
  | { type: 'tableauToTableau'; fromCol: number; cardIndex: number; toCol: number }
  | { type: 'foundationToTableau'; suit: Suit; toCol: number };

export function newGame(): GameState {
  const deck = shuffled(buildDeck());
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < 7; col++) {
    const pile: Card[] = [];
    for (let row = 0; row <= col; row++) {
      const card = deck[cursor++];
      pile.push({ ...card, faceUp: row === col });
    }
    tableau.push(pile);
  }
  const stock = deck.slice(cursor).map((c) => ({ ...c, faceUp: false }));
  return {
    stock,
    waste: [],
    foundations: { S: [], H: [], D: [], C: [] },
    tableau,
    moves: 0,
    scoreMoves: 0,
    startedAt: Date.now(),
    wonAt: null,
    submitted: false,
  };
}

function cloneState(state: GameState): GameState {
  return {
    stock: state.stock.slice(),
    waste: state.waste.slice(),
    foundations: {
      S: state.foundations.S.slice(),
      H: state.foundations.H.slice(),
      D: state.foundations.D.slice(),
      C: state.foundations.C.slice(),
    },
    tableau: state.tableau.map((pile) => pile.slice()),
    moves: state.moves,
    scoreMoves: state.scoreMoves,
    startedAt: state.startedAt,
    wonAt: state.wonAt,
    submitted: state.submitted,
  };
}

export function canPlaceOnFoundation(card: Card, pile: readonly Card[]): boolean {
  if (pile.length === 0) return card.rank === 1;
  const top = pile[pile.length - 1];
  return top.suit === card.suit && top.rank === card.rank - 1;
}

export function canPlaceOnTableau(card: Card, pile: readonly Card[]): boolean {
  if (pile.length === 0) return card.rank === 13;
  const top = pile[pile.length - 1];
  return top.faceUp && isRed(top.suit) !== isRed(card.suit) && top.rank === card.rank + 1;
}

function revealTopOfTableau(state: GameState, col: number): void {
  const pile = state.tableau[col];
  if (pile.length === 0) return;
  const top = pile[pile.length - 1];
  if (!top.faceUp) {
    pile[pile.length - 1] = { ...top, faceUp: true };
  }
}

export function isWon(state: GameState): boolean {
  return SUITS.every((s) => state.foundations[s].length === 13);
}

function finalizeIfWon(state: GameState): void {
  if (state.wonAt == null && isWon(state)) {
    state.wonAt = Date.now();
  }
}

export interface MoveResult {
  state: GameState;
  ok: boolean;
}

export function applyMove(prev: GameState, move: Move): MoveResult {
  if (prev.wonAt != null) return { state: prev, ok: false };
  const state = cloneState(prev);

  switch (move.type) {
    case 'draw': {
      if (state.stock.length > 0) {
        const count = Math.min(3, state.stock.length);
        const drawn = state.stock.splice(state.stock.length - count, count);
        for (const c of drawn) state.waste.push({ ...c, faceUp: true });
      } else if (state.waste.length > 0) {
        const recycled = state.waste.slice().reverse().map((c) => ({ ...c, faceUp: false }));
        state.stock = recycled;
        state.waste = [];
      } else {
        return { state: prev, ok: false };
      }
      state.moves += 1;
      return { state, ok: true };
    }

    case 'wasteToFoundation': {
      const card = state.waste[state.waste.length - 1];
      if (!card) return { state: prev, ok: false };
      const pile = state.foundations[card.suit];
      if (!canPlaceOnFoundation(card, pile)) return { state: prev, ok: false };
      state.waste.pop();
      pile.push({ ...card, faceUp: true });
      state.moves += 1;
      state.scoreMoves += 1;
      finalizeIfWon(state);
      return { state, ok: true };
    }

    case 'wasteToTableau': {
      const card = state.waste[state.waste.length - 1];
      if (!card) return { state: prev, ok: false };
      const dest = state.tableau[move.toCol];
      if (!canPlaceOnTableau(card, dest)) return { state: prev, ok: false };
      state.waste.pop();
      dest.push({ ...card, faceUp: true });
      state.moves += 1;
      state.scoreMoves += 1;
      return { state, ok: true };
    }

    case 'tableauToFoundation': {
      const source = state.tableau[move.fromCol];
      const card = source[source.length - 1];
      if (!card || !card.faceUp) return { state: prev, ok: false };
      const pile = state.foundations[card.suit];
      if (!canPlaceOnFoundation(card, pile)) return { state: prev, ok: false };
      source.pop();
      pile.push({ ...card, faceUp: true });
      revealTopOfTableau(state, move.fromCol);
      state.moves += 1;
      state.scoreMoves += 1;
      finalizeIfWon(state);
      return { state, ok: true };
    }

    case 'tableauToTableau': {
      if (move.fromCol === move.toCol) return { state: prev, ok: false };
      const source = state.tableau[move.fromCol];
      const card = source[move.cardIndex];
      if (!card || !card.faceUp) return { state: prev, ok: false };
      const dest = state.tableau[move.toCol];
      if (!canPlaceOnTableau(card, dest)) return { state: prev, ok: false };
      const sequence = source.splice(move.cardIndex);
      dest.push(...sequence);
      revealTopOfTableau(state, move.fromCol);
      state.moves += 1;
      state.scoreMoves += 1;
      return { state, ok: true };
    }

    case 'foundationToTableau': {
      const pile = state.foundations[move.suit];
      const card = pile[pile.length - 1];
      if (!card) return { state: prev, ok: false };
      const dest = state.tableau[move.toCol];
      if (!canPlaceOnTableau(card, dest)) return { state: prev, ok: false };
      pile.pop();
      dest.push({ ...card, faceUp: true });
      state.moves += 1;
      state.scoreMoves += 1;
      return { state, ok: true };
    }

    default:
      return { state: prev, ok: false };
  }
}

export type ClickTarget =
  | { zone: 'waste' }
  | { zone: 'tableau'; col: number; index: number }
  | { zone: 'foundation'; suit: Suit };

/**
 * Figures out the one best legal move for the card the player clicked, and
 * applies it immediately — foundation first (it's the move that makes
 * progress), then the first open tableau column. Returns `ok: false` with
 * the state unchanged when nothing legal is available for that card.
 */
export function autoMove(state: GameState, target: ClickTarget): MoveResult {
  if (state.wonAt != null) return { state, ok: false };

  if (target.zone === 'waste') {
    if (state.waste.length === 0) return { state, ok: false };
    const toFoundation = applyMove(state, { type: 'wasteToFoundation' });
    if (toFoundation.ok) return toFoundation;
    for (let col = 0; col < state.tableau.length; col++) {
      const toTableau = applyMove(state, { type: 'wasteToTableau', toCol: col });
      if (toTableau.ok) return toTableau;
    }
    return { state, ok: false };
  }

  if (target.zone === 'tableau') {
    const pile = state.tableau[target.col];
    const card = pile?.[target.index];
    if (!card || !card.faceUp) return { state, ok: false };

    if (target.index === pile.length - 1) {
      const toFoundation = applyMove(state, { type: 'tableauToFoundation', fromCol: target.col });
      if (toFoundation.ok) return toFoundation;
    }
    for (let col = 0; col < state.tableau.length; col++) {
      if (col === target.col) continue;
      const toTableau = applyMove(state, {
        type: 'tableauToTableau',
        fromCol: target.col,
        cardIndex: target.index,
        toCol: col,
      });
      if (toTableau.ok) return toTableau;
    }
    return { state, ok: false };
  }

  // target.zone === 'foundation': send its top card back out if some column can take it.
  const pile = state.foundations[target.suit];
  if (pile.length === 0) return { state, ok: false };
  for (let col = 0; col < state.tableau.length; col++) {
    const toTableau = applyMove(state, { type: 'foundationToTableau', suit: target.suit, toCol: col });
    if (toTableau.ok) return toTableau;
  }
  return { state, ok: false };
}

/**
 * Sweeps the whole board and sends every currently-eligible card — the
 * waste's top card, and each tableau column's top card — to its foundation,
 * cascading as newly-exposed cards themselves become eligible. This is the
 * "auto-complete" mode: one click advances however many foundation moves are
 * available right now, rather than targeting the single card clicked.
 */
export function autoCompleteFoundations(state: GameState): MoveResult {
  let current = state;
  let movedAny = false;
  let movedThisPass = true;

  while (movedThisPass) {
    movedThisPass = false;

    const wasteTry = applyMove(current, { type: 'wasteToFoundation' });
    if (wasteTry.ok) {
      current = wasteTry.state;
      movedAny = true;
      movedThisPass = true;
      continue;
    }

    for (let col = 0; col < current.tableau.length; col++) {
      if (current.tableau[col].length === 0) continue;
      const tableauTry = applyMove(current, { type: 'tableauToFoundation', fromCol: col });
      if (tableauTry.ok) {
        current = tableauTry.state;
        movedAny = true;
        movedThisPass = true;
        break;
      }
    }
  }

  return { state: current, ok: movedAny };
}

export function elapsedSeconds(state: GameState, now: number = Date.now()): number {
  const end = state.wonAt ?? now;
  return Math.max(0, Math.floor((end - state.startedAt) / 1000));
}
