import type { IExecuteFunctions } from 'n8n-workflow';
import {
	buildInlineKeyboard,
	maxApiRequest,
	normalizeMaxBaseUrl,
	parseIdList,
} from '../MaxApiRequest';

describe('MaxApiRequest', () => {
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
				json: true,
			});
		});
	});

	describe('parseIdList', () => {
		it('keeps int64 IDs as strings instead of coercing them to JavaScript numbers', () => {
			expect(parseIdList('9223372036854775807, -42', 'User IDs')).toEqual([
				'9223372036854775807',
				'-42',
			]);
		});

		it('rejects malformed IDs and excessive list size', () => {
			expect(() => parseIdList('1, nope', 'User IDs')).toThrow('User IDs');
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
