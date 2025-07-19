/**
 * Comprehensive test suite for all Max messenger event types
 * Tests event-specific processing, validation, and data extraction
 */

import { MaxEventProcessor } from '../../MaxEventProcessor';
import type { IWebhookFunctions } from 'n8n-workflow';
import type { MaxWebhookEvent } from '../../MaxTriggerConfig';

describe('MaxEventProcessor - Event Type Processing', () => {
	let eventProcessor: MaxEventProcessor;
	let mockWebhookFunctions: Partial<IWebhookFunctions>;

	beforeEach(() => {
		eventProcessor = new MaxEventProcessor();

		mockWebhookFunctions = {
			getBodyData: jest.fn(),
			getNodeParameter: jest.fn(),
			helpers: {
				returnJsonArray: jest.fn((data) => data),
			} as any,
		};
	});

	describe('message_edited event processing', () => {
		it('should process message_edited event with old/new content comparison', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_edited',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123, id: 123,
					type: 'group',
					title: 'Test Chat',
					members_count: 5
				},
				user: {
					user_id: 456,
					first_name: 'John',
					username: 'john_doe'
				},
				message: {
					body: {
						mid: 'msg_123',
						text: 'Updated text',
						seq: 2
					},
					timestamp: 1640995300000,
					sender: {
						user_id: 456,
						first_name: 'John',
						is_bot: false,
						last_activity_time: 1640995300
					},
					recipient: {
						chat_id: 123,
						chat_type: 'group'
					}
				},
				old_message: {
					text: 'Original text',
					timestamp: 1640995200000,
					message_id: 'msg_123'
				},
				new_message: {
					text: 'Updated text',
					timestamp: 1640995300000,
					message_id: 'msg_123'
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_edited']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.update_type).toBe('message_edited');
			expect(eventData.event_context.type).toBe('message_edited');
			expect(eventData.event_context.description).toBe('Message content was modified');
			expect(eventData.event_context.old_content).toBe('Original text');
			expect(eventData.event_context.new_content).toBe('Updated text');
			expect(eventData.event_context.has_content_changes).toBe(true);
			expect(eventData.event_context.edited_at).toBe(1640995300);
			expect(eventData.validation_status.is_valid).toBe(true);
			expect(eventData.metadata.user_context?.user_id).toBe(456);
			expect(eventData.metadata.chat_context?.chat_id).toBe(123);
		});

		it('should handle message_edited event without old/new message data', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_edited',
				timestamp: 1640995200000,
				message: {
					body: {
						text: 'Updated text',
						mid: 'msg_123'
					}
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_edited']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.old_content).toBeNull();
			expect(eventData.event_context.new_content).toBe('Updated text');
			expect(eventData.validation_status.warnings).toContainEqual({
				field: 'message_versions',
				message: 'No old_message or new_message data found for comparison',
				severity: 'warning',
			});
		});

		it('should detect attachment changes in message_edited events', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_edited',
				timestamp: 1640995200000,
				message: {
					body: {
						text: 'Same text',
						attachments: [{ type: 'image', payload: { token: 'new_token' } }]
					}
				},
				old_message: {
					text: 'Same text',
					attachments: [{ type: 'image', payload: { token: 'old_token' } }]
				},
				new_message: {
					text: 'Same text',
					attachments: [{ type: 'image', payload: { token: 'new_token' } }]
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_edited']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;
			expect(eventData.event_context.has_content_changes).toBe(false); // Text is same
			expect(eventData.event_context.has_attachment_changes).toBe(true); // Attachments changed
		});
	});

	describe('message_removed event processing', () => {
		it('should process message_removed event with deletion context', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_removed',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123, id: 123,
					type: 'group',
					title: 'Test Chat'
				},
				user: {
					user_id: 456,
					first_name: 'John'
				},
				message: {
					body: {
						text: 'Deleted message',
						mid: 'msg_123'
					},
					message_id: 'msg_123'
				},
				deletion_context: {
					deleted_by: {
						user_id: 789,
						name: 'Admin User',
						username: 'admin'
					},
					deletion_reason: 'inappropriate_content',
					deleted_at: 1640995300000,
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_removed']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.type).toBe('message_removed');
			expect(eventData.event_context.description).toBe('Message was deleted from chat');
			expect(eventData.event_context.deleted_message_id).toBe('msg_123');
			expect(eventData.event_context.deleted_by).toEqual({
				user_id: 789,
				name: 'Admin User',
				username: 'admin'
			});
			expect(eventData.event_context.deletion_reason).toBe('inappropriate_content');
			expect(eventData.event_context.deleted_at).toBe(1640995300);
			expect(eventData.event_context.original_content).toBe('Deleted message');
			expect(eventData.validation_status.is_valid).toBe(true);
		});

		it('should handle message_removed event without deletion context', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_removed',
				timestamp: 1640995200000,
				message: {
					body: {
						text: 'Deleted message',
						mid: 'msg_123'
					}
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_removed']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;
			expect(eventData.event_context.deleted_by).toBeNull();
			expect(eventData.event_context.deletion_reason).toBe('unknown');
			expect(eventData.validation_status.warnings).toContainEqual({
				field: 'deletion_context',
				message: 'No deletion context provided',
				severity: 'warning',
			});
		});
	});

	describe('bot_added event processing', () => {
		it('should process bot_added event with chat and user context', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'bot_added',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123, id: 123,
					type: 'group',
					title: 'Test Group',
					members_count: 5
				},
				user: {
					user_id: 456,
					first_name: 'John',
					username: 'john_doe'
				},
				membership_context: {
					added_by: {
						user_id: 456,
						name: 'John Doe',
						username: 'john_doe'
					},
					action_timestamp: 1640995200000
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['bot_added']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.type).toBe('bot_added');
			expect(eventData.event_context.description).toBe('Bot was added to chat');
			expect(eventData.event_context.action_by).toEqual({
				user_id: 456,
				name: 'John Doe',
				username: 'john_doe'
			});
			expect(eventData.event_context.chat_info).toEqual({
				chat_id: 123,
				chat_type: 'group',
				chat_title: 'Test Group',
				members_count: 5
			});
			expect(eventData.event_context.action_timestamp).toBe(1640995200000);
			expect(eventData.validation_status.is_valid).toBe(true);
		});

		it('should handle bot_added event without membership context', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'bot_added',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123, id: 123,
					type: 'group'
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['bot_added']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;
			expect(eventData.validation_status.warnings).toContainEqual({
				field: 'membership_context',
				message: 'No membership context provided',
				severity: 'warning',
			});
		});
	});

	describe('bot_removed event processing', () => {
		it('should process bot_removed event with removal context', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'bot_removed',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123, id: 123,
					type: 'group',
					title: 'Test Group',
					members_count: 4
				},
				user: {
					user_id: 456,
					first_name: 'John'
				},
				membership_context: {
					removed_by: {
						user_id: 789,
						name: 'Admin User',
						username: 'admin'
					},
					action_timestamp: 1640995200000
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['bot_removed']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.type).toBe('bot_removed');
			expect(eventData.event_context.description).toBe('Bot was removed from chat');
			expect(eventData.event_context.action_by).toEqual({
				user_id: 789,
				name: 'Admin User',
				username: 'admin'
			});
			expect(eventData.validation_status.is_valid).toBe(true);
		});
	});

	describe('user_added event processing', () => {
		it('should process user_added event with user role and context', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'user_added',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123, id: 123,
					type: 'group',
					title: 'Test Group',
					members_count: 6
				},
				user: {
					user_id: 999,
					first_name: 'New',
					last_name: 'User',
					username: 'newuser'
				},
				membership_context: {
					added_by: {
						user_id: 456,
						name: 'Admin User',
						username: 'admin'
					},
					user_role: 'member',
					action_timestamp: 1640995200000
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['user_added']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.type).toBe('user_added');
			expect(eventData.event_context.description).toBe('User joined the chat');
			expect(eventData.event_context.affected_user).toEqual({
				user_id: 999,
				first_name: 'New',
				last_name: 'User',
				username: 'newuser'
			});
			expect(eventData.event_context.action_by).toEqual({
				user_id: 456,
				name: 'Admin User',
				username: 'admin'
			});
			expect(eventData.event_context.user_role).toBe('member');
			expect(eventData.validation_status.is_valid).toBe(true);
		});
	});

	describe('user_removed event processing', () => {
		it('should process user_removed event with removal details', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'user_removed',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123, id: 123,
					type: 'group',
					title: 'Test Group',
					members_count: 4
				},
				user: {
					user_id: 999,
					first_name: 'Removed',
					username: 'removeduser'
				},
				membership_context: {
					removed_by: {
						user_id: 456,
						name: 'Admin User',
						username: 'admin'
					},
					user_role: 'member',
					action_timestamp: 1640995200000
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['user_removed']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.type).toBe('user_removed');
			expect(eventData.event_context.description).toBe('User left the chat');
			expect(eventData.event_context.affected_user).toEqual({
				user_id: 999,
				first_name: 'Removed',
				username: 'removeduser'
			});
			expect(eventData.event_context.action_by).toEqual({
				user_id: 456,
				name: 'Admin User',
				username: 'admin'
			});
			expect(eventData.validation_status.is_valid).toBe(true);
		});
	});

	describe('chat_title_changed event processing', () => {
		it('should process chat_title_changed event with old/new titles', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'chat_title_changed',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123, id: 123,
					type: 'group',
					title: 'New Chat Title',
					members_count: 5
				},
				user: {
					user_id: 456,
					first_name: 'John',
					username: 'john_doe'
				},
				chat_changes: {
					old_title: 'Old Chat Title',
					new_title: 'New Chat Title',
					changed_by: {
						user_id: 456,
						name: 'John Doe',
						username: 'john_doe'
					},
					changed_at: 1640995200000
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['chat_title_changed']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.type).toBe('chat_title_changed');
			expect(eventData.event_context.description).toBe('Chat title was modified');
			expect(eventData.event_context.old_title).toBe('Old Chat Title');
			expect(eventData.event_context.new_title).toBe('New Chat Title');
			expect(eventData.event_context.changed_by).toEqual({
				user_id: 456,
				name: 'John Doe',
				username: 'john_doe'
			});
			expect(eventData.event_context.changed_at).toBe(1640995200000);
			expect(eventData.validation_status.is_valid).toBe(true);
		});

		it('should handle chat_title_changed event without chat_changes context', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'chat_title_changed',
				timestamp: 1640995200000,
				chat: {
					chat_id: 123, id: 123,
					type: 'group',
					title: 'New Title'
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['chat_title_changed']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;
			expect(eventData.event_context.old_title).toBeNull();
			expect(eventData.event_context.new_title).toBe('New Title');
			expect(eventData.validation_status.warnings).toContainEqual({
				field: 'chat_changes',
				message: 'No chat_changes context provided',
				severity: 'warning',
			});
		});
	});

	describe('message_chat_created event processing', () => {
		it('should process message_chat_created event with chat context', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_chat_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 456,
						first_name: 'John',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 123,
						chat_type: 'group'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello group!',
						attachments: [
							{
								type: 'image',
								payload: { token: 'img_token_123' }
							}
						]
					}
				},
				user_locale: 'en'
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_chat_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.type).toBe('message_chat_created');
			expect(eventData.event_context.description).toBe('New message received in group chat');
			expect(eventData.event_context.message_id).toBe('msg_123');
			expect(eventData.event_context.has_text).toBe(true);
			expect(eventData.event_context.has_attachments).toBe(true);
			expect(eventData.event_context.message_length).toBe(12);
			expect(eventData.event_context.chat_type).toBe('group');
			expect(eventData.validation_status.is_valid).toBe(true);
		});
	});
});
