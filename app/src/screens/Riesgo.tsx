import { decide } from '../engine/decide';
import type { DecideResult } from '../engine/types';
import { useFlow } from '../flow/FlowContext';
import { useRedirectIf } from '../flow/useRedirect';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { AREA_DEFAULT_HA } from '../store/settings';
import { BigButton, DemoBadge, Screen } from '../ui';

const FACTOR_ICONS: Record<string, string> = {
  affected_share_over_30pct: '🍂',
  rainy_month: '📅',
  user_reports_heavy_rain: '🌧️',
  no_treatment_last_60_days: '🚫💧',
};

export default function Riesgo() {
  const { t, pack, areaHa } = usePack();
  const { go } = useNav();
  const { session, risk, setDecision } = useFlow();
  useRedirectIf(!session || !risk || !pack || !session.dominant);
  if (!session || !risk || !pack || !session.dominant) return null;
  const dominant = session.dominant;

  const next = () => {
    let decision: DecideResult;
    if (risk.level === 'CONSULT') decision = { suggestion: 'CONSULT', phrase: 'consult', usedDemoData: false };
    else decision = decide({ dominant, risk: risk.level, areaHa: areaHa ?? AREA_DEFAULT_HA }, pack);
    setDecision(decision);
    go('decision');
  };

  const label = risk.level === 'CONSULT' ? t('consult') : t(`risk_${risk.level.toLowerCase()}`);
  return (
    <Screen id="riesgo" icon="🚦" audio={[risk.level === 'CONSULT' ? 'consult' : `risk_${risk.level.toLowerCase()}`]}>
      <div className="light" data-testid="risk-level" data-level={risk.level} />
      <p className="question">{label}</p>
      {risk.level !== 'CONSULT' && (
        <div className="factors">
          {risk.factors.map((f) => (
            <span key={f} data-testid={`factor-${f}`}>
              {FACTOR_ICONS[f] ?? '•'}
            </span>
          ))}
        </div>
      )}
      {risk.level !== 'CONSULT' && risk.usedDemoData && <DemoBadge text={t('demo_data')} />}
      <BigButton icon="➜" testId="risk-next" onClick={next} />
    </Screen>
  );
}
