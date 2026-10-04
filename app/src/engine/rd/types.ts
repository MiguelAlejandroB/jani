// Contratos de datos de los modelos de RIESGO y DECISIÓN (manual §1.1, §2.5, §3.5, §4.1, §8).

export type Disease = 'roya' | 'minador' | 'phoma' | 'cercospora';
export const DISEASES: readonly Disease[] = ['roya', 'minador', 'phoma', 'cercospora'];

/** Lo que entrega la Etapa 1 por foto: clasificador (M1) + segmentación (M2) + calidad de captura. */
export type PhotoObs = { clase: string; p_clase: number; severidad: number | null; p_calidad: number };

export type ChainCounts = { disease: Disease; n: number[]; n_censored: number; m: number; m_eff: number; flags: string[] };

export type Draws = { log_tau: number[][]; gamma_w: number[][]; g: number[][]; kappa: number[] };
export type Evidence = 'prior' | 'estimado';

/** Paquete de parámetros versionado (public/models/riesgo-v1/params.json), producido por run_calibration.py. */
export type RdParams = {
  version: string;
  levels: { thresholds: Record<Disease, number[]> };
  lambda: number[][];
  lambda_evidence: Evidence;
  adapter: { p_class_min: number; p_quality_min: number; rho: number; units_per_plant: number; min_m_eff: number };
  prior_pi0: { strength: number; regional: Record<Disease, number[]> };
  climate: { features: string[]; range_sd: number };
  draws: Record<Disease, Draws>;
  evidence: Record<Disease, Record<string, Evidence>>;
  yield: { sd_log: number; evidence: string };
  conformal: { q_frac: number; evidence: string };
  loss_threshold: number;
  particles: number;
  decision: {
    delta_weeks: number;
    m1: number;
    obs_bins: [number, number];
    theta_r: Record<string, number>;
    theta_default: string;
    remeasure_labor_days: number;
    harvest_wage_factor: number;
    price_sd: number;
    price_age_widen_per_week: number;
    own_capital_rate_monthly: number;
    f3_min_prob_better: number;
    max_shown: number;
  };
  /** Visualización: bandas de P(pérdida > loss_threshold) para bajo / medio / alto. */
  display?: { risk_bands: [number, number] };
  calibration_age_days?: number;
  modo?: { recomendacion_automatica: boolean; razon: string | null };
};

export type BetaDist = { dist: 'beta'; a: number; b: number };
export type Action = {
  id: string;
  frase?: string;
  icono?: string;
  aplica_a: Disease[];
  nivel_min: number;
  semanas_min_a_cosecha?: number | null;
  efecto: { d_a: BetaDist | null; kappa: BetaDist | null; duracion_semanas: number };
  costos: { directo_por_ha: number; jornales_por_ha: number; cert_penalizacion: number; calidad_delta: number };
  restricciones: { incompatible_con_certificaciones?: string[]; periodo_de_carencia_semanas?: number };
  evidencia: 'criterio_experto' | 'estimado' | 'piloto';
  fuente?: string | null;
};

export type Profile = {
  certificaciones: string[];
  caja: number;
  credito: number;
  jornales_disponibles_semana: number;
  aversion: string;
};

export type Econ = {
  price_med: number;
  price_age_weeks: number;
  wage: number;
  monthly_rate: number;
  area_ha: number;
  harvest_season_t0: boolean;
  harvest_season_t1: boolean;
};

export type Particle = { pi0: number[]; d: number; logw: number; w: number; pi_T?: number[]; mu?: number; ell?: number };

export type Summary = { p10: number; p50: number; p90: number };
export type RiskOut = {
  ell: Summary & { cvar10: number; p_sobre_umbral: number };
  Y: Summary & { conforme: [number, number] };
  banderas: string[];
  weights: number[];
  ell_samples: number[];
  y0: number[];
  per_disease: Partial<Record<Disease, { particles: Particle[]; ess: number }>>;
  weeks: [number[], number][];
};

export type Alternative = {
  id: string;
  evidencia?: string;
  viable_hoy: boolean;
  razon_no_viable: string | null;
  margen: { ce: number; esperado: number; cvar10: number; p_negativo: number } | null;
  perdida_pct?: { p50: number; p90: number };
  costos?: { directo: number; dinero: number; laboral: number; certificacion: number; calidad: number };
  costo_oportunidad?: number;
  p_mejor_que_nada?: number;
  no_se_justifica?: boolean;
  domina_a?: string[];
  dominada_por?: string | null;
  costo_demora?: number | null;
};

export type DecisionOut = {
  alternativas: Alternative[];
  mostradas: string[];
  recomendacion: string | null;
  razon_sin_recomendacion: string | null;
  valor_de_esperar: number;
  valor_de_remedir: number;
  costo_remedir: number;
  recomendar_remedir: boolean;
  sensibilidad: { theta_bajo: string; theta_alto: string };
  theta: number;
  banderas: string[];
  unidad: 'kg';
};
