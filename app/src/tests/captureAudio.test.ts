import { describe, expect, it } from 'vitest';
import { captureAudioKey } from '../flow/captureAudio';

describe('captureAudioKey', () => {
  it('sin fotos pide encuadrar la hoja, no "toma otra hoja"', () => {
    expect(captureAudioKey(0, 5, null)).toBe('frame_leaf');
  });
  it('con algunas fotos pide otra hoja y con la meta dice listo', () => {
    expect(captureAudioKey(2, 5, null)).toBe('more_photos');
    expect(captureAudioKey(5, 5, null)).toBe('done_photos');
  });
  it('si la última foto se rechazó, dice por qué (repetir o no hay hoja)', () => {
    expect(captureAudioKey(0, 5, 'retake')).toBe('retake');
    expect(captureAudioKey(3, 5, 'no_leaf')).toBe('no_leaf');
  });
});
