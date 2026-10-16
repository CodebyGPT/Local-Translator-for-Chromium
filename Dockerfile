# Build container for Local Translator for Chromium.
#
# Used only to produce a build. The engine/model fetchers run here (they need
# the network); the resulting extension is fully offline.
#
#   docker build -t local-translator .
#   docker run --rm -v "$PWD/build:/mnt/builder/build" local-translator

FROM node:22-bookworm
WORKDIR /mnt/builder

# `tar` is used to unpack the engine tarball; git is not required.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends tar \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --ignore-scripts

COPY . .

# Engine (Bergamot WASM) and models, both pinned by scripts/*.mjs
RUN npm run fetch:engine && npm run fetch:models

CMD ["sh", "-c", "npm run build:chromium"]
