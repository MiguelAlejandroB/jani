import { useState } from 'react';
import type { Choice, Range } from '../engine/types';
import { useFlow } from '../flow/FlowContext';
import { useRedirectIf } from '../flow/useRedirect';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { BigButton, DemoBadge, SaveError, Screen } from '../ui';

const OPTIONS: ReadonlyArray<{ choice: Choice; icon: string; key: string }> = [
  { choice: 'WAIT', icon: '⏳', key: 'opt_wait' },
  { choice: 'TREAT', icon: '💧', key: 'opt_treat' },
  { choice: 'CONSULT', icon: '🧑‍🌾', key: 'opt_consult' },
];

export default function Decision() {
  const { t, pack } = usePack();
  const { go } = useNav();
  const { decision, setChoice, saveCurrentCase } = useFlow();
  const [saveError, setSaveError] = useState(false);
  useRedirectIf(!decision);
  if (!decision) return null;
  const unit = pack?.units.weight ?? '';
  const num = (n: number) => n.toLocaleString(pack?.language.code);
  const range = (r: Range) => `${num(r[0])} – ${num(r[1])} ${unit}`;
  const k = decision.kpis;

  const rows: Array<{ id: string; icon: string; label: string; value: string }> = k
    ? [
        { id: 'loss', icon: '📉', label: t('kpi_loss'), value: range(k.expectedLossKg) },
        { id: 'cost', icon: '💰', label: t('kpi_cost'), value: `${num(k.treatmentCostKg)} ${unit}` },
        { id: 'breakeven', icon: '⚖️', label: t('kpi_breakeven'), value: `${num(k.breakEvenKg)} ${unit}` },
        { id: 'net', icon: '📈', label: t('kpi_net'), value: range(k.netBenefitKg) },
      ]
    : [];

  const choose = (c: Choice) => {
    setChoice(c);
    setSaveError(false);
    // Si no se pudo guardar, se avisa con ⚠️ y los botones siguen ahí para reintentar.
    saveCurrentCase({ choice: c })
      .then(() => go('confirmacion'))
      .catch((e: unknown) => {
        console.warn('save', e);
        setSaveError(true);
      });
  };

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
