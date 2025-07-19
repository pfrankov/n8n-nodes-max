import type { IWebhookFunctions } from 'n8n-workflow';
import { MaxEventProcessor } from '../MaxEventProcessor';
import type { MaxWebhookEvent } from '../MaxTriggerConfig';

describe('MaxEventProcessor - OpenAPI Compliance', () => {
	let eventProcessor: MaxEventProcessor;
	let mockWebhookFunctions: Partial<IWebhookFunctions>;

	beforeEach(() => {
		eventProcessor = new MaxEventProcessor();

		mockWebhookFunctions = {
			getBodyData: jest.fn(),
			getHeaderData: jest.fn(() => ({})),
			getNodeParameter: jest.fn(),
			helpers: {
				returnJsonArray: jest.fn((data) => data),
			} as any,
		};

		// Default mock implementations
		(mockWebhookFunctions.getNodeParameter as jest.Mock)
			.mockImplementation((paramName: string) => {
				if (paramName === 'events') return ['message_created', 'bot_started', 'message_callback'];
				if (paramName === 'additionalFields') return {};
				return undefined;
			});
	});

	describe('Message Created Events', () => {
		it('should process message_created event according to OpenAPI schema', async () => {
			const eventData: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					message_id: 'msg_123',
					text: 'Hello world!',
					timestamp: 1640995200000,
					sender: {
						user_id: 789012,
						first_name: 'John',
						last_name: 'Doe',
						username: 'johndoe',
						is_bot: false,
						last_activity_time: 1640995100000,
					},
					recipient: {
						chat_id: 123456,
						chat_type: 'dialog',
					},
				},
				user_locale: 'en',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toHaveLength(1);

			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.update_type).toBe('message_created');
			expect(processedEvent.timestamp).toBe(eventData.timestamp);
			expect(processedEvent.validation_status.is_valid).toBe(true);
			expect(processedEvent.metadata.user_context?.user_id).toBe(789012);
			expect(processedEvent.metadata.chat_context?.chat_id).toBe(123456);
		});
	});

	describe('Bot Started Events', () => {
		it('should process bot_started event according to OpenAPI schema', async () => {
			const eventData: MaxWebhookEvent = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				chat_id: 123456,
				user: {
					user_id: 789012,
					first_name: 'Jane',
					last_name: 'Smith',
					username: 'janesmith',
				},
				payload: 'start_payload_123',
				user_locale: 'ru',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.event_context.chat_id).toBe(123456);
			expect(processedEvent.event_context.payload).toBe('start_payload_123');
			expect(processedEvent.validation_status.is_valid).toBe(true);
		});
	});

	describe('Message Callback Events', () => {
		it('should process message_callback event according to OpenAPI schema', async () => {
			const eventData: MaxWebhookEvent = {
				update_type: 'message_callback',
				timestamp: 1640995200000,
				callback: {
					timestamp: 1640995200000,
					callback_id: 'cb_123',
					payload: 'action_confirm',
					user: {
						user_id: 789012,
						first_name: 'Alice',
						last_name: 'Johnson',
						username: 'alicej',
					},
				},
				message: {
					message_id: 'msg_789',
					text: 'Please confirm your action',
					timestamp: 1640995100000,
				},
				user_locale: 'en',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.event_context.callback_id).toBe('cb_123');
			expect(processedEvent.event_context.callback_payload).toBe('action_confirm');
			expect(processedEvent.validation_status.is_valid).toBe(true);
		});
	});

	describe('Bot Membership Events', () => {
		it('should process bot_added event according to OpenAPI schema', async () => {
			const eventData: MaxWebhookEvent = {
				update_type: 'bot_added',
				timestamp: 1640995200000,
				chat_id: 123456,
				user: {
					user_id: 789012,
					first_name: 'Admin',
					last_name: 'User',
					username: 'admin',
				},
				is_channel: false,
			};

			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['bot_added'];
					if (paramName === 'additionalFields') return {};
					return undefined;
				});

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.event_context.chat_id).toBe(123456);
			expect(processedEvent.event_context.is_channel).toBe(false);
			expect(processedEvent.validation_status.is_valid).toBe(true);
		});
	});

	describe('Message Removed Events', () => {
		it('should process message_removed event according to OpenAPI schema', async () => {
			const eventData: MaxWebhookEvent = {
				update_type: 'message_removed',
				timestamp: 1640995200000,
				message_id: 'msg_123',
				chat_id: 123456,
				user_id: 789012,
			};

			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_removed'];
					if (paramName === 'additionalFields') return {};
					return undefined;
				});

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.event_context.deleted_message_id).toBe('msg_123');
			expect(processedEvent.event_context.chat_id).toBe(123456);
			expect(processedEvent.event_context.deleted_by_user_id).toBe(789012);
			expect(processedEvent.validation_status.is_valid).toBe(true);
		});
	});

	describe('Chat Title Changed Events', () => {
		it('should process chat_title_changed event according to OpenAPI schema', async () => {
			const eventData: MaxWebhookEvent = {
				update_type: 'chat_title_changed',
				timestamp: 1640995200000,
				chat_id: 123456,
				user: {
					user_id: 789012,
					first_name: 'Admin',
					last_name: 'User',
					username: 'admin',
				},
				title: 'New Chat Title',
			};

			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['chat_title_changed'];
					if (paramName === 'additionalFields') return {};
					return undefined;
				});

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.event_context.chat_id).toBe(123456);
			expect(processedEvent.event_context.new_title).toBe('New Chat Title');
			expect(processedEvent.validation_status.is_valid).toBe(true);
		});
	});

	describe('Message Chat Created Events', () => {
		it('should process message_chat_created event according to OpenAPI schema', async () => {
			const eventData: MaxWebhookEvent = {
				update_type: 'message_chat_created',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123456,
					type: 'group',
					title: 'New Group Chat',
					members_count: 3,
				},
				message_id: 'msg_789',
				start_payload: 'button_payload_123',
			};

			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_chat_created'];
					if (paramName === 'additionalFields') return {};
					return undefined;
				});

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const processedEvent = result.workflowData?.[0]?.[0] as any;
			expect(processedEvent.event_context.chat_id).toBe(123456);
			expect(processedEvent.event_context.start_payload).toBe('button_payload_123');
			expect(processedEvent.validation_status.is_valid).toBe(true);
		});
	});

	describe('Filtering', () => {
		it('should filter events by chat ID using correct API structure', async () => {
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['bot_added'];
					if (paramName === 'additionalFields') return { chatIds: '123456' };
					return undefined;
				});

			// Event with matching chat_id
			const allowedEvent: MaxWebhookEvent = {
				update_type: 'bot_added',
				timestamp: 1640995200000,
				chat_id: 123456,
				user: { user_id: 789012, first_name: 'Admin' },
				is_channel: false,
			};

			// Event with non-matching chat_id
			const blockedEvent: MaxWebhookEvent = {
				update_type: 'bot_added',
				timestamp: 1640995200000,
				chat_id: 999999,
				user: { user_id: 789012, first_name: 'Admin' },
				is_channel: false,
			};

			// Test allowed event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEvent);
			let result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);
			expect(result.workflowData).toHaveLength(1);

			// Test blocked event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedEvent);
			result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);
			expect(result.workflowData).toEqual([]);
		});

		it('should filter events by user ID using correct API structure', async () => {
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['bot_started'];
					if (paramName === 'additionalFields') return { userIds: '789012' };
					return undefined;
				});

			// Event with matching user_id
			const allowedEvent: MaxWebhookEvent = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				chat_id: 123456,
				user: { user_id: 789012, first_name: 'User' },
				user_locale: 'en',
			};

			// Event with non-matching user_id
			const blockedEvent: MaxWebhookEvent = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				chat_id: 123456,
				user: { user_id: 999999, first_name: 'Other' },
				user_locale: 'en',
			};

			// Test allowed event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEvent);
			let result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);
			expect(result.workflowData).toHaveLength(1);

			// Test blocked event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedEvent);
			result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);
			expect(result.workflowData).toEqual([]);
		});
	});

	describe('Error Handling', () => {
		it('should handle malformed events gracefully', async () => {
			const malformedEvents = [
				null,
				undefined,
				{}, // Missing required fields
			];

			for (const eventData of malformedEvents) {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);
				const result = await eventProcessor.processWebhookEvent.call(
					mockWebhookFunctions as IWebhookFunctions
				);
				expect(result.workflowData).toEqual([]);
			}
		});

		it('should handle unknown event types', async () => {
			const unknownEvent = {
				update_type: 'unknown_event_type',
				timestamp: 1640995200000,
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(unknownEvent);
			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);
			expect(result.workflowData).toEqual([]);
		});
	});
});
