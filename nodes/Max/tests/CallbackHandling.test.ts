import { IExecuteFunctions } from 'n8n-workflow';
import { answerCallbackQuery, createInlineKeyboardAttachment, processKeyboardFromParameters } from '../GenericFunctions';
import { Bot } from '@maxhub/max-bot-api';

// Mock the Bot class
jest.mock('@maxhub/max-bot-api');

describe('Max Node - Callback Handling', () => {
	let mockExecuteFunctions: IExecuteFunctions;
	let mockBot: jest.Mocked<Bot>;

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks();

		// Mock Bot instance
		mockBot = {
			api: {
				sendMessageToUser: jest.fn(),
				sendMessageToChat: jest.fn(),
			},
		} as any;

		// Mock IExecuteFunctions
		mockExecuteFunctions = {
			getCredentials: jest.fn().mockResolvedValue({
				accessToken: 'test-token',
				baseUrl: 'https://botapi.max.ru',
			}),
			getNodeParameter: jest.fn(),
			getNode: jest.fn().mockReturnValue({ name: 'Max Test Node' }),
			helpers: {
				httpRequest: jest.fn(),
			},
		} as any;
	});

	describe('answerCallbackQuery', () => {
		it('should successfully answer callback query with minimal parameters', async () => {
			const mockResponse = {
				success: true,
				callback_query_id: 'test-callback-123',
			};

			(mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			const result = await answerCallbackQuery.call(
				mockExecuteFunctions,
				mockBot,
				'test-callback-123'
			);

			expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledWith({
				method: 'POST',
				url: 'https://botapi.max.ru/callbacks/answers',
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					callback_query_id: 'test-callback-123',
				}),
				json: true,
			});

			expect(result).toEqual(mockResponse);
		});

		it('should successfully answer callback query with all parameters', async () => {
			const mockResponse = {
				success: true,
				callback_query_id: 'test-callback-123',
				text: 'Button clicked!',
				show_alert: true,
				cache_time: 300,
			};

			(mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			const result = await answerCallbackQuery.call(
				mockExecuteFunctions,
				mockBot,
				'test-callback-123',
				'Button clicked!',
				true,
				300
			);

			expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledWith({
				method: 'POST',
				url: 'https://botapi.max.ru/callbacks/answers',
				headers: {
					'Authorization': 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					callback_query_id: 'test-callback-123',
					text: 'Button clicked!',
					show_alert: true,
					cache_time: 300,
				}),
				json: true,
			});

			expect(result).toEqual(mockResponse);
		});

		it('should handle empty response from API', async () => {
			(mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockResolvedValue(null);

			const result = await answerCallbackQuery.call(
				mockExecuteFunctions,
				mockBot,
				'test-callback-123',
				'Test response'
			);

			expect(result).toEqual({
				success: true,
				callback_query_id: 'test-callback-123',
				text: 'Test response',
				show_alert: false,
				cache_time: 0,
			});
		});

		it('should validate callback query ID is required', async () => {
			await expect(
				answerCallbackQuery.call(mockExecuteFunctions, mockBot, '')
			).rejects.toThrow('Callback Query ID is required and cannot be empty');

			await expect(
				answerCallbackQuery.call(mockExecuteFunctions, mockBot, '   ')
			).rejects.toThrow('Callback Query ID is required and cannot be empty');
		});

		it('should validate response text length', async () => {
			const longText = 'a'.repeat(201); // 201 characters

			await expect(
				answerCallbackQuery.call(mockExecuteFunctions, mockBot, 'test-callback-123', longText)
			).rejects.toThrow('Response text cannot exceed 200 characters');
		});

		it('should validate cache time range', async () => {
			await expect(
				answerCallbackQuery.call(mockExecuteFunctions, mockBot, 'test-callback-123', '', false, -1)
			).rejects.toThrow('Cache time must be between 0 and 3600 seconds');

			await expect(
				answerCallbackQuery.call(mockExecuteFunctions, mockBot, 'test-callback-123', '', false, 3601)
			).rejects.toThrow('Cache time must be between 0 and 3600 seconds');
		});

		it('should handle API errors gracefully', async () => {
			const apiError = {
				error_code: 400,
				description: 'Invalid callback query ID',
			};

			(mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockRejectedValue(apiError);

			await expect(
				answerCallbackQuery.call(mockExecuteFunctions, mockBot, 'invalid-callback-id')
			).rejects.toThrow();
		});

		it('should trim whitespace from callback query ID and text', async () => {
			const mockResponse = { success: true };
			(mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			await answerCallbackQuery.call(
				mockExecuteFunctions,
				mockBot,
				'  test-callback-123  ',
				'  Button response  '
			);

			expect(mockExecuteFunctions.helpers.httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					body: JSON.stringify({
						callback_query_id: 'test-callback-123',
						text: 'Button response',
					}),
				})
			);
		});

		it('should not include text parameter if empty', async () => {
			const mockResponse = { success: true };
			(mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			await answerCallbackQuery.call(
				mockExecuteFunctions,
				mockBot,
				'test-callback-123',
				''
			);

			const requestBody = JSON.parse(
				(mockExecuteFunctions.helpers.httpRequest as jest.Mock).mock.calls[0][0].body
			);

			expect(requestBody).not.toHaveProperty('text');
		});
	});

	describe('createInlineKeyboardAttachment', () => {
		it('should create inline keyboard attachment with callback buttons', () => {
			const buttons = [
				[
					{
						text: 'Yes',
						type: 'callback' as const,
						payload: 'yes_action',
						intent: 'positive' as const,
					},
					{
						text: 'No',
						type: 'callback' as const,
						payload: 'no_action',
						intent: 'negative' as const,
					},
				],
			];

			const result = createInlineKeyboardAttachment(buttons);

			expect(result).toEqual({
				type: 'inline_keyboard',
				payload: {
					buttons: [
						[
							{
								text: 'Yes',
								type: 'callback',
								payload: 'yes_action',
								intent: 'positive',
							},
							{
								text: 'No',
								type: 'callback',
								payload: 'no_action',
								intent: 'negative',
							},
						],
					],
				},
			});
		});

		it('should create inline keyboard attachment with mixed button types', () => {
			const buttons = [
				[
					{
						text: 'Callback Button',
						type: 'callback' as const,
						payload: 'callback_data',
					},
				],
				[
					{
						text: 'Link Button',
						type: 'link' as const,
						url: 'https://example.com',
					},
				],
				[
					{
						text: 'Contact',
						type: 'request_contact' as const,
					},
					{
						text: 'Location',
						type: 'request_geo_location' as const,
					},
				],
			];

			const result = createInlineKeyboardAttachment(buttons);

			expect(result.type).toBe('inline_keyboard');
			expect(result.payload.buttons).toHaveLength(3);
			expect(result.payload.buttons![0]).toHaveLength(1);
			expect(result.payload.buttons![1]).toHaveLength(1);
			expect(result.payload.buttons![2]).toHaveLength(2);
		});

		it('should validate button configuration', () => {
			const invalidButtons = [
				[
					{
						text: '',
						type: 'callback' as const,
						payload: 'test',
					},
				],
			];

			expect(() => createInlineKeyboardAttachment(invalidButtons)).toThrow();
		});
	});

	describe('processKeyboardFromParameters', () => {
		it('should return null when no keyboard data provided', () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue({});

			const result = processKeyboardFromParameters.call(mockExecuteFunctions, 0);

			expect(result).toBeNull();
		});

		it('should return null when keyboard data is empty', () => {
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue({
				buttons: [],
			});

			const result = processKeyboardFromParameters.call(mockExecuteFunctions, 0);

			expect(result).toBeNull();
		});

		it('should process valid keyboard parameters', () => {
			const keyboardData = {
				buttons: [
					{
						row: {
							button: [
								{
									text: 'Button 1',
									type: 'callback',
									payload: 'btn1_data',
									intent: 'positive',
								},
								{
									text: 'Button 2',
									type: 'callback',
									payload: 'btn2_data',
									intent: 'negative',
								},
							],
						},
					},
					{
						row: {
							button: [
								{
									text: 'Link Button',
									type: 'link',
									url: 'https://example.com',
									intent: 'default',
								},
							],
						},
					},
				],
			};

			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue(keyboardData);

			const result = processKeyboardFromParameters.call(mockExecuteFunctions, 0);

			expect(result).not.toBeNull();
			expect(result?.type).toBe('inline_keyboard');
			expect(result?.payload.buttons).toHaveLength(2);
			expect(result?.payload.buttons![0]).toHaveLength(2);
			expect(result?.payload.buttons![1]).toHaveLength(1);
		});

		it('should handle malformed keyboard data gracefully', () => {
			const malformedData = {
				buttons: [
					{
						row: {
							button: [
								{
									text: 'Valid Button',
									type: 'callback',
									payload: 'valid_data',
								},
								{
									// Missing required fields
									type: 'callback',
								},
							],
						},
					},
				],
			};

			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue(malformedData);

			expect(() => processKeyboardFromParameters.call(mockExecuteFunctions, 0)).toThrow(
				'Failed to process inline keyboard'
			);
		});

		it('should skip empty rows', () => {
			const keyboardData = {
				buttons: [
					{
						row: {
							button: [
								{
									text: 'Button 1',
									type: 'callback',
									payload: 'btn1_data',
								},
							],
						},
					},
					{
						row: {
							button: [], // Empty row
						},
					},
					{
						row: {
							button: [
								{
									text: 'Button 2',
									type: 'callback',
									payload: 'btn2_data',
								},
							],
						},
					},
				],
			};

			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue(keyboardData);

			const result = processKeyboardFromParameters.call(mockExecuteFunctions, 0);

			expect(result?.payload.buttons).toHaveLength(2); // Empty row should be skipped
		});
	});

	describe('Integration Tests', () => {
		it('should handle complete callback workflow', async () => {
			// Test the complete flow: create keyboard -> receive callback -> answer callback
			const keyboardData = {
				buttons: [
					{
						row: {
							button: [
								{
									text: 'Confirm',
									type: 'callback',
									payload: 'confirm_action',
									intent: 'positive',
								},
								{
									text: 'Cancel',
									type: 'callback',
									payload: 'cancel_action',
									intent: 'negative',
								},
							],
						},
					},
				],
			};

			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockReturnValue(keyboardData);

			// Create keyboard
			const keyboard = processKeyboardFromParameters.call(mockExecuteFunctions, 0);
			expect(keyboard).not.toBeNull();
			expect(keyboard?.payload.buttons![0]).toHaveLength(2);

			// Mock callback query response
			const mockCallbackResponse = { success: true };
			(mockExecuteFunctions.helpers.httpRequest as jest.Mock).mockResolvedValue(mockCallbackResponse);

			// Answer callback query
			const callbackResult = await answerCallbackQuery.call(
				mockExecuteFunctions,
				mockBot,
				'test-callback-123',
				'Action confirmed!'
			);

			expect(callbackResult).toEqual(mockCallbackResponse);
		});
	});
});