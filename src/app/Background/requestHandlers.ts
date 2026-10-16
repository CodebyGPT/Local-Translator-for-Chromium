// Request handlers
import { addLanguagePreferencesFactory } from '../../requests/backend/autoTranslation/languagePreferences/addLanguagePreferences';
import { deleteLanguagePreferencesFactory } from '../../requests/backend/autoTranslation/languagePreferences/deleteLanguagePreferences';
import { getLanguagePreferencesFactory } from '../../requests/backend/autoTranslation/languagePreferences/getLanguagePreferences';
import { deleteSitePreferencesFactory } from '../../requests/backend/autoTranslation/sitePreferences/deleteSitePreferences';
import { getSitePreferencesFactory } from '../../requests/backend/autoTranslation/sitePreferences/getSitePreferences';
// Auto translation
import { setSitePreferencesFactory } from '../../requests/backend/autoTranslation/sitePreferences/setSitePreferences';
import { clearCacheFactory } from '../../requests/backend/clearCache';
import { getConfigFactory } from '../../requests/backend/getConfig';
import { getTranslatorFeaturesFactory } from '../../requests/backend/getTranslatorFeatures';
import { getUserLanguagePreferencesFactory } from '../../requests/backend/getUserLanguagePreferences';
import { historyRequestHandlersFactory } from '../../requests/backend/history';
import {
	clearImportedModelsFactory,
	deleteImportedModelFactory,
	getImportedModelsFactory,
	importModelsFactory,
	refreshModelsFactory,
} from '../../requests/backend/models';
import { pingFactory } from '../../requests/backend/ping';
import { addRecentUsedLanguageFactory } from '../../requests/backend/recentUsedLanguages/addRecentUsedLanguage';
import { getRecentUsedLanguagesFactory } from '../../requests/backend/recentUsedLanguages/getRecentUsedLanguages';
import { resetConfigFactory } from '../../requests/backend/resetConfig';
import { setConfigFactory } from '../../requests/backend/setConfig';
import { suggestLanguageFactory } from '../../requests/backend/suggestLanguage';
import { translateFactory } from '../../requests/backend/translate';
import { addTranslationFactory } from '../../requests/backend/translations/addTranslation';
import { clearTranslationsFactory } from '../../requests/backend/translations/clearTranslations';
import { deleteTranslationFactory } from '../../requests/backend/translations/deleteTranslation';
import { findTranslationFactory } from '../../requests/backend/translations/findTranslation';
import { getTranslationsFactory } from '../../requests/backend/translations/getTranslations';
import { updateConfigFactory } from '../../requests/backend/updateConfig';

export const requestHandlers = [
	translateFactory,
	suggestLanguageFactory,
	getTranslatorFeaturesFactory,
	getUserLanguagePreferencesFactory,
	clearCacheFactory,

	historyRequestHandlersFactory,

	getConfigFactory,
	setConfigFactory,
	resetConfigFactory,
	updateConfigFactory,

	getLanguagePreferencesFactory,
	addLanguagePreferencesFactory,
	deleteLanguagePreferencesFactory,
	setSitePreferencesFactory,
	getSitePreferencesFactory,
	deleteSitePreferencesFactory,

	addTranslationFactory,
	deleteTranslationFactory,
	findTranslationFactory,
	getTranslationsFactory,
	clearTranslationsFactory,

	getRecentUsedLanguagesFactory,
	addRecentUsedLanguageFactory,

	// Translation models the user imported
	getImportedModelsFactory,
	importModelsFactory,
	deleteImportedModelFactory,
	clearImportedModelsFactory,
	refreshModelsFactory,

	// Up ping last to give success response only when all request handlers is ready
	pingFactory,
];
