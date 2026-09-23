import type { Bot } from '@maxhub/max-bot-api';
import type { IDataObject, IExecuteFunctions, IHookFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import {
	answerCallbackQuery,
	deleteMessage,
	editMessage,
	getChatInfo,
	leaveChat,
	processUrlAttachment,
	sendMessage,
} from '../GenericFunctions';
import { maxApiRequest } from '../MaxApiRequest';
import { getMaxTlsOptions } from '../MaxTlsOptions';
import { MaxWebhookManager } from '../MaxWebhookManager';

const baseUrl = 'https://platform-api2.max.ru';
const webhookUrl = 'https://n8n.example.test/webhook/max';
const bot = {} as Bot;

function credentialsWith(ignoreSslIssues?: boolean): IDataObject {
	return {
		accessToken: 'test-token',
		baseUrl,
		...(ignoreSslIssues === undefined ? {} : { ignoreSslIssues }),
	};
}

function executionContext(credentials: IDataObject) {
	const httpRequest = jest.fn().mockResolvedValue({ success: true });
	const context = {
		getCredentials: jest.fn().mockResolvedValue(credentials),
		getNode: jest.fn().mockReturnValue({ name: 'Max' }),
		helpers: { httpRequest },
	} as unknown as IExecuteFunctions;
	return { context, httpRequest };
}

const operations: Array<{
	name: string;
	run: (context: IExecuteFunctions) => Promise<unknown>;
}> = [
	{
		name: 'focused API request',
		run: (context) => maxApiRequest(context, { method: 'GET', path: '/me' }),
	},
	{
		name: 'send message',
		run: (context) => sendMessage.call(context, bot, 'user', '123', 'Hello'),
	},
	{
		name: 'edit message',
		run: (context) => editMessage.call(context, bot, 'mid', 'Hello'),
	},
	{ name: 'delete message', run: (context) => deleteMessage.call(context, bot, 'mid') },
	{
		name: 'answer callback',
		run: (context) => answerCallbackQuery.call(context, bot, 'callback', 'Hello'),
	},
	{ name: 'get chat', run: (context) => getChatInfo.call(context, bot, '123') },
	{ name: 'leave chat', run: (context) => leaveChat.call(context, bot, '123') },
];

describe('MAX credential-scoped TLS options', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it.each([undefined, false, true, 'false', 'true', null, 0, 1])(
		'only accepts boolean true as an explicit opt-out (%p)',
		(ignoreSslIssues) => {
			const credentials: IDataObject = { ignoreSslIssues };
			Object.freeze(credentials);
			expect(getMaxTlsOptions(credentials)).toEqual(
				ignoreSslIssues === true ? { skipSslCertificateValidation: true } : {},
			);
		},
	);

	describe.each([undefined, false, true])('ignoreSslIssues = %p', (ignoreSslIssues) => {
		it.each(operations)(
			'applies the setting to $name without changing authentication',
			async ({ run }) => {
				const { context, httpRequest } = executionContext(credentialsWith(ignoreSslIssues));

				await run(context);

				expect(httpRequest).toHaveBeenCalledTimes(1);
				const options = httpRequest.mock.calls[0]![0];
				expect(options.skipSslCertificateValidation).toBe(
					ignoreSslIssues === true ? true : undefined,
				);
				expect(options.headers.Authorization).toBe('test-token');
				expect(options.url).toMatch(/^https:\/\/platform-api2\.max\.ru\//);
			},
		);

		it('applies the setting to both upload steps, but not to the external download', async () => {
			const { context, httpRequest } = executionContext(credentialsWith(ignoreSslIssues));
			httpRequest
				.mockResolvedValueOnce({ statusCode: 200, body: Buffer.from('attachment') })
				.mockResolvedValueOnce({ url: 'https://upload.example.test/data' })
				.mockResolvedValueOnce({ statusCode: 200, body: '{"token":"uploaded-token"}' });

			await expect(
				processUrlAttachment.call(context, bot, {
					type: 'file',
					inputType: 'url',
					fileUrl: 'https://files.example.test/sample.txt',
					fileName: 'sample.txt',
				}),
			).resolves.toEqual({ type: 'file', payload: { token: 'uploaded-token' } });

			expect(httpRequest).toHaveBeenCalledTimes(3);
			const download = httpRequest.mock.calls[0]![0];
			expect(download.url).toBe('https://files.example.test/sample.txt');
			expect(download.skipSslCertificateValidation).toBeUndefined();
			expect(download.headers).toBeUndefined();
			expect(httpRequest.mock.calls[1]![0].url).toBe(`${baseUrl}/uploads`);
			expect(httpRequest.mock.calls[2]![0].url).toBe('https://upload.example.test/data');
			for (const [options] of httpRequest.mock.calls.slice(1)) {
				expect(options.skipSslCertificateValidation).toBe(
					ignoreSslIssues === true ? true : undefined,
				);
			}
		});

		it('uses the setting throughout the trigger subscription lifecycle', async () => {
			const credentials = credentialsWith(ignoreSslIssues);
			const httpRequest = jest
				.fn()
				.mockResolvedValueOnce({ subscriptions: [] })
				.mockResolvedValueOnce({ success: true })
				.mockResolvedValueOnce({ subscriptions: [{ url: webhookUrl }] })
				.mockResolvedValueOnce({ subscriptions: [{ url: webhookUrl }] })
				.mockResolvedValueOnce({ success: true });
			const context = {
				getCredentials: jest.fn().mockResolvedValue(credentials),
				getNodeWebhookUrl: jest.fn().mockReturnValue(webhookUrl),
				getNodeParameter: jest.fn((name: string) =>
					name === 'events' ? ['message_created'] : {},
				),
				helpers: { httpRequest },
			} as unknown as IHookFunctions;
			const manager = new MaxWebhookManager();

			await expect(manager.create.call(context)).resolves.toBe(true);
			await expect(manager.checkExists.call(context)).resolves.toBe(true);
			await expect(manager.delete.call(context)).resolves.toBe(true);

			expect(httpRequest.mock.calls.map(([options]) => options.method)).toEqual([
				'GET',
				'POST',
				'GET',
				'GET',
				'DELETE',
			]);
			for (const [options] of httpRequest.mock.calls) {
				expect(options.skipSslCertificateValidation).toBe(
					ignoreSslIssues === true ? true : undefined,
				);
				expect(options.headers.Authorization).toBe('test-token');
				expect(options.url).toBe(`${baseUrl}/subscriptions`);
			}
		});
	});

	it('does not leak the opt-out between credentials or change global TLS settings', async () => {
		const globalTlsSetting = process.env['NODE_TLS_REJECT_UNAUTHORIZED'];
		const { context, httpRequest } = executionContext(credentialsWith(true));
		(context.getCredentials as jest.Mock)
			.mockResolvedValueOnce(credentialsWith(true))
			.mockResolvedValueOnce(credentialsWith())
			.mockResolvedValueOnce(credentialsWith(false));

		for (let index = 0; index < 3; index++) {
			await maxApiRequest(context, { method: 'GET', path: '/me' });
		}

		expect(httpRequest.mock.calls.map(([options]) => options.skipSslCertificateValidation)).toEqual([
			true,
			undefined,
			undefined,
		]);
		expect(process.env['NODE_TLS_REJECT_UNAUTHORIZED']).toBe(globalTlsSetting);
	});

	it.each(['focused', 'send', 'edit'])(
		'preserves the opt-out during %s Markdown fallback',
		async (operation) => {
			const { context, httpRequest } = executionContext(credentialsWith(true));
			httpRequest.mockRejectedValueOnce({ message: 'Some markdown syntax is not supported' });

			if (operation === 'focused') {
				await maxApiRequest(context, {
					method: 'POST',
					path: '/messages',
					body: { text: '**Hello**', format: 'markdown' },
				});
			} else if (operation === 'send') {
				await sendMessage.call(context, bot, 'user', '123', '**Hello**', { format: 'markdown' });
			} else {
				await editMessage.call(context, bot, 'mid', '**Hello**', { format: 'markdown' });
			}

			expect(httpRequest).toHaveBeenCalledTimes(2);
			for (const [options] of httpRequest.mock.calls) {
				expect(options.skipSslCertificateValidation).toBe(true);
			}
			expect(httpRequest.mock.calls[1]![0].body.format).toBeUndefined();
		},
	);

	it.each(['focused', 'send'])(
		'preserves the opt-out during %s attachment processing retries',
		async (operation) => {
			jest.useFakeTimers();
			const { context, httpRequest } = executionContext(credentialsWith(true));
			httpRequest.mockRejectedValueOnce({ message: 'attachment.not.ready' });
			const body = { text: 'Hello', attachments: [{ type: 'file', payload: { token: 'token' } }] };
			const pending =
				operation === 'focused'
					? maxApiRequest(context, { method: 'POST', path: '/messages', body })
					: sendMessage.call(context, bot, 'user', '123', 'Hello', { attachments: body.attachments });
			const completed = expect(pending).resolves.toEqual({ success: true });

			await jest.advanceTimersByTimeAsync(700);
			await completed;

			expect(httpRequest).toHaveBeenCalledTimes(2);
			for (const [options] of httpRequest.mock.calls) {
				expect(options.skipSslCertificateValidation).toBe(true);
			}
		},
	);

	it('never retries a certificate failure with verification disabled automatically', async () => {
		const { context, httpRequest } = executionContext(credentialsWith());
		httpRequest.mockRejectedValue({
			code: 'SELF_SIGNED_CERT_IN_CHAIN',
			message: 'self-signed certificate in certificate chain',
		});

		await expect(
			maxApiRequest(context, { method: 'GET', path: '/me' }),
		).rejects.toBeInstanceOf(NodeApiError);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		expect(httpRequest.mock.calls[0]![0].skipSslCertificateValidation).toBeUndefined();
	});

	it('stops on an external download certificate error even when MAX opts out', async () => {
		const { context, httpRequest } = executionContext(credentialsWith(true));
		httpRequest.mockRejectedValue({
			code: 'SELF_SIGNED_CERT_IN_CHAIN',
			message: 'self-signed certificate in certificate chain',
		});

		await expect(
			processUrlAttachment.call(context, bot, {
				type: 'file',
				inputType: 'url',
				fileUrl: 'https://files.example.test/sample.txt',
				fileName: 'sample.txt',
			}),
		).rejects.toThrow('Failed to download file from URL');

		expect(httpRequest).toHaveBeenCalledTimes(1);
		expect(httpRequest.mock.calls[0]![0].skipSslCertificateValidation).toBeUndefined();
	});
});
