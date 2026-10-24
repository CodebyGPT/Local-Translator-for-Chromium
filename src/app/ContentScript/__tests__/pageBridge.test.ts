import { afterEach, describe, expect, test } from 'vitest';

import {
	PAGE_BRIDGE_REQUEST_SOURCE,
	PAGE_BRIDGE_RESPONSE_SOURCE,
	installPageBridge,
	toTranslatorLanguageCode,
} from '../pageBridge';

let cleanup: (() => void) | null = null;
afterEach(() => {
	cleanup?.();
	cleanup = null;
});

const nextBridgeResponse = () =>
	new Promise<any>((resolve) => {
		const listener = (event: MessageEvent) => {
			if (event.data?.source !== PAGE_BRIDGE_RESPONSE_SOURCE) return;
			window.removeEventListener('message', listener);
			resolve(event.data);
		};
		window.addEventListener('message', listener);
	});

const ask = (payload: Record<string, unknown>) =>
	window.postMessage(
		{ source: PAGE_BRIDGE_REQUEST_SOURCE, type: 'translate', ...payload },
		'*',
	);

describe('page bridge language codes', () => {
	test('strips regions and folds Chinese variants', () => {
		expect(toTranslatorLanguageCode('zh-CN')).toBe('zh');
		expect(toTranslatorLanguageCode('zh-TW')).toBe('zh');
		expect(toTranslatorLanguageCode('en-US')).toBe('en');
		expect(toTranslatorLanguageCode('auto')).toBe('auto');
		expect(toTranslatorLanguageCode('')).toBe('auto');
		expect(toTranslatorLanguageCode(undefined)).toBe('auto');
	});
});

describe('page bridge', () => {
	test('answers a page request with the translated text', async () => {
		cleanup = installPageBridge(
			async (text, from, to) => `${from}>${to}:${text}`,
		);

		const response = nextBridgeResponse();
		ask({ id: 'req-1', text: 'hello', from: 'en-US', to: 'zh-CN' });

		expect(await response).toEqual({
			source: PAGE_BRIDGE_RESPONSE_SOURCE,
			id: 'req-1',
			text: 'en>zh:hello',
		});
	});

	test('reports translator failures as an error payload', async () => {
		cleanup = installPageBridge(async () => {
			throw new Error('Source language is not supported');
		});

		const response = nextBridgeResponse();
		ask({ id: 'req-2', text: 'hello', from: 'auto', to: 'xx' });

		expect(await response).toEqual({
			source: PAGE_BRIDGE_RESPONSE_SOURCE,
			id: 'req-2',
			error: 'Source language is not supported',
		});
	});

	test('ignores unrelated page traffic', async () => {
		const calls: unknown[] = [];
		cleanup = installPageBridge(async (...args) => {
			calls.push(args);
			return 'ok';
		});

		window.postMessage({ source: 'other-app', type: 'translate', id: 1 }, '*');
		window.postMessage(
			{ source: PAGE_BRIDGE_REQUEST_SOURCE, type: 'something-else', id: 2 },
			'*',
		);
		await new Promise((resolve) => setTimeout(resolve, 25));

		expect(calls).toEqual([]);
	});
});
