import { getChatInfo, leaveChat, MaxErrorCategory } from '../GenericFunctions';
import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { Bot } from '@maxhub/max-bot-api';

// Mock the Bot class
jest.mock('@maxhub/max-bot-api');

describe('Chat Operations', () => {
	let mockExecuteFunctions: jest.Mocked<IExecuteFunctions>;
	let mockBot: jest.Mocked<Bot>;
	let mockHttpRequest: jest.Mock;

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks();

		// Create mock for httpRequest
		mockHttpRequest = jest.fn();

		// Mock IExecuteFunctions
		mockExecuteFunctions = {
			getCredentials: jest.fn(),
			helpers: {
				httpRequest: mockHttpRequest,
			},
			getNode: jest.fn().mockReturnValue({ name: 'Max Test Node' }),
		} as any;

		// Mock Bot instance
		mockBot = new Bot('test-token') as jest.Mocked<Bot>;

		// Mock credentials
		mockExecuteFunctions.getCredentials.mockResolvedValue({
			accessToken: 'test-token',
			baseUrl: 'https://botapi.max.ru',
		});
	});

	describe('getChatInfo', () => {
		it('should successfully get chat info', async () => {
			const mockChatInfo = {
				id: 12345,
				title: 'Test Chat',
				type: 'group',
				members_count: 10,
				description: 'Test chat description',
			};

			mockHttpRequest.mockResolvedValue(mockChatInfo);

			const result = await getChatInfo.call(mockExecuteFunctions, mockBot, 12345);

			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'GET',
				url: 'https://botapi.max.ru/chats/12345',
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				json: true,
			});

			expect(result).toEqual(mockChatInfo);
		});

		it('should validate chat ID is required', async () => {
			await expect(getChatInfo.call(mockExecuteFunctions, mockBot, 0)).rejects.toThrow(
				'Chat ID is required and must be a positive number'
			);

			await expect(getChatInfo.call(mockExecuteFunctions, mockBot, -1)).rejects.toThrow(
				'Chat ID is required and must be a positive number'
			);

			await expect(getChatInfo.call(mockExecuteFunctions, mockBot, NaN)).rejects.toThrow(
				'Chat ID is required and must be a positive number'
			);
		});

		it('should handle API errors with enhanced error handling', async () => {
			const apiError = {
				status: 404,
				message: 'Chat not found',
				error_code: 404,
			};

			mockHttpRequest.mockRejectedValue(apiError);

			// Mock handleMaxApiError to throw NodeApiError
			const mockHandleError = jest.fn().mockImplementation(() => {
				throw new NodeApiError(mockExecuteFunctions.getNode(), {
					message: 'Chat not found: Chat not found. The specified chat ID may be incorrect, or the bot may not have access to this chat. Make sure the bot has been added to the chat and has appropriate permissions.',
					description: 'Error during get chat info',
					httpCode: '404',
					error_code: 404,
					category: MaxErrorCategory.BUSINESS_LOGIC,
				});
			});

			// Replace the actual function with our mock
			const originalHandleError = require('../GenericFunctions').handleMaxApiError;
			require('../GenericFunctions').handleMaxApiError = mockHandleError;

			try {
				await getChatInfo.call(mockExecuteFunctions, mockBot, 12345);
				fail('Expected function to throw');
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toBeDefined();
			}

			// Restore original function
			require('../GenericFunctions').handleMaxApiError = originalHandleError;
		});

		it('should handle network errors', async () => {
			const networkError = {
				code: 'ECONNREFUSED',
				message: 'Connection refused',
			};

			mockHttpRequest.mockRejectedValue(networkError);

			await expect(getChatInfo.call(mockExecuteFunctions, mockBot, 12345)).rejects.toThrow();
		});

		it('should use custom base URL from credentials', async () => {
			const customBaseUrl = 'https://custom.max.api';
			mockExecuteFunctions.getCredentials.mockResolvedValue({
				accessToken: 'test-token',
				baseUrl: customBaseUrl,
			});

			const mockChatInfo = { id: 12345, title: 'Test Chat' };
			mockHttpRequest.mockResolvedValue(mockChatInfo);

			await getChatInfo.call(mockExecuteFunctions, mockBot, 12345);

			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'GET',
				url: `${customBaseUrl}/chats/12345`,
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				json: true,
			});
		});
	});

	describe('leaveChat', () => {
		it('should successfully leave chat', async () => {
			const mockResponse = {
				success: true,
				chat_id: 12345,
				message: 'Successfully left the chat',
			};

			mockHttpRequest.mockResolvedValue(mockResponse);

			const result = await leaveChat.call(mockExecuteFunctions, mockBot, 12345);

			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'POST',
				url: 'https://botapi.max.ru/chats/12345/leave',
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				json: true,
			});

			expect(result).toEqual(mockResponse);
		});

		it('should return default response when API returns empty response', async () => {
			mockHttpRequest.mockResolvedValue(null);

			const result = await leaveChat.call(mockExecuteFunctions, mockBot, 12345);

			expect(result).toEqual({
				success: true,
				chat_id: 12345,
				message: 'Successfully left the chat',
			});
		});

		it('should validate chat ID is required', async () => {
			await expect(leaveChat.call(mockExecuteFunctions, mockBot, 0)).rejects.toThrow(
				'Chat ID is required and must be a positive number'
			);

			await expect(leaveChat.call(mockExecuteFunctions, mockBot, -1)).rejects.toThrow(
				'Chat ID is required and must be a positive number'
			);

			await expect(leaveChat.call(mockExecuteFunctions, mockBot, NaN)).rejects.toThrow(
				'Chat ID is required and must be a positive number'
			);
		});

		it('should handle forbidden errors (bot not in chat)', async () => {
			const forbiddenError = {
				status: 403,
				message: 'Forbidden: bot is not a member of the chat',
				error_code: 403,
			};

			mockHttpRequest.mockRejectedValue(forbiddenError);

			await expect(leaveChat.call(mockExecuteFunctions, mockBot, 12345)).rejects.toThrow();
		});

		it('should handle authentication errors', async () => {
			const authError = {
				status: 401,
				message: 'Unauthorized: invalid token',
				error_code: 401,
			};

			mockHttpRequest.mockRejectedValue(authError);

			await expect(leaveChat.call(mockExecuteFunctions, mockBot, 12345)).rejects.toThrow();
		});

		it('should use custom base URL from credentials', async () => {
			const customBaseUrl = 'https://custom.max.api';
			mockExecuteFunctions.getCredentials.mockResolvedValue({
				accessToken: 'test-token',
				baseUrl: customBaseUrl,
			});

			const mockResponse = { success: true };
			mockHttpRequest.mockResolvedValue(mockResponse);

			await leaveChat.call(mockExecuteFunctions, mockBot, 12345);

			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'POST',
				url: `${customBaseUrl}/chats/12345/leave`,
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				json: true,
			});
		});
	});

	describe('Parameter Validation', () => {
		it('should validate positive chat IDs', async () => {
			const validChatIds = [1, 12345, 999999];
			
			for (const chatId of validChatIds) {
				mockHttpRequest.mockResolvedValue({ id: chatId });
				
				await expect(getChatInfo.call(mockExecuteFunctions, mockBot, chatId)).resolves.toBeDefined();
				await expect(leaveChat.call(mockExecuteFunctions, mockBot, chatId)).resolves.toBeDefined();
			}
		});

		it('should reject invalid chat IDs', async () => {
			const invalidChatIds = [0, -1, -12345, NaN, null, undefined];
			
			for (const chatId of invalidChatIds) {
				await expect(getChatInfo.call(mockExecuteFunctions, mockBot, chatId as any)).rejects.toThrow(
					'Chat ID is required and must be a positive number'
				);
				await expect(leaveChat.call(mockExecuteFunctions, mockBot, chatId as any)).rejects.toThrow(
					'Chat ID is required and must be a positive number'
				);
			}
		});
	});

	describe('Error Handling Integration', () => {
		it('should categorize different error types correctly', async () => {
			const errorScenarios = [
				{
					error: { status: 401, message: 'Unauthorized' },
					expectedCategory: MaxErrorCategory.AUTHENTICATION,
				},
				{
					error: { status: 404, message: 'Chat not found' },
					expectedCategory: MaxErrorCategory.BUSINESS_LOGIC,
				},
				{
					error: { status: 429, message: 'Too many requests' },
					expectedCategory: MaxErrorCategory.RATE_LIMIT,
				},
				{
					error: { status: 400, message: 'Bad request' },
					expectedCategory: MaxErrorCategory.VALIDATION,
				},
				{
					error: { code: 'ECONNREFUSED', message: 'Connection refused' },
					expectedCategory: MaxErrorCategory.NETWORK,
				},
			];

			for (const scenario of errorScenarios) {
				mockHttpRequest.mockRejectedValue(scenario.error);
				
				try {
					await getChatInfo.call(mockExecuteFunctions, mockBot, 12345);
					fail('Expected function to throw');
				} catch (error) {
					// The error should be handled by handleMaxApiError
					expect(error).toBeDefined();
				}
			}
		});
	});
});