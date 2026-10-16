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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { MODEL_PARTS, selectRecords } from './fetch-models.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_DIR = path.join(ROOT, 'models');
const REGISTRY_PATH = path.join(MODELS_DIR, 'index.json');

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

		// An empty registry is the default: this extension ships no models, and
		// `fetch:models` writes `{}` unless `--pairs`/`--all` asks for some.
		// Whatever is present still has to be complete and match its hashes.
		if (keys.length === 0) return;

		for (const key of keys) {
			const [from, to] = parseRegistryKey(key);
			assert.ok(from && to, `invalid registry key ${JSON.stringify(key)}`);

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

test(
	'default build ships no translation models',
	{ skip: !registryExists && 'run `npm run fetch:models` first' },
	() => {
		const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));

		// Guards the product decision: models are imported, not bundled. A build
		// that suddenly ships models should be a deliberate change, not drift.
		assert.deepEqual(
			Object.keys(registry),
			[],
			'the default registry should be empty; pass --pairs to bundle models',
		);

		const modelFiles = existsSync(MODELS_DIR)
			? readdirSync(MODELS_DIR, { recursive: true }).filter((name) =>
					String(name).endsWith('.bin') || String(name).endsWith('.spm'),
				)
			: [];

		assert.deepEqual(modelFiles, [], 'model files found in the default build');
	},
);

test('Chinese model pairs map to the plain zh UI code', () => {
	// Mirrors `BergamotTranslator.initSupportedLanguages`: the released models are
	// script-qualified, the UI and `browser.i18n.detectLanguage` are not.
	const languagesFrom = (keys) => {
		const languages = new Set(['en']);
		keys.forEach((key) => {
			const [from, to] = parseRegistryKey(key);
			languages.add(toUiLanguage(from));
			languages.add(toUiLanguage(to));
		});
		return languages;
	};

	const bundled = languagesFrom(['en\tzh-Hans', 'zh-Hans\ten']);
	assert.ok(bundled.has('zh'), 'zh-Hans should map to zh');
	assert.ok(!bundled.has('zh-Hans'), 'script-qualified codes should be collapsed');

	const traditional = languagesFrom(['zh-Hant\ten']);
	assert.ok(traditional.has('zh'), 'zh-Hant should map to zh');

	const european = languagesFrom(['en\tde', 'de\ten']);
	assert.deepEqual([...european].sort(), ['de', 'en']);
});
