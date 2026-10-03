import { describe, expect, it } from 'vitest';
import { assessQuality, laplacianVariance, meanBrightness, toGray } from '../engine/quality';

const N = 224;

function solid(v: number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(N * N * 4);
  for (let i = 0; i < a.length; i += 4) a.set([v, v, v, 255], i);
  return a;
}

/** Tablero de 8 px con valores lo/hi. */
function checker(lo: number, hi: number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? lo : hi;
      a.set([v, v, v, 255], (y * N + x) * 4);
    }
  return a;
}

describe('quality', () => {
  it('toGray usa luma 0.299/0.587/0.114', () => {
    const g = toGray(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]));
    expect(g[0]).toBeCloseTo(76.245, 3);
    expect(g[1]).toBeCloseTo(149.685, 3);
    expect(g[2]).toBeCloseTo(29.07, 3);
  });
  it('imagen negra, blanca y gris plano -> bad_photo', () => {
    expect(assessQuality(solid(0), N, N)).toBe('bad_photo');
    expect(assessQuality(solid(255), N, N)).toBe('bad_photo');
    expect(assessQuality(solid(128), N, N)).toBe('bad_photo');
  });
  it('gris plano tiene varianza 0', () => {
    expect(laplacianVariance(toGray(solid(128)), N, N)).toBe(0);
  });
  it('tablero 0/255 de 8 px: media 127.5 y varianza alta -> ok', () => {
    // 224/8 = 28 casillas por lado (par): mitad 0, mitad 255 -> media exacta 127.5.
    // Laplaciano 4-vecinos por casilla de 8x8 (lejos del borde de la imagen):
    //   interior (6x6=36 px): 0; borde no esquina (24 px): +-255; esquina (4 px): +-510.
    //   media ~0; varianza ~ (24*255^2 + 4*510^2)/64 = 2601000/64 = 40640.6
    // (los pixeles de la frontera de la imagen no se evaluan, de ahi la tolerancia).
    const g = toGray(checker(0, 255));
    expect(meanBrightness(g)).toBeCloseTo(127.5, 6);
    const v = laplacianVariance(g, N, N);
    expect(v).toBeGreaterThan(40640.6 * 0.95);
    expect(v).toBeLessThan(40640.6 * 1.05);
    expect(assessQuality(checker(0, 255), N, N)).toBe('ok');
  });
  it('tablero recortado a gris medio (100/160) -> ok', () => {
    // media 130; Laplaciano: bordes +-60, esquinas +-120 -> varianza ~ 40640.6*(60/255)^2 ~ 2250 > 60
    const a = checker(100, 160);
    expect(meanBrightness(toGray(a))).toBeCloseTo(130, 6);
    expect(assessQuality(a, N, N)).toBe('ok');
  });
});
