/**
 * This file imported from a bergamot project
 * Source: https://github.com/browsermt/bergamot-translator/blob/82c276a15c23a40bc7e21e8a1e0a289a6ce57017/wasm/module/worker/translator-worker.js
 */

import {
	BergamotTranslatorWorkerAPI,
	BergamotTranslatorWorkerOptions,
} from '../worker/types';

import {
	ImportedModelFetch,
	ImportedModelPair,
	LanguagesDirection,
	MODEL_STORE_SCHEME,
	ModelBuffers,
	ModelConfig,
	ModelFiles,
	TranslationModel,
	TranslationModelFileReference,
} from '../types';

type Registry = TranslationModel[];

export type BackingOptions = BergamotTranslatorWorkerOptions & {
	workerUrl: string;
	/**
	 * URL of the model registry bundled with this extension.
	 *
	 * Defaults to the extension-local `models/index.json`. This project is
	 * offline-only, so the registry is always read from a local file and never
	 * fetched from a remote host.
	 */
	registryUrl?: string;
	downloadTimeout?: number;
	pivotLanguage?: string;
	onerror?: (err: ErrorEvent) => void;
};

/**
 * Wrapper around bergamot-translator loading and model management.
 */
export class TranslatorBacking {
	private registryUrl;
	private workerUrl;
	private downloadTimeout;
	private registry;
	private buffers;
	private pivotLanguage;
	private models;
	private onerror;

	private options;
	constructor({ workerUrl, registryUrl, onerror, ...options }: BackingOptions) {
		this.options = options;

		this.registryUrl = registryUrl || 'models/index.json';

		this.workerUrl = workerUrl;

		this.downloadTimeout = this.options.downloadTimeout ?? 60000;

		/**
		 * registry of all available models and their urls
		 * @type {Promise<Model[]>}
		 */
		this.registry = this.loadModelRegistry();

		/**
		 * Map of downloaded model data files as buffers per model.
		 * @type {Map<{from:string,to:string}, Promise<Map<string,ArrayBuffer>>>}
		 */
		this.buffers = new Map<string, Promise<ModelBuffers>>();

		/**
		 * @type {string?}
		 */
		this.pivotLanguage =
			'pivotLanguage' in this.options ? this.options.pivotLanguage : 'en';

		/**
		 * A map of language-pairs to a list of models you need for it.
		 * @type {Map<{from:string,to:string}, Promise<{from:string,to:string}[]>>}
		 */
		this.models = new Map<string, Promise<TranslationModel[]>>();

		/**
		 * Error handler for all errors that are async, not tied to a specific
		 * call and that are unrecoverable.
		 * @type {(error: Error)}
		 */
		this.onerror =
			onerror || ((err) => console.error('WASM Translation Worker error:', err));
	}

	protected createWorker = (url: string) => {
		return new Worker(url);
	}

	/**
	 * Loads a worker thread, and wraps it in a message passing proxy. I.e. it
	 * exposes the entire interface of TranslationWorker here, and all calls
	 * to it are async. Do note that you can only pass arguments that survive
	 * being copied into a message.
	 * @return {Promise<{worker:Worker, exports:Proxy<TranslationWorker>}>}
	 */
	async loadWorker() {
		const worker = this.createWorker(this.workerUrl);

		/**
		 * Incremental counter to derive request/response ids from.
		 */
		let serial = 0;

		/**
		 * Map of pending requests
		 * @type {Map<number,{accept:(any), reject:(Error)}>}
		 */
		const pending = new Map();

		// Function to send requests
		const call = (name: string | symbol, ...args: any[]) =>
			new Promise((accept, reject) => {
				const id = ++serial;
				pending.set(id, {
					accept,
					reject,
					callsite: {
						// for debugging which call caused the error
						message: `${String(name)}(${args
							.map((arg) => String(arg))
							.join(', ')})`,
						stack: new Error().stack,
					},
				});
				worker.postMessage({ id, name, args });
			});

		// ... receive responses
		worker.addEventListener('message', function ({ data: { id, result, error } }) {
			if (!pending.has(id)) {
				console.debug('Received message with unknown id:', arguments[0]);
				throw new Error(
					`BergamotTranslator received response from worker to unknown call '${id}'`,
				);
			}

			const { accept, reject, callsite } = pending.get(id);
			pending.delete(id);

			if (error !== undefined)
				reject(
					Object.assign(new Error(), error, {
						message: error.message + ` (response to ${callsite.message})`,
						stack: error.stack
							? `${error.stack}\n${callsite.stack}`
							: callsite.stack,
					}),
				);
			else accept(result);
		});

		// ... and general errors
		worker.addEventListener('error', this.onerror.bind(this));

		// Await initialisation. This will also nicely error out if the WASM
		// runtime fails to load.
		await call('initialize', this.options);

		if (this.importedModelFetch) {
			// A function cannot travel through `postMessage`, so the resolver for
			// imported models is attached to the worker after it is constructed.
			await call('setImportedModelResolver', [this.importedModelFetch]);
		}

		/**
		 * Little wrapper around the message passing api of Worker to make it
		 * easy to await a response to a sent message. This wraps the worker in
		 * a Proxy so you can treat it as if it is an instance of the
		 * TranslationWorker class that lives inside the worker. All function
		 * calls to it are transparently passed through the message passing
		 * channel.
		 */
		return {
			worker,
			exports: new Proxy(
				{},
				{
					get(_target, name, _receiver) {
						// Prevent this object from being marked "then-able"
						if (name !== 'then')
							return (...args: any[]) => call(name, ...args);

						return undefined;
					},
				},
			) as BergamotTranslatorWorkerAPI,
		};
	}

	/**
	 * Loads the model registry bundled with the extension.
	 *
	 * Keys are `<from>\t<to>` so script-qualified codes such as `zh-Hans` stay
	 * unambiguous. The registry is a local file written by
	 * `scripts/fetch-models.mjs`.
	 */
	async loadModelRegistry(): Promise<Registry> {
		const response = await fetch(this.registryUrl, { credentials: 'omit' });
		const registry = (await response.json()) as Record<
			string,
			Record<string, TranslationModelFileReference>
		>;

		return Object.entries(registry).map(([key, files]) => {
			const [from, to] = key.split('\t');
			if (!from || !to) {
				throw new Error(`Invalid registry entry "${key}"`);
			}

			return { from, to, files };
		});
	}

	/**
	 * Gets or resolves a translation model's file references. Caching wrapper
	 * around `resolveModelFiles()`.
	 * @param {{from:string, to:string}}
	 */
	getModelFiles({ from, to }: LanguagesDirection): Promise<ModelFiles> {
		const key = JSON.stringify({ from, to });

		if (!this.modelFiles.has(key)) {
			const promise = this.resolveModelFiles({ from, to });

			// set the promise so we return the same promise when its still pending
			this.modelFiles.set(key, promise);

			// But if loading fails, remove the promise again so we can try again later
			promise.catch((_err) => this.modelFiles.delete(key));
		}

		const filesPromise = this.modelFiles.get(key);
		if (filesPromise === undefined) {
			throw new Error('Translation model files promise not found');
		}

		return filesPromise;
	}

	private modelFiles = new Map<string, Promise<ModelFiles>>();

	/**
	 * Gets or loads translation model data. Caching wrapper around
	 * `loadTranslationModel()`.
	 * @param {{from:string, to:string}}
	 * @return {Promise<{
	 *   model: ArrayBuffer,
	 *   vocab: ArrayBuffer,
	 *   shortlist: ArrayBuffer,
	 *   qualityModel: ArrayBuffer?
	 * }>}
	 */
	getTranslationModel({ from, to }: LanguagesDirection): Promise<ModelBuffers> {
		const key = JSON.stringify({ from, to });

		if (!this.buffers.has(key)) {
			const promise = this.loadTranslationModel({ from, to });

			// set the promise so we return the same promise when its still pending
			this.buffers.set(key, promise);

			// But if loading fails, remove the promise again so we can try again later
			promise.catch((_err) => this.buffers.delete(key));
		}

		const modelPromise = this.buffers.get(key);
		if (modelPromise === undefined) {
			throw new Error('Translation model promise not found');
		}

		return modelPromise;
	}

	async getModelFile(
		part: string,
		file: TranslationModelFileReference,
		direction: LanguagesDirection,
	) {
		// Special case where qualityModel is not part of the model, and this
		// should also catch the `config` case.
		if (file === undefined || file.name === undefined) return [part, null] as const;

		try {
			const arrayBuffer = await this.fetch(file.name);
			return [part, arrayBuffer] as const;
		} catch (cause) {
			throw new Error(
				`Could not read ${file.name} for ${direction.from}->${direction.to} model`,
			);
		}
	}

	/**
	 * Downloads a translation model and returns a set of
	 * ArrayBuffers. These can then be passed to a TranslationWorker thread
	 * to instantiate a TranslationModel inside the WASM vm.
	 * @param {{from:string, to:string}}
	 * @param {{signal:AbortSignal?}?}
	 * @return {Promise<{
	 *   model: ArrayBuffer,
	 *   vocab: ArrayBuffer,
	 *   shortlist: ArrayBuffer,
	 *   qualityModel: ArrayBuffer?
	 *   config: string?
	 * }>}
	 */
	async loadTranslationModel({ from, to }: LanguagesDirection): Promise<ModelBuffers> {
		performance.mark(`loadTranslationModule.${JSON.stringify({ from, to })}`);

		// Find that model in the registry which will tell us about its files
		const entry = (await this.registry).find(
			(model) => model.from == from && model.to == to,
		);

		if (!entry) throw new Error(`No model for '${from}' -> '${to}'`);

		const files = entry.files;

		// Download all files mentioned in the registry entry
		const buffers = Object.fromEntries(
			await Promise.all(
				Object.entries(files).map(async ([part, file]) => {
					return this.getModelFile(part, file, { from, to });
				}),
			),
		);

		performance.measure(
			'loadTranslationModel',
			`loadTranslationModule.${JSON.stringify({ from, to })}`,
		);

		let vocabs: ArrayBuffer[];
		if (buffers.vocab) {
			vocabs = [buffers.vocab];
		} else if (buffers.trgvocab && buffers.srcvocab) {
			vocabs = [buffers.srcvocab, buffers.trgvocab];
		} else {
			throw new Error(
				`Could not identify vocab files for ${from}->${to} model among: ${Array.from(
					Object.keys(files),
				).join(' ')}`,
			);
		}

		const config: ModelConfig = {};

		// For the Ukrainian models we need to override the gemm-precision
		if (files.model.name.endsWith('intgemm8.bin')) {
			config['gemm-precision'] = 'int8shiftAll';
		}

		// If quality estimation is used, we need to turn off skip-cost. Turning
		// this off causes quite the slowdown.
		if (files.qualityModel) {
			config['skip-cost'] = false;
		}

		// Allow the registry to also specify marian configuration parameters
		if (files.config) {
			Object.assign(config, files.config);
		}

		if (!buffers.model || !buffers.lex) {
			throw new Error();
		}

		// Translate to generic bergamot-translator format that also supports
		// separate vocabularies for input & output language, and calls 'lex'
		// a more descriptive 'shortlist'.
		return {
			model: buffers.model,
			shortlist: buffers.lex,
			vocabs,
			qualityModel: buffers.qualityModel ?? null,
			config,
		};
	}

	/**
	 * Resolve a language pair to the URLs of its model files, without reading
	 * them.
	 *
	 * This is what the extension uses: the model files ship inside the extension
	 * package, so whoever needs the bytes fetches them directly from their own
	 * context. Shipping tens of megabytes through inter-context messaging is both
	 * unnecessary and unreliable -- Chromium cannot carry an `ArrayBuffer` of
	 * this size through the extension messaging APIs, and the port channel loses
	 * large buffer contents.
	 */
	async resolveModelFiles({ from, to }: LanguagesDirection): Promise<ModelFiles> {
		// Models the user imported take precedence over the bundled ones, so a
		// newer or better model can be dropped in without rebuilding.
		const imported = await this.findImportedModel({ from, to });
		if (imported !== null) return imported;

		// Find that model in the registry which will tell us about its files
		const entry = (await this.registry).find(
			(model) => model.from == from && model.to == to,
		);

		if (!entry) throw new Error(`No model for '${from}' -> '${to}'`);

		const files = entry.files;

		let vocabs: string[];
		if (files.vocab) {
			vocabs = [this.resolveUrl(files.vocab.name)];
		} else if (files.trgvocab && files.srcvocab) {
			vocabs = [
				this.resolveUrl(files.srcvocab.name),
				this.resolveUrl(files.trgvocab.name),
			];
		} else {
			throw new Error(
				`Could not identify vocab files for ${from}->${to} model among: ${Array.from(
					Object.keys(files),
				).join(' ')}`,
			);
		}

		if (!files.model || !files.lex) {
			throw new Error(`Model or shortlist file missing for ${from}->${to}`);
		}

		const config: ModelConfig = {};

		// For the Ukrainian models we need to override the gemm-precision
		if (files.model.name.endsWith('intgemm8.bin')) {
			config['gemm-precision'] = 'int8shiftAll';
		}

		// If quality estimation is used, we need to turn off skip-cost. Turning
		// this off causes quite the slowdown.
		if (files.qualityModel) {
			config['skip-cost'] = false;
		}

		// Allow the registry to also specify marian configuration parameters
		if (files.config) {
			Object.assign(config, files.config);
		}

		return {
			model: this.resolveUrl(files.model.name),
			shortlist: this.resolveUrl(files.lex.name),
			vocabs,
			qualityModel: files.qualityModel
				? this.resolveUrl(files.qualityModel.name)
				: null,
			config,
			// Firefox Nightly exposes a native intgemm module that is worth
			// linking when the caller asked for it.
			useNativeIntGemm: this.options.useNativeIntGemm === true,
		};
	}

	/**
	 * Look up a model the user imported, if any.
	 *
	 * Imported models live in the host application's storage, addressed with a
	 * `model-store://` URL. The host supplies the lookup
	 * (`importedModelsProvider`) and the resolver that turns those URLs into
	 * bytes (`importedModelFetch`) when the worker asks for them, so this file
	 * stays free of storage details and the worker needs no storage access.
	 */
	protected async findImportedModel({
		from,
		to,
	}: LanguagesDirection): Promise<ModelFiles | null> {
		if (this.importedModelsProvider === undefined) return null;

		let imported;
		try {
			imported = await this.importedModelsProvider();
		} catch (error) {
			console.warn('Could not read imported models', error);
			return null;
		}

		const record = imported.find((entry) => entry.from === from && entry.to === to);
		if (!record) return null;

		const url = (part: string) => {
			const key = record.parts[part];
			if (key === undefined) {
				throw new Error(
					`Imported ${from}->${to} model is missing its "${part}" file`,
				);
			}

			return `${MODEL_STORE_SCHEME}//${key}`;
		};

		const vocabs = record.parts.vocab
			? [url('vocab')]
			: [url('srcvocab'), url('trgvocab')];

		return {
			model: url('model'),
			shortlist: url('lex'),
			vocabs,
			qualityModel: record.parts.qualityModel ? url('qualityModel') : null,
			config: {},
			useNativeIntGemm: this.options.useNativeIntGemm === true,
		};
	}

	/**
	 * Supplies the language pairs the user imported.
	 *
	 * Set by the host application; unset means "no imported models".
	 */
	importedModelsProvider?: () => Promise<ImportedModelPair[]>;

	/**
	 * Resolves a `model-store://` URL to bytes.
	 *
	 * Set by the host application and handed to the worker, which has no storage
	 * of its own. The worker falls back to plain `fetch` when this is unset,
	 * which is what bundled models use.
	 */
	importedModelFetch?: ImportedModelFetch;

	/**
	 * Reads a model file.
	 *
	 * `url` is either an absolute extension URL, a path relative to the registry
	 * file, or a `model-store://` URL for an imported model. Nothing here can
	 * leave the extension origin, so a missing model fails loudly instead of
	 * silently reaching out to a server.
	 * @param {string} url
	 * @returns {Promise<ArrayBuffer>}
	 */
	async fetch(url: string) {
		if (url.startsWith(MODEL_STORE_SCHEME)) {
			if (!this.importedModelFetch) {
				throw new Error(`No resolver for imported model URL ${url}`);
			}

			return this.importedModelFetch(url);
		}

		const resolved = this.resolveUrl(url);

		// Rig up a timeout cancel signal for our fetch
		const controller = new AbortController();
		const abort = () => controller.abort();

		const timeout = this.downloadTimeout
			? setTimeout(abort, this.downloadTimeout)
			: null;

		try {
			const options: RequestInit = {
				credentials: 'omit',
				signal: controller.signal,
			};

			return fetch(resolved, options).then((rsp) => {
				if (!rsp.ok) {
					throw new Error(`Could not read ${resolved} (${rsp.status})`);
				}
				return rsp.arrayBuffer();
			});
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}

	/**
	 * Resolve a registry entry path against the registry location, so models
	 * always load from the same directory the registry was shipped in.
	 *
	 * `registryUrl` must be absolute; the constructor requires it.
	 */
	resolveUrl(url: string): string {
		return new URL(url, this.registryUrl).href;
	}

	/**
	 * Languages with at least one bundled model, in registry order.
	 */
	async getSupportedLanguages(): Promise<string[]> {
		const registry = await this.registry;
		const languages = new Set<string>();

		registry.forEach(({ from, to }) => {
			languages.add(from);
			languages.add(to);
		});

		return Array.from(languages);
	}

	/**
	 * Crappy named method that gives you a list of models to translate from
	 * one language into the other. Generally this will be the same as you
	 * just put in if there is a direct model, but it could return a list of
	 * two models if you need to pivot through a third language.
	 * Returns just [{from:str,to:str}...]. To be used something like this:
	 * ```
	 * const models = await this.getModels(from, to);
	 * models.forEach(({from, to}) => {
	 *   const buffers = await this.loadTranslationModel({from,to});
	 *   [TranslationWorker].loadTranslationModel({from,to}, buffers)
	 * });
	 * ```
	 * @returns {Promise<TranslationModel[]>}
	 */
	getModels({ from, to }: LanguagesDirection) {
		const key = JSON.stringify({ from, to });

		// Note that the `this.models` map stores Promises. This so that
		// multiple calls to `getModels` that ask for the same model will
		// return the same promise, and the actual lookup is only done once.
		// The lookup is async because we need to await `this.registry`
		if (!this.models.has(key)) this.models.set(key, this.findModels(from, to));

		const model = this.models.get(key);
		if (!model) {
			throw new Error('Model not found');
		}

		return model;
	}

	/**
	 * Find model (or model pair) to translate from `from` to `to`.
	 * @param {string} from
	 * @param {string} to
	 * @returns {Promise<TranslationModel[]>}
	 */
	async findModels(from: string, to: string) {
		const registry = await this.registry;

		const availableLanguages = new Set<string>();
		registry.forEach(({ from, to }) => {
			availableLanguages.add(from);
			availableLanguages.add(to);
		});

		const resolvedFrom = this.matchLanguage(from, availableLanguages);
		const resolvedTo = this.matchLanguage(to, availableLanguages);

		const direct: TranslationModel[] = [],
			outbound: TranslationModel[] = [],
			inbound: TranslationModel[] = [];

		registry.forEach((model) => {
			if (model.from === resolvedFrom && model.to === resolvedTo)
				direct.push(model);
			else if (model.from === resolvedFrom && model.to === this.pivotLanguage)
				outbound.push(model);
			else if (model.to === resolvedTo && model.from === this.pivotLanguage)
				inbound.push(model);
		});

		if (direct.length) return [direct[0]];

		if (outbound.length && inbound.length) return [outbound[0], inbound[0]];

		// Name what is actually bundled: "no model" is almost always a model set
		// that was not fetched, and the bare message hides that.
		const bundled = registry
			.map(({ from: f, to: t }) => `${f}->${t}`)
			.join(', ');

		throw new Error(
			`No model available to translate from '${from}' to '${to}' ` +
				`(resolved to '${resolvedFrom}'->'${resolvedTo}'; bundled models: ${bundled || 'none'})`,
		);
	}

	/**
	 * Resolve a requested language to one that actually has a bundled model.
	 *
	 * Models are released per script for Chinese (`zh-Hans`, `zh-Hant`) while
	 * the UI and language detection work with the plain `zh` code, so `zh`
	 * resolves to Simplified Chinese when it is available.
	 */
	protected matchLanguage(language: string, available: Set<string>): string {
		if (available.has(language)) return language;
		if (!language.startsWith('zh')) return language;

		return (
			(available.has('zh-Hans') ? 'zh-Hans' : undefined) ??
			Array.from(available).find((code) => code.startsWith('zh')) ??
			language
		);
	}
}
