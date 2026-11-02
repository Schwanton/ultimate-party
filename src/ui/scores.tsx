import { useEffect, useState } from 'react';
import type { PlayerInfo } from '@up/sdk';
import { Avatar, Crown } from './Avatar';
import { Confetti } from './layout';

/**
 * Wer hat wofür gestimmt – passt sich der Gruppengröße an:
 * bis 10 Abstimmende mit Namen, bis 40 nur Avatare, darüber gar nicht (nur Zahlen).
 */
export function VoterChips({ voters, crowdSize, onDark = true, delay = 0 }: { voters: PlayerInfo[]; crowdSize: number; onDark?: boolean; delay?: number }) {
  if (crowdSize > 40 || voters.length === 0) return null;
  const named = crowdSize <= 10;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start' }}>
      {voters.map((v, i) => (
        <span key={v.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999,
          padding: named ? 4 : 0, paddingRight: named ? 12 : 0,
          background: named ? (onDark ? 'rgba(17,13,36,.28)' : 'rgba(17,13,36,.14)') : undefined,
          animation: `upChip .4s ease-out ${(delay + 0.1 * i).toFixed(2)}s both`,
        }}>
          <Avatar player={v} size={named ? 32 : 34} flat={named} />
          {named && <span style={{ fontSize: 16, fontWeight: 700, color: onDark ? '#fff' : '#110D24' }}>{v.name}</span>}
        </span>
      ))}
    </div>
  );
}

export interface ScoreRow {
  player: PlayerInfo;
  before: number;
  after: number;
}

/** Zwischenstand: Balken wachsen vom alten zum neuen Punktestand, Pfeile zeigen Platzwechsel. */
export function Scoreboard({ rows, max = 8 }: { rows: ScoreRow[]; max?: number }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 700);
    return () => clearTimeout(t);
  }, []);
  // Platz = Anzahl der Spieler mit mehr Punkten (Gleichstand = gleicher Platz)
  const rankOf = (score: number, key: 'before' | 'after') => rows.filter((r) => r[key] > score).length;
  const sorted = [...rows].sort((a, b) => b.after - a.after);
  const shown = sorted.slice(0, max);
  const top = Math.max(1, sorted[0]?.after ?? 1);
  const rowH = shown.length > 8 ? 46 : 56;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {shown.map((r, i) => {
        const move = rankOf(r.before, 'before') - rankOf(r.after, 'after');
        const val = grown ? r.after : r.before;
        const first = i === 0;
        const barColor = r.player.color === '#262048' ? '#B8B2D9' : r.player.color;
        return (
          <li key={r.player.id} style={{
            height: rowH, display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', borderRadius: 18,
            background: first ? 'var(--surface-2)' : 'var(--surface)', boxShadow: first ? '0 0 0 3px var(--yellow)' : undefined,
            animation: `upSlideUp .5s ease-out ${(0.06 * i).toFixed(2)}s both`,
          }}>
            <span className="display" style={{ width: 28, textAlign: 'center', fontWeight: 800, fontSize: 24, color: first ? 'var(--yellow)' : 'var(--muted)' }}>{i + 1}</span>
            <Avatar player={r.player} size={rowH - 12} />
            <span style={{ width: 130, fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.player.name}</span>
            <div style={{ flex: 1, height: 36, display: 'flex', alignItems: 'center' }}>
              <div style={{
                height: 36, minWidth: 76, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                background: barColor, width: `${Math.max(0, (val / top) * 100)}%`, transition: 'width 1.2s cubic-bezier(.2,.9,.3,1.1)',
              }}>
                <span className="display" style={{ fontWeight: 800, fontSize: 18, color: '#110D24', paddingRight: 12 }}>{val}</span>
              </div>
            </div>
            <span className="display" style={{ width: 80, textAlign: 'right', fontWeight: 800, fontSize: 20, color: 'var(--yellow)', animation: grown ? `upPop .5s ease-out ${(0.2 + 0.06 * i).toFixed(2)}s both` : undefined, visibility: grown && r.after > r.before ? 'visible' : 'hidden' }}>
              +{r.after - r.before}
            </span>
            <span style={{
              width: 52, textAlign: 'center', fontSize: 17, fontWeight: 800, padding: '4px 0', borderRadius: 999, color: '#110D24',
              background: move > 0 ? 'var(--green)' : move < 0 ? 'var(--orange)' : 'var(--muted)', opacity: grown ? 1 : 0, transition: 'opacity .4s .8s',
            }}>{move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '–'}</span>
          </li>
        );
      })}
      {sorted.length > max && <li className="faint" style={{ textAlign: 'center', fontSize: 16 }}>+ {sorted.length - max}</li>}
    </ol>
  );
}

/** Siegerehrung mit Podest und Konfetti. */
export function Podium({ ranking, player, pointsLabel }: { ranking: { playerId: string; score: number }[]; player: (id: string) => PlayerInfo | undefined; pointsLabel: string }) {
  const top = ranking.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top[i]);
  const heights = [220, 160, 120];
  const colors = ['var(--yellow)', '#C9C6DD', '#E59A5C'];
  const rest = ranking.slice(3, 9);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 18 }}>
      <Confetti pieces={36} loop />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 24 }}>
        {order.map((i) => {
          const e = top[i];
          const p = player(e.playerId);
          if (!p) return null;
          return (
            <div key={e.playerId} style={{ width: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, animation: `upSlideUp .7s ease-out ${(0.5 + (2 - i) * 0.6).toFixed(1)}s both` }}>
              <div style={{ position: 'relative' }}>
                <Avatar player={p} size={i === 0 ? 120 : 92} />
                {i === 0 && <Crown size={52} style={{ position: 'absolute', top: -34, left: 34 }} />}
              </div>
              <span className="display" style={{ fontSize: i === 0 ? 30 : 24, fontWeight: 800 }}>{p.name}</span>
              <div style={{ width: '100%', height: heights[i], borderRadius: '20px 20px 0 0', background: colors[i], color: '#110D24', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, gap: 4 }}>
                <span className="display" style={{ fontSize: 44, fontWeight: 800 }}>{i + 1}</span>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{e.score} {pointsLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }} className="anim-fade">
          {rest.map((e, i) => {
            const p = player(e.playerId);
            return p ? (
              <span key={e.playerId} className="up-chip" style={{ fontSize: 16 }}>
                {i + 4}. <Avatar player={p} size={28} flat /> <b>{p.name}</b> {e.score}
              </span>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
