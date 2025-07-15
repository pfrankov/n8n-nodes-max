import type { IWebhookFunctions } from 'n8n-workflow';
import { MaxTrigger } from '../MaxTrigger.node';
import type { IMaxEvent } from '../IEvent';

describe('MaxTrigger Integration', () => {
	let maxTrigger: MaxTrigger;
	let mockWebhookFunctions: Partial<IWebhookFunctions>;

	beforeEach(() => {
		maxTrigger = new MaxTrigger();
		
		mockWebhookFunctions = {
			getBodyData: jest.fn(),
			getHeaderData: jest.fn(() => ({})),
			getNodeParameter: jest.fn(),
			helpers: {
				returnJsonArray: jest.fn((data) => data),
			} as any,
		};
	});

	describe('Event Processing', () => {
		beforeEach(() => {
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_created', 'bot_started', 'message_callback'];
					if (paramName === 'additionalFields') return {};
					return undefined;
				});
		});

		it('should process message_created event with full data', async () => {
			const eventData: IMaxEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				event_id: 'evt_123',
				chat: {
					chat_id: 123456,
					type: 'dialog',
					title: 'Test Chat',
					description: 'A test chat',
					avatar_url: 'https://example.com/avatar.jpg',
					members_count: 2,
				},
				user: {
					user_id: 789012,
					name: 'John Doe',
					username: 'johndoe',
					avatar_url: 'https://example.com/user-avatar.jpg',
					lang: 'en',
				},
				message: {
					message_id: 'msg_456',
					text: 'Hello from Max messenger!',
					timestamp: 1640995200000,
					attachments: [
						{
							type: 'image',
							payload: {
								token: 'img_token_123',
							},
						},
					],
					format: 'html',
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result).toEqual({
				workflowData: [[{
					...eventData,
					event_type: eventData.update_type, // Normalized data includes both fields
				}]],
			});
		});

		it('should process bot_started event', async () => {
			const eventData: IMaxEvent = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				event_id: 'evt_456',
				user: {
					user_id: 789012,
					name: 'Jane Smith',
					username: 'janesmith',
					lang: 'ru',
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result).toEqual({
				workflowData: [[{
					...eventData,
					event_type: eventData.update_type, // Normalized data includes both fields
				}]],
			});
		});

		it('should process message_callback event with button interaction', async () => {
			const eventData: IMaxEvent = {
				update_type: 'message_callback',
				timestamp: 1640995200000,
				event_id: 'evt_789',
				chat: {
					chat_id: 123456,
					type: 'group',
					title: 'Test Group',
					members_count: 5,
				},
				user: {
					user_id: 789012,
					name: 'Alice Johnson',
					username: 'alicej',
				},
				callback: {
					callback_id: 'cb_123',
					payload: 'action_confirm',
					timestamp: 1640995200000,
					message: {
						message_id: 'msg_789',
						text: 'Please confirm your action',
						timestamp: 1640995100000,
						attachments: [
							{
								type: 'inline_keyboard',
								payload: {
									buttons: [
										[
											{
												text: 'Confirm',
												type: 'callback',
												payload: 'action_confirm',
												intent: 'positive',
											},
											{
												text: 'Cancel',
												type: 'callback',
												payload: 'action_cancel',
												intent: 'negative',
											},
										],
									],
								},
							},
						],
					},
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result).toEqual({
				workflowData: [[{
					...eventData,
					event_type: eventData.update_type, // Normalized data includes both fields
				}]],
			});
		});

		it('should filter events by chat ID', async () => {
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_created'];
					if (paramName === 'additionalFields') return { chatIds: '123456, 789012' };
					return undefined;
				});

			const allowedEventData: IMaxEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123456, // This is in the allowed list
					type: 'dialog',
				},
				message: {
					message_id: 'msg_123',
					text: 'Allowed message',
					timestamp: 1640995200000,
				},
			};

			const blockedEventData: IMaxEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				chat: {
					chat_id: 999999, // This is NOT in the allowed list
					type: 'dialog',
				},
				message: {
					message_id: 'msg_456',
					text: 'Blocked message',
					timestamp: 1640995200000,
				},
			};

			// Test allowed event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEventData);
			let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result).toEqual({
				workflowData: [[{
					...allowedEventData,
					event_type: allowedEventData.update_type, // Normalized data includes both fields
				}]],
			});

			// Test blocked event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedEventData);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result).toEqual({
				workflowData: [],
			});
		});

		it('should filter events by user ID', async () => {
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['bot_started'];
					if (paramName === 'additionalFields') return { userIds: '789012, 456789' };
					return undefined;
				});

			const allowedEventData: IMaxEvent = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				user: {
					user_id: 789012, // This is in the allowed list
					name: 'Allowed User',
				},
			};

			const blockedEventData: IMaxEvent = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				user: {
					user_id: 999999, // This is NOT in the allowed list
					name: 'Blocked User',
				},
			};

			// Test allowed event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEventData);
			let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result).toEqual({
				workflowData: [[{
					...allowedEventData,
					event_type: allowedEventData.update_type, // Normalized data includes both fields
				}]],
			});

			// Test blocked event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedEventData);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result).toEqual({
				workflowData: [],
			});
		});

		it('should handle malformed event data gracefully', async () => {
			const malformedEvents = [
				null,
				undefined,
				{ update_type: 'unknown_event', timestamp: 1640995200000 }, // Unknown event type
			];

			for (const eventData of malformedEvents) {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);
				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				expect(result).toEqual({
					workflowData: [],
				});
			}

			// Test events without update_type or empty update_type (these now pass through for debugging)
			const debugEvents = [
				{},
				{ timestamp: 1640995200000 }, // Missing update_type
				{ update_type: '', timestamp: 1640995200000 }, // Empty update_type
			];

			for (const eventData of debugEvents) {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);
				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				expect(result).toEqual({
					workflowData: [[eventData]],
				});
			}
		});

		it('should handle whitespace in filter IDs', async () => {
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_created'];
					if (paramName === 'additionalFields') return { 
						chatIds: ' 123456 , 789012 , ', // With extra whitespace
						userIds: '  111111  ,  222222  ', // With extra whitespace
					};
					return undefined;
				});

			const eventData: IMaxEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123456, // Should match despite whitespace in config
					type: 'dialog',
				},
				user: {
					user_id: 111111, // Should match despite whitespace in config
					name: 'Test User',
				},
				message: {
					message_id: 'msg_123',
					text: 'Test message',
					timestamp: 1640995200000,
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);
			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result).toEqual({
				workflowData: [[{
					...eventData,
					event_type: eventData.update_type, // Normalized data includes both fields
				}]],
			});
		});
	});
});