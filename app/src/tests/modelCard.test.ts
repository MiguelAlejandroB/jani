import { describe, expect, it } from 'vitest';
import cardRaw from '../../public/models/arabica-v1/model_card.json?raw';
import { parseModelCard, validateModelCard } from '../engine/modelCard';

const base = () => JSON.parse(cardRaw) as Record<string, unknown> & { input: Record<string, unknown>; unsure_rule: Record<string, unknown> };

describe('parseModelCard', () => {
  it('acepta la ficha de public/models', () => {
    const card = parseModelCard(cardRaw);
    expect(card.classes).toEqual(['sana', 'roya', 'minador', 'phoma', 'cercospora']);
    expect(card.input.shape).toEqual([1, 3, 224, 224]);
  });

  it('tolera NaN / Infinity / -Infinity sueltos (json.dump de Python) y los vuelve null', () => {
    const text = cardRaw.replace('"metrics": {}', '"metrics": {"f1": NaN, "loss": Infinity, "x": -Infinity, "nota": "NaN Infinity"}');
    expect(text).not.toBe(cardRaw);
    const card = parseModelCard(text);
    expect(card.metrics).toEqual({ f1: null, loss: null, x: null, nota: 'NaN Infinity' });
  });

  it('NaN en un campo que se usa invalida la ficha', () => {
    const text = cardRaw.replace('"temperature": 1.0', '"temperature": NaN');
    expect(text).not.toBe(cardRaw);
    expect(() => parseModelCard(text)).toThrow(/temperature/);
  });

  it('JSON roto -> error', () => {
    expect(() => parseModelCard('{"classes": [')).toThrow();
  });
});

describe('validateModelCard', () => {
  const bad: Array<[string, (c: ReturnType<typeof base>) => void]> = [
    ['classes', (c) => (c.classes = [])],
    ['classes', (c) => (c.classes = ['sana', 'otra'])],
    ['classes', (c) => delete c.classes],
    ['input.mean', (c) => (c.input.mean = [0.5, 0.5])],
    ['input.std', (c) => (c.input.std = [0.2, null, 0.2])],
    ['input.std', (c) => (c.input.std = [0.2, 0, 0.2])],
    ['input.shape', (c) => (c.input.shape = [1, 3, 224])],
    ['input.name', (c) => delete c.input.name],
    ['temperature', (c) => (c.temperature = 0)],
    ['temperature', (c) => (c.temperature = '1')],
    ['unsure_rule.min_confidence', (c) => (c.unsure_rule.min_confidence = null)],
    ['unsure_rule.min_margin', (c) => delete c.unsure_rule.min_margin],
    ['output.name', (c) => (c.output = {})],
    ['recommended_file', (c) => (c.recommended_file = 3)],
  ];
  for (const [field, mutate] of bad) {
    it(`rechaza ${field} inválido (${mutate.toString().slice(6, 60)})`, () => {
      const c = base();
      mutate(c);
      const v = validateModelCard(c);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.errors).toContain(field);
    });
  }

  it('ficha válida -> ok', () => {
    expect(validateModelCard(base()).ok).toBe(true);
  });
});
