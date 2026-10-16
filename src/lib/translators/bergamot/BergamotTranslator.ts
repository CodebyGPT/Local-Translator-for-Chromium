import browser from 'webextension-polyfill';

import { BatchTranslator } from '../../../../thirdparty/bergamot/src/frontend/BatchTranslator';
import { detectLanguage, getMessage } from '../../language';
import { importedModelsProvider } from '../../models/importedModels';
import { listLanguagePairs } from '../../models/storage';

import { TranslatorBackingWithCache } from './TranslatorBackingWithCache';

/**
 * Path of the model registry shipped with the extension.
 *
 * Written by `scripts/fetch-models.mjs` together with the model files it
 * describes. This extension is offline-only: the registry and every model file
 * are read from the extension package, never from the network.
 */
export const MODEL_REGISTRY_PATH = 'models/index.json';

/**
 * Collapse a registry language code to the plain code used by the UI.
 *
 * Models are released per script for Chinese (`zh-Hans`, `zh-Hant`) while the
 * rest of the extension, and `browser.i18n.detectLanguage`, work with `zh`.
 */
const toUiLanguage = (code: string) => (code.startsWith('zh') ? 'zh' : code);

export class BergamotTranslator {
	static translatorName = getMessage('common_offlineTranslator', 'Bergamot');
	static isRequiredKey = () => false;

	private readonly translator;
	constructor() {
		const workerUrl = browser.runtime.getURL(
			'thirdparty/bergamot/translator.worker.js',
		);
		const backing = new TranslatorBackingWithCache({
			workerUrl,
			registryUrl: browser.runtime.getURL(MODEL_REGISTRY_PATH),
			// This error handler do nothing, but it's required to `translate` method correct handle exceptions
			// With no error handler here we cannot to catch an error when worker does not exists
			onerror(err) {
				console.warn(
					'BergamotTranslator: error in TranslatorBackingWithCache',
					err,
				);
			},
		});

		// Models the user imported live in the extension's own storage. The engine
		// needs to know which directions exist; it reads the files themselves, so
		// nothing else has to be handed across the worker boundary.
		backing.importedModelsProvider = importedModelsProvider;

		this.translator = new BatchTranslator(backing, {
			onerror(err) {
				console.warn('BergamotTranslator: error in BatchTranslator', err);
			},
		});
	}

	translate = async (text: string, from: string, to: string) => {
		if (from === 'auto') {
			const langs = BergamotTranslator.getSupportedLanguages();
			const detectedLanguage = await detectLanguage(text);
			if (detectedLanguage !== null && langs.includes(detectedLanguage)) {
				from = detectedLanguage;
			} else {
				// Use most popular content language or first of list
				const defaultLang =
					to !== 'en' ? 'en' : langs.find((lang) => lang !== to);
				from = defaultLang ?? 'en';
			}
		}

		if (from === to) return text;

		const response = this.translator.translate({
			from,
			to,
			text,
			html: false,
			priority: 0,
		});

		return response.then((response) => response.target.text);
	};

	translateBatch = (texts: string[], from: string, to: string) =>
		Promise.all(texts.map((text) => this.translate(text, from, to)));

	getLengthLimit = () => 5000;
	getRequestsTimeout = () => 100;
	checkLimitExceeding = (text: string) => {
		const textLength = !Array.isArray(text)
			? text.length
			: text.reduce((len, text) => len + text.length, 0);

		return textLength - this.getLengthLimit();
	};

	static isSupportedAutoFrom = () => true;

	/**
	 * Languages that have a bundled model, in plain UI codes.
	 *
	 * The list becomes available after `initSupportedLanguages()` resolves,
	 * which happens during background startup. Until then only English is
	 * reported, since it is always required as the pivot language.
	 */
	private static supportedLanguages: string[] = ['en'];

	/**
	 * Publish the languages that have a model, bundled or imported.
	 *
	 * A model the user imported counts just as much as one shipped in the
	 * package, so both sources are folded into one list.
	 */
	public static async initSupportedLanguages(): Promise<string[]> {
		const registryUrl = browser.runtime.getURL(MODEL_REGISTRY_PATH);
		const languages = new Set<string>(['en']);

		try {
			const response = await fetch(registryUrl, { credentials: 'omit' });
			if (!response.ok) {
				throw new Error(`${response.status} ${response.statusText}`);
			}

			const registry = (await response.json()) as Record<string, unknown>;

			Object.keys(registry).forEach((key) => {
				const [from, to] = key.split('\t');
				if (from) languages.add(toUiLanguage(from));
				if (to) languages.add(toUiLanguage(to));
			});
		} catch (error) {
			// The bundled registry is optional by design: the extension ships
			// without models and the user adds them. Only report a genuinely
			// broken registry, not the empty one.
			console.warn(
				`Could not read the bundled model registry at ${registryUrl}. ` +
					'Run `npm run fetch:models -- --pairs …` to bundle models, or import ' +
					'them from the settings page.',
				error,
			);
		}

		try {
			const importedPairs = await listLanguagePairs();
			importedPairs.forEach(({ from, to }) => {
				languages.add(toUiLanguage(from));
				languages.add(toUiLanguage(to));
			});
		} catch (error) {
			console.warn('Could not read imported models', error);
		}

		BergamotTranslator.supportedLanguages = Array.from(languages);

		return BergamotTranslator.supportedLanguages;
	}

	static getSupportedLanguages = (): string[] =>
		BergamotTranslator.supportedLanguages;
}
