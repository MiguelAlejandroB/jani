import { get, update } from 'idb-keyval';
import type { Case } from '../engine/types';

const KEY = 'cases';

/** Inserta o reemplaza por id. `update` de idb-keyval es una transacción atómica: no pierde casos previos. */
export function saveCase(c: Case): Promise<void> {
  return update<Case[]>(KEY, (prev) => [...(prev ?? []).filter((x) => x.id !== c.id), c]);
}

/** Más reciente primero. */
export async function listCases(): Promise<Case[]> {
  const all = (await get<Case[]>(KEY)) ?? [];
  return [...all].sort((a, b) => b.date.localeCompare(a.date));
}

export function markSent(id: string): Promise<void> {
  return update<Case[]>(KEY, (prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, sent: true } : x)));
}
