# Custom translator modules

Custom translator modules are **not supported** by Local Translator for Chromium.

Linguist allowed loading user-supplied JavaScript translator modules, which in
practice fetched translations from a remote service. That is incompatible with
this fork's goal of removing every runtime network path, so the loader, the
offscreen sandbox, and the management UI were all removed.

The extension has exactly one embedded translator: the local Bergamot engine.
To add more languages, extend the bundled model set instead — see the
[offline translation guide](./guides/OfflineTranslation.md).

If you need the upstream custom-translator mechanism, use
[Linguist](https://github.com/translate-tools/linguist) directly.
