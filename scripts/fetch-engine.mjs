#!/usr/bin/env node
/**
 * Build-time engine fetcher for Local Translator for Chromium.
 *
 * Produces the three artifacts the extension bundles for the Bergamot engine:
 *
 *   thirdparty/bergamot/build/bergamot-translator-worker.wasm
 *   thirdparty/bergamot/build/bergamot-translator-worker.js
 *   thirdparty/bergamot/build/translator.worker.js
 *
 * The first two come from the pinned upstream package revision in
 * `thirdparty/bergamot/.env` (`BERGAMOT_REVISION`), so the Emscripten glue and
 * the WASM binary always match. The third is the worker wrapper built from
 * `thirdparty/bergamot/src/worker/` — without it the extension loads a worker
 * URL that does not exist.
 *
 * This runs at build time only. Nothing here is reachable from the running
 * extension.
 *
 * Usage:
 *   node scripts/fetch-engine.mjs [--force]
 *
 * To build the WASM from source instead (needs Docker or an Emscripten SDK),
 * see `thirdparty/bergamot/makefile`.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BERGAMOT_DIR = path.join(ROOT, 'thirdparty', 'bergamot');
const BUILD_DIR = path.join(BERGAMOT_DIR, 'build');
const WORKER_ENTRY = path.join(BERGAMOT_DIR, 'src', 'worker', 'translator.worker.ts');
const WORKER_OUTPUT = path.join(BUILD_DIR, 'translator.worker.js');

/** Upstream package whose tarball carries the pinned engine revision. */
const PACKAGE = '@browsermt/bergamot-translator';

const ARTIFACTS = [
	{ from: 'package/worker/bergamot-translator-worker.js', to: 'bergamot-translator-worker.js' },
	{ from: 'package/worker/bergamot-translator-worker.wasm', to: 'bergamot-translator-worker.wasm' },
];

async function readPinnedRevision() {
	const env = await readFile(path.join(BERGAMOT_DIR, '.env'), 'utf8');
	const match = /BERGAMOT_REVISION=([0-9a-f]{40})/.exec(env);
	if (!match) {
		throw new Error('Could not read BERGAMOT_REVISION from thirdparty/bergamot/.env');
	}
	return match[1];
}

/**
 * `05a87784973b6e1cc591f1f1a9a05c5873d9971e` is tagged upstream as v0.4.5.
 * Keep this in sync with `.env`; the fetch fails loudly if it drifts.
 */
const REVISION_TAG = {
	'05a87784973b6e1cc591f1f1a9a05c5873d9971e': '0.4.5',
};

async function main() {
	const force = process.argv.includes('--force');

	await fetchWasmArtifacts(force);
	await buildWorker();

	console.log(
		`Engine ready in ${path.relative(ROOT, BUILD_DIR)}: ` +
			'artifacts ' + ARTIFACTS.map((a) => a.to).join(', ') + ', translator.worker.js',
	);
}

/** Download the pinned Emscripten glue + WASM binary. */
async function fetchWasmArtifacts(force) {
	const revision = await readPinnedRevision();
	const version = REVISION_TAG[revision];

	if (!version) {
		throw new Error(
			`No npm release known for BERGAMOT_REVISION=${revision}. ` +
				'Add the mapping in scripts/fetch-engine.mjs or build from source.',
		);
	}

	const wasmPath = path.join(BUILD_DIR, 'bergamot-translator-worker.wasm');
	if (!force && existsSync(wasmPath)) {
		console.log(`WASM already present (use --force to refetch)`);
		return;
	}

	const registry = await fetch(`https://registry.npmjs.org/${encodeURIComponent(PACKAGE)}`, {
		headers: { accept: 'application/json' },
	}).then((response) => {
		if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
		return response.json();
	});

	const release = registry.versions[version];
	if (!release) throw new Error(`${PACKAGE}@${version} not found in the npm registry`);

	const tarball = await fetch(release.dist.tarball).then(async (response) => {
		if (!response.ok) throw new Error(`tarball download failed: ${response.status}`);
		return Buffer.from(await response.arrayBuffer());
	});

	const integrity = release.dist.integrity ?? '';
	const expected = integrity.startsWith('sha512-')
		? `sha512-${createHash('sha512').update(tarball).digest('base64')}`
		: null;
	if (expected && expected !== integrity) {
		throw new Error(`Tarball integrity mismatch for ${PACKAGE}@${version}`);
	}

	// Extract only the two artifacts we bundle (tar is available on all CI hosts).
	const archive = path.join(BUILD_DIR, 'bergamot.tgz');
	await mkdir(BUILD_DIR, { recursive: true });
	await writeFile(archive, tarball);

	try {
		for (const artifact of ARTIFACTS) {
			execFileSync('tar', ['-xzf', archive, '-C', BUILD_DIR, '--strip-components=0', artifact.from], {
				stdio: 'inherit',
			});

			const extracted = path.join(BUILD_DIR, artifact.from);
			const destination = path.join(BUILD_DIR, artifact.to);
			await rm(destination, { force: true });

			await rename(extracted, destination);
		}
	} finally {
		await rm(archive, { force: true });
		await rm(path.join(BUILD_DIR, 'package'), { recursive: true, force: true });
	}

	console.log(`Fetched ${PACKAGE}@${version} (revision ${revision})`);
}

/**
 * Bundle `thirdparty/bergamot/src/worker/translator.worker.ts` into a single
 * ES module the extension loads as a Worker.
 *
 * TypeScript is compiled by the project's own `tsc`, then Rollup inlines the
 * (relative) module graph. Doing it here keeps the worker build free of the
 * separate toolchain and `node_modules` that `thirdparty/bergamot/makefile`
 * assumes.
 */
async function buildWorker() {
	if (!existsSync(WORKER_ENTRY)) {
		throw new Error(`Worker entry not found: ${WORKER_ENTRY}`);
	}

	const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
	const rollupBin = path.join(ROOT, 'node_modules', 'rollup', 'dist', 'bin', 'rollup');
	if (!existsSync(tsc) || !existsSync(rollupBin)) {
		throw new Error('Run `npm install` first: tsc and rollup are required');
	}

	// The worker only imports sibling files, so `tsc` output is already a
	// complete relative module graph — no resolve plugin needed.
	const staging = await mkdtemp(path.join(tmpdir(), 'bergamot-worker-'));

	try {
		// 1. TypeScript -> plain ESM, preserving the relative import graph.
		//
		// Flags are passed explicitly instead of using the vendored
		// `thirdparty/bergamot/tsconfig.json`: that file still sets options
		// TypeScript 6+ rejects (`downlevelIteration`, `moduleResolution: node`).
		// Their meaning is reproduced here for an ES2020 target.
		const tsOut = path.join(staging, 'ts');
		await mkdir(tsOut, { recursive: true });
		execFileSync(
			process.execPath,
			[
				tsc,
				'--ignoreConfig',
				path.join(BERGAMOT_DIR, 'src', 'worker', 'translator.worker.ts'),
				'--outDir',
				tsOut,
				'--rootDir',
				path.join(BERGAMOT_DIR, 'src'),
				'--module',
				'esnext',
				'--moduleResolution',
				'bundler',
				'--target',
				'es2020',
				'--lib',
				'es2020,dom',
				'--strict',
				'--skipLibCheck',
				'--sourceMap',
				'false',
				'--noEmit',
				'false',
			],
			{ stdio: 'inherit' },
		);

		// 2. Bundle to one ES module.
		const rollupConfig = path.join(staging, 'rollup.config.mjs');
		await writeFile(
			rollupConfig,
			[
				`export default {`,
				`  input: ${JSON.stringify(path.join(tsOut, 'worker', 'translator.worker.js'))},`,
				`  output: { file: ${JSON.stringify(WORKER_OUTPUT)}, format: 'es' },`,
				`};`,
			].join('\n'),
		);

		await mkdir(BUILD_DIR, { recursive: true });
		execFileSync(process.execPath, [rollupBin, '-c', rollupConfig], { stdio: 'inherit' });
	} finally {
		await rm(staging, { recursive: true, force: true });
	}

	const size = (await readFile(WORKER_OUTPUT)).byteLength;
	if (size < 1024) {
		throw new Error(`translator.worker.js looks truncated (${size} bytes)`);
	}

	// The extension loads the glue with `importScripts('bergamot-translator-worker.js')`
	// from this same directory; a missing self-registration would silently
	// produce a worker that never answers a message.
	const source = await readFile(WORKER_OUTPUT, 'utf8');
	if (!source.includes('BergamotTranslatorWorker')) {
		throw new Error('translator.worker.js does not contain the translator class');
	}
	if (/^import\s/m.test(source)) {
		throw new Error('translator.worker.js still has imports; bundling failed');
	}

	// The worker is loaded as a classic script, so its top level IS the global
	// scope. The glue then does `importScripts('bergamot-translator-worker.js')`
	// into that same scope and declares `var Module`. Any top-level
	// `const`/`let Module` here collides with it and the worker dies with
	// `SyntaxError: Identifier 'Module' has already been declared`.
	//
	// `var Module` remains legal (var+var redeclaration is allowed) and is what
	// upstream does, so only the lexical forms are rejected.
	const lexicalModule = /(^|[;{}\s])(const|let)\s+Module\b/.exec(source);
	if (lexicalModule) {
		throw new Error(
			"translator.worker.js declares a lexical 'Module' binding; the Emscripten glue will fail " +
				"with \"Identifier 'Module' has already been declared\". Use `var`, or rename the local binding.",
		);
	}
	if (!source.includes('importScripts')) {
		throw new Error('translator.worker.js never loads the engine glue');
	}

	const glue = path.join(BUILD_DIR, 'bergamot-translator-worker.js');
	if (!existsSync(glue)) {
		throw new Error('bergamot-translator-worker.js is missing; the worker cannot load the engine');
	}

	console.log(`Built translator.worker.js (${size} bytes)`);
}

main().catch((error) => {
	console.error(`fetch-engine failed: ${error.message}`);
	process.exitCode = 1;
});
