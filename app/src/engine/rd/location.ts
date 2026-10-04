// Clima según la ubicación del teléfono (GPS, funciona sin internet). La ubicación se usa solo dentro del teléfono
// para elegir el punto de clima más cercano del paquete; nunca se envía ni se guarda en los casos.

export type LatLon = { lat: number; lon: number };
export type ClimatePoint = { name: string; lat: number; lon: number; weekly_z: number[][]; weekly_mean?: number[][] };
export type ClimateChoice = { name: string; km: number | null; source: 'gps' | 'paquete' };

/** Distancia en km sobre la esfera (haversine). */
export function distanceKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Punto más cercano si está a menos de maxKm; si no, null (se usa el punto por defecto del paquete). */
export function nearestPoint(points: readonly ClimatePoint[], loc: LatLon, maxKm: number): { point: ClimatePoint; km: number } | null {
  let best: { point: ClimatePoint; km: number } | null = null;
  for (const p of points) {
    const km = distanceKm(loc, p);
    if (!best || km < best.km) best = { point: p, km };
  }
  return best && best.km <= maxKm ? best : null;
}

type Normals = { weekly_z?: number[][]; points?: ClimatePoint[]; default_point?: string; max_km?: number };

/** Clima a usar: el punto más cercano a la ubicación (si hay y está dentro de max_km) o el del paquete. */
export function climateFor(normals: Normals, loc: LatLon | null): { weeklyZ: number[][]; choice: ClimateChoice } | null {
  const points = normals.points ?? [];
  if (loc && points.length) {
    const near = nearestPoint(points, loc, normals.max_km ?? 150);
    if (near) return { weeklyZ: near.point.weekly_z, choice: { name: near.point.name, km: Math.round(near.km), source: 'gps' } };
  }
  if (!normals.weekly_z) return null;
  return { weeklyZ: normals.weekly_z, choice: { name: normals.default_point ?? '', km: null, source: 'paquete' } };
}

/** Pide la ubicación al teléfono (con permiso). Acepta una posición de hasta un día: en el campo el GPS tarda. */
export function requestLocation(timeoutMs = 20000): Promise<LatLon & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation_unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(`geolocation_${e.code}`)),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 24 * 3600 * 1000 },
    );
  });
}
