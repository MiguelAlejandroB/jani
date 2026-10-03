import { strFromU8, unzipSync } from 'fflate';
import { del, get, set } from 'idb-keyval';
import { REQUIRED_PHRASE_KEYS, validatePack, type Pack } from './schema';

export type PackErrorCode = 'corrupt_zip' | 'missing_pack_json' | 'invalid_json' | 'invalid_pack';

export class PackError extends Error {
  readonly code: PackErrorCode;
  readonly errors: string[];
  constructor(code: PackErrorCode, errors: string[] = []) {
    super(errors.length ? `${code}: ${errors.join(', ')}` : code);
    this.name = 'PackError';
    this.code = code;
    this.errors = errors;
  }
}

export type CatalogEntry = {
  id: string;
  version: string;
  language: { code: string; name: string };
  file: string;
  size: number;
};

const INSTALLED_KEY = 'packs:installed';
const packKey = (id: string) => `pack:${id}`;
const audioKey = (id: string, key: string) => `audio:${id}:${key}`;

export function parsePackZip(bytes: Uint8Array): { pack: Pack; audio: Record<string, Blob> } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (e) {
    throw new PackError('corrupt_zip', [e instanceof Error ? e.message : String(e)]);
  }
  const raw = files['pack.json'];
  if (!raw) throw new PackError('missing_pack_json');
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(raw));
  } catch (e) {
    throw new PackError('invalid_json', [e instanceof Error ? e.message : String(e)]);
  }
  const v = validatePack(json);
  if (!v.ok) throw new PackError('invalid_pack', v.errors);

  const audio: Record<string, Blob> = {};
  for (const [name, data] of Object.entries(files)) {
    const m = /^audio\/([^/]+)\.mp3$/.exec(name);
    const key = m?.[1];
    if (key && Object.hasOwn(v.pack.phrases, key)) {
      audio[key] = new Blob([data.slice()], { type: 'audio/mpeg' });
    }
  }
  return { pack: v.pack, audio };
}

async function installedIds(): Promise<string[]> {
  return (await get<string[]>(INSTALLED_KEY)) ?? [];
}

export async function installPackFromZip(bytes: Uint8Array): Promise<Pack> {
  const { pack, audio } = parsePackZip(bytes);
  // Reinstalar reemplaza: borrar audios viejos de este id.
  const keys = new Set([...REQUIRED_PHRASE_KEYS, ...Object.keys(pack.phrases)]);
  for (const k of keys) await del(audioKey(pack.id, k));
  await set(packKey(pack.id), pack);
  for (const [k, blob] of Object.entries(audio)) await set(audioKey(pack.id, k), blob);
  const ids = await installedIds();
  if (!ids.includes(pack.id)) await set(INSTALLED_KEY, [...ids, pack.id]);
  return pack;
}

export async function getPack(id: string): Promise<Pack | undefined> {
  return get<Pack>(packKey(id));
}

export async function listInstalledPacks(): Promise<Pack[]> {
  const out: Pack[] = [];
  for (const id of await installedIds()) {
    const p = await getPack(id);
    if (p) out.push(p);
  }
  return out;
}

export async function getPackAudio(packId: string, key: string): Promise<Blob | undefined> {
  return get<Blob>(audioKey(packId, key));
}

export async function fetchCatalog(baseUrl = './packs/'): Promise<CatalogEntry[]> {
  const res = await fetch(`${baseUrl}catalog.json`);
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return (await res.json()) as CatalogEntry[];
}

export async function installPackFromCatalog(entry: CatalogEntry, baseUrl = './packs/'): Promise<Pack> {
  const res = await fetch(`${baseUrl}${entry.file}`);
  if (!res.ok) throw new Error(`zip ${res.status}`);
  return installPackFromZip(new Uint8Array(await res.arrayBuffer()));
}
