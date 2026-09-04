import type { IExecuteFunctions } from 'n8n-workflow';
import {
	buildInlineKeyboard,
	maxApiRequest,
	normalizeMaxBaseUrl,
	normalizeMaxWebhookUrl,
	parseIdList,
	requireInt64,
} from '../MaxApiRequest';

describe('MaxApiRequest', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('normalizeMaxBaseUrl', () => {
		it.each([
			[undefined, 'https://platform-api2.max.ru'],
			['', 'https://platform-api2.max.ru'],
			['https://platform-api.max.ru', 'https://platform-api2.max.ru'],
			['https://platform-api.max.ru/', 'https://platform-api2.max.ru'],
			['https://example.test/', 'https://example.test'],
		])('normalizes %p to %s', (input, expected) => {
			expect(normalizeMaxBaseUrl(input)).toBe(expected);
		});
	});

	describe('normalizeMaxWebhookUrl', () => {
		it('normalizes an internationalized hostname for MAX TLS validation', () => {
			expect(normalizeMaxWebhookUrl('https://пример.рф/max')).toBe(
				'https://xn--e1afmkfd.xn--p1ai/max',
			);
		});
	});

	describe('maxApiRequest', () => {
		it('uses Authorization header, migrates the legacy host, and preserves false and zero query values', async () => {
			const httpRequest = jest.fn().mockResolvedValue({ success: true });
			const context = {
				getCredentials: jest.fn().mockResolvedValue({
					accessToken: 'secret-token',
					baseUrl: 'https://platform-api.max.ru/',
				}),
				getNode: jest.fn().mockReturnValue({ name: 'Max API' }),
				helpers: { httpRequest },
			} as unknown as IExecuteFunctions;

			await maxApiRequest(context, {
				method: 'POST',
				path: '/test',
				qs: { disabled: false, empty: undefined, zero: 0 },
				body: { value: true },
			});

			expect(httpRequest).toHaveBeenCalledWith({
				method: 'POST',
				url: 'https://platform-api2.max.ru/test',
				qs: { disabled: false, zero: 0 },
				headers: {
					Authorization: 'secret-token',
					'Content-Type': 'application/json',
				},
				body: { value: true },
				encoding: 'text',
				json: false,
			});
		});

		it('retries unsupported Markdown once as readable plain text', async () => {
			const httpRequest = jest
				.fn()
				.mockRejectedValueOnce({
					response: {
						body: {
							code: 'invalid.message',
							message: 'Some Markdown syntax is not supported by Max messenger',
						},
					},
				})
				.mockResolvedValueOnce({ success: true });
			const context = {
				getCredentials: jest.fn().mockResolvedValue({
					accessToken: 'secret-token',
					baseUrl: 'https://platform-api2.max.ru',
				}),
				getNode: jest.fn().mockReturnValue({ name: 'Max API' }),
				helpers: { httpRequest },
			} as unknown as IExecuteFunctions;

			await maxApiRequest(context, {
				method: 'POST',
				path: '/messages',
				body: {
					text: '**Hello** [MAX](https://max.ru)',
					format: 'markdown',
				},
			});

			expect(httpRequest).toHaveBeenCalledTimes(2);
			expect(httpRequest.mock.calls[1]?.[0]).toEqual(
				expect.objectContaining({
					body: { text: 'Hello MAX (https://max.ru)' },
				}),
			);
		});

		it('retries media messages while MAX is still processing an attachment', async () => {
			const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
				callback: (...args: unknown[]) => void,
			) => {
				callback();
				return 0 as unknown as NodeJS.Timeout;
			}) as typeof setTimeout);
			const httpRequest = jest
				.fn()
				.mockRejectedValueOnce({
					response: {
						data: {
							code: 'attachment.not.ready',
							message: 'errors.process.attachment.file.not.processed',
						},
					},
				})
				.mockResolvedValueOnce({ success: true });
			const context = {
				getCredentials: jest.fn().mockResolvedValue({
					accessToken: 'secret-token',
					baseUrl: 'https://platform-api2.max.ru',
				}),
				getNode: jest.fn().mockReturnValue({ name: 'Max API' }),
				helpers: { httpRequest },
			} as unknown as IExecuteFunctions;

			await maxApiRequest(context, {
				method: 'POST',
				path: '/messages',
				body: {
					text: 'File',
					attachments: [{ type: 'file', payload: { token: 'file-token' } }],
				},
			});

			expect(httpRequest).toHaveBeenCalledTimes(2);
			expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 700);
		});
	});

	describe('int64 validation', () => {
		it('accepts both signed int64 boundaries without number coercion', () => {
			expect(requireInt64('9223372036854775807', 'User ID')).toBe('9223372036854775807');
			expect(requireInt64('-9223372036854775808', 'User ID')).toBe('-9223372036854775808');
		});

		it('rejects unsafe JavaScript numeric IDs before string conversion', () => {
			const unsafeNumber = Number.MAX_SAFE_INTEGER + 1;

			expect(() => requireInt64(unsafeNumber, 'User ID')).toThrow('pass it as a string');
			expect(() => parseIdList(unsafeNumber, 'User IDs')).toThrow('pass it as a string');
			expect(() => parseIdList([1, unsafeNumber], 'User IDs')).toThrow('pass it as a string');
			expect(requireInt64(Number.MAX_SAFE_INTEGER, 'User ID')).toBe(
				String(Number.MAX_SAFE_INTEGER),
			);
		});

		it('rejects values outside the signed int64 range', () => {
			expect(() => requireInt64('9223372036854775808', 'User ID')).toThrow('signed int64 range');
			expect(() => requireInt64('-9223372036854775809', 'User ID')).toThrow('signed int64 range');
		});

		it('keeps int64 ID lists as strings instead of coercing them to JavaScript numbers', () => {
			expect(parseIdList('9223372036854775807, -42', 'User IDs')).toEqual([
				'9223372036854775807',
				'-42',
			]);
		});

		it('rejects malformed, out-of-range, and excessive ID lists', () => {
			expect(() => parseIdList('1, nope', 'User IDs')).toThrow('User IDs');
			expect(() => parseIdList('1,9223372036854775808', 'User IDs')).toThrow('signed int64 range');
			expect(() => parseIdList('1,2,3', 'User IDs', 2)).toThrow('at most 2');
		});
	});

	describe('buildInlineKeyboard', () => {
		it('supports current message and clipboard button types', () => {
			expect(
				buildInlineKeyboard([
					[{ type: 'message', text: 'Send text' }],
					[{ type: 'clipboard', text: 'Copy', payload: 'PROMO-42' }],
				]),
			).toEqual({
				type: 'inline_keyboard',
				payload: {
					buttons: [
						[{ type: 'message', text: 'Send text' }],
						[{ type: 'clipboard', text: 'Copy', payload: 'PROMO-42' }],
					],
				},
			});
		});

		it('allows mixed rows when no more than three buttons use limited types', () => {
			expect(
				buildInlineKeyboard([
					[
						{ type: 'link', text: 'Open', url: 'https://example.test' },
						{ type: 'callback', text: 'One', payload: 'one' },
						{ type: 'callback', text: 'Two', payload: 'two' },
						{ type: 'callback', text: 'Three', payload: 'three' },
					],
				]),
			).toEqual({
				type: 'inline_keyboard',
				payload: {
					buttons: [
						[
							{ type: 'link', text: 'Open', url: 'https://example.test' },
							{ type: 'callback', text: 'One', payload: 'one' },
							{ type: 'callback', text: 'Two', payload: 'two' },
							{ type: 'callback', text: 'Three', payload: 'three' },
						],
					],
				},
			});
		});

		it('enforces the documented clipboard payload limit', () => {
			expect(() =>
				buildInlineKeyboard([[{ type: 'clipboard', text: 'Copy', payload: 'x'.repeat(1025) }]]),
			).toThrow('payload cannot exceed 1024 characters');
		});

		it('validates required fields and documented row limits', () => {
			expect(() => buildInlineKeyboard([[{ type: 'clipboard', text: 'Copy' }]])).toThrow('payload');
			expect(() =>
				buildInlineKeyboard([
					[
						{ type: 'link', text: '1', url: 'https://example.test/1' },
						{ type: 'link', text: '2', url: 'https://example.test/2' },
						{ type: 'link', text: '3', url: 'https://example.test/3' },
						{ type: 'link', text: '4', url: 'https://example.test/4' },
					],
				]),
			).toThrow('at most 3');
		});
	});
});
