import browser, { Runtime } from 'webextension-polyfill';

/**
 * Channel between a translator worker living in the offscreen document and the
 * code that drives it.
 *
 * Why not the request/response plumbing used elsewhere (`buildBackendRequest`)?
 * Because that goes through `runtime.sendMessage`, and Chromium caps a single
 * message at 64 MiB. The engine is fed whole model files as `ArrayBuffer`s --
 * `model.enzh.intgemm.alphas.bin` alone is ~44 MB -- and the shared serializer
 * turns each buffer into a `number[]`, inflating a 44 MB model into tens of
 * millions of JSON numbers. The result is:
 *
 *   Message exceeded maximum allowed size of 64MiB
 *
 * A `MessagePort` is structured-clone based and has no such limit, so the large
 * payloads travel over a dedicated port. Only the initial connection uses the
 * extension messaging API.
 */

const CHANNEL_NAME = 'bergamot-translator-worker';

/** Requests carry a `name` identifying the worker method. */
const isMethodCall = (message: unknown): boolean =>
	typeof message === 'object' &&
	message !== null &&
	typeof (message as { name?: unknown }).name === 'string';

/**
 * Background side: drives the worker through the port.
 *
 * Shaped like a `Worker` (`postMessage` + `addEventListener('message')`) because
 * `TranslatorBacking` treats it as one.
 */
export class OffscreenWorkerChannel implements Worker {
	public onmessage: Worker['onmessage'] = null;
	public onmessageerror: Worker['onmessageerror'] = null;
	public onerror: Worker['onerror'] = null;

	private readonly port: Runtime.Port;

	/**
	 * Resolves once the offscreen document has created the worker.
	 *
	 * `postMessage` awaits this so messages sent right after construction are
	 * not dropped and stay in order.
	 */
	private readonly ready: Promise<void>;

	private readonly listeners: Record<string, Set<(...args: any[]) => any>> = {};

	constructor(url: string) {
		this.port = browser.runtime.connect({ name: CHANNEL_NAME });

		this.ready = new Promise<void>((resolve, reject) => {
			this.port.onMessage.addListener((message: any) => {
				if (message?.type === 'ready') {
					resolve();
					return;
				}

				this.dispatch('message', { data: message });
			});

			this.port.onDisconnect.addListener(() => {
				reject(new Error('Offscreen worker channel disconnected'));
			});

			this.port.postMessage({ type: 'create', url });
		});

		// A rejection nobody awaits must not surface as an unhandled rejection;
		// `postMessage` and the disconnect handler report it instead.
		this.ready.catch(() => {});
	}

	public addEventListener: Worker['addEventListener'] = (
		eventName: string,
		callback: (...args: any) => any,
	) => {
		const set = this.listeners[eventName] ?? new Set();
		set.add(callback);
		this.listeners[eventName] = set;
	};

	public removeEventListener: Worker['removeEventListener'] = (
		eventName: string,
		callback: (...args: any) => any,
	) => {
		this.listeners[eventName]?.delete(callback);
	};

	public postMessage(args: any) {
		void this.ready.then(() => {
			// `args` keeps its ArrayBuffers: the port clones them natively.
			this.port.postMessage(args);
		});
	}

	public terminate() {
		this.port.disconnect();
	}

	public dispatchEvent(_event: Event): boolean {
		throw new Error('Method "dispatchEvent" is not implemented yet for OffscreenWorker');
	}

	private dispatch(eventName: string, event: unknown) {
		this.listeners[eventName]?.forEach((listener) => listener(event));
	}
}

/**
 * Offscreen side: receives the port from the background and connects it to a
 * real `Worker`, forwarding messages both ways untouched.
 */
export const connectOffscreenWorker = () => {
	browser.runtime.onConnect.addListener((port: Runtime.Port) => {
		if (port.name !== CHANNEL_NAME) return;

		let worker: Worker | null = null;

		port.onMessage.addListener((message: any) => {
			if (message?.type === 'create') {
				worker = new Worker(message.url);

				worker.addEventListener('message', (event) => {
					port.postMessage((event as MessageEvent).data);
				});

				worker.addEventListener('messageerror', (event) => {
					port.postMessage({
						type: 'error',
						error: { message: String((event as MessageEvent).data) },
					});
				});

				// The worker script evaluates a top-level listener, so it is
				// ready to receive method calls as soon as it exists.
				port.postMessage({ type: 'ready' });
				return;
			}

			if (!isMethodCall(message)) return;
			worker?.postMessage(message);
		});

		port.onDisconnect.addListener(() => {
			worker?.terminate();
			worker = null;
		});
	});
};
