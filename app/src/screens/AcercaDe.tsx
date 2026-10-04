import { useRef, useState } from 'react';
import { DemoBadge, Eyebrow, Screen } from '../ui';
import { useFlow } from '../flow/FlowContext';
import { usePack } from '../packs/PackContext';

type Row = [key: string, value: string];

const show = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));

// Recorre `economics` y devuelve cada `source` con su ruta como clave.
function collectSources(node: unknown, path: string[], out: Row[]): void {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'source') out.push([path.join('.'), show(v)]);
    else collectSources(v, [...path, k], out);
  }
}

function collectFromList(node: unknown, path: string[], out: Row[]): void {
  if (Array.isArray(node)) node.forEach((item, i) => collectSources(item, [...path, String(i)], out));
  else collectSources(node, path, out);
}

function RowView({ k, v }: { k: string; v: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{k}</span>
      <span className="kpi-value">{v}</span>
    </div>
  );
}

// Toques en el ícono para abrir los detalles técnicos (equipo y jurado); la persona usuaria no los ve.
const TAPS_FOR_DETAILS = 5;

export default function AcercaDe() {
  const { card } = useFlow();
  const { pack, t } = usePack();
  const taps = useRef(0);
  const [details, setDetails] = useState(false);
  const onIconClick = () => {
    taps.current += 1;
    if (taps.current >= TAPS_FOR_DETAILS) {
      taps.current = 0;
      setDetails((d) => !d);
    }
  };

  const modelRows: Row[] = [];
  if (card) {
    if (card.id) modelRows.push(['id', card.id]);
    modelRows.push(['recommended_file', card.recommended_file ?? '🧪']);
    for (const [k, v] of Object.entries(card.size_mb ?? {})) modelRows.push([`size_mb.${k}`, show(v)]);
    for (const [k, v] of Object.entries(card.metrics ?? {})) modelRows.push([k, show(v)]);
    // Límites conocidos del modelo (la ficha del notebook usa `known_limits`).
    for (const key of ['known_limits', 'limits'] as const) {
      const lim = card[key];
      if (Array.isArray(lim)) lim.forEach((v, i) => modelRows.push([`${key}.${i}`, show(v)]));
      else if (lim !== undefined && lim !== null) modelRows.push([key, show(lim)]);
    }
  }

  const sourceRows: Row[] = [];
  let demo: { note: string } | null = null;
  if (pack) {
    sourceRows.push(['risk_rules.validated_by', pack.risk_rules.validated_by]);
    sourceRows.push(['risk_rules.note', pack.risk_rules.note]);
    sourceRows.push(['calendar.source', show(pack.calendar.source)]);
    sourceRows.push(['climate_normals.source', show(pack.climate_normals.source)]);
    const econ: Row[] = [];
    // `economics` es un objeto: sus claves se recorren con su ruta completa.
    for (const [k, v] of Object.entries(pack.economics)) collectFromList(v, ['economics', k], econ);
    sourceRows.push(...econ);
    sourceRows.push(['audio.status', pack.audio.status]);
    sourceRows.push([pack.language.needs_native_review ? '⚠️ language.needs_native_review' : 'language.needs_native_review', String(pack.language.needs_native_review)]);
    const dv = pack.demo_values;
    if (dv.synthetic === true) demo = { note: show(dv.note) };
  }

  return (
    <Screen id="acerca" icon="info" eyebrow={t('app_name')} title={t('about')} onIconClick={onIconClick}>
      <section className="card lg about-card" data-testid="about-summary">
        <p>{t('info_mode')}</p>
        <p>{t('privacy')}</p>
        {pack && (
          <p className="about-lang">
            {t('sec_language')}: <strong>{pack.language.name}</strong>
          </p>
        )}
      </section>
      {demo && <DemoBadge text={t('demo_data')} />}
      {details && (
        <>
          <section className="section" data-testid="about-model">
            <Eyebrow>{t('sec_model')}</Eyebrow>
            <div className="rows">
              {modelRows.map(([k, v]) => (
                <RowView key={k} k={k} v={v} />
              ))}
            </div>
          </section>
          <section className="section" data-testid="about-sources">
            <Eyebrow>{t('sec_sources')}</Eyebrow>
            <div className="rows">
              {sourceRows.map(([k, v], i) => (
                <RowView key={`${k}-${i}`} k={k} v={v} />
              ))}
            </div>
            {demo && <DemoBadge text={demo.note} />}
          </section>
        </>
      )}
    </Screen>
  );
}
