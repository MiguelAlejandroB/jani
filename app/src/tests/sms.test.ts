import { describe, expect, it } from 'vitest';
import { buildCaseSummary, canSendCase, smsHref } from '../engine/sms';
import type { Case, RdSummary } from '../engine/types';
import { loadPack } from './helpers';

const pack = loadPack('colombia-andina');
const base: Case = {
  id: 'x',
  date: '2026-03-05T10:20:30.000Z',
  packId: pack.id,
  session: { results: [{ status: 'ok', classId: 'roya', confidence: 0.9, probs: [0, 1, 0, 0, 0] }], dominant: 'roya', affectedShare: 0.6, unsureShare: 0 },
  risk: { level: 'HIGH', points: 5, factors: [], usedDemoData: true },
  choice: 'CONSULT',
  sent: false,
};

describe('buildCaseSummary', () => {
  it('incluye fecha ISO, diagnóstico, riesgo y elección del paquete', () => {
    const s = buildCaseSummary(base, pack);
    expect(s).toContain('2026-03-05');
    expect(s).toContain(pack.phrases['dx_roya']);
    expect(s).toContain(pack.phrases['risk_high']);
    expect(s).toContain(pack.phrases['opt_consult']);
    expect(s).not.toContain('blob:');
    expect(s).not.toContain('data:');
  });
  it('hojas sanas: all_healthy y sin riesgo ni elección', () => {
    const s = buildCaseSummary({ ...base, session: { results: [{ status: 'ok', classId: 'sana', confidence: 0.9, probs: [1, 0, 0, 0, 0] }], dominant: null, affectedShare: 0, unsureShare: 0 }, risk: undefined, choice: undefined }, pack);
    expect(s).toContain(pack.phrases['all_healthy']);
    expect(s).not.toContain(pack.phrases['risk_high']);
  });
  it('sin dominante pero con duda: unsure', () => {
    const s = buildCaseSummary({ ...base, session: { ...base.session, dominant: null, unsureShare: 0.8 }, risk: undefined }, pack);
    expect(s).toContain(pack.phrases['unsure']);
  });
});

describe('smsHref', () => {
  it('codifica el cuerpo', () => {
    expect(smsHref('+573001112233', 'a b\nc&d')).toBe('sms:+573001112233?body=a%20b%0Ac%26d');
  });
  it('sin número: sms:?body= (la persona elige a quién enviarlo)', () => {
    expect(smsHref(null, 'a b')).toBe('sms:?body=a%20b');
    expect(smsHref('', 'a b')).toBe('sms:?body=a%20b');
  });
});

const rd = (level?: RdSummary['level']): RdSummary => ({
  paramsVersion: 'x',
  usedDemoData: true,
  ell: { p10: 0, p50: 0.1, p90: 0.2, cvar10: 0.3, p_sobre_umbral: 0.5 },
  banderas: [],
  recomendacion: null,
  alternativas: [],
  ...(level ? { level } : {}),
});

describe('canSendCase', () => {
  it('con el resumen del manual manda su nivel: HIGH y CONSULT habilitan, LOW y MEDIUM no', () => {
    expect(canSendCase({ ...base, risk: { level: 'LOW', points: 1, factors: [], usedDemoData: true }, choice: 'WAIT', rd: rd('HIGH') })).toBe(true);
    expect(canSendCase({ ...base, choice: 'WAIT', rd: rd('CONSULT') })).toBe(true);
    expect(canSendCase({ ...base, choice: 'TREAT', rd: rd('LOW') })).toBe(false);
    expect(canSendCase({ ...base, choice: 'WAIT', rd: rd('MEDIUM') })).toBe(false);
  });
  it('con el manual, el nivel antiguo HIGH ya no habilita', () => {
    expect(canSendCase({ ...base, choice: 'TREAT', rd: rd('LOW') })).toBe(false);
  });
  it('elegir CONSULT siempre habilita', () => {
    expect(canSendCase({ ...base, choice: 'CONSULT', rd: rd('LOW') })).toBe(true);
    expect(canSendCase({ ...base, risk: undefined, choice: 'CONSULT' })).toBe(true);
  });
  it('sin rd conserva la regla antigua (risk HIGH)', () => {
    expect(canSendCase({ ...base, choice: 'TREAT' })).toBe(true);
    expect(canSendCase({ ...base, risk: { level: 'MEDIUM', points: 3, factors: [], usedDemoData: true }, choice: 'TREAT' })).toBe(false);
  });
  it('un resumen guardado antes de existir `level` cae a la regla antigua', () => {
    expect(canSendCase({ ...base, choice: 'TREAT', rd: rd() })).toBe(true);
  });
});

describe('buildCaseSummary con el resumen del manual', () => {
  it('usa el nivel del manual en lugar del antiguo', () => {
    const s = buildCaseSummary({ ...base, rd: rd('LOW') }, pack);
    expect(s).toContain(pack.phrases['risk_low']);
    expect(s).not.toContain(pack.phrases['risk_high']);
  });
  it('nivel CONSULT del manual: sin línea de riesgo, solo texto', () => {
    const s = buildCaseSummary({ ...base, rd: rd('CONSULT') }, pack);
    expect(s).not.toContain(pack.phrases['risk_high']);
    expect(s).not.toMatch(/blob:|data:|[-+]?\d+\.\d{3,}/);
  });
});
