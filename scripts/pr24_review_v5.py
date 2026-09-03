from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_function(text: str, signature: str, replacement: str) -> str:
    start = text.find(signature)
    if start < 0:
        raise RuntimeError(f"Could not find {signature}")
    brace = text.find("{", start)
    if brace < 0:
        raise RuntimeError(f"Could not find body for {signature}")
    depth = 0
    quote: str | None = None
    escaped = False
    for index in range(brace, len(text)):
        char = text[index]
        if escaped:
            escaped = False
            continue
        if quote is not None:
            if char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {"'", '"', '`'}:
            quote = char
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[:start] + replacement + text[index + 1 :]
    raise RuntimeError(f"Could not find closing brace for {signature}")


def ensure_value_import(text: str, names: list[str]) -> str:
    pattern = re.compile(r"import \{([^}]*)\} from 'n8n-workflow';", re.S)
    match = pattern.search(text)
    if not match:
        raise RuntimeError("Could not find n8n-workflow value import")
    current = [part.strip() for part in match.group(1).split(",") if part.strip()]
    for name in names:
        if name not in current:
            current.append(name)
    current = sorted(current)
    return text[: match.start()] + "import { " + ", ".join(current) + " } from 'n8n-workflow';" + text[match.end() :]


def ensure_type_import(text: str, name: str) -> str:
    pattern = re.compile(r"import type \{([^}]*)\} from 'n8n-workflow';", re.S)
    match = pattern.search(text)
    if not match:
        raise RuntimeError("Could not find n8n-workflow type import")
    current = [part.strip() for part in match.group(1).split(",") if part.strip()]
    if name not in current:
        current.append(name)
    current = sorted(current)
    return text[: match.start()] + "import type { " + ", ".join(current) + " } from 'n8n-workflow';" + text[match.end() :]


def write_regression_tests() -> None:
    write(
        "nodes/Max/tests/MaxApiReviewRegression.test.ts",
        r'''import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { MaxEventProcessor } from '../MaxEventProcessor';
import { maxApiRequest, requireRecipientId } from '../MaxApiRequest';
import { toPunycodeUrl } from '../MaxWebhookManager';

function makeContext(httpRequest: jest.Mock): IExecuteFunctions {
	return {
		getCredentials: jest.fn().mockResolvedValue({
			accessToken: 'token',
			baseUrl: 'https://platform-api.max.ru',
		}),
		getNode: jest.fn().mockReturnValue({
			id: 'node-id',
			name: 'Max API',
			type: 'n8n-nodes-max.maxApiOperations',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		helpers: { httpRequest },
	} as unknown as IExecuteFunctions;
}

describe('MAX API review regressions', () => {
	it('normalizes internationalized webhook domains', () => {
		expect(toPunycodeUrl('https://пример.рф/webhook')).toBe(
			'https://xn--e1afmkfd.xn--p1ai/webhook',
		);
	});

	it('rejects recipient ID zero before the HTTP request', () => {
		expect(() => requireRecipientId('0')).toThrow(/must not be 0/i);
	});

	it('retries unsupported Markdown once as plain text', async () => {
		const httpRequest = jest
			.fn()
			.mockRejectedValueOnce({ message: 'Some Markdown syntax is not supported' })
			.mockResolvedValueOnce({ success: true });

		await expect(
			maxApiRequest(makeContext(httpRequest), {
				method: 'POST',
				path: '/messages',
				body: { text: '**bold** and [link](https://example.com)', format: 'markdown' },
			}),
		).resolves.toEqual({ success: true });

		expect(httpRequest).toHaveBeenCalledTimes(2);
		expect(httpRequest.mock.calls[1][0]).toMatchObject({
			url: 'https://platform-api2.max.ru/messages',
			body: { text: 'bold and link (https://example.com)' },
		});
	});

	it('retries media attachments while MAX is processing them', async () => {
		const httpRequest = jest
			.fn()
			.mockRejectedValueOnce({
				response: {
					body: {
						code: 'attachment.not.ready',
						message: 'errors.process.attachment.file.not.processed',
					},
				},
			})
			.mockResolvedValueOnce({ success: true });

		await expect(
			maxApiRequest(makeContext(httpRequest), {
				method: 'POST',
				path: '/messages',
				body: { attachments: [{ type: 'video', payload: { token: 'new-token' } }] },
			}),
		).resolves.toEqual({ success: true });

		expect(httpRequest).toHaveBeenCalledTimes(2);
	});

	it('keeps terminal API failures as NodeApiError', async () => {
		const httpRequest = jest.fn().mockRejectedValue({
			response: {
				statusCode: 503,
				body: { code: 'service.unavailable', message: 'Unavailable' },
			},
		});

		await expect(
			maxApiRequest(makeContext(httpRequest), { method: 'GET', path: '/me' }),
		).rejects.toBeInstanceOf(NodeApiError);
	});

	it.each([
		['bot_stopped', { chat_id: 11, user: { user_id: 12 } }],
		['dialog_cleared', { chat_id: 11, user: { user_id: 12 } }],
		['dialog_muted', { chat_id: 11, user: { user_id: 12 }, muted_until: 123 }],
		['dialog_unmuted', { chat_id: 11, user: { user_id: 12 } }],
		['dialog_removed', { chat_id: 11, user: { user_id: 12 } }],
		[
			'comment_created',
			{
				message: {
					timestamp: 1,
					recipient: { chat_id: 11, chat_type: 'channel', post_id: 'post-1' },
					sender: { user_id: 12 },
					body: { mid: 'comment-1', seq: 1, text: 'hello' },
				},
			},
		],
		[
			'comment_edited',
			{
				message: {
					timestamp: 1,
					recipient: { chat_id: 11, chat_type: 'channel', post_id: 'post-1' },
					sender: { user_id: 12 },
					body: { mid: 'comment-1', seq: 1, text: 'hello' },
				},
			},
		],
		[
			'comment_removed',
			{ message_id: 'comment-1', chat_id: 11, user_id: 12, post_id: 'post-1' },
		],
	])('processes %s as a supported valid event', (updateType, payload) => {
		const result = new MaxEventProcessor().processEventSpecificData(
			{ update_type: updateType, timestamp: 1, ...payload } as any,
			updateType,
		);
		expect(result.event_context.is_supported).toBe(true);
		expect(result.validation_status.is_valid).toBe(true);
	});

	it('documents the published surface and leaves only permanent CI', () => {
		const root = join(__dirname, '..', '..', '..');
		for (const file of ['README.md', 'AGENTS.md', 'CHANGELOG.md']) {
			expect(readFileSync(join(root, file), 'utf8')).toMatch(/Max API/i);
		}
		const credentials = readFileSync(join(root, 'credentials', 'MaxApi.credentials.ts'), 'utf8');
		expect(credentials).toContain("default: 'https://platform-api2.max.ru'");
		expect(credentials).toContain('platform-api.max.ru');
		expect(credentials).toContain('platform-api2.max.ru');
		const operations = readFileSync(join(root, 'nodes', 'Max', 'MaxApiOperations.node.ts'), 'utf8');
		expect(operations).toContain(
			'error instanceof NodeOperationError || error instanceof NodeApiError',
		);
		expect(operations).toContain('toPunycodeUrl(');
		expect(readdirSync(join(root, '.github', 'workflows')).sort()).toEqual(['ci.yml']);
		const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
		expect(ci).toMatch(/push:\s*\n\s*branches:\s*\[master\]/);
	});
});
''',
    )


def patch_request() -> None:
    path = "nodes/Max/MaxApiRequest.ts"
    text = read(path)
    text = text.replace("import { normalizeMaxBaseUrl } from './MaxApiBaseUrl';\n", "")
    text = ensure_value_import(text, ["ApplicationError", "NodeApiError"])
    text = ensure_type_import(text, "IHttpRequestOptions")

    if "function normalizeMaxBaseUrl(" not in text:
        normalize = """
const CURRENT_MAX_API_BASE_URL = 'https://platform-api2.max.ru';
const LEGACY_MAX_API_BASE_URL = 'https://platform-api.max.ru';

function normalizeMaxBaseUrl(value: unknown): string {
	const normalized = String(value ?? '')
		.trim()
		.replace(/\\/+$/, '');
	return !normalized || normalized === LEGACY_MAX_API_BASE_URL
		? CURRENT_MAX_API_BASE_URL
		: normalized;
}

"""
        text = text.replace("export async function maxApiRequest", normalize + "export async function maxApiRequest", 1)

    previous_helpers = text.find("const ATTACHMENT_READY_RETRY_DELAYS_MS =")
    request_start = text.find("export async function maxApiRequest")
    if previous_helpers >= 0 and previous_helpers < request_start:
        text = text[:previous_helpers] + text[request_start:]

    review_helpers = r'''
const REVIEW_ATTACHMENT_RETRY_DELAYS_MS =
	process.env.NODE_ENV === 'test' ? [0, 0, 0] : [700, 1500, 3000];

function reviewCompactQuery(query: IDataObject | undefined): IDataObject | undefined {
	if (!query) return undefined;
	const compact: IDataObject = {};
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== null && value !== '') compact[key] = value;
	}
	return Object.keys(compact).length > 0 ? compact : undefined;
}

function reviewErrorText(error: unknown): string {
	const candidates: unknown[] = [
		(error as { message?: unknown })?.message,
		(error as { description?: unknown })?.description,
		(error as { code?: unknown })?.code,
		(error as { response?: { body?: unknown } })?.response?.body,
		(error as { response?: { data?: unknown } })?.response?.data,
		(error as { body?: unknown })?.body,
	];
	const parts: string[] = [];
	for (const candidate of candidates) {
		if (typeof candidate === 'string' || typeof candidate === 'number') {
			parts.push(String(candidate));
			continue;
		}
		if (candidate && typeof candidate === 'object') {
			const object = candidate as Record<string, unknown>;
			for (const key of ['code', 'error', 'message', 'description', 'error_description']) {
				const value = object[key];
				if (typeof value === 'string' || typeof value === 'number') parts.push(String(value));
			}
		}
	}
	return parts.join(' ').toLowerCase();
}

function reviewIsMarkdownRejection(error: unknown): boolean {
	const text = reviewErrorText(error);
	return (
		text.includes('some markdown syntax is not supported') ||
		(text.includes('markdown syntax') && text.includes('not supported')) ||
		text.includes('use basic formatting')
	);
}

function reviewIsAttachmentProcessing(error: unknown): boolean {
	const text = reviewErrorText(error);
	return (
		text.includes('attachment.not.ready') ||
		text.includes('errors.process.attachment.file.not.processed') ||
		text.includes('file.not.processed')
	);
}

function reviewStripMarkdown(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
		.replace(/```([\s\S]*?)```/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/(\*\*|__|~~|\+\+|\^\^)([\s\S]*?)\1/g, '$2')
		.replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$)/g, '$1$2')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^>\s?/gm, '');
}

function reviewCloneBody(body: IDataObject | undefined): IDataObject | undefined {
	return body === undefined ? undefined : (JSON.parse(JSON.stringify(body)) as IDataObject);
}

function reviewDowngradeMarkdown(body: IDataObject | undefined): IDataObject | undefined {
	const copy = reviewCloneBody(body);
	if (!copy) return undefined;
	let changed = false;
	if (copy['format'] === 'markdown') {
		delete copy['format'];
		if (typeof copy['text'] === 'string') copy['text'] = reviewStripMarkdown(copy['text']);
		changed = true;
	}
	const nested = copy['message'];
	if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
		const message = nested as IDataObject;
		if (message['format'] === 'markdown') {
			delete message['format'];
			if (typeof message['text'] === 'string') {
				message['text'] = reviewStripMarkdown(message['text']);
			}
			changed = true;
		}
	}
	return changed ? copy : undefined;
}

function reviewHasMedia(body: IDataObject | undefined): boolean {
	if (!body) return false;
	const nested = body['message'];
	const attachments = Array.isArray(body['attachments'])
		? body['attachments']
		: nested && typeof nested === 'object' && !Array.isArray(nested)
			? (nested as IDataObject)['attachments']
			: undefined;
	return (
		Array.isArray(attachments) &&
		attachments.some((attachment) => {
			if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return false;
			return ['image', 'video', 'audio', 'file'].includes(
				String((attachment as IDataObject)['type'] ?? ''),
			);
		})
	);
}

async function reviewWait(delay: number): Promise<void> {
	if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

'''
    marker = "export async function maxApiRequest"
    if "const REVIEW_ATTACHMENT_RETRY_DELAYS_MS" not in text:
        text = text.replace(marker, review_helpers + marker, 1)

    replacement = r'''export async function maxApiRequest(
	context: IExecuteFunctions,
	options: {
		method: MaxHttpMethod;
		path: string;
		qs?: IDataObject;
		body?: IDataObject;
	},
): Promise<unknown> {
	const credentials = await context.getCredentials('maxApi');
	const baseUrl = normalizeMaxBaseUrl(credentials['baseUrl']);
	let body = reviewCloneBody(options.body);
	let markdownRetried = false;
	let attachmentRetry = 0;

	while (true) {
		const requestOptions: IHttpRequestOptions = {
			method: options.method,
			url: `${baseUrl}${options.path}`,
			headers: { Authorization: credentials['accessToken'] as string },
			json: true,
		};
		const query = reviewCompactQuery(options.qs);
		if (query) requestOptions.qs = query;
		if (body !== undefined) {
			requestOptions.body = body;
			requestOptions.headers = {
				...requestOptions.headers,
				'Content-Type': 'application/json',
			};
		}

		try {
			return await context.helpers.httpRequest(requestOptions);
		} catch (error) {
			const writesMessage =
				(options.path === '/messages' && ['POST', 'PUT'].includes(options.method)) ||
				(options.path === '/answers' && options.method === 'POST');
			if (
				writesMessage &&
				reviewHasMedia(body) &&
				reviewIsAttachmentProcessing(error) &&
				attachmentRetry < REVIEW_ATTACHMENT_RETRY_DELAYS_MS.length
			) {
				await reviewWait(REVIEW_ATTACHMENT_RETRY_DELAYS_MS[attachmentRetry]);
				attachmentRetry += 1;
				continue;
			}
			if (writesMessage && !markdownRetried && reviewIsMarkdownRejection(error)) {
				const plainBody = reviewDowngradeMarkdown(body);
				if (plainBody) {
					body = plainBody;
					markdownRetried = true;
					continue;
				}
			}
			if (error instanceof NodeApiError) throw error;
			throw new NodeApiError(context.getNode(), error as JsonObject);
		}
	}
}'''
    text = replace_function(text, "export async function maxApiRequest", replacement)

    recipient = r'''export function requireRecipientId(value: unknown): string {
	const recipientId = requireInt64(value, 'Recipient ID');
	if (recipientId === '0') {
		throw new ApplicationError(
			'Recipient ID must not be 0. Use chat_id or user_id from Max Trigger output.',
		);
	}
	return recipientId;
}'''
    if "export function requireRecipientId" in text:
        text = replace_function(text, "export function requireRecipientId", recipient)
    else:
        start = text.find("export function requireInt64")
        if start < 0:
            raise RuntimeError("Could not find requireInt64")
        brace = text.find("{", start)
        depth = 0
        for index in range(brace, len(text)):
            if text[index] == "{":
                depth += 1
            elif text[index] == "}":
                depth -= 1
                if depth == 0:
                    text = text[: index + 1] + "\n\n" + recipient + text[index + 1 :]
                    break
    write(path, text)


def patch_operations() -> None:
    path = "nodes/Max/MaxApiOperations.node.ts"
    text = read(path)
    text = ensure_value_import(text, ["NodeApiError"])
    if "import { toPunycodeUrl } from './MaxWebhookManager';" not in text:
        text = text.replace(
            "import { MAX_API_OPERATION_PROPERTIES } from './MaxApiOperationsDescription';",
            "import { MAX_API_OPERATION_PROPERTIES } from './MaxApiOperationsDescription';\nimport { toPunycodeUrl } from './MaxWebhookManager';",
            1,
        )
    if "requireRecipientId," not in text:
        text = text.replace("\trequireInt64,\n", "\trequireInt64,\n\trequireRecipientId,\n", 1)
    text = re.sub(
        r"const recipientId = requireInt64\(\s*getParameter<unknown>\(context, 'recipientId', itemIndex, ''\),\s*'Recipient ID',\s*\);",
        "const recipientId = requireRecipientId(\n\t\tgetParameter<unknown>(context, 'recipientId', itemIndex, ''),\n\t);",
        text,
        count=1,
    )
    if "const url = toPunycodeUrl(" not in text:
        text = re.sub(
            r"const url = requireString\(\s*getParameter<unknown>\(context, 'url', itemIndex, ''\),\s*'Webhook URL',\s*\);",
            "const url = toPunycodeUrl(\n\t\trequireString(getParameter<unknown>(context, 'url', itemIndex, ''), 'Webhook URL'),\n\t);",
            text,
            count=1,
        )
    text = text.replace(
        "if (error instanceof NodeOperationError) {",
        "if (error instanceof NodeOperationError || error instanceof NodeApiError) {",
    )
    if "requireRecipientId(" not in text or "const url = toPunycodeUrl(" not in text:
        raise RuntimeError("Could not apply operation fixes")
    write(path, text)


def patch_webhook_manager() -> None:
    path = "nodes/Max/MaxWebhookManager.ts"
    text = read(path)
    text = text.replace("import { normalizeMaxBaseUrl } from './MaxApiBaseUrl';\n", "")
    text = text.replace(
        "function toPunycodeUrl(urlString: string): string {",
        "export function toPunycodeUrl(urlString: string): string {",
    )
    if "private readonly DEFAULT_BASE_URL" not in text:
        text = text.replace(
            "export class MaxWebhookManager {",
            "export class MaxWebhookManager {\n\tprivate readonly DEFAULT_BASE_URL = 'https://platform-api.max.ru';",
            1,
        )
    text = text.replace(
        "const baseUrl = normalizeMaxBaseUrl(credentials['baseUrl']);",
        "const baseUrl = (credentials['baseUrl'] as string) || this.DEFAULT_BASE_URL;",
    )
    write(path, text)


def patch_credentials() -> None:
    path = "credentials/MaxApi.credentials.ts"
    text = read(path).replace(
        "default: 'https://platform-api.max.ru'", "default: 'https://platform-api2.max.ru'"
    )
    old = "baseURL: '={{$credentials.baseUrl}}'"
    new = (
        "baseURL: '={{$credentials.baseUrl === \"https://platform-api.max.ru\" "
        "? \"https://platform-api2.max.ru\" : $credentials.baseUrl}}'"
    )
    text = text.replace(old, new)
    if "platform-api2.max.ru" not in text:
        raise RuntimeError("Credential migration was not applied")
    write(path, text)

    test_path = "credentials/tests/MaxApi.credentials.test.ts"
    test = read(test_path).replace("https://platform-api.max.ru", "https://platform-api2.max.ru")
    test = test.replace(old, new)
    write(test_path, test)


def patch_event_types() -> None:
    config_path = "nodes/Max/MaxTriggerConfig.ts"
    config = read(config_path)
    config = config.replace(
        "recipient?: { chat_id: number; chat_type?: string; user_id?: number };",
        "recipient?: { chat_id: number; chat_type?: string; user_id?: number; post_id?: string };",
    )
    if "post_id?: string;" not in config:
        config = config.replace("\tcomment_id?: string;\n", "\tcomment_id?: string;\n\tpost_id?: string;\n")
    if "muted_until?: number;" not in config:
        config = config.replace("\tpost_id?: string;\n", "\tpost_id?: string;\n\tmuted_until?: number;\n")
    write(config_path, config)

    path = "nodes/Max/MaxEventProcessor.ts"
    text = read(path)
    process_start = text.find("public processEventSpecificData")
    validate_start = text.find("private validateEventPayload", process_start)
    if process_start < 0 or validate_start < 0:
        raise RuntimeError("Could not locate processor methods")
    process = text[process_start:validate_start]
    cases = """
			case 'bot_stopped':
			case 'dialog_cleared':
			case 'dialog_muted':
			case 'dialog_unmuted':
			case 'dialog_removed':
			case 'comment_created':
			case 'comment_edited':
			case 'comment_removed':
				({ data: eventSpecificData, context: eventContext } = this.processSupportedUpdate(
					bodyData,
					eventType,
				));
				break;

"""
    if "case 'bot_stopped':" not in process:
        process = process.replace("\t\t\tdefault:", cases + "\t\t\tdefault:", 1)
        text = text[:process_start] + process + text[validate_start:]

    supported = r'''private processSupportedUpdate(
		bodyData: MaxWebhookEvent,
		eventType: string,
	): { data: IDataObject; context: IEventContext } {
		const descriptions: Record<string, string> = {
			bot_stopped: 'User stopped the bot',
			dialog_cleared: 'User cleared the bot dialog history',
			dialog_muted: 'User muted the bot dialog',
			dialog_unmuted: 'User unmuted the bot dialog',
			dialog_removed: 'User removed the bot dialog',
			comment_created: 'A channel comment was created',
			comment_edited: 'A channel comment was edited',
			comment_removed: 'A channel comment was removed',
		};
		const message = bodyData.message;
		return {
			data: bodyData as unknown as IDataObject,
			context: {
				type: eventType,
				description: descriptions[eventType] ?? 'Supported MAX update',
				is_supported: true,
				chat_id: bodyData.chat_id ?? message?.recipient?.chat_id,
				user_id: bodyData.user_id ?? bodyData.user?.user_id ?? message?.sender?.user_id,
				message_id: bodyData.message_id ?? message?.body?.mid,
				post_id: bodyData.post_id ?? message?.recipient?.post_id,
				muted_until: bodyData.muted_until,
				user_locale: bodyData.user_locale,
			},
		};
	}'''
    if "private processSupportedUpdate(" in text:
        text = replace_function(text, "private processSupportedUpdate", supported)
    else:
        text = text.replace("\tprivate validateEventPayload(", "\t" + supported + "\n\n\tprivate validateEventPayload(", 1)

    validator = r'''private validateSupportedUpdate(
		bodyData: MaxWebhookEvent,
		eventType: string,
		errors: IEventValidationError[],
	): void {
		const requireField = (present: boolean, field: string) => {
			if (!present) errors.push({ field, message: `Missing ${field}`, severity: 'error' });
		};
		if (eventType === 'comment_created' || eventType === 'comment_edited') {
			requireField(Boolean(bodyData.message), 'message');
			return;
		}
		if (eventType === 'comment_removed') {
			requireField(Boolean(bodyData.message_id), 'message_id');
			requireField(bodyData.chat_id !== undefined, 'chat_id');
			requireField(bodyData.user_id !== undefined, 'user_id');
			return;
		}
		requireField(bodyData.chat_id !== undefined, 'chat_id');
		requireField(Boolean(bodyData.user), 'user');
		if (eventType === 'dialog_muted') {
			requireField(bodyData.muted_until !== undefined, 'muted_until');
		}
	}'''
    if "private validateSupportedUpdate(" in text:
        text = replace_function(text, "private validateSupportedUpdate", validator)
    else:
        text = text.replace("\tprivate validateEventPayload(", "\t" + validator + "\n\n\tprivate validateEventPayload(", 1)

    validate_start = text.find("private validateEventPayload")
    next_method = text.find("\n\tprivate ", validate_start + len("private validateEventPayload"))
    section_end = next_method if next_method >= 0 else len(text)
    validate = text[validate_start:section_end]
    validation_cases = """
			case 'bot_stopped':
			case 'dialog_cleared':
			case 'dialog_muted':
			case 'dialog_unmuted':
			case 'dialog_removed':
			case 'comment_created':
			case 'comment_edited':
			case 'comment_removed':
				this.validateSupportedUpdate(bodyData, eventType, errors);
				break;

"""
    if "this.validateSupportedUpdate(bodyData, eventType, errors);" not in validate:
        validate = validate.replace("\t\t\tcase 'bot_started':", validation_cases + "\t\t\tcase 'bot_started':", 1)
        text = text[:validate_start] + validate + text[section_end:]
    write(path, text)


def patch_docs() -> None:
    readme = read("README.md")
    if "## Max API — расширенные операции" not in readme:
        readme += """

## Max API — расширенные операции

Нода **Max API** дополняет обратно совместимую ноду **Max** и предоставляет актуальные операции для бота, сообщений, чатов, участников, администраторов, комментариев каналов и Webhook-подписок.

Идентификаторы `int64` вводятся строками без потери точности. Сложные вложения можно передать через **Attachments JSON**, а inline-клавиатуру — собрать в интерфейсе, включая кнопки `message`, `clipboard` и `open_app`. Webhook URL с интернациональным доменом автоматически преобразуется в Punycode.

`GET /chats` намеренно не представлен: с июня 2026 года метод не поддерживается MAX. Для production-сценариев используется **Max Trigger** с Webhook; Long Polling официально рекомендуется только для разработки и тестирования.
"""
    write("README.md", readme)

    agents = read("AGENTS.md")
    if "## Контракт расширенной ноды Max API" not in agents:
        agents += """

## Контракт расширенной ноды Max API

- `MaxApiOperations.node.ts` содержит расширенные ресурсы актуального Bot API; `Max.node.ts` остаётся обратно совместимой.
- `int64`-идентификаторы передаются строками, а нулевой ID получателя отклоняется до HTTP-запроса.
- Официальный endpoint — `https://platform-api2.max.ru`; сохранённое прежнее официальное значение прозрачно нормализуется в runtime и при проверке credentials.
- Отправка и редактирование сообщений повторяют защиту старой ноды: ограниченные повторы при обработке media и один fallback с Markdown на читаемый plain text.
- Webhook URL нормализуется в Punycode и в `Max Trigger`, и в ресурсе Subscription.
- Каждый объявленный trigger event должен возвращать `event_context.is_supported = true` и иметь regression-тест наблюдаемого результата.
- В PR запрещены временные self-mutating workflows; постоянный CI запускается для pull request и push в `master`.
"""
    write("AGENTS.md", agents)

    changelog = read("CHANGELOG.md")
    if "Расширенная нода `Max API`" not in changelog:
        lines = changelog.splitlines()
        index = 1 if lines and lines[0].startswith("#") else 0
        lines[index:index] = [
            "",
            "## Не выпущено",
            "",
            "### Добавлено",
            "",
            "- Расширенная нода `Max API` для бота, сообщений, чатов, участников, администраторов, комментариев и Webhook-подписок.",
            "- Актуальные события `Max Trigger` и кнопки inline-клавиатуры `message` и `clipboard`.",
            "",
            "### Исправлено",
            "",
            "- Punycode-нормализация Webhook URL, безопасные `int64`, media retry, Markdown fallback, сохранение `NodeApiError` и миграция credentials на `platform-api2.max.ru`.",
            "",
        ]
        changelog = "\n".join(lines) + "\n"
    write("CHANGELOG.md", changelog)


def implement() -> None:
    patch_request()
    patch_operations()
    patch_webhook_manager()
    patch_credentials()
    patch_event_types()
    patch_docs()


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"tests", "implement"}:
        raise SystemExit("usage: pr24_review_v5.py tests|implement")
    write_regression_tests() if sys.argv[1] == "tests" else implement()
