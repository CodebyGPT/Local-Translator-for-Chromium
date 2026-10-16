#!/usr/bin/env node
/**
 * Build-time model fetcher for Local Translator for Chromium.
 *
 * This is the ONLY place in the project that talks to the network. It runs
 * before `webpack`, uploads nothing, and downloads the translation models from
 * Mozilla's Remote Settings, writing:
 *
 *   models/index.json            registry consumed at runtime
 *   models/files/<pair>/<file>   model files referenced by the registry
 *
 * The packaged extension then reads both from its own directory: nothing is
 * downloaded at runtime and no remote registry is consulted.
 *
 * Usage:
 *   node scripts/fetch-models.mjs                       # en<->zh-Hans/Hant defaults
 *   node scripts/fetch-models.mjs --pairs en-de,en-fr   # explicit pairs
 *   node scripts/fetch-models.mjs --all                 # every published pair (~100MB+)
 *   node scripts/fetch-models.mjs --out models          # output directory
 *
 * Requires Node >= 22.15 for `zlib.zstdDecompressSync`.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const RECORDS_URL =
	'https://firefox.settings.services.mozilla.com/v1/buckets/main-preview/collections/translations-models-v2/records';
const ATTACHMENTS_BASE_URL =
	'https://firefox-settings-attachments.cdn.mozilla.net';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Pairs shipped by default: none.
 *
 * The extension bundles only English, which is the pivot language and has no
 * model of its own. Translation models are large (tens of megabytes per
 * direction) and are not useful to everyone, so they are imported by the user
 * or distributed separately -- see the README's "Getting translation models".
 */
const DEFAULT_PAIRS = [];

/**
 * The registry keys and file layout are derived from the upstream record, so
 * adding a pair is only ever a matter of passing `--pairs`/`--all`.
 */
export const MODEL_PARTS = [
	'model',
	'vocab',
	'srcvocab',
	'trgvocab',
	'lex',
	'qualityModel',
];

function parseArgs(argv) {
	const args = {
		out: 'models',
		pairs: null,
		all: false,
		quiet: false,
		platform: 'desktop',
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--all') args.all = true;
		else if (arg === '--quiet') args.quiet = true;
		else if (arg === '--out') args.out = argv[++i];
		else if (arg === '--platform') {
			args.platform = String(argv[++i] ?? '').trim() || 'desktop';
		} else if (arg === '--pairs') {
			args.pairs = String(argv[++i] ?? '')
				.split(',')
				.map((pair) => pair.trim())
				.filter(Boolean);
		} else if (arg === '--help' || arg === '-h') {
			console.log(
				[
					'Usage: node scripts/fetch-models.mjs [options]',
					'  --out <dir>          output directory (default: models)',
					'  --pairs a-b,c-d      comma-separated language pairs',
					'  --all                every pair published by Mozilla',
					'  --platform <name>    honour Remote Settings targeting for this',
					'                       platform: desktop (default) or android',
					'  --quiet              only warn and error output',
				].join('\n'),
			);
			process.exit(0);
		} else {
			throw new Error(`Unknown argument "${arg}". Use --help.`);
		}
	}

	return args;
}

function compareVersion(a, b) {
	const left = String(a).split('.').map(Number);
	const right = String(b).split('.').map(Number);
	const length = Math.max(left.length, right.length);

	for (let i = 0; i < length; i++) {
		const diff = (left[i] ?? 0) - (right[i] ?? 0);
		if (diff !== 0) return diff;
	}

	return 0;
}

/**
 * Does a record's `filter_expression` target a different host than this build?
 *
 * Mozilla publishes platform-specific publications of the same model behind
 * Remote Settings filter expressions. The `zh-Hans -> en` pair is a concrete
 * example: a `vocab`-layout v3.1 model filtered to Android, and a
 * `base`-architecture v3.0 model filtered to everything else. Remote Settings
 * hides the inapplicable record from each client; we have to do the same, or we
 * can pick the wrong variant purely on record order.
 *
 * Only a single platform predicate is interpreted. Version-range predicates are
 * deliberately left alone: `version` is a semver whose major part tracks engine
 * compatibility, so for those the highest version wins.
 */
export function isFilteredOut(record, platform = 'desktop') {
	const filter = String(record.filter_expression ?? '').trim();
	if (filter === '') return false;

	// Keep to the simple `OS == 'Android'` / `OS != 'Android'` forms; anything
	// more complex (version ranges, `&&`/`||`) is left to the version rule
	// rather than being guessed at.
	const match = /^env\.appinfo\.OS\s*(==|===|!=|!==)\s*['"]Android['"]$/.exec(filter);
	if (!match) return false;

	const requiresAndroid = match[1].startsWith('=');
	return requiresAndroid !== (platform === 'android');
}

/**
 * Score an architecture so the compact `base-memory` publication wins over
 * the full `base` one.
 */
function architectureScore(architecture) {
	const traits = String(architecture ?? 'base')
		.split('-')
		.filter((part) => part !== 'base' && part !== '');

	return traits.includes('memory') ? traits.length + 1 : traits.length;
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function fetchJson(url) {
	const response = await fetch(url, { headers: { accept: 'application/json' } });
	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText} for ${url}`);
	}
	return response.json();
}

async function fetchBuffer(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText} for ${url}`);
	}
	return Buffer.from(await response.arrayBuffer());
}

/**
 * Choose, for every requested pair, the architecture and one record per
 * `fileType` we know how to load.
 *
 * Language codes may contain `-` (`zh-Hans`), so the pair is carried as
 * `from\tt o` internally and in the registry.
 */
export function selectRecords(records, pairs, platform = 'desktop') {
	const wanted = pairs === null ? null : new Set(pairs);
	const groups = new Map();

	for (const record of records) {
		const pair = `${record.sourceLanguage}\t${record.targetLanguage}`;
		if (wanted !== null && !wanted.has(pair.replace('\t', '-'))) continue;
		if (!MODEL_PARTS.includes(record.fileType)) continue;
		// Honour Remote Settings platform targeting, as a real client would.
		if (isFilteredOut(record, platform)) continue;

		const key = `${pair}|${record.architecture ?? 'base'}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(record);
	}

	const perPair = new Map();
	for (const [key, groupRecords] of groups) {
		const separator = key.lastIndexOf('|');
		const pair = key.slice(0, separator);
		const architecture = key.slice(separator + 1);

		const existing = perPair.get(pair);
		if (
			existing &&
			architectureScore(architecture) <= architectureScore(existing.architecture)
		) {
			continue;
		}

		// Keep the highest version of each file type.
		const byFileType = new Map();
		for (const record of groupRecords) {
			const current = byFileType.get(record.fileType);
			if (!current || compareVersion(record.version, current.version) > 0) {
				byFileType.set(record.fileType, record);
			}
		}

		perPair.set(pair, { pair, architecture, byFileType });
	}

	return Array.from(perPair.values());
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const log = (...message) => {
		if (!args.quiet) console.log(...message);
	};

	log(`Reading ${RECORDS_URL}`);
	const { data: records } = await fetchJson(RECORDS_URL);

	const pairs = args.all ? null : (args.pairs ?? DEFAULT_PAIRS);
	const selected = selectRecords(records, pairs, args.platform);

	for (const { pair, architecture, byFileType } of selected) {
		const versions = [...new Set([...byFileType.values()].map((r) => r.version))];
		log(
			`  pair ${pair.replace('\t', '->').replace('\t', '-')}: ` +
				`architecture=${architecture} version=${versions.join('/')} ` +
				`parts=${[...byFileType.keys()].join(',')}`,
		);
	}

	if (selected.length === 0) {
		// The default set is empty on purpose: the extension ships without
		// models. Writing an empty registry is the correct outcome, not an error.
		if ((pairs ?? []).length === 0 && !args.all) {
			const emptyDir = path.resolve(ROOT, args.out);
			await mkdir(emptyDir, { recursive: true });
			await writeFile(path.join(emptyDir, 'index.json'), '{}\n');
			log(
				`Wrote an empty registry to ${path.relative(ROOT, emptyDir)}. ` +
					'The extension bundles no translation models; pass --pairs or --all ' +
					'to bundle some.',
			);
			return;
		}

		throw new Error(
			`No records matched: ${pairs === null ? 'all pairs' : pairs.join(', ')}`,
		);
	}

	const outDir = path.resolve(ROOT, args.out);
	const registry = {};
	let downloaded = 0;

	for (const { pair, byFileType } of selected) {
		const pairDir = pair.replace('\t', '-');
		const files = {};

		for (const [fileType, record] of byFileType) {
			const filename = path.basename(record.attachment.filename);
			const relativePath = `files/${pairDir}/${filename.replace(/\.zst$/, '')}`;
			const targetPath = path.join(outDir, relativePath);

			if (!existsSync(targetPath)) {
				log(`  downloading ${pairDir}/${filename}`);
				const compressed = await fetchBuffer(
					`${ATTACHMENTS_BASE_URL}/${record.attachment.location}`,
				);

				if (sha256(compressed) !== record.attachment.hash) {
					throw new Error(`Attachment hash mismatch for ${filename}`);
				}

				const raw = filename.endsWith('.zst')
					? zstdDecompressSync(compressed)
					: compressed;

				if (record.decompressedHash && sha256(raw) !== record.decompressedHash) {
					throw new Error(`Decompressed hash mismatch for ${filename}`);
				}

				await mkdir(path.dirname(targetPath), { recursive: true });
				await writeFile(targetPath, raw);
				downloaded++;
			}

			files[fileType] = {
				name: relativePath,
				size: record.attachment.size,
				expectedSha256Hash: record.decompressedHash ?? record.attachment.hash,
			};
		}

		if (!files.model) throw new Error(`No model file published for ${pairDir}`);
		if (!files.vocab && !(files.srcvocab && files.trgvocab)) {
			throw new Error(`No vocabulary published for ${pairDir}`);
		}

		// The key is `<from>\t<to>`; language codes may contain `-`.
		registry[pair] = files;
	}

	await writeFile(
		path.join(outDir, 'index.json'),
		`${JSON.stringify(registry, null, '\t')}\n`,
	);

	log(
		`Wrote ${selected.length} model(s) to ${path.relative(ROOT, outDir)}` +
			(downloaded ? ` (${downloaded} file(s) downloaded)` : ' (all cached)'),
	);
}

// Only run when executed directly, so `selectRecords` stays importable in tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(`fetch-models failed: ${error.message}`);
		process.exitCode = 1;
	});
}
