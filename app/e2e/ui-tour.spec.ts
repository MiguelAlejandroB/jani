import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { APP_DIR, expect, goHome, installFromCatalog, noisePng, phrase, readPack, saveDefaultArea, screen, setSimPlan, test, type PackId } from './helpers';

// Recorrido visual por todas las pantallas (modo simulado) a 390×844 y 360×780, en español y en inglés.
// Las capturas quedan en e2e/screens/tour/<pack>-<ancho>/ para revisarlas contra el diseño de referencia.
const SHOTS = join(APP_DIR, 'e2e', 'screens', 'tour');
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 780 },
] as const;
const PACKS: readonly PackId[] = ['colombia-andina', 'english-demo'];

test.use({ simMode: true, serviceWorkers: 'block' });

async function addPhoto(page: Page, seed: number): Promise<void> {
  await expect(page.getByTestId('photo-btn')).toBeEnabled();
  await page.getByTestId('photo-input').setInputFiles({ name: `hoja-${seed}.png`, mimeType: 'image/png', buffer: noisePng(seed) });
}

for (const id of PACKS) {
  for (const vp of VIEWPORTS) {
    test(`tour ${id} ${vp.width}x${vp.height}`, async ({ page }) => {
      const pack = readPack(id);
      const dir = join(SHOTS, `${id}-${vp.width}`);
      mkdirSync(dir, { recursive: true });
      let i = 0;
      const shot = async (name: string, full = true) => {
        // Sin scroll horizontal y objetivos táctiles de al menos 48 px en los botones visibles.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `scroll horizontal en ${name}`).toBeLessThanOrEqual(0);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll('main button')]
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && !b.closest('[data-testid="sim-menu"]') && (r.height < 47.5 || r.width < 47.5);
            })
            .map((b) => b.getAttribute('data-testid') ?? b.getAttribute('aria-label') ?? b.textContent),
        );
        expect(small, `botones de menos de 48 px en ${name}`).toEqual([]);
        await page.screenshot({ path: join(dir, `${String(i++).padStart(2, '0')}-${name}.png`), fullPage: full, animations: 'disabled' });
      };
      await page.setViewportSize(vp);
      await page.goto('./');
      await setSimPlan(page, ['bad_photo', 'roya', 'roya', 'sana', 'roya', 'minador', 'roya', 'roya', 'roya']);
      await expect(screen(page, 'paquetes')).toBeVisible();
      await shot('paquetes-vacio');
      await installFromCatalog(page, id);
      await saveDefaultArea(page);
      await shot('paquetes');
      await goHome(page);
      await shot('inicio', false);
      await shot('inicio-completo');

      // Captura: rechazo, unas fotos, más de cinco (contador de extras).
      await page.getByTestId('start-review').click();
      await expect(screen(page, 'captura')).toBeVisible();
      await shot('captura-vacia', false);
      await addPhoto(page, 1);
      await expect(page.getByText(phrase(pack, 'retake'))).toBeVisible();
      await shot('captura-rechazo', false);
      for (let k = 2; k <= 4; k++) await addPhoto(page, k);
      await expect(page.getByTestId('photo-count')).toHaveText('3 / 5');
      await shot('captura-3', false);
      for (let k = 5; k <= 9; k++) await addPhoto(page, k);
      await expect(page.getByTestId('photo-count')).toHaveText('8 ✓');
      await shot('captura-8');
      await page.getByTestId('photos-done').click();

      await expect(page.getByTestId('dx-outcome')).toHaveText(phrase(pack, 'dx_roya'));
      await shot('diagnostico');
      await page.getByTestId('dx-next').click();
      await expect(page.getByRole('heading', { name: phrase(pack, 'ask_rain') })).toBeVisible();
      await shot('pregunta-lluvia', false);
      await page.getByTestId('answer-yes').click();
      await expect(page.getByRole('heading', { name: phrase(pack, 'ask_treatment') })).toBeVisible();
      await shot('pregunta-tratamiento', false);
      await page.getByTestId('answer-no').click();

      await expect(screen(page, 'riesgo')).toBeVisible();
      await expect(page.getByTestId('rd-loading')).toHaveCount(0, { timeout: 60_000 });
      await shot('riesgo', false);
      await shot('riesgo-completo');
      await page.getByTestId('risk-next').click();
      await expect(screen(page, 'decision')).toBeVisible();
      await shot('decision', false);
      await shot('decision-completo');
      await screen(page, 'decision').locator('[data-testid^="choose-"]').first().click();
      await expect(screen(page, 'confirmacion')).toBeVisible();
      await shot('confirmacion');
      await goHome(page);
      await shot('inicio-con-caso', false);
      await page.getByRole('button', { name: phrase(pack, 'pending') }).click();
      await expect(page.getByTestId('case-item')).toHaveCount(1);
      await shot('pendientes');
      await page.getByRole('button', { name: phrase(pack, 'about'), exact: true }).click();
      await expect(screen(page, 'acerca')).toBeVisible();
      await shot('acerca');
      for (let k = 0; k < 5; k++) await page.getByTestId('screen-icon').click();
      await expect(page.getByTestId('about-model')).toBeVisible();
      await shot('acerca-detalles');

      // Caso dudoso: diagnóstico "consultar" y la decisión de respaldo con CONSULT.
      await goHome(page);
      await setSimPlan(page, ['low_confidence']);
      await page.getByTestId('start-review').click();
      for (let k = 1; k <= 2; k++) await addPhoto(page, 20 + k);
      await page.getByTestId('photos-done').click();
      await expect(page.getByTestId('dx-outcome')).toHaveAttribute('data-outcome', 'consult');
      await shot('diagnostico-dudoso');
      await page.getByTestId('dx-next').click();
      await expect(page.getByTestId('decision-suggestion')).toBeVisible();
      await shot('decision-consultar');
      await page.getByTestId('choice-CONSULT').click();
      await expect(page.getByTestId('send-case')).toBeVisible();
      await shot('confirmacion-enviar');
    });
  }
}

test.describe('respaldo', () => {
  test.use({ legacyRisk: true });
  test('tour respaldo colombia-andina 390x844', async ({ page }) => {
    const dir = join(SHOTS, 'colombia-andina-respaldo');
    mkdirSync(dir, { recursive: true });
    await page.goto('./');
    await setSimPlan(page, ['roya']);
    await installFromCatalog(page, 'colombia-andina');
    await saveDefaultArea(page);
    await goHome(page);
    await page.getByTestId('start-review').click();
    for (let k = 1; k <= 5; k++) await addPhoto(page, k);
    await page.getByTestId('photos-done').click();
    await page.getByTestId('dx-next').click();
    await page.getByTestId('answer-yes').click();
    await page.getByTestId('answer-no').click();
    await expect(page.getByTestId('risk-level')).toHaveAttribute('data-level', /^(LOW|MEDIUM|HIGH)$/);
    await page.screenshot({ path: join(dir, '00-riesgo.png'), fullPage: true });
    await page.getByTestId('risk-next').click();
    await expect(page.getByTestId('kpi-loss')).toBeVisible();
    await page.screenshot({ path: join(dir, '01-decision.png'), fullPage: true });
  });
});
