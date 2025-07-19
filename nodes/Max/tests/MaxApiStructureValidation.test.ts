/**
 * Test suite to validate that the Max node implementation correctly handles
 * the official Max API data structure as documented in the design.md file
 */

import { MaxEventProcessor } from '../MaxEventProcessor';
import type { IWebhookFunctions, IDataObject } from 'n8n-workflow';
import type { MaxWebhookEvent } from '../MaxTriggerConfig';

describe('Max API Structure Validation', () => {
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

	describe('Official Max API Message Structure', () => {
		it('should correctly process message_created with official API structure', async () => {
			// This is the official Max API structure as documented in design.md
			const officialApiEvent: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 456,
						first_name: 'John',
						last_name: 'Doe',
						username: 'johndoe',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 123,
						chat_type: 'chat',
						user_id: 456
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Hello from official API structure!',
						attachments: [{
							type: 'image',
							payload: {
								photo_id: 12345,
								token: 'image-token-123',
								url: 'https://example.com/image.jpg'
							}
						}],
						markup: [{
							type: 'strong',
							from: 0,
							length: 5
						}]
					},
					stat: {
						views: 0
					},
					url: 'https://max.ru/messages/msg_123'
				},
				user_locale: 'en'
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(officialApiEvent);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			// Verify the event is processed correctly
			expect(eventData.update_type).toBe('message_created');
			expect(eventData.timestamp).toBe(1640995200000);
			expect(eventData.validation_status.is_valid).toBe(true);

			// Verify message content is extracted from official structure
			expect(eventData.event_context.has_text).toBe(true);
			expect(eventData.event_context.has_attachments).toBe(true);
			expect(eventData.event_context.message_length).toBe(34); // Length of "Hello from official API structure!"
			expect(eventData.event_context.message_id).toBe('msg_123');

			// Verify metadata extraction from official structure
			expect(eventData.metadata.user_context.user_id).toBe(456);
			expect(eventData.metadata.user_context.username).toBe('johndoe');
			expect(eventData.metadata.user_context.display_name).toBe('John');
			expect(eventData.metadata.user_context.locale).toBe('en');

			expect(eventData.metadata.chat_context.chat_id).toBe(123);
			expect(eventData.metadata.chat_context.chat_type).toBe('chat');
		});

		it('should correctly process message_chat_created with official API structure', async () => {
			const officialApiEvent: MaxWebhookEvent = {
				update_type: 'message_chat_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 789,
						first_name: 'Alice',
						username: 'alice',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 456,
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_456',
						seq: 2,
						text: 'Group chat message',
						attachments: []
					},
					stat: {
						views: 1
					}
				},
				user_locale: 'ru'
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(officialApiEvent);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_chat_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			expect(result.workflowData).toHaveLength(1);
			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.type).toBe('message_chat_created');
			expect(eventData.event_context.chat_type).toBe('chat');
			expect(eventData.event_context.message_id).toBe('msg_456');
			expect(eventData.metadata.user_context.locale).toBe('ru');
		});

		it('should prioritize official API structure over legacy format', async () => {
			// Event with both official and legacy structures - official should take precedence
			const mixedStructureEvent: MaxWebhookEvent = {
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
					// Official API structure
					body: {
						mid: 'official_msg_id',
						seq: 1,
						text: 'Official API text',
						attachments: [{
							type: 'image',
							payload: { token: 'official-token' }
						}]
					},
					// Legacy structure (should be ignored when official is present)
					text: 'Legacy text',
					id: 'legacy_msg_id',
					attachments: [{
						type: 'file',
						payload: { token: 'legacy-token' }
					}]
				} as any,
				user_locale: 'en'
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(mixedStructureEvent);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;

			// Should use official API structure values, not legacy ones
			expect(eventData.event_context.message_id).toBe('official_msg_id'); // Not 'legacy_msg_id'
			expect(eventData.event_context.has_text).toBe(true);
			expect(eventData.event_context.message_length).toBe(17); // Length of "Official API text", not "Legacy text"
			expect(eventData.event_context.has_attachments).toBe(true);
		});

		it('should handle message with link (forwarded message) structure', async () => {
			const messageWithLinkEvent: MaxWebhookEvent = {
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
					link: {
						type: 'forward',
						sender: {
							user_id: 789,
							first_name: 'Alice',
							username: 'alice',
							is_bot: false,
							last_activity_time: 1640995100000
						},
						chat_id: 456,
						message: {
							mid: 'forwarded_msg_123',
							seq: 1,
							text: 'This is a forwarded message',
							attachments: [],
							markup: []
						}
					},
					body: {
						mid: 'msg_789',
						seq: 1,
						text: 'Check this forwarded message',
						attachments: []
					}
				},
				user_locale: 'en'
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(messageWithLinkEvent);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.validation_status.is_valid).toBe(true);
			expect(eventData.event_context.message_id).toBe('msg_789');
			expect(eventData.event_context.has_text).toBe(true);

			// Verify the original message structure is preserved
			expect(eventData.message.link).toBeDefined();
			expect(eventData.message.link.type).toBe('forward');
			expect(eventData.message.link.message.text).toBe('This is a forwarded message');
		});
	});

	describe('Chat and User Context Extraction', () => {
		it('should extract chat context from message.recipient (official structure)', async () => {
			const eventWithChatContext: MaxWebhookEvent = {
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
						chat_id: 789,
						chat_type: 'chat',
						user_id: 456
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_123',
						seq: 1,
						text: 'Test message'
					}
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventWithChatContext);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.metadata.chat_context.chat_id).toBe(789);
			expect(eventData.metadata.chat_context.chat_type).toBe('chat');
		});

		it('should extract user context from message.sender (official structure)', async () => {
			const eventWithUserContext: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 123,
						first_name: 'Alice',
						last_name: 'Smith',
						username: 'alicesmith',
						is_bot: false,
						last_activity_time: 1640995200000
					},
					recipient: {
						chat_id: 456,
						chat_type: 'chat'
					},
					timestamp: 1640995200000,
					body: {
						mid: 'msg_456',
						seq: 1,
						text: 'Hello world'
					}
				},
				user_locale: 'fr'
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventWithUserContext);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.metadata.user_context.user_id).toBe(123);
			expect(eventData.metadata.user_context.username).toBe('alicesmith');
			expect(eventData.metadata.user_context.display_name).toBe('Alice');
			expect(eventData.metadata.user_context.locale).toBe('fr');
		});
	});

	describe('Attachment Structure Validation', () => {
		it('should correctly process attachments in official API structure', async () => {
			const eventWithAttachments: MaxWebhookEvent = {
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
						text: 'Message with attachments',
						attachments: [
							{
								type: 'image',
								payload: {
									photo_id: 12345,
									token: 'img-token-123',
									url: 'https://example.com/image.jpg'
								}
							},
							{
								type: 'video',
								payload: {
									token: 'vid-token-456',
									url: 'https://example.com/video.mp4'
								}
							}
						]
					}
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventWithAttachments);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.event_context.has_attachments).toBe(true);
			expect(eventData.validation_status.is_valid).toBe(true);

			// Verify original attachment structure is preserved
			expect(eventData.message.body.attachments).toHaveLength(2);
			expect(eventData.message.body.attachments[0].type).toBe('image');
			expect(eventData.message.body.attachments[0].payload.photo_id).toBe(12345);
			expect(eventData.message.body.attachments[1].type).toBe('video');
		});
	});

	describe('Markup Structure Validation', () => {
		it('should correctly preserve markup in official API structure', async () => {
			const eventWithMarkup: MaxWebhookEvent = {
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
						text: 'Bold text and italic text',
						markup: [
							{
								type: 'strong',
								from: 0,
								length: 4
							},
							{
								type: 'emphasis',
								from: 15,
								length: 6
							}
						]
					}
				}
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventWithMarkup);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce({}) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			const eventData = result.workflowData?.[0]?.[0] as any;

			expect(eventData.validation_status.is_valid).toBe(true);

			// Verify markup structure is preserved
			expect(eventData.message.body.markup).toHaveLength(2);
			expect(eventData.message.body.markup[0].type).toBe('strong');
			expect(eventData.message.body.markup[0].from).toBe(0);
			expect(eventData.message.body.markup[0].length).toBe(4);
			expect(eventData.message.body.markup[1].type).toBe('emphasis');
		});
	});

	describe('Filtering with Official API Structure', () => {
		it('should correctly filter by chat_id from message.recipient', async () => {
			const eventForFiltering: MaxWebhookEvent = {
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
						chat_id: 789, // This should be used for filtering
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

			const additionalFields: IDataObject = {
				chatIds: '123,789,456', // 789 is included
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventForFiltering);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			// Should pass filter since chat_id 789 is in the allowed list
			expect(result.workflowData).toHaveLength(1);
		});

		it('should correctly filter by user_id from message.sender', async () => {
			const eventForFiltering: MaxWebhookEvent = {
				update_type: 'message_created',
				timestamp: 1640995200000,
				message: {
					sender: {
						user_id: 456, // This should be used for filtering
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
						text: 'Test message'
					}
				}
			};

			const additionalFields: IDataObject = {
				userIds: '123,456,789', // 456 is included
			};

			(mockWebhookFunctions.getBodyData as jest.Mock).mockReturnValue(eventForFiltering);
			(mockWebhookFunctions.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(additionalFields) // additionalFields
				.mockReturnValueOnce(['message_created']); // events

			const result = await eventProcessor.processWebhookEvent.call(
				mockWebhookFunctions as IWebhookFunctions
			);

			// Should pass filter since user_id 456 is in the allowed list
			expect(result.workflowData).toHaveLength(1);
		});
	});
});
