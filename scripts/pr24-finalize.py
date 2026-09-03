#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one occurrence, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def insert_before_once(path: str, marker: str, addition: str) -> None:
    text = read(path)
    if addition.strip() in text:
        return
    count = text.count(marker)
    if count != 1:
        raise RuntimeError(f"{path}: expected one marker, found {count}: {marker!r}")
    write(path, text.replace(marker, addition + marker, 1))


def add_named_import(path: str, module: str, name: str, *, type_only: bool = False) -> None:
    text = read(path)
    if re.search(rf"import[^;]*\b{re.escape(name)}\b[^;]*from ['\"]{re.escape(module)}['\"]", text, re.S):
        return
    prefix = "import type" if type_only else "import"
    pattern = re.compile(rf"({prefix}\s*\{{)(.*?)(\}}\s*from\s*['\"]{re.escape(module)}['\"];)", re.S)
    match = pattern.search(text)
    if not match:
        write(path, f"{prefix} {{ {name} }} from '{module}';\n" + text)
        return
    names = [part.strip() for part in match.group(2).split(',') if part.strip()]
    names.append(name)
    names = sorted(set(names))
    replacement = match.group(1) + "\n\t" + ",\n\t".join(names) + ",\n" + match.group(3)
    write(path, text[: match.start()] + replacement + text[match.end() :])


def replace_function_body(path: str, function_name: str, new_body: str) -> None:
    text = read(path)
    marker = f"export async function {function_name}"
    start = text.find(marker)
    if start < 0:
        raise RuntimeError(f"{path}: function {function_name} not found")
    open_brace = text.find("{", start)
    if open_brace < 0:
        raise RuntimeError(f"{path}: opening brace for {function_name} not found")
    depth = 0
    close_brace = -1
    for index in range(open_brace, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                close_brace = index
                break
    if close_brace < 0:
        raise RuntimeError(f"{path}: closing brace for {function_name} not found")
    replacement = "{\n" + new_body.rstrip() + "\n}"
    write(path, text[:open_brace] + replacement + text[close_brace + 1 :])


def add_tests() -> None:
    write(
        "nodes/Max/tests/MaxApiRequestResilience.test.ts",
        r'''import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { maxApiRequest } from '../MaxApiRequest';

function createContext(httpRequest: jest.Mock): IExecuteFunctions {
	return {
		getCredentials: jest.fn().mockResolvedValue({
			accessToken: 'token',
			baseUrl: 'https://platform-api.max.ru',
		}),
		getNode: jest.fn().mockReturnValue({
			name: 'Max API',
			type: 'n8n-nodes-max.maxApiOperations',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		helpers: { httpRequest },
	} as unknown as IExecuteFunctions;
}

describe('maxApiRequest resilience', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('retries rejected Markdown once as plain text', async () => {
		const httpRequest = jest
			.fn()
			.mockRejectedValueOnce({ message: 'Some Markdown syntax is not supported. Use basic formatting.' })
			.mockResolvedValueOnce({ success: true });

		await expect(
			maxApiRequest(createContext(httpRequest), {
				method: 'POST',
				path: '/messages',
				body: { text: '**bold**', format: 'markdown' },
			}),
		).resolves.toEqual({ success: true });

		expect(httpRequest).toHaveBeenCalledTimes(2);
		const retry = httpRequest.mock.calls[1][0] as IHttpRequestOptions;
		expect(retry.url).toBe('https://platform-api2.max.ru/messages');
		expect(retry.body).toEqual({ text: 'bold' });
	});

	it('retries media attachments while MAX is processing them', async () => {
		jest.spyOn(global, 'setTimeout').mockImplementation(((callback: () => void) => {
			callback();
			return 0;
		}) as unknown as typeof setTimeout);

		const httpRequest = jest
			.fn()
			.mockRejectedValueOnce({ code: 'attachment.not.ready' })
			.mockRejectedValueOnce({ message: 'errors.process.attachment.file.not.processed' })
			.mockResolvedValueOnce({ success: true });

		await expect(
			maxApiRequest(createContext(httpRequest), {
				method: 'POST',
				path: '/messages',
				body: {
					text: 'video',
					attachments: [{ type: 'video', payload: { token: 'video-token' } }],
				},
			}),
		).resolves.toEqual({ success: true });

		expect(httpRequest).toHaveBeenCalledTimes(3);
	});
});
''',
    )

    write(
        "nodes/Max/tests/MaxApiReviewFixes.node.test.ts",
        r'''import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { MaxApiOperations } from '../MaxApiOperations.node';

function createContext(
	parameters: Record<string, unknown>,
	httpRequest: jest.Mock,
): IExecuteFunctions {
	return {
		getInputData: jest.fn().mockReturnValue([{ json: {} } as INodeExecutionData]),
		getNodeParameter: jest.fn((name: string, _index: number, defaultValue?: unknown) =>
			Object.prototype.hasOwnProperty.call(parameters, name) ? parameters[name] : defaultValue,
		),
		getCredentials: jest.fn().mockResolvedValue({
			accessToken: 'token',
			baseUrl: 'https://platform-api.max.ru',
		}),
		getNode: jest.fn().mockReturnValue({
			name: 'Max API',
			type: 'n8n-nodes-max.maxApiOperations',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		continueOnFail: jest.fn().mockReturnValue(false),
		helpers: { httpRequest },
	} as unknown as IExecuteFunctions;
}

const messageDefaults: Record<string, unknown> = {
	resource: 'message',
	operation: 'send',
	sendTo: 'user',
	text: 'hello',
	format: 'plain',
	attachmentsJson: '',
	keyboard: {},
	clearAttachments: false,
	replyToMessageId: '',
	forwardMessageId: '',
	notify: true,
	disableLinkPreview: false,
};

describe('Max API review fixes', () => {
	it('normalizes internationalized webhook hosts before subscription creation', async () => {
		const httpRequest = jest.fn().mockResolvedValue({ success: true });
		const context = createContext(
			{
				resource: 'subscription',
				operation: 'create',
				url: 'https://пример.рф/webhook',
				updateTypes: ['message_created'],
				secret: '',
				version: '',
			},
			httpRequest,
		);

		await new MaxApiOperations().execute.call(context);

		expect(httpRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({ url: 'https://xn--e1afmkfd.xn--p1ai/webhook' }),
			}),
		);
	});

	it('rejects recipient ID zero before making a request', async () => {
		const httpRequest = jest.fn();
		const context = createContext({ ...messageDefaults, recipientId: '0' }, httpRequest);

		await expect(new MaxApiOperations().execute.call(context)).rejects.toBeInstanceOf(
			NodeOperationError,
		);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	it('preserves NodeApiError for upstream MAX failures', async () => {
		const httpRequest = jest.fn().mockRejectedValue({
			statusCode: 503,
			body: { code: 'temporary', message: 'Service unavailable' },
		});
		const context = createContext({ resource: 'bot', operation: 'get' }, httpRequest);

		await expect(new MaxApiOperations().execute.call(context)).rejects.toBeInstanceOf(NodeApiError);
	});
});
''',
    )

    write(
        "nodes/Max/tests/MaxEventProcessorCurrentEvents.test.ts",
        r'''import type { MaxWebhookEvent } from '../MaxTriggerConfig';
import { MaxEventProcessor } from '../MaxEventProcessor';

const user = {
	user_id: 42,
	name: 'User',
	username: 'user',
	is_bot: false,
	last_activity_time: 1,
};

function message(commentId = 'mid.comment'): MaxWebhookEvent['message'] {
	return {
		timestamp: 1,
		sender: user,
		recipient: { chat_id: -100, chat_type: 'channel', post_id: 'mid.post' },
		body: { mid: commentId, seq: 1, text: 'comment' },
	};
}

describe('MaxEventProcessor current MAX events', () => {
	it.each([
		['bot_stopped', { chat_id: 42, user, user_locale: 'ru' }],
		['dialog_cleared', { chat_id: 42, user, user_locale: 'ru' }],
		['dialog_muted', { chat_id: 42, user, user_locale: 'ru', muted_until: 999 }],
		['dialog_unmuted', { chat_id: 42, user, user_locale: 'ru' }],
		['dialog_removed', { chat_id: 42, user, user_locale: 'ru' }],
		['comment_created', { message: message('mid.created') }],
		['comment_edited', { message: message('mid.edited') }],
		[
			'comment_removed',
			{ message_id: 'mid.removed', chat_id: -100, user_id: 42, post_id: 'mid.post' },
		],
	] as const)('marks %s as supported and validates its payload', (updateType, payload) => {
		const event = {
			update_type: updateType,
			timestamp: 1,
			...payload,
		} as unknown as MaxWebhookEvent;

		const result = new MaxEventProcessor().processEventSpecificData(event, updateType);

		expect(result.event_context.type).toBe(updateType);
		expect(result.event_context.is_supported).toBe(true);
		expect(result.validation_status.is_valid).toBe(true);
	});
});
''',
    )


def implement() -> None:
    write(
        "nodes/Max/MaxUrlUtils.ts",
        r'''import { URL, domainToASCII } from 'node:url';

export const CURRENT_MAX_API_BASE_URL = 'https://platform-api2.max.ru';
const LEGACY_MAX_API_BASE_URL = 'https://platform-api.max.ru';

export function normalizeMaxApiBaseUrl(value: unknown): string {
	const baseUrl = String(value ?? '')
		.trim()
		.replace(/\/+$/, '');
	if (!baseUrl || baseUrl === LEGACY_MAX_API_BASE_URL) {
		return CURRENT_MAX_API_BASE_URL;
	}
	return baseUrl;
}

export function normalizeMaxWebhookUrl(value: string): string {
	const parsed = new URL(value);
	if (parsed.protocol !== 'https:') {
		throw new Error('Webhook URL must use HTTPS');
	}
	if (parsed.port && parsed.port !== '443') {
		throw new Error('Webhook URL must use port 443');
	}
	const asciiHostname = domainToASCII(parsed.hostname);
	if (!asciiHostname) {
		throw new Error('Webhook URL contains an invalid hostname');
	}
	parsed.hostname = asciiHostname;
	parsed.port = '';
	return parsed.toString();
}
''',
    )

    # Credentials use the same current host as execution, including saved legacy defaults.
    replace_once(
        "credentials/MaxApi.credentials.ts",
        "default: 'https://platform-api.max.ru',",
        "default: 'https://platform-api2.max.ru',",
    )
    replace_once(
        "credentials/MaxApi.credentials.ts",
        "baseURL: '={{$credentials.baseUrl}}',",
        "baseURL: \"={{$credentials.baseUrl === 'https://platform-api.max.ru' ? 'https://platform-api2.max.ru' : $credentials.baseUrl}}\",",
    )

    # Share host and webhook URL normalization with the existing nodes.
    webhook_path = "nodes/Max/MaxWebhookManager.ts"
    webhook = read(webhook_path)
    webhook = webhook.replace("import { URL, domainToASCII } from 'node:url';\n", "")
    old_url_helper = r'''/**
 * Convert URL hostname to punycode so MAX can validate TLS certificates
 * for internationalized domain names (IDN).
 */
function toPunycodeUrl(urlString: string): string {
	try {
		const parsedUrl = new URL(urlString);
		parsedUrl.hostname = domainToASCII(parsedUrl.hostname);
		return parsedUrl.toString();
	} catch {
		return urlString;
	}
}

'''
    if old_url_helper not in webhook:
        raise RuntimeError("MaxWebhookManager.ts: legacy URL helper not found")
    webhook = webhook.replace(old_url_helper, "", 1)
    webhook = webhook.replace("toPunycodeUrl(rawWebhookUrl)", "normalizeMaxWebhookUrl(rawWebhookUrl)")
    webhook = webhook.replace(
        "private readonly DEFAULT_BASE_URL = 'https://platform-api.max.ru';",
        "private readonly DEFAULT_BASE_URL = CURRENT_MAX_API_BASE_URL;",
    )
    webhook = webhook.replace(
        "const baseUrl = (credentials['baseUrl'] as string) || this.DEFAULT_BASE_URL;",
        "const baseUrl = normalizeMaxApiBaseUrl(credentials['baseUrl'] || this.DEFAULT_BASE_URL);",
    )
    write(webhook_path, webhook)
    add_named_import(webhook_path, "./MaxUrlUtils", "CURRENT_MAX_API_BASE_URL")
    add_named_import(webhook_path, "./MaxUrlUtils", "normalizeMaxApiBaseUrl")
    add_named_import(webhook_path, "./MaxUrlUtils", "normalizeMaxWebhookUrl")

    generic_path = "nodes/Max/GenericFunctions.ts"
    generic = read(generic_path)
    generic = generic.replace(
        "const DEFAULT_MAX_BASE_URL = 'https://platform-api.max.ru';",
        "const DEFAULT_MAX_BASE_URL = CURRENT_MAX_API_BASE_URL;",
    )
    generic = generic.replace(
        "(credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL",
        "normalizeMaxApiBaseUrl(credentials['baseUrl'] || DEFAULT_MAX_BASE_URL)",
    )
    write(generic_path, generic)
    add_named_import(generic_path, "./MaxUrlUtils", "CURRENT_MAX_API_BASE_URL")
    add_named_import(generic_path, "./MaxUrlUtils", "normalizeMaxApiBaseUrl")

    # Resilient request wrapper for the new Max API node.
    request_path = "nodes/Max/MaxApiRequest.ts"
    add_named_import(request_path, "n8n-workflow", "JsonObject", type_only=True)
    add_named_import(request_path, "./MaxUrlUtils", "normalizeMaxApiBaseUrl")
    resilience_helpers = r'''
const MAX_API_ATTACHMENT_RETRY_DELAYS_MS = [700, 1500, 3000];

function getMaxApiErrorText(error: unknown): string {
	const values: unknown[] = [error];
	const result: string[] = [];
	while (values.length > 0) {
		const value = values.shift();
		if (typeof value === 'string' || typeof value === 'number') {
			result.push(String(value).toLowerCase());
		} else if (value && typeof value === 'object') {
			const object = value as Record<string, unknown>;
			for (const key of ['message', 'description', 'code', 'error', 'body', 'data', 'response']) {
				if (object[key] !== undefined) values.push(object[key]);
			}
		}
	}
	return result.join(' ');
}

function isUnsupportedMarkdownError(error: unknown): boolean {
	const text = getMaxApiErrorText(error);
	return (
		text.includes('some markdown syntax is not supported') ||
		(text.includes('markdown syntax') && text.includes('not supported')) ||
		text.includes('use basic formatting')
	);
}

function isAttachmentNotReadyError(error: unknown): boolean {
	const text = getMaxApiErrorText(error);
	return (
		text.includes('attachment.not.ready') ||
		text.includes('errors.process.attachment.file.not.processed') ||
		text.includes('file.not.processed')
	);
}

function hasMediaAttachments(body: IDataObject | undefined): boolean {
	const attachments = body?.['attachments'];
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

function stripUnsupportedMarkdown(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
		.replace(/```([\s\S]*?)```/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/(\*\*|__|~~|\+\+|\^\^)(.*?)\1/g, '$2')
		.replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
		.replace(/(^|[^_])_([^_]+)_/g, '$1$2')
		.replace(/^\s*#{1,6}\s+/gm, '')
		.replace(/^\s*>\s?/gm, '');
}

function compactQuery(query: IDataObject | undefined): IDataObject | undefined {
	if (!query) return undefined;
	const entries = Object.entries(query).filter(
		([, value]) => value !== undefined && value !== null && value !== '',
	);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

async function waitForMaxAttachment(delayMs: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, delayMs));
}

'''
    insert_before_once(request_path, "export async function maxApiRequest", resilience_helpers)
    replace_function_body(
        request_path,
        "maxApiRequest",
        r'''	const credentials = await context.getCredentials('maxApi');
	const accessToken = requireString(credentials['accessToken'], 'Access Token');
	const baseUrl = normalizeMaxApiBaseUrl(credentials['baseUrl']);
	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${baseUrl}${options.path}`,
		headers: { Authorization: accessToken },
		json: true,
	};
	const query = compactQuery(options.qs);
	if (query) requestOptions.qs = query;
	if (options.body !== undefined) requestOptions.body = { ...options.body };

	let markdownRetried = false;
	let attachmentRetryIndex = 0;
	for (;;) {
		try {
			return await context.helpers.httpRequest(requestOptions);
		} catch (error) {
			const body = requestOptions.body as IDataObject | undefined;
			if (!markdownRetried && body?.['format'] === 'markdown' && isUnsupportedMarkdownError(error)) {
				const plainBody: IDataObject = { ...body };
				delete plainBody['format'];
				if (typeof plainBody['text'] === 'string') {
					plainBody['text'] = stripUnsupportedMarkdown(plainBody['text']);
				}
				requestOptions.body = plainBody;
				markdownRetried = true;
				continue;
			}

			if (
				attachmentRetryIndex < MAX_API_ATTACHMENT_RETRY_DELAYS_MS.length &&
				hasMediaAttachments(body) &&
				isAttachmentNotReadyError(error)
			) {
				await waitForMaxAttachment(MAX_API_ATTACHMENT_RETRY_DELAYS_MS[attachmentRetryIndex]);
				attachmentRetryIndex += 1;
				continue;
			}

			if (error instanceof NodeApiError) throw error;
			throw new NodeApiError(context.getNode(), error as JsonObject);
		}
	}''',
    )

    # Max API operation behavior and error preservation.
    operations_path = "nodes/Max/MaxApiOperations.node.ts"
    add_named_import(operations_path, "n8n-workflow", "NodeApiError")
    add_named_import(operations_path, "./MaxUrlUtils", "normalizeMaxWebhookUrl")
    operations = read(operations_path)
    recipient_pattern = re.compile(
        r"(const recipientId = requireInt64\([\s\S]*?'Recipient ID',\n\t\);)",
        re.M,
    )
    recipient_match = recipient_pattern.search(operations)
    if not recipient_match:
        raise RuntimeError("MaxApiOperations.node.ts: recipient assignment not found")
    recipient_guard = recipient_match.group(1) + r'''
	if (recipientId === '0') {
		throw new ApplicationError(
			'Recipient ID cannot be 0. Use a valid User ID or Chat ID from a Max Trigger event',
		);
	}'''
    operations = operations[: recipient_match.start()] + recipient_guard + operations[recipient_match.end() :]

    url_pattern = re.compile(
        r"const url = requireString\(\n(\s*getParameter<unknown>\(context, 'url', itemIndex, ''\),\n\s*'Webhook URL',\n\s*)\);"
    )
    url_match = url_pattern.search(operations)
    if not url_match:
        raise RuntimeError("MaxApiOperations.node.ts: subscription URL assignment not found")
    operations = (
        operations[: url_match.start()]
        + "const url = normalizeMaxWebhookUrl(\n"
        + "\t\trequireString(\n"
        + url_match.group(1).replace("\n", "\n\t")
        + "\t),\n\t);"
        + operations[url_match.end() :]
    )
    operations = operations.replace(
        "if (error instanceof NodeOperationError) {",
        "if (error instanceof NodeOperationError || error instanceof NodeApiError) {",
    )
    write(operations_path, operations)

    # Current trigger payload fields.
    config_path = "nodes/Max/MaxTriggerConfig.ts"
    config = read(config_path)
    config = config.replace(
        "recipient?: { chat_id: number; chat_type?: string; user_id?: number };",
        "recipient?: { chat_id: number; chat_type?: string; user_id?: number; post_id?: string };",
    )
    if "\tmuted_until?: number;" not in config:
        config = config.replace("\tchat_id?: number;\n", "\tchat_id?: number;\n\tmuted_until?: number;\n\tpost_id?: string;\n", 1)
    write(config_path, config)

    processor_path = "nodes/Max/MaxEventProcessor.ts"
    processor = read(processor_path)
    process_anchor = r'''			case 'bot_started':
				({ data: eventSpecificData, context: eventContext } =
					this.processBotStartedEvent(bodyData));
				break;
'''
    process_addition = process_anchor + r'''
			case 'bot_stopped':
			case 'dialog_cleared':
			case 'dialog_muted':
			case 'dialog_unmuted':
			case 'dialog_removed':
			case 'comment_created':
			case 'comment_edited':
			case 'comment_removed':
				({ data: eventSpecificData, context: eventContext } =
					this.processCurrentApiEvent(bodyData, eventType));
				break;
'''
    if process_anchor not in processor:
        raise RuntimeError("MaxEventProcessor.ts: process switch anchor not found")
    processor = processor.replace(process_anchor, process_addition, 1)

    validation_anchor = r'''			case 'bot_started':
				this.validateBotStartedEvent(bodyData, errors, warnings);
				break;
'''
    validation_addition = validation_anchor + r'''
			case 'bot_stopped':
			case 'dialog_cleared':
			case 'dialog_muted':
			case 'dialog_unmuted':
			case 'dialog_removed':
			case 'comment_created':
			case 'comment_edited':
			case 'comment_removed':
				this.validateCurrentApiEvent(bodyData, eventType, errors);
				break;
'''
    if validation_anchor not in processor:
        raise RuntimeError("MaxEventProcessor.ts: validation switch anchor not found")
    processor = processor.replace(validation_anchor, validation_addition, 1)

    current_event_methods = r'''
	private processCurrentApiEvent(
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
		const chatId = bodyData.chat_id ?? message?.recipient?.chat_id;
		const user = bodyData.user ?? message?.sender;
		const commentId = bodyData.message_id ?? message?.body?.mid;
		const postId = bodyData.post_id ?? message?.recipient?.post_id;
		const category = eventType.startsWith('comment_')
			? 'comment'
			: eventType.startsWith('dialog_')
				? 'dialog'
				: 'bot';
		const context: IEventContext = {
			type: eventType,
			description: descriptions[eventType] ?? 'MAX Bot API event',
			is_supported: true,
			event_category: category,
		};
		if (chatId !== undefined) context.chat_id = chatId;
		if (user?.user_id !== undefined) context.user_id = user.user_id;
		if (commentId !== undefined) context.comment_id = commentId;
		if (postId !== undefined) context.post_id = postId;
		if (bodyData.muted_until !== undefined) context.muted_until = bodyData.muted_until;
		return { data: { ...(bodyData as unknown as IDataObject) }, context };
	}

	private validateCurrentApiEvent(
		bodyData: MaxWebhookEvent,
		eventType: string,
		errors: IEventValidationError[],
	): void {
		const requireField = (field: string, value: unknown): void => {
			if (value === undefined || value === null || value === '') {
				errors.push({ field, message: `Missing ${field}`, severity: 'error' });
			}
		};

		if (eventType === 'comment_created' || eventType === 'comment_edited') {
			requireField('message', bodyData.message);
			requireField('message.body.mid', bodyData.message?.body?.mid);
			return;
		}
		if (eventType === 'comment_removed') {
			requireField('message_id', bodyData.message_id);
			requireField('chat_id', bodyData.chat_id);
			requireField('user_id', bodyData.user_id);
			return;
		}

		requireField('chat_id', bodyData.chat_id);
		requireField('user', bodyData.user);
		if (eventType === 'dialog_muted') requireField('muted_until', bodyData.muted_until);
	}

'''
    declaration_match = re.search(r"\n\tprivate processGenericEvent\(", processor)
    if not declaration_match:
        raise RuntimeError("MaxEventProcessor.ts: processGenericEvent declaration not found")
    processor = processor[: declaration_match.start() + 1] + current_event_methods + processor[declaration_match.start() + 1 :]
    write(processor_path, processor)

    # Permanent CI must verify master and pull requests, never mutate branches.
    ci_path = ".github/workflows/ci.yml"
    ci = read(ci_path)
    ci = ci.replace("      - feature/max-api-coverage-23", "      - master")
    ci = ci.replace("      - 'feature/max-api-coverage-23'", "      - master")
    write(ci_path, ci)

    # User-facing and contributor documentation.
    readme = read("README.md")
    readme_marker = "<!-- max-api-operations -->"
    if readme_marker not in readme:
        section = r'''
<!-- max-api-operations -->
## Доступные ноды

- **Max** — обратно совместимые операции отправки, удаления сообщений, работы с вложениями и чатами.
- **Max API** — расширенное покрытие актуального Bot API: бот и команды, сообщения, чаты, участники, администраторы, комментарии и Webhook-подписки.
- **Max Trigger** — получение событий через Webhook, включая события остановки бота, диалогов и комментариев.

Для новых сценариев используйте **Max API**. Существующие workflow с нодой **Max** продолжают работать без миграции. Официальный API-хост — `https://platform-api2.max.ru`; сохранённое старое официальное значение заменяется автоматически. Идентификаторы `int64` вводятся строками, чтобы JavaScript не терял точность.

'''
        first_newline = readme.find("\n")
        readme = readme[: first_newline + 1] + section + readme[first_newline + 1 :]
        write("README.md", readme)

    agents = read("AGENTS.md")
    agents_marker = "<!-- max-api-review-contract -->"
    if agents_marker not in agents:
        section = r'''
<!-- max-api-review-contract -->
## Контракт расширенной ноды Max API

Нода `MaxApiOperations` дополняет обратно совместимые `Max` и `Max Trigger`. Она покрывает ресурсы Bot, Message, Chat, Chat Member, Chat Administrator, Comment и Subscription. При изменении этой поверхности одновременно обновляйте описание ноды, тесты, README и CHANGELOG.

Обязательные инварианты:

- официальный хост `platform-api2.max.ru`; точное старое значение `platform-api.max.ru` мигрирует прозрачно, пользовательские URL не переписываются;
- Webhook URL нормализуется в Punycode и допускает только HTTPS/443;
- неподдержанный Markdown повторяется один раз как простой текст;
- `attachment.not.ready` и `errors.process.attachment.file.not.processed` повторяются ограниченно с возрастающей задержкой;
- локальные ошибки ввода возвращаются как `NodeOperationError`, а структурированные ошибки MAX сохраняются как `NodeApiError`;
- recipient ID `0` отклоняется до HTTP-запроса;
- каждый тип события, доступный в `Max Trigger`, должен иметь поддерживаемый контекст и regression-тест;
- временные workflow, меняющие собственную ветку, запрещены; постоянный CI только проверяет PR и push в `master`.

'''
        first_newline = agents.find("\n")
        agents = agents[: first_newline + 1] + section + agents[first_newline + 1 :]
        write("AGENTS.md", agents)

    changelog = read("CHANGELOG.md")
    changelog_marker = "<!-- max-api-coverage-release -->"
    if changelog_marker not in changelog:
        section = r'''
<!-- max-api-coverage-release -->
## Не выпущено

### Добавлено

- новая нода `Max API` для актуальных методов Bot, Message, Chat, Chat Member, Chat Administrator, Comment и Subscription;
- события остановки бота, управления диалогом и комментариями в `Max Trigger`;
- кнопки `message` и `clipboard` для inline-клавиатуры;
- контрактные и regression-тесты для новых API-путей и событий.

### Исправлено

- переход на `platform-api2.max.ru` с совместимостью сохранённых credentials;
- Punycode-нормализация Webhook URL;
- повтор отправки после временной обработки вложений и fallback неподдержанного Markdown;
- сохранение точности `int64`, значений `false`/`0` в query и структурированных `NodeApiError`.

'''
        first_newline = changelog.find("\n")
        changelog = changelog[: first_newline + 1] + section + changelog[first_newline + 1 :]
        write("CHANGELOG.md", changelog)

    # Update existing expectations for the current official host.
    for test_path in [
        "credentials/tests/MaxApi.credentials.test.ts",
        "nodes/Max/tests/MaxWebhookManager.test.ts",
        "nodes/Max/tests/GenericFunctions.test.ts",
        "nodes/Max/tests/MaxApiRequest.test.ts",
    ]:
        path = ROOT / test_path
        if path.exists():
            text = path.read_text(encoding="utf-8")
            text = text.replace("https://platform-api.max.ru", "https://platform-api2.max.ru")
            path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=["tests", "implementation"])
    args = parser.parse_args()
    if args.phase == "tests":
        add_tests()
    else:
        implement()


if __name__ == "__main__":
    main()
