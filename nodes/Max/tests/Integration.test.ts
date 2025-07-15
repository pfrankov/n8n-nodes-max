import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { Max } from '../Max.node';

// Mock the Max Bot API with error scenarios
jest.mock('@maxhub/max-bot-api', () => ({
	Bot: jest.fn().mockImplementation((token) => ({
		token,
		api: {
			sendMessageToUser: jest.fn(),
			sendMessageToChat: jest.fn(),
		},
	})),
}));

describe('Max Node Integration Tests - Error Handling', () => {
	let maxNode: Max;
	let mockExecuteFunctions: Partial<IExecuteFunctions>;

	beforeEach(() => {
		maxNode = new Max();
		mockExecuteFunctions = {
			getInputData: jest.fn().mockReturnValue([{ json: {} }]),
			getNodeParameter: jest.fn(),
			getCredentials: jest.fn().mockResolvedValue({
				accessToken: 'test-token',
				baseUrl: 'https://botapi.max.ru'
			}),
			getNode: jest.fn().mockReturnValue({ name: 'Max', type: 'max' }),
			continueOnFail: jest.fn().mockReturnValue(false),
		};
	});

	describe('Parameter Validation Errors', () => {
		it('should handle invalid user ID gracefully', async () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('message') // resource
				.mockReturnValueOnce('sendMessage') // operation
				.mockReturnValueOnce('user') // sendTo
				.mockReturnValueOnce('Hello world') // text
				.mockReturnValueOnce('plain') // format
				.mockReturnValueOnce('invalid-id') // userId - invalid
				.mockReturnValueOnce({}); // additionalFields

			await expect(maxNode.execute.call(mockExecuteFunctions as IExecuteFunctions))
				.rejects.toThrow(NodeOperationError);
		});

		it('should handle empty message text', async () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('message') // resource
				.mockReturnValueOnce('sendMessage') // operation
				.mockReturnValueOnce('user') // sendTo
				.mockReturnValueOnce('') // text - empty
				.mockReturnValueOnce('plain') // format
				.mockReturnValueOnce('123') // userId
				.mockReturnValueOnce({}); // additionalFields

			await expect(maxNode.execute.call(mockExecuteFunctions as IExecuteFunctions))
				.rejects.toThrow('Message text cannot be empty');
		});

		it('should handle message text too long', async () => {
			const longText = 'a'.repeat(4001);
			(mockExecuteFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('message') // resource
				.mockReturnValueOnce('sendMessage') // operation
				.mockReturnValueOnce('user') // sendTo
				.mockReturnValueOnce(longText) // text - too long
				.mockReturnValueOnce('plain') // format
				.mockReturnValueOnce('123') // userId
				.mockReturnValueOnce({}); // additionalFields

			await expect(maxNode.execute.call(mockExecuteFunctions as IExecuteFunctions))
				.rejects.toThrow('Message text cannot exceed 4000 characters');
		});

		it('should handle invalid HTML format', async () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('message') // resource
				.mockReturnValueOnce('sendMessage') // operation
				.mockReturnValueOnce('user') // sendTo
				.mockReturnValueOnce('<script>alert("test")</script>') // text - invalid HTML
				.mockReturnValueOnce('html') // format
				.mockReturnValueOnce('123') // userId
				.mockReturnValueOnce({}); // additionalFields

			await expect(maxNode.execute.call(mockExecuteFunctions as IExecuteFunctions))
				.rejects.toThrow("HTML tag 'script' is not supported by Max messenger");
		});
	});

	describe('API Error Handling', () => {
		it('should handle authentication errors from API', async () => {
			const { Bot } = require('@maxhub/max-bot-api');
			const mockBot = {
				api: {
					sendMessageToUser: jest.fn().mockRejectedValue({
						error_code: 401,
						description: 'Unauthorized'
					})
				}
			};
			Bot.mockImplementation(() => mockBot);

			(mockExecuteFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('message') // resource
				.mockReturnValueOnce('sendMessage') // operation
				.mockReturnValueOnce('user') // sendTo
				.mockReturnValueOnce('Hello world') // text
				.mockReturnValueOnce('plain') // format
				.mockReturnValueOnce('123') // userId
				.mockReturnValueOnce({}); // additionalFields

			await expect(maxNode.execute.call(mockExecuteFunctions as IExecuteFunctions))
				.rejects.toThrow(NodeApiError);
		});

		it('should handle rate limit errors from API', async () => {
			const { Bot } = require('@maxhub/max-bot-api');
			const mockBot = {
				api: {
					sendMessageToUser: jest.fn().mockRejectedValue({
						error_code: 429,
						description: 'Too Many Requests',
						parameters: { retry_after: 60 }
					})
				}
			};
			Bot.mockImplementation(() => mockBot);

			(mockExecuteFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('message') // resource
				.mockReturnValueOnce('sendMessage') // operation
				.mockReturnValueOnce('user') // sendTo
				.mockReturnValueOnce('Hello world') // text
				.mockReturnValueOnce('plain') // format
				.mockReturnValueOnce('123') // userId
				.mockReturnValueOnce({}); // additionalFields

			try {
				await maxNode.execute.call(mockExecuteFunctions as IExecuteFunctions);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('The service is receiving too many requests from you');
				expect(error.httpCode).toBe('429');
			}
		});

		it('should handle business logic errors from API', async () => {
			const { Bot } = require('@maxhub/max-bot-api');
			const mockBot = {
				api: {
					sendMessageToChat: jest.fn().mockRejectedValue({
						error_code: 404,
						description: 'Chat not found'
					})
				}
			};
			Bot.mockImplementation(() => mockBot);

			(mockExecuteFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('message') // resource
				.mockReturnValueOnce('sendMessage') // operation
				.mockReturnValueOnce('chat') // sendTo
				.mockReturnValueOnce('Hello world') // text
				.mockReturnValueOnce('plain') // format
				.mockReturnValueOnce('999') // chatId
				.mockReturnValueOnce({}); // additionalFields

			try {
				await maxNode.execute.call(mockExecuteFunctions as IExecuteFunctions);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('The resource you are requesting could not be found');
			}
		});
	});

	describe('Continue on Fail Behavior', () => {
		it('should continue execution on fail when enabled', async () => {
			(mockExecuteFunctions.continueOnFail as jest.Mock).mockReturnValue(true);
			(mockExecuteFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('message') // resource
				.mockReturnValueOnce('sendMessage') // operation
				.mockReturnValueOnce('user') // sendTo
				.mockReturnValueOnce('') // text - empty (will cause error)
				.mockReturnValueOnce('plain') // format
				.mockReturnValueOnce('123') // userId
				.mockReturnValueOnce({}); // additionalFields

			const result = await maxNode.execute.call(mockExecuteFunctions as IExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveLength(1);
			expect(result[0]?.[0]?.json?.['error']).toContain('Message text cannot be empty');
		});
	});

	describe('Successful Operations', () => {
		it('should successfully send message to user', async () => {
			const { Bot } = require('@maxhub/max-bot-api');
			const mockBot = {
				api: {
					sendMessageToUser: jest.fn().mockResolvedValue({
						message_id: 123,
						text: 'Hello world',
						user_id: 123
					})
				}
			};
			Bot.mockImplementation(() => mockBot);

			(mockExecuteFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('message') // resource
				.mockReturnValueOnce('sendMessage') // operation
				.mockReturnValueOnce('user') // sendTo
				.mockReturnValueOnce('Hello world') // text
				.mockReturnValueOnce('plain') // format
				.mockReturnValueOnce('123') // userId
				.mockReturnValueOnce({}); // additionalFields

			const result = await maxNode.execute.call(mockExecuteFunctions as IExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveLength(1);
			expect(result[0]?.[0]?.json?.['message_id']).toBe(123);
			expect(result[0]?.[0]?.json?.['text']).toBe('Hello world');
		});
	});
});