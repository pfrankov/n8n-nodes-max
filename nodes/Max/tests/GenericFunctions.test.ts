import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { 
	validateAndFormatText, 
	createMaxBotInstance, 
	categorizeMaxError,
	createUserFriendlyErrorMessage,
	handleMaxApiError,
	validateInputParameters,
	MaxErrorCategory,
	sendMessage,
	editMessage,
	deleteMessage
} from '../GenericFunctions';

// Mock the Max Bot API
jest.mock('@maxhub/max-bot-api', () => ({
	Bot: jest.fn().mockImplementation((token) => ({
		token,
		api: {
			sendMessageToUser: jest.fn(),
			sendMessageToChat: jest.fn(),
			editMessage: jest.fn(),
			deleteMessage: jest.fn(),
		},
	})),
}));

describe('GenericFunctions', () => {
	describe('validateAndFormatText', () => {
		it('should validate text length', () => {
			const longText = 'a'.repeat(4001);
			expect(() => validateAndFormatText(longText)).toThrow('Message text cannot exceed 4000 characters');
		});

		it('should allow text within limit', () => {
			const validText = 'Hello, this is a valid message';
			expect(validateAndFormatText(validText)).toBe(validText);
		});

		it('should validate HTML format', () => {
			const validHtml = 'Hello <b>world</b> with <i>formatting</i>';
			expect(validateAndFormatText(validHtml, 'html')).toBe(validHtml);
		});

		it('should reject invalid HTML tags', () => {
			const invalidHtml = 'Hello <script>alert("test")</script>';
			expect(() => validateAndFormatText(invalidHtml, 'html')).toThrow("HTML tag 'script' is not supported by Max messenger");
		});

		it('should validate basic markdown', () => {
			const validMarkdown = 'Hello *world* with _formatting_ and `code`';
			expect(validateAndFormatText(validMarkdown, 'markdown')).toBe(validMarkdown);
		});

		it('should reject unsupported markdown syntax', () => {
			const invalidMarkdown = 'Hello [link](http://example.com)';
			expect(() => validateAndFormatText(invalidMarkdown, 'markdown')).toThrow('Some Markdown syntax is not supported by Max messenger');
		});

		it('should handle plain text format', () => {
			const plainText = 'Hello world';
			expect(validateAndFormatText(plainText, 'plain')).toBe(plainText);
		});
	});

	describe('createMaxBotInstance', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			mockExecuteFunctions = {
				getCredentials: jest.fn(),
				getNode: jest.fn().mockReturnValue({ name: 'Max' }),
			};
		});

		it('should create Bot instance with valid credentials', async () => {
			const credentials = { accessToken: 'test-token' };
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue(credentials);

			const bot = await createMaxBotInstance.call(mockExecuteFunctions as IExecuteFunctions);

			expect(bot).toBeDefined();
			expect(bot.api).toBeDefined();
		});

		it('should throw error when access token is missing', async () => {
			const credentials = { accessToken: '' };
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue(credentials);

			await expect(createMaxBotInstance.call(mockExecuteFunctions as IExecuteFunctions))
				.rejects.toThrow(NodeApiError);
		});
	});

	describe('categorizeMaxError', () => {
		it('should categorize authentication errors', () => {
			const authError = { error_code: 401, description: 'Unauthorized' };
			expect(categorizeMaxError(authError)).toBe(MaxErrorCategory.AUTHENTICATION);

			const tokenError = { message: 'Invalid token provided' };
			expect(categorizeMaxError(tokenError)).toBe(MaxErrorCategory.AUTHENTICATION);
		});

		it('should categorize rate limit errors', () => {
			const rateLimitError = { error_code: 429, description: 'Too Many Requests' };
			expect(categorizeMaxError(rateLimitError)).toBe(MaxErrorCategory.RATE_LIMIT);

			const retryAfterError = { parameters: { retry_after: 30 } };
			expect(categorizeMaxError(retryAfterError)).toBe(MaxErrorCategory.RATE_LIMIT);
		});

		it('should categorize validation errors', () => {
			const validationError = { error_code: 400, description: 'Bad Request' };
			expect(categorizeMaxError(validationError)).toBe(MaxErrorCategory.VALIDATION);

			const paramError = { message: 'Invalid parameter: text too long' };
			expect(categorizeMaxError(paramError)).toBe(MaxErrorCategory.VALIDATION);
		});

		it('should categorize business logic errors', () => {
			const notFoundError = { error_code: 404, description: 'Chat not found' };
			expect(categorizeMaxError(notFoundError)).toBe(MaxErrorCategory.BUSINESS_LOGIC);

			const blockedError = { message: 'User blocked the bot' };
			expect(categorizeMaxError(blockedError)).toBe(MaxErrorCategory.BUSINESS_LOGIC);
		});

		it('should categorize network errors', () => {
			const networkError = { code: 'ECONNREFUSED', message: 'Connection refused' };
			expect(categorizeMaxError(networkError)).toBe(MaxErrorCategory.NETWORK);

			const timeoutError = { message: 'Request timeout' };
			expect(categorizeMaxError(timeoutError)).toBe(MaxErrorCategory.NETWORK);
		});

		it('should categorize unknown errors', () => {
			const unknownError = { message: 'Something went wrong' };
			expect(categorizeMaxError(unknownError)).toBe(MaxErrorCategory.UNKNOWN);
		});
	});

	describe('createUserFriendlyErrorMessage', () => {
		it('should create authentication error messages', () => {
			const error = { description: 'Invalid token' };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.AUTHENTICATION);
			expect(message).toContain('Authorization failed - please check your credentials');
			expect(message).toContain('check your Max API access token');
			expect(message).toContain('@MasterBot');
		});

		it('should create rate limit error messages', () => {
			const error = { description: 'Too many requests', parameters: { retry_after: 60 } };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.RATE_LIMIT);
			expect(message).toContain('The service is receiving too many requests from you');
			expect(message).toContain('wait 60 seconds');
		});

		it('should create validation error messages', () => {
			const error = { description: 'Invalid parameters' };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.VALIDATION);
			expect(message).toContain('Invalid request parameters');
			expect(message).toContain('max 4000 characters');
		});

		it('should create business logic error messages', () => {
			const chatError = { description: 'Chat not found' };
			const chatMessage = createUserFriendlyErrorMessage(chatError, MaxErrorCategory.BUSINESS_LOGIC);
			expect(chatMessage).toContain('Chat not found');
			expect(chatMessage).toContain('bot has been added to the chat');

			const blockedError = { description: 'User blocked bot' };
			const blockedMessage = createUserFriendlyErrorMessage(blockedError, MaxErrorCategory.BUSINESS_LOGIC);
			expect(blockedMessage).toContain('Access denied');
			expect(blockedMessage).toContain('user may have blocked the bot');
		});

		it('should create network error messages', () => {
			const error = { message: 'Connection timeout' };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.NETWORK);
			expect(message).toContain('Network error');
			expect(message).toContain('check your internet connection');
		});

		it('should create unknown error messages', () => {
			const error = { message: 'Unexpected error' };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.UNKNOWN);
			expect(message).toContain('Unexpected error');
			expect(message).toContain('Max API documentation');
		});
	});

	describe('validateInputParameters', () => {
		it('should validate recipient ID', () => {
			expect(() => validateInputParameters('user', 0, 'test')).toThrow('Invalid user ID: must be a positive number');
			expect(() => validateInputParameters('user', -1, 'test')).toThrow('Invalid user ID: must be a positive number');
			expect(() => validateInputParameters('user', NaN, 'test')).toThrow('Invalid user ID: must be a positive number');
			expect(() => validateInputParameters('chat', 0, 'test')).toThrow('Invalid chat ID: must be a positive number');
		});

		it('should validate message text', () => {
			expect(() => validateInputParameters('user', 123, '')).toThrow('Message text cannot be empty');
			expect(() => validateInputParameters('user', 123, '   ')).toThrow('Message text cannot be empty');
			expect(() => validateInputParameters('user', 123, null as any)).toThrow('Message text is required and must be a string');
			expect(() => validateInputParameters('user', 123, undefined as any)).toThrow('Message text is required and must be a string');
		});

		it('should validate HTML format', () => {
			expect(() => validateInputParameters('user', 123, '<b>unclosed tag', 'html')).toThrow('HTML format error: unclosed tags detected');
			expect(() => validateInputParameters('user', 123, '<b>test</b><i>unclosed', 'html')).toThrow('HTML format error: unclosed tags detected');
		});

		it('should validate Markdown format', () => {
			expect(() => validateInputParameters('user', 123, '*unclosed bold', 'markdown')).toThrow('Markdown format error: unmatched bold markers');
			expect(() => validateInputParameters('user', 123, '_unclosed italic', 'markdown')).toThrow('Markdown format error: unmatched italic markers');
			expect(() => validateInputParameters('user', 123, '`unclosed code', 'markdown')).toThrow('Markdown format error: unmatched code markers');
		});

		it('should pass valid parameters', () => {
			expect(() => validateInputParameters('user', 123, 'Hello world')).not.toThrow();
			expect(() => validateInputParameters('chat', 456, '<b>Hello</b> <i>world</i>', 'html')).not.toThrow();
			expect(() => validateInputParameters('user', 789, '*Hello* _world_ `code`', 'markdown')).not.toThrow();
		});
	});

	describe('handleMaxApiError', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			mockExecuteFunctions = {
				getNode: jest.fn().mockReturnValue({ name: 'Max' }),
			};
		});

		it('should handle authentication errors', async () => {
			const authError = { error_code: 401, description: 'Unauthorized' };
			
			await expect(handleMaxApiError.call(mockExecuteFunctions as IExecuteFunctions, authError, 'test operation'))
				.rejects.toThrow(NodeApiError);
		});

		it('should handle rate limit errors with retry information', async () => {
			const rateLimitError = { error_code: 429, parameters: { retry_after: 30 } };
			
			try {
				await handleMaxApiError.call(mockExecuteFunctions as IExecuteFunctions, rateLimitError, 'test operation');
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('The service is receiving too many requests from you');
				expect(error.httpCode).toBe('429');
			}
		});

		it('should handle validation errors', async () => {
			const validationError = { error_code: 400, description: 'Bad Request' };
			
			await expect(handleMaxApiError.call(mockExecuteFunctions as IExecuteFunctions, validationError, 'test operation'))
				.rejects.toThrow(NodeOperationError);
		});

		it('should handle network errors with retry information', async () => {
			const networkError = { code: 'ECONNREFUSED', message: 'Connection refused' };
			
			try {
				await handleMaxApiError.call(mockExecuteFunctions as IExecuteFunctions, networkError, 'test operation');
			} catch (error) {
				expect(error).toBeInstanceOf(NodeApiError);
				expect(error.message).toContain('Network error');
				expect(error.description).toContain('Network error during test operation');
			}
		});
	});

	describe('sendMessage', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;
		let mockBot: any;

		beforeEach(() => {
			mockExecuteFunctions = {
				getNode: jest.fn().mockReturnValue({ name: 'Max' }),
			};
			mockBot = {
				api: {
					sendMessageToUser: jest.fn(),
					sendMessageToChat: jest.fn(),
				},
			};
		});

		it('should send message to user successfully', async () => {
			const expectedResponse = { message_id: 123, text: 'Hello' };
			mockBot.api.sendMessageToUser.mockResolvedValue(expectedResponse);

			const result = await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				123,
				'Hello',
				{}
			);

			expect(result).toEqual(expectedResponse);
			expect(mockBot.api.sendMessageToUser).toHaveBeenCalledWith(123, 'Hello', {});
		});

		it('should send message to chat successfully', async () => {
			const expectedResponse = { message_id: 456, text: 'Hello chat' };
			mockBot.api.sendMessageToChat.mockResolvedValue(expectedResponse);

			const result = await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'chat',
				456,
				'Hello chat',
				{ notify: false }
			);

			expect(result).toEqual(expectedResponse);
			expect(mockBot.api.sendMessageToChat).toHaveBeenCalledWith(456, 'Hello chat', { notify: false });
		});

		it('should handle API errors with enhanced error handling', async () => {
			const apiError = { error_code: 404, description: 'Chat not found' };
			mockBot.api.sendMessageToChat.mockRejectedValue(apiError);

			await expect(sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'chat',
				999,
				'Hello',
				{}
			)).rejects.toThrow();
		});

		it('should validate parameters before API call', async () => {
			await expect(sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				0, // Invalid user ID
				'Hello',
				{}
			)).rejects.toThrow('Invalid user ID: must be a positive number');
		});
	});

	describe('editMessage', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;
		let mockBot: any;

		beforeEach(() => {
			mockExecuteFunctions = {
				getNode: jest.fn().mockReturnValue({ name: 'Max' }),
				getCredentials: jest.fn(),
				helpers: {
					httpRequest: jest.fn(),
				} as any,
			};
			mockBot = {
				api: {
					editMessage: jest.fn(),
				},
			};
		});

		it('should edit message successfully', async () => {
			const expectedResponse = { message_id: '123', text: 'Updated message' };
			const mockHttpRequest = jest.fn().mockResolvedValue(expectedResponse);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });

			const result = await editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123',
				'Updated message',
				{}
			);

			expect(result).toEqual(expectedResponse);
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'PUT',
				url: 'https://botapi.max.ru/messages/123',
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ text: 'Updated message' }),
				json: true,
			});
		});

		it('should edit message with formatting options', async () => {
			const expectedResponse = { message_id: '456', text: 'Updated <b>message</b>' };
			const mockHttpRequest = jest.fn().mockResolvedValue(expectedResponse);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });

			const result = await editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'456',
				'Updated <b>message</b>',
				{ format: 'html' }
			);

			expect(result).toEqual(expectedResponse);
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'PUT',
				url: 'https://botapi.max.ru/messages/456',
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ text: 'Updated <b>message</b>', format: 'html' }),
				json: true,
			});
		});

		it('should validate message ID', async () => {
			await expect(editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'', // Empty message ID
				'Updated message',
				{}
			)).rejects.toThrow('Message ID is required and cannot be empty');

			await expect(editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'   ', // Whitespace only message ID
				'Updated message',
				{}
			)).rejects.toThrow('Message ID is required and cannot be empty');
		});

		it('should validate message text', async () => {
			await expect(editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123',
				'a'.repeat(4001), // Text too long
				{}
			)).rejects.toThrow('Message text cannot exceed 4000 characters');
		});

		it('should handle API errors with enhanced error handling', async () => {
			const apiError = { error_code: 404, description: 'Message not found' };
			const mockHttpRequest = jest.fn().mockRejectedValue(apiError);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });

			await expect(editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'999',
				'Updated message',
				{}
			)).rejects.toThrow();
		});

		it('should validate HTML format in edit message', async () => {
			await expect(editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123',
				'<b>unclosed tag',
				{ format: 'html' }
			)).rejects.toThrow('HTML format error: unclosed tags detected');
		});

		it('should validate Markdown format in edit message', async () => {
			await expect(editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123',
				'*unclosed bold',
				{ format: 'markdown' }
			)).rejects.toThrow('Markdown format error: unmatched bold markers');
		});
	});

	describe('deleteMessage', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;
		let mockBot: any;

		beforeEach(() => {
			mockExecuteFunctions = {
				getNode: jest.fn().mockReturnValue({ name: 'Max' }),
				getCredentials: jest.fn(),
				helpers: {
					httpRequest: jest.fn(),
				} as any,
			};
			mockBot = {
				api: {
					deleteMessage: jest.fn(),
				},
			};
		});

		it('should delete message successfully', async () => {
			const expectedResponse = { success: true };
			const mockHttpRequest = jest.fn().mockResolvedValue(expectedResponse);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });

			const result = await deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123'
			);

			expect(result).toEqual(expectedResponse);
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'DELETE',
				url: 'https://botapi.max.ru/messages/123',
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				json: true,
			});
		});

		it('should handle API response without return value', async () => {
			const mockHttpRequest = jest.fn().mockResolvedValue(null);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });

			const result = await deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123'
			);

			expect(result).toEqual({ success: true, message_id: '123' });
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'DELETE',
				url: 'https://botapi.max.ru/messages/123',
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				json: true,
			});
		});

		it('should handle API response with undefined return value', async () => {
			const mockHttpRequest = jest.fn().mockResolvedValue(undefined);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });

			const result = await deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'456'
			);

			expect(result).toEqual({ success: true, message_id: '456' });
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'DELETE',
				url: 'https://botapi.max.ru/messages/456',
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				json: true,
			});
		});

		it('should validate message ID', async () => {
			await expect(deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'' // Empty message ID
			)).rejects.toThrow('Message ID is required and cannot be empty');

			await expect(deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'   ' // Whitespace only message ID
			)).rejects.toThrow('Message ID is required and cannot be empty');
		});

		it('should handle API errors with enhanced error handling', async () => {
			const apiError = { error_code: 404, description: 'Message not found' };
			const mockHttpRequest = jest.fn().mockRejectedValue(apiError);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });

			await expect(deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'999'
			)).rejects.toThrow();
		});

		it('should handle permission errors', async () => {
			const permissionError = { error_code: 403, description: 'Forbidden: bot cannot delete this message' };
			const mockHttpRequest = jest.fn().mockRejectedValue(permissionError);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });

			await expect(deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123'
			)).rejects.toThrow();
		});

		it('should handle network errors', async () => {
			const networkError = { code: 'ECONNREFUSED', message: 'Connection refused' };
			const mockHttpRequest = jest.fn().mockRejectedValue(networkError);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({ accessToken: 'test-token' });

			await expect(deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123'
			)).rejects.toThrow();
		});
	});
});