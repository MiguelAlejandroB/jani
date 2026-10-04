export type Rejection = 'retake' | 'no_leaf';

/** Frase de la pantalla de captura: el motivo del último rechazo, o el paso según cuántas fotos van. */
export function captureAudioKey(count: number, target: number, rejection: Rejection | null): string {
  if (rejection) return rejection;
  if (count === 0) return 'frame_leaf';
  return count >= target ? 'done_photos' : 'more_photos';
}
