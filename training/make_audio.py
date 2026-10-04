"""Genera un audio por frase para un paquete de Jani.

Uso (en Colab o local, con ffmpeg instalado):
    pip install transformers torch scipy
    python training/make_audio.py packs/noor-africa-oriental
    python training/make_audio.py packs/colombia-andina

Lee pack.json, toma el modelo de voz de pack["tts"]["model"] y escribe
<paquete>/audio/<clave>.mp3 para cada frase. Si prefieren grabar con voz
humana, guarden los archivos con el mismo nombre y no ejecuten este script.

Nota: los modelos MMS-TTS de Meta se publican con licencia no comercial
(CC BY-NC 4.0, confirmar en la ficha del modelo). Declararlo en docs/DATA.md.
"""
import json, os, subprocess, sys

import scipy.io.wavfile as wav
import torch
from transformers import AutoTokenizer, VitsModel


def main(pack_dir: str) -> None:
    pack_path = os.path.join(pack_dir, "pack.json")
    pack = json.load(open(pack_path, encoding="utf-8"))
    model_id = pack["tts"]["model"]
    out_dir = os.path.join(pack_dir, pack.get("audio", {}).get("dir", "audio"))
    os.makedirs(out_dir, exist_ok=True)

    tok = AutoTokenizer.from_pretrained(model_id)
    tts = VitsModel.from_pretrained(model_id)
    made = []
    for key, text in pack["phrases"].items():
        with torch.no_grad():
            audio = tts(**tok(text, return_tensors="pt")).waveform[0].numpy()
        wav_path = os.path.join(out_dir, f"{key}.wav")
        mp3_path = os.path.join(out_dir, f"{key}.mp3")
        wav.write(wav_path, tts.config.sampling_rate, audio)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav_path, "-b:a", "48k", mp3_path], check=True)
        os.remove(wav_path)
        made.append(key)

    pack.setdefault("audio", {})["status"] = f"sintético ({model_id}); sin validar por hablante nativo"
    pack["audio"]["files"] = sorted(made)
    json.dump(pack, open(pack_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"{len(made)} audios en {out_dir}")


if __name__ == "__main__":
    main(sys.argv[1])
