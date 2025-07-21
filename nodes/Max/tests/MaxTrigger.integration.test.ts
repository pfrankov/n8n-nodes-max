import type { IWebhookFunctions } from 'n8n-workflow';
import { MaxTrigger } from '../MaxTrigger.node';

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
			const eventData = {
				update_type: 'message_created',
				timestamp: 1640995200000,
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
					sender: {
						user_id: 789012,
						name: 'John Doe',
						username: 'johndoe',
						first_name: 'John',
						last_name: 'Doe',
					},
					recipient: {
						chat_id: 123456,
						chat_type: 'dialog',
					},
				},
				user_locale: 'en',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toHaveLength(1);

			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.update_type).toBe('message_created');
			expect(processedEvent.timestamp).toBe(eventData.timestamp);
			expect(processedEvent.event_id).toBeDefined();
			expect(processedEvent.event_context.type).toBe('message_created');
			expect(processedEvent.event_context.description).toBe('New message received in direct conversation');
			expect(processedEvent.validation_status.is_valid).toBe(true);
			expect(processedEvent.metadata).toBeDefined();
			expect(processedEvent.metadata.user_context?.user_id).toBe(eventData.message.sender.user_id);
			expect(processedEvent.metadata.chat_context?.chat_id).toBe(eventData.message.recipient.chat_id);
		});

		it('should process bot_started event', async () => {
			const eventData = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				chat_id: 123456,
				user: {
					user_id: 789012,
					name: 'Jane Smith',
					username: 'janesmith',
					first_name: 'Jane',
					last_name: 'Smith',
				},
				payload: 'start_payload_123',
				user_locale: 'ru',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toHaveLength(1);

			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.update_type).toBe('bot_started');
			expect(processedEvent.timestamp).toBe(eventData.timestamp);
			expect(processedEvent.event_id).toBeDefined();
			expect(processedEvent.event_context.type).toBe('bot_started');
			expect(processedEvent.event_context.description).toBe('User started interaction with the bot');
			expect(processedEvent.validation_status.is_valid).toBe(true);
			expect(processedEvent.metadata).toBeDefined();
			expect(processedEvent.metadata.user_context?.user_id).toBe(eventData.user.user_id);
			expect(processedEvent.metadata.chat_context?.chat_id).toBe(eventData.chat_id);
		});

		it('should process message_callback event with button interaction', async () => {
			const eventData = {
				update_type: 'message_callback',
				timestamp: 1640995200000,
				callback: {
					timestamp: 1640995200000,
					callback_id: 'cb_123',
					payload: 'action_confirm',
					user: {
						user_id: 789012,
						name: 'Alice Johnson',
						username: 'alicej',
						first_name: 'Alice',
						last_name: 'Johnson',
					},
				},
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
				user_locale: 'en',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toHaveLength(1);

			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.update_type).toBe('message_callback');
			expect(processedEvent.timestamp).toBe(eventData.timestamp);
			expect(processedEvent.event_id).toBeDefined();
			expect(processedEvent.event_context.type).toBe('message_callback');
			expect(processedEvent.event_context.description).toBe('User clicked an inline keyboard button');
			expect(processedEvent.validation_status.is_valid).toBe(true);
			expect(processedEvent.metadata).toBeDefined();
			expect(processedEvent.metadata.user_context?.user_id).toBe(eventData.callback.user.user_id);
		});

		it('should filter events by chat ID', async () => {
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_created'];
					if (paramName === 'additionalFields') return { chatIds: '123456, 789012' };
					return undefined;
				});

			const allowedEventData = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					message_id: 'msg_123',
					text: 'Allowed message',
					timestamp: 1640995200000,
					recipient: {
						chat_id: 123456, // This is in the allowed list
						chat_type: 'dialog',
					},
				},
			};

			const blockedEventData = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					message_id: 'msg_456',
					text: 'Blocked message',
					timestamp: 1640995200000,
					recipient: {
						chat_id: 999999, // This is NOT in the allowed list
						chat_type: 'dialog',
					},
				},
			};

			// Test allowed event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEventData);
			let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toHaveLength(1);

			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.update_type).toBe('message_created');
			expect(processedEvent.timestamp).toBe(allowedEventData.timestamp);
			expect(processedEvent.event_id).toBeDefined();
			expect(processedEvent.validation_status.is_valid).toBe(true);
			expect(processedEvent.metadata).toBeDefined();

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

			const allowedEventData = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				chat_id: 123456,
				user: {
					user_id: 789012, // This is in the allowed list
					name: 'Allowed User',
					first_name: 'Allowed',
					last_name: 'User',
				},
				user_locale: 'en',
			};

			const blockedEventData = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				chat_id: 123456,
				user: {
					user_id: 999999, // This is NOT in the allowed list
					name: 'Blocked User',
					first_name: 'Blocked',
					last_name: 'User',
				},
				user_locale: 'en',
			};

			// Test allowed event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEventData);
			let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toHaveLength(1);

			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.update_type).toBe('bot_started');
			expect(processedEvent.timestamp).toBe(allowedEventData.timestamp);
			expect(processedEvent.event_id).toBeDefined();
			expect(processedEvent.validation_status.is_valid).toBe(true);
			expect(processedEvent.metadata).toBeDefined();

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
				{}, // Empty object
				{ timestamp: 1640995200000 }, // Missing update_type
				{ update_type: '', timestamp: 1640995200000 }, // Empty update_type
			];

			for (const eventData of malformedEvents) {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);
				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				expect(result).toEqual({
					workflowData: [],
				});
			}

			// Test events with some data but no update_type (these pass through for debugging)
			const debugEvents = [
				{ message: { text: 'test' } }, // Has message data
				{ user: { user_id: 123 } }, // Has user data
				{ timestamp: 1640995200000, message: { text: 'test' } }, // Has timestamp and message
			];

			for (const eventData of debugEvents) {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);
				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				expect(result).toEqual({
					workflowData: [],
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

			const eventData = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					message_id: 'msg_123',
					text: 'Test message',
					timestamp: 1640995200000,
					sender: {
						user_id: 111111, // Should match despite whitespace in config
						name: 'Test User',
						first_name: 'Test',
						last_name: 'User',
					},
					recipient: {
						chat_id: 123456, // Should match despite whitespace in config
						chat_type: 'dialog',
					},
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);
			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toHaveLength(1);

			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.update_type).toBe('message_created');
			expect(processedEvent.timestamp).toBe(eventData.timestamp);
			expect(processedEvent.event_id).toBeDefined();
			expect(processedEvent.validation_status.is_valid).toBe(true);
			expect(processedEvent.metadata).toBeDefined();
		});
	});
});
