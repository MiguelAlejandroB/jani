import andina from '../../../packs/colombia-andina/pack.json?raw';
import noor from '../../../packs/noor-africa-oriental/pack.json?raw';
import type { Pack } from '../packs/schema';

const raws: Record<string, string> = { 'colombia-andina': andina, 'noor-africa-oriental': noor };

/** Carga una copia nueva del paquete (se puede mutar sin afectar a otras pruebas). */
export function loadPack(id: 'colombia-andina' | 'noor-africa-oriental'): Pack {
  return JSON.parse(raws[id] ?? '') as Pack;
}

/** Escribe `value` en una ruta de puntos de un objeto (crea o sobrescribe la hoja). */
export function setPath(root: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = root as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) node = node[p] as Record<string, unknown>;
  node[parts[parts.length - 1] ?? ''] = value;
}

export function deletePath(root: unknown, path: string): void {
  const parts = path.split('.');
  let node = root as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) node = node[p] as Record<string, unknown>;
  delete node[parts[parts.length - 1] ?? ''];
}
