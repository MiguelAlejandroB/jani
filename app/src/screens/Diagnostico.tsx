import { useState, type ReactNode } from 'react';
import { sessionOutcome } from '../engine/session';
import { CLASS_IDS, type DecideResult, type SeeResult } from '../engine/types';
import { useFlow } from '../flow/FlowContext';
import { useRedirectIf } from '../flow/useRedirect';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { Icon, type IconName } from '../icons';
import { Bar, BigButton, Eyebrow, Pill, SaveError, Screen } from '../ui';

const CONSULT_DECISION: DecideResult = { suggestion: 'CONSULT', phrase: 'consult', usedDemoData: false };

type Tone = 'clay' | 'leaf' | 'neutral';
type Status = 'healthy' | 'affected' | 'unsure';

function statusOf(r: SeeResult): Status {
  if (r.status === 'unsure') return 'unsure';
  return r.classId === 'sana' ? 'healthy' : 'affected';
}

const BADGE_ICON: Record<Status, IconName> = { healthy: 'check', affected: 'leaf', unsure: 'question' };

export default function Diagnostico() {
  const { t, pack } = usePack();
  const { go } = useNav();
  const { session, photos, setRisk, setDecision, saveCurrentCase } = useFlow();
  const [saveError, setSaveError] = useState(false);
  useRedirectIf(session === null);
  if (!session) return null;

  const outcome = sessionOutcome(session);

  let text: string;
  let button: ReactNode;
  if (outcome === 'consult') {
    text = t('unsure');
    button = (
      <BigButton
        icon="arrow-right"
        label={t('next')}
        testId="dx-next"
        onClick={() => {
          setRisk(null);
          setDecision(CONSULT_DECISION);
          go('decision');
        }}
      />
    );
  } else if (outcome === 'healthy') {
    text = t('all_healthy');
    button = (
      <BigButton
        icon="check"
        label={t('save')}
        testId="dx-next"
        onClick={() => {
          setSaveError(false);
          saveCurrentCase()
            .then(() => go('confirmacion'))
            .catch((e: unknown) => {
              console.warn('save', e);
              setSaveError(true);
            });
        }}
      />
    );
  } else {
    text = session.dominant ? t(`dx_${session.dominant}`) : '';
    button = <BigButton icon="arrow-right" label={t('next')} testId="dx-next" onClick={() => go('preguntas')} />;
  }

  // Badge del resultado: la clase dominante, sana o dudosa.
  const badge =
    outcome === 'consult'
      ? { tone: 'neutral' as Tone, text: t('unclear') }
      : outcome === 'healthy'
        ? { tone: 'leaf' as Tone, text: pack?.classes.sana.label ?? '' }
        : { tone: 'clay' as Tone, text: (session.dominant && pack?.classes[session.dominant].label) || '' };

  // Proporción real de fotos por clase en esta sesión (las dudosas aparte).
  const total = photos.length;
  const counts = new Map<string, number>();
  for (const p of photos) {
    const k = p.result.status === 'unsure' ? 'unsure' : p.result.classId;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const rows = [...CLASS_IDS, 'unsure' as const]
    .map((k) => ({
      k,
      n: counts.get(k) ?? 0,
      tone: (k === 'unsure' ? 'neutral' : k === 'sana' ? 'leaf' : 'clay') as Tone,
      label: k === 'unsure' ? t('unclear') : (pack?.classes[k].label ?? k),
    }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);

  return (
    <Screen
      id="diagnostico"
      icon="lens"
      eyebrow={t('app_name')}
      title={t('t_result')}
      audio={[outcome === 'consult' ? 'unsure' : outcome === 'healthy' ? 'all_healthy' : session.dominant ? `dx_${session.dominant}` : 'unsure']}
      actions={
        <>
          {saveError && <SaveError />}
          {button}
        </>
      }
    >
      <section className="card lg">
        <div className="card-head">
          {badge.text && <Pill tone={badge.tone}>{badge.text}</Pill>}
          <p className="dx-text" data-testid="dx-outcome" data-outcome={outcome}>
            {text}
          </p>
        </div>
        <Eyebrow>{t('t_photos')}</Eyebrow>
        <div className="class-rows" key={total}>
          {rows.map((r, i) => (
            <div key={r.k} data-testid={`dx-class-${r.k}`}>
              <div className="class-row-head">
                <span className="class-name">{r.label}</span>
                <span className={`class-val${i === 0 && r.tone !== 'neutral' ? ` ${r.tone}` : ''}`}>
                  {r.n} / {total}
                </span>
              </div>
              <Bar value={total ? r.n / total : 0} tone={r.tone} />
            </div>
          ))}
        </div>
        <div className="thumbs">
          {photos.map((p) => {
            const st = statusOf(p.result);
            return (
              <div className="thumb" key={p.url}>
                <img src={p.url} alt="" />
                <span className="thumb-badge" data-status={st}>
                  <Icon name={BADGE_ICON[st]} size={14} strokeWidth={2.4} />
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </Screen>
  );
}
