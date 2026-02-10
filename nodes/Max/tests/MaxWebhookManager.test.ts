import { MaxWebhookManager } from '../MaxWebhookManager';
import type { IHookFunctions } from 'n8n-workflow';

describe('MaxWebhookManager', () => {
	let webhookManager: MaxWebhookManager;
	let mockHookFunctions: Partial<IHookFunctions>;

	beforeEach(() => {
		webhookManager = new MaxWebhookManager();

		mockHookFunctions = {
			getCredentials: jest.fn(),
			getNodeWebhookUrl: jest.fn(),
			getNodeParameter: jest.fn(),
			helpers: {
				httpRequest: jest.fn(),
			} as any,
		};
	});

	describe('getWebhookConfig', () => {
		it('should convert IDN webhook hostname to punycode', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockEvents = ['message_created'];
			const additionalFields = {
				secret: 'secret-key',
			};

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(
				'https://пример.рф/webhook',
			);
			(mockHookFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
				if (name === 'events') return mockEvents;
				if (name === 'additionalFields') return additionalFields;
				return undefined;
			});

			const result = await webhookManager.getWebhookConfig(mockHookFunctions as IHookFunctions);

			expect(result).toEqual({
				credentials: mockCredentials,
				baseUrl: 'https://platform-api.max.ru',
				webhookUrl: 'https://xn--e1afmkfd.xn--p1ai/webhook',
				events: mockEvents,
				additionalFields,
			});
		});

		it('should keep webhook URL unchanged when it is not a valid URL', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockEvents = ['message_created'];

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue('not-a-valid-url');
			(mockHookFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
				if (name === 'events') return mockEvents;
				if (name === 'additionalFields') return {};
				return undefined;
			});

			const result = await webhookManager.getWebhookConfig(mockHookFunctions as IHookFunctions);

			expect(result.webhookUrl).toBe('not-a-valid-url');
		});
	});

	describe('checkExists', () => {
		it('should return true when webhook exists', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockResponse = {
				subscriptions: [{ url: mockWebhookUrl, time: 123456, update_types: ['message_created'] }],
			};

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			const result = await webhookManager.checkExists.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(true);
			expect(mockHookFunctions.helpers!.httpRequest).toHaveBeenCalledWith({
				method: 'GET',
				url: 'https://platform-api.max.ru/subscriptions',
				headers: {
					Authorization: 'test-token',
				},
				json: true,
			});
		});

		it('should return false when webhook does not exist', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockResponse = {
				subscriptions: [
					{ url: 'https://other.com/webhook', time: 123456, update_types: ['message_created'] },
				],
			};

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			const result = await webhookManager.checkExists.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(false);
		});

		it('should return false when no subscriptions exist', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockResponse = {
				subscriptions: [],
			};

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			const result = await webhookManager.checkExists.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(false);
		});

		it('should return false on API error', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock).mockRejectedValue(
				new Error('API Error'),
			);

			const result = await webhookManager.checkExists.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(false);
		});

		it('should use default base URL when not provided', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockResponse = { subscriptions: [] };

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			await webhookManager.checkExists.call(mockHookFunctions as IHookFunctions);

			expect(mockHookFunctions.helpers!.httpRequest).toHaveBeenCalledWith({
				method: 'GET',
				url: 'https://platform-api.max.ru/subscriptions',
				headers: {
					Authorization: 'test-token',
				},
				json: true,
			});
		});
	});

	describe('create', () => {
		it('should create webhook when it does not exist', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockEvents = ['message_created', 'message_edited'];
			const mockResponse = { subscriptions: [] };

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
				if (name === 'events') return mockEvents;
				if (name === 'additionalFields') return {};
				return undefined;
			});
			(mockHookFunctions.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce(mockResponse) // GET subscriptions
				.mockResolvedValueOnce({}); // POST subscription

			const result = await webhookManager.create.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(true);
			expect(mockHookFunctions.helpers!.httpRequest).toHaveBeenCalledTimes(2);
			expect(mockHookFunctions.helpers!.httpRequest).toHaveBeenNthCalledWith(2, {
				method: 'POST',
				url: 'https://platform-api.max.ru/subscriptions',
				headers: {
					Authorization: 'test-token',
					'Content-Type': 'application/json',
				},
				body: {
					url: mockWebhookUrl,
					update_types: mockEvents,
				},
				json: true,
			});
		});

		it('should include trimmed secret when provided', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockEvents = ['message_created', 'message_edited'];
			const mockResponse = { subscriptions: [] };
			const additionalFields = {
				secret: '   my_secret_123   ',
			};

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
				if (name === 'events') return mockEvents;
				if (name === 'additionalFields') return additionalFields;
				return undefined;
			});
			(mockHookFunctions.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce(mockResponse)
				.mockResolvedValueOnce({});

			const result = await webhookManager.create.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(true);
			expect(mockHookFunctions.helpers!.httpRequest).toHaveBeenNthCalledWith(2, {
				method: 'POST',
				url: 'https://platform-api.max.ru/subscriptions',
				headers: {
					Authorization: 'test-token',
					'Content-Type': 'application/json',
				},
				body: {
					url: mockWebhookUrl,
					update_types: mockEvents,
					secret: 'my_secret_123',
				},
				json: true,
			});
		});

		it('should skip creation when webhook already exists', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockEvents = ['message_created'];
			const mockResponse = {
				subscriptions: [{ url: mockWebhookUrl, time: 123456, update_types: ['message_created'] }],
			};

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.getNodeParameter as jest.Mock).mockReturnValue(mockEvents);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			const result = await webhookManager.create.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(true);
			expect(mockHookFunctions.helpers!.httpRequest).toHaveBeenCalledTimes(1); // Only GET, no POST
		});

		it('should throw error when creation fails', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockEvents = ['message_created'];
			const mockResponse = { subscriptions: [] };

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.getNodeParameter as jest.Mock).mockReturnValue(mockEvents);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce(mockResponse) // GET subscriptions
				.mockRejectedValueOnce(new Error('Creation failed')); // POST subscription

			await expect(webhookManager.create.call(mockHookFunctions as IHookFunctions)).rejects.toThrow(
				'Creation failed',
			);
		});
	});

	describe('delete', () => {
		it('should delete existing webhook', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockResponse = {
				subscriptions: [{ url: mockWebhookUrl, time: 123456, update_types: ['message_created'] }],
			};

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce(mockResponse) // GET subscriptions
				.mockResolvedValueOnce({}); // DELETE subscription

			const result = await webhookManager.delete.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(true);
			expect(mockHookFunctions.helpers!.httpRequest).toHaveBeenCalledTimes(2);
			expect(mockHookFunctions.helpers!.httpRequest).toHaveBeenNthCalledWith(2, {
				method: 'DELETE',
				url: 'https://platform-api.max.ru/subscriptions',
				qs: {
					url: mockWebhookUrl,
				},
				headers: {
					Authorization: 'test-token',
				},
				json: true,
			});
		});

		it('should handle case when webhook does not exist', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';
			const mockResponse = {
				subscriptions: [
					{ url: 'https://other.com/webhook', time: 123456, update_types: ['message_created'] },
				],
			};

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			const result = await webhookManager.delete.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(true);
			expect(mockHookFunctions.helpers!.httpRequest).toHaveBeenCalledTimes(1); // Only GET, no DELETE
		});

		it('should return false on error but not throw', async () => {
			const mockCredentials = {
				accessToken: 'test-token',
				baseUrl: 'https://platform-api.max.ru',
			};
			const mockWebhookUrl = 'https://test.com/webhook';

			(mockHookFunctions.getCredentials as jest.Mock).mockResolvedValue(mockCredentials);
			(mockHookFunctions.getNodeWebhookUrl as jest.Mock).mockReturnValue(mockWebhookUrl);
			(mockHookFunctions.helpers!.httpRequest as jest.Mock).mockRejectedValue(
				new Error('API Error'),
			);

			const result = await webhookManager.delete.call(mockHookFunctions as IHookFunctions);

			expect(result).toBe(false);
		});
	});
});
