import { ClientConfig } from './ClientConfig';
import { PageTranslationContext } from './PageTranslationContext';
import { installPageBridge } from './pageBridge';
import { requestHandlers } from './requestHandlers';

export class ContentScript {
	public static async main() {
		const config = new ClientConfig();
		const contentscript = new ContentScript(config);

		await contentscript.start();
	}

	private readonly config: ClientConfig;
	constructor(config: ClientConfig) {
		this.config = config;
	}

	private pageTranslationContext: PageTranslationContext | null = null;
	public async start() {
		// Skip for already started instances
		if (this.pageTranslationContext !== null) return;

		// Live before the config loads: other toolbar extensions may ask early.
		installPageBridge();

		const $config = await this.config.getStore();

		const pageTranslationContext = new PageTranslationContext($config);
		this.pageTranslationContext = pageTranslationContext;

		await pageTranslationContext.start();

		requestHandlers.forEach((factory) => {
			factory({
				$config,
				pageTranslationContext,
			});
		});
	}
}
