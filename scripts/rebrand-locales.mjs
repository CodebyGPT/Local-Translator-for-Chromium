#!/usr/bin/env node
/**
 * One-shot branding fix-up for the fork.
 *
 * Replaces the inherited `ext_name` / `ext_description` in every locale with
 * the new product name, so the extension is never presented as "Linguist".
 * Everything else in the locale files is left untouched.
 *
 * Usage: node scripts/rebrand-locales.mjs [--check]
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = path.join(ROOT, 'src', '_locales');

/**
 * User-facing extension name.
 *
 * Deliberately without "for Chromium": that qualifier belongs to the project
 * name (see the README and repository), not to what the browser shows in its
 * toolbar and menus.
 */
const NAME = 'Local Translator';

/** Short label used where space is tight, e.g. the popup header. */
const SHORT_NAME = 'Local Translator';

const DESCRIPTION =
	'Offline page and text translation that runs entirely on your device, powered by the Firefox (Bergamot) engine';

const checkOnly = process.argv.includes('--check');

async function main() {
	const locales = await readdir(LOCALES_DIR, { withFileTypes: true });
	let changed = 0;
	const stale = [];

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
		const currentName = messages.ext_name?.message;
		const currentDescription = messages.ext_description?.message;
		const currentShortName = messages.ext_shortName?.message;

		if (
			currentName === NAME &&
			currentDescription === DESCRIPTION &&
			currentShortName === SHORT_NAME
		) {
			continue;
		}

		stale.push(locale.name);
		if (checkOnly) continue;

		if (messages.ext_name) messages.ext_name.message = NAME;
		if (messages.ext_description) messages.ext_description.message = DESCRIPTION;

		// Added by this fork; `ext_name` keeps the full name for the store,
		// while `ext_shortName` is what tight UI (the popup header) shows.
		messages.ext_shortName = { message: SHORT_NAME };

		await writeFile(file, `${JSON.stringify(messages, null, '\t')}\n`);
		changed++;
	}

	if (checkOnly) {
		if (stale.length > 0) {
			console.error(`${stale.length} locale(s) still carry the old branding`);
			process.exitCode = 1;
			return;
		}
		console.log('All locales carry the fork branding');
		return;
	}

	console.log(`Rebranded ${changed} locale file(s)`);
}

main().catch((error) => {
	console.error(`rebrand-locales failed: ${error.message}`);
	process.exitCode = 1;
});
