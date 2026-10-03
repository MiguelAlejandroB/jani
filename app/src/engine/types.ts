export type ClassId = 'sana' | 'roya' | 'minador' | 'phoma' | 'cercospora';
export const CLASS_IDS: readonly ClassId[] = ['sana', 'roya', 'minador', 'phoma', 'cercospora'];
export type SeeResult =
  | { status: 'ok'; classId: ClassId; confidence: number; probs: number[] }
  | { status: 'unsure'; reason: 'bad_photo' | 'low_confidence' | 'low_margin'; probs?: number[] };
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
export type Case = { id: string; date: string; packId: string; session: Session; risk?: PredictResult; decision?: DecideResult; choice?: Choice; sent: boolean };
