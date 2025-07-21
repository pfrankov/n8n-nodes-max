/**
 * End-to-end tests for complete event workflows
 * Tests complete event processing from webhook reception to workflow execution
 */

import type { IWebhookFunctions } from 'n8n-workflow';
import { MaxTrigger } from '../../MaxTrigger.node';
import {
	EVENT_FIXTURES,
	MALFORMED_EVENT_FIXTURES,
	EDGE_CASE_EVENT_FIXTURES,
	createEventWithIds,
	createEventBatch
} from '../fixtures/eventFixtures';

describe('End-to-End Event Workflows', () => {
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

		// Default configuration - accept all event types
		(mockWebhookFunctions.getNodeParameter as jest.Mock)
			.mockImplementation((paramName: string) => {
				if (paramName === 'events') {
					return [
						'message_created', 'message_chat_created', 'message_edited',
						'message_removed', 'bot_started', 'bot_added', 'bot_removed',
						'user_added', 'user_removed', 'chat_title_changed', 'message_callback'
					];
				}
				if (paramName === 'additionalFields') return {};
				return undefined;
			});
	});

	describe('Complete Event Processing Workflows', () => {
		it('should process all supported event types end-to-end', async () => {
			const eventTypes = [
				'message_created', 'message_chat_created', 'message_edited',
				'message_removed', 'bot_started', 'bot_added', 'bot_removed',
				'user_added', 'user_removed', 'chat_title_changed', 'message_callback'
			];

			for (const eventType of eventTypes) {
				const eventData = EVENT_FIXTURES[eventType];
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

				// Verify workflow was triggered
				expect(result.workflowData).toHaveLength(1);
				expect(result.workflowData?.[0]).toHaveLength(1);

				const processedEvent = result.workflowData?.[0]?.[0] as any;

				// Verify basic event structure
				expect(processedEvent.update_type).toBe(eventType);
				expect(processedEvent.timestamp).toBeDefined();
				expect(processedEvent.event_id).toBeDefined();
				expect(processedEvent.event_context).toBeDefined();
				expect(processedEvent.validation_status).toBeDefined();
				expect(processedEvent.metadata).toBeDefined();

				// Verify event context has correct type
				expect(processedEvent.event_context.type).toBe(eventType);
				expect(processedEvent.event_context.description).toBeDefined();

				// Verify validation passed
				expect(processedEvent.validation_status.is_valid).toBe(true);
				expect(processedEvent.validation_status.errors).toHaveLength(0);

				// Verify metadata structure
				expect(processedEvent.metadata.received_at).toBeDefined();
				expect(processedEvent.metadata.processing_time_ms).toBeGreaterThanOrEqual(0);
				expect(processedEvent.metadata.source).toBe('webhook');
			}
		});

		it('should handle message workflow with attachments and formatting', async () => {
				const messageEvent = EVENT_FIXTURES['message_chat_created'];
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(messageEvent);

				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				const processedEvent = result.workflowData?.[0]?.[0] as any;

				// Verify message-specific processing
				expect(processedEvent.event_context.has_text).toBe(true);
				expect(processedEvent.event_context.has_attachments).toBe(true);
				expect(processedEvent.event_context.message_length).toBeGreaterThan(0);
				expect(processedEvent.event_context.chat_type).toBe('group');

				// Verify metadata extraction
				expect(processedEvent.metadata.user_context).toBeDefined();
				expect(processedEvent.metadata.user_context.user_id).toBe(123456);
				expect(processedEvent.metadata.user_context.username).toBe('john_doe');

				expect(processedEvent.metadata.chat_context).toBeDefined();
				expect(processedEvent.metadata.chat_context.chat_id).toBe(789012);
				expect(processedEvent.metadata.chat_context.chat_type).toBe('group');

				// Verify original event data is preserved
				expect(processedEvent.message).toBeDefined();
				expect(processedEvent.message.body.attachments).toHaveLength(1);
				expect(processedEvent.message.body.attachments[0].type).toBe('image');
			});

		it('should handle callback workflow with button interaction', async () => {
			const callbackEvent = EVENT_FIXTURES['message_callback'];
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(callbackEvent);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			const processedEvent = result.workflowData?.[0]?.[0] as any;

			// Verify callback-specific processing
			expect(processedEvent.event_context.callback_id).toBe('cb_def456');
			expect(processedEvent.event_context.callback_payload).toBe('action_confirm');
			// Note: source_message_id may be undefined if message doesn't have id field

			// Verify callback data is preserved
			expect(processedEvent.callback).toBeDefined();
			expect(processedEvent.callback.callback_id).toBe('cb_def456');
			expect(processedEvent.callback.payload).toBe('action_confirm');

			// Verify keyboard structure is preserved
			expect(processedEvent.message.body.attachments).toHaveLength(1);
			expect(processedEvent.message.body.attachments[0].type).toBe('inline_keyboard');
			expect(processedEvent.message.body.attachments[0].payload.buttons).toBeDefined();
		});

		it('should handle membership workflow with context', async () => {
			const membershipEvent = EVENT_FIXTURES['user_added'];
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(membershipEvent);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			const processedEvent = result.workflowData?.[0]?.[0] as any;

			// Verify membership-specific processing
			expect(processedEvent.event_context.affected_user).toBeDefined();
			expect(processedEvent.event_context.affected_user.user_id).toBe(555444);
			expect(processedEvent.event_context.action_by).toBeDefined();
			expect(processedEvent.event_context.user_role).toBe('member');
			expect(processedEvent.event_context.chat_info).toBeDefined();
			expect(processedEvent.event_context.chat_info.chat_id).toBe(789012);
			expect(processedEvent.event_context.chat_info.members_count).toBe(6);

			// Verify membership context is preserved
			expect(processedEvent.membership_context).toBeDefined();
			expect(processedEvent.membership_context.added_by).toBeDefined();
			expect(processedEvent.membership_context.user_role).toBe('member');
		});

		it('should handle chat modification workflow', async () => {
			const chatEvent = EVENT_FIXTURES['chat_title_changed'];
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(chatEvent);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			const processedEvent = result.workflowData?.[0]?.[0] as any;

			// Verify chat modification processing
			expect(processedEvent.event_context.old_title).toBe('Test Group Chat');
			expect(processedEvent.event_context.new_title).toBe('Updated Group Chat Title');
			expect(processedEvent.event_context.changed_by).toBeDefined();
			expect(processedEvent.event_context.changed_by.user_id).toBe(123456);
			expect(processedEvent.event_context.chat_info).toBeDefined();

			// Verify chat changes context is preserved
			expect(processedEvent.chat_changes).toBeDefined();
			expect(processedEvent.chat_changes.old_title).toBe('Test Group Chat');
			expect(processedEvent.chat_changes.new_title).toBe('Updated Group Chat Title');
		});
	});

	describe('Event Filtering Workflows', () => {
		it('should filter events by chat ID across all event types', async () => {
			const allowedChatId = 111111;
			const blockedChatId = 999999;

			// Configure chat ID filtering
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_created', 'user_added', 'chat_title_changed'];
					if (paramName === 'additionalFields') return { chatIds: allowedChatId.toString() };
					return undefined;
				});

			const testEvents = [
				{ type: 'message_created', allowed: createEventWithIds('message_created', undefined, allowedChatId), blocked: createEventWithIds('message_created', undefined, blockedChatId) },
				{ type: 'user_added', allowed: createEventWithIds('user_added', undefined, allowedChatId), blocked: createEventWithIds('user_added', undefined, blockedChatId) },
				{ type: 'chat_title_changed', allowed: createEventWithIds('chat_title_changed', undefined, allowedChatId), blocked: createEventWithIds('chat_title_changed', undefined, blockedChatId) }
			];

			for (const testEvent of testEvents) {
				// Test allowed event
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(testEvent.allowed);
				let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				expect(result.workflowData).toHaveLength(1);

				// Test blocked event
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(testEvent.blocked);
				result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				expect(result.workflowData).toHaveLength(0);
			}
		});

		it('should filter events by user ID across all event types', async () => {
			const allowedUserId = 222222;
			const blockedUserId = 888888;

			// Configure user ID filtering
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['bot_started', 'message_created', 'bot_added'];
					if (paramName === 'additionalFields') return { userIds: allowedUserId.toString() };
					return undefined;
				});

			const testEvents = [
				{ type: 'bot_started', allowed: createEventWithIds('bot_started', allowedUserId), blocked: createEventWithIds('bot_started', blockedUserId) },
				{ type: 'message_created', allowed: createEventWithIds('message_created', allowedUserId), blocked: createEventWithIds('message_created', blockedUserId) },
				{ type: 'bot_added', allowed: createEventWithIds('bot_added', allowedUserId), blocked: createEventWithIds('bot_added', blockedUserId) }
			];

			for (const testEvent of testEvents) {
				// Test allowed event
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(testEvent.allowed);
				let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				expect(result.workflowData).toHaveLength(1);

				// Test blocked event
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(testEvent.blocked);
				result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				expect(result.workflowData).toHaveLength(0);
			}
		});

		it('should handle complex filtering scenarios', async () => {
			// Configure multiple filters
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') return ['message_created', 'message_callback'];
					if (paramName === 'additionalFields') return {
						chatIds: '111111, 222222',
						userIds: '333333, 444444'
					};
					return undefined;
				});

			// Event that passes both filters
			const allowedEvent = createEventWithIds('message_created', 333333, 111111);
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(allowedEvent);
			let result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(1);

			// Event that fails chat filter
			const blockedByChat = createEventWithIds('message_created', 333333, 999999);
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedByChat);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(0);

			// Event that fails user filter
			const blockedByUser = createEventWithIds('message_created', 999999, 111111);
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedByUser);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(0);

			// Event that fails both filters
			const blockedByBoth = createEventWithIds('message_created', 999999, 999999);
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(blockedByBoth);
			result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			expect(result.workflowData).toHaveLength(0);
		});
	});

	describe('Error Handling Workflows', () => {
		it('should handle malformed events gracefully', async () => {
			const malformedEvents = Object.values(MALFORMED_EVENT_FIXTURES);

			for (const malformedEvent of malformedEvents) {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(malformedEvent);

				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

				// Should not crash
				expect(result).toBeDefined();
				expect(result.workflowData).toBeDefined();

				// For events with valid update_type, should process with validation errors
				if (malformedEvent.update_type && typeof malformedEvent.update_type === 'string') {
					expect(result.workflowData).toHaveLength(1);
					const processedEvent = result.workflowData?.[0]?.[0] as any;
					expect(processedEvent.validation_status).toBeDefined();
					// Should have validation errors or warnings
					expect(
						processedEvent.validation_status.errors.length > 0 ||
						processedEvent.validation_status.warnings.length > 0
					).toBe(true);
				}
			}
		});

		it('should handle edge case events correctly', async () => {
			const edgeCaseEvents = Object.entries(EDGE_CASE_EVENT_FIXTURES);

			for (const [eventName, eventData] of edgeCaseEvents) {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventData);

				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

				// Should process successfully
				expect(result.workflowData).toHaveLength(1);
				const processedEvent = result.workflowData?.[0]?.[0] as any;

				// Should be valid (edge cases should still be valid)
				expect(processedEvent.validation_status.is_valid).toBe(true);

				// Verify specific edge case handling
				switch (eventName) {
					case 'max_length_message':
						expect(processedEvent.event_context.message_length).toBe(4000);
						break;
					case 'multiple_attachments':
						expect(processedEvent.event_context.has_attachments).toBe(true);
						expect(processedEvent.message.body.attachments).toHaveLength(4);
						break;
					case 'complex_keyboard':
						expect(processedEvent.message.body.attachments[0].payload.buttons).toHaveLength(4);
						break;
					case 'special_characters':
						expect(processedEvent.message.body.text).toContain('🎉');
						expect(processedEvent.message.body.text).toContain('中文');
						break;
				}
			}
		});

		it('should handle processing errors without crashing', async () => {
			// Mock a processing error in getNodeParameter
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockImplementation((paramName: string) => {
					if (paramName === 'events') {
						throw new Error('Configuration error');
					}
					return {};
				});

			const validEvent = EVENT_FIXTURES['message_created'];
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(validEvent);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

			// Should return empty workflow data instead of crashing
			expect(result.workflowData).toEqual([]);
		});
	});

	describe('Performance and Load Testing', () => {
		it('should handle batch processing of events', async () => {
			const eventBatch = createEventBatch('message_created', 10);
			const processingTimes: number[] = [];

			for (const event of eventBatch) {
				const startTime = Date.now();

				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event);
				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);

				const endTime = Date.now();
				processingTimes.push(endTime - startTime);

				// Verify each event was processed
				expect(result.workflowData).toHaveLength(1);
				const processedEvent = result.workflowData?.[0]?.[0] as any;
				expect(processedEvent.validation_status.is_valid).toBe(true);
			}

			// Verify reasonable processing times (should be under 100ms each)
			const avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
			expect(avgProcessingTime).toBeLessThan(100);
		});

		it('should generate consistent event IDs for identical events', async () => {
			const event = EVENT_FIXTURES['message_created'];
			const eventIds: string[] = [];

			// Process same event multiple times
			for (let i = 0; i < 5; i++) {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event);
				const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
				const processedEvent = result.workflowData?.[0]?.[0] as any;
				eventIds.push(processedEvent.event_id);
			}

			// All event IDs should be identical for same event data
			expect(new Set(eventIds).size).toBe(1);
		});

		it('should handle concurrent event processing', async () => {
			const events = [
				EVENT_FIXTURES['message_created'],
				EVENT_FIXTURES['bot_started'],
				EVENT_FIXTURES['message_callback'],
				EVENT_FIXTURES['user_added'],
				EVENT_FIXTURES['chat_title_changed']
			];

			// Process events concurrently
			const promises = events.map(async (event) => {
				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event);
				return maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			});

			const results = await Promise.all(promises);

			// Verify all events were processed successfully
			expect(results).toHaveLength(5);
			results.forEach((result) => {
				expect(result.workflowData).toHaveLength(1);
				const processedEvent = result.workflowData?.[0]?.[0] as any;
				expect(processedEvent.validation_status.is_valid).toBe(true);
			});
		});
	});

	describe('Data Integrity and Consistency', () => {
		it('should preserve all original event data', async () => {
			const originalEvent = EVENT_FIXTURES['message_callback'];
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(originalEvent);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			const processedEvent = result.workflowData?.[0]?.[0] as any;

			// Verify all original fields are preserved
			expect(processedEvent.update_type).toBe(originalEvent?.update_type);
			expect(processedEvent.timestamp).toBe(originalEvent?.timestamp);
			expect(processedEvent.message).toEqual(originalEvent?.message);
			expect(processedEvent.callback).toEqual(originalEvent?.callback);
			expect(processedEvent['user_locale']).toBe(originalEvent?.['user_locale']);

			// Verify enhanced fields are added
			expect(processedEvent.event_id).toBeDefined();
			expect(processedEvent.event_context).toBeDefined();
			expect(processedEvent.validation_status).toBeDefined();
			expect(processedEvent.metadata).toBeDefined();
		});

		it('should maintain data type consistency', async () => {
			const event = EVENT_FIXTURES['user_added'];
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event);

			const result = await maxTrigger.webhook.call(mockWebhookFunctions as IWebhookFunctions);
			const processedEvent = result.workflowData?.[0]?.[0] as any;

			// Verify data types are preserved
			expect(typeof processedEvent.timestamp).toBe('number');
			expect(typeof processedEvent.event_id).toBe('string');
			expect(typeof processedEvent.validation_status.is_valid).toBe('boolean');
			expect(Array.isArray(processedEvent.validation_status.errors)).toBe(true);
			expect(Array.isArray(processedEvent.validation_status.warnings)).toBe(true);
			expect(typeof processedEvent.metadata.processing_time_ms).toBe('number');
			expect(typeof processedEvent.metadata.received_at).toBe('number');
		});
	});
});
