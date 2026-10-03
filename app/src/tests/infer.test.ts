/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSession, preprocess, runModel } from '../engine/infer';
import type { ModelCard } from '../engine/modelCard';
import { applyUnsureRule, softmax } from '../engine/modelCard';

const card = JSON.parse(readFileSync('tests/fixtures/model_card.test.json', 'utf8')) as ModelCard;
const modelBytes = readFileSync('tests/fixtures/tiny_model.onnx');
let server: Server;
let MODEL = '';
// ort-web descarga el modelo con fetch: en node lo servimos por HTTP local.
beforeAll(async () => {
  server = createServer((_req, res) => res.end(modelBytes));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  MODEL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/tiny_model.onnx`;
});
afterAll(() => {
  server.close();
});

// Pesos del fixture (ver make_tiny_model.py).
const W = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [-1, 0, 1]];
const B = [0, 0.5, -0.5, 0.25, 0];
const PX = [128, 64, 255];

function uniform(n: number, rgb: number[]): Uint8ClampedArray {
  const a = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) a.set([rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, 255], i * 4);
  return a;
}
const norm = (c: number) => ((PX[c] ?? 0) / 255 - (card.input.mean[c] ?? 0)) / (card.input.std[c] ?? 1);
const expectedLogits = W.map((row, k) => row.reduce((s, w, c) => s + w * norm(c), 0) + (B[k] ?? 0));

describe('preprocess', () => {
  const t = preprocess(uniform(224, PX), card);
  it('NCHW float32 con el tamaño del card', () => {
    expect(t).toBeInstanceOf(Float32Array);
    expect(t.length).toBe(3 * 224 * 224);
  });
  it('normaliza cada canal (÷255, −mean, ÷std)', () => {
    for (let c = 0; c < 3; c++) {
      expect(t[c * 224 * 224]).toBeCloseTo(norm(c), 5);
      expect(t[(c + 1) * 224 * 224 - 1]).toBeCloseTo(norm(c), 5);
    }
  });
});

describe('inferencia real (onnxruntime-web WASM en node)', () => {
  it('runModel devuelve los logits esperados', async () => {
    const logits = await runModel(uniform(224, PX), card, MODEL);
    expect(logits).toHaveLength(5); // tolerancia 1e-3: GlobalAveragePool suma 50176 float32 (error ~1.4e-4)
    logits.forEach((v, i) => expect(Math.abs(v - (expectedLogits[i] ?? 0))).toBeLessThan(1e-3));
  });
  it('getSession reutiliza la misma sesión por URL', async () => {
    const a = await getSession(MODEL);
    const b = await getSession(MODEL);
    expect(a).toBe(b);
  });
});

describe('softmax con temperatura + regla de duda sobre los logits del fixture', () => {
  it('coincide con el cálculo a mano', () => {
    const probs = softmax(expectedLogits, card.temperature);
    const exps = expectedLogits.map((l) => Math.exp(l / card.temperature));
    const tot = exps.reduce((a, b) => a + b, 0);
    probs.forEach((p, i) => expect(p).toBeCloseTo((exps[i] ?? 0) / tot, 10));
    const sorted = [...probs].sort((a, b) => b - a);
    const expected =
      (sorted[0] ?? 0) < card.unsure_rule.min_confidence
        ? 'low_confidence'
        : (sorted[0] ?? 0) - (sorted[1] ?? 0) < card.unsure_rule.min_margin
          ? 'low_margin'
          : 'ok';
    expect(applyUnsureRule(probs, card, card.classes).status).toBe(expected === 'ok' ? 'ok' : 'unsure');
  });
});
