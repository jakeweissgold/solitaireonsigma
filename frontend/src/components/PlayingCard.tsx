import * as React from 'react';

import { Card, SUIT_SYMBOL, isRed, rankLabel } from '../lib/cards';

export const CARD_WIDTH = 76;
export const CARD_HEIGHT = 106;

interface PlayingCardProps {
  card: Card;
  selected?: boolean;
  faded?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  style?: React.CSSProperties;
}

export function PlayingCard({
  card,
  selected = false,
  faded = false,
  onClick,
  onDoubleClick,
  draggable = false,
  onDragStart,
  style,
}: PlayingCardProps) {
  const red = isRed(card.suit);

  const base: React.CSSProperties = {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 'var(--radii-small)',
    position: 'absolute',
    boxShadow: selected
      ? '0 0 0 3px var(--colors-accentBorder), 0 3px 8px var(--colors-shadowDefault)'
      : '0 2px 5px var(--colors-shadowDefault)',
    cursor: onClick ? 'pointer' : 'default',
    opacity: faded ? 0.55 : 1,
    transition: 'left 220ms ease, top 220ms ease, box-shadow 120ms ease, transform 120ms ease',
    transform: selected ? 'translateY(-6px)' : 'none',
    userSelect: 'none',
    ...style,
  };

  if (!card.faceUp) {
    return (
      <div
        style={{
          ...base,
          background: 'var(--colors-accentSecondarySurface)',
          border: '1px solid var(--colors-accentSecondaryBorder)',
        }}
        onClick={onClick}
        draggable={false}
      >
        <div
          style={{
            position: 'absolute',
            inset: 8,
            border: '1.5px solid var(--colors-accentSecondaryBorder)',
            borderRadius: 'var(--radii-xSmall)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              transform: 'rotate(45deg)',
              border: '2px solid var(--colors-accentBorder)',
            }}
          />
        </div>
      </div>
    );
  }

  const ink = red ? '#b4233c' : '#20242a';

  return (
    <div
      style={{
        ...base,
        background: '#fbf8f1',
        border: '1px solid rgba(0,0,0,0.12)',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 7,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          lineHeight: 1,
          color: ink,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600 }}>{rankLabel(card.rank)}</span>
        <span style={{ fontSize: 13 }}>{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: ink,
          fontSize: 32,
          opacity: 0.85,
        }}
      >
        {SUIT_SYMBOL[card.suit]}
      </div>
    </div>
  );
}
