import React, {
	FC,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import {
	clearImportedModels,
	deleteImportedModel,
	getImportedModels,
	importModels,
	refreshModels,
} from '../../../../../requests/backend/models';
import { getLanguageNameByCode, getMessage } from '../../../../../lib/language';

import './ModelsManager.css';

type ImportedPair = {
	key: string;
	from: string;
	to: string;
	parts: string[];
};

const formatSize = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};

/**
 * Import and manage translation models.
 *
 * The extension ships no models, so this page is how a language pair becomes
 * available. Files are copied into the extension's own storage; nothing is
 * uploaded anywhere.
 */
export const ModelsManager: FC = () => {
	const [pairs, setPairs] = useState<ImportedPair[]>([]);
	const [size, setSize] = useState(0);
	const [busy, setBusy] = useState(false);
	const [messages, setMessages] = useState<string[]>([]);
	const [errors, setErrors] = useState<string[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);

	const reload = useCallback(async () => {
		try {
			const result = await getImportedModels();
			setPairs(result.pairs);
			setSize(result.size);
		} catch (error) {
			setErrors([String(error)]);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const onPick = useCallback(
		async (files: FileList | null) => {
			if (files === null || files.length === 0) return;

			setBusy(true);
			setMessages([]);
			setErrors([]);

			try {
				const result = await importModels({ files: Array.from(files) });

				if (result.imported.length > 0) {
					await refreshModels();
					setMessages(
						result.imported.map(
							({ from, to }) =>
								`${getMessage('modelsManager_imported')} ${from} → ${to}`,
						),
					);
				}

				if (result.skipped.length > 0) {
					setErrors(
						result.skipped.map(({ name, reason }) => `${name}: ${reason}`),
					);
				}

				if (result.imported.length === 0 && result.skipped.length === 0) {
					setErrors([getMessage('modelsManager_nothingSelected')]);
				}

				await reload();
			} catch (error) {
				setErrors([error instanceof Error ? error.message : String(error)]);
			} finally {
				setBusy(false);
				if (inputRef.current) inputRef.current.value = '';
			}
		},
		[reload],
	);

	const onDelete = useCallback(
		async (key: string) => {
			setBusy(true);
			try {
				await deleteImportedModel(key);
				await refreshModels();
				await reload();
			} catch (error) {
				setErrors([String(error)]);
			} finally {
				setBusy(false);
			}
		},
		[reload],
	);

	const onClear = useCallback(async () => {
		setBusy(true);
		try {
			await clearImportedModels();
			await refreshModels();
			await reload();
		} catch (error) {
			setErrors([String(error)]);
		} finally {
			setBusy(false);
		}
	}, [reload]);

	const pairRows = useMemo(
		() =>
			pairs.map((pair) => ({
				...pair,
				label: `${getLanguageNameByCode(pair.from)} → ${getLanguageNameByCode(pair.to)}`,
			})),
		[pairs],
	);

	return (
		<div className="ModelsManager">
			<label className="ModelsManager-Import">
				<input
					ref={inputRef}
					type="file"
					multiple
					disabled={busy}
					onChange={(event) => void onPick(event.target.files)}
				/>
				<span>{getMessage('modelsManager_chooseFiles')}</span>
			</label>

			<p className="ModelsManager-Hint">{getMessage('modelsManager_hint')}</p>

			{size > 0 && (
				<p className="ModelsManager-Size">
					{getMessage('modelsManager_used')} {formatSize(size)}
				</p>
			)}

			{pairRows.length > 0 && (
				<>
					<ul className="ModelsManager-List">
						{pairRows.map((pair) => (
							<li key={pair.key} className="ModelsManager-Item">
								<span className="ModelsManager-ItemLabel">{pair.label}</span>
								<span className="ModelsManager-ItemParts">
									{pair.parts.join(', ')}
								</span>
								<button
									type="button"
									className="ModelsManager-Remove"
									disabled={busy}
									onClick={() => void onDelete(pair.key)}
								>
									{getMessage('modelsManager_remove')}
								</button>
							</li>
						))}
					</ul>

					<button
						type="button"
						className="ModelsManager-Clear"
						disabled={busy}
						onClick={() => void onClear()}
					>
						{getMessage('modelsManager_removeAll')}
					</button>
				</>
			)}

			{messages.map((message) => (
				<p key={message} className="ModelsManager-Message">
					{message}
				</p>
			))}

			{errors.map((error) => (
				<p key={error} className="ModelsManager-Error">
					{error}
				</p>
			))}
		</div>
	);
};
