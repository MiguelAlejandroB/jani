import { useState } from 'react';
import type { Choice, Range } from '../engine/types';
import { useFlow } from '../flow/FlowContext';
import { useRedirectIf } from '../flow/useRedirect';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { Icon, type IconName } from '../icons';
import { BigButton, CherryGauge, DemoBadge, Dots, Glyph, Pill, SaveError, Screen } from '../ui';
import { altChoice, altViews, catalogIndex, REMEASURE, type AltView } from './rdView';

const OPTIONS: ReadonlyArray<{ choice: Choice; icon: IconName; key: string }> = [
  { choice: 'WAIT', icon: 'clock', key: 'opt_wait' },
  { choice: 'TREAT', icon: 'drop', key: 'opt_treat' },
  { choice: 'CONSULT', icon: 'person', key: 'opt_consult' },
];

// Íconos del catálogo del paquete (emoji) -> íconos de línea propios; los desconocidos se muestran tal cual.
const CATALOG_ICON: Record<string, IconName> = { '⏳': 'clock', '✂️': 'scissors', '💧': 'drop', '🟦': 'shield', '🌿': 'sprout', '🐛': 'bug' };

export default function Decision() {
  const { t, pack } = usePack();
  const { go } = useNav();
  const { decision, setChoice, saveCurrentCase, rd } = useFlow();
  const [saveError, setSaveError] = useState(false);
  useRedirectIf(!decision);
  if (!decision) return null;
  const unit = pack?.units.weight ?? '';
  const num = (n: number) => n.toLocaleString(pack?.language.code);
  const range = (r: Range) => `${num(r[0])} – ${num(r[1])} ${unit}`;

  const choose = (c: Choice, alternative?: string) => {
    setChoice(c);
    setSaveError(false);
    // Si no se pudo guardar, se avisa con ⚠️ y los botones siguen ahí para reintentar.
    saveCurrentCase(alternative ? { choice: c, alternative } : { choice: c })
      .then(() => go('confirmacion'))
      .catch((e: unknown) => {
        console.warn('save', e);
        setSaveError(true);
      });
  };

  if (rd.status === 'loading') {
    return (
      <Screen id="decision" icon="scale" eyebrow={t('app_name')} title={t('t_decision')} audio={['calculating']}>
        <section className="card lg risk-head">
          <CherryGauge level="CONSULT" label={t('calculating')} ripening />
          <p className="level-phrase" data-testid="rd-loading">
            {t('calculating')}
          </p>
        </section>
      </Screen>
    );
  }

  const res = rd.status === 'ready' ? rd.result : undefined;
  const d = res?.decision;
  if (res && d) {
    const auto = res.autoRecommendation && d.recomendacion !== null;
    const alts = altViews(d, res.y0Kg, catalogIndex(pack));
    const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num(Math.abs(n))}`;
    const card = (a: AltView) => {
      const suggested = auto && a.suggested;
      return (
        <section key={a.id} className={`card alt${a.viable ? '' : ' off'}`} data-testid={`alt-${a.id}`} data-suggested={suggested ? 'true' : undefined}>
          <div className="alt-head">
            <span className="alt-icon" aria-hidden="true">
              <Glyph name={CATALOG_ICON[a.icon] ?? a.icon} size={26} />
            </span>
            <h2 className="alt-name">{t(a.phrase)}</h2>
          </div>
          <div className="alt-nums">
            <div className="alt-num">
              <span className="label">{t('alt_loss')}</span>
              <span className="v">{a.lossKg === null ? '—' : `${num(a.lossKg)} ${unit}`}</span>
            </div>
            <div className="alt-num">
              <span className="label">{t('alt_cost')}</span>
              <span className="v">{`${num(a.costKg)} ${unit}`}</span>
            </div>
            <div className="alt-num">
              <span className="label">{t('alt_net')}</span>
              <span className={`v${a.netKg === null ? '' : a.netKg > 0 ? ' pos' : a.netKg < 0 ? ' neg' : ''}`} data-testid={`net-${a.id}`}>
                {a.netKg === null ? '—' : `${signed(a.netKg)} ${unit}`}
              </span>
            </div>
          </div>
          {a.timesBetter !== null && (
            <div className="dots-row">
              <Dots n={a.timesBetter} tone="good" />
              <span>
                <b className="num">{a.timesBetter}</b> {t('times_better')}
              </span>
            </div>
          )}
          {(a.hidden.labor || a.hidden.money || a.hidden.cert || !a.viable) && (
            <div className="chips">
              {!a.viable && (
                <span className="chip stop" data-testid={`not-viable-${a.id}`}>
                  <Icon name="ban" size={16} />
                  {t('not_viable')}
                  {a.why ? ` · ${t(a.why)}` : ''}
                </span>
              )}
              {a.hidden.labor && (
                <span className="chip hidden-cost">
                  <Icon name="person" size={16} />
                  {t('hidden_labor')}
                </span>
              )}
              {a.hidden.money && (
                <span className="chip hidden-cost">
                  <Icon name="coins" size={16} />
                  {t('hidden_money')}
                </span>
              )}
              {a.hidden.cert && (
                <span className="chip hidden-cost">
                  <Icon name="tag" size={16} />
                  {t('hidden_cert')}
                </span>
              )}
            </div>
          )}
          {a.viable && (
            <BigButton
              icon="check"
              label={t('choose')}
              testId={`choose-${a.id}`}
              variant={suggested ? 'primary' : 'secondary'}
              onClick={() => choose(altChoice(a.id), a.id)}
            />
          )}
        </section>
      );
    };

    return (
      <Screen
        id="decision"
        icon="scale"
        eyebrow={t('t_decision')}
        title={t('options_title')}
        audio={[...(auto ? [] : ['info_mode']), 'options_title', 'you_decide']}
        chips={
          <>
            <Pill tone="leaf" icon="person">
              {t('you_decide')}
            </Pill>
            {res.usedDemoData && <DemoBadge text={t('demo_data')} />}
          </>
        }
        actions={
          <>
            {saveError && <SaveError />}
            <BigButton icon="person" label={t('opt_consult')} testId="choice-CONSULT" variant="secondary" onClick={() => choose('CONSULT')} />
          </>
        }
      >
        {!auto && (
          <div className="note-box" data-testid="info-mode">
            <Icon name="info" size={22} />
            <span>{t('info_mode')}</span>
          </div>
        )}
        {alts.map(card)}
        {d.recomendar_remedir && (
          <section className="card alt" data-testid={`alt-${REMEASURE}`}>
            <div className="alt-head">
              <span className="alt-icon" aria-hidden="true">
                <Icon name="repeat" size={26} />
              </span>
              <h2 className="alt-name">{t('alt_remeasure')}</h2>
            </div>
            <p className="alt-note">{t('remeasure_worth')}</p>
            <BigButton icon="check" label={t('choose')} testId={`choose-${REMEASURE}`} variant="secondary" onClick={() => choose(altChoice(REMEASURE), REMEASURE)} />
          </section>
        )}
      </Screen>
    );
  }

  // Respaldo: regla antigua (decide.ts) cuando el cálculo del manual no está disponible.
  const k = decision.kpis;
  const rows: Array<{ id: string; icon: IconName; label: string; value: string }> = k
    ? [
        { id: 'loss', icon: 'trend-down', label: t('kpi_loss'), value: range(k.expectedLossKg) },
        { id: 'cost', icon: 'coins', label: t('kpi_cost'), value: `${num(k.treatmentCostKg)} ${unit}` },
        { id: 'breakeven', icon: 'scale', label: t('kpi_breakeven'), value: `${num(k.breakEvenKg)} ${unit}` },
        { id: 'net', icon: 'trend-up', label: t('kpi_net'), value: range(k.netBenefitKg) },
      ]
    : [];

  return (
    <Screen
      id="decision"
      icon="scale"
      eyebrow={t('app_name')}
      title={t('t_decision')}
      audio={[decision.phrase, 'you_decide']}
      chips={
        <>
          <Pill tone="leaf" icon="person">
            {t('you_decide')}
          </Pill>
          {decision.usedDemoData && <DemoBadge text={t('demo_data')} />}
        </>
      }
    >
      {rows.map((r) => (
        <div className="kpi" key={r.id}>
          <span className="kpi-icon" aria-hidden="true">
            <Icon name={r.icon} size={22} />
          </span>
          <span className="kpi-label">{r.label}</span>
          <span className="kpi-value" data-testid={`kpi-${r.id}`}>
            {r.value}
          </span>
        </div>
      ))}
      <section className="reco">
        <p className="suggestion" data-testid="decision-suggestion" data-suggestion={decision.suggestion}>
          {t(decision.phrase)}
        </p>
      </section>
      {saveError && <SaveError />}
      {OPTIONS.map((o) => (
        <BigButton
          key={o.choice}
          icon={o.icon}
          label={t(o.key)}
          testId={`choice-${o.choice}`}
          variant={decision.suggestion === o.choice ? 'primary' : 'secondary'}
          suggested={decision.suggestion === o.choice}
          onClick={() => choose(o.choice)}
        />
      ))}
    </Screen>
  );
}
