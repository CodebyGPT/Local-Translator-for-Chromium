import { ImportedModelFetch, LanguagesDirection, ModelFiles } from '../types';

export type BergamotTranslatorWorkerOptions = {
	cacheSize?: number;
	useNativeIntGemm?: boolean;
};

/**
 * Interface of translator instance
 */
export type IBergamotTranslatorWorker = {
	initialize: (options?: BergamotTranslatorWorkerOptions) => Promise<void>;

	/**
	 * Attach the resolver for `model-store://` URLs (imported models).
	 *
	 * Separate from `initialize` because a function cannot survive the worker
	 * message channel, so it is bound on the worker instance by the host.
	 */
	setImportedModelResolver: (resolver: ImportedModelFetch) => void;

	hasTranslationModel: (model: LanguagesDirection) => boolean;
	loadTranslationModel: (
		model: LanguagesDirection,
		files: ModelFiles,
	) => Promise<void>;
	freeTranslationModel: (model: LanguagesDirection) => void;

	translate: (request: {
		models: LanguagesDirection[];
		texts: { text: string; html: boolean; qualityScores?: boolean }[];
	}) => { target: { text: string } }[];
};

/**
 * Worker API used with async messages, so any method call are async
 */
export type BergamotTranslatorWorkerAPI = {
	[K in keyof IBergamotTranslatorWorker]: IBergamotTranslatorWorker[K] extends (
		...args: infer Args
	) => infer Result
		? (...args: Args) => Promise<Result>
		: never;
};
