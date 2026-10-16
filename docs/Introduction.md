---
slug: '/'
---

# Introduction

Local Translator for Chromium is a privacy-first browser translation extension for
Chromium browsers. It translates web pages, selected text, and custom input
directly in the browser, running entirely on your device.

The translation engine is the same one Firefox uses: [Bergamot](../README.md),
compiled to WebAssembly, with the translation models bundled in the package.

## What is different from Linguist

This is a fork of [Linguist](https://github.com/translate-tools/linguist) with a
much narrower scope:

- **No network at runtime.** No cloud translator, no custom-translator loader,
  no telemetry, no TTS, no updater. The manifest's CSP is
  `connect-src 'self'`.
- **Models ship with the extension.** The registry and model files are read from
  the extension package.
- **Chinese is supported**, in both Simplified and Traditional scripts.

See the [offline translation guide](./guides/OfflineTranslation.md) for how the
model set is chosen at build time.

## Documentation

Use the navigation sidebar to learn how to build the project, configure
translation behaviour, and extend the bundled language set.

## Support

File an issue in this repository. For the upstream project, see
[translate-tools/linguist](https://github.com/translate-tools/linguist).
