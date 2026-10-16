#!/usr/bin/env node
/**
 * Real-browser verification for Local Translator for Chromium.
 *
 * Loads the built extension into an existing Chromium/Chrome and drives a real
 * translation through the background service worker, the offscreen document and
 * the Bergamot engine. This is the only check that covers the Chromium-only
 * paths: hosting the worker in the offscreen document, and the `MessagePort`
 * channel that carries the multi-megabyte model buffers.
 *
 * Uses the Chrome DevTools Protocol over Node's built-in `WebSocket`; nothing is
 * installed and no browser is downloaded.
 *
 * Usage:
 *   node scripts/browser-e2e.test.mjs [build/chromium] [--browser <path>]
 *
 * If `--browser` is omitted, the usual install locations are probed.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);

/** Options that consume the following argument. */
const OPTIONS_WITH_VALUE = ['--browser', '--pair'];
const consumed = new Set();
for (const option of OPTIONS_WITH_VALUE) {
	const index = argv.indexOf(option);
	if (index >= 0) {
		consumed.add(index);
		consumed.add(index + 1);
	}
}

const browserFlag = argv.indexOf('--browser');
const explicitBrowser = browserFlag >= 0 ? argv[browserFlag + 1] : null;
const positional = argv.filter(
	(_arg, index) => !consumed.has(index) && !argv[index].startsWith('--'),
);
const TARGET = positional[0] ?? 'build/chromium';
const EXTENSION_PATH = path.resolve(ROOT, TARGET);

/** Language pair to exercise; override with `--pair en-de`. */
const pairFlag = argv.indexOf('--pair');
const PAIR = (pairFlag >= 0 ? argv[pairFlag + 1] : null) ?? 'en-zh-Hans';

// Registry keys are `<from>\t<to>`, so the record is located by tab, and the
// UI-facing codes are the parts before the first and after the second `-` only
// when the target is not script-qualified.
const [FROM, TO] = PAIR.split(/-/).length > 2
	? [PAIR.slice(0, PAIR.indexOf('-')), PAIR.slice(PAIR.indexOf('-') + 1)]
	: PAIR.split('-');
const PAIR_TSV = `${FROM}\t${TO}`;
const SAMPLE = /^zh/.test(FROM) ? '\u4f60\u597d\u4e16\u754c' : 'Hello world';
const UI_TO = /^zh/.test(TO) ? 'zh' : TO;

/** Safe embedding of a JS string literal inside the injected expression. */
const inject = (value) => JSON.stringify(value);

const BROWSER_CANDIDATES = [
	explicitBrowser,
	process.env.CHROME_PATH,
	path.join(
		process.env.LOCALAPPDATA ?? '',
		'Chromium/Application/chrome.exe',
	),
	path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
	path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
	path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
	path.join(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
	path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
	'/usr/bin/chromium',
	'/usr/bin/google-chrome',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const findBrowser = () => BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `http://127.0.0.1:<port>/json/list` until a service worker shows up. */
async function waitForExtension(port, timeoutMs = 60_000) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
			const worker = targets.find(
				(t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
			);
			if (worker?.webSocketDebuggerUrl) return worker;
		} catch {
			// DevTools endpoint not up yet.
		}
		await sleep(250);
	}

	throw new Error('timed out waiting for the extension service worker');
}

/** Poll the target list until a page with the given URL prefix exists. */
async function waitForPage(port, prefix, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
			const page = targets.find((t) => t.type === 'page' && t.url.startsWith(prefix));
			if (page?.webSocketDebuggerUrl) return page;
		} catch {
			// not ready
		}
		await sleep(250);
	}

	throw new Error(`timed out waiting for a page at ${prefix}`);
}

/**
 * Attach to every extension document that is not the service worker.
 *
 * The offscreen document hosts the translator worker and shows up as a
 * `background_page` target, so its console output is where engine diagnostics
 * and aborts actually appear.
 */
async function attachExtensionDocuments(port, extensionId, onClient, timeoutMs = 15_000) {
	const seen = new Set();
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
			for (const target of targets) {
				if (target.type !== 'page' && target.type !== 'background_page') continue;
				if (!target.url.startsWith(`chrome-extension://${extensionId}/`)) continue;
				if (seen.has(target.id) || !target.webSocketDebuggerUrl) continue;

				seen.add(target.id);
				onClient(await connect(target.webSocketDebuggerUrl), target.url);
			}
		} catch {
			// not ready
		}
		await sleep(200);
	}
}

/** Minimal CDP client over one target. */
async function connect(webSocketUrl) {
	const socket = new WebSocket(webSocketUrl);
	await new Promise((resolve, reject) => {
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('error', () => reject(new Error('CDP socket error')), {
			once: true,
		});
	});

	let serial = 0;
	const pending = new Map();
	const consoleMessages = [];

	socket.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		if (message.id && pending.has(message.id)) {
			const { resolve, reject } = pending.get(message.id);
			pending.delete(message.id);
			if (message.error) reject(new Error(message.error.message));
			else resolve(message.result);
			return;
		}

		// Capture worker console output for diagnostics.
		if (message.method === 'Runtime.consoleAPICalled') {
			const text = (message.params.args ?? [])
				.map((arg) => arg.value ?? arg.description ?? arg.type)
				.join(' ');
			consoleMessages.push(`[${message.params.type}] ${text}`);
		}
		if (message.method === 'Runtime.exceptionThrown') {
			const details = message.params.exceptionDetails;
			consoleMessages.push(
				`[exception] ${details.exception?.description ?? details.text}`,
			);
		}
	});

	const send = (method, params = {}) =>
		new Promise((resolve, reject) => {
			const id = ++serial;
			pending.set(id, { resolve, reject });
			socket.send(JSON.stringify({ id, method, params }));
		});

	await send('Runtime.enable');
	await send('Log.enable').catch(() => {});

	return { send, consoleMessages, close: () => socket.close() };
}

async function main() {
	const browserPath = findBrowser();
	if (!browserPath) {
		console.error(
			'No Chromium/Chrome found. Pass one explicitly:\n' +
				'  node scripts/browser-e2e.test.mjs build/chromium --browser "<path to chrome.exe>"',
		);
		process.exitCode = 1;
		return;
	}
	if (!existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
		console.error(`${TARGET} has no manifest.json; build first.`);
		process.exitCode = 1;
		return;
	}

	console.log(`browser:   ${browserPath}`);
	console.log(`extension: ${TARGET}`);

	const port = 9333;
	const profile = path.join(
		process.env.TEMP ?? '/tmp',
		`lt-chromium-profile-${Date.now()}`,
	);

	const args = [
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${profile}`,
		`--disable-extensions-except=${EXTENSION_PATH}`,
		`--load-extension=${EXTENSION_PATH}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-gpu',
		'--headless=new',
		'about:blank',
	];

	const child = spawn(browserPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
	const browserLog = [];
	child.stdout.on('data', (chunk) => browserLog.push(String(chunk)));
	child.stderr.on('data', (chunk) => browserLog.push(String(chunk)));

	let client = null;
	let pageClient = null;
	try {
		const worker = await waitForExtension(port);
		const extensionId = new URL(worker.url).host;
		console.log(`extension id: ${extensionId}`);

		// Attach to the service worker first so its console output is captured
		// from the start; the translation itself is driven from an extension page,
		// because `runtime.sendMessage` never delivers to its own sender.
		client = await connect(worker.webSocketDebuggerUrl);

		await client.send('Target.createTarget', {
			url: `chrome-extension://${extensionId}/pages/options/options.html`,
		});
		const page = await waitForPage(
			port,
			`chrome-extension://${extensionId}/pages/options/`,
		);
		pageClient = await connect(page.webSocketDebuggerUrl);

		// The offscreen document is where the translator worker actually runs, so
		// that is where engine diagnostics and aborts surface.
		const extraClients = [];
		await attachExtensionDocuments(port, extensionId, (extra, url) => {
			console.log(`attached: ${url}`);
			extraClients.push(extra);
		});

		const evaluation = await pageClient.send('Runtime.evaluate', {
			expression: `
				(async () => {
					const seen = [];
					try {
						// 1. Can the extension read its own model files, byte for byte?
						const registry = await (await fetch(
							browser.runtime.getURL('models/index.json')
						)).json();
						const key = ${inject(PAIR_TSV)};
						const parts = registry[key];
						seen.push('registry keys: ' + Object.keys(registry).join('|'));
						if (!parts) {
							return { ok: false, error: 'registry has no entry for ' + key, seen };
						}

						const integrity = {};
						for (const [part, file] of Object.entries(parts)) {
							const response = await fetch(browser.runtime.getURL('models/' + file.name));
							const buffer = await response.arrayBuffer();
							const digest = await crypto.subtle.digest('SHA-256', buffer);
							const hex = [...new Uint8Array(digest)]
								.map((b) => b.toString(16).padStart(2, '0'))
								.join('');
							integrity[part] = {
								status: response.status,
								bytes: buffer.byteLength,
								expectedBytes: file.size,
								hashMatches: hex === file.expectedSha256Hash,
							};
						}
						seen.push('integrity: ' + JSON.stringify(integrity));

						// 2. Translate through the extension's own protocol.
						const features = await browser.runtime.sendMessage({
							action: 'getTranslatorFeatures',
							data: undefined,
						});
						seen.push('features: ' + JSON.stringify(features));

						const translated = await browser.runtime.sendMessage({
							action: 'translate',
							data: { text: ${inject(SAMPLE)}, from: ${inject(FROM)}, to: ${inject(UI_TO)} },
						});

						return { ok: true, translated, integrity, seen };
					} catch (error) {
						return {
							ok: false,
							error: error && error.message ? error.message : String(error),
							stack: error && error.stack ? error.stack : null,
							seen,
						};
					}
				})()
			`,
			awaitPromise: true,
			returnByValue: true,
		});

		const result = evaluation.result?.value;

		console.log('--- diagnostics ---');
		for (const line of result?.seen ?? []) console.log(`  ${line}`);
		for (const line of pageClient.consoleMessages) console.log(`  [page] ${line}`);
		for (const line of client.consoleMessages) console.log(`  [sw] ${line}`);
		for (const extra of extraClients) {
			for (const line of extra.consoleMessages) console.log(`  [offscreen] ${line}`);
		}

		if (!result?.ok) {
			console.error(`\nTRANSLATION FAILED: ${result?.error}`);
			if (result?.stack) console.error(result.stack);
			process.exitCode = 1;
			return;
		}

		console.log(`\ntranslated: ${JSON.stringify(result.translated)}`);

		if (typeof result.translated !== 'string' || !/[\u4e00-\u9fff]/.test(result.translated)) {
			console.error('output is not Chinese');
			process.exitCode = 1;
			return;
		}

		console.log('PASS');
	} catch (error) {
		console.error(`browser test failed: ${error.message}`);
		if (browserLog.length) console.error(browserLog.join('').slice(-3000));
		process.exitCode = 1;
	} finally {
		pageClient?.close();
		for (const extra of extraClients ?? []) extra.close();
		client?.close();
		child.kill();
	}
}

main();
