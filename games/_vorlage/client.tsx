/** Vorlage: Ansichten für TV (Host) und Handy (Controller). */

import { useState } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps } from '@up/sdk';
import { Avatar, HostHeader, HostPrompt, HostTimer, PhoneTimer, PhoneWait, Podium, useDraft } from '@up/ui';

const COLOR = '#4BE3A1';

function Host({ view, t, player }: HostViewProps) {
  if (view.screen === 'ask') {
    return (
      <>
        <HostHeader title={t('title')} color={COLOR} info={t('question', { n: view.n, total: view.total })} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <HostPrompt>{view.question}</HostPrompt>
        </div>
      </>
    );
  }
  if (view.screen === 'reveal') {
    return (
      <>
        <HostHeader title={t('title')} color={COLOR} />
        <HostPrompt label={view.question}>{t('answer')}: {view.answer}</HostPrompt>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {view.ranked.slice(0, 6).map((r: any, i: number) => {
            const p = player(r.playerId);
            return p ? (
              <div key={r.playerId} className="up-card anim-up" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', width: 520, animationDelay: `${i * 0.15}s` }}>
                <Avatar player={p} size={44} />
                <b style={{ flex: 1, fontSize: 20 }}>{p.name}</b>
                <span className="display" style={{ fontSize: 26, fontWeight: 800 }}>{r.guess}</span>
              </div>
            ) : null;
          })}
        </div>
      </>
    );
  }
  return (
    <>
      <HostHeader title={t('title')} color={COLOR} info={t('final')} />
      <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
    </>
  );
}

function Controller({ view, t, send }: ControllerViewProps) {
  const [value, setValue] = useState('');
  // Entwurf automatisch übertragen: zählt bei Zeitablauf, auch wenn niemand „Senden“ drückt
  useDraft(view.screen === 'ask' && value ? Number(value) : null, (n) => send({ type: 'guessDraft', draft: true, value: n }), view.deadline);
  if (view.screen === 'ask') {
    return (
      <>
        <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
        <h1 style={{ fontSize: 24 }}>{view.question}</h1>
        <form onSubmit={(e) => { e.preventDefault(); send({ type: 'guess', value: Number(value) }); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="up-input" inputMode="numeric" placeholder={t('yourGuess')} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,-]/g, ''))} />
          <button className="up-btn big full" disabled={!value}>{t('send')}</button>
        </form>
      </>
    );
  }
  if (view.screen === 'wait') return <PhoneWait title={view.guess != null ? String(view.guess) : '…'} text={t('sent')} />;
  return <PhoneWait title={t('final')} text={t('game.lookAtTv')} />;
}

export default { Host, Controller } satisfies GameClientModule;
