/**
 * Spielauswahl: Leiste mit dem gewählten Spiel (TV-Lobby) und eine Bibliothek mit Kategorien,
 * die auch mit sehr vielen Spielen übersichtlich bleibt. Kategorien kommen aus `tags` im Manifest.
 */

import { useState } from 'react';
import type { GameManifest, Translate } from '@up/sdk';
import { isLight, shade } from '../ui';

/** Bekannte Kategorien (Reihenfolge der Reiter). Unbekannte Tags landen unter „Weitere“. */
export const GAME_TAGS = ['words', 'draw', 'guess', 'deceive', 'social', 'quick'] as const;

export function gameTags(g: GameManifest): string[] {
  const tags = (g.tags ?? []).filter((x) => (GAME_TAGS as readonly string[]).includes(x));
  return tags.length ? tags : ['other'];
}

export const gameName = (g: GameManifest, lang: string) => g.name[lang] ?? g.name.en ?? g.id;
export const gameDesc = (g: GameManifest, lang: string) => g.description?.[lang] ?? g.description?.en ?? '';

/** Wie gut passt das Spiel zur aktuellen Spielerzahl? */
export function fitOf(g: GameManifest, players: number): 'ok' | 'few' | 'many' {
  if (players < g.minPlayers) return 'few';
  if (players > g.maxPlayers && !g.audience) return 'many';
  return 'ok';
}

export function TagChip({ tag, t, small }: { tag: string; t: Translate; small?: boolean }) {
  return (
    <span style={{ fontSize: small ? 12 : 13, fontWeight: 700, padding: small ? '3px 8px' : '4px 10px', borderRadius: 999, background: 'rgba(17,13,36,.22)', whiteSpace: 'nowrap' }}>
      {TAG_ICON[tag] ?? '•'} {t(`tag.${tag}`)}
    </span>
  );
}

const TAG_ICON: Record<string, string> = { words: '✍️', draw: '🎨', guess: '🎯', deceive: '🕵️', social: '💬', quick: '⚡', other: '🎲' };

/** Filter-Reiter: Alle + Kategorien, die tatsächlich vorkommen */
export function useTagFilter(games: GameManifest[]) {
  const [tag, setTag] = useState<string>('all');
  const present = [...GAME_TAGS, 'other'].filter((x) => games.some((g) => gameTags(g).includes(x)));
  const shown = tag === 'all' ? games : games.filter((g) => gameTags(g).includes(tag));
  return { tag, setTag, present, shown };
}

/* ---------------- TV: Bibliothek ---------------- */

export function GameLibrary({ games, selectedId, players, lang, t, onPick, onClose }: {
  games: GameManifest[]; selectedId: string | null; players: number; lang: string; t: Translate;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const { tag, setTag, present, shown } = useTagFilter(games);
  const [onlyFit, setOnlyFit] = useState(false);
  const list = onlyFit ? shown.filter((g) => fitOf(g, players) === 'ok') : shown;
  const count = (x: string) => (x === 'all' ? games.length : games.filter((g) => gameTags(g).includes(x)).length);
  return (
    <div role="dialog" aria-modal="true" aria-label={t('lobby.pickGame')} className="anim-fade"
      style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(10,7,22,.94)', padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <h2 style={{ fontSize: 36, fontWeight: 800 }}>{t('lobby.pickGame')} <span className="faint" style={{ fontSize: 22, fontWeight: 600 }}>{t('lobby.gamesCount', { n: games.length })}</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={`up-btn small${onlyFit ? '' : ' ghost'}`} aria-pressed={onlyFit} onClick={() => setOnlyFit((x) => !x)}>
            {onlyFit ? '✓ ' : ''}{t('lobby.onlyFitting', { n: players })}
          </button>
          <button className="up-btn small" onClick={onClose}>{t('settings.close')}</button>
        </div>
      </header>
      <nav aria-label={t('lobby.categories')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['all', ...present].map((x) => {
          const on = tag === x;
          return (
            <button key={x} aria-pressed={on} onClick={() => setTag(x)} style={{
              border: 0, minHeight: 44, padding: '8px 16px', borderRadius: 999, fontSize: 16, fontWeight: 700,
              background: on ? '#fff' : 'var(--surface)', color: on ? '#110D24' : 'var(--muted)',
            }}>
              {x === 'all' ? t('tag.all') : `${TAG_ICON[x]} ${t(`tag.${x}`)}`} <span style={{ opacity: 0.6 }}>{count(x)}</span>
            </button>
          );
        })}
      </nav>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: '0 -8px', padding: '8px 8px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 18 }}>
          {list.map((g, i) => (
            <LibraryCard key={g.id} g={g} sel={g.id === selectedId} fit={fitOf(g, players)} players={players} lang={lang} t={t} delay={i * 0.03} onPick={() => onPick(g.id)} />
          ))}
        </div>
        {list.length === 0 && <p className="muted" style={{ fontSize: 20, textAlign: 'center', marginTop: 60 }}>{t('lobby.noFitting')}</p>}
      </div>
    </div>
  );
}

function LibraryCard({ g, sel, fit, players, lang, t, delay, onPick }: { g: GameManifest; sel: boolean; players: number; fit: 'ok' | 'few' | 'many'; lang: string; t: Translate; delay: number; onPick: () => void }) {
  const light = isLight(g.color);
  return (
    <button onClick={onPick} aria-pressed={sel} style={{
      border: 0, padding: 0, textAlign: 'left', borderRadius: 22, overflow: 'hidden', background: 'var(--surface)', color: '#fff',
      display: 'flex', flexDirection: 'column', minHeight: 214, opacity: fit === 'ok' || sel ? 1 : 0.55,
      boxShadow: `${sel ? '0 0 0 4px #fff, ' : ''}0 6px 0 #0A0716`, animation: `upPop .35s ease-out ${delay.toFixed(2)}s both`,
    }}>
      <div style={{ background: g.color, color: light ? '#110D24' : '#fff', padding: '14px 16px 12px', boxShadow: `inset 0 -5px 0 ${shade(g.color)}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="display" style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{gameName(g, lang)}</span>
          {sel && <span style={{ background: '#fff', color: shade(g.color, 0.4), fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>{t('lobby.selected')}</span>}
        </span>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{gameTags(g).map((x) => <TagChip key={x} tag={x} t={t} small />)}</span>
      </div>
      <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <p style={{ fontSize: 15, lineHeight: 1.35, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{gameDesc(g, lang)}</p>
        <span style={{ marginTop: 'auto', fontSize: 13, fontWeight: 700, color: fit === 'ok' ? 'var(--faint)' : 'var(--yellow)' }}>
          {t('lobby.playersRange', { min: g.minPlayers, max: g.maxPlayers })}{g.audience ? ' +' : ''} · {t('lobby.minutes', { n: g.minutes })}
          {fit === 'few' ? ` · ${t('lobby.needPlayers', { n: g.minPlayers - players })}` : ''}
        </span>
      </div>
    </button>
  );
}
