import { CLASS_IDS } from './types';
import type { ClassId, SeeResult, Session } from './types';

/** Umbral de la spec (§4.4): más de la mitad dudosas -> consultar. */
const UNSURE_CONSULT_SHARE = 0.5;

export function buildSession(results: SeeResult[]): Session {
  const counts = new Map<ClassId, number>();
  let ok = 0;
  let affected = 0;
  let unsure = 0;
  for (const r of results) {
    if (r.status === 'unsure') {
      unsure++;
      continue;
    }
    ok++;
    if (r.classId !== 'sana') {
      affected++;
      counts.set(r.classId, (counts.get(r.classId) ?? 0) + 1);
    }
  }
  let dominant: ClassId | null = null;
  let best = 0;
  for (const id of CLASS_IDS) {
    const n = counts.get(id) ?? 0;
    if (n > best) {
      best = n;
      dominant = id;
    }
  }
  return {
    results,
    dominant,
    affectedShare: ok === 0 ? 0 : affected / ok,
    unsureShare: results.length === 0 ? 0 : unsure / results.length,
  };
}

export function sessionOutcome(s: Session): 'consult' | 'healthy' | 'continue' {
  if (s.unsureShare > UNSURE_CONSULT_SHARE) return 'consult';
  const oks = s.results.filter((r): r is Extract<SeeResult, { status: 'ok' }> => r.status === 'ok');
  if (oks.length === 0) return 'consult';
  if (oks.every((r) => r.classId === 'sana')) return 'healthy';
  return 'continue';
}
