import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import type { Page, Request } from '@playwright/test';
import {
  APP_DIR,
  expect,
  fullRoute,
  goHome,
  noiseChannelMeans,
  noisePng,
  installFromCatalog,
  phrase,
  readPack,
  REPO_DIR,
  saveDefaultArea,
  screen,
  setSimPlan,
  takePhotos,
  test,
} from './helpers';

const ES = readPack('colombia-andina');
const SW = readPack('noor-africa-oriental');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('a. recorrido completo con colombia-andina instalado desde el catálogo', async ({ page }) => {
  await setSimPlan(page, ['roya']);
  await installFromCatalog(page, 'colombia-andina');
  await saveDefaultArea(page);
  await goHome(page);
  await fullRoute(page, ES);
});

test('b. noor-africa-oriental y cambio en caliente del paquete activo', async ({ page }) => {
  await setSimPlan(page, ['roya']);
  await installFromCatalog(page, 'noor-africa-oriental');
  await saveDefaultArea(page);
  await goHome(page);
  const sw = await fullRoute(page, SW);

  // Instalar también colombia-andina: queda activo al instalarse.
  await page.getByRole('button', { name: phrase(SW, 'packs') }).click();
  await installFromCatalog(page, 'colombia-andina');
  await expect(page.getByTestId('pack-installed-noor-africa-oriental')).toBeVisible();
  await goHome(page);
  await expect(page.getByRole('heading', { name: phrase(ES, 'welcome') })).toBeVisible();
  const es = await fullRoute(page, ES, 1);
  expect(es.kpis, 'los KPIs dependen del paquete activo').not.toEqual(sw.kpis);

  // Volver a noor desde Paquetes: idioma y texto de Inicio cambian sin recargar.
  await page.getByRole('button', { name: phrase(ES, 'packs') }).click();
  await page.getByTestId('pack-installed-noor-africa-oriental').click();
  await expect(page.locator('html')).toHaveAttribute('lang', SW.language.code);
  await expect(page.getByTestId('pack-installed-noor-africa-oriental')).toHaveClass(/primary/);
  await goHome(page);
  await expect(page.getByRole('heading', { name: phrase(SW, 'welcome') })).toBeVisible();
  const sw2 = await fullRoute(page, SW, 2);
  expect(sw2.kpis).toEqual(sw.kpis);

  // Y de nuevo a colombia-andina.
  await page.getByRole('button', { name: phrase(SW, 'packs') }).click();
  await page.getByTestId('pack-installed-colombia-andina').click();
  await expect(page.locator('html')).toHaveAttribute('lang', ES.language.code);
  await goHome(page);
  await expect(page.getByRole('heading', { name: phrase(ES, 'welcome') })).toBeVisible();
});

test('c. "no estoy segura": más de la mitad dudosas sugiere CONSULT', async ({ page }) => {
  await setSimPlan(page, ['low_confidence', 'low_confidence', 'low_confidence', 'roya', 'roya']);
  await installFromCatalog(page, 'colombia-andina');
  await goHome(page);
  await takePhotos(page, 5);
  const dx = page.getByTestId('dx-outcome');
  await expect(dx).toHaveAttribute('data-outcome', 'consult');
  await expect(dx).toHaveText(phrase(ES, 'unsure'));
  await page.getByTestId('dx-next').click();
  await expect(screen(page, 'decision')).toBeVisible();
  const sug = page.getByTestId('decision-suggestion');
  await expect(sug).toHaveAttribute('data-suggestion', 'CONSULT');
  await expect(sug).toHaveText(phrase(ES, 'consult'));
  await expect(page.locator('[data-testid^="kpi-"]')).toHaveCount(0);
  await expect(page.getByTestId('choice-CONSULT')).toHaveAttribute('data-suggested', 'true');
  await page.getByTestId('choice-CONSULT').click();
  await expect(screen(page, 'confirmacion')).toBeVisible();
  // Elegir CONSULT habilita el envío del caso (solo texto).
  await expect(page.getByTestId('send-case')).toBeVisible();
});

test('d. todas sanas: frase all_healthy, sin riesgo ni KPIs', async ({ page }) => {
  await setSimPlan(page, ['sana']);
  await installFromCatalog(page, 'colombia-andina');
  await goHome(page);
  await takePhotos(page, 5);
  const dx = page.getByTestId('dx-outcome');
  await expect(dx).toHaveAttribute('data-outcome', 'healthy');
  await expect(dx).toHaveText(phrase(ES, 'all_healthy'));
  await expect(page.getByTestId('risk-level')).toHaveCount(0);
  await expect(page.locator('[data-testid^="kpi-"]')).toHaveCount(0);
  await page.getByTestId('dx-next').click();
  await expect(screen(page, 'confirmacion')).toBeVisible();
  await expect(page.getByTestId('risk-level')).toHaveCount(0);
  await expect(page.locator('[data-testid^="kpi-"]')).toHaveCount(0);
  await goHome(page);
  await page.getByRole('button', { name: phrase(ES, 'pending') }).click();
  await expect(page.getByTestId('case-item')).toHaveCount(1);
  await expect(page.getByTestId('case-item')).toContainText(phrase(ES, 'all_healthy'));
});

test('e. etiqueta de datos de demostración en Decisión', async ({ page }) => {
  await setSimPlan(page, ['roya']);
  await installFromCatalog(page, 'colombia-andina');
  await goHome(page);
  await takePhotos(page, 5);
  await page.getByTestId('dx-next').click();
  await page.getByTestId('answer-yes').click();
  await expect(page.getByRole('heading', { name: phrase(ES, 'ask_treatment') })).toBeVisible();
  await page.getByTestId('answer-no').click();
  await page.getByTestId('risk-next').click();
  await expect(screen(page, 'decision')).toBeVisible();
  const badge = screen(page, 'decision').getByTestId('demo-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(phrase(ES, 'demo_data'));
});

test('f. importar .zip desde archivo (válido y corrupto)', async ({ page }) => {
  await expect(screen(page, 'paquetes')).toBeVisible();
  // Corrupto primero, sin ningún paquete instalado: error visible y la app sigue en pie.
  await page.getByTestId('pack-import-input').setInputFiles({ name: 'roto.zip', mimeType: 'application/zip', buffer: Buffer.from('esto no es un zip PK\u0003\u0004 basura') });
  await expect(page.getByTestId('pack-error')).toBeVisible();
  await expect(screen(page, 'paquetes')).toBeVisible();

  // Válido: el zip construido por `npm run packs`.
  await page.getByTestId('pack-import-input').setInputFiles(join(APP_DIR, 'public', 'packs', 'colombia-andina.zip'));
  await expect(page.getByTestId('pack-installed-colombia-andina')).toBeVisible();
  await expect(page.getByTestId('pack-installed-colombia-andina')).toHaveClass(/primary/);
  await expect(page.getByTestId('pack-error')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', ES.language.code);

  // Zip sin pack.json y zip con pack.json inválido: error, el paquete activo no cambia.
  await page.getByTestId('pack-import-input').setInputFiles({ name: 'vacio.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({ 'otro.txt': strToU8('x') })) });
  await expect(page.getByTestId('pack-error')).toContainText('missing_pack_json');
  await page.getByTestId('pack-import-input').setInputFiles({ name: 'malo.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({ 'pack.json': strToU8('{"id":"x"}') })) });
  // El contenido del error cambia: depende de malo.zip, no del error anterior.
  await expect(page.getByTestId('pack-error')).not.toContainText('missing_pack_json');
  await expect(page.getByTestId('pack-error')).toContainText('language.code');
  await expect(page.getByTestId('pack-installed-colombia-andina')).toHaveClass(/primary/);
  await goHome(page);
  await expect(page.getByRole('heading', { name: phrase(ES, 'welcome') })).toBeVisible();
});

test('g. sin audio: el recorrido no falla y las frases se ven', async ({ page }) => {
  // Paquete sin ningún mp3 (solo pack.json), sin depender de qué audios tenga el repo.
  const raw = readFileSync(join(REPO_DIR, 'packs', 'colombia-andina', 'pack.json'));
  const zip = Buffer.from(zipSync({ 'pack.json': new Uint8Array(raw) }));
  await setSimPlan(page, ['roya']);
  await page.getByTestId('pack-import-input').setInputFiles({ name: 'sin-audio.zip', mimeType: 'application/zip', buffer: zip });
  await expect(page.getByTestId('pack-installed-colombia-andina')).toBeVisible();
  await goHome(page);
  await page.getByTestId('repeat-audio').click();
  await fullRoute(page, ES);
  // Repetir audio en pantallas con frases: no debe lanzar.
  await takePhotos(page, 2, 50);
  await page.getByTestId('repeat-audio').click();
  await expect(page.getByTestId('dx-outcome')).toHaveText(phrase(ES, 'dx_roya'));
});

async function waitForServiceWorker(page: Page): Promise<void> {
  // El SW se registra en la primera carga; con clientsClaim pasa a controlar la página (si no, recargar).
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const controlled = () => page.evaluate(() => navigator.serviceWorker.controller !== null);
  if (!(await controlled())) {
    await page.reload();
    await expect.poll(controlled, { timeout: 30_000 }).toBe(true);
  }
  // Precarga terminada: el SW solo se activa tras precargar, y la caché ya tiene lo que usa el recorrido.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const urls: string[] = [];
          for (const name of await caches.keys()) {
            const c = await caches.open(name);
            for (const r of await c.keys()) urls.push(new URL(r.url).pathname);
          }
          const need = ['/index.html', '/packs/catalog.json', '/packs/colombia-andina.zip', '/models/arabica-v1/model_card.json', '/ort/ort-wasm-simd-threaded.wasm', '/ort/ort-wasm-simd-threaded.mjs'];
          return need.filter((n) => !urls.includes(n));
        }),
      { timeout: 60_000, message: 'recursos aún no precargados' },
    )
    .toEqual([]);
}

test('h. OFFLINE: recorrido completo en modo avión sin ninguna petición de red', async ({ page, context, baseURL }) => {
  test.setTimeout(150_000);
  await setSimPlan(page, ['roya']);
  await waitForServiceWorker(page);

  const origin = new URL(baseURL ?? '').origin;
  const requests: Request[] = [];
  const failed: string[] = [];
  context.on('request', (r) => requests.push(r));
  context.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));

  await context.setOffline(true);
  await page.reload();
  await expect(screen(page, 'paquetes')).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  await installFromCatalog(page, 'colombia-andina');
  await saveDefaultArea(page);
  await goHome(page);
  await fullRoute(page, ES);

  const offOrigin = requests
    .map((r) => r.url())
    .filter((u) => !u.startsWith('data:'))
    .filter((u) => new URL(u).origin !== origin);
  const notFromSw = [];
  for (const r of requests) {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) continue;
    const res = await r.response();
    if (!res || !res.fromServiceWorker()) notFromSw.push(u);
  }
  console.log(
    `[h] peticiones registradas: ${requests.length}; fuera de origen: ${offOrigin.length}; fallidas: ${failed.length}; no servidas por SW: ${notFromSw.length}`,
  );
  console.log(`[h] urls: ${[...new Set(requests.map((r) => r.url().replace(origin, '').replace(/^blob:.*/, 'blob:')))].join(', ')}`);
  expect(failed, 'peticiones fallidas offline').toEqual([]);
  expect(offOrigin, 'peticiones a otro origen').toEqual([]);
  expect(notFromSw, 'peticiones no servidas por el service worker').toEqual([]);
  expect(requests.some((r) => r.url().endsWith('/packs/colombia-andina.zip'))).toBe(true);
});

type TestCard = {
  classes: string[];
  input: { mean: number[]; std: number[] };
  temperature: number;
  unsure_rule: { min_confidence: number; min_margin: number };
};

// Pesos de app/tests/fixtures/make_tiny_model.py: logits = W · media_por_canal(entrada normalizada) + B.
const TINY_W = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 1],
  [-1, 0, 1],
];
const TINY_B = [0, 0.5, -0.5, 0.25, 0];

/** Clase argmax del modelo diminuto para una imagen con esas medias por canal (0..255). */
function expectedTinyClass(means: [number, number, number], card: TestCard): string {
  // La normalización es lineal: la media de la entrada normalizada es la normalización de la media.
  const x = means.map((m, c) => (m / 255 - (card.input.mean[c] ?? 0)) / (card.input.std[c] ?? 1));
  const logits = TINY_W.map((w, k) => w.reduce((acc, wi, c) => acc + wi * (x[c] ?? 0), TINY_B[k] ?? 0));
  const order = logits.map((l, k) => [l, k] as const).sort((a, b) => b[0] - a[0]);
  const [first, second] = order;
  if (!first || !second) throw new Error('logits vacíos');
  // Margen holgado para que el redondeo del canvas no cambie la clase.
  expect(first[0] - second[0], `margen entre logits ${logits.join(', ')}`).toBeGreaterThan(0.1);
  const cls = card.classes[first[1]];
  if (!cls) throw new Error('clase fuera de rango');
  return cls;
}

test.describe('i. camino real ONNX (fixture de prueba)', () => {
  // Sin SW: page.route no intercepta lo que atiende un service worker.
  test.use({ serviceWorkers: 'block' });

  test('i. inferencia real en navegador con tiny_model.onnx y ort/ local', async ({ page, baseURL }) => {
    const fixtures = join(APP_DIR, 'tests', 'fixtures');
    // Variante de la ficha de prueba sin regla de duda: el camino real debe devolver `ok` con la clase argmax.
    const card = JSON.parse(readFileSync(join(fixtures, 'model_card.test.json'), 'utf8')) as TestCard;
    card.unsure_rule = { min_confidence: 0, min_margin: 0 };
    await page.route('**/models/arabica-v1/model_card.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(card) }));
    await page.route('**/models/arabica-v1/tiny_model.onnx', (route) =>
      route.fulfill({ contentType: 'application/octet-stream', body: readFileSync(join(fixtures, 'tiny_model.onnx')) }),
    );
    const origin = new URL(baseURL ?? '').origin;
    const urls: string[] = [];
    const failed: string[] = [];
    const consoleErrors: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    // Si por error se usara el modo simulado, daría `sana` (healthy) y no la clase esperada del modelo real.
    await setSimPlan(page, ['sana']);
    await page.reload();
    await installFromCatalog(page, 'colombia-andina');
    await goHome(page);
    // La ficha cargada es la del fixture.
    await page.getByRole('button', { name: 'ℹ️', exact: true }).click();
    await expect(page.getByTestId('about-model')).toContainText('tiny-test-fixture');
    await goHome(page);

    await page.getByTestId('start-review').click();
    await expect(screen(page, 'captura')).toBeVisible();
    // Modo real: cinco toques en el ícono no abren el menú simulado.
    for (let i = 0; i < 5; i++) await page.getByTestId('screen-icon').click();
    await expect(page.getByTestId('sim-menu')).toHaveCount(0);
    await goHome(page);

    // Resultado esperado calculado en node con los pesos conocidos del modelo y las medias de cada foto.
    const SEED_BASE = 100;
    const N = 3;
    const expected = [];
    for (let i = 1; i <= N; i++) expected.push(expectedTinyClass(noiseChannelMeans(SEED_BASE + i), card));
    const affected = expected.filter((c) => c !== 'sana');
    const counts = new Map<string, number>();
    for (const c of affected) counts.set(c, (counts.get(c) ?? 0) + 1);
    const dominant = card.classes.filter((c) => c !== 'sana').reduce<string | null>((best, c) => ((counts.get(c) ?? 0) > (best ? (counts.get(best) ?? 0) : 0) ? c : best), null);
    const expectedOutcome = dominant === null ? 'healthy' : 'continue';
    const expectedText = phrase(ES, dominant === null ? 'all_healthy' : `dx_${dominant}`);
    console.log(`[i] clases esperadas por foto: ${expected.join(', ')} -> ${expectedOutcome} (${dominant ?? 'sana'})`);

    await takePhotos(page, N, SEED_BASE);
    await expect(page.getByTestId('dx-outcome')).toHaveAttribute('data-outcome', expectedOutcome);
    await expect(page.getByTestId('dx-outcome')).toHaveText(expectedText);
    // Ninguna foto quedó como dudosa (❓): todas pasaron por la inferencia real con resultado `ok`.
    await expect(screen(page, 'diagnostico').locator('.thumb-badge')).toHaveCount(N);
    await expect(screen(page, 'diagnostico').locator('.thumb-badge', { hasText: '❓' })).toHaveCount(0);

    const ortUrls = urls.filter((u) => /\/ort\/ort-wasm[^/]*\.(wasm|mjs)$/.test(u));
    console.log(`[i] ort cargado desde: ${ortUrls.map((u) => u.replace(origin, '')).join(', ')}`);
    expect(ortUrls.some((u) => u === `${origin}/ort/ort-wasm-simd-threaded.wasm`), `ort wasm desde el origen: ${ortUrls.join(', ')}`).toBe(true);
    expect(ortUrls.every((u) => u.startsWith(`${origin}/ort/`))).toBe(true);
    expect(urls.some((u) => u.endsWith('/models/arabica-v1/tiny_model.onnx'))).toBe(true);
    expect(urls.filter((u) => !u.startsWith('data:') && new URL(u).origin !== origin)).toEqual([]);
    expect(failed).toEqual([]);
    expect(consoleErrors.filter((e) => e.includes('not_implemented'))).toEqual([]);
  });
});

test.describe('j. ficha del modelo inválida o inferencia que falla', () => {
  // Sin SW: page.route no intercepta lo que atiende un service worker.
  test.use({ serviceWorkers: 'block' });
  const CARD_RAW = readFileSync(join(APP_DIR, 'public', 'models', 'arabica-v1', 'model_card.json'), 'utf8');

  test('j1. ficha con NaN en temperature: ⚠️ + reintento; al reintentar con NaN solo en métricas, la cámara se habilita', async ({ page }) => {
    let body = CARD_RAW.replace(/"temperature":\s*[0-9.]+/, '"temperature": NaN');
    expect(body).not.toBe(CARD_RAW);
    await page.route('**/models/arabica-v1/model_card.json', (route) => route.fulfill({ contentType: 'application/json', body }));
    await setSimPlan(page, ['roya']);
    await page.reload();
    await installFromCatalog(page, 'colombia-andina');
    await goHome(page);
    await page.getByTestId('start-review').click();
    const err = page.getByTestId('card-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('⚠️');
    await expect(err).toContainText(phrase(ES, 'unsure'));
    await expect(page.getByTestId('photo-btn')).toBeDisabled();

    // json.dump de Python puede escribir NaN en métricas: se tolera.
    body = CARD_RAW.replace(/"metrics":\s*\{\}/, '"metrics": {"f1": NaN, "loss": Infinity}');
    expect(body).not.toBe(CARD_RAW);
    await page.getByTestId('card-retry').click();
    await expect(page.getByTestId('card-error')).toHaveCount(0);
    await expect(page.getByTestId('photo-btn')).toBeEnabled();
    await page.getByTestId('photo-input').setInputFiles({ name: 'hoja.png', mimeType: 'image/png', buffer: noisePng(1) });
    await expect(page.getByTestId('photo-count')).toHaveText('1 / 5');
  });

  test('j2. si la inferencia falla, la foto cuenta como dudosa (sin pedir repetirla) y la sesión va a CONSULT', async ({ page }) => {
    const card = JSON.parse(CARD_RAW) as Record<string, unknown>;
    card.recommended_file = 'roto.onnx';
    await page.route('**/models/arabica-v1/model_card.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(card) }));
    await page.route('**/models/arabica-v1/roto.onnx', (route) => route.fulfill({ contentType: 'application/octet-stream', body: Buffer.from('esto no es un modelo') }));
    await page.reload();
    await installFromCatalog(page, 'colombia-andina');
    await goHome(page);
    await page.getByTestId('start-review').click();
    await expect(page.getByTestId('photo-btn')).toBeEnabled();
    await page.getByTestId('photo-input').setInputFiles({ name: 'hoja.png', mimeType: 'image/png', buffer: noisePng(1) });
    await expect(page.getByTestId('photo-count')).toHaveText('1 / 5');
    await expect(page.getByTestId('infer-error')).toBeVisible();
    await expect(page.getByText(phrase(ES, 'retake'))).toHaveCount(0);
    await page.getByTestId('photos-done').click();
    await expect(page.getByTestId('dx-outcome')).toHaveAttribute('data-outcome', 'consult');
    await expect(screen(page, 'diagnostico').locator('.thumb-badge', { hasText: '❓' })).toHaveCount(1);
  });
});

test.describe('k. IndexedDB que falla', () => {
  test('k1. IndexedDB no abre: la app no queda en blanco, muestra Paquetes y el error al instalar', async ({ page }) => {
    await page.addInitScript(() => {
      IDBFactory.prototype.open = function () {
        const req = {} as { error?: DOMException; onerror?: () => void };
        setTimeout(() => {
          req.error = new DOMException('bloqueado', 'UnknownError');
          req.onerror?.();
        });
        return req as unknown as IDBOpenDBRequest;
      };
    });
    await page.reload();
    await expect(screen(page, 'paquetes')).toBeVisible();
    await expect(page.getByTestId('pack-install-colombia-andina')).toBeVisible();
    await page.getByTestId('pack-install-colombia-andina').click();
    await expect(page.getByTestId('pack-error')).toBeVisible();
    await expect(screen(page, 'paquetes')).toBeVisible();
  });

  test('k2. si guardar el caso falla: ⚠️, la elección no se pierde y se puede reintentar', async ({ page }) => {
    // Las transacciones fallan mientras window.__idbFail sea verdadero.
    await page.addInitScript(() => {
      const orig = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
        if ((window as unknown as { __idbFail?: boolean }).__idbFail) throw new DOMException('lleno', 'QuotaExceededError');
        return orig.apply(this, args);
      };
    });
    await setSimPlan(page, ['roya']);
    await page.reload();
    await installFromCatalog(page, 'colombia-andina');
    await saveDefaultArea(page);
    await goHome(page);
    await takePhotos(page, 5);
    await page.getByTestId('dx-next').click();
    await page.getByTestId('answer-yes').click();
    await expect(page.getByRole('heading', { name: phrase(ES, 'ask_treatment') })).toBeVisible();
    await page.getByTestId('answer-no').click();
    await page.getByTestId('risk-next').click();
    await expect(screen(page, 'decision')).toBeVisible();

    await page.evaluate(() => ((window as unknown as { __idbFail?: boolean }).__idbFail = true));
    await page.getByTestId('choice-CONSULT').click();
    await expect(page.getByTestId('save-error')).toBeVisible();
    await expect(screen(page, 'decision')).toBeVisible();

    await page.evaluate(() => ((window as unknown as { __idbFail?: boolean }).__idbFail = false));
    await page.getByTestId('choice-CONSULT').click();
    await expect(screen(page, 'confirmacion')).toBeVisible();
    await goHome(page);
    await page.getByRole('button', { name: phrase(ES, 'pending') }).click();
    await expect(page.getByTestId('case-item')).toHaveCount(1);
    await expect(page.getByTestId('case-item')).toContainText(phrase(ES, 'opt_consult'));
  });

  test('k3. si guardar un caso sano falla: ⚠️ en Diagnóstico y reintento', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
        if ((window as unknown as { __idbFail?: boolean }).__idbFail) throw new DOMException('lleno', 'QuotaExceededError');
        return orig.apply(this, args);
      };
    });
    await setSimPlan(page, ['sana']);
    await page.reload();
    await installFromCatalog(page, 'colombia-andina');
    await goHome(page);
    await takePhotos(page, 2);
    await page.evaluate(() => ((window as unknown as { __idbFail?: boolean }).__idbFail = true));
    await page.getByTestId('dx-next').click();
    await expect(page.getByTestId('save-error')).toBeVisible();
    await expect(screen(page, 'diagnostico')).toBeVisible();
    await page.evaluate(() => ((window as unknown as { __idbFail?: boolean }).__idbFail = false));
    await page.getByTestId('dx-next').click();
    await expect(screen(page, 'confirmacion')).toBeVisible();
  });
});
