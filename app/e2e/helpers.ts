import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { test as base, expect, type Page } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = join(HERE, '..');
export const REPO_DIR = join(APP_DIR, '..');

export const PACK_IDS = ['colombia-andina', 'noor-africa-oriental', 'english-demo'] as const;
export type PackId = (typeof PACK_IDS)[number];
export type PackJson = { id: string; language: { code: string; name: string }; phrases: Record<string, string> };

/** Lee el pack.json real del repo: los textos esperados nunca se escriben en las pruebas. */
export function readPack(id: PackId): PackJson {
  return JSON.parse(readFileSync(join(REPO_DIR, 'packs', id, 'pack.json'), 'utf8')) as PackJson;
}

export function phrase(p: PackJson, key: string): string {
  const v = p.phrases[key];
  if (!v) throw new Error(`frase ${key} ausente en ${p.id}`);
  return v;
}

/** Cada prueba falla si la página lanzó algún error no capturado. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
      await use(errors);
      expect(errors, 'errores no capturados en la página').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

// ---------- Fotos de prueba (PNG con ruido, pasan assessQuality) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Píxeles RGB (sin filtro) del ruido determinista de la semilla dada. */
export function noisePixels(seed: number, size = 224): Uint8Array {
  let s = (seed * 2654435761) >>> 0 || 1;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
  const px = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    const v = 60 + Math.floor(rand() * 140);
    px[i * 3] = Math.max(0, v - 20);
    px[i * 3 + 1] = Math.min(255, v + 20);
    px[i * 3 + 2] = Math.max(0, v - 30);
  }
  return px;
}

/** Media por canal (R, G, B) en 0..255 de la foto de ruido de la semilla dada. */
export function noiseChannelMeans(seed: number, size = 224): [number, number, number] {
  const px = noisePixels(seed, size);
  const sum = [0, 0, 0];
  for (let i = 0; i < px.length; i++) sum[i % 3] = (sum[i % 3] ?? 0) + (px[i] ?? 0);
  const n = size * size;
  return [(sum[0] ?? 0) / n, (sum[1] ?? 0) / n, (sum[2] ?? 0) / n];
}

/** PNG RGB 224×224 con ruido determinista (brillo medio ~130, Laplaciano con varianza muy alta). */
export function noisePng(seed: number, size = 224): Buffer {
  const px = noisePixels(seed, size);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const o = y * (size * 3 + 1);
    raw[o] = 0; // filtro "None"
    raw.set(px.subarray(y * size * 3, (y + 1) * size * 3), o + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 2; // RGB
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Navegación del recorrido ----------

export const screen = (page: Page, id: string) => page.locator(`main[data-screen="${id}"]`);

export async function setSimPlan(page: Page, plan: string[]): Promise<void> {
  await page.addInitScript((p) => localStorage.setItem('jani.sim', JSON.stringify(p)), plan);
  if (page.url().startsWith('http')) await page.evaluate((p) => localStorage.setItem('jani.sim', JSON.stringify(p)), plan);
}

export async function goHome(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('button', { name: '⌂', exact: true }).click();
  await expect(screen(page, 'inicio')).toBeVisible();
}

/** Desde Paquetes: instala del catálogo, confirma que queda activo y guarda el área inicial (2 ha). */
export async function installFromCatalog(page: Page, id: PackId): Promise<void> {
  await expect(screen(page, 'paquetes')).toBeVisible();
  await page.getByTestId(`pack-install-${id}`).click();
  await expect(page.getByTestId(`pack-installed-${id}`)).toBeVisible();
  await expect(page.getByTestId(`pack-installed-${id}`)).toHaveClass(/primary/);
  await expect(page.locator('html')).toHaveAttribute('lang', readPack(id).language.code);
}

export async function saveDefaultArea(page: Page): Promise<void> {
  await expect(page.getByTestId('area-value')).toHaveText('2');
  await page.getByTestId('area-save').click();
}

/** Inicio -> Captura y sube n fotos una a una (el input no es `multiple`). */
export async function takePhotos(page: Page, n: number, seedBase = 1): Promise<void> {
  await page.getByTestId('start-review').click();
  await expect(screen(page, 'captura')).toBeVisible();
  for (let i = 1; i <= n; i++) {
    await expect(page.getByTestId('photo-btn')).toBeEnabled();
    await page.getByTestId('photo-input').setInputFiles({ name: `hoja-${i}.png`, mimeType: 'image/png', buffer: noisePng(seedBase + i) });
    await expect(page.getByTestId('photo-count')).toHaveText(`${i} / 5`);
  }
  await page.getByTestId('photos-done').click();
  await expect(screen(page, 'diagnostico')).toBeVisible();
}

export type RouteResult = { level: string; suggestion: string; kpis: Record<string, string> };
export const KPI_IDS = ['loss', 'cost', 'breakeven', 'net'] as const;

/**
 * Recorrido completo con sim `roya` desde Inicio: fotos -> diagnóstico -> preguntas (sí, no) -> riesgo ->
 * decisión (KPIs visibles) -> elige la sugerencia -> confirmación -> Pendientes con un caso más.
 * `casesBefore`: casos que la prueba ya guardó; se espera a verlos (espera positiva, sin pausas fijas).
 */
export async function fullRoute(page: Page, pack: PackJson, casesBefore = 0): Promise<RouteResult> {
  await expect(page.getByRole('heading', { name: phrase(pack, 'welcome') })).toBeVisible();
  await page.getByRole('button', { name: phrase(pack, 'pending') }).click();
  await expect(screen(page, 'pendientes')).toBeVisible();
  await expect(page.getByTestId('case-item')).toHaveCount(casesBefore);
  await goHome(page);

  await takePhotos(page, 5);
  const dx = page.getByTestId('dx-outcome');
  await expect(dx).toHaveAttribute('data-outcome', 'continue');
  await expect(dx).toHaveText(phrase(pack, 'dx_roya'));
  await page.getByTestId('dx-next').click();

  await expect(page.getByRole('heading', { name: phrase(pack, 'ask_rain') })).toBeVisible();
  await page.getByTestId('answer-yes').click();
  await expect(page.getByRole('heading', { name: phrase(pack, 'ask_treatment') })).toBeVisible();
  await page.getByTestId('answer-no').click();

  await expect(screen(page, 'riesgo')).toBeVisible();
  const level = (await page.getByTestId('risk-level').getAttribute('data-level')) ?? '';
  expect(['LOW', 'MEDIUM', 'HIGH']).toContain(level);
  await expect(screen(page, 'riesgo').getByText(phrase(pack, `risk_${level.toLowerCase()}`))).toBeVisible();
  await page.getByTestId('risk-next').click();

  await expect(screen(page, 'decision')).toBeVisible();
  const kpis: Record<string, string> = {};
  for (const k of KPI_IDS) {
    const loc = page.getByTestId(`kpi-${k}`);
    await expect(loc).toBeVisible();
    const text = (await loc.textContent()) ?? '';
    expect(text).toMatch(/\d/);
    kpis[k] = text;
    await expect(screen(page, 'decision').getByText(phrase(pack, `kpi_${k}`), { exact: true })).toBeVisible();
  }
  const sug = page.getByTestId('decision-suggestion');
  const suggestion = (await sug.getAttribute('data-suggestion')) ?? '';
  expect(['WAIT', 'TREAT']).toContain(suggestion);
  await expect(sug).toHaveText(phrase(pack, suggestion === 'TREAT' ? 'act_cheaper' : 'wait_ok'));
  await page.getByTestId(`choice-${suggestion}`).click();

  await expect(screen(page, 'confirmacion')).toBeVisible();
  await expect(page.getByRole('heading', { name: phrase(pack, 'saved') })).toBeVisible();
  await goHome(page);
  await page.getByRole('button', { name: phrase(pack, 'pending') }).click();
  await expect(page.getByTestId('case-item')).toHaveCount(casesBefore + 1);
  await expect(page.getByTestId('case-item').filter({ hasText: phrase(pack, `opt_${suggestion.toLowerCase()}`) }).first()).toBeVisible();
  await goHome(page);
  return { level, suggestion, kpis };
}
