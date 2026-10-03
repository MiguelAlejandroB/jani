// VOICE: un mp3 por frase del paquete activo; si falta, speechSynthesis; si no, silencio.
// Nunca lanza. Las dependencias se inyectan para poder probar en node.

export type AudioLike = {
  play: () => Promise<void>;
  pause: () => void;
  onended: (() => void) | null;
  onerror: (() => void) | null;
};

export type UtteranceLike = { text: string; lang: string; onend: (() => void) | null; onerror: (() => void) | null };

export type SpeechLike = {
  getVoices: () => Array<{ lang: string }>;
  speak: (u: UtteranceLike) => void;
  cancel: () => void;
  /** Suscribe a 'voiceschanged'; devuelve la función para desuscribirse. */
  onVoicesChanged?: (cb: () => void) => () => void;
};

export type VoiceDeps = {
  lang: string;
  getAudio: (key: string) => Promise<Blob | undefined>;
  text: (key: string) => string | undefined;
  newAudio: (url: string) => AudioLike;
  createUrl: (b: Blob) => string;
  revokeUrl: (url: string) => void;
  makeUtterance: (text: string, lang: string) => UtteranceLike;
  speech: SpeechLike | undefined;
};

export type Voice = {
  say: (key: string) => Promise<void>;
  sayAll: (keys: string[]) => Promise<void>;
  stop: () => void;
};

const SPEECH_TIMEOUT_MS = 20000;
const VOICES_WAIT_MS = 1000;
const AUDIO_TIMEOUT_MS = 30000;

export function createVoice(d: VoiceDeps): Voice {
  let gen = 0;
  let cancelCurrent: (() => void) | null = null;

  const playBlob = (blob: Blob, my: number): Promise<boolean> =>
    new Promise((resolve) => {
      let url: string | null = null;
      let audio: AudioLike | null = null;
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cancelCurrent = null;
        try {
          if (audio) {
            audio.onended = null;
            audio.onerror = null;
          }
          if (url) d.revokeUrl(url);
        } catch {
          // nada
        }
        resolve(ok);
      };
      try {
        url = d.createUrl(blob);
        audio = d.newAudio(url);
        audio.onended = () => finish(true);
        audio.onerror = () => finish(false);
        cancelCurrent = () => {
          try {
            audio?.pause();
          } catch {
            // nada
          }
          finish(true);
        };
        if (my !== gen) return finish(true);
        timer = setTimeout(() => cancelCurrent?.(), AUDIO_TIMEOUT_MS);
        audio.play().catch(() => finish(false));
      } catch {
        finish(false);
      }
    });

  // Espera acotada a que el navegador cargue las voces (Chrome/Android: la primera lista suele venir vacía).
  const waitVoices = (sp: SpeechLike, my: number): Promise<void> =>
    new Promise((resolve) => {
      let unsub: (() => void) | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = () => {
        clearTimeout(timer);
        try {
          unsub?.();
        } catch {
          // nada
        }
        if (cancelCurrent === done) cancelCurrent = null;
        resolve();
      };
      try {
        if (sp.getVoices().length > 0 || !sp.onVoicesChanged || my !== gen) return resolve();
        unsub = sp.onVoicesChanged(done);
        timer = setTimeout(done, VOICES_WAIT_MS);
        cancelCurrent = done;
      } catch {
        resolve();
      }
    });

  const speak = async (text: string, my: number): Promise<void> => {
    const sp = d.speech;
    try {
      if (!sp || !text || my !== gen) return;
      await waitVoices(sp, my);
      if (my !== gen) return;
      const prefix = d.lang.toLowerCase();
      const voices = sp.getVoices();
      // Sin voces listadas se intenta igual con el idioma del paquete; con voces y ninguna del idioma, silencio.
      if (voices.length > 0 && !voices.some((v) => v.lang.toLowerCase().startsWith(prefix))) return;
      await new Promise<void>((resolve) => {
        const cancel = () => {
          try {
            sp.cancel();
          } catch {
            // nada
          }
        };
        const finish = () => {
          clearTimeout(timer);
          cancelCurrent = null;
          resolve();
        };
        const timer = setTimeout(() => {
          cancel();
          finish();
        }, SPEECH_TIMEOUT_MS);
        const u = d.makeUtterance(text, d.lang);
        u.onend = finish;
        u.onerror = finish;
        cancelCurrent = () => {
          cancel();
          finish();
        };
        sp.speak(u);
      });
    } catch {
      // nunca lanza
    }
  };

  const sayWith = async (key: string, my: number): Promise<void> => {
    try {
      let blob: Blob | undefined;
      try {
        blob = await d.getAudio(key);
      } catch {
        blob = undefined;
      }
      if (my !== gen) return;
      if (blob && (await playBlob(blob, my))) return;
      if (my !== gen) return;
      await speak(d.text(key) ?? '', my);
    } catch {
      // nunca lanza
    }
  };

  return {
    say: (key) => sayWith(key, gen),
    async sayAll(keys) {
      const my = gen;
      for (const k of keys) {
        if (my !== gen) return;
        await sayWith(k, my);
      }
    },
    stop() {
      gen++;
      const c = cancelCurrent;
      cancelCurrent = null;
      try {
        c?.();
      } catch {
        // nada
      }
    },
  };
}
