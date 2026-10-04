# Fonts

Local copies so the app works offline (they are precached by the service worker). Nothing is requested from a CDN.

| File | Family | Axes | Subset | Size |
|---|---|---|---|---|
| `fraunces-latin.woff2` | Fraunces (variable) | `opsz` 9–144, `wght` 400–600 | latin | 66 KB |
| `fraunces-latin-ext.woff2` | Fraunces (variable) | `opsz` 9–144, `wght` 400–600 | latin-ext | 58 KB |

- Source: Google Fonts (`fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600`), version v38.
- Use: headings and figures (`--font-display`). Body text uses the system font (`system-ui`): Fraunces + Inter
  (400–600, latin + latin-ext) added up to 260 KB and the font budget is 200 KB.
- License: **SIL Open Font License 1.1** (OFL). Copyright 2018 The Fraunces Project Authors
  (https://github.com/undercasetype/Fraunces). License text: https://openfontlicense.org/open-font-license-official-text/
  The OFL allows using, bundling and redistributing the font with the app; it does not allow selling it on its own.
