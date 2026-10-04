/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import segRaw from '../../public/models/leafseg-v1/model_card.json?raw';
import { argmaxMask, checkLeaf, leafGate, maskStats, parseSegCard, severityLevel } from '../engine/segment';
import type { SegCard } from '../engine/segment';

const card = parseSegCard(segRaw);
const base = () => JSON.parse(segRaw) as Record<string, unknown> & { leaf_gate: Record<string, unknown> };

/** RGBA de una hoja real de BRACOL (ejemplos.png del notebook), ya estirada a size x size. */
const leaf = (name: 'leaf_sana' | 'leaf_roya', size: 224 | 256) =>
  new Uint8ClampedArray(gunzipSync(readFileSync(`tests/fixtures/${name}_${size}.rgba.gz`)));

/** Ruido RGB uniforme reproducible (LCG). */
function noise(size: number, seed = 1): Uint8ClampedArray {
  const a = new Uint8ClampedArray(size * size * 4);
  let s = seed;
  for (let i = 0; i < a.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    a[i] = i % 4 === 3 ? 255 : s >>> 24;
  }
  return a;
}

describe('parseSegCard', () => {
  it('acepta la ficha de public/models/leafseg-v1', () => {
    expect(card.input.shape).toEqual([1, 3, 256, 256]);
    expect(card.leaf_gate.min_leaf_fraction).toBe(0.1);
    expect(card.recommended_file).toBe('model_int8.onnx');
  });
  it('rechaza una ficha sin las clases fondo/hoja/sintoma', () => {
    const c = base();
    c.classes = ['fondo', 'hoja'];
    expect(() => parseSegCard(JSON.stringify(c))).toThrow(/classes/);
  });
  it('rechaza leaf_gate sin min_leaf_fraction', () => {
    const c = base();
    delete c.leaf_gate.min_leaf_fraction;
    expect(() => parseSegCard(JSON.stringify(c))).toThrow(/leaf_gate/);
  });
});

describe('argmaxMask', () => {
  it('elige la clase con mayor logit por píxel (NCHW)', () => {
    // 2 píxeles, 3 clases: píxel 0 -> clase 2, píxel 1 -> clase 0
    const logits = new Float32Array([0, 5, 1, 0, 3, -1]);
    expect(Array.from(argmaxMask(logits, 3, 2))).toEqual([2, 0]);
  });
});

describe('maskStats', () => {
  it('fracción de hoja, severidad y fracción verde de los píxeles "hoja"', () => {
    // 4 píxeles: fondo, hoja verde, hoja roja, síntoma
    const mask = new Uint8Array([0, 1, 1, 2]);
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 10, 200, 10, 255, 200, 10, 10, 255, 150, 90, 20, 255]);
    const s = maskStats(mask, rgba);
    expect(s.leafFraction).toBeCloseTo(0.75, 10);
    expect(s.severity).toBeCloseTo(1 / 3, 10);
    expect(s.greenFraction).toBeCloseTo(0.5, 10);
  });
  it('sin hoja: todo en 0', () => {
    const s = maskStats(new Uint8Array([0, 0]), new Uint8ClampedArray(8));
    expect(s).toEqual({ leafFraction: 0, severity: 0, greenFraction: 0 });
  });
});

describe('severityLevel', () => {
  it('usa los niveles de la ficha', () => {
    expect(severityLevel(0, card)).toBe('sana');
    expect(severityLevel(0.03, card)).toBe('muy_baja');
    expect(severityLevel(0.12, card)).toBe('alta');
    expect(severityLevel(0.5, card)).toBe('muy_alta');
  });
});

describe('leafGate', () => {
  const okStats = { leafFraction: 0.4, severity: 0.02, greenFraction: 0.95 };
  it('hoja normal pasa', () => {
    expect(leafGate(okStats, 150, card)).toBe('ok');
  });
  it('poca hoja -> not_leaf', () => {
    expect(leafGate({ ...okStats, leafFraction: 0.05 }, 150, card)).toBe('not_leaf');
  });
  it('"hoja" que no es verde -> not_leaf', () => {
    expect(leafGate({ ...okStats, greenFraction: 0.4 }, 150, card)).toBe('not_leaf');
  });
  it('textura de ruido -> not_leaf', () => {
    expect(leafGate(okStats, 5000, card)).toBe('not_leaf');
  });
  it('sin min_green_fraction / max_texture_var en la ficha, solo se aplica min_leaf_fraction', () => {
    const c: SegCard = { ...card, leaf_gate: { min_leaf_fraction: 0.25 } };
    expect(leafGate({ ...okStats, greenFraction: 0 }, 1e6, c)).toBe('ok');
  });
});

describe('checkLeaf con el modelo real (onnxruntime-web WASM en node)', () => {
  let server: Server;
  let MODEL = '';
  const bytes = readFileSync('public/models/leafseg-v1/model_int8.onnx');
  beforeAll(async () => {
    server = createServer((_req, res) => res.end(bytes));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    MODEL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/leafseg.onnx`;
  });
  afterAll(() => {
    server.close();
  });

  it('hoja sana real: pasa y la severidad es baja', async () => {
    const r = await checkLeaf(leaf('leaf_sana', 256), leaf('leaf_sana', 224), 224, card, MODEL);
    expect(r.gate).toBe('ok');
    expect(r.stats.severity).toBeLessThan(0.1);
  }, 30000);
  it('hoja con roya real: pasa y tiene síntoma', async () => {
    const r = await checkLeaf(leaf('leaf_roya', 256), leaf('leaf_roya', 224), 224, card, MODEL);
    expect(r.gate).toBe('ok');
    expect(r.stats.severity).toBeGreaterThan(0.02);
  }, 30000);
  it('ruido aleatorio: not_leaf (antes pasaba como 94 % hoja)', async () => {
    const r = await checkLeaf(noise(256), noise(224, 7), 224, card, MODEL);
    expect(r.gate).toBe('not_leaf');
  }, 30000);
});
