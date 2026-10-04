import { useCallback, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
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
      onVoicesChanged: (cb) => {
        speechSynthesis.addEventListener('voiceschanged', cb);
        return () => speechSynthesis.removeEventListener('voiceschanged', cb);
      },
    };
  } catch {
    return undefined;
  }
}

// En el APK (WebView de Android) no existe speechSynthesis: se usa el motor de texto a voz del teléfono,
// que funciona sin conexión. speak() resuelve cuando termina de hablar.
const NATIVE = Capacitor.isNativePlatform();

function nativeSpeech(): SpeechLike {
  return {
    getVoices: () => [],
    speak: (u) => {
      TextToSpeech.speak({ text: u.text, lang: u.lang, rate: 1.0, category: 'playback' })
        .then(() => u.onend?.())
        .catch(() => u.onerror?.());
    },
    cancel: () => {
      void TextToSpeech.stop().catch(() => undefined);
    },
  };
}

/**
 * Reproduce las frases al entrar a la pantalla (una vez por cambio de claves) y las detiene al salir.
 * nonce: cambiarlo vuelve a decirlas con las mismas claves (p. ej. cada foto rechazada).
 */
export function useScreenAudio(keys: string[], nonce = 0): () => void {
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
        if (NATIVE) return { text, lang, onend: null, onerror: null };
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        return u as unknown as UtteranceLike;
      },
      speech: NATIVE ? nativeSpeech() : browserSpeech(),
    });
  }, [pack]);

  const joined = keys.join('|');
  useEffect(() => {
    if (!voice || !joined) return;
    void voice.sayAll(joined.split('|'));
    return () => voice.stop();
  }, [voice, joined, nonce]);

  return useCallback(() => {
    if (!voice || !joined) return;
    voice.stop();
    void voice.sayAll(joined.split('|'));
  }, [voice, joined]);
}
