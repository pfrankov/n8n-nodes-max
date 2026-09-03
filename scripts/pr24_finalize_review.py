from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise RuntimeError(f"Could not find {label}")
    return text.replace(old, new, 1)


def replace_function(text: str, name: str, replacement: str) -> str:
    marker = f"export async function {name}"
    start = text.find(marker)
    if start < 0:
        raise RuntimeError(f"Could not find function {name}")
    brace = text.find("{", start)
    if brace < 0:
        raise RuntimeError(f"Could not find opening brace for {name}")
    depth = 0
    in_single = in_double = in_template = False
    escaped = False
    for index in range(brace, len(text)):
        char = text[index]
        if escaped:
            escaped = False
            continue
        if char == "\\" and (in_single or in_double or in_template):
            escaped = True
            continue
        if not in_double and not in_template and char == "'":
            in_single = not in_single
            continue
        if not in_single and not in_template and char == '"':
            in_double = not in_double
            continue
        if not in_single and not in_double and char == "`":
            in_template = not in_template
            continue
        if in_single or in_double or in_template:
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[:start] + replacement + text[index + 1 :]
    raise RuntimeError(f"Could not find closing brace for {name}")


def write_tests() -> None:
    test = r'''import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { MaxEventProcessor } from '../MaxEventProcessor';
import { toPunycodeUrl } from '../MaxWebhookManager';
import { maxApiRequest, requireRecipientId } from '../MaxApiRequest';

function requestContext(httpRequest: jest.Mock): IExecuteFunctions {
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

describe('review regressions for the expanded MAX API node', () => {
	it('normalizes internationalized webhook hostnames', () => {
		expect(toPunycodeUrl('https://пример.рф/webhook')).toBe(
			'https://xn--e1afmkfd.xn--p1ai/webhook',
		);
	});

	it('rejects a zero recipient ID locally', () => {
		expect(() => requireRecipientId('0')).toThrow(/must not be 0/i);
	});

	it('retries unsupported Markdown as readable plain text', async () => {
		const httpRequest = jest
			.fn()
			.mockRejectedValueOnce({ message: 'Some Markdown syntax is not supported' })
			.mockResolvedValueOnce({ success: true });

		await expect(
			maxApiRequest(requestContext(httpRequest), {
				method: 'POST',
				path: '/messages',
				body: { text: '**bold** and [link](https://example.com)', format: 'markdown' },
			}),
		).resolves.toEqual({ success: true });

		expect(httpRequest).toHaveBeenCalledTimes(2);
		expect(httpRequest.mock.calls[1][0].url).toBe('https://platform-api2.max.ru/messages');
		expect(httpRequest.mock.calls[1][0].body).toEqual({
			text: 'bold and link (https://example.com)',
		});
	});

	it('retries a newly uploaded media attachment while MAX is processing it', async () => {
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
			maxApiRequest(requestContext(httpRequest), {
				method: 'POST',
				path: '/messages',
				body: {
					attachments: [{ type: 'video', payload: { token: 'new-token' } }],
				},
			}),
		).resolves.toEqual({ success: true });

		expect(httpRequest).toHaveBeenCalledTimes(2);
	});

	it('keeps terminal upstream failures as NodeApiError', async () => {
		const httpRequest = jest.fn().mockRejectedValue({
			response: { statusCode: 503, body: { code: 'service.unavailable', message: 'Unavailable' } },
		});

		await expect(
			maxApiRequest(requestContext(httpRequest), { method: 'GET', path: '/me' }),
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
	])('marks %s as a supported, valid trigger event', (eventType, eventPayload) => {
		const result = new MaxEventProcessor().processEventSpecificData(
			{ update_type: eventType, timestamp: 1, ...eventPayload } as never,
			eventType,
		);

		expect(result.event_context.is_supported).toBe(true);
		expect(result.validation_status.is_valid).toBe(true);
	});

	it('keeps the published surface documented and the final tree deterministic', () => {
		const root = join(__dirname, '..', '..', '..');
		for (const file of ['README.md', 'AGENTS.md', 'CHANGELOG.md']) {
			expect(readFileSync(join(root, file), 'utf8')).toMatch(/Max API/i);
		}

		const credentials = readFileSync(join(root, 'credentials', 'MaxApi.credentials.ts'), 'utf8');
		expect(credentials).toContain("default: 'https://platform-api2.max.ru'");

		const operations = readFileSync(join(root, 'nodes', 'Max', 'MaxApiOperations.node.ts'), 'utf8');
		expect(operations).toMatch(
			/error instanceof NodeOperationError \|\| error instanceof NodeApiError/,
		);
		expect(operations).toContain('toPunycodeUrl(');

		const workflowNames = readdirSync(join(root, '.github', 'workflows')).sort();
		expect(workflowNames).toEqual(['ci.yml']);
		const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
		expect(ci).toMatch(/push:\s*\n\s*branches:\s*\[master\]/);
	});
});
'''
    write("nodes/Max/tests/MaxApiReviewRegression.test.ts", test)


def ensure_import(text: str, import_line: str, after: str | None = None) -> str:
    if import_line in text:
        return text
    if after and after in text:
        return text.replace(after, after + "\n" + import_line, 1)
    return import_line + "\n" + text


def implement() -> None:
    write(
        "nodes/Max/MaxApiBaseUrl.ts",
        """export const CURRENT_MAX_API_BASE_URL = 'https://platform-api2.max.ru';
export const LEGACY_MAX_API_BASE_URL = 'https://platform-api.max.ru';

export function normalizeMaxBaseUrl(value: unknown): string {
	const normalized = String(value ?? '')
		.trim()
		.replace(/\\/+$/, '');

	if (!normalized || normalized === LEGACY_MAX_API_BASE_URL) {
		return CURRENT_MAX_API_BASE_URL;
	}

	return normalized;
}
""",
    )

    # Webhook URL normalization is shared by Max Trigger and the explicit Subscription resource.
    webhook = read("nodes/Max/MaxWebhookManager.ts")
    webhook = replace_once(
        webhook,
        "function toPunycodeUrl(urlString: string): string {",
        "export function toPunycodeUrl(urlString: string): string {",
        "webhook URL normalizer",
    )
    webhook = ensure_import(
        webhook,
        "import { normalizeMaxBaseUrl } from './MaxApiBaseUrl';",
        "import type { MaxSubscriptionsResponse, MaxTriggerEvent } from './MaxTriggerConfig';",
    )
    webhook = webhook.replace(
        "const baseUrl = (credentials['baseUrl'] as string) || this.DEFAULT_BASE_URL;",
        "const baseUrl = normalizeMaxBaseUrl(credentials['baseUrl']);",
    )
    webhook = webhook.replace(
        "\tprivate readonly DEFAULT_BASE_URL = 'https://platform-api.max.ru';\n",
        "",
    )
    write("nodes/Max/MaxWebhookManager.ts", webhook)

    # Existing Max operations use the same host migration as the new resource node.
    generic = read("nodes/Max/GenericFunctions.ts")
    generic = ensure_import(
        generic,
        "import { CURRENT_MAX_API_BASE_URL, normalizeMaxBaseUrl } from './MaxApiBaseUrl';",
        "import { basename, join } from 'path';",
    )
    generic = generic.replace(
        "const DEFAULT_MAX_BASE_URL = 'https://platform-api.max.ru';",
        "const DEFAULT_MAX_BASE_URL = CURRENT_MAX_API_BASE_URL;",
    )
    generic = generic.replace(
        "(credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL",
        "normalizeMaxBaseUrl(credentials['baseUrl'])",
    )
    write("nodes/Max/GenericFunctions.ts", generic)

    # Credentials now test the same official endpoint used at runtime.
    credentials_path = "credentials/MaxApi.credentials.ts"
    credentials = read(credentials_path).replace(
        "https://platform-api.max.ru", "https://platform-api2.max.ru"
    )
    write(credentials_path, credentials)
    credentials_test_path = "credentials/tests/MaxApi.credentials.test.ts"
    credentials_test = read(credentials_test_path).replace(
        "https://platform-api.max.ru", "https://platform-api2.max.ru"
    )
    write(credentials_test_path, credentials_test)

    request_path = "nodes/Max/MaxApiRequest.ts"
    request = read(request_path)
    request = ensure_import(
        request,
        "import { normalizeMaxBaseUrl } from './MaxApiBaseUrl';",
    )
    if "IHttpRequestOptions" not in request.split("from 'n8n-workflow';", 1)[0]:
        request = request.replace(
            "IExecuteFunctions,",
            "IExecuteFunctions,\n\tIHttpRequestOptions,",
            1,
        )
    helper_block = r'''
const ATTACHMENT_READY_RETRY_DELAYS_MS =
	process.env.NODE_ENV === 'test' ? [0, 0, 0] : [700, 1500, 3000];

function collectErrorText(error: unknown): string {
	const values: unknown[] = [
		(error as { message?: unknown })?.message,
		(error as { description?: unknown })?.description,
		(error as { code?: unknown })?.code,
		(error as { response?: { body?: unknown } })?.response?.body,
		(error as { response?: { data?: unknown } })?.response?.data,
		(error as { body?: unknown })?.body,
	];
	const parts: string[] = [];
	for (const value of values) {
		if (typeof value === 'string' || typeof value === 'number') {
			parts.push(String(value));
		} else if (value && typeof value === 'object') {
			const object = value as Record<string, unknown>;
			for (const key of ['code', 'error', 'message', 'description', 'error_description']) {
				const nested = object[key];
				if (typeof nested === 'string' || typeof nested === 'number') parts.push(String(nested));
			}
		}
	}
	return parts.join(' ').toLowerCase();
}

function isMarkdownRejection(error: unknown): boolean {
	const text = collectErrorText(error);
	return (
		text.includes('some markdown syntax is not supported') ||
		(text.includes('markdown syntax') && text.includes('not supported')) ||
		text.includes('use basic formatting')
	);
}

function isAttachmentProcessingError(error: unknown): boolean {
	const text = collectErrorText(error);
	return (
		text.includes('attachment.not.ready') ||
		text.includes('errors.process.attachment.file.not.processed') ||
		text.includes('file.not.processed')
	);
}

function stripMarkdownFormatting(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
		.replace(/```([\s\S]*?)```/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/(\*\*|__|~~|\+\+|\^\^)([\s\S]*?)\1/g, '$2')
		.replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$)/g, '$1$2')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^>\s?/gm, '');
}

function hasMediaAttachments(body: IDataObject | undefined): boolean {
	if (!body) return false;
	const direct = body['attachments'];
	const nested = body['message'];
	const attachments = Array.isArray(direct)
		? direct
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

function downgradeMarkdown(body: IDataObject | undefined): IDataObject | undefined {
	if (!body) return undefined;
	const clone = structuredClone(body) as IDataObject;
	let changed = false;
	if (clone['format'] === 'markdown') {
		delete clone['format'];
		if (typeof clone['text'] === 'string') clone['text'] = stripMarkdownFormatting(clone['text']);
		changed = true;
	}
	const message = clone['message'];
	if (message && typeof message === 'object' && !Array.isArray(message)) {
		const messageBody = message as IDataObject;
		if (messageBody['format'] === 'markdown') {
			delete messageBody['format'];
			if (typeof messageBody['text'] === 'string') {
				messageBody['text'] = stripMarkdownFormatting(messageBody['text']);
			}
			changed = true;
		}
	}
	return changed ? clone : undefined;
}

async function waitForAttachmentRetry(delayMs: number): Promise<void> {
	if (delayMs <= 0) return;
	await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function compactQuery(query: IDataObject | undefined): IDataObject | undefined {
	if (!query) return undefined;
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== null && value !== '') result[key] = value;
	}
	return Object.keys(result).length > 0 ? result : undefined;
}
'''
    marker = "export async function maxApiRequest"
    if helper_block.strip() not in request:
        request = request.replace(marker, helper_block + "\n" + marker, 1)

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
	let body = options.body === undefined ? undefined : (structuredClone(options.body) as IDataObject);
	let markdownRetried = false;
	let attachmentRetry = 0;

	while (true) {
		const requestOptions: IHttpRequestOptions = {
			method: options.method,
			url: `${baseUrl}${options.path}`,
			headers: { Authorization: credentials['accessToken'] as string },
			json: true,
		};
		const qs = compactQuery(options.qs);
		if (qs) requestOptions.qs = qs;
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
			const messageWrite =
				(options.path === '/messages' && ['POST', 'PUT'].includes(options.method)) ||
				(options.path === '/answers' && options.method === 'POST');

			if (
				messageWrite &&
				hasMediaAttachments(body) &&
				isAttachmentProcessingError(error) &&
				attachmentRetry < ATTACHMENT_READY_RETRY_DELAYS_MS.length
			) {
				await waitForAttachmentRetry(ATTACHMENT_READY_RETRY_DELAYS_MS[attachmentRetry]);
				attachmentRetry += 1;
				continue;
			}

			if (messageWrite && !markdownRetried && isMarkdownRejection(error)) {
				const plainBody = downgradeMarkdown(body);
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
    request = replace_function(request, "maxApiRequest", replacement)

    recipient_helper = r'''
export function requireRecipientId(value: unknown): string {
	const recipientId = requireInt64(value, 'Recipient ID');
	if (recipientId === '0') {
		throw new ApplicationError(
			'Recipient ID must not be 0. Use chat_id or user_id from Max Trigger output.',
		);
	}
	return recipientId;
}
'''
    if "export function requireRecipientId" not in request:
        int64_start = request.find("export function requireInt64")
        if int64_start < 0:
            raise RuntimeError("Could not find requireInt64")
        brace = request.find("{", int64_start)
        depth = 0
        for index in range(brace, len(request)):
            if request[index] == "{":
                depth += 1
            elif request[index] == "}":
                depth -= 1
                if depth == 0:
                    request = request[: index + 1] + "\n" + recipient_helper + request[index + 1 :]
                    break
    write(request_path, request)

    operations_path = "nodes/Max/MaxApiOperations.node.ts"
    operations = read(operations_path)
    operations = operations.replace(
        "import { ApplicationError, NodeConnectionType, NodeOperationError } from 'n8n-workflow';",
        "import { ApplicationError, NodeApiError, NodeConnectionType, NodeOperationError } from 'n8n-workflow';",
    )
    operations = ensure_import(
        operations,
        "import { toPunycodeUrl } from './MaxWebhookManager';",
        "import { MAX_API_OPERATION_PROPERTIES } from './MaxApiOperationsDescription';",
    )
    operations = operations.replace(
        "\trequireInt64,\n",
        "\trequireInt64,\n\trequireRecipientId,\n",
        1,
    )
    operations = re.sub(
        r"const recipientId = requireInt64\(\s*getParameter<unknown>\(context, 'recipientId', itemIndex, ''\),\s*'Recipient ID',\s*\);",
        "const recipientId = requireRecipientId(\n\t\tgetParameter<unknown>(context, 'recipientId', itemIndex, ''),\n\t);",
        operations,
        count=1,
    )
    operations = re.sub(
        r"const url = requireString\(\s*getParameter<unknown>\(context, 'url', itemIndex, ''\),\s*'Webhook URL',\s*\);",
        "const url = toPunycodeUrl(\n\t\trequireString(getParameter<unknown>(context, 'url', itemIndex, ''), 'Webhook URL'),\n\t);",
        operations,
        count=1,
    )
    operations = operations.replace(
        "if (error instanceof NodeOperationError) {",
        "if (error instanceof NodeOperationError || error instanceof NodeApiError) {",
    )
    if "requireRecipientId" not in operations or "toPunycodeUrl(" not in operations:
        raise RuntimeError("Operation review fixes were not applied")
    write(operations_path, operations)

    config_path = "nodes/Max/MaxTriggerConfig.ts"
    config = read(config_path)
    config = config.replace(
        "\tcomment_id?: string;\n",
        "\tcomment_id?: string;\n\tpost_id?: string;\n\tmuted_until?: number;\n",
    )
    write(config_path, config)

    processor_path = "nodes/Max/MaxEventProcessor.ts"
    processor = read(processor_path)
    process_start = processor.find("public processEventSpecificData")
    validate_start = processor.find("private validateEventPayload", process_start)
    if process_start < 0 or validate_start < 0:
        raise RuntimeError("Could not locate event processor methods")
    process_section = processor[process_start:validate_start]
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
    if "case 'bot_stopped':" not in process_section:
        process_section = process_section.replace("\t\t\tdefault:", cases + "\t\t\tdefault:", 1)
        processor = processor[:process_start] + process_section + processor[validate_start:]

    methods = r'''
	private processSupportedUpdate(
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
		const context: IEventContext = {
			type: eventType,
			description: descriptions[eventType] ?? 'Supported MAX update',
			is_supported: true,
			chat_id: bodyData.chat_id ?? message?.recipient?.chat_id,
			user_id: bodyData.user_id ?? bodyData.user?.user_id ?? message?.sender?.user_id,
			message_id: bodyData.message_id ?? message?.body?.mid,
			post_id: bodyData.post_id ?? message?.recipient?.post_id,
			muted_until: bodyData.muted_until,
			user_locale: bodyData.user_locale,
		};
		return { data: bodyData as unknown as IDataObject, context };
	}

	private validateSupportedUpdate(
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
	}

'''
    if "private processSupportedUpdate(" not in processor:
        marker = "\tprivate validateEventPayload("
        processor = processor.replace(marker, methods + marker, 1)

    validate_start = processor.find("private validateEventPayload")
    next_method = processor.find("\n\tprivate ", validate_start + 10)
    validate_section = processor[validate_start : next_method if next_method > 0 else len(processor)]
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
    if "this.validateSupportedUpdate(bodyData, eventType, errors);" not in validate_section:
        validate_section = validate_section.replace("\t\t\tcase 'bot_started':", validation_cases + "\t\t\tcase 'bot_started':", 1)
        processor = processor[:validate_start] + validate_section + processor[next_method:]
    write(processor_path, processor)

    # User-facing and maintainer documentation for the newly registered node.
    readme = read("README.md")
    if "## Max API — расширенные операции" not in readme:
        readme += """

## Max API — расширенные операции

Нода **Max API** дополняет обратно совместимую ноду **Max** и даёт прямой доступ к актуальным ресурсам Bot API: сведения о боте и команды, сообщения и callback-ответы, чаты и закрепления, участники и администраторы, комментарии каналов и Webhook-подписки.

Идентификаторы `int64` вводятся строками, чтобы JavaScript не терял точность. Для сложных вложений доступно поле **Attachments JSON**, а inline-клавиатуру можно собрать в интерфейсе, включая кнопки `message`, `clipboard` и `open_app`. Webhook URL с интернациональным доменом автоматически преобразуется в Punycode.

`GET /chats` намеренно не представлен: с июня 2026 года метод не поддерживается MAX. Для production-сценариев используйте **Max Trigger** и Webhook; Long Polling официально предназначен прежде всего для разработки и тестирования.
"""
    write("README.md", readme)

    agents = read("AGENTS.md")
    if "## Контракт ноды Max API" not in agents:
        agents += """

## Контракт ноды Max API

- `MaxApiOperations.node.ts` содержит расширенные ресурсы актуального Bot API; существующая `Max.node.ts` остаётся обратно совместимой.
- Все официальные `int64`-идентификаторы передаются строками. Нулевой ID получателя отклоняется до HTTP-запроса.
- Официальный endpoint — `https://platform-api2.max.ru`; сохранённое прежнее официальное значение нормализуется прозрачно во всех runtime-путях.
- Отправка и редактирование сообщений сохраняют защитные механизмы старой ноды: ограниченные повторы для обрабатываемых media-вложений и один fallback с Markdown на читаемый plain text.
- Webhook URL нормализуется в Punycode как в `Max Trigger`, так и в ресурсе Subscription.
- Новые trigger events должны иметь наблюдаемый `event_context.is_supported = true` и regression-тесты полезной нагрузки.
- В PR запрещены временные self-mutating workflows. Постоянный CI проверяет pull request и push в `master`.
"""
    write("AGENTS.md", agents)

    changelog = read("CHANGELOG.md")
    if "Расширено покрытие актуального MAX Bot API" not in changelog:
        lines = changelog.splitlines()
        insert_at = 1 if lines and lines[0].startswith("#") else 0
        entry = [
            "",
            "## Не выпущено",
            "",
            "### Добавлено",
            "",
            "- Расширено покрытие актуального MAX Bot API новой нодой `Max API`: бот, сообщения, чаты, участники, администраторы, комментарии и Webhook-подписки.",
            "- Добавлены актуальные события `Max Trigger` и кнопки inline-клавиатуры `message` и `clipboard`.",
            "",
            "### Исправлено",
            "",
            "- Добавлены Punycode-нормализация Webhook URL, безопасная передача `int64`, media retry, Markdown fallback и единая миграция на `platform-api2.max.ru`.",
            "",
        ]
        lines[insert_at:insert_at] = entry
        changelog = "\n".join(lines) + "\n"
    write("CHANGELOG.md", changelog)

    ci = """name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [20.15.1, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm test -- --runInBand
      - run: npm run build
      - run: npm run lint
      - name: Verify package entry points
        run: |
          npm pack --dry-run --json > /tmp/npm-pack.json
          node <<'NODE'
          const fs = require('node:fs');
          const manifest = require('./package.json');
          const result = JSON.parse(fs.readFileSync('/tmp/npm-pack.json', 'utf8'))[0];
          const files = new Set(result.files.map(({ path }) => path));
          for (const entry of [...manifest.n8n.nodes, ...manifest.n8n.credentials]) {
            if (!files.has(entry)) throw new Error(`Missing npm entry point: ${entry}`);
          }
          NODE
      - run: git diff --check
"""
    write(".github/workflows/ci.yml", ci)


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"write-tests", "implement"}:
        raise SystemExit("usage: pr24_finalize_review.py write-tests|implement")
    if sys.argv[1] == "write-tests":
        write_tests()
    else:
        implement()


if __name__ == "__main__":
    main()
