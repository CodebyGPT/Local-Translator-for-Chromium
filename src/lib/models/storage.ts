import * as IDB from 'idb';

/**
 * Storage for translation models the user imports.
 *
 * Models are far too large to travel through extension messaging (Chromium caps
 * `runtime.sendMessage` at 64 MiB and a `MessagePort` silently drops the
 * contents of large `ArrayBuffer`s), so they are stored here and read back by
 * whoever needs the bytes: the translator worker opens this same database in
 * its own context.
 *
 * Files are keyed by content hash, so importing the same file twice stores it
 * once, and a language pair record only references hashes.
 */

const DB_NAME = 'translationModels';
const DB_VERSION = 1;

export type ModelPart = 'model' | 'vocab' | 'srcvocab' | 'trgvocab' | 'lex' | 'qualityModel';

export const MODEL_PARTS: ModelPart[] = [
	'model',
	'vocab',
	'srcvocab',
	'trgvocab',
	'lex',
	'qualityModel',
];

export type StoredModelFile = {
	hash: string;
	name: string;
	size: number;
	blob: Blob;
	importedAt: number;
};

export type LanguagePairRecord = {
	/** Registry key: `<from>\t<to>`. */
	key: string;
	from: string;
	to: string;
	parts: Partial<Record<ModelPart, string>>;
	source: string;
	importedAt: number;
};

interface Schema extends IDB.DBSchema {
	files: {
		key: string;
		value: StoredModelFile;
	};
	pairs: {
		key: string;
		value: LanguagePairRecord;
	};
}

let database: Promise<IDB.IDBPDatabase<Schema>> | null = null;

export const openModelDatabase = () => {
	if (database === null) {
		database = IDB.openDB<Schema>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('files')) {
					db.createObjectStore('files', { keyPath: 'hash' });
				}
				if (!db.objectStoreNames.contains('pairs')) {
					db.createObjectStore('pairs', { keyPath: 'key' });
				}
			},
		});
	}

	return database;
};

export const hashBlob = async (blob: Blob): Promise<string> => {
	const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
};

export const putModelFile = async (file: StoredModelFile) => {
	const db = await openModelDatabase();
	await db.put('files', file);
};

export const getModelFileBlob = async (hash: string): Promise<Blob | null> => {
	const db = await openModelDatabase();
	return (await db.get('files', hash))?.blob ?? null;
};

export const getModelFile = async (hash: string): Promise<StoredModelFile | null> => {
	const db = await openModelDatabase();
	return (await db.get('files', hash)) ?? null;
};

export const putLanguagePair = async (pair: LanguagePairRecord) => {
	const db = await openModelDatabase();
	await db.put('pairs', pair);
};

export const listLanguagePairs = async (): Promise<LanguagePairRecord[]> => {
	const db = await openModelDatabase();
	return db.getAll('pairs');
};

export const deleteLanguagePair = async (key: string) => {
	const db = await openModelDatabase();
	const pair = await db.get('pairs', key);

	await db.delete('pairs', key);
	if (!pair) return;

	// Drop files that no remaining pair references.
	const remaining = await db.getAll('pairs');
	const inUse = new Set<string>();
	remaining.forEach((entry) => {
		Object.values(entry.parts).forEach((hash) => hash && inUse.add(hash));
	});

	for (const hash of Object.values(pair.parts)) {
		if (hash && !inUse.has(hash)) await db.delete('files', hash);
	}
};

export const clearLanguagePairs = async () => {
	const db = await openModelDatabase();
	await db.clear('pairs');
	await db.clear('files');
};

/** Total bytes held by imported models. */
export const getImportedSize = async (): Promise<number> => {
	const db = await openModelDatabase();
	const files = await db.getAll('files');
	return files.reduce((total, file) => total + file.size, 0);
};

/**
 * Read a model file for the engine.
 *
 * Accepts the URL scheme the backing produces for imported models
 * (`model-store://<hash>`) so the worker can fetch both bundled and imported
 * models through one code path.
 */
export const readModelFile = async (hash: string): Promise<ArrayBuffer | null> => {
	const blob = await getModelFileBlob(hash);
	if (blob === null) return null;

	return blob.arrayBuffer();
};

export const MODEL_STORE_SCHEME = 'model-store:';

export const makeModelStoreUrl = (hash: string) => `${MODEL_STORE_SCHEME}//${hash}`;

/** Extract the hash from a `model-store://` URL, or `null` for other URLs. */
export const parseModelStoreUrl = (url: string): string | null => {
	if (!url.startsWith(MODEL_STORE_SCHEME)) return null;

	return url.slice(MODEL_STORE_SCHEME.length).replace(/^\/\//, '') || null;
};

/**
 * Fetch a `model-store://` URL as an extension-local resource.
 *
 * Used by the translator worker so imported models load through the same code
 * path as the ones shipped in the package.
 */
export const fetchModelStoreUrl = async (url: string): Promise<ArrayBuffer> => {
	const hash = parseModelStoreUrl(url);
	if (hash === null) {
		throw new Error(`Not a model store URL: ${url}`);
	}

	const buffer = await readModelFile(hash);
	if (buffer === null) {
		throw new Error(`Imported model file is missing from storage: ${hash}`);
	}

	return buffer;
};
