import { useState } from 'react';
import type { Choice, Range } from '../engine/types';
import { useFlow } from '../flow/FlowContext';
import { useRedirectIf } from '../flow/useRedirect';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { BigButton, CherryGauge, DemoBadge, Dots, SaveError, Screen } from '../ui';
import { altChoice, altViews, catalogIndex, REMEASURE, type AltView } from './rdView';

const OPTIONS: ReadonlyArray<{ choice: Choice; icon: string; key: string }> = [
  { choice: 'WAIT', icon: '⏳', key: 'opt_wait' },
  { choice: 'TREAT', icon: '💧', key: 'opt_treat' },
  { choice: 'CONSULT', icon: '🧑‍🌾', key: 'opt_consult' },
];

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
      <Screen id="decision" icon="" top audio={['calculating']}>
        <div className="risk-head">
          <CherryGauge level="CONSULT" label={t('calculating')} ripening />
          <p className="level-phrase" data-testid="rd-loading">
            {t('calculating')}
          </p>
        </div>
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
              {a.icon}
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
                  ⛔ {t('not_viable')}
                  {a.why ? ` · ${t(a.why)}` : ''}
                </span>
              )}
              {a.hidden.labor && <span className="chip hidden-cost">👷 {t('hidden_labor')}</span>}
              {a.hidden.money && <span className="chip hidden-cost">🏦 {t('hidden_money')}</span>}
              {a.hidden.cert && <span className="chip hidden-cost">🏷️ {t('hidden_cert')}</span>}
            </div>
          )}
          {a.viable && (
            <BigButton
              icon="✓"
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
      <Screen id="decision" icon="" top audio={[...(auto ? [] : ['info_mode']), 'options_title', 'you_decide']}>
        {res.usedDemoData && <DemoBadge text={t('demo_data')} />}
        {!auto && (
          <div className="note-box" data-testid="info-mode">
            <span aria-hidden="true">ℹ️</span>
            <span>{t('info_mode')}</span>
          </div>
        )}
        <h1 className="screen-title">{t('options_title')}</h1>
        {alts.map(card)}
        {d.recomendar_remedir && (
          <section className="card alt" data-testid={`alt-${REMEASURE}`}>
            <div className="alt-head">
              <span className="alt-icon" aria-hidden="true">
                🔁
              </span>
              <h2 className="alt-name">{t('alt_remeasure')}</h2>
            </div>
            <p className="alt-note">{t('remeasure_worth')}</p>
            <BigButton icon="✓" label={t('choose')} testId={`choose-${REMEASURE}`} variant="secondary" onClick={() => choose(altChoice(REMEASURE), REMEASURE)} />
          </section>
        )}
        <p className="question">{t('you_decide')}</p>
        {saveError && <SaveError />}
        <BigButton icon="🧑‍🌾" label={t('opt_consult')} testId="choice-CONSULT" variant="secondary" onClick={() => choose('CONSULT')} />
      </Screen>
    );
  }

  // Respaldo: regla antigua (decide.ts) cuando el cálculo del manual no está disponible.
  const k = decision.kpis;
  const rows: Array<{ id: string; icon: string; label: string; value: string }> = k
    ? [
        { id: 'loss', icon: '📉', label: t('kpi_loss'), value: range(k.expectedLossKg) },
        { id: 'cost', icon: '💰', label: t('kpi_cost'), value: `${num(k.treatmentCostKg)} ${unit}` },
        { id: 'breakeven', icon: '⚖️', label: t('kpi_breakeven'), value: `${num(k.breakEvenKg)} ${unit}` },
        { id: 'net', icon: '📈', label: t('kpi_net'), value: range(k.netBenefitKg) },
      ]
    : [];

  return (
    <Screen id="decision" icon="⚖️" audio={[decision.phrase, 'you_decide']}>
      {decision.usedDemoData && <DemoBadge text={t('demo_data')} />}
      {rows.map((r) => (
        <div className="kpi" key={r.id}>
          <span className="kpi-icon" aria-hidden="true">
            {r.icon}
          </span>
          <span className="kpi-label">{r.label}</span>
          <span className="kpi-value" data-testid={`kpi-${r.id}`}>
            {r.value}
          </span>
        </div>
      ))}
      <p className="question" data-testid="decision-suggestion" data-suggestion={decision.suggestion}>
        {t(decision.phrase)}
      </p>
      <p className="question">{t('you_decide')}</p>
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
