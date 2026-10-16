import { listLanguagePairs, readModelFile, type LanguagePairRecord } from './storage';

/**
 * Bridge between the translator engine and the models the user imported.
 *
 * The engine lives in its own worker bundle and has no storage of its own, so
 * the host application (`BergamotTranslator`) supplies two things:
 *
 *   - `importedModelsProvider`: which pairs exist
 *   - `importedModelFetch`: how to read one of their files
 *
 * Both run in the translator worker's context, which shares the extension
 * origin, so they reach the same database the import wrote to.
 */

export const importedModelsProvider = (): Promise<LanguagePairRecord[]> =>
	listLanguagePairs();

/**
 * Resolve a `model-store://<hash>` URL to bytes.
 *
 * This runs where the engine is, which is the whole point: the bytes are read
 * next to the code that consumes them and never travel through the extension's
 * message channel (Chromium caps that at 64 MiB, and a `MessagePort` drops the
 * contents of large buffers).
 */
export const importedModelFetch = async (url: string): Promise<ArrayBuffer> => {
	const buffer = await readModelFile(url.replace(/^model-store:\/\//, ''));
	if (buffer === null) {
		throw new Error(`Imported model file is missing from storage: ${url}`);
	}

	return buffer;
};
