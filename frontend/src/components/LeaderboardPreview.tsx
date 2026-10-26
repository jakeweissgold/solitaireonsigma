import * as React from 'react';
import { Spinner } from '@sigmacomputing/phi';
import { PrimitiveTable } from '@sigmacomputing/viz-react/table';
import type { ColumnDef_t } from '@sigmacomputing/viz-react/table';

import { useLeaderboard } from '../lib/useLeaderboard';

interface LeaderboardPreviewProps {
  gameMode: string;
  limit?: number;
}

type Row = {
  rank: number;
  userName: string;
  score: number;
};

const COLUMNS: [ColumnDef_t<Row>, ...ColumnDef_t<Row>[]] = [
  { field: 'rank', label: '#', width: 32 },
  { field: 'userName', label: 'Player', width: { min: 120 } },
  { align: 'end', field: 'score', label: 'Score' },
];

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 28;

/** A compact, read-only top-N leaderboard for one game mode — no modal, meant to sit inline under a menu tile. */
export function LeaderboardPreview({ gameMode, limit = 5 }: LeaderboardPreviewProps) {
  const { loading, error, entries } = useLeaderboard(gameMode, limit, true);

  const rows: Row[] = React.useMemo(
    () => entries.map((e) => ({ rank: e.rank, userName: e.userName, score: e.score })),
    [entries],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="text-copy-small" style={{ color: 'var(--colors-baseSecondaryForeground)' }}>
        Top scores
      </span>
      {loading ? (
        <div style={{ alignItems: 'center', display: 'flex', height: HEADER_HEIGHT + ROW_HEIGHT, justifyContent: 'center' }}>
          <Spinner label="Loading leaderboard" size="small" />
        </div>
      ) : error ? (
        <p className="text-copy-small" style={{ color: 'var(--colors-destructiveForeground)', margin: 0 }}>
          {error}
        </p>
      ) : (
        <div
          style={{
            '--phi-table-cell-padding-y': 'var(--space-1)',
            '--phi-table-font-size': 'var(--fontSizes-small)',
            '--phi-table-line-height': 'var(--lineHeights-small)',
            height: HEADER_HEIGHT + Math.max(rows.length, 1) * ROW_HEIGHT,
            width: '100%',
          }}
        >
          <PrimitiveTable<Row>
            ariaLabel="Top scores"
            columns={COLUMNS}
            data={rows}
            empty={
              <p className="text-copy-small" style={{ color: 'var(--colors-baseSecondaryForeground)', margin: 0 }}>
                No finished games yet.
              </p>
            }
          />
        </div>
      )}
    </div>
  );
}
