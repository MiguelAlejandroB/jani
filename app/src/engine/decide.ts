import type { Pack } from '../packs/schema';
import { resolve } from './resolve';
import type { DecideInput, DecideResult, Range } from './types';

const round2 = (x: number): number => Math.round(x * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRange = (v: unknown): v is Range => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Función pura: economía en kilos de café. Falta algún valor -> CONSULT sin kpis. */
export function decide(input: DecideInput, pack: Pack): DecideResult {
  let usedDemoData = false;
  const get = (path: string): unknown => {
    const r = resolve(pack, path);
    if (!r.found) return undefined;
    usedDemoData ||= r.usedDemo;
    return r.value;
  };
  const consult: DecideResult = { suggestion: 'CONSULT', phrase: 'consult', usedDemoData: false };
  const fail = (): DecideResult => ({ ...consult, usedDemoData });

  const yieldKg = get('economics.typical_yield_kg_per_ha');
  const price = get('economics.price_per_kg');
  const level = input.risk.toLowerCase();
  const lossNo = get(`economics.loss_share_by_risk.${input.dominant}.${level}`);
  const treatment = get(`economics.treatments.${input.dominant}.0`);
  if (!isNum(yieldKg) || !isNum(price) || price <= 0 || !isRange(lossNo) || !isObj(treatment)) return fail();
  const { cost_per_ha: costPerHa, residual_risk: residual } = treatment;
  if (!isNum(costPerHa) || typeof residual !== 'string') return fail();
  const lossTreated = get(`economics.loss_share_by_risk.${input.dominant}.${residual}`);
  if (!isRange(lossTreated)) return fail();

  const production = yieldKg * input.areaHa;
  const noAct: Range = [production * lossNo[0], production * lossNo[1]];
  const treated: Range = [production * lossTreated[0], production * lossTreated[1]];
  const costKg = (costPerHa * input.areaHa) / price;
  const net: Range = [noAct[0] - treated[1] - costKg, noAct[1] - treated[0] - costKg];

  let suggestion: DecideResult['suggestion'];
  let phrase: DecideResult['phrase'];
  let confidence: 'high' | 'medium' | 'low';
  if (net[0] > 0) [suggestion, phrase, confidence] = ['TREAT', 'act_cheaper', 'high'];
  else if (net[1] < 0) [suggestion, phrase, confidence] = ['WAIT', 'wait_ok', 'high'];
  else if (input.risk === 'LOW') [suggestion, phrase, confidence] = ['WAIT', 'wait_ok', 'medium'];
  else [suggestion, phrase, confidence] = ['CONSULT', 'consult', 'low'];

  return {
    suggestion,
    kpis: {
      expectedLossKg: [round2(noAct[0]), round2(noAct[1])],
      treatmentCostKg: round2(costKg),
      breakEvenKg: round2(costKg),
      netBenefitKg: [round2(net[0]), round2(net[1])],
      confidence,
    },
    usedDemoData,
    phrase,
  };
}
