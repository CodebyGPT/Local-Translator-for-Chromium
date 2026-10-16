import { isEqual } from 'lodash';
import { TranslatorConstructor } from 'anylang/translators';

import { createSelector } from '../../lib/effector/createSelector';
import { BergamotTranslator } from '../../lib/translators/bergamot/BergamotTranslator';
import {
	createPromiseWithControls,
	PromiseWithControls,
} from '../../lib/utils/createPromiseWithControls';
import { AppConfigType } from '../../types/runtime';

import { ObservableAsyncStorage } from '../ConfigStorage/ConfigStorage';
import { TranslatorManager } from './TranslatorManager';

/**
 * Translators embedded in this extension.
 *
 * Offline-only: the single embedded translator is the local Bergamot WASM
 * engine. There is no cloud translator and no custom translator loader.
 */
export const embeddedTranslators = {
	BergamotTranslator,
} as const;

export type TranslatorsMap = Record<string, TranslatorConstructor>;

/**
 * Background features manager
 */
export class Background {
	private readonly config: ObservableAsyncStorage<AppConfigType>;
	constructor(config: ObservableAsyncStorage<AppConfigType>) {
		this.config = config;
	}

	private translateManager: TranslatorManager | null = null;
	private translateManagerPromise: PromiseWithControls<TranslatorManager> | null = null;
	public async getTranslateManager() {
		if (this.translateManager === null) {
			// Create promise to await configuring instance
			if (this.translateManagerPromise === null) {
				const promiseWithControls =
					createPromiseWithControls<TranslatorManager>();

				// Set promise
				this.translateManagerPromise = promiseWithControls;

				// Clear promise
				promiseWithControls.promise.finally(() => {
					if (promiseWithControls === this.translateManagerPromise) {
						this.translateManagerPromise = null;
					}
				});
			}

			return this.translateManagerPromise.promise;
		}

		return this.translateManager;
	}

	public async start() {
		const $config = await this.config.getObservableStore();
		const $translateManagerConfig = createSelector(
			$config,
			({ scheduler, translatorModule, cache }) => ({
				scheduler,
				translatorModule,
				cache,
			}),
			{
				updateFilter: (update, state) => !isEqual(update, state),
			},
		);

		// Read the bundled model registry before anything asks for the
		// available languages.
		await BergamotTranslator.initSupportedLanguages();

		// Build translators list
		const translators: TranslatorsMap = embeddedTranslators;

		// Update config of translate manager
		$translateManagerConfig.watch((config) => {
			if (this.translateManager === null) {
				this.translateManager = new TranslatorManager(config, translators);

				// Return a scheduler instance for awaiters
				if (this.translateManagerPromise !== null) {
					this.translateManagerPromise.resolve(this.translateManager);
				}
				return;
			}

			this.translateManager.setConfig(config);
		});
	}
}
