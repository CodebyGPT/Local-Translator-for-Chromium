import { translate } from '../../requests/backend/translate';

/**
 * Bridge for other extensions and userscripts that run in the page.
 *
 * A userscript cannot call `runtime.sendMessage` without an extension id and
 * an `externally_connectable` entry, so the page's own postMessage channel is
 * used instead: any page script may ask, this content script answers. The
 * answer repeats the caller's `id` so callers can match it to their request.
 */
export const PAGE_BRIDGE_REQUEST_SOURCE = 'text-selection-toolbar';
export const PAGE_BRIDGE_RESPONSE_SOURCE = 'local-translator-for-chromium';

/**
 * Callers send BCP-47 codes while the bundled engine is keyed by base
 * language; both `zh-CN` and `zh-TW` share the single bundled Chinese model.
 */
export const toTranslatorLanguageCode = (code: unknown) => {
	const value = String(code ?? '')
		.trim()
		.toLowerCase();
	if (value === '' || value === 'auto') return 'auto';
	return value.startsWith('zh') ? 'zh' : value.split('-')[0];
};

type TranslateRequest = (
	text: string,
	from: string,
	to: string,
) => Promise<string>;

/**
 * Listen for translation requests from the page.
 *
 * Nothing in the request is trusted beyond its shape: the translation engine
 * rejects unsupported languages, and the result only ever flows back to the
 * page that asked. Returns a cleanup hook.
 */
export function installPageBridge(
	requestTranslation: TranslateRequest = translate,
) {
	const listener = (event: MessageEvent) => {
		// Same-window only; some environments report `source` as null.
		if (event.source && event.source !== window) return;
		const data = event.data;
		if (
			!data ||
			typeof data !== 'object' ||
			data.source !== PAGE_BRIDGE_REQUEST_SOURCE ||
			data.type !== 'translate'
		)
			return;

		void (async () => {
			try {
				const text = await requestTranslation(
					String(data.text ?? ''),
					toTranslatorLanguageCode(data.from),
					toTranslatorLanguageCode(data.to),
				);
				window.postMessage(
					{ source: PAGE_BRIDGE_RESPONSE_SOURCE, id: data.id, text },
					'*',
				);
			} catch (error) {
				window.postMessage(
					{
						source: PAGE_BRIDGE_RESPONSE_SOURCE,
						id: data.id,
						error: error instanceof Error ? error.message : String(error),
					},
					'*',
				);
			}
		})();
	};
	window.addEventListener('message', listener);

	return () => window.removeEventListener('message', listener);
}
