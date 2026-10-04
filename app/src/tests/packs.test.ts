import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { PackError, parsePackZip } from '../packs/loader';
import andina from '../../../packs/colombia-andina/pack.json?raw';
import noor from '../../../packs/noor-africa-oriental/pack.json?raw';
import english from '../../../packs/english-demo/pack.json?raw';
import { REQUIRED_PHRASE_KEYS, validatePack } from '../packs/schema';

type Loose = { id: unknown; phrases: Record<string, unknown>; risk_rules: { points: Record<string, unknown> } };
const raws: Record<string, string> = { 'colombia-andina': andina, 'noor-africa-oriental': noor, 'english-demo': english };
const load = (id: string): Loose => JSON.parse(raws[id] ?? '') as Loose;

const zipOf = (files: Record<string, Uint8Array>): Uint8Array => zipSync(files);

function packError(fn: () => unknown): PackError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PackError);
    return e as PackError;
  }
  throw new Error('no lanzó');
}

describe('validatePack', () => {
  it.each(['colombia-andina', 'noor-africa-oriental', 'english-demo'])('acepta %s', (id) => {
    const r = validatePack(load(id));
    expect(r.ok).toBe(true);
  });

  it('exige 38 claves de frases', () => {
    expect(REQUIRED_PHRASE_KEYS).toHaveLength(38);
    expect(REQUIRED_PHRASE_KEYS[0]).toBe('welcome');
  });

  it('nombra phrases.welcome si falta', () => {
    const p = load('colombia-andina');
    delete p.phrases.welcome;
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain('phrases.welcome');
  });

  it('nombra risk_rules.points.rainy_month si falta', () => {
    const p = load('colombia-andina');
    delete p.risk_rules.points.rainy_month;
    const r = validatePack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('|')).toContain('risk_rules.points.rainy_month');
  });

  it('rechaza id con barra y no-objetos', () => {
    const p = load('colombia-andina');
    p.id = 'a/b';
    expect(validatePack(p).ok).toBe(false);
    expect(validatePack(null).ok).toBe(false);
    expect(validatePack('x').ok).toBe(false);
  });
});

describe('parsePackZip', () => {
  const pack = load('colombia-andina');

  it('bytes aleatorios -> corrupt_zip', () => {
    const bytes = Uint8Array.from({ length: 64 }, (_, i) => (i * 37 + 11) % 256);
    expect(packError(() => parsePackZip(bytes)).code).toBe('corrupt_zip');
  });

  it('sin pack.json -> missing_pack_json', () => {
    const z = zipOf({ 'otro.txt': strToU8('hola') });
    expect(packError(() => parsePackZip(z)).code).toBe('missing_pack_json');
  });

  it('JSON roto -> invalid_json', () => {
    const z = zipOf({ 'pack.json': strToU8('{ no es json') });
    expect(packError(() => parsePackZip(z)).code).toBe('invalid_json');
  });

  it('paquete inválido -> invalid_pack con errores', () => {
    const bad = { ...pack, phrases: {} };
    const e = packError(() => parsePackZip(zipOf({ 'pack.json': strToU8(JSON.stringify(bad)) })));
    expect(e.code).toBe('invalid_pack');
    expect(e.errors).toContain('phrases.welcome');
  });

  it('solo toma audios cuyo nombre es una clave de frase', () => {
    const z = zipOf({
      'pack.json': strToU8(JSON.stringify(pack)),
      'audio/welcome.mp3': new Uint8Array([1, 2, 3]),
      'audio/otra.mp3': new Uint8Array([4]),
    });
    const r = parsePackZip(z);
    expect(r.pack.id).toBe('colombia-andina');
    expect(Object.keys(r.audio)).toEqual(['welcome']);
    expect(r.audio['welcome']?.type).toBe('audio/mpeg');
    expect(r.audio['welcome']?.size).toBe(3);
  });
});
