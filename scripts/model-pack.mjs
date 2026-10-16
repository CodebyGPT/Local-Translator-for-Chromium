#!/usr/bin/env node
/**
 * Build a distributable model pack.
 *
 * The extension ships without translation models, so releases publish them
 * separately: this produces a zip of model files plus the manifest that records
 * where each file came from, so the download can be verified.
 *
 * Usage:
 *   node scripts/model-pack.mjs                       # a small, common set
 *   node scripts/model-pack.mjs --pairs en-de,de-en   # explicit pairs
 *   node scripts/model-pack.mjs --all                  # every published pair
 *   node scripts/model-pack.mjs --out dist             # output directory
 *
 * The zip is written with plain `zlib` deflate and stored entries -- no
 * dependency, and no need for a `zip` binary.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, zstdDecompressSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RECORDS_URL =
	'https://firefox.settings.services.mozilla.com/v1/buckets/main-preview/collections/translations-models-v2/records';
const ATTACHMENTS_BASE_URL =
	'https://firefox-settings-attachments.cdn.mozilla.net';

/** Pairs worth shipping in the default pack: broad, widely useful coverage. */
const PACK_PAIRS = [
	'en-zh-Hans',
	'zh-Hans-en',
	'en-fr',
	'fr-en',
	'en-de',
	'de-en',
	'en-es',
	'es-en',
	'en-ru',
	'ru-en',
	'en-ja',
	'ja-en',
];

const MODEL_PARTS = ['model', 'vocab', 'srcvocab', 'trgvocab', 'lex', 'qualityModel'];

function parseArgs(argv) {
	const args = { out: 'dist', pairs: PACK_PAIRS, all: false, quiet: false };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--all') args.all = true;
		else if (arg === '--quiet') args.quiet = true;
		else if (arg === '--out') args.out = argv[++i];
		else if (arg === '--pairs') {
			args.pairs = String(argv[++i] ?? '')
				.split(',')
				.map((pair) => pair.trim())
				.filter(Boolean);
		} else if (arg === '--help' || arg === '-h') {
			console.log(
				[
					'Usage: node scripts/model-pack.mjs [options]',
					'  --out <dir>        output directory (default: dist)',
					'  --pairs a-b,c-d    language pairs to include',
					'  --all              every pair Mozilla publishes',
					'  --quiet            only warn and error output',
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
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const diff = (left[i] ?? 0) - (right[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

function architectureScore(architecture) {
	const traits = String(architecture ?? 'base')
		.split('-')
		.filter((part) => part !== 'base' && part !== '');
	return traits.includes('memory') ? traits.length + 1 : traits.length;
}

/** Skip records Remote Settings would hide from this platform. */
function isFilteredOut(record, platform = 'desktop') {
	const filter = String(record.filter_expression ?? '').trim();
	if (filter === '') return false;

	const match = /^env\.appinfo\.OS\s*(==|===|!=|!==)\s*['"]Android['"]$/.exec(filter);
	if (!match) return false;

	return match[1].startsWith('=') !== (platform === 'android');
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function fetchJson(url) {
	const response = await fetch(url, { headers: { accept: 'application/json' } });
	if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
	return response.json();
}

async function fetchBuffer(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
	return Buffer.from(await response.arrayBuffer());
}

/* ------------------------------------------------------------------ *
 * Minimal ZIP writer (deflate), so the pack needs no `zip` binary.
 * ------------------------------------------------------------------ */

const crcTable = (() => {
	const table = new Int32Array(256);
	for (let i = 0; i < 256; i++) {
		let value = i;
		for (let bit = 0; bit < 8; bit++) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[i] = value;
	}
	return table;
})();

/**
 * CRC-32 of a buffer.
 *
 * Indexed loop rather than `for...of`: models run to tens of megabytes, and the
 * iterator protocol makes this the slowest part of packing by far.
 */
function crc32(buffer) {
	let crc = -1;

	for (let index = 0; index < buffer.length; index++) {
		crc = crcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
	}

	return (crc ^ -1) >>> 0;
}

/** Build a zip archive from `{ name, data }` entries. */
export function buildZip(entries) {
	const chunks = [];
	const central = [];
	let offset = 0;

	const dosTime = 0;
	const dosDate = 0x21; // 1980-01-01, deliberately fixed for reproducible output

	for (const entry of entries) {
		const nameBuffer = Buffer.from(entry.name, 'utf8');
		const deflated = deflateRawSync(entry.data, { level: 9 });
		const crc = crc32(entry.data);

		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4); // version needed
		localHeader.writeUInt16LE(0x0800, 6); // UTF-8 names
		localHeader.writeUInt16LE(8, 8); // deflate
		localHeader.writeUInt16LE(dosTime, 10);
		localHeader.writeUInt16LE(dosDate, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(deflated.length, 18);
		localHeader.writeUInt32LE(entry.data.length, 22);
		localHeader.writeUInt16LE(nameBuffer.length, 26);
		localHeader.writeUInt16LE(0, 28);

		chunks.push(localHeader, nameBuffer, deflated);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(20, 4);
		centralHeader.writeUInt16LE(20, 6);
		centralHeader.writeUInt16LE(0x0800, 8);
		centralHeader.writeUInt16LE(8, 10);
		centralHeader.writeUInt16LE(dosTime, 12);
		centralHeader.writeUInt16LE(dosDate, 14);
		centralHeader.writeUInt32LE(crc, 16);
		centralHeader.writeUInt32LE(deflated.length, 20);
		centralHeader.writeUInt32LE(entry.data.length, 24);
		centralHeader.writeUInt16LE(nameBuffer.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt16LE(0, 34);
		centralHeader.writeUInt16LE(0, 36);
		centralHeader.writeUInt32LE(0, 38);
		centralHeader.writeUInt32LE(offset, 42);
		central.push(centralHeader, nameBuffer);

		offset += localHeader.length + nameBuffer.length + deflated.length;
	}

	const centralBuffer = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralBuffer.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);

	return Buffer.concat([...chunks, centralBuffer, end]);
}

/* ------------------------------------------------------------------ */

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const log = (...message) => {
		if (!args.quiet) console.log(...message);
	};

	log(`Reading ${RECORDS_URL}`);
	const { data: records } = await fetchJson(RECORDS_URL);

	const wanted = args.all ? null : new Set(args.pairs);
	const groups = new Map();

	for (const record of records) {
		const pair = `${record.sourceLanguage}-${record.targetLanguage}`;
		if (wanted !== null && !wanted.has(pair)) continue;
		if (!MODEL_PARTS.includes(record.fileType)) continue;
		if (isFilteredOut(record)) continue;

		const key = `${pair}|${record.architecture ?? 'base'}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(record);
	}

	// Pick one architecture and the newest record per file type.
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

		const byFileType = new Map();
		for (const record of groupRecords) {
			const current = byFileType.get(record.fileType);
			if (!current || compareVersion(record.version, current.version) > 0) {
				byFileType.set(record.fileType, record);
			}
		}

		perPair.set(pair, { architecture, byFileType });
	}

	if (perPair.size === 0) {
		throw new Error('No model records matched the requested pairs');
	}

	const outDir = path.resolve(ROOT, args.out);
	await mkdir(outDir, { recursive: true });

	const entries = [];
	const manifest = [];

	for (const [pair, { architecture, byFileType }] of perPair) {
		for (const [fileType, record] of byFileType) {
			const filename = path.basename(record.attachment.filename).replace(/\.zst$/, '');

			// Cache downloads between runs so repeated packs are cheap.
			const cacheDir = path.join(outDir, '.cache', pair);
			const cached = path.join(cacheDir, filename);

			let raw;
			if (existsSync(cached)) {
				raw = await readFile(cached);
			} else {
				log(`  downloading ${pair}/${filename}`);
				const compressed = await fetchBuffer(
					`${ATTACHMENTS_BASE_URL}/${record.attachment.location}`,
				);
				if (sha256(compressed) !== record.attachment.hash) {
					throw new Error(`Attachment hash mismatch for ${filename}`);
				}

				raw = record.attachment.filename.endsWith('.zst')
					? zstdDecompressSync(compressed)
					: compressed;

				await mkdir(cacheDir, { recursive: true });
				await writeFile(cached, raw);
			}

			// Flat archive: the file names already carry the language code, and a
			// flat layout lets the whole set be selected in one go in the settings
			// page's file picker, which cannot span directories.
			const name = filename;
			entries.push({ name, data: raw });
			manifest.push({
				name,
				fileType,
				sourceLanguage: record.sourceLanguage,
				targetLanguage: record.targetLanguage,
				version: record.version,
				architecture,
				size: raw.length,
				sha256: sha256(raw),
			});
		}
	}

	entries.push({
		name: 'manifest.json',
		data: Buffer.from(
			`${JSON.stringify(
				{
					description:
						'Translation models for Local Translator. Unpack and import the files for the language pair you want through the extension settings page.',
					generatedAt: new Date().toISOString(),
					source: RECORDS_URL,
					license: 'MPL-2.0',
					files: manifest,
				},
				null,
				2,
			)}\n`,
		),
	});

	const zip = buildZip(entries);
	const zipName = 'local-translator-models.zip';
	await writeFile(path.join(outDir, zipName), zip);

	log(
		`Wrote ${path.join(path.relative(ROOT, outDir), zipName)} ` +
			`(${entries.length} file(s), ${(zip.length / 1024 ** 2).toFixed(1)} MB)`,
	);
}

// `buildZip` is imported by tests; the CLI runs only when invoked directly.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(`model-pack failed: ${error.message}`);
		process.exitCode = 1;
	});
}
