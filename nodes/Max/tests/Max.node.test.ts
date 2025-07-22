import { Max } from '../Max.node';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

// Mock the entire GenericFunctions module
jest.mock('../GenericFunctions', () => ({
	createMaxBotInstance: jest.fn().mockReturnValue({}), // Mock bot instance
	sendMessage: jest.fn().mockResolvedValue({ message_id: '12345' }),
	editMessage: jest.fn().mockResolvedValue({ success: true }),
	deleteMessage: jest.fn().mockResolvedValue({ success: true }),
	answerCallbackQuery: jest.fn().mockResolvedValue({ success: true }),
	getChatInfo: jest.fn().mockResolvedValue({ id: 'chat-123', title: 'Test Chat' }),
	leaveChat: jest.fn().mockResolvedValue({ success: true }),
	validateAndFormatText: jest.fn((text, _format) => text),
	addAdditionalFields: jest.fn((params, fields) => ({ ...params, ...fields.additionalFields })),
	handleAttachments: jest.fn().mockResolvedValue([]),
	processKeyboardFromParameters: jest.fn().mockReturnValue(undefined),
}));

// Import the mocked functions to spy on them
import {
	sendMessage,
	editMessage,
	deleteMessage,
	answerCallbackQuery,
	getChatInfo,
	leaveChat,
} from '../GenericFunctions';

/**
 * Creates a mock of IExecuteFunctions for testing purposes.
 * @param parameters - A record of parameters to be returned by getNodeParameter.
 * @returns A mocked IExecuteFunctions object.
 */
const getExecuteFunctionsMock = (parameters: Record<string, any>): IExecuteFunctions =>
	({
		getNodeParameter: jest.fn((name: string) => parameters[name]),
		getCredentials: jest.fn().mockResolvedValue({ accessToken: 'test_token' }),
		getInputData: jest.fn().mockReturnValue([{ json: {} }] as INodeExecutionData[]),
		prepareOutputData: jest.fn(data => data as INodeExecutionData[]),
		continueOnFail: jest.fn().mockReturnValue(false),
		getNode: jest.fn().mockReturnValue({}),
	}) as any;

describe('Max Node', () => {
	let maxNode: Max;

	beforeEach(() => {
		maxNode = new Max();
		jest.clearAllMocks();
	});

	describe('Node Description', () => {
		it('should have correct properties, resources, and operations', () => {
			const { description } = maxNode;
			expect(description.displayName).toBe('Max');
			expect(description.name).toBe('max');
			expect(description.group).toContain('output');
			expect(description.version).toBe(1);

			const credentials = description.credentials;
			expect(credentials).toHaveLength(1);
			expect(credentials?.[0]?.name).toBe('maxApi');
			expect(credentials?.[0]?.required).toBe(true);

			const resourceProperty = description.properties.find(p => p.name === 'resource');
			expect(resourceProperty?.options).toContainEqual({ name: 'Message', value: 'message' });
			expect(resourceProperty?.options).toContainEqual({ name: 'Chat', value: 'chat' });

			const messageOps = description.properties.find(
				p => p.name === 'operation' && p.displayOptions?.show?.['resource']?.includes('message'),
			);
			expect(messageOps?.options).toHaveLength(4);

			const chatOps = description.properties.find(
				p => p.name === 'operation' && p.displayOptions?.show?.['resource']?.includes('chat'),
			);
			expect(chatOps?.options).toHaveLength(2);
		});
	});

	describe('execute', () => {
		describe('Message Resource', () => {
			it('should call sendMessage for a user', async () => {
					const params = {
						resource: 'message',
						operation: 'sendMessage',
						sendTo: 'user',
						userId: '123',
						text: 'Hello user',
						format: 'plain',
					};
					const executeFunctions = getExecuteFunctionsMock(params);
					await maxNode.execute.call(executeFunctions);
					expect(sendMessage).toHaveBeenCalledWith(expect.anything(), 'user', 123, 'Hello user', {});
				});

			it('should call sendMessage for a chat', async () => {
					const params = {
						resource: 'message',
						operation: 'sendMessage',
						sendTo: 'chat',
						chatId: '456',
						text: 'Hello chat',
						format: 'markdown',
					};
					const executeFunctions = getExecuteFunctionsMock(params);
					await maxNode.execute.call(executeFunctions);
					expect(sendMessage).toHaveBeenCalledWith(expect.anything(), 'chat', 456, 'Hello chat', { format: 'markdown' });
				});

			it('should call editMessage', async () => {
					const params = { resource: 'message', operation: 'editMessage', messageId: 'msg-789', text: 'Updated', format: 'html', additionalFields: {} };
					const executeFunctions = getExecuteFunctionsMock(params);
					await maxNode.execute.call(executeFunctions);
					expect(editMessage).toHaveBeenCalledWith(expect.anything(), 'msg-789', 'Updated', { format: 'html' });
				});

			it('should call deleteMessage', async () => {
					const params = { resource: 'message', operation: 'deleteMessage', messageId: 'msg-789' };
					const executeFunctions = getExecuteFunctionsMock(params);
					await maxNode.execute.call(executeFunctions);
					expect(deleteMessage).toHaveBeenCalledWith(expect.anything(), 'msg-789');
				});

			it('should call answerCallbackQuery', async () => {
					const params = { resource: 'message', operation: 'answerCallbackQuery', callbackQueryId: 'cbq-123', text: 'Alert!', showAlert: false, cacheTime: 0 };
					const executeFunctions = getExecuteFunctionsMock(params);
					await maxNode.execute.call(executeFunctions);
					expect(answerCallbackQuery).toHaveBeenCalledWith(expect.anything(), 'cbq-123', 'Alert!', false, 0);
				});
		});

		describe('Chat Resource', () => {
			it('should call getChatInfo', async () => {
					const params = { resource: 'chat', operation: 'getChatInfo', chatId: '123' };
					const executeFunctions = getExecuteFunctionsMock(params);
					await maxNode.execute.call(executeFunctions);
					expect(getChatInfo).toHaveBeenCalledWith(expect.anything(), 123);
				});

			it('should call leaveChat and return success', async () => {
					const params = { resource: 'chat', operation: 'leaveChat', chatId: '123' };
					const executeFunctions = getExecuteFunctionsMock(params);
					const returnData = await maxNode.execute.call(executeFunctions);
				expect(leaveChat).toHaveBeenCalledWith(expect.anything(), 123);
				expect(returnData).toEqual([[
					{
						json: { success: true },
						pairedItem: { item: 0 },
					}
				]]);
				});

				it('should throw for invalid chat ID', async () => {
					const params = { resource: 'chat', operation: 'getChatInfo', chatId: 'invalid-id' };
					const executeFunctions = getExecuteFunctionsMock(params);
					await expect(maxNode.execute.call(executeFunctions)).rejects.toThrow('Invalid Chat ID: "invalid-id". Must be a positive number.');
				});
		});

		describe('sendMessage with attachments and keyboard', () => {
			it('should call sendMessage with attachments and an inline keyboard', async () => {
				const executeFunctions = getExecuteFunctionsMock({});
				(executeFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
					if (name === 'resource') return 'message';
					if (name === 'operation') return 'sendMessage';
					if (name === 'sendTo') return 'chat';
					if (name === 'chatId') return '12345';
					if (name === 'text') return 'Test message with attachment and keyboard';
					if (name === 'attachments') {
						return {
							attachment: [
								{
									inputType: 'url',
									fileUrl: 'https://example.com/image.jpg',
									type: 'image',
								},
							],
						};
					}
					if (name === 'inlineKeyboard') {
						return {
							buttons: [
								{
									row: [
										{
											button: {
												text: 'Click me',
												payload: 'callback_data',
											},
										},
									],
								},
							],
						};
					}
					if (name === 'additionalFields') return {};
					return null;
				});

				await maxNode.execute.call(executeFunctions);

				expect(sendMessage).toHaveBeenCalledWith(expect.anything(), 'chat', 12345, 'Test message with attachment and keyboard', expect.any(Object));
			});
		});

		describe('Error Handling', () => {
			it('should throw for unknown message operation', async () => {
				const params = { resource: 'message', operation: 'flyToTheMoon' };
				const executeFunctions = getExecuteFunctionsMock(params);
				await expect(maxNode.execute.call(executeFunctions)).rejects.toThrow("The operation 'flyToTheMoon' is not supported for resource 'message'");
			});

			it('should throw for unknown chat operation', async () => {
				const params = { resource: 'chat', operation: 'inventNewDance' };
				const executeFunctions = getExecuteFunctionsMock(params);
				await expect(maxNode.execute.call(executeFunctions)).rejects.toThrow("The operation 'inventNewDance' is not supported for resource 'chat'");
			});

			it('should throw for unknown resource', async () => {
				const params = { resource: 'unicorn', operation: 'doSomething' };
				const executeFunctions = getExecuteFunctionsMock(params);
				await expect(maxNode.execute.call(executeFunctions)).rejects.toThrow("The resource 'unicorn' is not supported.");
			});

			it('should continue on fail', async () => {
				const params = { resource: 'chat', operation: 'getChatInfo', chatId: 'invalid-id' };
				const executeFunctions = getExecuteFunctionsMock(params);
				(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);
				const result = await maxNode.execute.call(executeFunctions);
				expect(result).toEqual([[
					{
						json: { error: 'Invalid Chat ID: "invalid-id". Must be a positive number.' },
						pairedItem: { item: 0 },
					}
				]]);
			});
		});
	});
});