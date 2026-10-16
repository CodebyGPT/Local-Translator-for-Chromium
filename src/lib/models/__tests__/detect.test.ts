import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
	groupByLanguagePair,
	isUsablePair,
	missingParts,
	parseModelFilename,
	splitPairCode,
} from '../detect';

/**
 * The model importer decides which language pair a file belongs to from its
 * name alone, because the files carry no other metadata until the engine reads
 * them. Mozilla's published names are the contract, so they are asserted here.
 */
describe('model file detection', () => {
	test('parses the published file names', () => {
		expect(parseModelFilename('model.enzh.intgemm.alphas.bin')).toEqual({
			name: 'model.enzh.intgemm.alphas.bin',
			part: 'model',
			code: 'enzh',
		});

		expect(parseModelFilename('lex.50.50.enzh.s2t.bin')).toEqual({
			name: 'lex.50.50.enzh.s2t.bin',
			part: 'lex',
			code: 'enzh',
		});

		expect(parseModelFilename('srcvocab.enzh.spm')?.part).toBe('srcvocab');
		expect(parseModelFilename('trgvocab.enzh.spm')?.part).toBe('trgvocab');
		expect(parseModelFilename('vocab.zhen.spm')?.part).toBe('vocab');
	});

	test('ignores files that are not model files', () => {
		expect(parseModelFilename('manifest.json')).toBeNull();
		expect(parseModelFilename('README.md')).toBeNull();
		expect(parseModelFilename('')).toBeNull();
	});

	/**
	 * Files that crossed a message boundary can arrive as `{}`: extension
	 * messaging JSON-serialises its payload. That used to crash the import with
	 * `Cannot read properties of undefined (reading 'toLowerCase')`.
	 */
	test('survives a name that did not make it across the message boundary', () => {
		expect(parseModelFilename(undefined as unknown as string)).toBeNull();
		expect(parseModelFilename(null as unknown as string)).toBeNull();
		expect(parseModelFilename({} as unknown as string)).toBeNull();
	});

	test('splits a pair code into languages', () => {
		expect(splitPairCode('enzh')).toEqual({ from: 'en', to: 'zh' });
		expect(splitPairCode('ende')).toEqual({ from: 'en', to: 'de' });
		expect(splitPairCode('zhen')).toEqual({ from: 'zh', to: 'en' });
	});

	test('uses the registry code table for script-qualified languages', () => {
		// `zh-Hans` cannot be recovered from `enzh` by splitting the string.
		const table = { enzh: { from: 'en', to: 'zh-Hans' } };
		expect(splitPairCode('enzh', table)).toEqual({ from: 'en', to: 'zh-Hans' });
		expect(splitPairCode('enzh')).toEqual({ from: 'en', to: 'zh' });
	});

	test('groups files into language pairs', () => {
		const files = [
			'model.enzh.intgemm.alphas.bin',
			'lex.50.50.enzh.s2t.bin',
			'srcvocab.enzh.spm',
			'trgvocab.enzh.spm',
			'model.zhen.intgemm.alphas.bin',
			'lex.50.50.zhen.s2t.bin',
			'vocab.zhen.spm',
		]
			.map((name) => parseModelFilename(name))
			.filter((entry) => entry !== null)
			.map((entry) => ({ ...entry, file: entry.name }));

		const groups = groupByLanguagePair(files);
		expect([...groups.keys()].sort()).toEqual(['en\tzh', 'zh\ten']);

		const enZh = groups.get('en\tzh');
		expect(enZh && isUsablePair(enZh)).toBe(true);
		expect(enZh && missingParts(enZh)).toEqual([]);
	});

	test('reports which parts an incomplete pair is missing', () => {
		const files = ['model.enzh.intgemm.alphas.bin']
			.map((name) => parseModelFilename(name))
			.filter((entry) => entry !== null)
			.map((entry) => ({ ...entry, file: entry.name }));

		const group = groupByLanguagePair(files).get('en\tzh');
		expect(group && isUsablePair(group)).toBe(false);
		expect(group && missingParts(group)).toEqual(['lex', 'vocab (or srcvocab + trgvocab)']);
	});

	/**
	 * The importer runs in the settings page and the reader in the worker, so the
	 * IndexedDB schema is duplicated between them. Renaming a store there without
	 * updating the worker here would silently break every imported model.
	 */
	test('the worker reads the same database and store the importer writes', () => {
		const worker = readFileSync(
			// Vitest resolves `import.meta.url` against its own transformed module
			// layout, so anchor to the project root instead.
			'thirdparty/bergamot/src/worker/BergamotTranslatorWorker.ts',
			'utf8',
		);

		expect(worker).toContain(`indexedDB.open('translationModels'`);
		expect(worker).toContain(`.transaction('files', 'readonly')`);
	});
});
