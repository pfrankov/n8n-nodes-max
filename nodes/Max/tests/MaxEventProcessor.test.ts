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
			expect(eventData.event_type).toBe('message_created');
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
			const eventData = result.workflowData?.[0]?.[0] as any;
			expect(eventData.event_type).toBe('message_created');
			expect(eventData.update_type).toBe('message_created');
			expect(eventData.event_id).toBeDefined();
			expect(eventData.validation_status).toBeDefined();
			expect(eventData.metadata).toBeDefined();
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
				chat: { chat_id: 123 },
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
			it('should return normalized data for unsupported event types', () => {
				const mockBodyData: MaxWebhookEvent = {
					update_type: 'unknown_event',
					timestamp: 1640995200,
				};

				const result = eventProcessor.processEventSpecificData(mockBodyData, 'unknown_event');

				expect(result.event_type).toBe('unknown_event');
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
					user: { id: 456, first_name: 'John' },
				};

				const result = eventProcessor.processEventSpecificData(mockBodyData, 'message_created');

				expect(result.event_type).toBe('message_created');
				expect(result.update_type).toBe('message_created');
				expect(result.timestamp).toBe(1640995200);
				expect(result.event_id).toBeDefined();
				expect(result.event_context.type).toBe('message_created');
				expect(result.event_context.description).toBe('New message received in direct conversation');
				expect(result.event_context['has_text']).toBe(true);
				expect(result.event_context['message_length']).toBe(5);
				expect(result.validation_status.is_valid).toBe(true);
				expect(result.metadata.user_context?.user_id).toBe(456);
			});
		});
	});
});