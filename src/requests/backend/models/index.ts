import {
	clearLanguagePairs,
	deleteLanguagePair,
	getImportedSize,
	listLanguagePairs,
} from '../../../lib/models/storage';
import { importModelFiles } from '../../../lib/models/import';
import { BergamotTranslator } from '../../../lib/translators/bergamot/BergamotTranslator';
import { buildBackendRequest } from '../../utils/requestBuilder';

/**
 * Re-read the model sources and republish the available languages.
 *
 * The language list is what the UI offers, so it has to be rebuilt after an
 * import or delete; otherwise a newly imported pair stays invisible until the
 * background restarts.
 */
export const [refreshModelsFactory, refreshModels] = buildBackendRequest<
	void,
	string[]
>('models.refresh', {
	factoryHandler:
		() =>
		async () => {
			return BergamotTranslator.initSupportedLanguages();
		},
});

/** Language pairs the user imported, plus how much space they use. */
export const [getImportedModelsFactory, getImportedModels] = buildBackendRequest(
	'models.list',
	{
		factoryHandler:
			() =>
			async () => {
				const [pairs, size] = await Promise.all([
					listLanguagePairs(),
					getImportedSize(),
				]);

				return {
					pairs: pairs.map(({ key, from, to, parts }) => ({
						key,
						from,
						to,
						parts: Object.keys(parts),
					})),
					size,
				};
			},
	},
);

/**
 * Import model files the user picked.
 *
 * The files are `File` values straight from an `<input type="file">`, which
 * survive structured clone. Only metadata crosses this boundary -- the bytes go
 * into the extension's own storage and are read back by the engine in place.
 */
export const [importModelsFactory, importModels] = buildBackendRequest<
	{ files: File[] },
	{
		imported: Array<{ from: string; to: string }>;
		skipped: Array<{ name: string; reason: string }>;
	}
>('models.import', {
	factoryHandler:
		() =>
		async ({ files }) => {
			const outcome = await importModelFiles(files);

			return {
				imported: outcome.imported.map(({ from, to }) => ({ from, to })),
				skipped: outcome.skipped,
			};
		},
});

export const [deleteImportedModelFactory, deleteImportedModel] = buildBackendRequest<
	string,
	void
>('models.delete', {
	factoryHandler:
		() =>
		async (key) => {
			await deleteLanguagePair(key);
		},
});

export const [clearImportedModelsFactory, clearImportedModels] = buildBackendRequest<
	void,
	void
>('models.clear', {
	factoryHandler:
		() =>
		async () => {
			await clearLanguagePairs();
		},
});
