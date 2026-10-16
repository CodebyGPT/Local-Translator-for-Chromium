#!/usr/bin/env node
/**
 * Add the model-management strings to every locale.
 *
 * New keys are added with the English text as the value: translators replace
 * them later, and the extension falls back to English by default anyway. Keys
 * that already exist are left alone, so re-running is safe.
 *
 * Usage: node scripts/add-locale-keys.mjs
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = path.join(ROOT, 'src', '_locales');

/** Keys introduced by this fork, with their English text. */
const KEYS = {
	settings_section_models: 'Translation models',
	settings_option_models_desc:
		'This extension does not ship translation models. Import the files for a language pair to make it available; they are stored on this device and never uploaded.',
	modelsManager_chooseFiles: 'Import model files…',
	modelsManager_hint:
		'Select the model, lex and vocab files for one language pair. File names look like model.enzh.intgemm.alphas.bin, lex.50.50.enzh.s2t.bin and srcvocab.enzh.spm.',
	modelsManager_used: 'Imported models use',
	modelsManager_imported: 'Imported',
	modelsManager_remove: 'Remove',
	modelsManager_removeAll: 'Remove all imported models',
	modelsManager_nothingSelected: 'No usable model files were selected.',
	modelsManager_working: 'Importing… large models can take a few seconds.',
};

async function main() {
	const locales = await readdir(LOCALES_DIR, { withFileTypes: true });
	let changed = 0;

	for (const locale of locales) {
		if (!locale.isDirectory()) continue;

		const file = path.join(LOCALES_DIR, locale.name, 'messages.json');
		let raw;
		try {
			raw = await readFile(file, 'utf8');
		} catch {
			continue;
		}

		const messages = JSON.parse(raw);
		let touched = false;

		for (const [key, message] of Object.entries(KEYS)) {
			if (messages[key] !== undefined) continue;
			messages[key] = { message };
			touched = true;
		}

		if (!touched) continue;

		await writeFile(file, `${JSON.stringify(messages, null, '\t')}\n`);
		changed++;
	}

	console.log(`Added missing locale keys to ${changed} file(s)`);
}

main().catch((error) => {
	console.error(`add-locale-keys failed: ${error.message}`);
	process.exitCode = 1;
});
