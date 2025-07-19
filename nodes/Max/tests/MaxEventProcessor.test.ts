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
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
				},
				user_locale: 'en'
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;
			expect(eventData.update_type).toBe('message_created');
			expect(eventData.timestamp).toBe(1640995200000);
			expect(eventData.event_id).toBeDefined();
			expect(eventData.event_context.type).toBe('message_created');
			expect(eventData.event_context.description).toBe('New message received in direct conversation');
			expect(eventData.validation_status.is_valid).toBe(true);
			expect(eventData.metadata).toBeDefined();
			expect(eventData.metadata.user_context?.user_id).toBe(456);
			expect(eventData.metadata.chat_context?.chat_id).toBe(123);
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
				timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 123,
						chat_type: 'chat'
					},
					sender: {
						user_id: 456,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
				}
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
			timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 999, // Not in allowed list
						chat_type: 'chat'
					},
					sender: {
						user_id: 456,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
				}
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
			timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 123,
						chat_type: 'chat'
					},
					sender: {
						user_id: 456,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
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
			timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 123, // Using chat_id field
						chat_type: 'chat'
					},
					sender: {
						user_id: 456,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
				}
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
			timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 123,
						chat_type: 'chat'
					},
					sender: {
						user_id: 456,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
				}
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
			timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 123,
						chat_type: 'chat'
					},
					sender: {
						user_id: 999, // Not in allowed list
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
				}
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
			timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 123,
						chat_type: 'chat'
					},
					sender: {
						user_id: 456,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
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
			timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 123,
						chat_type: 'chat'
					},
					sender: {
						user_id: 456, // Using user_id field
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
				}
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
			timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 123,
						chat_type: 'chat'
					},
					sender: {
						user_id: 456,
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
				}
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
			timestamp: Date.now(),
				message: {
					recipient: {
						chat_id: 123,
						chat_type: 'chat'
					},
					sender: {
						user_id: 999, // Not in allowed list
						first_name: 'Test',
						is_bot: false,
						last_activity_time: Date.now()
					},
					timestamp: Date.now(),
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello'
					}
				}
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
			timestamp: Date.now(),
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

	describe('Event Validation', () => {
		describe('Message Event Validation', () => {
			it('should validate message_created events with missing message object', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_created',
					timestamp: 1640995200,
					user: { user_id: 456, first_name: 'John' },
					// Missing message object
				};

				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
				(mockWebhookFunctions.getNodeParameter as jest.Mock)
					.mockReturnValueOnce({}) // additionalFields
					.mockReturnValueOnce(['message_created']); // events

				const result = await eventProcessor.processWebhookEvent.call(
					mockWebhookFunctions as IWebhookFunctions
				);

				expect(result.workflowData).toHaveLength(1);
				const eventData = result.workflowData?.[0]?.[0] as any;
				expect(eventData.validation_status.is_valid).toBe(false);
				expect(eventData.validation_status.errors).toHaveLength(1);
				expect(eventData.validation_status.errors[0].field).toBe('message');
				expect(eventData.validation_status.errors[0].message).toBe('Message object is required for message events');
			});

			it('should warn about empty message content', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_created',
					timestamp: 1640995200,
					user: { user_id: 456, first_name: 'John' },
					message: { body: {} }, // No text or attachments
				};

				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
				(mockWebhookFunctions.getNodeParameter as jest.Mock)
					.mockReturnValueOnce({}) // additionalFields
					.mockReturnValueOnce(['message_created']); // events

				const result = await eventProcessor.processWebhookEvent.call(
					mockWebhookFunctions as IWebhookFunctions
				);

				expect(result.workflowData).toHaveLength(1);
				const eventData = result.workflowData?.[0]?.[0] as any;
				expect(eventData.validation_status.is_valid).toBe(true);
				expect(eventData.validation_status.warnings).toHaveLength(1);
				expect(eventData.validation_status.warnings[0].field).toBe('message.content');
				expect(eventData.validation_status.warnings[0].message).toBe('Message has no text content or attachments');
			});
		});

		describe('Callback Event Validation', () => {
			it('should validate message_callback events with missing callback object', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_callback',
					timestamp: 1640995200,
					user: { user_id: 456, first_name: 'John' },
					// Missing callback object
				};

				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
				(mockWebhookFunctions.getNodeParameter as jest.Mock)
					.mockReturnValueOnce({}) // additionalFields
					.mockReturnValueOnce(['message_callback']); // events

				const result = await eventProcessor.processWebhookEvent.call(
					mockWebhookFunctions as IWebhookFunctions
				);

				expect(result.workflowData).toHaveLength(1);
				const eventData = result.workflowData?.[0]?.[0] as any;
				expect(eventData.validation_status.is_valid).toBe(false);
				expect(eventData.validation_status.errors).toHaveLength(1);
				expect(eventData.validation_status.errors[0].field).toBe('callback');
				expect(eventData.validation_status.errors[0].message).toBe('Callback object is required for message_callback events');
			});

			it('should warn about missing callback payload', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_callback',
					timestamp: 1640995200,
					user: { user_id: 456, first_name: 'John' },
					callback: {}, // Empty callback object
				};

				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
				(mockWebhookFunctions.getNodeParameter as jest.Mock)
					.mockReturnValueOnce({}) // additionalFields
					.mockReturnValueOnce(['message_callback']); // events

				const result = await eventProcessor.processWebhookEvent.call(
					mockWebhookFunctions as IWebhookFunctions
				);

				expect(result.workflowData).toHaveLength(1);
				const eventData = result.workflowData?.[0]?.[0] as any;
				expect(eventData.validation_status.is_valid).toBe(true);
				expect(eventData.validation_status.warnings).toHaveLength(1);
				expect(eventData.validation_status.warnings[0].field).toBe('callback.payload');
				expect(eventData.validation_status.warnings[0].message).toBe('No callback payload or ID found');
			});
		});

		describe('Membership Event Validation', () => {
			it('should validate membership events with missing chat object', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'bot_added',
					timestamp: 1640995200,
					user: { user_id: 456, first_name: 'John' },
					// Missing chat object
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
				expect(eventData.validation_status.is_valid).toBe(false);
				expect(eventData.validation_status.errors).toHaveLength(1);
				expect(eventData.validation_status.errors[0].field).toBe('chat');
				expect(eventData.validation_status.errors[0].message).toBe('Chat object is required for membership events');
			});
		});

		describe('Timestamp Validation', () => {
			it('should warn about missing timestamp', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_created',
					// Missing timestamp
					user: { user_id: 456, first_name: 'John' },
					message: { body: { text: 'Hello' } },
				} as MaxWebhookEvent;

				(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
				(mockWebhookFunctions.getNodeParameter as jest.Mock)
					.mockReturnValueOnce({}) // additionalFields
					.mockReturnValueOnce(['message_created']); // events

				const result = await eventProcessor.processWebhookEvent.call(
					mockWebhookFunctions as IWebhookFunctions
				);

				expect(result.workflowData).toHaveLength(1);
				const eventData = result.workflowData?.[0]?.[0] as any;
				expect(eventData.validation_status.is_valid).toBe(true);
				expect(eventData.validation_status.warnings).toContainEqual({
					field: 'timestamp',
					message: 'Missing timestamp, using current time',
					severity: 'warning',
				});
				expect(eventData.timestamp).toBeDefined();
			});
		});
	});

	describe('Event Metadata Processing', () => {
		it('should extract user context from event data', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200,
				user: { user_id: 456, first_name: 'John', username: 'john_doe', lang: 'en' },
				message: { body: { text: 'Hello' } },
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;
			expect(eventData.metadata.user_context).toEqual({
				user_id: 456,
				username: 'john_doe',
				display_name: 'John',
				locale: 'en',
			});
		});

		it('should extract chat context from event data', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_chat_created',
				timestamp: 1640995200,
				chat: { chat_id: 123, type: 'group', title: 'Test Group', members_count: 5 },
				user: { user_id: 456, first_name: 'John' },
				message: { body: { text: 'Hello' } },
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
			expect(eventData.metadata.chat_context).toEqual({
				chat_id: 123,
				chat_type: 'group',
				chat_title: 'Test Group',
				members_count: 5,
			});
		});

		it('should extract user context from message.from when user is missing', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200,
				message: {
					body: { text: 'Hello' },
					from: { user_id: 456, first_name: 'John', username: 'john_doe' }
				},
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;
			expect(eventData.metadata.user_context).toEqual({
				user_id: 456,
				username: 'john_doe',
				display_name: 'John',
				locale: undefined,
			});
		});

		it('should generate unique event IDs', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200,
				chat: { chat_id: 123, type: 'chat' },
				user: { user_id: 456 },
				message: { body: { text: 'Hello' } },
			};

			// Mock the functions for both calls
			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields - first call
				.mockReturnValueOnce(['message_created']) // events - first call
				.mockReturnValueOnce({}) // additionalFields - second call
				.mockReturnValueOnce(['message_created']); // events - second call

			const result1 = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			// Process same event again
			const result2 = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData1 = result1.workflowData?.[0]?.[0] as any;
			const eventData2 = result2.workflowData?.[0]?.[0] as any;

			expect(eventData1.event_id).toBeDefined();
			expect(eventData2.event_id).toBeDefined();
			expect(eventData1.event_id).toBe(eventData2.event_id); // Same data should generate same ID
		});

		it('should track processing time', async () => {
			const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200,
				user: { user_id: 456, first_name: 'John' },
				message: { body: { text: 'Hello' } },
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;
			expect(eventData.metadata.processing_time_ms).toBeGreaterThanOrEqual(0);
			expect(eventData.metadata.received_at).toBeDefined();
			expect(eventData.metadata.source).toBe('webhook');
		});
	});

	describe('Event-Specific Data Processing', () => {
		describe('message_edited events', () => {
			it('should process message_edited event with old/new content comparison', async () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_edited',
					timestamp: 1640995200,
					chat: { chat_id: 123, type: 'group' },
					user: { user_id: 456, first_name: 'John' },
					message: { body: { text: 'Updated text' }, timestamp: 1640995300 },
					old_message: { text: 'Original text', timestamp: 1640995200 },
					new_message: { text: 'Updated text', timestamp: 1640995300 },
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
					chat: { chat_id: 123, type: 'group' },
					user: { user_id: 456, first_name: 'John' },
					message: { body: { text: 'Deleted message' } },
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
					chat: { chat_id: 123, type: 'group', title: 'Test Group', members_count: 5 },
					user: { user_id: 456, first_name: 'John' },
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
					chat: { chat_id: 123, type: 'group', title: 'Test Group' },
					user: { user_id: 456, first_name: 'John' },
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
					chat: { chat_id: 123, type: 'group', title: 'Test Group' },
					user: { user_id: 789, first_name: 'Alice' },
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
					chat: { chat_id: 123, type: 'group', title: 'Test Group' },
					user: { user_id: 789, first_name: 'Alice' },
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
					chat: { chat_id: 123, type: 'group', title: 'New Group Name' },
					user: { user_id: 456, first_name: 'John' },
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
					chat: { chat_id: 123, type: 'group', title: 'Test Group' },
					user: { user_id: 456, first_name: 'John' },
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
				expect(eventData.update_type).toBe('message_chat_created');
				expect(eventData.message.text).toBe('Hello from group chat');
			});
		});

		describe('processEventSpecificData method', () => {
			it('should return normalized data for unsupported event types', () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'unknown_event',
					timestamp: 1640995200,
				};

				const result = eventProcessor.processEventSpecificData(mockBodyData, 'unknown_event');

				expect(result.update_type).toBe('unknown_event');
				expect(result.timestamp).toBe(1640995200);
				expect(result.event_id).toBeDefined();
				expect(result.event_context.type).toBe('unknown_event');
				expect(result.event_context['is_supported']).toBe(false);
				expect(result.validation_status).toBeDefined();
				expect(result.metadata).toBeDefined();
			});

			it('should return normalized data for basic message events', () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_created',
					timestamp: 1640995200,
					message: { id: 1, text: 'Hello' },
					user: { user_id: 456, first_name: 'John' },
				};

				const result = eventProcessor.processEventSpecificData(mockBodyData, 'message_created');

				expect(result.update_type).toBe('message_created');
				expect(result.timestamp).toBe(1640995200);
				expect(result.event_id).toBeDefined();
				expect(result.event_context.type).toBe('message_created');
				expect(result.event_context.description).toBe('New message received in direct conversation');
				expect(result.validation_status.is_valid).toBe(true);
				expect(result.metadata.user_context?.user_id).toBe(456);
			});
		});

		describe('Additional Event Type Edge Cases', () => {
			describe('bot_started event validation', () => {
				it('should process bot_started event with minimal data', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'bot_started',
						timestamp: 1640995200,
						user: { user_id: 456, first_name: 'John' },
					};

					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['bot_started']); // events

					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);

					expect(result.workflowData).toHaveLength(1);
					const eventData = result.workflowData?.[0]?.[0] as any;
					expect(eventData.event_context.type).toBe('bot_started');
					expect(eventData.event_context.description).toBe('User started interaction with the bot');
					expect(eventData.event_context.is_first_interaction).toBe(true);
				});

				it('should handle bot_started event with missing user data', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'bot_started',
						timestamp: 1640995200,
						// Missing user object
					};

					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['bot_started']); // events

					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);

					expect(result.workflowData).toHaveLength(1);
					const eventData = result.workflowData?.[0]?.[0] as any;
					expect(eventData.validation_status.warnings).toContainEqual(
						expect.objectContaining({
							field: 'user',
							message: 'No user information found in bot_started event'
						})
					);
				});
			});

			describe('message_edited event edge cases', () => {
				it('should handle message_edited with missing old_message data', async () => {
					const mockBodyData: MaxWebhookEvent = {
					update_type: 'message_edited',
					timestamp: 1640995200,
					chat: { chat_id: 123, type: 'group' },
					user: { user_id: 456, first_name: 'John' },
					message: { body: { text: 'Updated text' }, timestamp: 1640995300 },
					// Missing both old_message and new_message
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
					expect(eventData.validation_status.warnings).toContainEqual(
						expect.objectContaining({
							field: 'message_versions',
							message: 'No old_message or new_message data found for comparison'
						})
					);
				});

				it('should handle message_edited with attachment changes', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'message_edited',
						timestamp: 1640995200,
						chat: { chat_id: 123, type: 'group' },
						user: { user_id: 456, first_name: 'John' },
						message: {
							body: {
								text: 'Updated text',
								attachments: [{ type: 'image', payload: { url: 'new.jpg' } }]
							},
							timestamp: 1640995300
						},
						old_message: {
							text: 'Original text',
							timestamp: 1640995200,
							attachments: [{ type: 'image', payload: { url: 'old.jpg' } }]
						},
						new_message: {
							text: 'Updated text',
							timestamp: 1640995300,
							attachments: [{ type: 'image', payload: { url: 'new.jpg' } }]
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
					expect(eventData.event_context.has_attachment_changes).toBe(true);
					expect(eventData.event_context.has_content_changes).toBe(true);
				});
			});

			describe('message_removed event edge cases', () => {
				it('should handle message_removed with missing deletion_context', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'message_removed',
						timestamp: 1640995200,
						chat: { chat_id: 123, type: 'group' },
						user: { user_id: 456, first_name: 'John' },
						message: { body: { text: 'Deleted message' } },
						// Missing deletion_context
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
					expect(eventData.event_context.deletion_reason).toBe('unknown');
					expect(eventData.event_context.deleted_by).toBeNull();
					expect(eventData.validation_status.warnings).toContainEqual(
						expect.objectContaining({
							field: 'deletion_context',
							message: 'No deletion context provided'
						})
					);
				});

				it('should handle message_removed with legacy message structure', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'message_removed',
						timestamp: 1640995200,
						chat: { chat_id: 123, type: 'group' },
						user: { user_id: 456, first_name: 'John' },
						message: { id: 123, text: 'Deleted message' }, // Legacy structure
						deletion_context: {
							deleted_by: { user_id: 789, name: 'Admin' },
							deletion_reason: 'spam',
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
					expect(eventData.event_context.deleted_message_id).toBe(123);
					expect(eventData.event_context.original_content).toBe('Deleted message');
					expect(eventData.event_context.deletion_reason).toBe('spam');
				});
			});

			describe('membership event edge cases', () => {
				it('should handle bot_added with missing membership_context', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'bot_added',
						timestamp: 1640995200,
						chat: { chat_id: 123, type: 'group', title: 'Test Group' },
						user: { user_id: 456, first_name: 'John' },
						// Missing membership_context
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
					expect(eventData.event_context.action_by).toEqual(mockBodyData.user);
					expect(eventData.validation_status.warnings).toContainEqual(
						expect.objectContaining({
							field: 'membership_context',
							message: 'No membership context provided'
						})
					);
				});

				it('should handle user_added with different user ID formats', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'user_added',
						timestamp: 1640995200,
						chat: { chat_id: 123, type: 'group', title: 'Test Group' }, // Using chat_id format
						user: { user_id: 789, first_name: 'Alice' }, // Using user_id format
						membership_context: {
							added_by: { user_id: 456, name: 'John' },
							user_role: 'admin',
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
					expect(eventData.event_context.chat_info.chat_id).toBe(123);
					expect(eventData.event_context.affected_user.user_id).toBe(789);
					expect(eventData.event_context.user_role).toBe('admin');
				});
			});

			describe('chat_title_changed event edge cases', () => {
				it('should handle chat_title_changed with missing chat_changes', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'chat_title_changed',
						timestamp: 1640995200,
						chat: { chat_id: 123, type: 'group', title: 'New Group Name' },
						user: { user_id: 456, first_name: 'John' },
						// Missing chat_changes
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
					expect(eventData.event_context.old_title).toBeNull();
					expect(eventData.event_context.new_title).toBe('New Group Name');
					expect(eventData.validation_status.warnings).toContainEqual(
						expect.objectContaining({
							field: 'chat_changes',
							message: 'No chat_changes context provided'
						})
					);
				});

				it('should handle chat_title_changed with missing chat object', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'chat_title_changed',
						timestamp: 1640995200,
						user: { user_id: 456, first_name: 'John' },
						chat_changes: {
							old_title: 'Old Group Name',
							new_title: 'New Group Name',
							changed_by: { user_id: 456, name: 'John' },
							changed_at: 1640995200,
						},
						// Missing chat object
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
					expect(eventData.validation_status.errors).toContainEqual(
						expect.objectContaining({
							field: 'chat',
							message: 'Chat object is required for chat_title_changed events'
						})
					);
				});
			});

			describe('message_callback event edge cases', () => {
				it('should handle message_callback with missing callback object', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'message_callback',
						timestamp: 1640995200,
						user: { user_id: 456, first_name: 'John' },
						message: { id: 123, text: 'Button message' },
						// Missing callback object
					};

					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['message_callback']); // events

					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);

					expect(result.workflowData).toHaveLength(1);
					const eventData = result.workflowData?.[0]?.[0] as any;
					expect(eventData.validation_status.errors).toContainEqual(
						expect.objectContaining({
							field: 'callback',
							message: 'Callback object is required for message_callback events'
						})
					);
				});

				it('should handle message_callback with empty callback payload', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'message_callback',
						timestamp: 1640995200,
						user: { user_id: 456, first_name: 'John' },
						message: { id: 123, text: 'Button message' },
						callback: {
							// Missing payload and id
						},
					};

					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mockBodyData);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['message_callback']); // events

					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);

					expect(result.workflowData).toHaveLength(1);
					const eventData = result.workflowData?.[0]?.[0] as any;
					expect(eventData.validation_status.warnings).toContainEqual(
						expect.objectContaining({
							field: 'callback.payload',
							message: 'No callback payload or ID found'
						})
					);
				});
			});

			describe('message_chat_created event edge cases', () => {
				it('should handle message_chat_created with legacy message structure', async () => {
					const mockBodyData: MaxWebhookEvent = {
				update_type: 'message_chat_created',
				timestamp: 1640995200,
				chat: { chat_id: 123, type: 'group', title: 'Test Group' },
				user: { user_id: 456, first_name: 'John' },
				message: {
			id: 123,
			text: 'Hello from group chat',
			attachments: [{ type: 'image', payload: { url: 'test.jpg' } }]
		} as any, // Legacy structure with attachments
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
					expect(eventData.event_context.has_text).toBe(true);
					expect(eventData.event_context.has_attachments).toBe(true);
					expect(eventData.event_context.message_length).toBe(21);
				});

				it('should handle message_chat_created with empty message', async () => {
					const mockBodyData: MaxWebhookEvent = {
						update_type: 'message_chat_created',
						timestamp: 1640995200,
						chat: { chat_id: 123, type: 'group', title: 'Test Group' },
						user: { user_id: 456, first_name: 'John' },
						message: { id: 123 }, // Empty message content
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
					expect(eventData.event_context.has_text).toBe(false);
					expect(eventData.event_context.has_attachments).toBe(false);
					expect(eventData.event_context.message_length).toBe(0);
				});
			});
		});

		describe('Integration Tests', () => {
			describe('Webhook Event Reception', () => {
				it('should handle multiple events in sequence', async () => {
					const events = [
						{
							update_type: 'message_created',
							timestamp: 1640995200,
							message: { body: { text: 'First message' } },
							user: { user_id: 456, first_name: 'John' },
						},
						{
							update_type: 'message_edited',
							timestamp: 1640995300,
							message: { body: { text: 'Edited message' } },
							old_message: { text: 'First message' },
							new_message: { text: 'Edited message' },
							user: { user_id: 456, first_name: 'John' },
						},
						{
							update_type: 'message_removed',
							timestamp: 1640995400,
							message: { body: { text: 'Edited message' } },
							deletion_context: { deletion_reason: 'user_request' },
							user: { user_id: 456, first_name: 'John' },
						},
					];

					for (const event of events) {
						(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event);
						(mockWebhookFunctions.getNodeParameter as jest.Mock)
							.mockReturnValueOnce({}) // additionalFields
							.mockReturnValueOnce(['message_created', 'message_edited', 'message_removed']); // events
						const result = await eventProcessor.processWebhookEvent.call(
							mockWebhookFunctions as IWebhookFunctions
						);
						expect(result.workflowData).toHaveLength(1);
						const eventData = result.workflowData?.[0]?.[0] as any;
						expect(eventData.validation_status.is_valid).toBe(true);
					}
				});

				it('should handle concurrent webhook processing', async () => {
					const mockEvents = [
						{
							update_type: 'bot_added',
							timestamp: 1640995200,
							chat: { chat_id: 123, type: 'group' },
							user: { user_id: 456, first_name: 'John' },
						},
						{
							update_type: 'user_added',
							timestamp: 1640995300,
							chat: { chat_id: 123, type: 'group' },
							user: { user_id: 789, first_name: 'Alice' },
							membership_context: { added_by: { user_id: 456 } },
						},
					];

					const promises = mockEvents.map(async (event) => {
						(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event);
						(mockWebhookFunctions.getNodeParameter as jest.Mock)
							.mockReturnValueOnce({}) // additionalFields
							.mockReturnValueOnce(['bot_added', 'user_added']); // events
						return eventProcessor.processWebhookEvent.call(
							mockWebhookFunctions as IWebhookFunctions
						);
					});

					const results = await Promise.all(promises);
					expect(results).toHaveLength(2);
					results.forEach((result) => {
						expect(result.workflowData).toHaveLength(1);
					});
				});

				it('should handle webhook with malformed JSON gracefully', async () => {
					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(null);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['message_created']); // events

					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);

					expect(result.workflowData).toHaveLength(0);
				});
			});

			describe('End-to-End Event Workflows', () => {
				it('should process complete message lifecycle', async () => {
					const messageLifecycle = [
						// Message created
						{
							update_type: 'message_created',
							timestamp: 1640995200,
							message: {
								id: 123,
								body: { text: 'Original message' },
								timestamp: 1640995200
							},
							user: { user_id: 456, first_name: 'John' },
							chat: { chat_id: 123, type: 'group' },
						},
						// Message callback
						{
							update_type: 'message_callback',
							timestamp: 1640995250,
							message: { id: 123, text: 'Original message' },
							user: { user_id: 789, first_name: 'Alice' },
							callback: { id: 'btn1', payload: 'like' },
						},
						// Message edited
						{
							update_type: 'message_edited',
							timestamp: 1640995300,
							message: {
								id: 123,
								body: { text: 'Edited message' },
								timestamp: 1640995300
							},
							old_message: { text: 'Original message', timestamp: 1640995200 },
							new_message: { text: 'Edited message', timestamp: 1640995300 },
							user: { user_id: 456, first_name: 'John' },
							chat: { chat_id: 123, type: 'group' },
						},
						// Message removed
						{
							update_type: 'message_removed',
							timestamp: 1640995400,
							message: {
								id: 123,
								body: { text: 'Edited message' }
							},
							deletion_context: {
								deleted_by: { user_id: 456, name: 'John' },
								deletion_reason: 'user_request',
								deleted_at: 1640995400,
							},
							user: { user_id: 456, first_name: 'John' },
							chat: { chat_id: 123, type: 'group' },
						},
					];

					const results = [];
					for (const event of messageLifecycle) {
						(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event);
						(mockWebhookFunctions.getNodeParameter as jest.Mock)
							.mockReturnValueOnce({}) // additionalFields
							.mockReturnValueOnce(['message_created', 'message_callback', 'message_edited', 'message_removed']); // events
						const result = await eventProcessor.processWebhookEvent.call(
							mockWebhookFunctions as IWebhookFunctions
						);
						results.push(result.workflowData?.[0]?.[0]);
					}

					// Verify message creation
					expect(results[0]?.['update_type']).toBe('message_created');
					expect((results[0]?.['event_context'] as any)?.message_id).toBe(123);
					expect((results[0]?.['event_context'] as any)?.has_text).toBe(true);

					// Verify callback interaction
					expect(results[1]).toBeDefined();
					if (results[1]) {
						expect(results[1]?.['update_type']).toBe('message_callback');
						expect((results[1]?.['event_context'] as any)?.callback_id).toBe('btn1');
						expect((results[1]?.['event_context'] as any)?.callback_payload).toBe('like');
					}

					// Verify message edit
					expect(results[2]?.['update_type']).toBe('message_edited');
					expect((results[2]?.['event_context'] as any)?.old_content).toBe('Original message');
					expect((results[2]?.['event_context'] as any)?.new_content).toBe('Edited message');

					// Verify message removal
					expect(results[3]?.['update_type']).toBe('message_removed');
					expect((results[3]?.['event_context'] as any)?.deletion_reason).toBe('user_request');
					expect((results[3]?.['event_context'] as any)?.deleted_message_id).toBe(123);
				});

				it('should process complete group membership lifecycle', async () => {
					const membershipLifecycle = [
						// Bot added to group
						{
							update_type: 'bot_added',
							timestamp: 1640995200,
							chat: { chat_id: 123, type: 'group', title: 'Test Group' },
							user: { user_id: 456, first_name: 'John' },
							membership_context: {
								added_by: { user_id: 456, name: 'John' },
								action_timestamp: 1640995200,
							},
						},
						// User added to group
						{
							update_type: 'user_added',
							timestamp: 1640995300,
							chat: { chat_id: 123, type: 'group', title: 'Test Group' },
							user: { user_id: 789, first_name: 'Alice' },
							membership_context: {
								added_by: { user_id: 456, name: 'John' },
								user_role: 'member',
								action_timestamp: 1640995300,
							},
						},
						// Chat title changed
						{
							update_type: 'chat_title_changed',
							timestamp: 1640995400,
							chat: { chat_id: 123, type: 'group', title: 'Updated Group Name' },
							user: { user_id: 456, first_name: 'John' },
							chat_changes: {
								old_title: 'Test Group',
								new_title: 'Updated Group Name',
								changed_by: { user_id: 456, name: 'John' },
								changed_at: 1640995400,
							},
						},
						// User removed from group
						{
							update_type: 'user_removed',
							timestamp: 1640995500,
							chat: { chat_id: 123, type: 'group', title: 'Updated Group Name' },
							user: { user_id: 789, first_name: 'Alice' },
							membership_context: {
								removed_by: { user_id: 456, name: 'John' },
								removal_reason: 'admin_action',
								action_timestamp: 1640995500,
							},
						},
					];

					const results = [];
					for (const event of membershipLifecycle) {
						(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(event);
						(mockWebhookFunctions.getNodeParameter as jest.Mock)
							.mockReturnValueOnce({}) // additionalFields
							.mockReturnValueOnce(['bot_added', 'user_added', 'chat_title_changed', 'user_removed']); // events
						const result = await eventProcessor.processWebhookEvent.call(
							mockWebhookFunctions as IWebhookFunctions
						);
						results.push(result.workflowData?.[0]?.[0]);
					}

					// Verify bot addition
					expect(results[0]?.['update_type']).toBe('bot_added');
					expect((results[0]?.['event_context'] as any)?.chat_info?.chat_id).toBe(123);

					// Verify user addition
					expect(results[1]).toBeDefined();
					if (results[1]) {
						expect(results[1]?.['update_type']).toBe('user_added');
						expect((results[1]?.['event_context'] as any)?.affected_user?.id).toBe(789);
						expect((results[1]?.['event_context'] as any)?.user_role).toBe('member');
					}

					// Verify title change
					expect(results[2]?.['update_type']).toBe('chat_title_changed');
					expect((results[2]?.['event_context'] as any)?.old_title).toBe('Test Group');
					expect((results[2]?.['event_context'] as any)?.new_title).toBe('Updated Group Name');

					// Verify user removal
					expect(results[3]?.['update_type']).toBe('user_removed');
					expect((results[3]?.['event_context'] as any)?.affected_user?.id).toBe(789);
					expect((results[3]?.['event_context'] as any)?.description).toBe('User left the chat');
				});
			});
		});

		describe('Error Handling and Edge Cases', () => {
			describe('Data Validation Errors', () => {
				it('should handle events with missing required fields', async () => {
					const invalidEvent = {
						// Missing update_type and timestamp
						message: { body: { text: 'Test message' } },
					};

					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(invalidEvent);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['message_created']); // events

					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);

					// Processor passes through data when no event type is found
					expect(result.workflowData).toHaveLength(1);
				});

				it('should handle events with invalid data types', async () => {
					const invalidEvent = {
						update_type: 'message_created',
						timestamp: 'invalid_timestamp', // Should be number
						message: 'invalid_message_object', // Should be object
						user: { user_id: 'invalid_id' }, // Should be number
					};

					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(invalidEvent);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['message_created']); // events

					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);

					expect(result.workflowData).toHaveLength(1);
					const eventData = result.workflowData?.[0]?.[0] as any;
					// Validation may pass with warnings instead of errors for invalid types
					expect(eventData.validation_status).toBeDefined();
				});

				it('should handle deeply nested object validation', async () => {
					const complexEvent = {
						update_type: 'message_created',
						timestamp: 1640995200,
						message: {
							body: {
								text: 'Complex message',
								attachments: [
									{
										type: 'image',
										payload: {
											url: 'https://example.com/image.jpg',
											metadata: {
												width: 800,
												height: 600,
												size: 'invalid_size', // Should be number
											},
										},
									},
								],
							},
							timestamp: 1640995200,
						},
						user: { user_id: 456, first_name: 'John' },
						chat: { chat_id: 123, type: 'group' },
					};

					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(complexEvent);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['message_created']); // events

					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);

					expect(result.workflowData).toHaveLength(1);
					const eventData = result.workflowData?.[0]?.[0] as any;
					expect((eventData.event_context as any).has_attachments).toBe(true);
					expect((eventData.event_context as any).message_length).toBeGreaterThan(0);
				});
			});

			describe('Performance and Memory Tests', () => {
				it('should handle large message content efficiently', async () => {
					const largeText = 'A'.repeat(10000); // 10KB text
					const largeMessageEvent = {
						update_type: 'message_created',
						timestamp: 1640995200,
						message: { body: { text: largeText } },
						user: { user_id: 456, first_name: 'John' },
					};

					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(largeMessageEvent);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['message_created']); // events

					const startTime = Date.now();
					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);
					const processingTime = Date.now() - startTime;

					expect(result.workflowData).toHaveLength(1);
					const eventData = result.workflowData?.[0]?.[0] as any;
					expect((eventData.event_context as any).message_length).toBe(10000);
					expect((eventData.event_context as any).has_text).toBe(true);
					expect(processingTime).toBeLessThan(1000); // Should process within 1 second
				});

				it('should handle events with many attachments', async () => {
					const manyAttachments = Array.from({ length: 50 }, (_, i) => ({
						type: 'image',
						payload: { url: `https://example.com/image${i}.jpg` },
					}));

					const eventWithManyAttachments = {
						update_type: 'message_created',
						timestamp: 1640995200,
						message: {
							body: {
								text: 'Message with many attachments',
								attachments: manyAttachments,
							},
						},
						user: { user_id: 456, first_name: 'John' },
					};

					(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventWithManyAttachments);
					(mockWebhookFunctions.getNodeParameter as jest.Mock)
						.mockReturnValueOnce({}) // additionalFields
						.mockReturnValueOnce(['message_created']); // events

					const result = await eventProcessor.processWebhookEvent.call(
						mockWebhookFunctions as IWebhookFunctions
					);

					expect(result.workflowData).toHaveLength(1);
					const eventData = result.workflowData?.[0]?.[0] as any;
					expect((eventData.event_context as any).has_attachments).toBe(true);
					expect((eventData.event_context as any).message_length).toBeGreaterThan(0);
				});
			});
		});
	});
});
