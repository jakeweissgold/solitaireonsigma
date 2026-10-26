import * as React from 'react';
import { Button, Modal, Spinner, addToast } from '@sigmacomputing/phi';
import { callEndpoint } from '@sigmacomputing/runtime/endpoint';
import { useCurrentUser } from '@sigmacomputing/runtime/session';
import { useParams } from 'wouter';

import { CARD_HEIGHT, CARD_WIDTH, PlayingCard } from '../components/PlayingCard';
import { Leaderboard } from '../components/Leaderboard';
import { Card, SUIT_SYMBOL, SpiderSuitCount } from '../lib/cards';
import {
  SpiderGameState,
  autoMoveSpider,
  computeScore,
  dealFromStock,
  elapsedSeconds,
  newSpiderGame,
} from '../lib/spiderEngine';
import { loadSpiderGame, saveSpiderGame } from '../lib/spiderPersistence';
import { useElementWidth } from '../lib/useElementWidth';
import { BackToMenuButton } from '../components/BackToMenuButton';

const COLUMN_COUNT = 10;
const COLUMN_GAP = 12;
const TABLEAU_STEP = 26;
const ROW_GAP = 32;

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

function parseSuitCount(raw: string | undefined): SpiderSuitCount | null {
  if (raw === '1') return 1;
  if (raw === '2') return 2;
  if (raw === '4') return 4;
  return null;
}

function EmptySlot({ label, onClick }: { label: string; onClick?: () => void }) {
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
    />
  );
}

export default function SpiderPage() {
  const params = useParams<{ suits: string }>();
  const suitCount = parseSuitCount(params.suits);

  const { user, error: userError } = useCurrentUser();
  const [gameState, setGameState] = React.useState<SpiderGameState | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [showLeaderboard, setShowLeaderboard] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [winModalOpen, setWinModalOpen] = React.useState(false);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = React.useState(0);
  const [boardAreaRef, boardAreaWidth] = useElementWidth();
  const hydratedForRef = React.useRef<string | null>(null);

  // Pick up a game already in progress at this difficulty, or deal a fresh
  // one the first time there's nothing saved.
  React.useEffect(() => {
    if (!suitCount || gameState) return;
    const key = `${suitCount}`;
    if (user) {
      if (hydratedForRef.current === `${user.userId}:${key}`) return;
      hydratedForRef.current = `${user.userId}:${key}`;
      setGameState(loadSpiderGame(user.userId, suitCount) ?? newSpiderGame(suitCount));
    } else if (userError) {
      setGameState(newSpiderGame(suitCount));
    }
  }, [user, userError, gameState, suitCount]);

  React.useEffect(() => {
    if (!user || !gameState) return;
    saveSpiderGame(user.userId, gameState);
  }, [user, gameState]);

  React.useEffect(() => {
    if (!gameState || gameState.wonAt != null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [gameState]);

  const gameMode = suitCount ? `spider-${suitCount}` : null;

  React.useEffect(() => {
    if (!gameState || gameState.wonAt == null || !gameMode) return;
    setWinModalOpen(true);
    if (gameState.submitted) {
      setSaveState('saved');
      return;
    }
    setSaveState('saving');
    const wonAt = gameState.wonAt;
    const duration = Math.max(0, Math.floor((wonAt - gameState.startedAt) / 1000));
    const finalScore = Math.round(computeScore(gameState, wonAt));
    callEndpoint('recordWin', { args: [gameMode, finalScore, gameState.moves, duration] })
      .then(() => {
        setSaveState('saved');
        setLeaderboardRefreshKey((k) => k + 1);
        setGameState((prev) => (prev ? { ...prev, submitted: true } : prev));
      })
      .catch(() => {
        setSaveState('error');
      });
  }, [gameState, gameMode]);

  if (!suitCount) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: 'var(--colors-baseCanvasSurface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          height: '100vh',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <p className="text-copy-medium" style={{ color: 'var(--colors-baseSecondaryForeground)' }}>
          That difficulty doesn't exist.
        </p>
        <BackToMenuButton />
      </div>
    );
  }

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
    setGameState(newSpiderGame(suitCount));
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

  const onStockClick = () => {
    const res = dealFromStock(gameState);
    if (res.ok) setGameState(res.state);
  };

  const onTableauCardClick = (col: number, index: number) => {
    const res = autoMoveSpider(gameState, col, index);
    if (res.ok) setGameState(res.state);
  };

  // One combined, flat list of every visible card, each with its board
  // coordinates — rendering from one array (rather than one per pile) lets
  // React match a card by key across piles and animate the move instead of
  // tearing down and recreating the element.
  const visibleCards: Array<{ card: Card; left: number; top: number; zIndex: number; onClick?: () => void }> = [];

  gameState.stock.forEach((card, i) => {
    visibleCards.push({
      card: { ...card, faceUp: false },
      left: Math.floor(i / COLUMN_COUNT) * 4,
      top: 0,
      zIndex: i,
      onClick: onStockClick,
    });
  });

  gameState.tableau.forEach((pile, col) => {
    pile.forEach((card, index) => {
      visibleCards.push({
        card,
        left: colX(col),
        top: CARD_HEIGHT + ROW_GAP + index * TABLEAU_STEP,
        zIndex: index,
        onClick: card.faceUp ? () => onTableauCardClick(col, index) : undefined,
      });
    });
  });

  const boardNaturalWidth = colX(COLUMN_COUNT - 1) + CARD_WIDTH;
  const boardNaturalHeight =
    CARD_HEIGHT + ROW_GAP + Math.max(0, ...gameState.tableau.map((pile) => pile.length - 1)) * TABLEAU_STEP + CARD_HEIGHT + 8;
  const boardScale = boardAreaWidth > 0 ? Math.min(1, boardAreaWidth / boardNaturalWidth) : 1;

  const retrySave = () => {
    if (!gameMode) return;
    setSaveState('saving');
    const duration = elapsedSeconds(gameState, gameState.wonAt ?? now);
    const finalScore = Math.round(computeScore(gameState, gameState.wonAt ?? now));
    callEndpoint('recordWin', { args: [gameMode, finalScore, gameState.moves, duration] })
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

  const difficultyLabel = suitCount === 1 ? '1 suit' : suitCount === 2 ? '2 suits' : '4 suits';

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
              Spider Solitaire
            </h1>
          </div>
          <p className="text-copy-small" style={{ color: 'var(--colors-baseSecondaryForeground)', margin: 0 }}>
            {difficultyLabel} · Click any card to send it where it legally fits. Completed runs clear automatically.
          </p>
        </div>
        <div style={{ alignItems: 'center', display: 'flex', flex: '1 1 320px', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-end' }}>
          <div className="text-copy-medium" style={{ color: 'var(--colors-baseForeground)', whiteSpace: 'nowrap' }}>
            Score {formatScore(liveScore)}
            <span style={{ color: 'var(--colors-baseTertiaryForeground)' }}> · </span>
            Runs {gameState.completedRuns.length}/8
            <span style={{ color: 'var(--colors-baseTertiaryForeground)' }}> · </span>
            {formatClock(elapsed)}
          </div>
          <Button icon="VizTable" label="Leaderboard" onPress={() => setShowLeaderboard(true)} variant="secondary" />
          <Button icon="Refresh" label="New game" onPress={requestNewGame} variant="primary" />
        </div>
      </header>

      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const suit = gameState.completedRuns[i];
          return (
            <div
              key={i}
              style={{
                alignItems: 'center',
                background: suit ? 'var(--colors-accentSurface)' : 'transparent',
                border: `1.5px ${suit ? 'solid' : 'dashed'} var(--colors-baseDividerBorder)`,
                borderRadius: 'var(--radii-small)',
                color: suit ? 'var(--colors-accentSecondaryForeground)' : 'var(--colors-baseTertiaryForeground)',
                display: 'flex',
                fontSize: 16,
                height: 28,
                justifyContent: 'center',
                width: 28,
              }}
            >
              {suit ? SUIT_SYMBOL[suit] : ''}
            </div>
          );
        })}
      </div>

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
            {gameState.stock.length === 0 && (
              <div style={{ left: 0, position: 'absolute', top: 0 }}>
                <EmptySlot label="Stock, empty" />
              </div>
            )}
            {gameState.tableau.map((pile, col) =>
              pile.length === 0 ? (
                <div key={`empty-col-${col}`} style={{ left: colX(col), position: 'absolute', top: CARD_HEIGHT + ROW_GAP }}>
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
        gameMode={gameMode ?? 'spider-4'}
        isOpen={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        refreshKey={leaderboardRefreshKey}
        title={`Spider Leaderboard (${difficultyLabel})`}
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
