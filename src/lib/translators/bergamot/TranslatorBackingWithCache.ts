import { TranslatorBacking } from '../../../../thirdparty/bergamot/src/frontend/TranslatorBacking';
import { isChromium } from '../../browser';

import { OffscreenWorker } from './OffscreenWorker';

/**
 * Bergamot backing for this extension.
 *
 * Model files ship with the extension, so there is no download cache to fill
 * and nothing to fetch from the network. The only override left is the Chromium
 * workaround: MV3 service workers cannot spawn `Worker` threads, so the
 * translator worker runs in an offscreen document instead.
 */
export class TranslatorBackingWithCache extends TranslatorBacking {
	protected createWorker = (url: string): Worker => {
		if (isChromium()) {
			return new OffscreenWorker(url);
		} else {
			return new Worker(url);
		}
	};
}
