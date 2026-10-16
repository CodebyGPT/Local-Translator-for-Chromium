# Build from sources

## Prerequisites

- Node.js >= 22.15 (the model fetcher uses the built-in `zstdDecompressSync`)
- npm

Docker is optional: only needed if you would rather not install Node locally, and
only to produce a build. The packaged extension needs no toolchain or server.

## Build

```bash
npm ci
npm run fetch:engine    # pinned Bergamot WASM
npm run fetch:models    # models + models/index.json
npm run build:chromium  # -> build/chromium
```

Then load `build/chromium` with *Load unpacked* in `chrome://extensions`.

`make` wraps the same steps:

- `make build` — clean, install, fetch engine and models, build
- `make build TARGET=chrome` — same for the Chrome package
- `make models PAIRS=en-zh-Hans,zh-Hans-en` — pick a different model set

Artifacts are placed in the `build` directory.

### Targets

- `chromium` — Chrome Web Store-style build
- `chrome` — same, without the upstream update manifest

Firefox targets (`firefox`, `firefox-standalone`) still exist in the webpack
config, but this fork targets Chromium and does not test them.

### Rebuilding the WASM engine

`npm run fetch:engine` downloads the upstream package revision pinned in
`thirdparty/bergamot/.env`. To build the WASM from source instead, use
`thirdparty/bergamot/makefile` (requires Docker or an Emscripten SDK) and copy
the artifacts into `thirdparty/bergamot/build/`.

# Development

Run `npm run build:dev` for a watching build, or use the webpack config directly
with `EXT_TARGET=chromium npx webpack-cli -wc ./webpack.config.js`.

If you change theme tokens, compile them: `npm run build:tokens`.

# Tests

```bash
npm run test:models   # model registry + selection, offline
npm run test:engine   # loads the WASM engine and checks the bound API
npx vitest            # the application test suite
```

`test:engine` instantiates the bundled WASM with a stubbed worker environment,
so a WASM/glue revision mismatch fails at build time rather than in the browser.

When you change code that touches user data and browser storages
(`localStorage`, `indexedDB`, `browser.storage`, …), add or update tests for it.
Any code which simply transforms data should be tested. UI tests are optional.

# Migrations

Migrations must have app version.
