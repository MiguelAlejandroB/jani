import { useEffect } from 'react';
import { useNav } from '../nav';

/** Si falta el estado del recorrido (p. ej. recarga a mitad), vuelve a inicio sin fallar. */
export function useRedirectIf(missing: boolean): void {
  const { go } = useNav();
  useEffect(() => {
    if (missing) go('inicio');
  }, [missing, go]);
}
