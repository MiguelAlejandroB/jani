import { useCallback, useEffect, useMemo } from 'react';
import { createVoice, type AudioLike, type SpeechLike, type UtteranceLike, type Voice } from '../engine/voice';
import { getPackAudio } from '../packs/loader';
import { usePack } from '../packs/PackContext';

function browserSpeech(): SpeechLike | undefined {
  try {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return undefined;
    return {
      getVoices: () => speechSynthesis.getVoices(),
      speak: (u) => speechSynthesis.speak(u as unknown as SpeechSynthesisUtterance),
      cancel: () => speechSynthesis.cancel(),
    };
  } catch {
    return undefined;
  }
}

/** Reproduce las frases al entrar a la pantalla (una vez por cambio de claves) y las detiene al salir. */
export function useScreenAudio(keys: string[]): () => void {
  const { pack } = usePack();
  const voice = useMemo<Voice | null>(() => {
    if (!pack) return null;
    return createVoice({
      lang: pack.language.code,
      getAudio: (k) => getPackAudio(pack.id, k),
      text: (k) => pack.phrases[k],
      newAudio: (url) => new Audio(url) as unknown as AudioLike,
      createUrl: (b) => URL.createObjectURL(b),
      revokeUrl: (u) => URL.revokeObjectURL(u),
      makeUtterance: (text, lang) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        return u as unknown as UtteranceLike;
      },
      speech: browserSpeech(),
    });
  }, [pack]);

  const joined = keys.join('|');
  useEffect(() => {
    if (!voice || !joined) return;
    void voice.sayAll(joined.split('|'));
    return () => voice.stop();
  }, [voice, joined]);

  return useCallback(() => {
    if (!voice || !joined) return;
    voice.stop();
    void voice.sayAll(joined.split('|'));
  }, [voice, joined]);
}
