import { listLanguagePairs, type LanguagePairRecord } from './storage';

/**
 * Bridge between the translator engine and the models the user imported.
 *
 * The engine needs to know which directions exist; it then reads the files
 * themselves straight out of the extension's storage, from its own worker
 * context (see `readImportedModelFile` in `BergamotTranslatorWorker`). Only the
 * list is published here, because the bytes must not cross a context boundary:
 * Chromium caps `runtime.sendMessage` at 64 MiB, drops the contents of large
 * `ArrayBuffer`s over a `MessagePort`, and cannot carry a function into a worker
 * through `postMessage` at all.
 */
export const importedModelsProvider = (): Promise<LanguagePairRecord[]> =>
	listLanguagePairs();
