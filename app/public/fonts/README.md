# Fuentes

Copias locales para que la app funcione sin conexión (se precargan con el service worker). Nada se pide a un CDN.

| Archivo | Familia | Ejes | Subconjunto | Tamaño |
|---|---|---|---|---|
| `fraunces-latin.woff2` | Fraunces (variable) | `opsz` 9–144, `wght` 400–600 | latin | 66 KB |
| `fraunces-latin-ext.woff2` | Fraunces (variable) | `opsz` 9–144, `wght` 400–600 | latin-ext | 58 KB |

- Origen: Google Fonts (`fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600`), versión v38.
- Uso: títulos y cifras (`--font-display`). El cuerpo usa la fuente del sistema (`system-ui`): Fraunces + Inter
  (400–600, latin + latin-ext) sumaban 260 KB y el presupuesto de fuentes es 200 KB.
- Licencia: **SIL Open Font License 1.1** (OFL). Copyright 2018 The Fraunces Project Authors
  (https://github.com/undercasetype/Fraunces). Texto de la licencia: https://openfontlicense.org/open-font-license-official-text/
  La OFL permite usar, incluir y redistribuir la fuente con la app; no permite venderla sola.
