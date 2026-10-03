import { describe, expect, it, vi } from 'vitest';
import { createVoice, type AudioLike, type SpeechLike, type VoiceDeps } from '../engine/voice';

const blob = new Blob(['x']);

function fakeAudio(opts: { rejectPlay?: boolean } = {}): AudioLike & { played: boolean } {
  const a: AudioLike & { played: boolean } = {
    played: false,
    onended: null,
    onerror: null,
    play() {
      if (opts.rejectPlay) return Promise.reject(new Error('NotAllowedError'));
      a.played = true;
      queueMicrotask(() => a.onended?.());
      return Promise.resolve();
    },
    pause() {},
  };
  return a;
}

function fakeSpeech(voices: Array<{ lang: string }>, log: string[] = []): SpeechLike {
  return {
    getVoices: () => voices,
    speak(u) {
      log.push(u.text);
      queueMicrotask(() => u.onend?.());
    },
    cancel: vi.fn(),
  };
}

function deps(over: Partial<VoiceDeps> = {}): VoiceDeps {
  return {
    lang: 'es',
    getAudio: async () => undefined,
    text: (k) => `texto ${k}`,
    newAudio: () => fakeAudio(),
    createUrl: () => 'blob:x',
    revokeUrl: () => undefined,
    makeUtterance: (text, lang) => ({ text, lang, onend: null, onerror: null }),
    speech: undefined,
    ...over,
  };
}

describe('voice', () => {
  it('falta audio y no hay voz: resuelve sin error', async () => {
    await expect(createVoice(deps()).say('welcome')).resolves.toBeUndefined();
  });

  it('falta audio y la voz no es del idioma: resuelve sin hablar', async () => {
    const log: string[] = [];
    const v = createVoice(deps({ speech: fakeSpeech([{ lang: 'sw-KE' }], log) }));
    await v.say('welcome');
    expect(log).toEqual([]);
  });

  it('reproduce el audio del paquete y revoca la URL', async () => {
    const audio = fakeAudio();
    const revoke = vi.fn();
    const v = createVoice(deps({ getAudio: async () => blob, newAudio: () => audio, revokeUrl: revoke }));
    await v.say('welcome');
    expect(audio.played).toBe(true);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });

  it('play rechaza: usa speech con el idioma del paquete', async () => {
    const log: string[] = [];
    const v = createVoice(
      deps({
        getAudio: async () => blob,
        newAudio: () => fakeAudio({ rejectPlay: true }),
        speech: fakeSpeech([{ lang: 'es-CO' }], log),
      }),
    );
    await v.say('welcome');
    expect(log).toEqual(['texto welcome']);
  });

  it('getAudio lanza: no lanza y usa speech', async () => {
    const log: string[] = [];
    const v = createVoice(
      deps({
        getAudio: () => Promise.reject(new Error('idb')),
        speech: fakeSpeech([{ lang: 'es' }], log),
      }),
    );
    await expect(v.say('saved')).resolves.toBeUndefined();
    expect(log).toEqual(['texto saved']);
  });

  it('sayAll respeta el orden', async () => {
    const log: string[] = [];
    const v = createVoice(deps({ speech: fakeSpeech([{ lang: 'es' }], log) }));
    await v.sayAll(['a', 'b', 'c']);
    expect(log).toEqual(['texto a', 'texto b', 'texto c']);
  });

  it('stop cancela el resto de sayAll', async () => {
    const log: string[] = [];
    const v = createVoice(deps({ speech: fakeSpeech([{ lang: 'es' }], log) }));
    const p = v.sayAll(['a', 'b', 'c']);
    v.stop();
    await p;
    expect(log.length).toBeLessThan(3);
  });
});
