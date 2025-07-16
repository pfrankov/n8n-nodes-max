import { MaxEventProcessor } from '../MaxEventProcessor';
import type { IWebhookFunctions, IDataObject } from 'n8n-workflow';
import type { MaxWebhookEvent } from '../MaxTriggerConfig';

describe('MaxEventProcessor', () => {
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

	describe('processWebhookEvent', () => {
		it('should process valid message_created event', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200,
				chat: { id: 123, type: 'private' },
				user: { id: 456, first_name: 'John' },
				message: { id: 1, text: 'Hello' },
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toEqual([{
				...mockBodyData,
				event_type: 'message_created',
				update_type: 'message_created',
			}]);
		});

		it('should return empty response when no body data', async () => {
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(null);

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toEqual([]);
		});

		it('should pass through data when no event type found', async () => {
			const mockBodyData = {
				someData: 'test',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toEqual([mockBodyData]);
		});

		it('should filter out non-allowed event types', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_edited',
				timestamp: 1640995200,
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events (doesn't include message_edited)

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toEqual([]);
		});

		it('should handle event_type field as fallback', async () => {
			const mockBodyData: MaxWebhookEvent = {
				event_type: 'message_created', // Using event_type instead of update_type
				timestamp: 1640995200,
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]).toEqual([{
				...mockBodyData,
				event_type: 'message_created',
				update_type: 'message_created',
			}]);
		});

		it('should return empty response on processing error', async () => {
			(mockWebhookFunctions.getBodyData as jest.Mock).mockImplementation(() => {
				throw new Error('Processing error');
			});

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toEqual([]);
		});
	});

	describe('Chat ID Filtering', () => {
		it('should allow events from specified chat IDs', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				chat: { id: 123 },
			};

			const additionalFields: IDataObject = {
				chatIds: '123,456,789',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
		});

		it('should filter out events from non-specified chat IDs', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				chat: { id: 999 }, // Not in allowed list
			};

			const additionalFields: IDataObject = {
				chatIds: '123,456,789',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toEqual([]);
		});

		it('should extract chat info from message object', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				message: {
					chat: { id: 123 },
				},
			};

			const additionalFields: IDataObject = {
				chatIds: '123,456,789',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
		});

		it('should handle chat_id field', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				chat: { chat_id: 123 }, // Using chat_id instead of id
			};

			const additionalFields: IDataObject = {
				chatIds: '123,456,789',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
		});
	});

	describe('User ID Filtering', () => {
		it('should allow events from specified user IDs', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				user: { id: 456 },
			};

			const additionalFields: IDataObject = {
				userIds: '123,456,789',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
		});

		it('should filter out events from non-specified user IDs', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				user: { id: 999 }, // Not in allowed list
			};

			const additionalFields: IDataObject = {
				userIds: '123,456,789',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toEqual([]);
		});

		it('should extract user info from message object', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				message: {
					from: { id: 456 },
				},
			};

			const additionalFields: IDataObject = {
				userIds: '123,456,789',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
		});

		it('should handle user_id field', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				user: { user_id: 456 }, // Using user_id instead of id
			};

			const additionalFields: IDataObject = {
				userIds: '123,456,789',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
		});
	});

	describe('Combined Filtering', () => {
		it('should apply both chat ID and user ID filters', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				chat: { id: 123 },
				user: { id: 456 },
			};

			const additionalFields: IDataObject = {
				chatIds: '123,789',
				userIds: '456,999',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
		});

		it('should filter out when chat ID matches but user ID does not', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				chat: { id: 123 },
				user: { id: 999 }, // Not in allowed list
			};

			const additionalFields: IDataObject = {
				chatIds: '123,789',
				userIds: '456,888',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toEqual([]);
		});

		it('should continue processing when filtering fails', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				// Omit chat property entirely to avoid type error
			};

			const additionalFields: IDataObject = {
				chatIds: '123,789',
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			// Should continue processing even if filtering fails
			expect(result.workflowData).toHaveLength(1);
		});
	});

	describe('Event-Specific Data Processing', () => {
		describe('message_edited events', () => {
			it('should process message_edited event with old/new content comparison', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_edited',
					timestamp: 1640995200,
					chat: { id: 123, type: 'group' },
					user: { id: 456, first_name: 'John' },
					message: { id: 1, text: 'Updated text', timestamp: 1640995300 },
					old_message: { id: 1, text: 'Original text', timestamp: 1640995200 },
					new_message: { id: 1, text: 'Updated text', timestamp: 1640995300 },
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
				expect(eventData.event_context.type).toBe('message_edited');
				expect(eventData.event_context.old_content).toBe('Original text');
				expect(eventData.event_context.new_content).toBe('Updated text');
				expect(eventData.event_context.has_content_changes).toBe(true);
			});
		});

		describe('message_removed events', () => {
			it('should process message_removed event with deletion context', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_removed',
					timestamp: 1640995200,
					chat: { id: 123, type: 'group' },
					user: { id: 456, first_name: 'John' },
					message: { id: 1, text: 'Deleted message' },
					deletion_context: {
						deleted_by: { user_id: 789, name: 'Admin' },
						deletion_reason: 'inappropriate_content',
						deleted_at: 1640995300,
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
				expect(eventData.event_context.deletion_reason).toBe('inappropriate_content');
				expect(eventData.event_context.original_content).toBe('Deleted message');
			});
		});

		describe('bot_added/bot_removed events', () => {
			it('should process bot_added event with chat and user context', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'bot_added',
					timestamp: 1640995200,
					chat: { id: 123, type: 'group', title: 'Test Group', members_count: 5 },
					user: { id: 456, first_name: 'John' },
					membership_context: {
						added_by: { user_id: 456, name: 'John' },
						action_timestamp: 1640995200,
					},
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
				expect(eventData.event_context.chat_info.chat_title).toBe('Test Group');
			});

			it('should process bot_removed event with chat and user context', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'bot_removed',
					timestamp: 1640995200,
					chat: { id: 123, type: 'group', title: 'Test Group' },
					user: { id: 456, first_name: 'John' },
					membership_context: {
						removed_by: { user_id: 456, name: 'John' },
						action_timestamp: 1640995200,
					},
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
			});
		});

		describe('user_added/user_removed events', () => {
			it('should process user_added event with user details and roles', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'user_added',
					timestamp: 1640995200,
					chat: { id: 123, type: 'group', title: 'Test Group' },
					user: { id: 789, first_name: 'Alice' },
					membership_context: {
						added_by: { user_id: 456, name: 'John' },
						user_role: 'member',
						action_timestamp: 1640995200,
					},
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
				expect(eventData.event_context.user_role).toBe('member');
			});

			it('should process user_removed event with user details', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'user_removed',
					timestamp: 1640995200,
					chat: { id: 123, type: 'group', title: 'Test Group' },
					user: { id: 789, first_name: 'Alice' },
					membership_context: {
						removed_by: { user_id: 456, name: 'John' },
						action_timestamp: 1640995200,
					},
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
			});
		});

		describe('chat_title_changed events', () => {
			it('should process chat_title_changed event with old/new titles', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'chat_title_changed',
					timestamp: 1640995200,
					chat: { id: 123, type: 'group', title: 'New Group Name' },
					user: { id: 456, first_name: 'John' },
					chat_changes: {
						old_title: 'Old Group Name',
						new_title: 'New Group Name',
						changed_by: { user_id: 456, name: 'John' },
						changed_at: 1640995200,
					},
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
				expect(eventData.event_context.old_title).toBe('Old Group Name');
				expect(eventData.event_context.new_title).toBe('New Group Name');
			});
		});

		describe('message_chat_created events', () => {
			it('should process message_chat_created event as basic message event', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_chat_created',
					timestamp: 1640995200,
					chat: { id: 123, type: 'group', title: 'Test Group' },
					user: { id: 456, first_name: 'John' },
					message: { id: 1, text: 'Hello from group chat' },
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
				expect(eventData.event_type).toBe('message_chat_created');
				expect(eventData.update_type).toBe('message_chat_created');
				expect(eventData.message.text).toBe('Hello from group chat');
			});
		});

		describe('processEventSpecificData method', () => {
			it('should return base data for unsupported event types', () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'unknown_event',
					timestamp: 1640995200,
				};

				const result = eventProcessor.processEventSpecificData(mockBodyData, 'unknown_event');

				expect(result).toEqual({
					...mockBodyData,
					event_type: 'unknown_event',
					update_type: 'unknown_event',
				});
			});

			it('should return base data for basic events without additional processing', () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_created',
					timestamp: 1640995200,
					message: { id: 1, text: 'Hello' },
				};

				const result = eventProcessor.processEventSpecificData(mockBodyData, 'message_created');

				expect(result).toEqual({
					...mockBodyData,
					event_type: 'message_created',
					update_type: 'message_created',
				});
			});
		});
	});
});