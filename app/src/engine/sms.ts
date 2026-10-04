import type { Pack } from '../packs/schema';
import { sessionOutcome } from './session';
import type { Case } from './types';

/** Clave de frase del resultado de un caso (diagnóstico, sano o dudoso). */
export function outcomeKey(c: Case): string {
  const o = sessionOutcome(c.session);
  if (o === 'consult') return 'unsure';
  if (o === 'healthy') return 'all_healthy';
  return c.session.dominant ? `dx_${c.session.dominant}` : 'unsure';
}

/** Resumen solo de texto: frases del paquete, fecha ISO y valores del caso. Sin fotos. */
export function buildCaseSummary(c: Case, pack: Pack): string {
  const lines: string[] = [c.date.slice(0, 10), pack.phrases[outcomeKey(c)] ?? ''];
  const level = c.rd?.level ?? c.risk?.level;
  if (level && level !== 'CONSULT') lines.push(pack.phrases[`risk_${level.toLowerCase()}`] ?? '');
  if (c.choice) lines.push(pack.phrases[`opt_${c.choice.toLowerCase()}`] ?? '');
  return lines.filter((l) => l !== '').join('\n');
}

/** ¿Se puede enviar el caso? Con el resumen del manual manda su nivel; sin él, la regla antigua. Elegir CONSULT siempre habilita. */
export function canSendCase(c: Case): boolean {
  if (c.choice === 'CONSULT') return true;
  const level = c.rd?.level ?? c.risk?.level;
  return level === 'HIGH' || (c.rd?.level !== undefined && level === 'CONSULT');
}

/** Enlace sms:. Sin número (`null` o vacío) abre la app de mensajes y la persona elige el destinatario. */
export function smsHref(phone: string | null | undefined, body: string): string {
  return `sms:${phone ?? ''}?body=${encodeURIComponent(body)}`;
}
