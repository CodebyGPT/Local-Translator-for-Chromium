import {
	groupByLanguagePair,
	isUsablePair,
	missingParts,
	parseModelFilename,
	type CodeTable,
	type ModelFileEntry,
} from './detect';
import {
	hashBlob,
	putLanguagePair,
	putModelFile,
	type LanguagePairRecord,
	type ModelPart,
} from './storage';

export type ImportOutcome = {
	/** Language pairs that were imported and are usable. */
	imported: LanguagePairRecord[];
	/** Files that were ignored, with the reason. */
	skipped: Array<{ name: string; reason: string }>;
};

/**
 * Store a set of user-picked model files and register the language pairs they
 * form.
 *
 * The caller passes the raw `File`s from a picker; nothing is validated against
 * a remote source, so a corrupt or mismatched file is reported by the engine at
 * first use rather than here. What this does guarantee is that a pair is only
 * registered when every part the engine needs is present.
 */
export const importModelFiles = async (
	files: ArrayLike<File>,
	codeTable: CodeTable = {},
): Promise<ImportOutcome> => {
	const skipped: Array<{ name: string; reason: string }> = [];
	const entries: Array<ModelFileEntry<File>> = [];

	for (const file of Array.from(files)) {
		const info = parseModelFilename(file?.name);
		if (info === null) {
			skipped.push({
				name: file?.name ?? '(unnamed file)',
				reason: 'unrecognised model filename',
			});
			continue;
		}

		entries.push({ ...info, file });
	}

	if (entries.length === 0) {
		return { imported: [], skipped };
	}

	const groups = groupByLanguagePair(entries, codeTable);
	const imported: LanguagePairRecord[] = [];

	for (const [key, group] of groups) {
		if (!isUsablePair(group)) {
			const missing = missingParts(group).join(', ');
			group.entries.forEach((entry) =>
				skipped.push({
					name: entry.name,
					reason: `incomplete language pair ${group.from}->${group.to}; missing ${missing}`,
				}),
			);
			continue;
		}

		const parts: Partial<Record<ModelPart, string>> = {};

		for (const entry of group.entries) {
			const hash = await hashBlob(entry.file);
			await putModelFile({
				hash,
				name: entry.name,
				size: entry.file.size,
				blob: entry.file,
				importedAt: Date.now(),
			});
			parts[entry.part] = hash;
		}

		const record: LanguagePairRecord = {
			key,
			from: group.from,
			to: group.to,
			parts,
			source: 'imported',
			importedAt: Date.now(),
		};

		await putLanguagePair(record);
		imported.push(record);
	}

	return { imported, skipped };
};
