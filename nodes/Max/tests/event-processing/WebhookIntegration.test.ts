/**
 * Integration tests for webhook event reception and processing
 * Tests complete webhook workflows from event reception to workflow trigger
 */

import type { IWebhookFunctions } from 'n8n-workflow';
import { MaxTrigger } from '../../MaxTrigger.node';
import type { MaxWebhookEvent } from '../../MaxTriggerConfig';

describe('Webhook Integration Tests', () => {
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

		// Default configuration
		(mockWebhookFunctions.getNodeParameter as jest.Mock)
			.mockImplementation((paramName: string) => {
				if (paramName === 'events') return ['message_created', 'message_edited', 'bot_started', 'message_callback'];
				if (paramName === 'additionalFields') return {};
				return undefined;
			});
	});

	describe('End-to-End Event Processing', () => {
		it('should process complete message_created workflow', async () => {
			const webhookEvent: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 123456,
						first_name: 'Alice',
						last_name: 'Johnson',
						username: 'alice_j',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 789012,
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_abc123',
						seq: 1,
						text: 'Hello from integration test!',
						attachments: []
					},
					stat: {
						views: 0
					},
					url: 'https://max.ru/messages/msg_abc123'
				},
				user_locale: 'en'
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(webhookEvent);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			// Verify workflow trigger
			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toHaveLength(1);

			const processedEvent = result.workflowData?.[0]?.[0] as any;

			// Verify event structure
			expect(processedEvent.update_type).toBe('message_created');
			expect(processedEvent.timestamp).toBe(1640995200000);
			expect(processedEvent.event_id).toBeDefined();

			// Verify event context
			expect(processedEvent.event_context.type).toBe('message_created');
			expect(processedEvent.event_context.description).toBe('New message received in direct conversation');
			expect(processedEvent.event_context.message_id).toBe('msg_abc123');
			expect(processedEvent.event_context.has_text).toBe(true);
			expect(processedEvent.event_context.has_attachments).toBe(false);
			expect(processedEvent.event_context.message_length).toBeGreaterThan(0);

			// Verify validation
			expect(processedEvent.validation_status.is_valid).toBe(true);
			expect(processedEvent.validation_status.errors).toHaveLength(0);

			// Verify metadata
			expect(processedEvent.metadata.user_context).toEqual({
				user_id: 123456,
				username: 'alice_j',
				display_name: 'Alice',
				locale: 'en'
			});
			expect(processedEvent.metadata.chat_context).toEqual({
				chat_id: 789012,
				chat_type: 'chat',
				chat_title: undefined,
				members_count: undefined
			});
			expect(processedEvent.metadata.source).toBe('webhook');
			expect(processedEvent.metadata.processing_time_ms).toBeGreaterThanOrEqual(0);
		});

		it('should process complete message_callback workflow with button interaction', async () => {
			const webhookEvent: MaxWebhookEvent = {
				update_type: 'message_callback',
				timestamp: 1640995300000,
				message: {
					sender: {
						user_id: 123456,
						first_name: 'Bob',
						username: 'bob_smith',
						is_bot: false,
						last_activity_time: 1640995300000
					},
					recipient: {
						chat_id: 789012,
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_def456',
						seq: 1,
						text: 'Please choose an option:',
						attachments: [
							{
								type: 'inline_keyboard',
								payload: {
									buttons: [
										[
											{
												text: 'Yes',
												type: 'callback',
												payload: 'confirm_yes',
												intent: 'positive'
											},
											{
												text: 'No',
												type: 'callback',
												payload: 'confirm_no',
												intent: 'negative'
											}
										]
									]
								}
							}
						]
					}
				},
				callback: {
					callback_id: 'cb_789',
					payload: 'confirm_yes'
				},
				user_locale: 'en'
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(webhookEvent);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result.workflowData).toHaveLength(1);
			const processedEvent = result.workflowData?.[0]?.[0] as any;

			// Verify callback-specific processing
			expect(processedEvent.event_context.type).toBe('message_callback');
			expect(processedEvent.event_context.description).toBe('User clicked an inline keyboard button');
			expect(processedEvent.event_context.callback_id).toBe('cb_789');
			expect(processedEvent.event_context.callback_payload).toBe('confirm_yes');
			expect(processedEvent.validation_status.is_valid).toBe(true);

			// Verify original event data is preserved
			expect(processedEvent.callback).toEqual({
				callback_id: 'cb_789',
				payload: 'confirm_yes'
			});
		});

		it('should process complete bot_started workflow', async () => {
			const webhookEvent: MaxWebhookEvent = {
				update_type: 'bot_started',
				timestamp: 1640995400000,
				user: {
					user_id: 654321,
					first_name: 'Charlie',
					last_name: 'Brown',
					username: 'charlie_b',
					is_bot: false,
					last_activity_time: 1640995400000
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(webhookEvent);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			expect(result.workflowData).toHaveLength(1);
			const processedEvent = result.workflowData?.[0]?.[0] as any;

			expect(processedEvent.event_context.type).toBe('bot_started');
			expect(processedEvent.event_context.description).toBe('User started interaction with the bot');
			expect(processedEvent.event_context.is_first_interaction).toBe(true);
			expect(processedEvent.validation_status.is_valid).toBe(true);

			// Verify user context extraction
			expect(processedEvent.metadata.user_context).toEqual({
				user_id: 654321,
				username: 'charlie_b',
				display_name: 'Charlie',
				locale: undefined
			});
		});
	});

	describe('Event Filtering Integration', () => {
		it('should filter events by chat ID in complete workflow', async () => {
			// Configure chat ID filtering
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_created'];
					if (paramName === 'additionalFields') return { chatIds: '111111, 222222' };
					return undefined;
				});

			const allowedEvent: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 123456,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 111111, // Allowed
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_allowed',
						seq: 1,
						text: 'Allowed message'
					}
				}
			};

			const blockedEvent: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 123456,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 999999, // Not allowed
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_blocked',
						seq: 1,
						text: 'Blocked message'
					}
				}
			};

			// Test allowed event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEvent);
			let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(1);

			// Test blocked event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedEvent);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(0);
		});

		it('should filter events by user ID in complete workflow', async () => {
			// Configure user ID filtering
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['bot_started'];
					if (paramName === 'additionalFields') return { userIds: '555555, 666666' };
					return undefined;
				});

			const allowedEvent: MaxWebhookEvent = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				user: {
					user_id: 555555, // Allowed
					first_name: 'Allowed User'
				}
			};

			const blockedEvent: MaxWebhookEvent = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				user: {
					user_id: 999999, // Not allowed
					first_name: 'Blocked User'
				}
			};

			// Test allowed event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEvent);
			let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(1);

			// Test blocked event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedEvent);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(0);
		});

		it('should apply combined chat and user filtering', async () => {
			// Configure combined filtering
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_created'];
					if (paramName === 'additionalFields') return {
						chatIds: '111111',
						userIds: '555555'
					};
					return undefined;
				});

			const allowedEvent: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 555555, // Allowed user
						first_name: 'Test',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 111111, // Allowed chat
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_allowed',
						seq: 1,
						text: 'Allowed message'
					}
				}
			};

			const blockedByUserEvent: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 999999, // Not allowed user
						first_name: 'Test',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 111111, // Allowed chat
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_blocked_user',
						seq: 1,
						text: 'Blocked by user'
					}
				}
			};

			const blockedByChatEvent: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 555555, // Allowed user
						first_name: 'Test',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 999999, // Not allowed chat
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_blocked_chat',
						seq: 1,
						text: 'Blocked by chat'
					}
				}
			};

			// Test allowed event (both chat and user match)
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEvent);
			let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(1);

			// Test blocked by user
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedByUserEvent);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(0);

			// Test blocked by chat
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedByChatEvent);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(0);
		});
	});

	describe('Error Handling Integration', () => {
		it('should handle malformed webhook data gracefully', async () => {
			const malformedEvents = [
				null,
				undefined,
				{}, // Empty object
				{ invalid: 'data' }, // Invalid structure
				{ update_type: null }, // Null event type
			];

			for (const eventData of malformedEvents) {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);
				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

				// Should not crash and return appropriate response
				expect(result).toBeDefined();
				expect(result.workflowData).toBeDefined();
			}
		});

		it('should handle processing errors without crashing webhook', async () => {
			// Mock a processing error
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation(() => {
					throw new Error('Parameter processing error');
				});

			const validEvent: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					body: { text: 'Test message' }
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(validEvent);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			// Should return empty workflow data instead of crashing
			expect(result.workflowData).toEqual([]);
		});

		it('should handle event type filtering correctly', async () => {
			// Configure to only accept bot_started events
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['bot_started'];
					if (paramName === 'additionalFields') return {};
					return undefined;
				});

			const allowedEvent: MaxWebhookEvent = {
				update_type: 'bot_started',
				timestamp: 1640995200000,
				user: { user_id: 123, first_name: 'Test' }
			};

			const filteredEvent: MaxWebhookEvent = {
				update_type: 'message_created', // Not in allowed list
				timestamp: 1640995200000,
				message: { body: { text: 'Test' } }
			};

			// Test allowed event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEvent);
			let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(1);

			// Test filtered event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(filteredEvent);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(0);
		});
	});

	describe('Event ID Generation and Consistency', () => {
		it('should generate consistent event IDs for identical events', async () => {
			const event: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 123,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 456,
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Test message'
					}
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event);

			// Process same event twice
			const result1 = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			const result2 = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			const event1 = result1.workflowData?.[0]?.[0] as any;
			const event2 = result2.workflowData?.[0]?.[0] as any;

			// Should generate same event ID for identical data
			expect(event1.event_id).toBe(event2.event_id);
		});

		it('should generate different event IDs for different events', async () => {
			const event1: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				user: { user_id: 123, first_name: 'User1' },
				chat: { chat_id: 456, type: 'chat' },
				message: {
					body: { mid: 'msg_1', text: 'Message 1' },
					message_id: 'msg_1',
					sender: { user_id: 123, first_name: 'User1', is_bot: false, last_activity_time: 1640995200000 },
					recipient: { chat_id: 456, chat_type: 'chat' },
					timestamp: 1640995200000
				}
			};

			const event2: MaxWebhookEvent = {
				update_type: 'bot_started', // Different event type
				timestamp: 1640995300000, // Different timestamp
				user: { user_id: 789, first_name: 'User2' }
			};

			// Process first event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event1);
			const result1 = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			// Process second event
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event2);
			const result2 = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			const processedEvent1 = result1.workflowData?.[0]?.[0] as any;
			const processedEvent2 = result2.workflowData?.[0]?.[0] as any;

			// Should generate different event IDs for different event types and timestamps
			expect(processedEvent1.event_id).not.toBe(processedEvent2.event_id);
		});
	});
});
