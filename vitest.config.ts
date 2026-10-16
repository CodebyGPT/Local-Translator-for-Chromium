import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const testTargets = (process.env.TEST_TARGETS ?? '').split(',');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
	plugins: [
		{
			name: 'vite-plugin-string-import',
			enforce: 'pre',
			load(id) {
				const extensions = ['.txt'];
				if (extensions.some((ext) => id.endsWith(ext))) {
					const sqlContent = readFileSync(path.resolve(id), 'utf-8');
					return `export default ${JSON.stringify(sqlContent)};`;
				}

				return;
			},
		},
	],
	test: {
		exclude: [
			'**/node_modules/**',

			// Reference checkouts kept in the workspace alongside this project.
			// They are upstream sources, not part of this extension's suite.
			'linguist-master/**',
			'MTranServer-main/**',
			'translations-main/**',
			'bergamot-translator-main/**',

			// Build-time scripts. Their `*.test.mjs` files drive the `node:test`
			// runner (see `npm run test:models` / `test:engine`); vitest must not
			// collect them, or it reports their `node:test` results as failures.
			'scripts/**',

		],
		globals: true,
		environment: 'jsdom',
		setupFiles: [
			path.join(__dirname, 'test/setupFiles/jest.js'),
			'jest-localstorage-mock',
			'fake-indexeddb/auto',
			path.join(__dirname, 'test/setupFiles/webextension.js'),
		],
	},
});
