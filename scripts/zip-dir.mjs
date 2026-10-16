#!/usr/bin/env node
/**
 * Zip a directory using the repository's dependency-free zip writer.
 *
 * Release builds need a plain zip of `build/<target>`; this avoids depending on
 * a `zip` binary (absent on stock Windows) while keeping the output a real zip
 * that any unzip tool reads.
 *
 * Usage:
 *   node scripts/zip-dir.mjs build/chromium dist/local-translator-0.1.0.zip
 */

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildZip } from './model-pack.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const [, , sourceArg, outputArg] = process.argv;
if (!sourceArg || !outputArg) {
	console.error('Usage: node scripts/zip-dir.mjs <directory> <output.zip>');
	process.exitCode = 1;
} else {
	const sourceDir = path.resolve(ROOT, sourceArg);
	const outputPath = path.resolve(ROOT, outputArg);

	const entries = [];
	const walk = async (directory, prefix) => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const full = path.join(directory, entry.name);
			const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

			if (entry.isDirectory()) {
				await walk(full, name);
			} else {
				entries.push({ name, data: await readFile(full) });
			}
		}
	};

	await walk(sourceDir, '');
	entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

	const zip = buildZip(entries);
	await writeFile(outputPath, zip);

	const total = entries.reduce((sum, entry) => sum + entry.data.length, 0);
	console.log(
		`Wrote ${path.relative(ROOT, outputPath)}: ${entries.length} file(s), ` +
			`${(total / 1024 ** 2).toFixed(1)} MB raw, ${(zip.length / 1024 ** 2).toFixed(1)} MB zipped`,
	);
}
