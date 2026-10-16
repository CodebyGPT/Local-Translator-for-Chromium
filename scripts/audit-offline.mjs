#!/usr/bin/env node
/**
 * Static offline audit for the built extension.
 *
 * The whole point of this fork is that the packaged extension cannot talk to
 * the network. This walks `build/<target>` and fails when it finds a remote
 * endpoint, a telemetry host, or a manifest privilege that would let the
 * extension reach outside its own package.
 *
 * Usage: node scripts/audit-offline.mjs [build/chromium]
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.json', '.css']);

/**
 * Remote endpoints that must never appear in shipped code.
 */
const FORBIDDEN = [
	// Hosts the upstream project reached out to
	/events\.vitonsky\.net/,
	/bergamot\.s3\.amazonaws\.com/,
	/translate-tools\.github\.io/,
	// Telemetry / analytics shapes
	/navigator\.sendBeacon/,
	/\bgtag\b/,
];

/**
 * Absolute http(s) URLs are only tolerated when they cannot be used as a
 * request target: licence banners, XML namespace identifiers, and
 * error-message links baked into bundled dependencies.
 *
 * Keep this list tiny and justified. Adding a real endpoint here means the
 * audit is being silenced instead of satisfied.
 */
const URL_ALLOWLIST = [
	/w3\.org/,
	/schema\.org/,
	/xmlns|namespace/i,
	/reactjs\.org\/(docs|link)\//,
	/fb\.me\//,
	/npms\.io\//,
	/web\.hypothes\.is\//,
	/github\.com\//,
	/license/i,
	// Help links rendered as `<a href target="_blank">`; opened by the user,
	// never fetched by the extension.
	/developer\.mozilla\.org\//,
	// A URL *prefix check* that skips content-script injection on the Chrome
	// Web Store; no request is made.
	/chrome\.google\.com/,
];

const REMOTE_URL = /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}[^\s'"`)\]]*/gi;

async function* walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else yield full;
	}
}

async function main() {
	const target = process.argv[2] ?? 'build/chromium';
	const dir = path.resolve(ROOT, target);

	const dirStat = await stat(dir).catch(() => null);
	if (!dirStat) {
		console.error(`audit-offline: ${target} does not exist; build first`);
		process.exitCode = 1;
		return;
	}

	const findings = [];
	let scanned = 0;

	for await (const file of walk(dir)) {
		if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
		scanned++;

		const relative = path.relative(dir, file);
		const content = await readFile(file, 'utf8');

		for (const pattern of FORBIDDEN) {
			const match = pattern.exec(content);
			if (match) {
				findings.push(`${relative}  forbidden pattern ${pattern} near "${match[0]}"`);
			}
		}

		for (const url of new Set(content.match(REMOTE_URL) ?? [])) {
			if (URL_ALLOWLIST.some((allowed) => allowed.test(url))) continue;
			findings.push(`${relative}  remote URL in shipped code: ${url.slice(0, 120)}`);
		}
	}

	// The manifest must not request network-shaped privileges or endpoints.
	const manifest = JSON.parse(
		await readFile(path.join(dir, 'manifest.json'), 'utf8'),
	);
	const csp = manifest.content_security_policy?.extension_pages ?? '';
	if (!/connect-src 'self'/.test(csp)) {
		findings.push(`manifest.json  CSP does not restrict connect-src to 'self': ${csp}`);
	}
	if (manifest.host_permissions?.length) {
		findings.push(
			`manifest.json  host_permissions present: ${manifest.host_permissions.join(', ')}`,
		);
	}
	if (manifest.update_url) {
		findings.push(`manifest.json  update_url present: ${manifest.update_url}`);
	}
	if (manifest.permissions?.includes('webRequest')) {
		findings.push('manifest.json  webRequest permission present');
	}

	if (findings.length > 0) {
		console.error(`audit-offline: ${findings.length} finding(s) in ${target}`);
		findings.forEach((finding) => console.error(`  ${finding}`));
		process.exitCode = 1;
		return;
	}

	console.log(`audit-offline: ${target} is clean (${scanned} file(s) scanned)`);
}

main().catch((error) => {
	console.error(`audit-offline failed: ${error.message}`);
	process.exitCode = 1;
});
