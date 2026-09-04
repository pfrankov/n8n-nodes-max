import type { IDataObject } from 'n8n-workflow';

export const ATTACHMENT_READY_RETRY_DELAYS_MS = [700, 1500, 3000] as const;

export async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function extractMaxErrorText(error: unknown): string {
	const parts: string[] = [];
	const append = (value: unknown): void => {
		if (typeof value === 'string' && value.trim().length > 0) {
			parts.push(value.toLowerCase());
			return;
		}
		if (typeof value === 'number' && Number.isFinite(value)) {
			parts.push(String(value).toLowerCase());
		}
	};

	append((error as { message?: string })?.message);
	append((error as { description?: string })?.description);
	append((error as { code?: string | number })?.code);

	const candidates = [
		(error as { response?: { body?: unknown } })?.response?.body,
		(error as { response?: { data?: unknown } })?.response?.data,
		(error as { body?: unknown })?.body,
		(error as { error?: unknown })?.error,
	];

	for (const candidate of candidates) {
		if (typeof candidate === 'string') {
			append(candidate);
			continue;
		}
		if (!candidate || typeof candidate !== 'object') {
			continue;
		}
		const body = candidate as {
			message?: string;
			description?: string;
			error?: string;
			error_description?: string;
			code?: string | number;
		};
		append(body.message);
		append(body.description);
		append(body.error);
		append(body.error_description);
		append(body.code);
	}

	return parts.join(' ');
}

export function isUnsupportedMarkdownSyntaxError(error: unknown): boolean {
	const errorText = extractMaxErrorText(error);
	return (
		errorText.includes('some markdown syntax is not supported') ||
		(errorText.includes('markdown syntax') && errorText.includes('not supported')) ||
		errorText.includes('use basic formatting')
	);
}

export function isAttachmentNotReadyError(error: unknown): boolean {
	const errorText = extractMaxErrorText(error);
	return (
		errorText.includes('attachment.not.ready') ||
		errorText.includes('errors.process.attachment.file.not.processed') ||
		errorText.includes('file.not.processed')
	);
}

function containsMediaAttachments(value: unknown): boolean {
	if (!Array.isArray(value)) {
		return false;
	}

	return value.some((attachment) => {
		if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
			return false;
		}
		const type = (attachment as IDataObject)['type'];
		return typeof type === 'string' && ['image', 'video', 'audio', 'file'].includes(type);
	});
}

/** Supports both regular message bodies and the nested message body used by callback answers. */
export function hasMediaAttachments(body: IDataObject): boolean {
	if (containsMediaAttachments(body['attachments'])) {
		return true;
	}
	const nestedMessage = body['message'];
	return Boolean(
		nestedMessage &&
			typeof nestedMessage === 'object' &&
			!Array.isArray(nestedMessage) &&
			containsMediaAttachments((nestedMessage as IDataObject)['attachments']),
	);
}

export function stripMarkdownFormatting(text: string): string {
	let sanitizedText = text;
	sanitizedText = sanitizedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
	sanitizedText = sanitizedText.replace(/```([\s\S]*?)```/g, '$1');
	sanitizedText = sanitizedText.replace(/`([^`]+)`/g, '$1');
	sanitizedText = sanitizedText.replace(/(\*\*|__|~~|\+\+|\^\^)([\s\S]*?)\1/g, '$2');
	sanitizedText = sanitizedText.replace(/(\*|_)([^*_]+)\1/g, '$2');
	sanitizedText = sanitizedText.replace(/\\([\\`*_{}[\]()#+\-.!~])/g, '$1');
	return sanitizedText;
}

function plainTextBody(value: IDataObject): IDataObject | undefined {
	if (value['format'] !== 'markdown' || typeof value['text'] !== 'string') {
		return undefined;
	}

	const fallback = { ...value };
	const plainText = stripMarkdownFormatting(value['text']);
	fallback['text'] = plainText.trim().length > 0 ? plainText : value['text'];
	delete fallback['format'];
	return fallback;
}

/** Builds one retry body with Markdown formatting removed, including callback answer messages. */
export function buildPlainTextFallbackBody(body: IDataObject): IDataObject | undefined {
	const topLevelFallback = plainTextBody(body);
	if (topLevelFallback) {
		return topLevelFallback;
	}

	const nestedMessage = body['message'];
	if (!nestedMessage || typeof nestedMessage !== 'object' || Array.isArray(nestedMessage)) {
		return undefined;
	}
	const nestedFallback = plainTextBody(nestedMessage as IDataObject);
	return nestedFallback ? { ...body, message: nestedFallback } : undefined;
}
