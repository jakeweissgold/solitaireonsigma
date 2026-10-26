export type Suit = 'S' | 'H' | 'D' | 'C';

export interface Card {
  id: string;
  suit: Suit;
  rank: number; // 1 = Ace ... 13 = King
  faceUp: boolean;
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export const SUIT_NAME: Record<Suit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank - 1] ?? String(rank);
}

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: `${suit}${rank}`, suit, rank, faceUp: false });
    }
  }
  return deck;
}

export type SpiderSuitCount = 1 | 2 | 4;

/**
 * Spider Solitaire is always played with 104 cards (two standard decks).
 * Easier difficulties restrict which suits appear, repeating each one more
 * times to still fill 104 cards: 1 suit repeats 8 times, 2 suits 4 times
 * each, 4 suits (standard) 2 times each. Duplicate cards need distinct ids.
 */
export function buildSpiderDeck(suitCount: SpiderSuitCount): Card[] {
  const suitsInPlay: Suit[] = suitCount === 1 ? ['S'] : suitCount === 2 ? ['S', 'H'] : SUITS;
  const setsPerSuit = 8 / suitCount;
  const deck: Card[] = [];
  let counter = 0;
  for (let set = 0; set < setsPerSuit; set++) {
    for (const suit of suitsInPlay) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ id: `${suit}${rank}-${counter++}`, suit, rank, faceUp: false });
      }
    }
  }
  return deck;
}

export function shuffled<T>(arr: readonly T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}
