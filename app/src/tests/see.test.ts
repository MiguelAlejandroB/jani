import { describe, expect, it } from 'vitest';
import cardRaw from '../../public/models/arabica-v1/model_card.json?raw';
import type { ModelCard } from '../engine/modelCard';
import { applyUnsureRule, softmax } from '../engine/modelCard';
import { getSimPlan, nextSimOutcome, resetSim, simulatedProbs } from '../engine/see';
import { CLASS_IDS } from '../engine/types';

const card = JSON.parse(cardRaw) as ModelCard;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('softmax', () => {
  it('suma 1 y es estable con logits grandes', () => {
    const p = softmax([1000, 1001, 999], 1);
    expect(sum(p)).toBeCloseTo(1, 10);
    expect(p.every(Number.isFinite)).toBe(true);
    expect(p[1]).toBeGreaterThan(p[0] ?? 1);
  });
  it('la temperatura suaviza', () => {
    const a = softmax([2, 0], 1)[0] ?? 0;
    const b = softmax([2, 0], 2)[0] ?? 0;
    expect(b).toBeLessThan(a);
    expect(a).toBeCloseTo(1 / (1 + Math.exp(-2)), 10);
  });
});

describe('applyUnsureRule', () => {
  const classes = card.classes;
  it('ok cuando supera confianza y margen', () => {
    const r = applyUnsureRule([0.02, 0.9, 0.03, 0.03, 0.02], card, classes);
    expect(r).toMatchObject({ status: 'ok', classId: 'roya', confidence: 0.9 });
  });
  it('low_confidence si max < min_confidence', () => {
    // Relativo al umbral de la ficha activa: sirve con la de ejemplo y con la real.
    const max = card.unsure_rule.min_confidence - 0.01;
    const rest = (1 - max) / 4;
    expect(applyUnsureRule([max, rest, rest, rest, rest], card, classes)).toMatchObject({ status: 'unsure', reason: 'low_confidence' });
  });
  it('low_margin si margen < min_margin', () => {
    const c = { ...card, unsure_rule: { min_confidence: 0.4, min_margin: 0.15 } };
    expect(applyUnsureRule([0.45, 0.4, 0.05, 0.05, 0.05], c, classes)).toMatchObject({ status: 'unsure', reason: 'low_margin' });
  });
});

describe('simulatedProbs', () => {
  it('clase X: 0.9 y el resto 0.025', () => {
    const p = simulatedProbs('minador', card.classes);
    expect(p?.[2]).toBeCloseTo(0.9, 10);
    expect(p?.[0]).toBeCloseTo(0.025, 10);
    expect(sum(p ?? [])).toBeCloseTo(1, 10);
  });
  it('low_confidence: máximo 0.5', () => {
    const p = simulatedProbs('low_confidence', card.classes) ?? [];
    expect(Math.max(...p)).toBe(0.5);
    expect(sum(p)).toBeCloseTo(1, 10);
  });
  it('low_margin: 0.45 / 0.40 / resto', () => {
    const p = simulatedProbs('low_margin', card.classes) ?? [];
    expect([...p].sort((a, b) => b - a).slice(0, 2)).toEqual([0.45, 0.4]);
    expect(sum(p)).toBeCloseTo(1, 10);
  });
  it('bad_photo: sin probabilidades', () => {
    expect(simulatedProbs('bad_photo', card.classes)).toBeNull();
  });
  it('las probabilidades de clase pasan la regla con el card de ejemplo', () => {
    for (const id of CLASS_IDS) {
      const p = simulatedProbs(id, card.classes) ?? [];
      expect(applyUnsureRule(p, card, card.classes)).toMatchObject({ status: 'ok', classId: id });
    }
    // Las salidas simuladas low_* se definen contra una regla fija (0.8 / 0.15), no contra la ficha real.
    const strict = { ...card, unsure_rule: { min_confidence: 0.8, min_margin: 0.15 } };
    expect(applyUnsureRule(simulatedProbs('low_confidence', card.classes) ?? [], strict, card.classes)).toMatchObject({ reason: 'low_confidence' });
    const relaxed = { ...card, unsure_rule: { min_confidence: 0.4, min_margin: 0.15 } };
    expect(applyUnsureRule(simulatedProbs('low_margin', card.classes) ?? [], relaxed, card.classes)).toMatchObject({ reason: 'low_margin' });
  });
});

describe('cola simulada', () => {
  it('por defecto (sin localStorage) es [roya] y cicla', () => {
    expect(getSimPlan()).toEqual(['roya']);
    resetSim();
    expect(nextSimOutcome()).toBe('roya');
    expect(nextSimOutcome()).toBe('roya');
  });
  it('lee localStorage[jani.sim] y recorre cíclicamente', () => {
    const store: Record<string, string> = { 'jani.sim': JSON.stringify(['roya', 'sana', 'bad_photo']) };
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null };
    try {
      resetSim();
      expect([1, 2, 3, 4].map(() => nextSimOutcome())).toEqual(['roya', 'sana', 'bad_photo', 'roya']);
      resetSim();
      expect(nextSimOutcome()).toBe('roya');
      store['jani.sim'] = 'no es json';
      expect(getSimPlan()).toEqual(['roya']);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
