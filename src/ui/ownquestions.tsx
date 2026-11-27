/** Bildschirme für „Eigene Fragen“ (siehe sdk/ownquestions.ts) – gleich in Mic Drop und Wer war's? */
import type { PlayerInfo, Translate } from '@up/sdk';
import { Avatar } from './Avatar';
import { HostTimer, PhoneTimer } from './Timer';
import { HostHeader, PhoneWait, TextAnswer } from './layout';

export function OwnQuestionsHost({ view, t, player, title, color }: {
  view: any; t: Translate; player: (id: string) => PlayerInfo | undefined; title: string; color: string;
}) {
  const done = new Set<string>(view.done);
  const ps = (view.players as string[]).map((id) => player(id)).filter(Boolean) as PlayerInfo[];
  return (
    <>
      <HostHeader title={title} color={color} info={t('own.info')} right={<HostTimer deadline={view.deadline} duration={view.duration} />} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, textAlign: 'center' }}>
        <h1 className="anim-pop" style={{ fontSize: 64 }}>{t(view.kind === 'prompt' ? 'own.tvPrompt' : 'own.tvQuestion')}</h1>
        <p className="muted" style={{ fontSize: 24, maxWidth: 900 }}>{t('own.tvText')}</p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
          {ps.map((p, i) => (
            <div key={p.id} style={{ position: 'relative', animation: done.has(p.id) ? 'upPop .4s ease-out' : `upFloat 3s ease-in-out ${(-0.4 * i).toFixed(1)}s infinite` }}>
              <Avatar player={p} size={72} dim={!done.has(p.id)} />
              {done.has(p.id) && <span style={{ position: 'absolute', right: -6, bottom: -4, width: 28, height: 28, borderRadius: '50%', background: 'var(--green)', color: '#110D24', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function OwnQuestionsPhone({ view, t, send }: { view: any; t: Translate; send: (a: object) => void }) {
  if (view.screen === 'ownQuestionsDone') {
    return <PhoneWait title={t('own.sent')} text={t('own.sentText')} emoji={<span className="display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--yellow)' }}>„{view.text}“</span>} />;
  }
  const prompt = view.kind === 'prompt';
  return (
    <>
      <PhoneTimer deadline={view.deadline} duration={view.duration} hurryText={t('timer.hurry')} />
      <h1 style={{ fontSize: 26 }}>{t(prompt ? 'own.phonePrompt' : 'own.phoneQuestion')}</h1>
      <p className="muted" style={{ fontSize: 15 }}>{t(prompt ? 'own.hintPrompt' : 'own.hintQuestion')}</p>
      <TextAnswer button={t('own.send')} placeholder={t(prompt ? 'own.placeholderPrompt' : 'own.placeholderQuestion')} maxLength={view.maxLength ?? 90}
        onSubmit={(text) => send({ type: 'ownQuestion', text })}
        onDraft={(text) => send({ type: 'ownQuestionDraft', draft: true, text })} deadline={view.deadline} />
    </>
  );
}
