import { isLanguageCodeISO639v1 } from 'anylang/languages';
import {
	IScheduler,
	Scheduler,
	SchedulerWithCache,
} from 'anylang/scheduling';
import { TranslatorConstructor, TranslatorInstanceMembers } from 'anylang/translators';

import { AppConfigType } from '../../../types/runtime';

import { TranslatorsCacheStorage } from '../TranslatorsCacheStorage';
import { TranslatorsMap } from '..';

export type Config = Pick<AppConfigType, 'translatorModule' | 'scheduler' | 'cache'>;

/**
 * Build and manage a translation scheduler
 */
export class TranslatorManager {
	private config: Config;
	private translators: TranslatorsMap;
	constructor(config: Config, translators: TranslatorsMap) {
		this.config = config;
		this.translators = translators;
	}

	public setConfig(config: Config) {
		this.config = config;
		this.getTranslationSchedulerInstance(true);
	}

	public setTranslators(translators: TranslatorsMap) {
		this.translators = translators;
		this.getTranslationSchedulerInstance(true);
	}

	public getTranslatorFeatures() {
		const translatorClass = this.getTranslatorClass();
		return {
			supportedLanguages: translatorClass
				.getSupportedLanguages()
				.filter((lang) => isLanguageCodeISO639v1(lang)),
			isSupportAutodetect: translatorClass.isSupportedAutoFrom(),
		};
	}

	/**
	 * Return map with available translators
	 */
	public getTranslators(): TranslatorsMap {
		return this.translators;
	}

	public getTranslator(): TranslatorInstanceMembers {
		return this.getTranslatorInstance(false);
	}

	/**
	 * Return configured translation scheduler
	 */
	public getScheduler() {
		return this.getTranslationSchedulerInstance();
	}

	private schedulerInstance: IScheduler | null = null;
	private getTranslationSchedulerInstance(forceCreate = false) {
		if (this.schedulerInstance === null || forceCreate) {
			const translator = this.getTranslatorInstance(true);

			const { useCache, ...schedulerConfig } = this.config.scheduler;

			const scheduler = new Scheduler(translator, schedulerConfig);

			let schedulerInstance: IScheduler = scheduler;
			if (useCache) {
				// Wrap scheduler by cache
				const cacheInstance = this.getCacheInstance();
				schedulerInstance = new SchedulerWithCache(scheduler, cacheInstance);
			}

			this.schedulerInstance = schedulerInstance;
		}

		return this.schedulerInstance;
	}

	private translator: TranslatorInstanceMembers | null = null;
	private getTranslatorInstance(forceCreate: boolean): TranslatorInstanceMembers {
		if (!forceCreate && this.translator !== null) return this.translator;

		const translatorClass = this.getTranslatorClass();
		const instance: TranslatorInstanceMembers = new translatorClass();

		this.translator = instance;

		return instance;
	}

	private getCacheInstance() {
		const { translatorModule, cache } = this.config;
		return new TranslatorsCacheStorage(translatorModule, cache);
	}

	private getTranslatorClass(): TranslatorConstructor {
		const { translatorModule } = this.config;

		const translators = this.getTranslators();
		const translatorClass = translators[translatorModule];
		if (translatorClass === undefined) {
			throw new Error(`Not found translator "${translatorModule}"`);
		}

		return translatorClass;
	}
}
