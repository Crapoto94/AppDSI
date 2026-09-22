import React from 'react';

export interface CloudWord {
  word: string;
  count: number;
  weight: number;
}

const COLORS = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f', '#9333ea', '#c2410c', '#0e7490'];

interface Props {
  words: CloudWord[];
  height?: number;
  onWordClick?: (word: string) => void;
  emptyLabel?: string;
}

/**
 * Nuage de mots maison (aucune dépendance) : la taille de police est
 * proportionnelle au poids du mot, la couleur dépend du poids relatif.
 */
export default function WordCloud({ words, height = 320, onWordClick, emptyLabel = 'Aucun mot pour le moment' }: Props) {
  if (!words || words.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height, color: '#94a3b8', fontSize: 13 }}>
        {emptyLabel}
      </div>
    );
  }

  const max = Math.max(...words.map(w => w.count || 0), 1);

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center',
      justifyContent: 'center', alignContent: 'center', padding: 16, minHeight: height,
    }}>
      {words.map((w, i) => {
        const ratio = max > 0 ? (w.count || 0) / max : 0;
        const size = 12 + Math.round(ratio * 30);
        const color = COLORS[(i + Math.round(ratio * 3)) % COLORS.length];
        return (
          <span
            key={w.word}
            title={`${w.word} — ${w.count} occurrence${w.count > 1 ? 's' : ''}`}
            onClick={() => onWordClick?.(w.word)}
            style={{
              fontSize: size,
              fontWeight: size > 26 ? 800 : size > 18 ? 700 : 600,
              color,
              cursor: onWordClick ? 'pointer' : 'default',
              lineHeight: 1.1,
              opacity: 0.55 + ratio * 0.45,
              transition: 'transform .12s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (onWordClick) e.currentTarget.style.transform = 'scale(1.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
}
