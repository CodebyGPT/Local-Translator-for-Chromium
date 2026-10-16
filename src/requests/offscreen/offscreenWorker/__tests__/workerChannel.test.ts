/**
 * Unit tests for the offscreen worker port channel.
 *
 * The channel exists because model files (~44 MB `ArrayBuffer`s) cannot travel
 * over `runtime.sendMessage`: Chromium caps a message at 64 MiB, and the old
 * path also ran every buffer through `serialize()`, turning it into a
 * `number[]`. These tests pin the contract:
 *
 *   - payloads reach the worker untouched (no array conversion)
 *   - messages sent immediately after construction are not dropped
 *   - worker messages reach listeners registered on the handle
 *
 * A pair of connected fake `Runtime.Port`s stands in for the browser plumbing.
 */

import browser from 'webextension-polyfill';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { OffscreenWorkerChannel } from '../workerChannel';

const CHANNEL_NAME = 'bergamot-translator-worker';

/**
 * Two ports connected to each other. `postMessage` on one delivers
 * synchronously to the other's message listeners, like a real port pair.
 */
function createPortPair(name = CHANNEL_NAME) {
	const makeEnd = () => {
		const messageListeners = new Set<(message: any) => void>();
		const disconnectListeners = new Set<() => void>();

		const end = {
			name,
			/** Messages this end received from its peer. */
			received: [] as any[],
			/** Messages this end sent to its peer. */
			sent: [] as any[],
			peer: null as any,

			postMessage(message: any) {
				end.sent.push(message);
				end.peer.received.push(message);
				end.peer.messageListeners.forEach((listener: (m: any) => void) =>
					listener(message),
				);
			},
			disconnect() {
				end.disconnected = true;
				end.disconnectListeners.forEach((listener: () => void) => listener());
			},
			disconnected: false,
			messageListeners,
			disconnectListeners,
			onMessage: {
				addListener: (listener: (message: any) => void) => messageListeners.add(listener),
				removeListener: (listener: (message: any) => void) =>
					messageListeners.delete(listener),
			},
			onDisconnect: {
				addListener: (listener: () => void) => disconnectListeners.add(listener),
				removeListener: (listener: () => void) => disconnectListeners.delete(listener),
			},
		};

		return end;
	};

	const background = makeEnd();
	const offscreen = makeEnd();
	background.peer = offscreen;
	offscreen.peer = background;

	return { background, offscreen };
}

/**
 * Wire `browser.runtime.connect` to return `background`, and expose the
 * registered `onConnect` listeners so the test can hand them `offscreen`.
 */
function stubRuntime(background: any) {
	const connectListeners: Array<(port: any) => void> = [];

	vi.spyOn(browser.runtime, 'connect').mockReturnValue(background);
	vi.spyOn(browser.runtime.onConnect, 'addListener').mockImplementation(
		(listener: any) => {
			connectListeners.push(listener);
		},
	);
	vi.spyOn(browser.runtime.onConnect, 'removeListener').mockImplementation(() => {});

	return connectListeners;
}

/**
 * Stand up the background half of the channel with a fake `Worker` on the other
 * end, mirroring what `connectOffscreenWorker` does in the offscreen document:
 * create the worker on `create`, ack with `ready`, then forward everything else.
 */
function connectBothEnds() {
	const { background, offscreen } = createPortPair();
	const connectListeners = stubRuntime(background);

	const workerMessages: any[] = [];

	const nativeWorker = globalThis.Worker;
	let worker: { postMessage: (message: any) => void } | null = null;

	(globalThis as any).Worker = class {
		constructor(public url: string) {}

		addEventListener() {}
		removeEventListener() {}
		terminate() {}

		postMessage(message: any) {
			workerMessages.push(message);
		}
	};

	offscreen.onMessage.addListener((message: any) => {
		if (message?.type === 'create') {
			worker = new (globalThis.Worker as any)(message.url);
			offscreen.postMessage({ type: 'ready' });
			return;
		}

		worker?.postMessage(message);
	});

	for (const listener of connectListeners) listener(offscreen);

	return {
		channel: new OffscreenWorkerChannel('translator.worker.js'),
		offscreen,
		workerMessages,
		restoreWorker: () => {
			(globalThis as any).Worker = nativeWorker;
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('offscreen worker port channel', () => {
	test('passes model-sized buffers through without reformatting them', async () => {
		const { channel, workerMessages, restoreWorker } = connectBothEnds();

		// 44 MB, the size of the bundled en->zh model.
		const model = new ArrayBuffer(44 * 1024 * 1024);
		new Uint8Array(model)[0] = 7;

		channel.postMessage({
			id: 1,
			name: 'loadTranslationModel',
			args: [{ from: 'en', to: 'zh-Hans' }, { model }],
		});

		await vi.waitFor(() => {
			expect(workerMessages).toHaveLength(1);
		});

		const delivered = workerMessages[0];
		expect(delivered.name).toBe('loadTranslationModel');
		// The key assertion: still an ArrayBuffer, not a number[].
		expect(delivered.args[1].model).toBeInstanceOf(ArrayBuffer);
		expect(delivered.args[1].model.byteLength).toBe(model.byteLength);
		expect(new Uint8Array(delivered.args[1].model)[0]).toBe(7);

		restoreWorker();
	});

	test('queues messages until the offscreen side reports ready', async () => {
		const { background, offscreen } = createPortPair();
		stubRuntime(background);

		const channel = new OffscreenWorkerChannel('translator.worker.js');

		// Sent before `ready`: must be held, not dropped.
		channel.postMessage({ id: 1, name: 'initialize', args: [{}] });
		expect(offscreen.received.filter((m) => m?.name === 'initialize')).toHaveLength(0);

		offscreen.postMessage({ type: 'ready' });

		await vi.waitFor(() => {
			expect(offscreen.received.filter((m) => m?.name === 'initialize')).toHaveLength(1);
		});
	});

	test('forwards worker replies to message listeners', async () => {
		const { channel, offscreen } = connectBothEnds();

		const events: any[] = [];
		channel.addEventListener('message', (event: any) => events.push(event));

		// The offscreen document relays the worker's response verbatim.
		offscreen.postMessage({ id: 1, result: { target: { text: '你好' } } });

		await vi.waitFor(() => {
			expect(events).toHaveLength(1);
		});
		// The `ready` handshake must not be mistaken for a worker reply.
		expect(events[0].data.result.target.text).toBe('你好');
	});
});
