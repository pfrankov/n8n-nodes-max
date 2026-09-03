import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, JsonObject } from 'n8n-workflow';
import { ApplicationError, NodeApiError, NodeOperationError } from 'n8n-workflow';
import {
	ATTACHMENT_READY_RETRY_DELAYS_MS,
	buildPlainTextFallbackBody,
	hasMediaAttachments,
	isAttachmentNotReadyError,
	isUnsupportedMarkdownSyntaxError,
	sleep,
} from './MaxApiCompatibility';
import { normalizeMaxBaseUrl } from './MaxUrlUtils';

export { MAX_API_BASE_URL, normalizeMaxBaseUrl, normalizeMaxWebhookUrl } from './MaxUrlUtils';

export type MaxHttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export interface MaxApiRequestOptions {
	method: MaxHttpMethod;
	path: string;
	qs?: IDataObject;
	body?: IDataObject;
}

export interface MaxKeyboardButton extends IDataObject {
	type: string;
	text: string;
	payload?: string;
	url?: string;
	web_app?: string;
	contact_id?: string | number;
	quick?: boolean;
}

const ALLOWED_BUTTON_TYPES = new Set([
	'callback',
	'clipboard',
	'link',
	'message',
	'open_app',
	'request_contact',
	'request_geo_location',
]);
const LIMITED_BUTTON_TYPES = new Set([
	'link',
	'open_app',
	'request_contact',
	'request_geo_location',
]);

function compactObject(value: IDataObject | undefined): IDataObject | undefined {
	if (!value) {
		return undefined;
	}

	const compacted: IDataObject = {};
	for (const [key, item] of Object.entries(value)) {
		if (item !== undefined) {
			compacted[key] = item;
		}
	}
	return Object.keys(compacted).length > 0 ? compacted : undefined;
}

/** Sends one request using the exact MAX HTTP contract. */
export async function maxApiRequest(
	context: IExecuteFunctions,
	options: MaxApiRequestOptions,
): Promise<unknown> {
	const credentials = await context.getCredentials('maxApi');
	const accessToken = String(credentials['accessToken'] ?? '').trim();
	if (accessToken.length === 0) {
		throw new NodeOperationError(context.getNode(), 'MAX access token is empty');
	}

	const baseUrl = normalizeMaxBaseUrl(credentials['baseUrl']);
	const path = options.path.startsWith('/') ? options.path : `/${options.path}`;
	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${baseUrl}${path}`,
		headers: {
			Authorization: accessToken,
			...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
		},
		json: true,
	};

	const qs = compactObject(options.qs);
	if (qs) {
		requestOptions.qs = qs;
	}
	if (options.body !== undefined) {
		requestOptions.body = options.body;
	}

	let requestBody = options.body === undefined ? undefined : { ...options.body };
	let markdownFallbackApplied = false;
	let attachmentRetryAttempt = 0;

	while (true) {
		try {
			return await context.helpers.httpRequest({
				...requestOptions,
				...(requestBody !== undefined ? { body: requestBody } : {}),
			});
		} catch (error) {
			if (!markdownFallbackApplied && requestBody) {
				const fallbackBody = isUnsupportedMarkdownSyntaxError(error)
					? buildPlainTextFallbackBody(requestBody)
					: undefined;
				if (fallbackBody) {
					requestBody = fallbackBody;
					markdownFallbackApplied = true;
					continue;
				}
			}

			if (
				requestBody &&
				hasMediaAttachments(requestBody) &&
				isAttachmentNotReadyError(error) &&
				attachmentRetryAttempt < ATTACHMENT_READY_RETRY_DELAYS_MS.length
			) {
				const retryDelay = ATTACHMENT_READY_RETRY_DELAYS_MS[attachmentRetryAttempt];
				if (retryDelay === undefined) {
					throw new NodeApiError(context.getNode(), error as JsonObject, {
						message: `MAX API request failed: ${options.method} ${path}`,
					});
				}
				attachmentRetryAttempt += 1;
				await sleep(retryDelay);
				continue;
			}

			throw new NodeApiError(context.getNode(), error as JsonObject, {
				message: `MAX API request failed: ${options.method} ${path}`,
			});
		}
	}
}

const SIGNED_INT64_MAX = '9223372036854775807';
const SIGNED_INT64_MIN_ABSOLUTE = '9223372036854775808';

function isSignedInt64(value: string): boolean {
	if (!/^-?\d+$/.test(value)) {
		return false;
	}

	const isNegative = value.startsWith('-');
	const digits = (isNegative ? value.slice(1) : value).replace(/^0+(?=\d)/, '');
	const limit = isNegative ? SIGNED_INT64_MIN_ABSOLUTE : SIGNED_INT64_MAX;

	return digits.length < limit.length || (digits.length === limit.length && digits <= limit);
}

/** Reads a required non-empty string parameter. */
export function requireString(value: unknown, displayName: string): string {
	const result = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
	if (result.length === 0) {
		throw new ApplicationError(`${displayName} is required and cannot be empty`);
	}
	return result;
}

/** Reads a signed int64 identifier without converting it to a JavaScript number. */
export function requireInt64(value: unknown, displayName: string): string {
	const result = requireString(value, displayName);
	if (!/^-?\d+$/.test(result)) {
		throw new ApplicationError(`${displayName} must be a signed integer ID`);
	}
	if (!isSignedInt64(result)) {
		throw new ApplicationError(`${displayName} must be within the signed int64 range`);
	}
	return result;
}

/** Parses a comma-separated int64 list while preserving every identifier exactly. */
export function parseIdList(value: unknown, displayName: string, maximum = 100): string[] {
	const source = typeof value === 'string' ? value : String(value ?? '');
	const identifiers = source
		.split(',')
		.map((identifier) => identifier.trim())
		.filter((identifier) => identifier.length > 0);

	if (identifiers.length === 0) {
		throw new ApplicationError(`${displayName} must contain at least one ID`);
	}
	if (identifiers.length > maximum) {
		throw new ApplicationError(`${displayName} can contain at most ${maximum} IDs`);
	}
	for (const identifier of identifiers) {
		if (!/^-?\d+$/.test(identifier)) {
			throw new ApplicationError(`${displayName} contains an invalid ID: ${identifier}`);
		}
		if (!isSignedInt64(identifier)) {
			throw new ApplicationError(
				`${displayName} contains an ID outside the signed int64 range: ${identifier}`,
			);
		}
	}

	return Array.from(new Set(identifiers));
}

function parseJson(value: unknown, displayName: string): unknown {
	if (typeof value !== 'string') {
		return value;
	}
	const source = value.trim();
	if (source.length === 0) {
		return undefined;
	}

	try {
		return JSON.parse(source) as unknown;
	} catch (error) {
		const details = error instanceof Error ? error.message : 'invalid JSON';
		throw new ApplicationError(`${displayName} must contain valid JSON: ${details}`);
	}
}

/** Parses an optional object-valued JSON parameter. */
export function parseJsonObject(value: unknown, displayName: string): IDataObject | undefined {
	const parsed = parseJson(value, displayName);
	if (parsed === undefined) {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new ApplicationError(`${displayName} must be a JSON object`);
	}
	return parsed as IDataObject;
}

/** Parses an optional array of object-valued attachments. Empty arrays remain explicit. */
export function parseJsonObjectArray(
	value: unknown,
	displayName: string,
): IDataObject[] | undefined {
	const parsed = parseJson(value, displayName);
	if (parsed === undefined) {
		return undefined;
	}
	if (!Array.isArray(parsed)) {
		throw new ApplicationError(`${displayName} must be a JSON array`);
	}
	if (parsed.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
		throw new ApplicationError(`${displayName} must contain only JSON objects`);
	}
	return parsed as IDataObject[];
}

/** Converts the n8n fixed-collection value into rows accepted by buildInlineKeyboard. */
export function extractKeyboardRows(value: unknown): MaxKeyboardButton[][] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return [];
	}

	const container = value as IDataObject;
	const rowsValue = container['rows'];
	if (!Array.isArray(rowsValue)) {
		return [];
	}

	return rowsValue.map((rowValue) => {
		if (!rowValue || typeof rowValue !== 'object' || Array.isArray(rowValue)) {
			return [];
		}
		const row = rowValue as IDataObject;
		const buttonsValue = row['buttons'];
		if (Array.isArray(buttonsValue)) {
			return buttonsValue as MaxKeyboardButton[];
		}
		if (buttonsValue && typeof buttonsValue === 'object' && !Array.isArray(buttonsValue)) {
			const nested = (buttonsValue as IDataObject)['button'];
			return Array.isArray(nested) ? (nested as MaxKeyboardButton[]) : [];
		}
		return [];
	});
}

function validateButton(
	button: MaxKeyboardButton,
	rowIndex: number,
	buttonIndex: number,
): IDataObject {
	const location = `Keyboard row ${rowIndex + 1}, button ${buttonIndex + 1}`;
	const type = requireString(button.type, `${location} type`);
	if (!ALLOWED_BUTTON_TYPES.has(type)) {
		throw new ApplicationError(`${location} has unsupported type: ${type}`);
	}

	const text = requireString(button.text, `${location} text`);
	if (text.length > 128) {
		throw new ApplicationError(`${location} text cannot exceed 128 characters`);
	}

	const result: IDataObject = { type, text };
	if (type === 'callback' || type === 'clipboard') {
		const payload = requireString(button.payload, `${location} payload`);
		if (payload.length > 1024) {
			throw new ApplicationError(`${location} payload cannot exceed 1024 characters`);
		}
		result['payload'] = payload;
	}

	if (type === 'link') {
		const url = requireString(button.url, `${location} URL`);
		if (url.length > 2048) {
			throw new ApplicationError(`${location} URL cannot exceed 2048 characters`);
		}
		result['url'] = url;
	}

	if (type === 'open_app') {
		if (typeof button.web_app === 'string' && button.web_app.trim().length > 0) {
			result['web_app'] = button.web_app.trim();
		}
		if (button.contact_id !== undefined && String(button.contact_id).trim().length > 0) {
			result['contact_id'] = requireInt64(button.contact_id, `${location} Contact ID`);
		}
		if (typeof button.payload === 'string' && button.payload.trim().length > 0) {
			result['payload'] = button.payload.trim();
		}
	}

	if (type === 'request_geo_location' && typeof button.quick === 'boolean') {
		result['quick'] = button.quick;
	}

	return result;
}

/** Builds and validates a current inline_keyboard attachment. */
export function buildInlineKeyboard(rows: MaxKeyboardButton[][]): IDataObject | undefined {
	const nonEmptyRows = rows.filter((row) => row.length > 0);
	if (nonEmptyRows.length === 0) {
		return undefined;
	}
	if (nonEmptyRows.length > 30) {
		throw new ApplicationError('Inline keyboard can contain at most 30 rows');
	}

	const buttons = nonEmptyRows.map((row, rowIndex) => {
		if (row.length > 7) {
			throw new ApplicationError(`Keyboard row ${rowIndex + 1} can contain at most 7 buttons`);
		}
		const limitedButtonCount = row.filter((button) => LIMITED_BUTTON_TYPES.has(button.type)).length;
		if (limitedButtonCount > 3) {
			throw new ApplicationError(
				`Keyboard row ${rowIndex + 1} can contain at most 3 link, open app, contact, or location buttons`,
			);
		}
		return row.map((button, buttonIndex) => validateButton(button, rowIndex, buttonIndex));
	});

	return {
		type: 'inline_keyboard',
		payload: { buttons },
	};
}
