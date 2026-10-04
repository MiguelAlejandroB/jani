import { expect, installFromCatalog, saveDefaultArea, test } from './helpers';

test.use({ geolocation: { latitude: 1.86, longitude: -76.04 }, permissions: ['geolocation'] });

test('p. ubicación: con permiso, el clima sale del punto cafetero más cercano (Pitalito, Huila)', async ({ page }) => {
  await page.goto('./');
  await installFromCatalog(page, 'colombia-andina');
  await saveDefaultArea(page);
  // Sin ubicación todavía: usa el punto del paquete.
  await expect(page.getByTestId('climate-point')).toHaveAttribute('data-source', 'paquete');
  await page.getByTestId('use-location').click();
  const point = page.getByTestId('climate-point');
  await expect(point).toHaveAttribute('data-source', 'gps');
  await expect(point).toContainText('Pitalito, Huila');
  // La ubicación queda solo en el teléfono: tras recargar se sigue usando sin volver a pedirla.
  await page.reload();
  await expect(page.getByTestId('climate-point')).toContainText('Pitalito, Huila');
});
