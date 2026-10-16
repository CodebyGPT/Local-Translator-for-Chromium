#!/usr/bin/env node
/**
 * Engine ABI check for Local Translator for Chromium.
 *
 * The extension drives the Bergamot engine through the WASM module's
 * `BlockingService` / `TranslationModel` / `AlignedMemory` API (see
 * `thirdparty/bergamot/src/worker/BergamotTranslatorWorker.ts`) and loads it
 * with `importScripts('bergamot-translator-worker.js')` from the worker.
 *
 * This exercises the real artifacts fetched by `scripts/fetch-engine.mjs`
 * without a browser: it stubs the worker globals, loads the glue, instantiates
 * the WASM, and asserts the exported API. A mismatch between the WASM binary
 * and the Emscripten glue (wrong revision, wrong build flags) fails here, at
 * build time, instead of inside a user's browser.
 *
 * Run with:
 *   node scripts/engine-abi.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = path.join(ROOT, 'thirdparty', 'bergamot', 'build');
const GLUE = path.join(BUILD_DIR, 'bergamot-translator-worker.js');
const WASM = path.join(BUILD_DIR, 'bergamot-translator-worker.wasm');
const WORKER = path.join(BUILD_DIR, 'translator.worker.js');

const { test } = createRequire(import.meta.url)('node:test');

/**
 * The engine's intgemm fallbacks are exported by the WASM binary and wired up
 * by `BergamotTranslatorWorker.linkFallbackIntGemm`. That helper can only read
 * `Module.asm` after instantiation, so at instantiation time it hands the glue
 * a module whose functions do not exist yet.
 *
 * We therefore resolve the fallbacks through a proxy that looks them up lazily
 * on the module object the glue publishes.
 */
const gemmModule = new Proxy(
	{},
	{
		get(_target, name) {
			return (...args) => {
				const asm = globalThis.Module?.asm;
				if (!asm || typeof asm[name] !== 'function') {
					throw new Error(`intgemm fallback ${String(name)} is unavailable`);
				}
				return asm[name](...args);
			};
		},
	},
);

function installWorkerGlobals() {
	const globals = globalThis;

	globals.self = globals;
	globals.window = undefined;
	globals.document = undefined;
	globals.process = undefined;

	// Chosen when `importScripts` is callable, which is how the real worker
	// loads the glue.
	globals.importScripts = (...files) => {
		for (const file of files) {
			// eslint-disable-next-line no-eval
			(0, eval)(readFileSync(path.join(BUILD_DIR, file), 'utf8'));
		}
	};

	// The glue derives the script directory from `self.location`.
	const base = 'chrome-extension://abcdefghijklmnop/thirdparty/bergamot/';
	globals.location = {
		href: `${base}translator.worker.js`,
		protocol: 'chrome-extension:',
		host: 'abcdefghijklmnop',
		hostname: 'abcdefghijklmnop',
		origin: 'chrome-extension://abcdefghijklmnop',
		pathname: '/thirdparty/bergamot/translator.worker.js',
		toString: () => `${base}translator.worker.js`,
	};

	const wasm = readFileSync(WASM);
	const wasmBytes = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);

	globals.fetch = async (input) => {
		const url = String(input);
		if (!url.includes('.wasm')) {
			throw new Error(`unexpected fetch in engine ABI check: ${url}`);
		}
		return new Response(wasmBytes, {
			headers: { 'content-type': 'application/wasm' },
		});
	};
}

/** Load the glue and wait for Emscripten to finish instantiating the WASM. */
async function loadModule() {
	installWorkerGlobals();

	let resolveReady;
	const ready = new Promise((resolve) => {
		resolveReady = resolve;
	});

	// `self.Module` must exist before the glue is evaluated; this mirrors what
	// `BergamotTranslatorWorker.loadModule` does.
	const Module = {
		onRuntimeInitialized: () => resolveReady(),
	};
	globalThis.Module = Module;

	// Provide the intgemm fallbacks the glue expects to link against.
	const nativeInstantiate = WebAssembly.instantiate;
	WebAssembly.instantiate = function (bytes, imports) {
		return nativeInstantiate(bytes, { ...imports, wasm_gemm: gemmModule });
	};

	let timeout;
	try {
		globalThis.importScripts('bergamot-translator-worker.js');

		await Promise.race([
			ready,
			new Promise((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error('WASM runtime did not initialise')),
					60_000,
				);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}

	return Module;
}

test('engine artifacts exist and are non-trivial', () => {
	const glue = readFileSync(GLUE);
	const wasm = readFileSync(WASM);
	const worker = readFileSync(WORKER, 'utf8');

	assert.equal(wasm.subarray(0, 4).toString('hex'), '0061736d', 'WASM magic missing');
	assert.ok(wasm.byteLength > 1_000_000, `WASM looks too small: ${wasm.byteLength}`);
	assert.ok(glue.byteLength > 10_000, `glue looks too small: ${glue.byteLength}`);

	// The worker must be self-contained and load the glue from its own directory.
	assert.ok(!/^import\s/m.test(worker), 'worker still has top-level imports');
	assert.ok(
		worker.includes('bergamot-translator-worker.js'),
		'worker does not load the engine glue',
	);
});

test('worker does not collide with the glue\'s global Module declaration', () => {
	const worker = readFileSync(WORKER, 'utf8');
	const glue = readFileSync(GLUE, 'utf8');

	// The glue announces its own declaration; if that changes, this check needs
	// revisiting rather than silently passing.
	assert.match(glue, /\bvar\s+Module\b/, 'glue no longer declares `var Module`');

	// A classic script's top level is the global scope, so a lexical `Module`
	// binding in the worker collides with the glue's `var Module`.
	const lexical = /(^|[;{}\s])(const|let)\s+Module\b/.exec(worker);
	assert.equal(
		lexical,
		null,
		`worker declares a lexical \`Module\` binding (${lexical?.[0]?.trim()}); ` +
			"the glue's `var Module` would throw \"Identifier 'Module' has already been declared\"",
	);
});

test('WASM exposes the API the extension binds to', async () => {
	const Module = await loadModule();

	for (const symbol of [
		'BlockingService',
		'TranslationModel',
		'AlignedMemory',
		'AlignedMemoryList',
		'VectorString',
		'VectorResponseOptions',
	]) {
		assert.equal(typeof Module[symbol], 'function', `Module.${symbol} is not a constructor`);
	}

	// The methods `BergamotTranslatorWorker` calls on the service.
	const service = new Module.BlockingService({ cacheSize: 0 });
	assert.equal(typeof service.translate, 'function', 'service.translate missing');
	assert.equal(typeof service.translateViaPivoting, 'function', 'pivot API missing');
	assert.equal(typeof service.delete, 'function', 'service.delete missing');
	service.delete();
});
