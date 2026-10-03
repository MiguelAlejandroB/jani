import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import type { Page, Request } from '@playwright/test';
import {
  APP_DIR,
  expect,
  fullRoute,
  goHome,
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
  const es = await fullRoute(page, ES);
  expect(es.kpis, 'los KPIs dependen del paquete activo').not.toEqual(sw.kpis);

  // Volver a noor desde Paquetes: idioma y texto de Inicio cambian sin recargar.
  await page.getByRole('button', { name: phrase(ES, 'packs') }).click();
  await page.getByTestId('pack-installed-noor-africa-oriental').click();
  await expect(page.locator('html')).toHaveAttribute('lang', SW.language.code);
  await expect(page.getByTestId('pack-installed-noor-africa-oriental')).toHaveClass(/primary/);
  await goHome(page);
  await expect(page.getByRole('heading', { name: phrase(SW, 'welcome') })).toBeVisible();
  const sw2 = await fullRoute(page, SW);
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
  await expect(page.getByTestId('pack-error')).toBeVisible();
  await page.getByTestId('pack-import-input').setInputFiles({ name: 'malo.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({ 'pack.json': strToU8('{"id":"x"}') })) });
  await expect(page.getByTestId('pack-error')).toBeVisible();
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

test.describe('i. camino real ONNX (fixture de prueba)', () => {
  // Sin SW: page.route no intercepta lo que atiende un service worker.
  test.use({ serviceWorkers: 'block' });

  test('i. inferencia real en navegador con tiny_model.onnx y ort/ local', async ({ page, baseURL }) => {
    const fixtures = join(APP_DIR, 'tests', 'fixtures');
    await page.route('**/models/arabica-v1/model_card.json', (route) =>
      route.fulfill({ contentType: 'application/json', body: readFileSync(join(fixtures, 'model_card.test.json')) }),
    );
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

    await takePhotos(page, 3, 100);
    const outcome = await page.getByTestId('dx-outcome').getAttribute('data-outcome');
    expect(['consult', 'healthy', 'continue']).toContain(outcome);
    await expect(page.getByTestId('dx-outcome')).not.toHaveText('');
    console.log(`[i] resultado del camino real: ${outcome}`);

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
