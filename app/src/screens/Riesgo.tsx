import { decide } from '../engine/decide';
import type { DecideResult } from '../engine/types';
import { useFlow } from '../flow/FlowContext';
import { useRedirectIf } from '../flow/useRedirect';
import { useNav } from '../nav';
import { usePack } from '../packs/PackContext';
import { AREA_DEFAULT_HA } from '../store/settings';
import { BigButton, CherryGauge, DemoBadge, Dots, RangeBar, Screen } from '../ui';
import { flagPhrases, kg, rdLevel, tenths, type ViewLevel } from './rdView';

const FACTOR_ICONS: Record<string, string> = {
  affected_share_over_30pct: '🍂',
  rainy_month: '📅',
  user_reports_heavy_rain: '🌧️',
  no_treatment_last_60_days: '🚫💧',
};

const levelKey = (l: ViewLevel) => (l === 'CONSULT' ? 'consult' : `risk_${l.toLowerCase()}`);

export default function Riesgo() {
  const { t, pack, areaHa } = usePack();
  const { go } = useNav();
  const { session, risk, setDecision, rd } = useFlow();
  useRedirectIf(!session || !risk || !pack || !session.dominant);
  if (!session || !risk || !pack || !session.dominant) return null;
  const dominant = session.dominant;

  // Respaldo para Decisión: la regla antigua (decide.ts) por si el cálculo del manual no está disponible.
  const next = () => {
    let decision: DecideResult;
    if (risk.level === 'CONSULT') decision = { suggestion: 'CONSULT', phrase: 'consult', usedDemoData: false };
    else decision = decide({ dominant, risk: risk.level, areaHa: areaHa ?? AREA_DEFAULT_HA }, pack);
    setDecision(decision);
    go('decision');
  };

  if (rd.status === 'loading') {
    return (
      <Screen id="riesgo" icon="" top audio={['calculating']}>
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
  if (!res) {
    const label = t(levelKey(risk.level));
    return (
      <Screen id="riesgo" icon="" top audio={[levelKey(risk.level)]}>
        <div className="risk-head">
          <CherryGauge level={risk.level} label={label} />
          <p className="level-phrase">{label}</p>
        </div>
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
        <div className="push" />
        <BigButton icon="➜" testId="risk-next" onClick={next} />
      </Screen>
    );
  }

  const ell = res.risk.ell;
  const level = rdLevel(res);
  const label = t(levelKey(level));
  const unit = pack.units.weight;
  const num = (n: number) => n.toLocaleString(pack.language.code);
  const y0 = res.y0Kg;
  const [p10, p50, p90, bad] = [ell.p10, ell.p50, ell.p90, ell.cvar10].map((f) => kg(f, y0)) as [number, number, number, number];
  const max = Math.max(p90, bad, 1) * 1.1;
  const big = tenths(ell.p_sobre_umbral);
  const flags = flagPhrases(res.risk.banderas);

  return (
    <Screen id="riesgo" icon="" top audio={[levelKey(level)]}>
      <div className="risk-head">
        <CherryGauge level={level} label={label} />
        <p className="level-phrase">{label}</p>
      </div>
      {res.usedDemoData && <DemoBadge text={t('demo_data')} />}

      <section className="card" data-testid="risk-card">
        <h2 className="card-title">{t('risk_title')}</h2>
        <div>
          <div className="label">{t('loss_likely')}</div>
          <div className="big-num" data-testid="loss-likely">
            {num(p50)}
            <small>{unit}</small>
          </div>
        </div>
        <div className="range">
          <RangeBar max={max} p10={p10} p50={p50} p90={p90} bad={bad} />
          <div className="range-legend">
            <span>
              <i className="sw band" aria-hidden="true" />
              {t('loss_between')}{' '}
              <b>
                {num(p10)} – {num(p90)} {unit}
              </b>
            </span>
            <span>
              <i className="sw bad" aria-hidden="true" />
              {t('bad_year')} <b>{num(bad)} {unit}</b>
            </span>
          </div>
        </div>
        <div className="dots-row" data-testid="chance-big-loss" data-n={big}>
          <span>{t('chance_big_loss')}:</span>
          <b className="num">{big} / 10</b>
          <Dots n={big} tone="loss" />
        </div>
      </section>

      {flags.length > 0 && (
        <div className="chips">
          {flags.map((f) => (
            <span key={f} className={`chip note${f === 'flag_detector' ? ' alarm' : ''}`} data-testid={`flag-${f}`}>
              {t(f)}
            </span>
          ))}
        </div>
      )}

      <p className="footer-line" data-testid="rd-climate" data-source={res.climate.source}>
        {res.climate.source === 'gps' ? '📍 ' : ''}
        {t('climate_from')} {res.climate.name}
      </p>
      <div className="push" />
      <BigButton icon="➜" testId="risk-next" onClick={next} />
    </Screen>
  );
}
