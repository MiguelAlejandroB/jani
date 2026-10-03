import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Las diez pantallas de la sección 10, en orden.
export const SCREENS = [
  'inicio',
  'captura',
  'diagnostico',
  'preguntas',
  'riesgo',
  'decision',
  'confirmacion',
  'pendientes',
  'paquetes',
  'acerca',
] as const;
export type ScreenId = (typeof SCREENS)[number];

export function screenFromHash(hash: string): ScreenId {
  const h = hash.replace(/^#\/?/, '');
  return (SCREENS as readonly string[]).includes(h) ? (h as ScreenId) : 'inicio';
}

type Nav = { screen: ScreenId; go: (s: ScreenId) => void; back: () => void };
const NavContext = createContext<Nav | null>(null);

// Navegación por hash: funciona offline y en hosting estático sin reescrituras.
export function NavProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<ScreenId>(() => screenFromHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setScreen(screenFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (s: ScreenId) => {
    window.location.hash = `/${s}`;
  };
  const back = () => window.history.back();
  return <NavContext.Provider value={{ screen, go, back }}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav fuera de NavProvider');
  return nav;
}
