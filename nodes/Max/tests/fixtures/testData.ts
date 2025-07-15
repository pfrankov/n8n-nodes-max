/**
 * Test data fixtures for Max messenger node tests
 */

export const TEST_CREDENTIALS = {
	accessToken: 'test-bot-token-12345',
	baseUrl: 'https://botapi.max.ru'
};

export const TEST_USER_ID = '123456789';
export const TEST_CHAT_ID = '987654321';
export const TEST_MESSAGE_ID = '555666777';

export const SAMPLE_MESSAGES = {
	simple: 'Hello, this is a test message!',
	withEmoji: 'Hello! 👋 This is a test with emojis 🎉',
	longMessage: 'A'.repeat(3000), // Long but valid message
	tooLongMessage: 'A'.repeat(4001), // Exceeds Max limit
	htmlFormatted: '<b>Bold text</b> and <i>italic text</i>',
	markdownFormatted: '**Bold text** and *italic text*',
	invalidHtml: '<script>alert("test")</script>',
	empty: '',
	withLinks: 'Check out this link: https://example.com',
};

export const SAMPLE_ATTACHMENTS = {
	image: {
		type: 'image',
		payload: {
			token: 'image-token-123',
			url: 'https://example.com/image.jpg'
		}
	},
	video: {
		type: 'video',
		payload: {
			token: 'video-token-456',
			url: 'https://example.com/video.mp4'
		}
	},
	audio: {
		type: 'audio',
		payload: {
			token: 'audio-token-789',
			url: 'https://example.com/audio.mp3'
		}
	},
	document: {
		type: 'file',
		payload: {
			token: 'file-token-101',
			url: 'https://example.com/document.pdf'
		}
	}
};

export const SAMPLE_KEYBOARDS = {
	simple: {
		type: 'inline_keyboard',
		payload: {
			buttons: [
				[
					{
						text: 'Button 1',
						type: 'callback',
						payload: 'btn1_clicked'
					}
				]
			]
		}
	},
	complex: {
		type: 'inline_keyboard',
		payload: {
			buttons: [
				[
					{
						text: 'Yes',
						type: 'callback',
						payload: 'yes',
						intent: 'positive'
					},
					{
						text: 'No',
						type: 'callback',
						payload: 'no',
						intent: 'negative'
					}
				],
				[
					{
						text: 'Visit Website',
						type: 'link',
						url: 'https://example.com'
					}
				],
				[
					{
						text: 'Share Contact',
						type: 'request_contact'
					},
					{
						text: 'Share Location',
						type: 'request_geo_location'
					}
				]
			]
		}
	}
};

export const SAMPLE_API_RESPONSES = {
	sendMessageSuccess: {
		message_id: TEST_MESSAGE_ID,
		text: SAMPLE_MESSAGES.simple,
		user_id: parseInt(TEST_USER_ID),
		timestamp: Date.now()
	},
	sendMessageToChat: {
		message_id: TEST_MESSAGE_ID,
		text: SAMPLE_MESSAGES.simple,
		chat_id: parseInt(TEST_CHAT_ID),
		timestamp: Date.now()
	},
	editMessageSuccess: {
		message_id: TEST_MESSAGE_ID,
		text: 'Updated message text',
		user_id: parseInt(TEST_USER_ID),
		timestamp: Date.now()
	},
	deleteMessageSuccess: {
		message_id: TEST_MESSAGE_ID,
		deleted: true
	},
	getChatInfoSuccess: {
		chat_id: parseInt(TEST_CHAT_ID),
		title: 'Test Chat',
		type: 'group',
		members_count: 5,
		description: 'A test chat for integration testing'
	},
	leaveChatSuccess: {
		chat_id: parseInt(TEST_CHAT_ID),
		left: true
	},
	uploadSuccess: {
		url: 'https://upload.max.ru/upload/12345',
		token: 'upload-token-12345'
	},
	callbackQuerySuccess: {
		callback_query_id: 'callback-123',
		answered: true
	}
};

export const SAMPLE_API_ERRORS = {
	unauthorized: {
		error_code: 401,
		description: 'Unauthorized'
	},
	rateLimited: {
		error_code: 429,
		description: 'Too Many Requests',
		parameters: {
			retry_after: 60
		}
	},
	chatNotFound: {
		error_code: 404,
		description: 'Chat not found'
	},
	messageNotFound: {
		error_code: 404,
		description: 'Message not found'
	},
	invalidParameter: {
		error_code: 400,
		description: 'Bad Request: invalid parameter'
	},
	networkError: {
		code: 'ECONNREFUSED',
		message: 'Connection refused'
	}
};

export const SAMPLE_WEBHOOK_EVENTS = {
	messageCreated: {
		event_type: 'message_created',
		timestamp: Date.now(),
		chat: {
			chat_id: parseInt(TEST_CHAT_ID),
			title: 'Test Chat',
			type: 'group'
		},
		user: {
			user_id: parseInt(TEST_USER_ID),
			first_name: 'Test',
			last_name: 'User',
			username: 'testuser'
		},
		message: {
			message_id: TEST_MESSAGE_ID,
			text: SAMPLE_MESSAGES.simple,
			timestamp: Date.now()
		}
	},
	botStarted: {
		event_type: 'bot_started',
		timestamp: Date.now(),
		user: {
			user_id: parseInt(TEST_USER_ID),
			first_name: 'Test',
			last_name: 'User',
			username: 'testuser'
		}
	},
	messageCallback: {
		event_type: 'message_callback',
		timestamp: Date.now(),
		chat: {
			chat_id: parseInt(TEST_CHAT_ID),
			title: 'Test Chat',
			type: 'group'
		},
		user: {
			user_id: parseInt(TEST_USER_ID),
			first_name: 'Test',
			last_name: 'User',
			username: 'testuser'
		},
		callback: {
			callback_query_id: 'callback-123',
			payload: 'btn1_clicked',
			message_id: TEST_MESSAGE_ID
		}
	}
};

export const WORKFLOW_TEST_DATA = {
	sendMessageWorkflow: {
		nodes: [
			{
				name: 'Max',
				type: 'max',
				parameters: {
					resource: 'message',
					operation: 'sendMessage',
					sendTo: 'user',
					text: SAMPLE_MESSAGES.simple,
					format: 'plain',
					userId: TEST_USER_ID
				}
			}
		]
	},
	sendMessageWithAttachmentWorkflow: {
		nodes: [
			{
				name: 'Max',
				type: 'max',
				parameters: {
					resource: 'message',
					operation: 'sendMessage',
					sendTo: 'user',
					text: SAMPLE_MESSAGES.simple,
					format: 'plain',
					userId: TEST_USER_ID,
					additionalFields: {
						attachments: [SAMPLE_ATTACHMENTS.image]
					}
				}
			}
		]
	},
	sendMessageWithKeyboardWorkflow: {
		nodes: [
			{
				name: 'Max',
				type: 'max',
				parameters: {
					resource: 'message',
					operation: 'sendMessage',
					sendTo: 'user',
					text: SAMPLE_MESSAGES.simple,
					format: 'plain',
					userId: TEST_USER_ID,
					additionalFields: {
						keyboard: SAMPLE_KEYBOARDS.simple
					}
				}
			}
		]
	}
};

export function createMockExecuteFunctions(parameters: IDataObject = {}) {
	return {
		getInputData: jest.fn().mockReturnValue([{ json: {} }]),
		getNodeParameter: jest.fn().mockImplementation((paramName: string) => {
			return parameters[paramName];
		}),
		getCredentials: jest.fn().mockResolvedValue(TEST_CREDENTIALS),
		getNode: jest.fn().mockReturnValue({ name: 'Max', type: 'max' }),
		continueOnFail: jest.fn().mockReturnValue(false),
		helpers: {
			prepareBinaryData: jest.fn(),
			getBinaryDataBuffer: jest.fn()
		}
	};
}

export function createMockWebhookFunctions(body: IDataObject = {}) {
	return {
		getBodyData: jest.fn().mockReturnValue(body),
		getHeaderData: jest.fn().mockReturnValue({}),
		getNodeParameter: jest.fn(),
		getCredentials: jest.fn().mockResolvedValue(TEST_CREDENTIALS),
		getNode: jest.fn().mockReturnValue({ name: 'Max Trigger', type: 'maxTrigger' })
	};
}