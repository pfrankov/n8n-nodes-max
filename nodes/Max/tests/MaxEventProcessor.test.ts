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
});