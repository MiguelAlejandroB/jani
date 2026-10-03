import { describe, expect, it } from 'vitest';
import { buildSession, sessionOutcome } from '../engine/session';
import type { ClassId, SeeResult } from '../engine/types';

const ok = (classId: ClassId): SeeResult => ({ status: 'ok', classId, confidence: 0.9, probs: [] });
const unsure: SeeResult = { status: 'unsure', reason: 'low_confidence' };

describe('buildSession', () => {
  it('mezcla: dominante = no sana más frecuente', () => {
    const s = buildSession([ok('roya'), ok('roya'), ok('minador'), ok('sana'), unsure]);
    expect(s.dominant).toBe('roya');
    expect(s.affectedShare).toBe(3 / 4);
    expect(s.unsureShare).toBe(1 / 5);
  });
  it('empate: gana la primera en CLASS_IDS', () => {
    expect(buildSession([ok('phoma'), ok('minador')]).dominant).toBe('minador');
  });
  it('sin ok: dominante null y proporciones 0', () => {
    const s = buildSession([unsure]);
    expect(s.dominant).toBeNull();
    expect(s.affectedShare).toBe(0);
    expect(s.unsureShare).toBe(1);
    expect(buildSession([]).unsureShare).toBe(0);
  });
  it('todas sanas: dominante null, affectedShare 0', () => {
    const s = buildSession([ok('sana'), ok('sana')]);
    expect(s.dominant).toBeNull();
    expect(s.affectedShare).toBe(0);
  });
});

describe('sessionOutcome', () => {
  it('3 de 5 unsure -> consult', () => {
    expect(sessionOutcome(buildSession([unsure, unsure, unsure, ok('roya'), ok('roya')]))).toBe('consult');
  });
  it('2 de 4 unsure y 2 sanas -> healthy (0.5 no es > 0.5)', () => {
    expect(sessionOutcome(buildSession([unsure, unsure, ok('sana'), ok('sana')]))).toBe('healthy');
  });
  it('todas sanas -> healthy', () => {
    expect(sessionOutcome(buildSession([ok('sana'), ok('sana'), ok('sana')]))).toBe('healthy');
  });
  it('ningún ok -> consult', () => {
    expect(sessionOutcome(buildSession([]))).toBe('consult');
  });
  it('alguna enferma -> continue', () => {
    expect(sessionOutcome(buildSession([ok('sana'), ok('roya')]))).toBe('continue');
  });
});
