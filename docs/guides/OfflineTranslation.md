# Offline translation

This build has exactly one translator: **Bergamot**, running locally as WebAssembly.
There is no cloud translator and no custom-translator loader, so there is nothing to
configure — translation is offline by construction.

## How it works

1. The Bergamot WASM engine is bundled at
   `thirdparty/bergamot/build/bergamot-translator-worker.{js,wasm}`.
2. Translation models and the registry that describes them are bundled at
   `models/`. The registry (`models/index.json`) maps a language pair to the
   files the engine needs.
3. On startup the extension reads the registry from its own package and derives
   the list of available languages from it. Nothing is downloaded at runtime.

## Adding languages

Models are chosen at build time:

```bash
npm run fetch:models -- --pairs en-de,de-en,en-ja,ja-en
```

Then rebuild. The new pairs appear in the language picker automatically, because
the language list comes from the registry rather than a hardcoded array.

To see everything Mozilla publishes:

```bash
npm run fetch:models -- --all
```

That is roughly 100 MB+ per direction for the full set; bundle only what you
need.

## Chinese

Chinese is released per script, so the registry contains `zh-Hans` and `zh-Hant`
entries. The extension presents them as the single `zh` code used by the rest of
the UI and by `browser.i18n.detectLanguage`, resolving to Simplified
(`zh-Hans`) when it is bundled. Include both directions (`en-zh-Hans`,
`zh-Hans-en`) so translation works both ways.

## Why the upstream project needed a server for this

Linguist shipped its offline models in a cloud bucket and fetched them on first
use, and it offered custom translators for people who wanted to point at
LibreTranslate or another local service. This fork removes both paths and ships
the models in the package instead, so no server, port, or network access is
required.
