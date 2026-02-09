import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { 
	categorizeMaxError,
	createUserFriendlyErrorMessage,
	handleMaxApiError,
	MaxErrorCategory
} from '../GenericFunctions';

describe('Max Error Handling', () => {
	let mockExecuteFunctions: Partial<IExecuteFunctions>;

	beforeEach(() => {
		mockExecuteFunctions = {
			getNode: jest.fn().mockReturnValue({ name: 'Max', type: 'max' }),
		};
	});

	describe('Error Categorization Edge Cases', () => {
		it('should handle mixed case error messages', () => {
			const error = { message: 'UNAUTHORIZED ACCESS' };
			expect(categorizeMaxError(error)).toBe(MaxErrorCategory.AUTHENTICATION);

			const rateLimitError = { description: 'TOO MANY REQUESTS' };
			expect(categorizeMaxError(rateLimitError)).toBe(MaxErrorCategory.RATE_LIMIT);
		});

		it('should prioritize error_code over message content', () => {
			const error = { error_code: 401, message: 'Network timeout' };
			expect(categorizeMaxError(error)).toBe(MaxErrorCategory.AUTHENTICATION);
		});

		it('should handle errors with only status codes', () => {
			const error = { status: 429 };
			expect(categorizeMaxError(error)).toBe(MaxErrorCategory.RATE_LIMIT);
		});

		it('should handle errors with partial information', () => {
			const error = { description: 'Something went wrong' };
			expect(categorizeMaxError(error)).toBe(MaxErrorCategory.UNKNOWN);
		});
	});

	describe('User-Friendly Error Messages', () => {
		it('should handle errors without descriptions', () => {
			const error = { error_code: 401 };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.AUTHENTICATION);
			expect(message).toContain('Authorization failed - please check your credentials');
			expect(message).toContain('An unknown error occurred');
		});

		it('should handle rate limit errors without retry_after', () => {
			const error = { description: 'Rate limit exceeded' };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.RATE_LIMIT);
			expect(message).toContain('The service is receiving too many requests from you');
			expect(message).toContain('Please wait before retrying');
		});

		it('should provide specific guidance for different business logic errors', () => {
			const forbiddenError = { description: 'Forbidden access' };
			const forbiddenMessage = createUserFriendlyErrorMessage(forbiddenError, MaxErrorCategory.BUSINESS_LOGIC);
			expect(forbiddenMessage).toContain('Access denied');

			const notFoundError = { description: 'Resource not found' };
			const notFoundMessage = createUserFriendlyErrorMessage(notFoundError, MaxErrorCategory.BUSINESS_LOGIC);
			expect(notFoundMessage).toContain('Operation failed');
		});
	});

	describe('Error Handling with Retry Logic', () => {
		it('should handle rate limit errors with proper retry information', async () => {
			const rateLimitError = {
				error_code: 429,
				description: 'Too Many Requests',
				parameters: { retry_after: 120 }
			};

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					rateLimitError,
					'send message',
					0,
					3
				);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('The service is receiving too many requests from you');
				expect(error.httpCode).toBe('429');
				expect(error.description).toContain('Rate limit hit during send message');
			}
		});

		it('should handle network errors with retry logic', async () => {
			const networkError = {
				code: 'ETIMEDOUT',
				message: 'Request timeout'
			};

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					networkError,
					'send message',
					1,
					3
				);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('Network error');
				expect(error.description).toContain('Retry attempt 2/3');
			}
		});

		it('should not retry validation errors', async () => {
			const validationError = {
				error_code: 400,
				description: 'Invalid parameter: message too long'
			};

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					validationError,
					'send message'
				);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeOperationError);
				expect(error.message).toContain('Invalid request parameters');
			}
		});

		it('should handle authentication errors without retry', async () => {
			const authError = {
				error_code: 401,
				description: 'Invalid access token'
			};

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					authError,
					'send message'
				);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('Authorization failed - please check your credentials');
				expect(error.httpCode).toBe('401');
			}
		});
	});

	describe('Complex Error Scenarios', () => {
		it('should handle errors with migration information', async () => {
			const migrationError = {
				error_code: 400,
				description: 'Chat migrated',
				parameters: { migrate_to_chat_id: 12345 }
			};

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					migrationError,
					'send message'
				);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeOperationError);
				expect(error.message).toContain('Invalid request parameters');
			}
		});

		it('should handle nested error objects', async () => {
			const nestedError = {
				response: {
					data: {
						error_code: 404,
						description: 'Chat not found'
					}
				}
			};

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					nestedError,
					'send message'
				);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('The service was not able to process your request');
			}
		});

		it('should handle errors with multiple retry attempts', async () => {
			const networkError = {
				code: 'ECONNRESET',
				message: 'Connection reset by peer'
			};

			// Test with max retries reached
			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					networkError,
					'send message',
					3, // At max retries
					3
				);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('Network error');
			}
		});
	});

	describe('Error Message Formatting', () => {
		it('should preserve original error information', async () => {
			const originalError = {
				error_code: 500,
				description: 'Internal server error',
				timestamp: Date.now(),
				request_id: 'req_123'
			};

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					originalError,
					'test operation'
				);
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('The service was not able to process your request');
				expect(error.description).toContain('test operation');
			}
		});

		it('should include operation context in error messages', async () => {
			const error = { error_code: 400, description: 'Bad request' };

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					error,
					'send message to user'
				);
			} catch (thrownError) {
				expect(thrownError.description).toContain('send message to user');
			}
		});
	});

	describe('Error Recovery Guidance', () => {
		it('should provide specific recovery steps for common errors', () => {
			// Test chat not found error
			const chatNotFoundError = { description: 'Chat not found' };
			const chatMessage = createUserFriendlyErrorMessage(chatNotFoundError, MaxErrorCategory.BUSINESS_LOGIC);
			expect(chatMessage).toContain('bot has been added to the chat');
			expect(chatMessage).toContain('appropriate permissions');

			// Test user blocked error
			const userBlockedError = { description: 'User blocked bot' };
			const userMessage = createUserFriendlyErrorMessage(userBlockedError, MaxErrorCategory.BUSINESS_LOGIC);
			expect(userMessage).toContain('user may have blocked the bot');
			expect(userMessage).toContain('properly configured and authorized');

			// Test network error
			const networkError = { message: 'Connection failed' };
			const networkMessage = createUserFriendlyErrorMessage(networkError, MaxErrorCategory.NETWORK);
			expect(networkMessage).toContain('check your internet connection');
			expect(networkMessage).toContain('Max API service status');
		});

		it('should provide token refresh guidance for auth errors', () => {
			const tokenError = { description: 'Token expired' };
			const message = createUserFriendlyErrorMessage(tokenError, MaxErrorCategory.AUTHENTICATION);
			expect(message).toContain('@PrimeBot in Max messenger');
			expect(message).toContain('token is valid and has not expired');
		});
	});
});
