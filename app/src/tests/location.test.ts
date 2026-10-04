import { describe, expect, it } from 'vitest';
import { climateFor, distanceKm, nearestPoint, type ClimatePoint } from '../engine/rd/location';
import { buildInputs } from '../engine/rd/run';
import type { SeeResult } from '../engine/types';
import { loadPack } from './helpers';

const z = (v: number) => Array.from({ length: 52 }, () => [v, v, v]);
const P: ClimatePoint[] = [
  { name: 'Chinchiná, Caldas', lat: 4.98, lon: -75.6, weekly_z: z(0.1) },
  { name: 'Pitalito, Huila', lat: 1.85, lon: -76.05, weekly_z: z(0.2) },
];

describe('clima según la ubicación', () => {
  it('distancia: Chinchiná–Pitalito ≈ 350 km; mismo punto 0', () => {
    expect(distanceKm(P[0]!, P[1]!)).toBeGreaterThan(330);
    expect(distanceKm(P[0]!, P[1]!)).toBeLessThan(370);
    expect(distanceKm(P[0]!, P[0]!)).toBe(0);
  });

  it('elige el punto más cercano dentro del radio', () => {
    const r = nearestPoint(P, { lat: 1.9, lon: -76.1 }, 150);
    expect(r?.point.name).toBe('Pitalito, Huila');
    expect(r!.km).toBeLessThan(10);
  });

  it('lejos de todos los puntos o sin ubicación: usa el punto del paquete', () => {
    const normals = { weekly_z: z(0.9), points: P, default_point: 'Chinchiná, Caldas', max_km: 150 };
    expect(climateFor(normals, { lat: 40.4, lon: -3.7 })!.choice).toEqual({ name: 'Chinchiná, Caldas', km: null, source: 'paquete' });
    expect(climateFor(normals, null)!.weeklyZ[0]).toEqual([0.9, 0.9, 0.9]);
    expect(climateFor(normals, { lat: 1.86, lon: -76.04 })!.choice.source).toBe('gps');
  });

  it('el paquete de Colombia trae puntos cafeteros y buildInputs usa el más cercano', () => {
    const pack = loadPack('colombia-andina');
    const normals = pack.climate_normals as { points?: ClimatePoint[] };
    expect(normals.points!.length).toBeGreaterThanOrEqual(30);
    const ok: SeeResult = { status: 'ok', classId: 'roya', confidence: 0.9, probs: [] };
    const now = new Date(Date.UTC(2026, 9, 3));
    const pit = buildInputs(pack, [ok], { areaHa: 2, now, heavyRain: false, location: { lat: 1.86, lon: -76.04 } })!;
    expect(pit.climate.name).toBe('Pitalito, Huila');
    const sin = buildInputs(pack, [ok], { areaHa: 2, now, heavyRain: false })!;
    expect(sin.climate.source).toBe('paquete');
    expect(pit.weeks[0]![0]).not.toEqual(sin.weeks[0]![0]); // otro lugar, otro clima
  });
});
