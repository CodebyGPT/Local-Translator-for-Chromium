#!/usr/bin/env node
/**
 * End-to-end engine harness.
 *
 * Loads the REAL built translator worker
 * (`build/<target>/thirdparty/bergamot/translator.worker.js`) into a synthetic
 * WorkerGlobalScope, feeds it the exact messages the extension sends, and
 * translates real text through the bundled models. No browser required.
 *
 * This is the check that the packaged extension can actually translate:
 * registry -> model files -> WASM -> Chinese output.
 *
 * Usage:
 *   node scripts/worker-e2e.test.mjs [build/chromium]
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const TARGET = positional[0] ?? 'build/chromium';
const BUILD = path.join(ROOT, TARGET);
const BERGAMOT = path.join(BUILD, 'thirdparty', 'bergamot');
const { test } = createRequire(import.meta.url)('node:test');

const WORKER_JS = path.join(BERGAMOT, 'translator.worker.js');
const GLUE_JS = path.join(BERGAMOT, 'bergamot-translator-worker.js');
const WASM = path.join(BERGAMOT, 'bergamot-translator-worker.wasm');
const REGISTRY = path.join(BUILD, 'models', 'index.json');

const messageHandler = { current: null };
const outbound = [];
const logs = [];
const realConsole = console;

/**
 * Stand-in for the `wasm_gemm` import object.
 *
 * The engine's intgemm fallbacks are exported by the WASM binary and wired up by
 * `BergamotTranslatorWorker.linkFallbackIntGemm`, which can only read
 * `Module.asm` *after* instantiation. Resolving them lazily through a proxy lets
 * the import exist during instantiation and still work when first called.
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

const nativeInstantiate = WebAssembly.instantiate;

function installWorkerGlobals() {
	const globals = globalThis;

	globals.self = globals;
	// `module`/`exports` must not leak in: the worker is a classic script.
	globals.document = undefined;

	globals.addEventListener = (type, handler) => {
		if (type === 'message') messageHandler.current = handler;
	};
	globals.removeEventListener = () => {};
	globals.postMessage = (data) => outbound.push(data);

	// Capture worker logging instead of dumping "MODULE INITIALIZED" with the
	// whole module object; printed on failure by the test.
	globals.console = Object.create(realConsole);
	for (const level of ['log', 'warn', 'error', 'debug', 'info']) {
		globals.console[level] = (...args) => {
			logs.push(`[${level}] ${args.map(String).join(' ').slice(0, 400)}`);
		};
	}

	// The extension is a package on disk here; every URL the engine resolves is
	// relative to the bundled registry.
	const base = pathToFileURL(`${BERGAMOT}${path.sep}`);

	globals.location = {
		href: base.href,
		toString: () => base.href,
	};

	globals.importScripts = (...files) => {
		for (const file of files) {
			// eslint-disable-next-line no-eval
			(0, eval)(readFileSync(path.join(BERGAMOT, file), 'utf8'));
		}
	};

	globals.fetch = async (input) => {
		const url = input instanceof URL ? input : new URL(String(input), base);
		if (url.protocol !== 'file:') {
			throw new Error(`unexpected non-local fetch: ${url.href}`);
		}
		const body = readFileSync(fileURLToPath(url));
		return new Response(body, {
			headers: {
				'content-type': url.pathname.endsWith('.wasm')
					? 'application/wasm'
					: 'application/json',
			},
		});
	};

	// By default this harness bypasses the glue's `instantiateWasm` hook, so the
	// engine's own `linkFallbackIntGemm` never runs. That is a real blind spot:
	// it is exactly the path a browser takes. `--real-instantiate` exercises it.
	if (process.argv.includes('--real-instantiate')) {
		realConsole.log('using the glue閳ユ獨 own instantiateWasm path');
		return;
	}

	WebAssembly.instantiate = function (bytes, imports) {
		return nativeInstantiate(bytes, { ...imports, wasm_gemm: gemmModule });
	};
}

let serial = 0;
function call(name, args) {
	const id = ++serial;
	const before = outbound.length;

	return new Promise((resolve, reject) => {
		const started = Date.now();
		Promise.resolve(messageHandler.current({ data: { id, name, args } })).catch(reject);

		const poll = setInterval(() => {
			for (let i = before; i < outbound.length; i++) {
				const message = outbound[i];
				if (!message || message.id !== id) continue;

				clearInterval(poll);
				if (message.error) {
					const error = new Error(message.error.message);
					error.stack = message.error.stack;
					reject(error);
				} else {
					resolve(message.result);
				}
				return;
			}

			if (Date.now() - started > 120_000) {
				clearInterval(poll);
				reject(new Error(`timeout waiting for "${name}"`));
			}
		}, 5);
	});
}

/**
 * The default build ships no models, so this is usually skipped. It still holds
 * for a build made with `npm run fetch:models -- --pairs en-zh-Hans,zh-Hans-en`,
 * which is the case it is here to protect.
 */
const registryPath = REGISTRY;
const bundledPairs = existsSync(registryPath)
	? Object.keys(JSON.parse(readFileSync(registryPath, 'utf8')))
	: [];

test(
	'bundled worker translates English to Chinese',
	{ skip: !bundledPairs.includes('en\tzh-Hans') && 'no bundled en->zh-Hans model' },
	async () => {
		installWorkerGlobals();

		const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
		const key = Object.keys(registry).find((k) => k === 'en\tzh-Hans');
		if (!key) throw new Error(`registry has no en->zh-Hans entry; has: ${Object.keys(registry).join(', ')}`);
		const parts = registry[key];

	// `translator.worker.js` is a classic script; evaluate it as such rather
	// than through the ESM loader, so its top level really is the global scope.
	const source = readFileSync(WORKER_JS, 'utf8');
	const factory = new Function(source);
	factory();

	if (!messageHandler.current) {
		throw new Error('worker did not register a message listener');
	}
	realConsole.log(`worker loaded (${source.length}B)`);

	await call('initialize', [{ cacheSize: 0 }]);
	realConsole.log('initialize OK');

	// Models are referenced by URL and read by the worker itself, mirroring how
	// the extension avoids moving tens of megabytes between contexts.
	const fileUrl = (relative) =>
		pathToFileURL(path.resolve(path.dirname(REGISTRY), relative)).href;

	await call('loadTranslationModel', [
		{ from: 'en', to: 'zh-Hans' },
		{
			model: fileUrl(parts.model.name),
			shortlist: fileUrl(parts.lex.name),
			vocabs: [fileUrl(parts.srcvocab.name), fileUrl(parts.trgvocab.name)],
			qualityModel: null,
			config: {},
		},
	]);
	realConsole.log('loadTranslationModel OK');

	const responses = await call('translate', [
		{
			models: [{ from: 'en', to: 'zh-Hans' }],
			texts: [
				{ text: 'Hello world', html: false, qualityScores: false },
				{ text: 'The cat is on the table.', html: false, qualityScores: false },
			],
		},
	]);

	realConsole.log('translate OK');
	for (const response of responses) {
		realConsole.log(`  -> ${JSON.stringify(response?.target?.text)}`);
	}
	realConsole.log('--- worker logs ---');
	for (const line of logs) realConsole.log(`  ${line}`);

	// Output must actually be Chinese, not an echo of the input.
	const texts = responses.map((response) => response?.target?.text ?? '');
	if (!texts.some((text) => /[\u4e00-\u9fff]/.test(text))) {
		throw new Error(`no Chinese output produced: ${JSON.stringify(texts)}`);
	}
	},
);
