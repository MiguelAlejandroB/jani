export type ClassId = 'sana' | 'roya' | 'minador' | 'phoma' | 'cercospora';
export const CLASS_IDS: readonly ClassId[] = ['sana', 'roya', 'minador', 'phoma', 'cercospora'];
export type SeeResult =
  | { status: 'ok'; classId: ClassId; confidence: number; probs: number[]; severity?: { fraction: number; level: string } }
  | { status: 'unsure'; reason: 'bad_photo' | 'low_confidence' | 'low_margin'; probs?: number[]; /** bad_photo porque el segmentador no vio una hoja. */ noLeaf?: true };
export type Session = { results: SeeResult[]; dominant: ClassId | null; affectedShare: number; unsureShare: number };
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type PredictInput = { dominant: ClassId; affectedShare: number; month: number; heavyRainThisWeek: boolean; treatedLast60Days: boolean };
export type PredictResult =
  | { level: RiskLevel; points: number; factors: string[]; usedDemoData: boolean }
  | { level: 'CONSULT'; reason: string };
export type Range = [number, number];
export type DecideInput = { dominant: ClassId; risk: RiskLevel; areaHa: number };
export type DecideResult = {
  suggestion: 'WAIT' | 'TREAT' | 'CONSULT';
  kpis?: { expectedLossKg: Range; treatmentCostKg: number; breakEvenKg: number; netBenefitKg: Range; confidence: 'high' | 'medium' | 'low' };
  usedDemoData: boolean;
  phrase: 'act_cheaper' | 'wait_ok' | 'consult';
};
export type Choice = 'WAIT' | 'TREAT' | 'CONSULT';
/** Resumen guardado de los modelos de RIESGO y DECISIÓN (sin partículas: liviano para IndexedDB y el SMS). */
export type RdSummary = {
  paramsVersion: string;
  usedDemoData: boolean;
  ell: { p10: number; p50: number; p90: number; cvar10: number; p_sobre_umbral: number };
  banderas: string[];
  /** Nombre del punto de clima usado (no se guardan coordenadas). */
  clima?: string;
  /** Nivel de riesgo del manual (bandas del paquete de parámetros); ausente en casos guardados antes de existir. */
  level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CONSULT';
  recomendacion: string | null;
  alternativas: { id: string; ce: number | null; viable_hoy: boolean; razon_no_viable: string | null }[];
};
export type Case = { id: string; date: string; packId: string; session: Session; risk?: PredictResult; decision?: DecideResult; choice?: Choice; /** Alternativa elegida en la pantalla de decisión (id del catálogo, `nada` o `remeasure`). */ alternative?: string; rd?: RdSummary; sent: boolean };
