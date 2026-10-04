import { CLASS_IDS, type ClassId } from '../engine/types';

export type JsonObject = { [key: string]: unknown };

export type Pack = {
  id: string;
  version: string;
  language: { code: string; name: string; needs_native_review: boolean };
  crop: { species: string; model: string };
  units: { weight: string; currency: string; product: string };
  backup_contact: { role: string; phone: string | null };
  classes: Record<ClassId, { label: string; phrase: string }>;
  calendar: JsonObject;
  climate_normals: JsonObject;
  risk_rules: {
    validated_by: string;
    note: string;
    points: {
      affected_share_over_30pct: number;
      rainy_month: number;
      user_reports_heavy_rain: number;
      no_treatment_last_60_days: number;
    };
    thresholds: { medium: number; high: number };
  };
  economics: JsonObject;
  demo_values: JsonObject;
  phrases: Record<string, string>;
  audio: { dir: string; format: string; status: string; files?: Record<string, string> };
  tts: JsonObject;
  /** Opciones del perfil del lote (rangos y variedades locales). Opcional: sin él no se muestra el perfil. */
  lot_profile?: { varieties: string[]; altitude_ranges_m: [number, number][]; age_ranges_years: [number, number][] };
};

export const REQUIRED_PHRASE_KEYS: readonly string[] = [
  'welcome', 'retake', 'dx_sana', 'dx_roya', 'dx_minador', 'dx_phoma', 'dx_cercospora', 'unsure',
  'ask_rain', 'ask_treatment', 'yes', 'no', 'risk_low', 'risk_medium', 'risk_high', 'act_cheaper',
  'wait_ok', 'consult', 'you_decide', 'opt_wait', 'opt_treat', 'opt_consult', 'send_case', 'saved',
  'demo_data', 'all_healthy', 'more_photos', 'done_photos', 'treatment_generic', 'kpi_loss', 'kpi_cost',
  'kpi_breakeven', 'kpi_net', 'ask_area', 'pending', 'packs', 'install', 'import_file',
  // v0.3: alternativas y costos ocultos, riesgo, captura guiada, perfil del lote, seguimiento y segmentación.
  'alt_wait', 'alt_cultural', 'alt_fungicide', 'alt_loss', 'alt_cost', 'alt_net', 'hidden_costs', 'hidden_labor',
  'hidden_money', 'hidden_cert', 'prob_negative', 'assumptions', 'as_wage', 'as_rate', 'as_price', 'save',
  'loss_now', 'loss_wait', 'frame_leaf', 'zigzag', 'plant', 'take_photo', 'profile', 'prof_variety', 'prof_age',
  'prof_altitude', 'prof_shade', 'prof_load', 'load_high', 'load_low', 'followup', 'fu_did', 'fu_outcome',
  'fu_better', 'fu_same', 'fu_worse', 'no_leaf', 'severity',
  // v0.4: modelos de RIESGO y DECISIÓN (acciones del catálogo, banderas de validez, razones de inviabilidad).
  'alt_copper', 'alt_bio', 'alt_miner', 'alt_remeasure', 'flag_prior', 'flag_sample', 'flag_detector', 'flag_climate',
  'info_mode', 'why_liquidity', 'why_cert', 'why_deadline', 'why_labor',
];

const POINT_KEYS = [
  'affected_share_over_30pct',
  'rainy_month',
  'user_reports_heavy_rain',
  'no_treatment_last_60_days',
] as const;

const isObj = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function validatePack(json: unknown): { ok: true; pack: Pack } | { ok: false; errors: string[] } {
  if (!isObj(json)) return { ok: false, errors: ['(raíz): debe ser un objeto'] };
  const errors: string[] = [];

  if (!isStr(json.id)) errors.push('id');
  else if (json.id.includes('/')) errors.push('id (no puede contener "/")');
  if (typeof json.version !== 'string') errors.push('version');
  if (!isObj(json.language) || typeof json.language.code !== 'string') errors.push('language.code');

  const phrases = isObj(json.phrases) ? json.phrases : {};
  for (const k of REQUIRED_PHRASE_KEYS) if (!isStr(phrases[k])) errors.push(`phrases.${k}`);

  for (const c of CLASS_IDS) {
    if (!isObj(json.classes) || !isObj(json.classes[c])) errors.push(`classes.${c}`);
  }

  const rules = isObj(json.risk_rules) ? json.risk_rules : undefined;
  const points = rules && isObj(rules.points) ? rules.points : undefined;
  for (const k of POINT_KEYS) if (!points || !isNum(points[k])) errors.push(`risk_rules.points.${k}`);
  const th = rules && isObj(rules.thresholds) ? rules.thresholds : undefined;
  for (const k of ['medium', 'high']) if (!th || !isNum(th[k])) errors.push(`risk_rules.thresholds.${k}`);

  for (const k of ['calendar', 'economics', 'demo_values']) if (!isObj(json[k])) errors.push(k);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, pack: json as unknown as Pack };
}
