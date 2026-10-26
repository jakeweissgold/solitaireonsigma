import * as React from 'react';
import { Button, Modal, Spinner, ToggleField, addToast } from '@sigmacomputing/phi';
import { callEndpoint } from '@sigmacomputing/runtime/endpoint';
import { useCurrentUser } from '@sigmacomputing/runtime/session';

import { CARD_HEIGHT, CARD_WIDTH, PlayingCard } from '../components/PlayingCard';
import { Leaderboard } from '../components/Leaderboard';
import { Card, SUITS, SUIT_SYMBOL, Suit } from '../lib/cards';
import {
  FreeCellGameState,
  UNDO_PENALTY,
  autoCompleteFreeCellFoundations,
  autoMoveFreeCell,
  computeScore,
  elapsedSeconds,
  newFreeCellGame,
  undoFreeCellMove,
} from '../lib/freecellEngine';
import { loadFreeCellGame, saveFreeCellGame } from '../lib/freecellPersistence';
import { useElementWidth } from '../lib/useElementWidth';
import { BackToMenuButton } from '../components/BackToMenuButton';

const COLUMN_COUNT = 8;
const COLUMN_GAP = 14;
const TABLEAU_STEP = 28;
const ROW_GAP = 32;
// Top row slots, left to right: four free cells, then the four suit foundations.
const FREE_CELL_START_COL = 0;
const FOUNDATION_START_COL = 4;

function colX(col: number): number {
  return col * (CARD_WIDTH + COLUMN_GAP);
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatScore(score: number): string {
  return score % 1 === 0 ? String(score) : score.toFixed(1);
}

function EmptySlot({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      aria-label={label}
      onClick={onClick}
      style={{
        alignItems: 'center',
        border: '1.5px dashed var(--colors-baseDividerBorder)',
        borderRadius: 'var(--radii-small)',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        height: CARD_HEIGHT,
        justifyContent: 'center',
        width: CARD_WIDTH,
      }}
    >
      {children}
    </div>
  );
}

export default function FreeCellPage() {
  const { user, error: userError } = useCurrentUser();
  const [gameState, setGameState] = React.useState<FreeCellGameState | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [showLeaderboard, setShowLeaderboard] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [winModalOpen, setWinModalOpen] = React.useState(false);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = React.useState(0);
  const [foundationOnly, setFoundationOnly] = React.useState(false);
  const [history, setHistory] = React.useState<FreeCellGameState[]>([]);
  const [boardAreaRef, boardAreaWidth] = useElementWidth();
  const hydratedForRef = React.useRef<string | null>(null);

  // Pick up a game already in progress for this viewer — or deal a fresh one
  // the first time there's nothing saved — as soon as we know who's playing.
  React.useEffect(() => {
    if (gameState) return;
    if (user) {
      hydratedForRef.current = user.userId;
      setGameState(loadFreeCellGame(user.userId) ?? newFreeCellGame());
    } else if (userError) {
      setGameState(newFreeCellGame());
    }
  }, [user, userError, gameState]);

  React.useEffect(() => {
    if (!user || !gameState) return;
    saveFreeCellGame(user.userId, gameState);
  }, [user, gameState]);

  React.useEffect(() => {
    if (!gameState || gameState.wonAt != null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [gameState]);

  React.useEffect(() => {
    if (!gameState || gameState.wonAt == null) return;
    setWinModalOpen(true);
    if (gameState.submitted) {
      setSaveState('saved');
      return;
    }
    setSaveState('saving');
    const wonAt = gameState.wonAt;
    const duration = Math.max(0, Math.floor((wonAt - gameState.startedAt) / 1000));
    const finalScore = Math.round(computeScore(gameState, wonAt));
    callEndpoint('recordWin', { args: ['freecell', finalScore, gameState.moves, duration] })
      .then(() => {
        setSaveState('saved');
        setLeaderboardRefreshKey((k) => k + 1);
        setGameState((prev) => (prev ? { ...prev, submitted: true } : prev));
      })
      .catch(() => {
        setSaveState('error');
      });
  }, [gameState]);

  if (!gameState) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: 'var(--colors-baseCanvasSurface)',
          display: 'flex',
          height: '100vh',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <Spinner label="Loading your game" size="large" />
      </div>
    );
  }

  const elapsed = elapsedSeconds(gameState, now);
  const liveScore = computeScore(gameState, now);

  const startNewGame = () => {
    setGameState(newFreeCellGame());
    setHistory([]);
    setWinModalOpen(false);
    setSaveState('idle');
    setConfirmReset(false);
  };

  const requestNewGame = () => {
    if (gameState.moves > 0 && gameState.wonAt == null) {
      setConfirmReset(true);
    } else {
      startNewGame();
    }
  };

  // One click does the thinking: foundation first, then the first legal
  // tableau column — stacking onto a matching card before an empty one —
  // as a supermove when there's a sequence and the capacity allows it, then
  // an empty free cell as a last resort. This normal move logic always
  // stays available; auto-complete never blocks it. With auto-complete on,
  // a successful move is also followed by a sweep that grabs any other
  // card — anywhere on the board — that just became eligible for its
  // foundation. If the clicked card itself has no direct move, auto-complete
  // still lets that click trigger a sweep of the rest of the board.
  const playAuto = (target: Parameters<typeof autoMoveFreeCell>[1]) => {
    const direct = autoMoveFreeCell(gameState, target);
    if (direct.ok) {
      setHistory((h) => [...h, gameState]);
      const swept = foundationOnly ? autoCompleteFreeCellFoundations(direct.state) : direct;
      setGameState(swept.ok ? swept.state : direct.state);
      return;
    }
    if (foundationOnly) {
      const swept = autoCompleteFreeCellFoundations(gameState);
      if (swept.ok) {
        setHistory((h) => [...h, gameState]);
        setGameState(swept.state);
      }
    }
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setGameState(undoFreeCellMove(previous, gameState.penalty));
  };

  const onTableauCardClick = (col: number, index: number) => playAuto({ zone: 'tableau', col, index });

  const onFreeCellClick = (index: number) => playAuto({ zone: 'freeCell', index });

  const onFoundationClick = (suit: Suit) => playAuto({ zone: 'foundation', suit });

  // One combined, flat list of every card currently on the board, each with
  // its board coordinates. Rendering them all from a single array lets
  // React match a card by key as it crosses from one pile to another and
  // glide it there instead of discarding and recreating the element.
  const visibleCards: Array<{ card: Card; left: number; top: number; zIndex: number; onClick?: () => void }> = [];

  gameState.freeCells.forEach((card, i) => {
    if (!card) return;
    visibleCards.push({
      card,
      left: colX(FREE_CELL_START_COL + i),
      top: 0,
      zIndex: 1,
      onClick: () => onFreeCellClick(i),
    });
  });

  SUITS.forEach((suit, i) => {
    const pile = gameState.foundations[suit];
    const top = pile[pile.length - 1];
    if (!top) return;
    visibleCards.push({
      card: top,
      left: colX(FOUNDATION_START_COL + i),
      top: 0,
      zIndex: 1,
      onClick: () => onFoundationClick(suit),
    });
  });

  gameState.tableau.forEach((pile, col) => {
    pile.forEach((card, index) => {
      visibleCards.push({
        card,
        left: colX(col),
        top: CARD_HEIGHT + ROW_GAP + index * TABLEAU_STEP,
        zIndex: index,
        onClick: () => onTableauCardClick(col, index),
      });
    });
  });

  const boardNaturalWidth = colX(COLUMN_COUNT - 1) + CARD_WIDTH;
  const boardNaturalHeight =
    CARD_HEIGHT + ROW_GAP + Math.max(0, ...gameState.tableau.map((pile) => pile.length - 1)) * TABLEAU_STEP + CARD_HEIGHT + 8;
  const boardScale = boardAreaWidth > 0 ? Math.min(1, boardAreaWidth / boardNaturalWidth) : 1;

  const retrySave = () => {
    setSaveState('saving');
    const duration = elapsedSeconds(gameState, gameState.wonAt ?? now);
    const finalScore = Math.round(computeScore(gameState, gameState.wonAt ?? now));
    callEndpoint('recordWin', { args: ['freecell', finalScore, gameState.moves, duration] })
      .then(() => {
        setSaveState('saved');
        setLeaderboardRefreshKey((k) => k + 1);
        setGameState((prev) => (prev ? { ...prev, submitted: true } : prev));
      })
      .catch(() => {
        setSaveState('error');
        addToast({ status: 'destructive', title: 'Could not save your score' });
      });
  };

  return (
    <div
      style={{
        background: 'var(--colors-baseCanvasSurface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        minHeight: '100vh',
        overflowX: 'hidden',
        padding: 'clamp(14px, 4vw, 28px) clamp(14px, 4vw, 36px) clamp(20px, 6vw, 48px)',
      }}
    >
      <header
        style={{
          alignItems: 'baseline',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flex: '1 1 260px', flexDirection: 'column', gap: 4 }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
            <BackToMenuButton />
            <h1 className="text-display-small" style={{ color: 'var(--colors-baseForeground)', margin: 0 }}>
              FreeCell Solitaire
            </h1>
          </div>
          <p className="text-copy-small" style={{ color: 'var(--colors-baseSecondaryForeground)', margin: 0 }}>
            Every card is dealt face-up. Click any card — it moves itself to the best legal spot automatically.
          </p>
        </div>
        <div style={{ alignItems: 'center', display: 'flex', flex: '1 1 320px', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-end' }}>
          <div className="text-copy-medium" style={{ color: 'var(--colors-baseForeground)', whiteSpace: 'nowrap' }}>
            Score {formatScore(liveScore)}
            <span style={{ color: 'var(--colors-baseTertiaryForeground)' }}> · </span>
            Moves {gameState.moves}
            <span style={{ color: 'var(--colors-baseTertiaryForeground)' }}> · </span>
            {formatClock(elapsed)}
          </div>
          <ToggleField
            isSelected={foundationOnly}
            label="Auto-complete to foundations"
            onSelectionChange={setFoundationOnly}
          />
          <Button
            icon="Undo"
            isDisabled={history.length === 0 || gameState.wonAt != null}
            label={`Undo (-${UNDO_PENALTY})`}
            onPress={undo}
            variant="secondary"
          />
          <Button icon="VizTable" label="Leaderboard" onPress={() => setShowLeaderboard(true)} variant="secondary" />
          <Button icon="Refresh" label="New game" onPress={requestNewGame} variant="primary" />
        </div>
      </header>

      <div ref={boardAreaRef} style={{ width: '100%' }}>
        <div style={{ height: boardNaturalHeight * boardScale, margin: '0 auto', width: boardNaturalWidth * boardScale }}>
          <div
            style={{
              height: boardNaturalHeight,
              position: 'relative',
              transform: `scale(${boardScale})`,
              transformOrigin: 'top left',
              width: boardNaturalWidth,
            }}
          >
            {gameState.freeCells.map((card, i) =>
              card ? null : (
                <div key={`empty-cell-${i}`} style={{ left: colX(FREE_CELL_START_COL + i), position: 'absolute', top: 0 }}>
                  <EmptySlot label={`Free cell ${i + 1}, empty`} />
                </div>
              ),
            )}
            {SUITS.map((suit, i) =>
              gameState.foundations[suit].length === 0 ? (
                <div key={`empty-${suit}`} style={{ left: colX(FOUNDATION_START_COL + i), position: 'absolute', top: 0 }}>
                  <EmptySlot label={`${suit} foundation`} onClick={() => onFoundationClick(suit)}>
                    <span className="text-display-small" style={{ color: 'var(--colors-baseTertiaryForeground)' }}>
                      {SUIT_SYMBOL[suit]}
                    </span>
                  </EmptySlot>
                </div>
              ) : null,
            )}
            {gameState.tableau.map((pile, col) =>
              pile.length === 0 ? (
                <div
                  key={`empty-col-${col}`}
                  style={{ left: colX(col), position: 'absolute', top: CARD_HEIGHT + ROW_GAP }}
                >
                  <EmptySlot label={`Column ${col + 1}, empty`} />
                </div>
              ) : null,
            )}

            {visibleCards.map(({ card, left, top, zIndex, onClick }) => (
              <PlayingCard card={card} key={`${gameState.startedAt}-${card.id}`} onClick={onClick} style={{ left, top, zIndex }} />
            ))}
          </div>
        </div>
      </div>

      <Leaderboard
        gameMode="freecell"
        isOpen={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        refreshKey={leaderboardRefreshKey}
        title="FreeCell Leaderboard"
      />

      <Modal
        description="Starting a new game clears the current board. Your saved scores are untouched."
        isOpen={confirmReset}
        onOpenChange={setConfirmReset}
        rightButtons={
          <>
            <Modal.CloseButton label="Keep playing" variant="secondary" />
            <Button label="Start new game" onPress={startNewGame} variant="primary" />
          </>
        }
        size="xSmall"
        title="Start a new game?"
      />

      <Modal
        description={
          saveState === 'saving'
            ? 'Saving your score…'
            : saveState === 'saved'
              ? 'Your score was added to the leaderboard.'
              : saveState === 'error'
                ? 'We could not save your score.'
                : undefined
        }
        isOpen={winModalOpen}
        onOpenChange={setWinModalOpen}
        rightButtons={
          saveState === 'error' ? (
            <>
              <Button label="Retry save" onPress={retrySave} variant="secondary" />
              <Button label="New game" onPress={startNewGame} variant="primary" />
            </>
          ) : (
            <>
              <Button
                label="View leaderboard"
                onPress={() => {
                  setWinModalOpen(false);
                  setShowLeaderboard(true);
                }}
                variant="secondary"
              />
              <Button isPending={saveState === 'saving'} label="New game" onPress={startNewGame} variant="primary" />
            </>
          )
        }
        size="small"
        title="You win!"
      >
        <div className="text-copy-medium" style={{ color: 'var(--colors-baseForeground)' }}>
          Final score {formatScore(computeScore(gameState, gameState.wonAt ?? now))} · {gameState.moves} moves ·{' '}
          {formatClock(elapsedSeconds(gameState, gameState.wonAt ?? now))}
        </div>
      </Modal>
    </div>
  );
}
