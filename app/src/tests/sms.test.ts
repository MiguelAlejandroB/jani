import { describe, expect, it } from 'vitest';
import { buildCaseSummary, smsHref } from '../engine/sms';
import type { Case } from '../engine/types';
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
