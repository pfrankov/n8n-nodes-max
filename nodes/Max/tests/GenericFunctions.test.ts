import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import {
	validateAndFormatText,
	createMaxBotInstance,
	categorizeMaxError,
	createUserFriendlyErrorMessage,
	validateInputParameters,
	MaxErrorCategory,
	sendMessage,
	editMessage,
	deleteMessage,
	answerCallbackQuery,
	addAdditionalFields,
	handleMaxApiError,
	validateAttachment,
	downloadFileFromUrl,
	uploadFileToMax,
	processBinaryAttachment,
	processUrlAttachment,
	handleAttachments,
	validateKeyboardButton,
	getChatInfo,
	leaveChat,
	validateKeyboardLayout,
	formatInlineKeyboard,
	createInlineKeyboardAttachment,
	processKeyboardFromParameters,
} from '../GenericFunctions';
import {
	createMockExecuteFunctions,
	ErrorFactory,
	AttachmentConfigFactory,
	KeyboardButtonFactory,
	BinaryDataFactory,
	NodeExecutionDataFactory,
	AssertionHelpers,
	MockScenarioBuilder,
	TEST_CONSTANTS,
} from './testUtils';

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

// Mock external dependencies for comprehensive tests
jest.mock('crypto', () => ({
	randomUUID: jest.fn().mockReturnValue('test-uuid-12345'),
}));

jest.mock('os', () => ({
	tmpdir: jest.fn().mockReturnValue('/tmp'),
}));

jest.mock('path', () => ({
	join: jest.fn().mockImplementation((...paths: string[]) => paths.join('/')),
	basename: jest.fn().mockImplementation((filePath: string) => {
		const parts = filePath.split('/');
		return parts[parts.length - 1] ?? filePath;
	}),
}));

jest.mock('fs', () => ({
	promises: {
		writeFile: jest.fn().mockResolvedValue(undefined),
		readFile: jest.fn().mockResolvedValue(Buffer.from('test file content')),
		unlink: jest.fn().mockResolvedValue(undefined),
	},
}));

describe('GenericFunctions - Comprehensive Test Suite', () => {
	// ============================================================================
	// CORE TEXT VALIDATION AND FORMATTING
	// ============================================================================

	describe('validateAndFormatText', () => {
		it('should validate text length', () => {
			const longText = 'a'.repeat(4001);
			expect(() => validateAndFormatText(longText)).toThrow(
				'Message text cannot exceed 4000 characters',
			);
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
			expect(() => validateAndFormatText(invalidHtml, 'html')).toThrow(
				"HTML tag 'script' is not supported by Max messenger",
			);
		});

		it('should validate basic markdown', () => {
			const validMarkdown = 'Hello *world* with _formatting_ and `code`';
			expect(validateAndFormatText(validMarkdown, 'markdown')).toBe(validMarkdown);
		});

		it('should allow Max-flavored markdown including links', () => {
			const markdownWithLink = 'Hello [link](http://example.com)';
			expect(() => validateAndFormatText(markdownWithLink, 'markdown')).not.toThrow();
		});

		it('should handle plain text format', () => {
			const plainText = 'Hello world';
			expect(validateAndFormatText(plainText, 'plain')).toBe(plainText);
		});

		it('should handle edge case text lengths', () => {
			expect(() => validateAndFormatText(TEST_CONSTANTS.TEXT_LENGTHS.LONG)).not.toThrow();
			expect(() => validateAndFormatText(TEST_CONSTANTS.TEXT_LENGTHS.OVERSIZED)).toThrow();
		});

		it('should validate complex HTML structures', () => {
			const complexHtml = '<b>Bold <i>and italic</i></b> with <code>code</code>';
			expect(validateAndFormatText(complexHtml, 'html')).toBe(complexHtml);
		});

		it('should validate nested markdown', () => {
			const nestedMarkdown = '*Bold with `code` inside*';
			expect(validateAndFormatText(nestedMarkdown, 'markdown')).toBe(nestedMarkdown);
		});
	});

	// ============================================================================
	// BOT INSTANCE CREATION AND AUTHENTICATION
	// ============================================================================

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

			await expect(
				createMaxBotInstance.call(mockExecuteFunctions as IExecuteFunctions),
			).rejects.toThrow(NodeApiError);
		});

		it('should handle custom base URL configuration', async () => {
			const credentials = {
				accessToken: 'test-token',
				baseUrl: 'https://custom.max.api',
			};
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue(credentials);

			const bot = await createMaxBotInstance.call(mockExecuteFunctions as IExecuteFunctions);
			expect(bot).toBeDefined();
		});

		it('should handle missing credentials gracefully', async () => {
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({});

			await expect(
				createMaxBotInstance.call(mockExecuteFunctions as IExecuteFunctions),
			).rejects.toThrow(NodeApiError);
		});
	});

	// ============================================================================
	// ERROR CATEGORIZATION AND HANDLING
	// ============================================================================

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

		it('should handle errors with status codes', () => {
			const statusError = { status: 401, message: 'Unauthorized' };
			expect(categorizeMaxError(statusError)).toBe(MaxErrorCategory.AUTHENTICATION);
		});

		it('should handle complex error structures', () => {
			const complexError = {
				error_code: 403,
				description: 'Forbidden access',
			};
			expect(categorizeMaxError(complexError)).toBe(MaxErrorCategory.BUSINESS_LOGIC);
		});
	});

	describe('createUserFriendlyErrorMessage', () => {
		it('should create authentication error messages', () => {
			const error = { description: 'Invalid token' };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.AUTHENTICATION);
			expect(message).toContain('Authorization failed - please check your credentials');
			expect(message).toContain('check your Max API access token');
			expect(message).toContain('@PrimeBot');
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
			const chatMessage = createUserFriendlyErrorMessage(
				chatError,
				MaxErrorCategory.BUSINESS_LOGIC,
			);
			expect(chatMessage).toContain('Chat not found');
			expect(chatMessage).toContain('bot has been added to the chat');

			const blockedError = { description: 'User blocked bot' };
			const blockedMessage = createUserFriendlyErrorMessage(
				blockedError,
				MaxErrorCategory.BUSINESS_LOGIC,
			);
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

		it('should handle errors without retry_after parameter', () => {
			const error = { description: 'Too many requests' };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.RATE_LIMIT);
			expect(message).toContain('Please wait before retrying');
		});

		it('should handle errors with only message field', () => {
			const error = { message: 'Something went wrong' };
			const message = createUserFriendlyErrorMessage(error, MaxErrorCategory.UNKNOWN);
			expect(message).toContain('Something went wrong');
		});
	});

	describe('handleMaxApiError', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			mockExecuteFunctions = createMockExecuteFunctions();
		});

		it('should handle authentication errors with proper categorization', async () => {
			const authError = ErrorFactory.createAuthError();

			await AssertionHelpers.expectAsyncError(
				() =>
					handleMaxApiError.call(
						mockExecuteFunctions as IExecuteFunctions,
						authError,
						'test operation',
					),
				NodeApiError,
				/Authorization failed - please check your credentials/,
			);
		});

		it('should handle rate limit errors with retry guidance', async () => {
			const rateLimitError = ErrorFactory.createRateLimitError({ parameters: { retry_after: 30 } });

			await AssertionHelpers.expectAsyncError(
				() =>
					handleMaxApiError.call(
						mockExecuteFunctions as IExecuteFunctions,
						rateLimitError,
						'test operation',
					),
				NodeApiError,
				/too many requests/i,
			);
		});

		it('should handle validation errors as NodeOperationError', async () => {
			const validationError = ErrorFactory.createValidationError();

			await AssertionHelpers.expectAsyncError(
				() =>
					handleMaxApiError.call(
						mockExecuteFunctions as IExecuteFunctions,
						validationError,
						'test operation',
					),
				NodeOperationError,
				/Invalid request parameters/,
			);
		});

		it('should handle business logic errors with specific guidance', async () => {
			const businessError = ErrorFactory.createBusinessLogicError();

			await AssertionHelpers.expectAsyncError(
				() =>
					handleMaxApiError.call(
						mockExecuteFunctions as IExecuteFunctions,
						businessError,
						'test operation',
					),
				NodeApiError,
				/resource you are requesting could not be found/i,
			);
		});

		it('should handle network errors with retry indication', async () => {
			const networkError = ErrorFactory.createNetworkError();

			await AssertionHelpers.expectAsyncError(
				() =>
					handleMaxApiError.call(
						mockExecuteFunctions as IExecuteFunctions,
						networkError,
						'test operation',
					),
				NodeApiError,
				/Network error.*check your internet connection/i,
			);
		});

		it('should handle unknown errors with generic guidance', async () => {
			const unknownError = ErrorFactory.createUnknownError();

			await AssertionHelpers.expectAsyncError(
				() =>
					handleMaxApiError.call(
						mockExecuteFunctions as IExecuteFunctions,
						unknownError,
						'test operation',
					),
				NodeApiError,
				/not able to process your request/i,
			);
		});

		it('should include retry count in error description for retryable errors', async () => {
			const networkError = ErrorFactory.createNetworkError();

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					networkError,
					'test operation',
					2,
					3,
				);
			} catch (error: any) {
				expect(error.description).toContain('Retry attempt 3/3');
			}
		});

		it('should preserve original error details in enhanced error', async () => {
			const originalError = ErrorFactory.createAuthError({ error_code: 401 });

			try {
				await handleMaxApiError.call(
					mockExecuteFunctions as IExecuteFunctions,
					originalError,
					'test operation',
				);
			} catch (error: any) {
				expect(error.httpCode).toBe('401');
				// The category is not directly attached to the thrown error, but the error is properly categorized
				expect(error.message).toContain('Authorization failed');
			}
		});
	});

	// ============================================================================
	// INPUT PARAMETER VALIDATION
	// ============================================================================

	describe('validateInputParameters', () => {
		it('should throw an error for non-numeric recipient ID', () => {
			expect(() => validateInputParameters('user', 'abc' as any, 'test')).toThrow(
				'Invalid user ID: must be a number',
			);
			expect(() => validateInputParameters('chat', 'xyz' as any, 'test')).toThrow(
				'Invalid chat ID: must be a number',
			);
			expect(() => validateInputParameters('user', NaN, 'test')).toThrow(
				'Invalid user ID: must be a number',
			);
		});

		it('should validate message text', () => {
			expect(() => validateInputParameters('user', 123, '')).toThrow(
				'Message text cannot be empty',
			);
			expect(() => validateInputParameters('user', 123, '   ')).toThrow(
				'Message text cannot be empty',
			);
			expect(() => validateInputParameters('user', 123, null as any)).toThrow(
				'Message text is required and must be a string',
			);
			expect(() => validateInputParameters('user', 123, undefined as any)).toThrow(
				'Message text is required and must be a string',
			);
		});

		it('should allow empty message text when attachment-only send is enabled', () => {
			expect(() =>
				validateInputParameters('user', 123, '', undefined, { allowEmptyText: true }),
			).not.toThrow();
			expect(() =>
				validateInputParameters('chat', 456, '   ', undefined, { allowEmptyText: true }),
			).not.toThrow();
		});

		it('should validate HTML format', () => {
			expect(() => validateInputParameters('user', 123, '<b>unclosed tag', 'html')).toThrow(
				'HTML format error: unclosed tags detected',
			);
			expect(() => validateInputParameters('user', 123, '<b>test</b><i>unclosed', 'html')).toThrow(
				'HTML format error: unclosed tags detected',
			);
		});

		it('should validate Markdown format', () => {
			expect(() => validateInputParameters('user', 123, '*unclosed bold', 'markdown')).toThrow(
				'Markdown format error: unmatched bold markers',
			);
			expect(() => validateInputParameters('user', 123, '_unclosed italic', 'markdown')).toThrow(
				'Markdown format error: unmatched italic markers',
			);
			expect(() => validateInputParameters('user', 123, '`unclosed code', 'markdown')).toThrow(
				'Markdown format error: unmatched code markers',
			);
		});

		it('should pass valid parameters', () => {
			expect(() => validateInputParameters('user', 123, 'Hello world')).not.toThrow();
			expect(() =>
				validateInputParameters('chat', 456, '<b>Hello</b> <i>world</i>', 'html'),
			).not.toThrow();
			expect(() =>
				validateInputParameters('user', 789, '*Hello* _world_ `code`', 'markdown'),
			).not.toThrow();
		});

		it('should allow positive, negative, and zero recipient IDs', () => {
			// Positive
			expect(() => validateInputParameters('user', 12345, 'test')).not.toThrow();
			expect(() => validateInputParameters('chat', 67890, 'test')).not.toThrow();
			// Negative
			expect(() => validateInputParameters('user', -12345, 'test')).not.toThrow();
			expect(() => validateInputParameters('chat', -67890, 'test')).not.toThrow();
			// Zero
			expect(() => validateInputParameters('user', 0, 'test')).not.toThrow();
			expect(() => validateInputParameters('chat', 0, 'test')).not.toThrow();
		});
	});

	// ============================================================================
	// MESSAGE OPERATIONS
	// ============================================================================

	describe('sendMessage', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;
		let mockBot: any;

		beforeEach(() => {
			mockExecuteFunctions = {
				getNode: jest.fn().mockReturnValue({ name: 'Max' }),
				getCredentials: jest.fn().mockResolvedValue({ accessToken: 'test-token' }),
				helpers: {
					httpRequest: jest.fn(),
				} as any,
			};
			mockBot = {};
		});

		it('should send message to user successfully', async () => {
			const expectedResponse = { message_id: 123, text: 'Hello' };
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(expectedResponse);

			const result = await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				123,
				'Hello',
				{},
			);

			expect(result).toEqual(expectedResponse);
			expect(mockExecuteFunctions.helpers!.httpRequest).toHaveBeenCalledWith({
				method: 'POST',
				url: 'https://platform-api.max.ru/messages',
				qs: {
					user_id: 123,
				},
				headers: {
					Authorization: 'test-token',
					'Content-Type': 'application/json',
				},
				body: {
					text: 'Hello',
				},
				json: true,
			});
		});

		it('should send message to chat successfully', async () => {
			const expectedResponse = { message_id: 456, text: 'Hello chat' };
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(expectedResponse);

			const result = await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'chat',
				456,
				'Hello chat',
				{ notify: false },
			);

			expect(result).toEqual(expectedResponse);
			expect(mockExecuteFunctions.helpers!.httpRequest).toHaveBeenCalledWith({
				method: 'POST',
				url: 'https://platform-api.max.ru/messages',
				qs: {
					chat_id: 456,
				},
				headers: {
					Authorization: 'test-token',
					'Content-Type': 'application/json',
				},
				body: {
					text: 'Hello chat',
					notify: false,
				},
				json: true,
			});
		});

		it('should pass disable_link_preview as query parameter', async () => {
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue({ message_id: 1 });

			await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				123,
				'Hello',
				{
					disable_link_preview: true,
					notify: true,
				},
			);

			expect(
				(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mock.calls[0]?.[0],
			).toMatchObject({
				qs: {
					user_id: 123,
					disable_link_preview: true,
				},
				body: {
					text: 'Hello',
					notify: true,
				},
			});
		});

		it('should send message to user with negative ID successfully', async () => {
			const expectedResponse = { message_id: 123, text: 'Hello' };
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(expectedResponse);

			const result = await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				-12345,
				'Hello',
				{},
			);

			expect(result).toEqual(expectedResponse);
			expect(
				(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mock.calls[0]?.[0]?.qs,
			).toEqual({
				user_id: -12345,
			});
		});

		it('should throw error for non-numeric ID in sendMessage', async () => {
			await expect(
				sendMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'user',
					'not-a-number' as any,
					'Hello',
					{},
				),
			).rejects.toThrow('Invalid user ID: must be a number');
		});

		it('should send attachment-only message without text field in request body', async () => {
			const expectedResponse = { message_id: 777 };
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(expectedResponse);

			const result = await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				123,
				'',
				{
					attachments: [{ type: 'image', payload: { token: 'image-token-123' } }],
					format: 'markdown',
				},
			);

			expect(result).toEqual(expectedResponse);
			expect(
				(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mock.calls[0]?.[0],
			).toMatchObject({
				body: {
					attachments: [{ type: 'image', payload: { token: 'image-token-123' } }],
				},
			});
			expect(
				(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mock.calls[0]?.[0]?.body,
			).not.toHaveProperty('text');
			expect(
				(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mock.calls[0]?.[0]?.body,
			).not.toHaveProperty('format');
		});

		it('should reject empty message text when no attachments are provided', async () => {
			await expect(
				sendMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'user',
					123,
					'   ',
					{},
				),
			).rejects.toThrow('Message text cannot be empty');
		});

		it('should handle API errors gracefully', async () => {
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockRejectedValue(
				new Error('API Error'),
			);
			mockExecuteFunctions.getNode = jest.fn().mockReturnValue({ name: 'Max' });

			await expect(
				sendMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'user',
					123,
					'Hello',
					{},
				),
			).rejects.toThrow();
		});

		it('should retry as plain text when Max rejects unsupported markdown syntax', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockRejectedValueOnce(new Error('Some Markdown syntax is not supported by Max messenger'))
				.mockResolvedValueOnce({
					message_id: 321,
					text: 'Hello link (https://example.com) strike',
				});

			const result = await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				123,
				'Hello [link](https://example.com) ~~strike~~',
				{ format: 'markdown' },
			);

			expect(result).toEqual({ message_id: 321, text: 'Hello link (https://example.com) strike' });
			expect(mockHttpRequest).toHaveBeenCalledTimes(2);
			expect(mockHttpRequest).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({
					body: {
						text: 'Hello link (https://example.com) strike',
					},
				}),
			);
		});

		it('should retry send with attachment when Max reports temporary not-ready state', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockRejectedValueOnce({
					message: 'attachment.not.ready',
					response: {
						body: {
							error: 'errors.process.attachment.file.not.processed',
						},
					},
				})
				.mockResolvedValueOnce({
					message_id: 654,
					text: 'Photo',
				});

			const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
				if (typeof callback === 'function') {
					callback();
				}
				return {} as NodeJS.Timeout;
			});

			const result = await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				123,
				'Photo',
				{
					attachments: [{ type: 'image', payload: { token: 'image-token-123' } }],
				},
			);

			expect(result).toEqual({ message_id: 654, text: 'Photo' });
			expect(mockHttpRequest).toHaveBeenCalledTimes(2);
			expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 700);
			setTimeoutSpy.mockRestore();
		});

		it('should stop retrying attachment send after documented delay sequence is exhausted', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest.mockRejectedValue({
				message: 'errors.process.attachment.file.not.processed',
			});

			const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
				if (typeof callback === 'function') {
					callback();
				}
				return {} as NodeJS.Timeout;
			});

			await expect(
				sendMessage.call(mockExecuteFunctions as IExecuteFunctions, mockBot, 'user', 123, 'Photo', {
					attachments: [{ type: 'image', payload: { token: 'image-token-123' } }],
				}),
			).rejects.toThrow(NodeApiError);

			expect(mockHttpRequest).toHaveBeenCalledTimes(4);
			expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 700);
			expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 1500);
			expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 3000);
			setTimeoutSpy.mockRestore();
		});

		it('should not retry attachment-not-ready errors when no media attachments are provided', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest.mockRejectedValue(new Error('attachment.not.ready'));

			const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

			await expect(
				sendMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'user',
					123,
					'Hello',
					{},
				),
			).rejects.toThrow(NodeApiError);

			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
			expect(setTimeoutSpy).not.toHaveBeenCalled();
			setTimeoutSpy.mockRestore();
		});

		it('should handle different message formats', async () => {
			const expectedResponse = { message_id: 789, text: '<b>Bold</b>' };
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(expectedResponse);

			const result = await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				123,
				'<b>Bold</b>',
				{ format: 'html' },
			);

			expect(result).toEqual(expectedResponse);
			expect(
				(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mock.calls[0]?.[0]?.body,
			).toEqual({
				text: '<b>Bold</b>',
				format: 'html',
			});
		});

		it('should support custom base URL from credentials', async () => {
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({
				accessToken: 'test-token',
				baseUrl: 'https://custom.max.api',
			});
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue({ success: true });

			await sendMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'user',
				123,
				'Hello',
				{},
			);

			expect((mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mock.calls[0]?.[0]?.url).toBe(
				'https://custom.max.api/messages',
			);
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
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({
				accessToken: 'test-token',
			});

			const result = await editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123',
				'Updated message',
				{},
			);

			expect(result).toEqual(expectedResponse);
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'PUT',
				url: 'https://platform-api.max.ru/messages',
				qs: {
					message_id: '123',
				},
				headers: {
					Authorization: 'test-token',
					'Content-Type': 'application/json',
				},
				body: { text: 'Updated message' },
				json: true,
			});
		});

		it('should edit message with formatting options', async () => {
			const expectedResponse = { message_id: '456', text: 'Updated <b>message</b>' };
			const mockHttpRequest = jest.fn().mockResolvedValue(expectedResponse);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({
				accessToken: 'test-token',
			});

			const result = await editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'456',
				'Updated <b>message</b>',
				{ format: 'html' },
			);

			expect(result).toEqual(expectedResponse);
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'PUT',
				url: 'https://platform-api.max.ru/messages',
				qs: {
					message_id: '456',
				},
				headers: {
					Authorization: 'test-token',
					'Content-Type': 'application/json',
				},
				body: { text: 'Updated <b>message</b>', format: 'html' },
				json: true,
			});
		});

		it('should ignore disable_link_preview for editMessage body', async () => {
			const expectedResponse = { success: true };
			const mockHttpRequest = jest.fn().mockResolvedValue(expectedResponse);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({
				accessToken: 'test-token',
			});

			await editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'456',
				'Updated message',
				{ disable_link_preview: true, notify: false },
			);

			expect(mockHttpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					body: { text: 'Updated message', notify: false },
				}),
			);
		});

		it('should validate message ID', async () => {
			await expect(
				editMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'', // Empty message ID
					'Updated message',
					{},
				),
			).rejects.toThrow('Message ID is required and cannot be empty');

			await expect(
				editMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'   ', // Whitespace only message ID
					'Updated message',
					{},
				),
			).rejects.toThrow('Message ID is required and cannot be empty');
		});

		it('should validate message text', async () => {
			await expect(
				editMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'123',
					'a'.repeat(4001), // Text too long
					{},
				),
			).rejects.toThrow('Message text cannot exceed 4000 characters');
		});

		it('should validate HTML format in edit message', async () => {
			await expect(
				editMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'123',
					'<b>unclosed tag',
					{ format: 'html' },
				),
			).rejects.toThrow('HTML format error: unclosed tags detected');
		});

		it('should validate Markdown format in edit message', async () => {
			await expect(
				editMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'123',
					'*unclosed bold',
					{ format: 'markdown' },
				),
			).rejects.toThrow('Markdown format error: unmatched bold markers');
		});

		it('should retry edit as plain text when Max rejects markdown syntax', async () => {
			const mockHttpRequest = jest
				.fn()
				.mockRejectedValueOnce(new Error('Some Markdown syntax is not supported by Max messenger'))
				.mockResolvedValueOnce({
					message_id: '123',
					text: 'Updated link (https://example.com) text',
				});
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({
				accessToken: 'test-token',
			});

			const result = await editMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123',
				'Updated [link](https://example.com) text',
				{ format: 'markdown' },
			);

			expect(result).toEqual({
				message_id: '123',
				text: 'Updated link (https://example.com) text',
			});
			expect(mockHttpRequest).toHaveBeenCalledTimes(2);
			expect(mockHttpRequest).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({
					body: {
						text: 'Updated link (https://example.com) text',
					},
				}),
			);
		});

		it('should handle null text validation', async () => {
			await expect(
				editMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'123',
					null as any,
					{},
				),
			).rejects.toThrow('Message text is required and must be a string');
		});

		it('should handle undefined text validation', async () => {
			await expect(
				editMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'123',
					undefined as any,
					{},
				),
			).rejects.toThrow('Message text is required and must be a string');
		});

		it('should handle empty text validation', async () => {
			await expect(
				editMessage.call(mockExecuteFunctions as IExecuteFunctions, mockBot, '123', '   ', {}),
			).rejects.toThrow('Message text cannot be empty');
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
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({
				accessToken: 'test-token',
			});

			const result = await deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123',
			);

			expect(result).toEqual(expectedResponse);
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'DELETE',
				url: 'https://platform-api.max.ru/messages',
				qs: {
					message_id: '123',
				},
				headers: {
					Authorization: 'test-token',
				},
				json: true,
			});
		});

		it('should handle API response without return value', async () => {
			const mockHttpRequest = jest.fn().mockResolvedValue(null);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({
				accessToken: 'test-token',
			});

			const result = await deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'123',
			);

			expect(result).toEqual({ success: true, message_id: '123' });
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'DELETE',
				url: 'https://platform-api.max.ru/messages',
				qs: {
					message_id: '123',
				},
				headers: {
					Authorization: 'test-token',
				},
				json: true,
			});
		});

		it('should handle API response with undefined return value', async () => {
			const mockHttpRequest = jest.fn().mockResolvedValue(undefined);
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock) = mockHttpRequest;
			(mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue({
				accessToken: 'test-token',
			});

			const result = await deleteMessage.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'456',
			);

			expect(result).toEqual({ success: true, message_id: '456' });
			expect(mockHttpRequest).toHaveBeenCalledWith({
				method: 'DELETE',
				url: 'https://platform-api.max.ru/messages',
				qs: {
					message_id: '456',
				},
				headers: {
					Authorization: 'test-token',
				},
				json: true,
			});
		});

		it('should validate message ID', async () => {
			await expect(
				deleteMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'', // Empty message ID
				),
			).rejects.toThrow('Message ID is required and cannot be empty');

			await expect(
				deleteMessage.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'   ', // Whitespace only message ID
				),
			).rejects.toThrow('Message ID is required and cannot be empty');
		});
	});

	// ============================================================================
	// CALLBACK QUERY HANDLING
	// ============================================================================

	describe('answerCallbackQuery', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;
		let mockBot: any;

		beforeEach(() => {
			const scenario = new MockScenarioBuilder()
				.withCredentials({ accessToken: 'test-token' })
				.withHttpResponse({ success: true })
				.build();

			mockExecuteFunctions = scenario.mockExecuteFunctions;
			mockBot = {};
		});

		it('should answer callback query successfully', async () => {
			const result = await answerCallbackQuery.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'callback_123',
				'Button clicked!',
			);

			expect(result.success).toBe(true);
			AssertionHelpers.expectHttpRequest(mockExecuteFunctions.helpers!.httpRequest as jest.Mock, {
				method: 'POST',
				url: 'https://platform-api.max.ru/answers',
				qs: {
					callback_id: 'callback_123',
				},
				headers: {
					Authorization: 'test-token',
					'Content-Type': 'application/json',
				},
				body: {
					notification: 'Button clicked!',
				},
			});
		});

		it('should validate callback query ID', async () => {
			await AssertionHelpers.expectAsyncError(
				() =>
					answerCallbackQuery.call(mockExecuteFunctions as IExecuteFunctions, mockBot, '', 'text'),
				Error,
				/Callback Query ID is required and cannot be empty/,
			);

			await AssertionHelpers.expectAsyncError(
				() =>
					answerCallbackQuery.call(
						mockExecuteFunctions as IExecuteFunctions,
						mockBot,
						'   ',
						'text',
					),
				Error,
				/Callback Query ID is required and cannot be empty/,
			);
		});

		it('should send empty request body when notification text is not provided', async () => {
			await answerCallbackQuery.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'callback_123',
			);

			AssertionHelpers.expectHttpRequest(mockExecuteFunctions.helpers!.httpRequest as jest.Mock, {
				method: 'POST',
				url: 'https://platform-api.max.ru/answers',
				qs: {
					callback_id: 'callback_123',
				},
				body: {},
			});
		});
	});

	// ============================================================================
	// ADDITIONAL FIELDS PROCESSING
	// ============================================================================

	describe('addAdditionalFields', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			mockExecuteFunctions = createMockExecuteFunctions();
		});

		it('should add disable_link_preview field when provided', () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue({
				disable_link_preview: true,
			});

			const body = {};
			addAdditionalFields.call(mockExecuteFunctions as IExecuteFunctions, body, 0);

			expect(body).toEqual({ disable_link_preview: true });
		});

		it('should add notify field when provided', () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue({
				notify: false,
			});

			const body = {};
			addAdditionalFields.call(mockExecuteFunctions as IExecuteFunctions, body, 0);

			expect(body).toEqual({ notify: false });
		});

		it('should add multiple fields when provided', () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue({
				disable_link_preview: true,
				notify: false,
			});

			const body = {};
			addAdditionalFields.call(mockExecuteFunctions as IExecuteFunctions, body, 0);

			expect(body).toEqual({
				disable_link_preview: true,
				notify: false,
			});
		});

		it('should not add fields when undefined', () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue({});

			const body = { existing: 'value' };
			addAdditionalFields.call(mockExecuteFunctions as IExecuteFunctions, body, 0);

			expect(body).toEqual({ existing: 'value' });
		});
	});

	// ============================================================================
	// FILE ATTACHMENT PROCESSING
	// ============================================================================

	describe('validateAttachment', () => {
		it('should validate supported attachment types', () => {
			expect(() => validateAttachment(AttachmentConfigFactory.createImageConfig())).not.toThrow();
			expect(() => validateAttachment(AttachmentConfigFactory.createVideoConfig())).not.toThrow();
			expect(() => validateAttachment(AttachmentConfigFactory.createFileConfig())).not.toThrow();
		});

		it('should reject unsupported attachment types', () => {
			const invalidConfig = { type: 'unsupported' as any, inputType: 'binary' as const };

			AssertionHelpers.expectError(
				() => validateAttachment(invalidConfig),
				Error,
				/Unsupported attachment type: unsupported/,
			);
		});

		it('should validate input types', () => {
			const invalidConfig = AttachmentConfigFactory.createImageConfig({ inputType: 'invalid' });

			AssertionHelpers.expectError(
				() => validateAttachment(invalidConfig),
				Error,
				/Unsupported input type: invalid/,
			);
		});

		it('should require binary property for binary input', () => {
			const config = AttachmentConfigFactory.createImageConfig({ binaryProperty: '' });

			AssertionHelpers.expectError(
				() => validateAttachment(config),
				Error,
				/Binary property name is required for binary input type/,
			);
		});

		it('should require file URL for URL input', () => {
			const config = AttachmentConfigFactory.createVideoConfig({ fileUrl: '' });

			AssertionHelpers.expectError(
				() => validateAttachment(config),
				Error,
				/File URL is required for URL input type/,
			);
		});

		it('should validate URL format', () => {
			const config = AttachmentConfigFactory.createVideoConfig({ fileUrl: 'not-a-url' });

			AssertionHelpers.expectError(
				() => validateAttachment(config),
				Error,
				/Invalid file URL: not-a-url/,
			);
		});

		it('should validate file size limits', () => {
			const config = AttachmentConfigFactory.createImageConfig();

			// Test oversized image (over 10MB limit)
			AssertionHelpers.expectError(
				() => validateAttachment(config, TEST_CONSTANTS.FILE_SIZES.OVERSIZED_IMAGE),
				Error,
				/File size.*exceeds maximum allowed size for image/,
			);
		});

		it('should validate file extensions', () => {
			const config = AttachmentConfigFactory.createImageConfig();

			// Test unsupported extension
			AssertionHelpers.expectError(
				() => validateAttachment(config, TEST_CONSTANTS.FILE_SIZES.SMALL, 'test.exe'),
				Error,
				/Unsupported file extension "\.exe" for image/,
			);
		});

		it('should allow valid file extensions', () => {
			const config = AttachmentConfigFactory.createImageConfig();

			expect(() =>
				validateAttachment(config, TEST_CONSTANTS.FILE_SIZES.SMALL, 'test.jpg'),
			).not.toThrow();
			expect(() =>
				validateAttachment(config, TEST_CONSTANTS.FILE_SIZES.SMALL, 'test.png'),
			).not.toThrow();
		});
	});

	describe('downloadFileFromUrl', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			const scenario = new MockScenarioBuilder()
				.withHttpResponse({
					statusCode: 200,
					body: 'file content data',
				})
				.build();

			mockExecuteFunctions = scenario.mockExecuteFunctions;
		});

		afterEach(() => {
			jest.clearAllMocks();
		});

		it('should download file successfully', async () => {
			const result = await downloadFileFromUrl.call(
				mockExecuteFunctions as IExecuteFunctions,
				TEST_CONSTANTS.URLS.VALID,
				'custom-name.jpg',
			);

			expect(result.fileName).toBe('custom-name.jpg');
			expect(result.filePath).toContain('max_upload_');
			expect(result.fileSize).toBeGreaterThan(0);
		});

		it('should generate filename when not provided', async () => {
			const result = await downloadFileFromUrl.call(
				mockExecuteFunctions as IExecuteFunctions,
				'https://example.com/path/image.jpg',
			);

			expect(result.fileName).toBe('image.jpg');
		});

		it('should handle HTTP errors', async () => {
			const scenario = new MockScenarioBuilder()
				.withHttpResponse({
					statusCode: 404,
					body: 'Not Found',
				})
				.build();

			await AssertionHelpers.expectAsyncError(
				() => downloadFileFromUrl.call(scenario.mockExecuteFunctions, TEST_CONSTANTS.URLS.VALID),
				NodeOperationError,
				/Failed to download file: HTTP 404/,
			);
		});

		it('should handle network errors', async () => {
			const scenario = new MockScenarioBuilder().withHttpError(new Error('Network error')).build();

			await AssertionHelpers.expectAsyncError(
				() => downloadFileFromUrl.call(scenario.mockExecuteFunctions, TEST_CONSTANTS.URLS.VALID),
				NodeOperationError,
				/Failed to download file from URL/,
			);
		});
	});

	describe('uploadFileToMax', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			const scenario = new MockScenarioBuilder()
				.withCredentials({ accessToken: 'test-token' })
				.build();

			mockExecuteFunctions = scenario.mockExecuteFunctions;
		});

		it('should upload file successfully', async () => {
			// Mock the two-step upload process
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockResolvedValueOnce({ url: 'https://upload.example.com/upload' }) // Step 1: Get upload URL
				.mockResolvedValueOnce({
					// Step 2: Upload file
					statusCode: 200,
					body: JSON.stringify({ token: 'file-token-123' }),
				});

			const uploadResult = await uploadFileToMax.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				'/tmp/test-file.jpg',
				'test-file.jpg',
				'image',
			);

			expect(uploadResult).toEqual({ token: 'file-token-123' });
			expect(mockHttpRequest).toHaveBeenCalledTimes(2);
			expect(mockHttpRequest).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({
					method: 'POST',
					url: 'https://platform-api.max.ru/uploads',
					qs: { type: 'image' },
					headers: { Authorization: 'test-token' },
				}),
			);
			expect(mockHttpRequest).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({
					method: 'POST',
					url: 'https://upload.example.com/upload',
					headers: expect.objectContaining({
						'content-type': expect.any(String),
						Authorization: 'test-token',
					}),
					body: expect.anything(),
					returnFullResponse: true,
				}),
			);
		});

		it('should return token when uploads endpoint provides it immediately', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest.mockResolvedValueOnce({ token: 'video-token-123' });

			const uploadResult = await uploadFileToMax.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				'/tmp/test-file.mp4',
				'test-file.mp4',
				'video',
			);

			expect(uploadResult).toEqual({ token: 'video-token-123' });
			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
		});

		it('should fallback to token from uploads endpoint when upload response has no token/url', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockResolvedValueOnce({
					url: 'https://upload.example.com/upload',
					token: 'video-token-123',
				})
				.mockResolvedValueOnce({
					statusCode: 200,
					body: JSON.stringify({ retval: '/uploaded/video.mp4' }),
				});

			const uploadResult = await uploadFileToMax.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				'/tmp/test-file.mp4',
				'test-file.mp4',
				'video',
			);

			expect(uploadResult).toEqual({ token: 'video-token-123' });
			expect(mockHttpRequest).toHaveBeenCalledTimes(2);
		});

		it('should return non-token upload payload object for image attachments', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockResolvedValueOnce({
					url: 'https://upload.example.com/upload',
				})
				.mockResolvedValueOnce({
					statusCode: 200,
					body: JSON.stringify({
						photos: {
							'640x480': { token: 'image-token-640' },
						},
					}),
				});

			const uploadResult = await uploadFileToMax.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				'/tmp/test-image.jpg',
				'test-image.jpg',
				'image',
			);

			expect(uploadResult).toEqual({
				photos: {
					'640x480': { token: 'image-token-640' },
				},
			});
			expect(mockHttpRequest).toHaveBeenCalledTimes(2);
		});

		it('should return url payload for file attachments when upload response contains url', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockResolvedValueOnce({
					url: 'https://upload.example.com/upload',
				})
				.mockResolvedValueOnce({
					statusCode: 200,
					body: JSON.stringify({
						url: 'https://cdn.example.com/files/report.pdf',
					}),
				});

			const uploadResult = await uploadFileToMax.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				'/tmp/report.pdf',
				'report.pdf',
				'file',
			);

			expect(uploadResult).toEqual({
				url: 'https://cdn.example.com/files/report.pdf',
			});
		});

		it('should fallback to upload-step token for video when upload response is not JSON', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockResolvedValueOnce({
					url: 'https://upload.example.com/upload',
					token: 'video-token-123',
				})
				.mockResolvedValueOnce({
					statusCode: 200,
					body: 'not-json-response',
				});

			const uploadResult = await uploadFileToMax.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				'/tmp/video.mp4',
				'video.mp4',
				'video',
			);

			expect(uploadResult).toEqual({ token: 'video-token-123' });
		});

		it('should handle upload URL request failure', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest.mockResolvedValueOnce({}); // No URL in response

			await AssertionHelpers.expectAsyncError(
				() =>
					uploadFileToMax.call(
						mockExecuteFunctions as IExecuteFunctions,
						{} as any,
						'/tmp/test.jpg',
						'test.jpg',
						'image',
					),
				NodeOperationError,
				/Failed to get upload URL from Max API/,
			);
		});

		it('should handle file upload failure', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockResolvedValueOnce({ url: 'https://upload.example.com/upload' })
				.mockResolvedValueOnce({ statusCode: 500 }); // Upload failed

			await AssertionHelpers.expectAsyncError(
				() =>
					uploadFileToMax.call(
						mockExecuteFunctions as IExecuteFunctions,
						{} as any,
						'/tmp/test.jpg',
						'test.jpg',
						'image',
					),
				NodeOperationError,
				/Failed to upload file to Max API/,
			);
		});

		it('should handle invalid upload response', async () => {
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockResolvedValueOnce({ url: 'https://upload.example.com/upload' })
				.mockResolvedValueOnce({
					statusCode: 200,
					body: JSON.stringify({}), // No token in response
				});

			await AssertionHelpers.expectAsyncError(
				() =>
					uploadFileToMax.call(
						mockExecuteFunctions as IExecuteFunctions,
						{} as any,
						'/tmp/test.jpg',
						'test.jpg',
						'image',
					),
				NodeOperationError,
				/Failed to upload file to Max API/,
			);
		});
	});

	describe('processBinaryAttachment', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			mockExecuteFunctions = createMockExecuteFunctions();
		});

		it('should handle missing binary data', async () => {
			const config = AttachmentConfigFactory.createImageConfig();
			const item = { json: {} } as INodeExecutionData;

			await AssertionHelpers.expectAsyncError(
				() =>
					processBinaryAttachment.call(
						mockExecuteFunctions as IExecuteFunctions,
						{} as any,
						config,
						item,
					),
				NodeOperationError,
				/No binary data found for property "data"/,
			);
		});

		it('should read binary content through n8n helper and upload successfully', async () => {
			const config = AttachmentConfigFactory.createImageConfig();
			const binaryData = BinaryDataFactory.createImageBinary();
			const item = NodeExecutionDataFactory.createWithBinary({ data: binaryData });
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			const mockGetBinaryDataBuffer = (mockExecuteFunctions.helpers as any)
				.getBinaryDataBuffer as jest.Mock;

			mockGetBinaryDataBuffer.mockResolvedValueOnce(Buffer.from('image-bytes'));
			mockHttpRequest
				.mockResolvedValueOnce({ url: 'https://upload.example.com/upload' })
				.mockResolvedValueOnce({
					statusCode: 200,
					body: JSON.stringify({ token: 'image-token-123' }),
				});

			const result = await processBinaryAttachment.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				config,
				item,
				7,
			);

			expect(result).toEqual({
				type: 'image',
				payload: { token: 'image-token-123' },
			});
			expect(mockGetBinaryDataBuffer).toHaveBeenCalledWith(7, 'data');
		});

		it('should keep upload payload object when response contains photos map', async () => {
			const config = AttachmentConfigFactory.createImageConfig();
			const binaryData = BinaryDataFactory.createImageBinary();
			const item = NodeExecutionDataFactory.createWithBinary({ data: binaryData });
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			const mockGetBinaryDataBuffer = (mockExecuteFunctions.helpers as any)
				.getBinaryDataBuffer as jest.Mock;

			mockGetBinaryDataBuffer.mockResolvedValueOnce(Buffer.from('image-bytes'));
			mockHttpRequest
				.mockResolvedValueOnce({ url: 'https://upload.example.com/upload' })
				.mockResolvedValueOnce({
					statusCode: 200,
					body: JSON.stringify({
						photos: {
							'640x480': { token: 'image-token-640' },
						},
					}),
				});

			const result = await processBinaryAttachment.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				config,
				item,
				7,
			);

			expect(result).toEqual({
				type: 'image',
				payload: {
					photos: {
						'640x480': { token: 'image-token-640' },
					},
				},
			});
		});
	});

	// ============================================================================
	// KEYBOARD/UI COMPONENT FUNCTIONS
	// ============================================================================

	describe('validateKeyboardButton', () => {
		it('should validate callback buttons', () => {
			const button = KeyboardButtonFactory.createCallbackButton();
			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should validate link buttons', () => {
			const button = KeyboardButtonFactory.createLinkButton();
			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should validate open_app buttons', () => {
			const button = {
				text: 'Open app',
				type: 'open_app' as const,
				url: 'https://example.com/app',
			};
			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should validate chat buttons', () => {
			const button = KeyboardButtonFactory.createChatButton();
			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should validate contact request buttons', () => {
			const button = KeyboardButtonFactory.createContactButton();
			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should validate location request buttons', () => {
			const button = KeyboardButtonFactory.createLocationButton();
			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should reject invalid button types', () => {
			const button = { text: 'Test', type: 'invalid' as any };

			AssertionHelpers.expectError(
				() => validateKeyboardButton(button),
				Error,
				/Invalid button type: invalid/,
			);
		});

		it('should validate button text requirements', () => {
			AssertionHelpers.expectError(
				() => validateKeyboardButton({ text: '', type: 'callback' }),
				Error,
				/Button text cannot be empty/,
			);

			AssertionHelpers.expectError(
				() => validateKeyboardButton({ text: 'A'.repeat(129), type: 'callback', payload: 'p' }),
				Error,
				/Button text cannot exceed 128 characters/,
			);
		});

		it('should validate callback button payload', () => {
			AssertionHelpers.expectError(
				() => validateKeyboardButton({ text: 'Test', type: 'callback' }),
				Error,
				/Callback buttons must have a payload string/,
			);

			AssertionHelpers.expectError(
				() => validateKeyboardButton({ text: 'Test', type: 'callback', payload: 'A'.repeat(1025) }),
				Error,
				/Callback payload cannot exceed 1024 characters/,
			);
		});

		it('should validate link button URL', () => {
			AssertionHelpers.expectError(
				() => validateKeyboardButton({ text: 'Test', type: 'link' }),
				Error,
				/buttons must have a URL string/,
			);

			AssertionHelpers.expectError(
				() => validateKeyboardButton({ text: 'Test', type: 'link', url: 'invalid-url' }),
				Error,
				/Invalid URL format: invalid-url/,
			);
		});

		it('should validate link button URL length', () => {
			const longUrl = 'https://example.com/' + 'a'.repeat(2048);

			AssertionHelpers.expectError(
				() => validateKeyboardButton({ text: 'Test', type: 'link', url: longUrl }),
				Error,
				/Button URL cannot exceed 2048 characters/,
			);
		});

		it('should validate chat-specific fields', () => {
			AssertionHelpers.expectError(
				() => validateKeyboardButton({ text: 'Chat', type: 'chat' }),
				Error,
				/Chat buttons must have a non-empty chat_title string/,
			);

			AssertionHelpers.expectError(
				() =>
					validateKeyboardButton({
						text: 'Chat',
						type: 'chat',
						chat_title: 'A'.repeat(201),
					}),
				Error,
				/chat_title cannot exceed 200 characters/,
			);

			AssertionHelpers.expectError(
				() =>
					validateKeyboardButton({
						text: 'Chat',
						type: 'chat',
						chat_title: 'Title',
						uuid: -1,
					}),
				Error,
				/uuid must be a non-negative integer/,
			);
		});

		it('should validate button intent', () => {
			AssertionHelpers.expectError(
				() =>
					validateKeyboardButton({
						text: 'Test',
						type: 'callback',
						payload: 'test',
						intent: 'invalid' as any,
					}),
				Error,
				/Invalid button intent: invalid/,
			);
		});
	});

	describe('validateKeyboardLayout', () => {
		it('should validate simple keyboard layout', () => {
			const buttons = [[KeyboardButtonFactory.createCallbackButton()]];
			expect(() => validateKeyboardLayout(buttons)).not.toThrow();
		});

		it('should reject empty keyboard', () => {
			AssertionHelpers.expectError(
				() => validateKeyboardLayout([]),
				Error,
				/Keyboard must have at least one row of buttons/,
			);
		});

		it('should reject empty rows', () => {
			AssertionHelpers.expectError(
				() => validateKeyboardLayout([[]]),
				Error,
				/Row 1 cannot be empty/,
			);
		});

		it('should enforce maximum buttons per row', () => {
			const tooManyButtons = Array(8).fill(KeyboardButtonFactory.createCallbackButton());

			AssertionHelpers.expectError(
				() => validateKeyboardLayout([tooManyButtons]),
				Error,
				/Row 1 cannot have more than 7 buttons/,
			);
		});

		it('should enforce maximum total buttons', () => {
			const manyRows = Array(31).fill([KeyboardButtonFactory.createCallbackButton()]);

			AssertionHelpers.expectError(
				() => validateKeyboardLayout(manyRows),
				Error,
				/Keyboard cannot have more than 30 rows/,
			);
		});

		it('should allow maximum total button count at boundary', () => {
			const maxRows = Array(30)
				.fill(null)
				.map(() => Array(7).fill(KeyboardButtonFactory.createCallbackButton()));

			expect(() => validateKeyboardLayout(maxRows)).not.toThrow();
		});

		it('should enforce limited link/chat/open_app/contact/location buttons per row', () => {
			const row = [
				{ text: 'A', type: 'link' as const, url: 'https://a.example.com' },
				{ text: 'B', type: 'open_app' as const, url: 'https://b.example.com' },
				{ text: 'C', type: 'chat' as const, chat_title: 'Group' },
				{ text: 'D', type: 'request_contact' as const },
			];

			AssertionHelpers.expectError(
				() => validateKeyboardLayout([row]),
				Error,
				/link\/chat\/open_app\/request_geo_location\/request_contact buttons/,
			);
		});

		it('should validate individual buttons in layout', () => {
			const invalidButton = { text: '', type: 'callback' as const };

			AssertionHelpers.expectError(
				() => validateKeyboardLayout([[invalidButton]]),
				Error,
				/Row 1, Button 1: Button text cannot be empty/,
			);
		});
	});

	describe('formatInlineKeyboard', () => {
		it('should format simple keyboard correctly', () => {
			const buttons = [[KeyboardButtonFactory.createCallbackButton()]];
			const result = formatInlineKeyboard(buttons);

			expect(result.type).toBe('inline_keyboard');
			expect(result.payload.buttons).toHaveLength(1);
			expect(result.payload.buttons[0]).toHaveLength(1);
			expect(result.payload.buttons[0]![0]!.text).toBe('Click Me');
			expect(result.payload.buttons[0]![0]!.type).toBe('callback');
		});

		it('should format multi-row keyboard correctly', () => {
			const buttons = [
				[KeyboardButtonFactory.createCallbackButton({ text: 'Button 1' })],
				[KeyboardButtonFactory.createLinkButton({ text: 'Button 2' })],
			];
			const result = formatInlineKeyboard(buttons);

			expect(result.payload.buttons).toHaveLength(2);
			expect(result.payload.buttons[0]![0]!.text).toBe('Button 1');
			expect(result.payload.buttons[1]![0]!.text).toBe('Button 2');
		});

		it('should include optional fields when present', () => {
			const button = KeyboardButtonFactory.createCallbackButton({ intent: 'positive' });
			const result = formatInlineKeyboard([[button]]);

			expect(result.payload.buttons[0]![0]!.intent).toBe('positive');
		});

		it('should exclude default intent', () => {
			const button = KeyboardButtonFactory.createCallbackButton({ intent: 'default' });
			const result = formatInlineKeyboard([[button]]);

			expect(result.payload.buttons[0]![0]!.intent).toBeUndefined();
		});

		it('should include chat button fields', () => {
			const chatButton = KeyboardButtonFactory.createChatButton({
				chat_description: 'Chat description',
				start_payload: 'start-data',
				uuid: 42,
			});
			const result = formatInlineKeyboard([[chatButton]]);

			expect(result.payload.buttons[0]![0]).toMatchObject({
				type: 'chat',
				chat_title: 'Discussion Chat',
				chat_description: 'Chat description',
				start_payload: 'start-data',
				uuid: 42,
			});
		});
	});

	describe('createInlineKeyboardAttachment', () => {
		it('should create keyboard attachment', () => {
			const buttons = [[KeyboardButtonFactory.createCallbackButton()]];
			const result = createInlineKeyboardAttachment(buttons);

			expect(result).toEqual({
				type: 'inline_keyboard',
				payload: {
					buttons: [
						[
							{
								text: 'Click Me',
								type: 'callback',
								payload: 'button_clicked',
							},
						],
					],
				},
			});
		});
	});

	// ============================================================================
	// API COMMUNICATION FUNCTIONS
	// ============================================================================

	describe('getChatInfo', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			const scenario = new MockScenarioBuilder()
				.withCredentials({ accessToken: 'test-token' })
				.withHttpResponse({ id: 123, title: 'Test Chat' })
				.build();

			mockExecuteFunctions = scenario.mockExecuteFunctions;
		});

		it('should get chat info successfully', async () => {
			const result = await getChatInfo.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				TEST_CONSTANTS.IDS.VALID_CHAT,
			);

			expect(result.id).toBe(123);
			expect(result.title).toBe('Test Chat');
			AssertionHelpers.expectHttpRequest(mockExecuteFunctions.helpers!.httpRequest as jest.Mock, {
				method: 'GET',
				url: `https://platform-api.max.ru/chats/${TEST_CONSTANTS.IDS.VALID_CHAT}`,
			});
		});

		it('should get chat info for a negative chat ID', async () => {
			await getChatInfo.call(mockExecuteFunctions as IExecuteFunctions, {} as any, -12345);
			AssertionHelpers.expectHttpRequest(mockExecuteFunctions.helpers!.httpRequest as jest.Mock, {
				method: 'GET',
				url: `https://platform-api.max.ru/chats/-12345`,
			});
		});

		it('should throw an error for non-numeric chat ID', async () => {
			await AssertionHelpers.expectAsyncError(
				() =>
					getChatInfo.call(
						mockExecuteFunctions as IExecuteFunctions,
						{} as any,
						'not-a-number' as any,
					),
				Error,
				/Chat ID is required and must be a number/,
			);
		});

		it('should handle API errors in getChatInfo', async () => {
			const scenario = new MockScenarioBuilder()
				.withCredentials({ accessToken: 'test-token' })
				.withHttpError(new Error('API Error'))
				.build();

			await AssertionHelpers.expectAsyncError(
				() =>
					getChatInfo.call(scenario.mockExecuteFunctions, {} as any, TEST_CONSTANTS.IDS.VALID_CHAT),
				NodeApiError,
				/not able to process your request/i,
			);
		});
	});

	describe('leaveChat', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			const scenario = new MockScenarioBuilder()
				.withCredentials({ accessToken: 'test-token' })
				.withHttpResponse({ success: true })
				.build();

			mockExecuteFunctions = scenario.mockExecuteFunctions;
		});

		it('should leave chat successfully', async () => {
			const result = await leaveChat.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				TEST_CONSTANTS.IDS.VALID_CHAT,
			);

			expect(result.success).toBe(true);
			AssertionHelpers.expectHttpRequest(mockExecuteFunctions.helpers!.httpRequest as jest.Mock, {
				method: 'DELETE',
				url: `https://platform-api.max.ru/chats/${TEST_CONSTANTS.IDS.VALID_CHAT}/members/me`,
			});
		});

		it('should handle null response with default success message', async () => {
			const scenario = new MockScenarioBuilder()
				.withCredentials({ accessToken: 'test-token' })
				.withHttpResponse(null)
				.build();

			const result = await leaveChat.call(
				scenario.mockExecuteFunctions,
				{} as any,
				TEST_CONSTANTS.IDS.VALID_CHAT,
			);

			expect(result.success).toBe(true);
			expect(result.chat_id).toBe(TEST_CONSTANTS.IDS.VALID_CHAT);
			expect(result.message).toBe('Successfully left the chat');
		});

		it('should leave chat for a negative chat ID', async () => {
			await leaveChat.call(mockExecuteFunctions as IExecuteFunctions, {} as any, -12345);
			AssertionHelpers.expectHttpRequest(mockExecuteFunctions.helpers!.httpRequest as jest.Mock, {
				method: 'DELETE',
				url: `https://platform-api.max.ru/chats/-12345/members/me`,
			});
		});

		it('should throw an error for non-numeric chat ID', async () => {
			await AssertionHelpers.expectAsyncError(
				() =>
					leaveChat.call(
						mockExecuteFunctions as IExecuteFunctions,
						{} as any,
						'not-a-number' as any,
					),
				Error,
				/Chat ID is required and must be a number/,
			);
		});

		it('should handle API errors in leaveChat', async () => {
			const scenario = new MockScenarioBuilder()
				.withCredentials({ accessToken: 'test-token' })
				.withHttpError(new Error('API Error'))
				.build();

			await AssertionHelpers.expectAsyncError(
				() =>
					leaveChat.call(scenario.mockExecuteFunctions, {} as any, TEST_CONSTANTS.IDS.VALID_CHAT),
				NodeApiError,
				/not able to process your request/i,
			);
		});
	});

	describe('processKeyboardFromParameters', () => {
		let mockExecuteFunctions: Partial<IExecuteFunctions>;

		beforeEach(() => {
			mockExecuteFunctions = createMockExecuteFunctions();
		});

		it('should process keyboard parameters successfully', () => {
			const keyboardData = {
				buttons: [
					{
						row: {
							button: [{ text: 'Button 1', type: 'callback', payload: 'btn1' }],
						},
					},
				],
			};

			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue(keyboardData);

			const result = processKeyboardFromParameters.call(
				mockExecuteFunctions as IExecuteFunctions,
				0,
			);

			expect(result).not.toBeNull();
			expect(result!.type).toBe('inline_keyboard');
			expect(result!.payload.buttons?.[0]?.[0]?.text).toBe('Button 1');
		});

		it('should process chat button parameters with optional fields', () => {
			const keyboardData = {
				buttons: [
					{
						row: {
							button: [
								{
									text: 'Create Chat',
									type: 'chat',
									chatTitle: 'Team Chat',
									chatDescription: 'Coordination room',
									startPayload: 'start',
									uuid: '42',
								},
							],
						},
					},
				],
			};

			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue(keyboardData);

			const result = processKeyboardFromParameters.call(
				mockExecuteFunctions as IExecuteFunctions,
				0,
			);

			expect(result).not.toBeNull();
			expect(result!.payload.buttons?.[0]?.[0]).toMatchObject({
				type: 'chat',
				chat_title: 'Team Chat',
				chat_description: 'Coordination room',
				start_payload: 'start',
				uuid: 42,
			});
		});

		it('should return null for empty keyboard data', () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue({});

			const result = processKeyboardFromParameters.call(
				mockExecuteFunctions as IExecuteFunctions,
				0,
			);

			expect(result).toBeNull();
		});

		it('should return null for invalid keyboard structure', () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue({
				buttons: [],
			});

			const result = processKeyboardFromParameters.call(
				mockExecuteFunctions as IExecuteFunctions,
				0,
			);

			expect(result).toBeNull();
		});

		it('should return null when no valid button rows are found', () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue({
				buttons: [
					{
						row: {
							button: [], // Empty button array
						},
					},
				],
			});

			const result = processKeyboardFromParameters.call(
				mockExecuteFunctions as IExecuteFunctions,
				0,
			);

			expect(result).toBeNull();
		});

		it('should handle keyboard processing errors', () => {
			const invalidKeyboardData = {
				buttons: [
					{
						row: {
							button: [
								{ text: '', type: 'callback' }, // Invalid button
							],
						},
					},
				],
			};

			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue(invalidKeyboardData);

			AssertionHelpers.expectError(
				() => processKeyboardFromParameters.call(mockExecuteFunctions as IExecuteFunctions, 0),
				NodeOperationError,
				/Failed to process inline keyboard/,
			);
		});
	});

	// ============================================================================
	// INTEGRATION TEST SCENARIOS
	// ============================================================================

	describe('Integration Tests - Complex Workflows', () => {
		it('should handle complete file upload workflow', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions();
			const config = AttachmentConfigFactory.createVideoConfig();

			// Mock successful download
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			mockHttpRequest
				.mockResolvedValueOnce({
					// Download file
					statusCode: 200,
					body: 'video content',
				})
				.mockResolvedValueOnce({ url: 'https://upload.example.com' }) // Get upload URL
				.mockResolvedValueOnce({
					// Upload file
					statusCode: 200,
					body: JSON.stringify({ token: 'video-token-123' }),
				});

			const result = await processUrlAttachment.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				config,
			);

			expect(result.type).toBe('video');
			expect(result.payload.token).toBe('video-token-123');
		});

		it('should handle error propagation through workflow', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions();
			const config = AttachmentConfigFactory.createImageConfig();
			const item = { json: {} } as INodeExecutionData; // Missing binary data

			await AssertionHelpers.expectAsyncError(
				() =>
					processBinaryAttachment.call(
						mockExecuteFunctions as IExecuteFunctions,
						{} as any,
						config,
						item,
					),
				NodeOperationError,
				/No binary data found/,
			);
		});

		it('should handle multiple attachments processing', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions();
			const mockHttpRequest = mockExecuteFunctions.helpers!.httpRequest as jest.Mock;
			const attachmentConfigs = [
				AttachmentConfigFactory.createImageConfig({
					inputType: 'binary',
					binaryProperty: 'data',
					fileName: 'local-image.jpg',
				}),
				AttachmentConfigFactory.createImageConfig({
					inputType: 'url',
					fileUrl: 'https://example.com/remote-image.jpg',
					fileName: 'remote-image.jpg',
				}),
			];
			const item = NodeExecutionDataFactory.createWithImageBinary();

			mockHttpRequest
				.mockResolvedValueOnce({ url: 'https://upload.example.com/local' })
				.mockResolvedValueOnce({
					statusCode: 200,
					body: JSON.stringify({ token: 'local-image-token' }),
				})
				.mockResolvedValueOnce({
					statusCode: 200,
					body: 'remote image content',
				})
				.mockResolvedValueOnce({ url: 'https://upload.example.com/remote' })
				.mockResolvedValueOnce({
					statusCode: 200,
					body: JSON.stringify({ token: 'remote-image-token' }),
				});

			const attachments = await handleAttachments.call(
				mockExecuteFunctions as IExecuteFunctions,
				{} as any,
				attachmentConfigs,
				item,
				0,
			);

			expect(attachments).toEqual([
				{
					type: 'image',
					payload: { token: 'local-image-token' },
				},
				{
					type: 'image',
					payload: { token: 'remote-image-token' },
				},
			]);
			expect(mockHttpRequest).toHaveBeenCalledTimes(5);
		});
	});
});
