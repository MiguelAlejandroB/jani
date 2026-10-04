// Catálogo de acciones (datos del paquete) y reglas F1–F2 (manual §4). Puerto de jani_rd/catalog.py.
import type { Action, Disease, Profile } from './types';

export const BASELINE_IDS = ['nada', 'consultar'] as const;

export function validateCatalog(catalog: readonly unknown[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  catalog.forEach((raw, i) => {
    const a = (raw ?? {}) as Record<string, unknown>;
    for (const k of ['id', 'aplica_a', 'nivel_min', 'efecto', 'costos', 'restricciones', 'evidencia'])
      if (!(k in a)) errors.push(`[${i}].${k}`);
    const id = String(a.id);
    if (ids.has(id)) errors.push(`[${i}].id duplicado`);
    ids.add(id);
    const ef = (a.efecto ?? {}) as Record<string, unknown>;
    for (const k of ['d_a', 'kappa']) {
      const d = ef[k] as { dist?: string; a?: unknown; b?: unknown } | null | undefined;
      const ok = d && d.dist === 'beta' && [d.a, d.b].every((p) => typeof p === 'number' && p > 0);
      if (!ok) errors.push(`[${i}].efecto.${k}`);
    }
    if (typeof ef.duracion_semanas !== 'number') errors.push(`[${i}].efecto.duracion_semanas`);
    const c = (a.costos ?? {}) as Record<string, unknown>;
    for (const k of ['directo_por_ha', 'jornales_por_ha', 'cert_penalizacion', 'calidad_delta'])
      if (typeof c[k] !== 'number') errors.push(`[${i}].costos.${k}`);
    if (!['criterio_experto', 'estimado', 'piloto'].includes(String(a.evidencia))) errors.push(`[${i}].evidencia`);
  });
  for (const b of BASELINE_IDS) if (ids.has(b)) errors.push(`'${b}' es una línea base reservada`);
  return errors;
}

export type EligibilityCtx = {
  diseases: Disease[];
  maxLevel: Partial<Record<Disease, number>>;
  weeksToHarvest: number;
  profile: Profile;
  areaHa: number;
  costMoney: (a: Action) => number;
};

/** F1 (aplicabilidad) y F2 (factibilidad): [aplica, viable, razón si no es viable]. */
export function eligibility(action: Action, ctx: EligibilityCtx): [boolean, boolean, string | null] {
  const ds = action.aplica_a.filter((k) => ctx.diseases.includes(k));
  if (!ds.length) return [false, false, null];
  if (Math.max(...ds.map((k) => ctx.maxLevel[k] ?? 0)) < action.nivel_min) return [false, false, null];
  const r = action.restricciones;
  if (ctx.weeksToHarvest < Math.max(action.semanas_min_a_cosecha ?? 0, r.periodo_de_carencia_semanas ?? 0)) return [true, false, 'plazo'];
  const certs = new Set(ctx.profile.certificaciones ?? []);
  if ((r.incompatible_con_certificaciones ?? []).some((c) => certs.has(c))) return [true, false, 'certificacion'];
  const laborNeeded = action.costos.jornales_por_ha * ctx.areaHa;
  if (laborNeeded > (ctx.profile.jornales_disponibles_semana ?? Infinity)) return [true, false, 'jornales'];
  if (ctx.costMoney(action) > (ctx.profile.caja ?? 0) + (ctx.profile.credito ?? 0)) return [true, false, 'liquidez'];
  return [true, true, null];
}
