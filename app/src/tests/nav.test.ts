import { describe, expect, it } from 'vitest';
import { SCREENS, screenFromHash } from '../nav';

describe('navegación', () => {
  it('tiene las diez pantallas de la sección 10', () => {
    expect(SCREENS).toHaveLength(10);
  });

  it('lee la pantalla del hash y cae en inicio si no existe', () => {
    expect(screenFromHash('#/riesgo')).toBe('riesgo');
    expect(screenFromHash('')).toBe('inicio');
    expect(screenFromHash('#/nada')).toBe('inicio');
  });
});
