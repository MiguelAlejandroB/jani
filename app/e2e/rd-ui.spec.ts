import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { APP_DIR, expect, goHome, installFromCatalog, phrase, readPack, saveDefaultArea, screen, setSimPlan, takePhotos, test } from './helpers';

const ES = readPack('colombia-andina');
const SHOTS = join(APP_DIR, 'e2e', 'screens');
mkdirSync(SHOTS, { recursive: true });

// Sin SW: page.route no intercepta lo que atiende un service worker (la ficha saldría de la precarga).
test.use({ serviceWorkers: 'block', viewport: { width: 360, height: 780 } });

async function shot(page: Page, name: string): Promise<void> {
  // Sin scroll horizontal a 360 px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `scroll horizontal en ${name}`).toBeLessThanOrEqual(0);
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

test('q. riesgo y decisión del manual a 360 px (modo simulado)', async ({ page }) => {
  const card = JSON.parse(readFileSync(join(APP_DIR, 'public', 'models', 'arabica-v1', 'model_card.json'), 'utf8')) as Record<string, unknown>;
  card.recommended_file = null; // modo simulado: `see` usa el plan de jani.sim
  await page.route('**/models/arabica-v1/model_card.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(card) }));
  await page.route('**/models/leafseg-v1/model_card.json', (r) => r.fulfill({ status: 404, body: '' }));

  await page.goto('./');
  await setSimPlan(page, ['roya']);
  await shot(page, '00-paquetes-vacio');
  await installFromCatalog(page, 'colombia-andina');
  await saveDefaultArea(page);
  await shot(page, '01-paquetes');
  await goHome(page);
  await shot(page, '02-inicio');

  await page.getByTestId('start-review').click();
  await expect(screen(page, 'captura')).toBeVisible();
  await shot(page, '03-captura');
  await goHome(page);
  await takePhotos(page, 5);
  await expect(page.getByTestId('dx-outcome')).toHaveText(phrase(ES, 'dx_roya'));
  await shot(page, '04-diagnostico');
  await page.getByTestId('dx-next').click();
  await expect(page.getByRole('heading', { name: phrase(ES, 'ask_rain') })).toBeVisible();
  await shot(page, '05-preguntas');
  await page.getByTestId('answer-yes').click();
  await page.getByTestId('answer-no').click();

  // Riesgo: espera el resultado del Web Worker.
  const riesgo = screen(page, 'riesgo');
  await expect(riesgo).toBeVisible();
  await expect(page.getByTestId('risk-card')).toBeVisible({ timeout: 60_000 });
  const level = (await page.getByTestId('risk-level').getAttribute('data-level')) ?? '';
  expect(['LOW', 'MEDIUM', 'HIGH', 'CONSULT']).toContain(level);
  await expect(page.getByTestId('risk-level')).toHaveAttribute('aria-label', phrase(ES, level === 'CONSULT' ? 'consult' : `risk_${level.toLowerCase()}`));
  await expect(riesgo.getByText(phrase(ES, 'risk_title'))).toBeVisible();
  await expect(page.getByTestId('loss-likely')).toContainText(/\d/);
  await expect(page.getByTestId('demo-badge')).toBeVisible();
  await expect(page.getByTestId('flag-flag_prior')).toHaveText(phrase(ES, 'flag_prior'));
  await expect(page.getByTestId('rd-climate')).toContainText(phrase(ES, 'climate_from'));
  await page.screenshot({ path: join(SHOTS, '06-riesgo-pantalla.png') });
  await shot(page, '06-riesgo');

  await page.getByTestId('risk-next').click();
  const dec = screen(page, 'decision');
  await expect(dec).toBeVisible();
  await expect(dec.getByRole('heading', { name: phrase(ES, 'options_title') })).toBeVisible();
  // Parámetros prior: sin recomendación automática, aviso de modo informativo y ninguna tarjeta destacada.
  await expect(page.getByTestId('info-mode')).toHaveText(new RegExp(phrase(ES, 'info_mode')));
  await expect(dec.locator('[data-suggested="true"]')).toHaveCount(0);
  await expect(page.getByTestId('alt-nada')).toContainText(phrase(ES, 'alt_wait'));
  const alts = dec.locator('[data-testid^="alt-"]');
  expect(await alts.count()).toBeGreaterThan(1);
  await expect(page.getByTestId('choice-CONSULT')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, '07-decision-pantalla.png') });
  await shot(page, '07-decision');

  // Elegir una acción viable (la primera con botón) registra TREAT y el id de la alternativa.
  const first = dec.locator('[data-testid^="choose-"]').first();
  const id = ((await first.getAttribute('data-testid')) ?? '').replace('choose-', '');
  await first.click();
  await expect(screen(page, 'confirmacion')).toBeVisible();
  await shot(page, '08-confirmacion');
  const saved = await page.evaluate(async () => {
    const req = indexedDB.open('keyval-store');
    const db = await new Promise<IDBDatabase>((ok, ko) => {
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error);
    });
    const tx = db.transaction('keyval').objectStore('keyval').getAll();
    const all = await new Promise<unknown[]>((ok) => {
      tx.onsuccess = () => ok(tx.result as unknown[]);
    });
    return JSON.stringify(all);
  });
  expect(saved).toContain(`"alternative":"${id}"`);
  await goHome(page);
  await page.getByRole('button', { name: phrase(ES, 'pending') }).click();
  await expect(screen(page, 'pendientes')).toBeVisible();
  await shot(page, '09-pendientes');
});

test('r. respaldo: sin parámetros del manual, Riesgo y Decisión usan la regla antigua con la cereza', async ({ page }) => {
  const card = JSON.parse(readFileSync(join(APP_DIR, 'public', 'models', 'arabica-v1', 'model_card.json'), 'utf8')) as Record<string, unknown>;
  card.recommended_file = null;
  await page.route('**/models/arabica-v1/model_card.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(card) }));
  await page.route('**/models/leafseg-v1/model_card.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/models/riesgo-v1/params.json', (r) => r.fulfill({ status: 404, body: '' }));

  await page.goto('./');
  await setSimPlan(page, ['roya']);
  await installFromCatalog(page, 'colombia-andina');
  await saveDefaultArea(page);
  await goHome(page);
  await takePhotos(page, 5);
  await page.getByTestId('dx-next').click();
  await page.getByTestId('answer-yes').click();
  await page.getByTestId('answer-no').click();
  await expect(screen(page, 'riesgo')).toBeVisible();
  const gauge = page.getByTestId('risk-level');
  await expect(gauge).toHaveAttribute('data-level', /^(LOW|MEDIUM|HIGH)$/);
  const level = (await gauge.getAttribute('data-level')) ?? '';
  await expect(screen(page, 'riesgo').getByText(phrase(ES, `risk_${level.toLowerCase()}`))).toBeVisible();
  await expect(page.getByTestId('risk-card')).toHaveCount(0);
  await shot(page, '10-riesgo-respaldo');
  await page.getByTestId('risk-next').click();
  await expect(page.getByTestId('decision-suggestion')).toBeVisible();
  await expect(page.getByTestId('kpi-loss')).toContainText(/\d/);
  await shot(page, '11-decision-respaldo');
});
