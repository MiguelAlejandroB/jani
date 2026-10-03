import type { Pack } from '../packs/schema';

export type Resolved = { found: true; value: unknown; usedDemo: boolean } | { found: false };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function child(node: unknown, key: string): unknown {
  if (Array.isArray(node)) return /^\d+$/.test(key) ? (node as unknown[])[Number(key)] : undefined;
  if (isObj(node)) return Object.prototype.hasOwnProperty.call(node, key) ? node[key] : undefined;
  return undefined;
}

const validSource = (s: unknown): boolean => typeof s === 'string' && s.length > 0 && !s.startsWith('TODO');

/** Ausente: null/undefined, arreglo con null, u objeto con alguna propiedad en null. */
function isAbsent(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return (v as unknown[]).some((x) => x === null || x === undefined);
  if (isObj(v)) return Object.values(v).some((x) => x === null);
  return false;
}

function real(pack: Pack, parts: string[]): Resolved {
  let node: unknown = pack;
  let source: unknown = undefined;
  let hasSource = false;
  for (const key of parts) {
    node = child(node, key);
    if (node === undefined) return { found: false };
    if (isObj(node) && 'source' in node) {
      hasSource = true;
      source = node.source;
    }
  }
  const value = isObj(node) && 'value' in node ? node.value : node;
  if (isAbsent(value)) return { found: false };
  if (hasSource && !validSource(source)) return { found: false };
  return { found: true, value, usedDemo: false };
}

function demo(pack: Pack, parts: string[]): Resolved {
  let node: unknown = pack.demo_values;
  for (const key of parts) {
    node = child(node, key);
    if (node === undefined) return { found: false };
  }
  if (isAbsent(node)) return { found: false };
  return { found: true, value: node, usedDemo: true };
}

/** Valor real con fuente -> valor de demostración -> ausente. Nunca inventa valores. */
export function resolve(pack: Pack, path: string): Resolved {
  const parts = path.split('.');
  const r = real(pack, parts);
  return r.found ? r : demo(pack, parts);
}
