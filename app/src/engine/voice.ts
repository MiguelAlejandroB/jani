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

export function createVoice(d: VoiceDeps): Voice {
  let gen = 0;
  let cancelCurrent: (() => void) | null = null;

  const playBlob = (blob: Blob, my: number): Promise<boolean> =>
    new Promise((resolve) => {
      let url: string | null = null;
      let audio: AudioLike | null = null;
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
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
        audio.play().catch(() => finish(false));
      } catch {
        finish(false);
      }
    });

  const speak = (text: string, my: number): Promise<void> =>
    new Promise((resolve) => {
      const sp = d.speech;
      try {
        if (!sp || !text || my !== gen) return resolve();
        const prefix = d.lang.toLowerCase();
        if (!sp.getVoices().some((v) => v.lang.toLowerCase().startsWith(prefix))) return resolve();
        const finish = () => {
          clearTimeout(timer);
          cancelCurrent = null;
          resolve();
        };
        const timer = setTimeout(finish, SPEECH_TIMEOUT_MS);
        const u = d.makeUtterance(text, d.lang);
        u.onend = finish;
        u.onerror = finish;
        cancelCurrent = () => {
          try {
            sp.cancel();
          } catch {
            // nada
          }
          finish();
        };
        sp.speak(u);
      } catch {
        resolve();
      }
    });

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
