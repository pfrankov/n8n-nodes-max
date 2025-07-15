import { IExecuteFunctions } from 'n8n-workflow';
import { Max } from '../Max.node';
import { Bot } from '@maxhub/max-bot-api';

// Mock the Max Bot API
jest.mock('@maxhub/max-bot-api');
const MockedBot = Bot as jest.MockedClass<typeof Bot>;

// Mock credentials
const mockCredentials = {
	accessToken: 'test-token',
	baseUrl: 'https://botapi.max.ru',
};

// Mock execution functions
const createMockExecuteFunctions = (parameters: any = {}): IExecuteFunctions => {
	const mockThis = {
		getInputData: jest.fn().mockReturnValue([{ json: {} }]),
		getNodeParameter: jest.fn((name: string, _index: number, defaultValue?: any) => {
			return parameters[name] !== undefined ? parameters[name] : defaultValue;
		}),
		getCredentials: jest.fn().mockResolvedValue(mockCredentials),
		getNode: jest.fn().mockReturnValue({ name: 'Max Test Node' }),
		continueOnFail: jest.fn().mockReturnValue(false),
		helpers: {
			httpRequest: jest.fn(),
		},
	} as unknown as IExecuteFunctions;

	return mockThis;
};

describe('Max Node - Keyboard Integration', () => {
	let maxNode: Max;
	let mockSendMessageToUser: jest.Mock;
	let mockSendMessageToChat: jest.Mock;

	beforeEach(() => {
		maxNode = new Max();
		
		// Create mock functions
		mockSendMessageToUser = jest.fn();
		mockSendMessageToChat = jest.fn();
		
		// Create mock bot instance
		const mockBot = {
			api: {
				sendMessageToUser: mockSendMessageToUser,
				sendMessageToChat: mockSendMessageToChat,
			},
		};

		MockedBot.mockImplementation(() => mockBot as any);
		
		// Clear all mocks
		jest.clearAllMocks();
	});

	describe('Send Message with Inline Keyboard', () => {
		it('should send message with simple callback keyboard to user', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions({
				resource: 'message',
				operation: 'sendMessage',
				sendTo: 'user',
				userId: '12345',
				text: 'Choose an option:',
				format: 'plain',
				inlineKeyboard: {
					buttons: [
						{
							row: {
								button: [
									{
										text: 'Option 1',
										type: 'callback',
										payload: 'option_1',
										intent: 'default',
									},
									{
										text: 'Option 2',
										type: 'callback',
										payload: 'option_2',
										intent: 'positive',
									},
								],
							},
						},
					],
				},
				additionalFields: {},
				attachments: {},
			});

			// Mock successful API response
			mockSendMessageToUser.mockResolvedValue({
				message_id: 123,
				text: 'Choose an option:',
				attachments: [
					{
						type: 'inline_keyboard',
						payload: {
							buttons: [
								[
									{ text: 'Option 1', type: 'callback', payload: 'option_1' },
									{ text: 'Option 2', type: 'callback', payload: 'option_2', intent: 'positive' },
								],
							],
						},
					},
				],
			});

			const result = await maxNode.execute.call(mockExecuteFunctions);

			// Verify the API was called correctly
			expect(mockSendMessageToUser).toHaveBeenCalledWith(
				12345,
				'Choose an option:',
				expect.objectContaining({
					attachments: expect.arrayContaining([
						expect.objectContaining({
							type: 'inline_keyboard',
							payload: {
								buttons: [
									[
										{ text: 'Option 1', type: 'callback', payload: 'option_1' },
										{ text: 'Option 2', type: 'callback', payload: 'option_2', intent: 'positive' },
									],
								],
							},
						}),
					]),
				})
			);

			// Verify the result
			expect(result).toHaveLength(1);
			expect(result[0]).toHaveLength(1);
			expect(result[0]?.[0]?.json).toEqual(
				expect.objectContaining({
					message_id: 123,
					text: 'Choose an option:',
				})
			);
		});

		it('should send message with multi-row keyboard to chat', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions({
				resource: 'message',
				operation: 'sendMessage',
				sendTo: 'chat',
				chatId: '67890',
				text: 'Select action:',
				format: 'plain',
				inlineKeyboard: {
					buttons: [
						{
							row: {
								button: [
									{
										text: 'Yes',
										type: 'callback',
										payload: 'confirm_yes',
										intent: 'positive',
									},
									{
										text: 'No',
										type: 'callback',
										payload: 'confirm_no',
										intent: 'negative',
									},
								],
							},
						},
						{
							row: {
								button: [
									{
										text: 'Visit Website',
										type: 'link',
										url: 'https://example.com',
										intent: 'default',
									},
								],
							},
						},
						{
							row: {
								button: [
									{
										text: 'Share Contact',
										type: 'request_contact',
										intent: 'default',
									},
									{
										text: 'Share Location',
										type: 'request_geo_location',
										intent: 'default',
									},
								],
							},
						},
					],
				},
				additionalFields: {},
				attachments: {},
			});

			// Mock successful API response
			mockSendMessageToChat.mockResolvedValue({
				message_id: 456,
				text: 'Select action:',
			});

			const result = await maxNode.execute.call(mockExecuteFunctions);

			// Verify the API was called with correct keyboard structure
			expect(mockSendMessageToChat).toHaveBeenCalledWith(
				67890,
				'Select action:',
				expect.objectContaining({
					attachments: expect.arrayContaining([
						expect.objectContaining({
							type: 'inline_keyboard',
							payload: {
								buttons: [
									[
										{ text: 'Yes', type: 'callback', payload: 'confirm_yes', intent: 'positive' },
										{ text: 'No', type: 'callback', payload: 'confirm_no', intent: 'negative' },
									],
									[
										{ text: 'Visit Website', type: 'link', url: 'https://example.com' },
									],
									[
										{ text: 'Share Contact', type: 'request_contact' },
										{ text: 'Share Location', type: 'request_geo_location' },
									],
								],
							},
						}),
					]),
				})
			);

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveLength(1);
		});

		it('should send message without keyboard when no buttons provided', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions({
				resource: 'message',
				operation: 'sendMessage',
				sendTo: 'user',
				userId: '12345',
				text: 'Simple message',
				format: 'plain',
				inlineKeyboard: {}, // Empty keyboard
				additionalFields: {},
				attachments: {},
			});

			mockSendMessageToUser.mockResolvedValue({
				message_id: 789,
				text: 'Simple message',
			});

			await maxNode.execute.call(mockExecuteFunctions);

			// Verify no keyboard attachment was added
			expect(mockSendMessageToUser).toHaveBeenCalledWith(
				12345,
				'Simple message',
				expect.not.objectContaining({
					attachments: expect.anything(),
				})
			);
		});

		it('should send message with keyboard only (no other attachments)', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions({
				resource: 'message',
				operation: 'sendMessage',
				sendTo: 'user',
				userId: '12345',
				text: 'Message with keyboard only',
				format: 'plain',
				inlineKeyboard: {
					buttons: [
						{
							row: {
								button: [
									{
										text: 'Like',
										type: 'callback',
										payload: 'like_message',
										intent: 'positive',
									},
								],
							},
						},
					],
				},
				attachments: {}, // No other attachments
				additionalFields: {},
			});

			mockSendMessageToUser.mockResolvedValue({
				message_id: 999,
				text: 'Message with keyboard only',
			});

			await maxNode.execute.call(mockExecuteFunctions);

			// Verify keyboard attachment was included
			expect(mockSendMessageToUser).toHaveBeenCalledWith(
				12345,
				'Message with keyboard only',
				expect.objectContaining({
					attachments: expect.arrayContaining([
						expect.objectContaining({
							type: 'inline_keyboard',
							payload: {
								buttons: [
									[
										{ text: 'Like', type: 'callback', payload: 'like_message', intent: 'positive' },
									],
								],
							},
						}),
					]),
				})
			);
		});
	});

	describe('Keyboard Validation Errors', () => {
		it('should throw error for invalid button configuration', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions({
				resource: 'message',
				operation: 'sendMessage',
				sendTo: 'user',
				userId: '12345',
				text: 'Test message',
				format: 'plain',
				inlineKeyboard: {
					buttons: [
						{
							row: {
								button: [
									{
										text: '', // Invalid: empty text
										type: 'callback',
										payload: 'test',
										intent: 'default',
									},
								],
							},
						},
					],
				},
				additionalFields: {},
				attachments: {},
			});

			await expect(maxNode.execute.call(mockExecuteFunctions)).rejects.toThrow(
				'Failed to process inline keyboard'
			);
		});

		it('should throw error for callback button without payload', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions({
				resource: 'message',
				operation: 'sendMessage',
				sendTo: 'user',
				userId: '12345',
				text: 'Test message',
				format: 'plain',
				inlineKeyboard: {
					buttons: [
						{
							row: {
								button: [
									{
										text: 'Button',
										type: 'callback',
										// Missing payload
										intent: 'default',
									},
								],
							},
						},
					],
				},
				additionalFields: {},
				attachments: {},
			});

			await expect(maxNode.execute.call(mockExecuteFunctions)).rejects.toThrow(
				'Failed to process inline keyboard'
			);
		});

		it('should throw error for link button with invalid URL', async () => {
			const mockExecuteFunctions = createMockExecuteFunctions({
				resource: 'message',
				operation: 'sendMessage',
				sendTo: 'user',
				userId: '12345',
				text: 'Test message',
				format: 'plain',
				inlineKeyboard: {
					buttons: [
						{
							row: {
								button: [
									{
										text: 'Link',
										type: 'link',
										url: 'not-a-valid-url', // Invalid URL
										intent: 'default',
									},
								],
							},
						},
					],
				},
				additionalFields: {},
				attachments: {},
			});

			await expect(maxNode.execute.call(mockExecuteFunctions)).rejects.toThrow(
				'Failed to process inline keyboard'
			);
		});
	});
});