/**
 * Zahlenstrahl-Auflösung auf dem TV (gleiche Datei in Schätzmeister und Guess the Clicks).
 * Ablauf und Zeiten stehen in reveal.ts; hier wird nur gezeichnet.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import type { PlayerInfo } from '@up/sdk';
import { Avatar, Confetti, Crown, sfx, useServerNow } from '@up/ui';
import { START_DELAY, buildPlan, lg, stateAt } from './reveal';

export interface StrahlEntry {
  playerId: string;
  guess: number;
  /** am nächsten dran (am Ende hervorgehoben) */
  win?: boolean;
  /** z. B. „+1000“ – erscheint am Ende neben dem Tipp */
  badge?: string;
}

export interface StrahlLabels {
  placing: string;
  zoom: string;
  out: (names: string) => string;
  drum: string;
  answer: string;
}

export type StrahlPhase = 'placing' | 'zoom' | 'out' | 'drum' | 'answer' | 'done';

const W = 1168;
const LINE_Y = 456;
const X0 = 96;
const X1 = W - 50;
const EASE = 'cubic-bezier(.4,0,.2,1)';

function niceStep(span: number) {
  const raw = span / 6;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function ticksFor(lo: number, hi: number, log: boolean): number[] {
  if (log) {
    const out: number[] = [];
    for (let e = 0; e <= 12; e++) {
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** e;
        if (v >= lo && v <= hi) out.push(v);
      }
    }
    // zu viele: nur Zehnerpotenzen
    return out.length > 9 ? out.filter((v) => /^10*$/.test(String(v))) : out;
  }
  const step = niceStep(hi - lo);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function Strahl({ answer, entries, startAt, player, color, short, answerText, labels, children }: {
  answer: number;
  entries: StrahlEntry[];
  startAt: number;
  player: (id: string) => PlayerInfo | undefined;
  color: string;
  short: (n: number) => string;
  /** große Anzeige der echten Zahl */
  answerText: string;
  labels: StrahlLabels;
  /** Bereich oben links (Frage, Video …); bekommt die aktuelle Phase */
  children?: (phase: StrahlPhase) => ReactNode;
}) {
  const plan = useMemo(() => buildPlan(answer, entries), [startAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useServerNow(50);
  const t = (now - startAt) / 1000 - START_DELAY;
  const st = stateAt(plan, t);
  const { lo, hi } = st.range;
  const log = st.range.log;
  const x = (v: number) => {
    const f = log ? (lg(v) - lg(lo)) / Math.max(1e-9, lg(hi) - lg(lo)) : (v - lo) / Math.max(1e-9, hi - lo);
    return X0 + Math.max(-0.02, Math.min(1.02, f)) * (X1 - X0);
  };

  const visible = entries.filter((e) => st.placed(e.playerId) && !st.removed.has(e.playerId) && player(e.playerId));
  const crowd = entries.length > 12;
  const boxW = crowd ? 38 : 112;
  const laneH = crowd ? 42 : 88;
  const lanes = crowd ? 7 : 3;
  const avatar = crowd ? 32 : 46;

  // Spuren verteilen, damit sich Tipps nicht überdecken
  const lane = new Map<string, number>();
  const lastX: number[] = [];
  for (const e of [...visible].sort((a, b) => a.guess - b.guess)) {
    const xx = x(e.guess);
    let l = lastX.findIndex((lx) => xx - lx >= boxW + 6);
    if (l < 0) l = lastX.length < lanes ? lastX.length : lastX.indexOf(Math.min(...lastX));
    lastX[l] = xx;
    lane.set(e.playerId, l);
  }

  const lastOut = [...plan.outs].reverse().find((o) => t >= o.at);
  const phase: StrahlPhase = st.done ? 'done' : st.answer ? 'answer' : st.drum ? 'drum' : lastOut && t < lastOut.at + 1.9 ? 'out'
    : plan.ranges[1] && t >= plan.ranges[1].at ? 'zoom' : 'placing';
  const placedCount = entries.filter((e) => st.placed(e.playerId)).length;
  const outCount = plan.outs.filter((o) => t >= o.at).length;
  const winners = entries.filter((e) => e.win);

  useEffect(() => { if (placedCount > 0) sfx.play('pop'); }, [placedCount]);
  useEffect(() => { if (phase === 'zoom') sfx.play('whoosh'); }, [phase]);
  useEffect(() => { if (outCount > 0) sfx.play('wrong'); }, [outCount]);
  useEffect(() => { if (st.drum) sfx.play('drumroll'); }, [st.drum]);
  useEffect(() => { if (st.answer) sfx.play('ding'); }, [st.answer]);
  useEffect(() => { if (st.done && winners.length) sfx.play('fanfare'); }, [st.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = phase === 'placing' ? labels.placing : phase === 'zoom' ? labels.zoom
    : phase === 'out' ? labels.out(lastOut!.ids.map((id) => player(id)?.name ?? '?').join(', '))
      : phase === 'drum' ? labels.drum : labels.answer;
  const ticks = ticksFor(lo, hi, log);
  const ax = x(answer);

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      {st.done && winners.length > 0 && <Confetti silent />}
      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 150, display: 'flex', gap: 28, alignItems: 'flex-start' }}>
        {children?.(phase)}
        <div style={{ marginLeft: 'auto', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {st.answer ? (
            <>
              <span className="display anim-pop" style={{ fontSize: 58, fontWeight: 800, lineHeight: 1, color: 'var(--yellow)', fontVariantNumeric: 'tabular-nums' }}>{answerText}</span>
              <span className="muted" style={{ fontSize: 18 }}>{labels.answer}</span>
            </>
          ) : (
            <p key={status} className="display anim-pop" style={{ fontSize: phase === 'drum' ? 40 : 28, fontWeight: 800, color: phase === 'out' ? 'var(--red)' : phase === 'drum' ? 'var(--yellow)' : '#fff', maxWidth: 520, animation: phase === 'drum' ? 'upTick .5s ease-in-out infinite' : undefined }}>{status}</p>
          )}
        </div>
      </div>

      {/* Linie und Skala */}
      <div style={{ position: 'absolute', left: X0 - 20, width: X1 - X0 + 40, top: LINE_Y - 3, height: 6, borderRadius: 3, background: '#3A3366' }} />
      {ticks.map((v) => (
        <div key={v} style={{ position: 'absolute', left: x(v), top: LINE_Y + 8, transition: `left ${0.9}s ${EASE}`, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, animation: 'upFade .5s ease-out both' }}>
          <span style={{ width: 2, height: 10, background: '#5A5290' }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#8F88B8', whiteSpace: 'nowrap' }}>{short(v)}</span>
        </div>
      ))}

      {/* echte Zahl */}
      {st.answer && (
        <div style={{ position: 'absolute', left: ax - 2, top: 158, width: 4, height: LINE_Y - 158 + 26, background: 'var(--yellow)', borderRadius: 2, transition: `left ${0.9}s ${EASE}`, boxShadow: '0 0 18px rgba(255,212,71,.7)', animation: 'upFade .4s ease-out both', zIndex: 1 }} />
      )}

      {/* Tipps: Strich auf der Linie, Verbindung nach oben, Avatar mit Wert */}
      {visible.map((e) => {
        const p = player(e.playerId)!;
        const xx = x(e.guess);
        const l = lane.get(e.playerId) ?? 0;
        const grey = st.greyed.has(e.playerId);
        const win = st.done && !!e.win;
        const top = LINE_Y - 40 - (l + 1) * laneH + (crowd ? 4 : 0);
        const markerBottom = top + (crowd ? avatar : laneH - 8);
        const stroke = grey ? '#4A4378' : win ? 'var(--yellow)' : color;
        const move = `left .9s ${EASE}, top .5s ${EASE}, height .5s ${EASE}, opacity .4s`;
        return (
          <div key={e.playerId} style={{ opacity: grey ? 0.35 : 1, filter: grey ? 'grayscale(1)' : undefined, transition: 'opacity .4s, filter .4s', zIndex: win ? 3 : 2, position: 'relative' }}>
            <div style={{ position: 'absolute', left: xx - 1, top: markerBottom, width: 2, height: Math.max(0, LINE_Y - 14 - markerBottom), background: stroke, opacity: 0.55, transition: move }} />
            <div style={{ position: 'absolute', left: xx - 2.5, top: LINE_Y - 14, width: 5, height: 28, borderRadius: 3, background: stroke, transition: move, animation: 'upPop .35s ease-out both' }} />
            <div style={{ position: 'absolute', left: xx - boxW / 2, top, width: boxW, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: move, animation: 'upPop .35s ease-out both' }}>
              <span style={{ position: 'relative' }}>
                <Avatar player={p} size={avatar} />
                {win && <Crown size={crowd ? 20 : 28} style={{ position: 'absolute', top: crowd ? -13 : -18, left: crowd ? 6 : 9 }} />}
              </span>
              {!crowd && (
                <span style={{ background: win ? color : 'var(--surface)', color: win ? '#110D24' : '#fff', borderRadius: 10, padding: '2px 8px', textAlign: 'center', maxWidth: boxW, boxShadow: win ? '0 0 0 3px var(--yellow)' : undefined }}>
                  <b style={{ display: 'block', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</b>
                  <span className="display" style={{ display: 'block', fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{short(e.guess)}{st.done && e.badge ? ` · ${e.badge}` : ''}</span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
