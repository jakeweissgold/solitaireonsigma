import * as React from 'react';
import { Button, Card, SegmentedGroupField } from '@sigmacomputing/phi';
import { useLocation } from 'wouter';

import { LeaderboardPreview } from '../components/LeaderboardPreview';
import { SUIT_SYMBOL } from '../lib/cards';

const DIFFICULTIES = [
  { id: '1', label: '1 suit' },
  { id: '2', label: '2 suits' },
  { id: '4', label: '4 suits' },
];

function SuitRow({ suits }: { suits: readonly ('S' | 'H' | 'D' | 'C')[] }) {
  return (
    <div style={{ color: 'var(--colors-baseTertiaryForeground)', display: 'flex', fontSize: 20, gap: 6 }}>
      {suits.map((s, i) => (
        <span key={`${s}-${i}`}>{SUIT_SYMBOL[s]}</span>
      ))}
    </div>
  );
}

export default function MenuPage() {
  const [, navigate] = useLocation();
  const [difficulty, setDifficulty] = React.useState('2');

  return (
    <div
      style={{
        alignItems: 'center',
        background: 'var(--colors-baseCanvasSurface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 'clamp(24px, 6vw, 64px)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'center' }}>
        <h1 className="text-display-large" style={{ color: 'var(--colors-baseForeground)', margin: 0 }}>
          Solitaire
        </h1>
        <p className="text-copy-medium" style={{ color: 'var(--colors-baseSecondaryForeground)', margin: 0 }}>
          Pick a game. Your progress and scores are saved per game.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 24,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          maxWidth: 980,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card description="The classic. Draw three from the stock, build each foundation up by suit." title="Klondike">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SuitRow suits={['S', 'H', 'D', 'C']} />
              <Button label="Play Klondike" onPress={() => navigate('/klondike')} variant="primary" />
            </div>
          </Card>
          <LeaderboardPreview gameMode="klondike" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card description="Ten columns, no suit-matching required — stack any card on one rank higher." title="Spider">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SegmentedGroupField
                items={DIFFICULTIES}
                label="Difficulty"
                onSelectionChange={(key) => setDifficulty(String(key))}
                selectedKey={difficulty}
              />
              <Button label="Play Spider" onPress={() => navigate(`/spider/${difficulty}`)} variant="primary" />
            </div>
          </Card>
          <LeaderboardPreview gameMode={`spider-${difficulty}`} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card
            description="All 52 cards dealt face-up. Four free cells give you room to maneuver."
            title="FreeCell"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SuitRow suits={['S', 'H', 'D', 'C']} />
              <Button label="Play FreeCell" onPress={() => navigate('/freecell')} variant="primary" />
            </div>
          </Card>
          <LeaderboardPreview gameMode="freecell" />
        </div>
      </div>
    </div>
  );
}
