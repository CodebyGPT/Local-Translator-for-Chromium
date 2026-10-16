#!/usr/bin/env node
/**
 * Offline checks for the pieces this fork actually changed:
 *
 *   1. Model acquisition/selection (`scripts/fetch-models.mjs`)
 *   2. The bundled registry the extension reads at runtime
 *
 * No test framework on purpose. Run it directly (the `node --test` runner
 * spawns subprocesses, which is blocked in the DSH Windows sandbox):
 *
 *   node scripts/models.test.mjs
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { MODEL_PARTS, selectRecords } from './fetch-models.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(ROOT, 'models', 'index.json');

/**
 * Registry keys are `<from>\t<to>`; the runtime splits them the same way.
 */
const parseRegistryKey = (key) => key.split('\t');

/**
 * Mirrors `BergamotTranslator.initSupportedLanguages`: collapse Chinese script
 * variants to the `zh` code the UI and language detection use.
 */
const toUiLanguage = (code) => (code.startsWith('zh') ? 'zh' : code);

const record = (overrides) => ({
	id: `${overrides.sourceLanguage}-${overrides.targetLanguage}-${overrides.fileType}-${overrides.architecture ?? 'base'}-${overrides.version ?? '1.0'}`,
	sourceLanguage: 'en',
	targetLanguage: 'zh-Hans',
	fileType: 'model',
	version: '3.0',
	architecture: 'base-memory',
	attachment: {
		filename: 'model.enzh.intgemm.alphas.bin.zst',
		hash: 'a'.repeat(64),
		size: 10,
		location: 'main-workspace/translations-models-v2/x.zst',
	},
	...overrides,
});

test('selectRecords drops unknown file types', () => {
	const selected = selectRecords(
		[
			record({ fileType: 'model' }),
			record({ fileType: 'lex' }),
			record({ fileType: 'sentencepiece' }),
		],
		['en-zh-Hans'],
	);

	assert.equal(selected.length, 1);
	assert.deepEqual(
		Array.from(selected[0].byFileType.keys()).sort(),
		['lex', 'model'],
	);
});

test('selectRecords prefers the compact base-memory publication', () => {
	const selected = selectRecords(
		[
			record({ architecture: 'base', fileType: 'model' }),
			record({ architecture: 'base-memory', fileType: 'model' }),
		],
		['en-zh-Hans'],
	);

	assert.equal(selected.length, 1);
	assert.equal(selected[0].architecture, 'base-memory');
});

test('selectRecords keeps the newest version per file type', () => {
	const selected = selectRecords(
		[
			record({ fileType: 'vocab', version: '3.0' }),
			record({ fileType: 'vocab', version: '3.1' }),
		],
		['en-zh-Hans'],
	);

	assert.equal(selected[0].byFileType.get('vocab').version, '3.1');
});

test('selectRecords matches script-qualified Chinese pairs', () => {
	const records = [
		record({ sourceLanguage: 'en', targetLanguage: 'zh-Hans' }),
		record({ sourceLanguage: 'en', targetLanguage: 'zh-Hant' }),
	];

	assert.equal(selectRecords(records, ['en-zh-Hant']).length, 1);
	assert.deepEqual(selectRecords(records, ['en-zh-Hant'])[0].pair, 'en\tzh-Hant');
});

const registryExists = existsSync(REGISTRY_PATH);

test(
	'bundled registry is structurally loadable and its files exist',
	{ skip: !registryExists && 'run `npm run fetch:models` first' },
	() => {
		const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
		const keys = Object.keys(registry);

		assert.ok(keys.length > 0, 'registry is empty');
		assert.ok(
			keys.some((key) => key.endsWith('\tzh-Hans')),
			'Simplified Chinese is not bundled',
		);

		for (const key of keys) {
			const [from, to] = parseRegistryKey(key);
			assert.ok(from && to, `invalid registry key ${JSON.stringify(key)}`);
			assert.ok(
				!from.includes('-') || from === `zh${from.slice(2)}`,
				`unexpected source code ${from}`,
			);

			const files = registry[key];
			assert.ok(files.model, `${key} has no model`);
			assert.ok(
				files.vocab || (files.srcvocab && files.trgvocab),
				`${key} has no vocabulary`,
			);

			for (const part of Object.keys(files)) {
				assert.ok(MODEL_PARTS.includes(part), `${key} has unknown part ${part}`);

				const filePath = path.join(ROOT, 'models', files[part].name);
				assert.ok(existsSync(filePath), `${files[part].name} is missing`);

				// The registry hash is the sha256 of the unpacked file.
				const hash = createHash('sha256')
					.update(readFileSync(filePath))
					.digest('hex');
				assert.equal(hash, files[part].expectedSha256Hash, `${part} hash mismatch`);
			}
		}
	},
);

test('Chinese model pairs map to the plain zh UI code', () => {
	const registryLanguages = new Set(['en']);
	Object.keys(JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))).forEach((key) => {
		const [from, to] = parseRegistryKey(key);
		registryLanguages.add(toUiLanguage(from));
		registryLanguages.add(toUiLanguage(to));
	});

	assert.ok(registryLanguages.has('zh'), 'zh missing from supported languages');
	assert.ok(registryLanguages.has('en'), 'en missing from supported languages');
});
