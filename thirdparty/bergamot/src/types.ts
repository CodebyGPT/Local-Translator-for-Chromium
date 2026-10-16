export type LanguagesDirection = { from: string; to: string };

export type TranslationModelFileReference = {
	/**
	 * Actual content is a URL to a file
	 */
	name: string;
	/**
	 * Size in bytes
	 */
	size: number;
	/**
	 * Content hash
	 */
	expectedSha256Hash: string;
};

export type TranslationModel = {
	from: string;
	to: string;
	files: Record<string, TranslationModelFileReference>;
};

export type ModelConfig = Record<string, string | boolean>;

/**
 * URL scheme for a model file the user imported.
 *
 * Imported models live in the host application's storage rather than the
 * extension package, so they cannot be fetched by URL like a bundled model. The
 * host supplies a resolver (`importedModelFetch`) and this scheme is what marks
 * a URL as needing it.
 */
export const MODEL_STORE_SCHEME = 'model-store:';

/** A language pair the host application has imported. */
export type ImportedModelPair = {
	from: string;
	to: string;
	/** Model part -> opaque storage key, e.g. `{ model: '<hash>', lex: '<hash>' }`. */
	parts: Record<string, string | undefined>;
};

/** Resolve a `model-store://<key>` URL to bytes. Supplied by the host. */
export type ImportedModelFetch = (url: string) => Promise<ArrayBuffer>;

/**
 * Where a model's files live, as URLs.
 *
 * The extension ships models inside its own package and the user may import
 * more, so the context that actually needs the bytes fetches them itself.
 * Passing the buffers between contexts is not viable: Chromium cannot carry an
 * `ArrayBuffer` of tens of megabytes through `runtime.sendMessage`, and large
 * buffers lose their contents over a long-lived `MessagePort`.
 */
export type ModelFiles = {
	model: string;
	shortlist: string;
	vocabs: string[];
	qualityModel: string | null;
	config?: ModelConfig;
	useNativeIntGemm?: boolean;
};

export type ModelBuffers = {
	model: ArrayBuffer;
	shortlist: ArrayBuffer;
	vocabs: ArrayBuffer[];
	qualityModel: ArrayBuffer | null;
	config?: ModelConfig;
};
