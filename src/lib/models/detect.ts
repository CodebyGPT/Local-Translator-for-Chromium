import { MODEL_PARTS, type ModelPart } from './storage';

/**
 * Work out which language pair an imported model file belongs to, and which part
 * of the model it is.
 *
 * Mozilla publishes models with a predictable filename shape:
 *
 *   model.enzh.intgemm.alphas.bin      -> part `model`,  code `enzh`
 *   lex.50.50.enzh.s2t.bin             -> part `lex`,    code `enzh`
 *   srcvocab.enzh.spm                  -> part `srcvocab`, code `enzh`
 *   vocab.zhen.spm                     -> part `vocab`,  code `zhen`
 *
 * The code joins a source and a target language (`enzh` = `en` -> `zh`), but the
 * split is ambiguous on its own (`enzh` could be `en`+`zh` or `enzh`+``), and
 * Chinese is script-qualified upstream (`zh-Hans`), so a code table generated
 * from the model registry resolves it exactly. The `--pairs` the build fetched
 * are the source of that table; without it we fall back to the two-letter split.
 */

export type ParsedModelFile = {
	name: string;
	part: ModelPart;
	/** Language pair code as it appears in the filename, e.g. `enzh`. */
	code: string;
};

/** Filename shapes we understand, longest prefix first. */
const PART_PREFIXES: Array<{ prefix: string; part: ModelPart }> = [
	{ prefix: 'srcvocab.', part: 'srcvocab' },
	{ prefix: 'trgvocab.', part: 'trgvocab' },
	{ prefix: 'vocab.', part: 'vocab' },
	{ prefix: 'qualityModel.', part: 'qualityModel' },
	{ prefix: 'lex.', part: 'lex' },
	{ prefix: 'model.', part: 'model' },
];

export const isModelPart = (value: string): value is ModelPart =>
	(MODEL_PARTS as string[]).includes(value);

/**
 * Parse `name` into its part and pair code, or return `null` when the name does
 * not look like a model file we can use.
 */
export const parseModelFilename = (name: string): ParsedModelFile | null => {
	const lower = name.toLowerCase();

	for (const { prefix, part } of PART_PREFIXES) {
		if (!lower.startsWith(prefix)) continue;

		const rest = name.slice(prefix.length);
		const segments = rest.split('.');

		// `lex.50.50.enzh.s2t.bin` carries version segments before the code.
		const codeSegment = segments.find((segment) => /^[a-z]{4,}(-[A-Za-z]+)?$/i.test(segment));
		if (!codeSegment) return null;

		return { name, part, code: codeSegment };
	}

	return null;
};

/** Language codes that can appear in a pair code, from the registry. */
export type CodeTable = Record<string, { from: string; to: string }>;

/**
 * Split a pair code into source and target language.
 *
 * `table` maps codes the build has seen (`enzh` -> `en`/`zh-Hans`). Codes that
 * are not in it fall back to the first two characters, which is right for the
 * plain two-letter languages.
 */
export const splitPairCode = (
	code: string,
	table: CodeTable = {},
): { from: string; to: string } | null => {
	const known = table[code];
	if (known) return { from: known.from, to: known.to };

	const match = /^([A-Za-z]{2})([A-Za-z]{2,})(-[A-Za-z]+)?$/.exec(code);
	if (!match) return null;

	return { from: match[1].toLowerCase(), to: (match[2] + (match[3] ?? '')).toLowerCase() };
};

/** A parsed model file, optionally with the `File` it came from. */
export type ModelFileEntry<F = unknown> = ParsedModelFile & { file: F };

export type LanguagePairGroup<F = unknown> = {
	from: string;
	to: string;
	/** Files present for this pair; later files win for a repeated part. */
	entries: Array<ModelFileEntry<F>>;
};

/**
 * Group parsed files into one group per language pair.
 *
 * `extraCodeTable` lets a caller supply codes learned from the bundled registry,
 * which the extension does so a model published for a script-qualified language
 * (`zh-Hans`) is recognised.
 */
export const groupByLanguagePair = <F>(
	files: Array<ModelFileEntry<F>>,
	extraCodeTable: CodeTable = {},
): Map<string, LanguagePairGroup<F>> => {
	const groups = new Map<string, LanguagePairGroup<F>>();

	for (const file of files) {
		const pair = splitPairCode(file.code, extraCodeTable);
		if (pair === null) continue;

		const key = `${pair.from}\t${pair.to}`;
		const group = groups.get(key) ?? { from: pair.from, to: pair.to, entries: [] };

		// A repeated part (two `model` files for one pair) would make the import
		// ambiguous, so the last one wins rather than both being stored.
		const existingIndex = group.entries.findIndex((entry) => entry.part === file.part);
		if (existingIndex >= 0) group.entries.splice(existingIndex, 1);

		group.entries.push(file);
		groups.set(key, group);
	}

	return groups;
};

/**
 * Is this group usable as a translation model?
 *
 * The engine needs a model and a shortlist, plus either one merged vocabulary or
 * a separate source/target pair.
 */
export const isUsablePair = <F>(group: LanguagePairGroup<F>): boolean => {
	const parts = new Set(group.entries.map((entry) => entry.part));
	const hasVocab = parts.has('vocab') || (parts.has('srcvocab') && parts.has('trgvocab'));

	return parts.has('model') && parts.has('lex') && hasVocab;
};

/** Which required parts a group is missing, for a useful error message. */
export const missingParts = <F>(group: LanguagePairGroup<F>): string[] => {
	const parts = new Set(group.entries.map((entry) => entry.part));
	const missing: string[] = [];

	if (!parts.has('model')) missing.push('model');
	if (!parts.has('lex')) missing.push('lex');
	if (!parts.has('vocab') && !(parts.has('srcvocab') && parts.has('trgvocab'))) {
		missing.push('vocab (or srcvocab + trgvocab)');
	}

	return missing;
};
