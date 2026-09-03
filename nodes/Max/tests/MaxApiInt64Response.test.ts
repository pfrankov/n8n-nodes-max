import type { IExecuteFunctions } from 'n8n-workflow';
import { maxApiRequest } from '../MaxApiRequest';

describe('Max API response int64 handling', () => {
	it('parses MAX JSON responses without rounding unsafe int64 values', async () => {
		const httpRequest = jest
			.fn()
			.mockResolvedValue(
				'{"user_id":9223372036854775807,"nested":{"chat_id":9007199254740993},"safe":42}',
			);
		const context = {
			getCredentials: jest.fn().mockResolvedValue({
				accessToken: 'secret-token',
				baseUrl: 'https://platform-api2.max.ru',
			}),
			getNode: jest.fn().mockReturnValue({ name: 'Max API' }),
			helpers: { httpRequest },
		} as unknown as IExecuteFunctions;

		await expect(maxApiRequest(context, { method: 'GET', path: '/me' })).resolves.toEqual({
			user_id: '9223372036854775807',
			nested: { chat_id: '9007199254740993' },
			safe: 42,
		});

		expect(httpRequest).toHaveBeenCalledWith(
			expect.objectContaining({ encoding: 'text', json: false }),
		);
	});
});
