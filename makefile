# Local Translator for Chromium — build tasks
#
# The engine and models are fetched from the network by the two `fetch-*`
# targets, which run on this machine. The packaged extension itself is offline.

SHELL := /bin/bash

export

TARGET ?= chromium
PLATFORMS ?= firefox firefox-standalone chromium chrome

prepare:
	npm install

# Fetch the pinned Bergamot WASM engine into thirdparty/bergamot/build
fetchEngine:
	node scripts/fetch-engine.mjs

# Fetch translation models into models/, writing models/index.json.
# Override the pair set with: make models PAIRS=en-zh-Hans,zh-Hans-en
models:
	node scripts/fetch-models.mjs $(if $(ALL),--all,$(if $(PAIRS),--pairs $(PAIRS),))

engine: fetchEngine

clean:
	rm -rf ./build

build: clean prepare engine models
	EXT_TARGET=$(TARGET) NODE_ENV=production npx webpack-cli -c ./webpack.config.js

# Targets below require deps and are not intended to run manually
build-firefox:
	NODE_ENV=production EXT_TARGET=firefox npx webpack-cli -c ./webpack.config.js
build-firefox-standalone:
	NODE_ENV=production EXT_TARGET=firefox-standalone npx webpack-cli -c ./webpack.config.js
build-chromium:
	NODE_ENV=production EXT_TARGET=chromium npx webpack-cli -c ./webpack.config.js
build-chrome:
	NODE_ENV=production EXT_TARGET=chrome npx webpack-cli -c ./webpack.config.js

buildAll:
	mkdir -p ./build
	$(MAKE) $(addprefix build-,$(PLATFORMS))

test:
	npm run test:models
	npm run test:engine
	npm run test:worker
	npx vitest run

# Needs a Chromium/Chrome on the machine; nothing is downloaded.
testBrowser:
	npm run test:browser -- build/chromium

lintBuilds:
	cd build && ../scripts/testBuildArchives.sh
