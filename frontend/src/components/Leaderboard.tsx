import * as React from 'react';
import { Modal, Spinner } from '@sigmacomputing/phi';
import { PrimitiveTable } from '@sigmacomputing/viz-react/table';
import type { ColumnDef_t } from '@sigmacomputing/viz-react/table';

import { useLeaderboard } from '../lib/useLeaderboard';

interface LeaderboardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  refreshKey: number;
  gameMode: string;
  title?: string;
}

type Row = {
  rank: number;
  userName: string;
  score: number;
  moves: number;
  timeLabel: string;
  dateLabel: string;
};

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const COLUMNS: [ColumnDef_t<Row>, ...ColumnDef_t<Row>[]] = [
  { field: 'rank', label: '#', width: 48 },
  { field: 'userName', label: 'Player', width: { min: 160 } },
  { align: 'end', field: 'score', label: 'Score' },
  { align: 'end', field: 'moves', label: 'Moves' },
  { align: 'end', field: 'timeLabel', label: 'Time' },
  { align: 'end', field: 'dateLabel', label: 'Won' },
];

export function Leaderboard({ isOpen, onOpenChange, refreshKey, gameMode, title = 'Leaderboard' }: LeaderboardProps) {
  const { loading, error, entries, you } = useLeaderboard(gameMode, 20, isOpen, refreshKey);

  const rows = React.useMemo(
    () =>
      entries.map((entry) => {
        const date = entry.wonAt ? new Date(entry.wonAt) : null;
        return {
          rank: entry.rank,
          userName: entry.userName,
          score: entry.score,
          moves: entry.moves,
          timeLabel: formatDuration(entry.durationSeconds),
          dateLabel: date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '—',
        };
      }),
    [entries],
  );

  return (
    <Modal
      description="Fastest, highest-scoring finished games across every player."
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      rightButtons={<Modal.CloseButton label="Close" variant="secondary" />}
      size="large"
      title={title}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 360 }}>
        {you && (
          <div
            className="text-copy-medium"
            style={{ color: 'var(--colors-baseSecondaryForeground)' }}
          >
            Your best finish: rank {you.rank} with {you.score} points, {you.moves} moves, in{' '}
            {formatDuration(you.durationSeconds)}.
          </div>
        )}
        {loading ? (
          <div style={{ alignItems: 'center', display: 'flex', flex: 1, justifyContent: 'center' }}>
            <Spinner label="Loading leaderboard" size="large" />
          </div>
        ) : error ? (
          <p className="text-copy-medium" style={{ color: 'var(--colors-destructiveForeground)' }}>
            {error}
          </p>
        ) : (
          <div style={{ flex: 1, minHeight: 320, width: '100%' }}>
            <PrimitiveTable<Row>
              ariaLabel="Solitaire leaderboard"
              columns={COLUMNS}
              data={rows}
              empty={
                <p className="text-copy-medium" style={{ color: 'var(--colors-baseSecondaryForeground)' }}>
                  No finished games yet. Win a round to take the top spot.
                </p>
              }
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
