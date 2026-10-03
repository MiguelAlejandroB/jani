// Paquete activo provisional: el de Colombia, incluido en el build.
// El prompt 2 lo reemplaza por el paquete instalado en IndexedDB (packs/loader.ts).
import colombia from '../../../packs/colombia-andina/pack.json';

const phrases: Record<string, string> = colombia.phrases;

export const activePack = { id: colombia.id, language: colombia.language, phrases };

// Ningún texto visible se genera en ejecución: todo sale de pack.phrases.
export function t(key: string): string {
  return phrases[key] ?? '';
}
