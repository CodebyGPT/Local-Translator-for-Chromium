/**
 * Integration test for the Bergamot translator wiring.
 *
 * Unlike the unit tests, this exercises the real `BergamotTranslator` class --
 * registry fetch, URL resolution against the extension package, model buffer
 * loading, batching, and the worker message protocol -- against the artifacts
 * that `scripts/fetch-engine.mjs` and `scripts/fetch-models.mjs` produce.
 *
 * `Worker` and `fetch` are bridged to the filesystem, so no browser is needed.
 *
 * Requires the build inputs to be present:
 *   npm run fetch:engine && npm run fetch:models
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// src/lib/translators/bergamot/__tests__ -> project root
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const BERGAMOT = path.join(ROOT, 'thirdparty', 'bergamot', 'build');
const MODELS = path.join(ROOT, 'models');
const EXTENSION_ORIGIN = 'chrome-extension://testextensionid/';

// Fail loudly instead of silently skipping: a missing artifact means this test
// proves nothing about the packaged extension.
const REQUIRED = [
	path.join(BERGAMOT, 'translator.worker.js'),
	path.join(BERGAMOT, 'bergamot-translator-worker.js'),
	path.join(BERGAMOT, 'bergamot-translator-worker.wasm'),
	path.join(MODELS, 'index.json'),
];

const missing = REQUIRED.filter((file) => !existsSync(file));
if (missing.length > 0) {
	throw new Error(
		`Bergamot integration test needs generated artifacts.\n` +
			`Missing:\n${missing.map((file) => `  - ${file}`).join('\n')}\n` +
			`Run: npm run fetch:engine && npm run fetch:models`,
	);
}

/** Map a URL the extension would use back to the file on disk. */
const toFile = (input: string | URL): string => {
	const url = new URL(String(input), EXTENSION_ORIGIN);
	if (url.protocol === 'file:') return fileURLToPath(url);

	// The shared test setup mocks `browser.runtime.getURL` with a
	// `moz-extension://` origin, so accept either extension scheme.
	if (url.protocol !== 'chrome-extension:' && url.protocol !== 'moz-extension:') {
		throw new Error(`test harness refuses to fetch ${url.href}`);
	}

	return path.join(ROOT, url.pathname.replace(/^\//, ''));
};

const fileResponse = (file: string) =>
	new Response(readFileSync(file), {
		headers: {
			'content-type': file.endsWith('.wasm') ? 'application/wasm' : 'application/json',
		},
	});

/**
 * Runs the built translator worker as a classic script, mirroring how the
 * offscreen document hosts it, and returns a `Worker`-shaped handle.
 *
 * The worker script needs a handful of worker globals to be reachable as free
 * variables (`location`, `importScripts`, `addEventListener`, `postMessage`,
 * `console`). They are installed on `globalThis` for the duration and restored
 * by `dispose`.
 */
function startWorkerScope(file: string) {
	const listeners = new Map<string, Set<(event: any) => void>>();
	const emit = (type: string, event: any) => {
		(listeners.get(type) ?? []).forEach((listener) => listener(event));
	};

	const saved = new Map<string, PropertyDescriptor | undefined>();
	const install = (name: string, value: unknown) => {
		saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			value,
			writable: true,
			configurable: true,
		});
	};

	const workerHref = pathToFileURL(path.join(BERGAMOT, 'worker.html')).href;

	install('location', { href: workerHref, toString: () => workerHref });
	install('self', globalThis);
	install('importScripts', (...files: string[]) => {
		for (const name of files) {
			// eslint-disable-next-line no-eval
			(0, eval)(readFileSync(path.join(path.dirname(file), name), 'utf8'));
		}
	});
	install('addEventListener', (type: string, listener: any) => {
		if (!listeners.has(type)) listeners.set(type, new Set());
		listeners.get(type)!.add(listener);
	});
	install('removeEventListener', (type: string, listener: any) => {
		listeners.get(type)?.delete(listener);
	});
	install('postMessage', () => {
		throw new Error('the worker must not call postMessage before a message arrives');
	});
	install('console', {
		log: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
		info: () => {},
	});

	// Evaluate as a classic script so its top level really is the global scope.
	// eslint-disable-next-line no-new-func
	new Function(readFileSync(file, 'utf8'))();

	if (!listeners.has('message')) {
		throw new Error('worker did not register a message listener');
	}

	return {
		addListener: (type: string, listener: (event: any) => void) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(listener);
		},
		removeListener: (type: string, listener: (event: any) => void) => {
			listeners.get(type)?.delete(listener);
		},
		/** Deliver a message to the worker and route its reply to `onReply`. */
		send: (message: any, onReply: (event: any) => void) => {
			install('postMessage', (data: any) => {
				setTimeout(() => onReply({ data }), 0);
			});
			setTimeout(() => emit('message', { data: message }), 0);
		},
		dispose: () => {
			for (const [name, descriptor] of saved) {
				if (descriptor) Object.defineProperty(globalThis, name, descriptor);
				else delete (globalThis as any)[name];
			}
		},
	};
}

describe('BergamotTranslator integration', () => {
	let originalFetch: typeof globalThis.fetch;
	let originalWorker: unknown;

	beforeAll(() => {
		originalFetch = globalThis.fetch;
		originalWorker = (globalThis as any).Worker;

		// Serve every extension URL from the built package.
		globalThis.fetch = (async (input: any) => {
			return fileResponse(toFile(input));
		}) as typeof fetch;

		(globalThis as any).Worker = class {
			private readonly scope = startWorkerScope(
				path.join(BERGAMOT, 'translator.worker.js'),
			);
			private readonly listeners = new Map<string, Set<(event: any) => void>>();

			constructor(_url: string) {}

			addEventListener(type: string, listener: (event: any) => void) {
				if (!this.listeners.has(type)) this.listeners.set(type, new Set());
				this.listeners.get(type)!.add(listener);
			}

			removeEventListener(type: string, listener: (event: any) => void) {
				this.listeners.get(type)?.delete(listener);
			}

			postMessage(message: any) {
				// The worker replies through its own `postMessage`; forward that
				// to the listeners registered here.
				this.scope.send(message, (event) => {
					(this.listeners.get('message') ?? []).forEach((listener) =>
						listener(event),
					);
				});
			}

			terminate() {
				this.scope.dispose();
			}
		} as any;
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
		(globalThis as any).Worker = originalWorker;
	});

	test('translates English to Chinese with the bundled model', async () => {
		const { BergamotTranslator } = await import('../BergamotTranslator');

		const languages = await BergamotTranslator.initSupportedLanguages();
		expect(languages).toContain('en');
		expect(languages).toContain('zh');

		const translator = new BergamotTranslator();
		const translated = await translator.translate('Hello world', 'en', 'zh');

		expect(typeof translated).toBe('string');
		// Output must be real Chinese, not an echo of the input.
		expect(translated).not.toBe('Hello world');
		expect(translated).toMatch(/[\u4e00-\u9fff]/);
	}, 120_000);
});
