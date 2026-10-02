import type { Bot } from '@maxhub/max-bot-api';
import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import {
	answerCallbackQuery,
	deleteMessage,
	editMessage,
	getChatInfo,
	leaveChat,
	sendMessage,
} from '../GenericFunctions';

const bot = {} as Bot;
const rawResponse =
	'{"chat_id":9223372036854775807,"owner_id":-9223372036854775808,"id":42,"user_ids":[7,9007199254740993],"nested":{"user_id":9007199254740991},"count":12,"large_count":9007199254740993,"ratio":1.5,"exponent":1.2e3,"nullable":null,"active":true,"text":"ID 9223372036854775807"}';
const expectedResponse = {
	chat_id: '9223372036854775807',
	owner_id: '-9223372036854775808',
	id: 42,
	user_ids: [7, '9007199254740993'],
	nested: { user_id: 9007199254740991 },
	count: 12,
	large_count: '9007199254740993',
	ratio: 1.5,
	exponent: 1200,
	nullable: null,
	active: true,
	text: 'ID 9223372036854775807',
};

function createContext(response: unknown = rawResponse) {
	// Model the transport: json:true parses (and rounds) before the function receives a response.
	const httpRequest = jest.fn(async (options: IHttpRequestOptions) =>
		options.json && typeof response === 'string' ? JSON.parse(response) : response,
	);
	const context = {
		getCredentials: jest.fn().mockResolvedValue({
			accessToken: 'test-token',
			baseUrl: 'https://platform-api2.max.ru',
		}),
		getNode: jest.fn().mockReturnValue({ name: 'MAX' }),
		helpers: { httpRequest },
	} as unknown as IExecuteFunctions;
	return { context, httpRequest };
}

const operations = [
	{
		name: 'send message',
		run: (context: IExecuteFunctions) => sendMessage.call(context, bot, 'user', '123', 'Hello'),
	},
	{
		name: 'edit message',
		run: (context: IExecuteFunctions) => editMessage.call(context, bot, 'mid', 'Hello'),
	},
	{
		name: 'delete message',
		run: (context: IExecuteFunctions) => deleteMessage.call(context, bot, 'mid'),
	},
	{
		name: 'answer callback',
		run: (context: IExecuteFunctions) =>
			answerCallbackQuery.call(context, bot, 'callback', 'Hello'),
	},
	{
		name: 'get chat info',
		run: (context: IExecuteFunctions) => getChatInfo.call(context, bot, '123'),
	},
	{
		name: 'leave chat',
		run: (context: IExecuteFunctions) => leaveChat.call(context, bot, '123'),
	},
];

describe('legacy MAX response precision', () => {
	it.each(operations)(
		'preserves int64 values and legacy safe-number types for $name',
		async ({ run }) => {
			const { context, httpRequest } = createContext();

			await expect(run(context)).resolves.toEqual(expectedResponse);
			expect(httpRequest).toHaveBeenCalledTimes(1);
			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					encoding: 'text',
					json: false,
					headers: expect.objectContaining({
						Accept: 'application/json',
						Authorization: 'test-token',
					}),
				}),
			);
		},
	);

	it('parses Buffer responses without rounding identifiers', async () => {
		const { context } = createContext(Buffer.from(rawResponse));

		await expect(getChatInfo.call(context, bot, '123')).resolves.toEqual(expectedResponse);
	});

	it('keeps already-decoded responses unchanged', async () => {
		const response = { chat_id: 123, nested: { user_id: 456 } };
		const { context } = createContext(response);

		await expect(getChatInfo.call(context, bot, '123')).resolves.toBe(response);
	});

	it.each(['', Buffer.from(''), undefined, null])(
		'preserves empty-response fallback for %p',
		async (response) => {
			const { context } = createContext(null);
			(context.helpers.httpRequest as jest.Mock).mockResolvedValue(response);

			await expect(deleteMessage.call(context, bot, 'mid')).resolves.toEqual({
				success: true,
				message_id: 'mid',
			});
		},
	);
});

const errorLocations = [
	{ name: 'response.data', wrap: (body: unknown) => ({ response: { data: body } }) },
	{ name: 'response.body', wrap: (body: unknown) => ({ response: { body } }) },
	{ name: 'body', wrap: (body: unknown) => ({ body }) },
	{ name: 'error', wrap: (body: unknown) => ({ error: body }) },
];

describe.each([
	{ format: 'string', encode: (body: string) => body },
	{ format: 'Buffer', encode: (body: string) => Buffer.from(body) },
])('legacy MAX $format error responses', ({ encode }) => {
	it.each(errorLocations)('preserves validation details from $name', async ({ wrap }) => {
		const { context, httpRequest } = createContext();
		httpRequest.mockRejectedValue({
			message: 'Request failed with status code 400',
			status: 400,
			...wrap(encode('{"code":"proto.payload","message":"User ID is missing"}')),
		});

		await expect(sendMessage.call(context, bot, 'user', '123', 'Hello')).rejects.toMatchObject({
			name: 'NodeOperationError',
			message: expect.stringContaining('User ID is missing'),
		});
	});

	it.each(errorLocations)('preserves rate-limit guidance from $name', async ({ wrap }) => {
		const { context, httpRequest } = createContext();
		httpRequest.mockRejectedValue({
			message: 'Request failed with status code 429',
			status: 429,
			...wrap(
				encode(
					'{"code":"rate.limit","description":"Slow down bot","parameters":{"retry_after":60}}',
				),
			),
		});

		await expect(sendMessage.call(context, bot, 'user', '123', 'Hello')).rejects.toMatchObject({
			name: 'NodeApiError',
			httpCode: '429',
			description: 'Rate limit hit during send message to user. Retry attempt 1/3',
			messages: expect.arrayContaining([
				expect.stringContaining('Slow down bot. Please wait 60 seconds'),
			]),
		});
		expect(httpRequest).toHaveBeenCalledTimes(1);
	});

	it('retains code-based error categorization', async () => {
		const { context, httpRequest } = createContext();
		httpRequest.mockRejectedValue({
			message: 'Request failed',
			response: { data: encode('{"code":"ECONNREFUSED","message":"Upstream unavailable"}') },
		});

		await expect(sendMessage.call(context, bot, 'user', '123', 'Hello')).rejects.toMatchObject({
			name: 'NodeApiError',
			description: 'Network error during send message to user. Retry attempt 1/3',
			messages: expect.arrayContaining([expect.stringContaining('Upstream unavailable')]),
		});
	});
});

describe('legacy MAX error compatibility', () => {
	it.each([
		'<html>Unavailable</html>',
		'{',
		Buffer.from('{'),
		'null',
		'17',
		'"failure"',
		'false',
		'[]',
	])('keeps transport error handling for unusable JSON details (%p)', async (body) => {
		const { context, httpRequest } = createContext();
		httpRequest.mockRejectedValue({ message: 'Transport failed', status: 400, response: { body } });

		await expect(sendMessage.call(context, bot, 'user', '123', 'Hello')).rejects.toMatchObject({
			name: 'NodeOperationError',
			message: expect.stringContaining('Transport failed'),
		});
	});

	it('keeps combined Markdown and attachment retries bounded for raw JSON errors', async () => {
		jest.useFakeTimers();
		try {
			const { context, httpRequest } = createContext();
			httpRequest
				.mockRejectedValueOnce({
					response: { data: '{"message":"Some Markdown syntax is not supported"}' },
				})
				.mockRejectedValue({
					response: { data: '{"code":"attachment.not.ready","message":"Media is processing"}' },
					status: 400,
				});
			const result = sendMessage
				.call(context, bot, 'user', '123', '**Hello**', {
					format: 'markdown',
					attachments: [{ type: 'file', payload: { token: 'file-token' } }],
				})
				.catch((error: unknown) => error);
			await jest.runAllTimersAsync();

			await expect(result).resolves.toMatchObject({
				message: expect.stringContaining('Media is processing'),
			});
			expect(httpRequest).toHaveBeenCalledTimes(5);
			for (const [options] of httpRequest.mock.calls.slice(1)) {
				expect(options.body).toEqual({
					text: 'Hello',
					attachments: [{ type: 'file', payload: { token: 'file-token' } }],
				});
			}
		} finally {
			jest.useRealTimers();
		}
	});
});
