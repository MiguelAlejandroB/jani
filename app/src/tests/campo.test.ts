/// <reference types="node" />
// @vitest-environment node
// Regresión: "todas las fotos piden repetir". Fotos REALES de campo (Uganda y Perú, Mendeley, CC BY 4.0) que el
// control de calidad y el filtro de hoja rechazaban sin razón. Umbrales recalibrados con datos (ver docs/DECISIONS.md):
// la nitidez mínima y la fracción de hoja mínima se midieron contra fotos desenfocadas y fotos que no son hojas.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import segRaw from '../../public/models/leafseg-v1/model_card.json?raw';
import { assessQuality } from '../engine/quality';
import { checkLeaf, parseSegCard } from '../engine/segment';

const card = parseSegCard(segRaw);
const fx = (name: string, size: number) => new Uint8ClampedArray(gunzipSync(readFileSync(`tests/fixtures/${name}_${size}.rgba.gz`)));
const modelBytes = readFileSync(`public/models/leafseg-v1/${card.recommended_file}`);
let server: Server;
let MODEL = '';
beforeAll(async () => {
  server = createServer((_q, r) => r.end(modelBytes));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  MODEL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/m.onnx`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function blur(rgba: Uint8ClampedArray, size: number, passes = 6): Uint8ClampedArray {
  let a = rgba.slice();
  for (let p = 0; p < passes; p++) {
    const b = a.slice();
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++)
        for (let c = 0; c < 3; c++) {
          const i = (y * size + x) * 4 + c;
          b[i] = (a[i]! * 4 + a[i - 4]! + a[i + 4]! + a[i - size * 4]! + a[i + size * 4]!) / 8;
        }
    a = b;
  }
  return a;
}

describe('fotos reales de campo', () => {
  it('un primer plano real de hoja (Uganda) pasa el control de calidad', () => {
    expect(assessQuality(fx('campo_uganda', 224), 224, 224)).toBe('ok');
  });
  it('la misma foto desenfocada sigue pidiendo repetir', () => {
    expect(assessQuality(blur(fx('campo_uganda', 224), 224), 224, 224)).toBe('bad_photo');
  });
  it('una hoja en la planta con follaje de fondo (Perú) pasa el filtro de hoja', async () => {
    const r = await checkLeaf(fx('campo_peru', 256), fx('campo_peru', 224), 224, card, MODEL);
    expect(r.gate).toBe('ok');
  }, 60000);
});
