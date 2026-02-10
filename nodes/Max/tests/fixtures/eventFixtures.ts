/**
 * Comprehensive test fixtures for all Max messenger event types
 * Provides realistic event payload structures for testing
 */

import type { MaxWebhookEvent } from '../../MaxTriggerConfig';

export const BASE_TIMESTAMP = 1640995200000;
export const TEST_USER_ID = 123456;
export const TEST_CHAT_ID = 789012;
export const TEST_MESSAGE_ID = 'msg_abc123';
export const TEST_CALLBACK_ID = 'cb_def456';

/**
 * Base user object for consistent testing
 */
export const BASE_USER = {
	user_id: TEST_USER_ID,
	first_name: 'John',
	last_name: 'Doe',
	username: 'john_doe',
	is_bot: false,
	last_activity_time: BASE_TIMESTAMP,
};

/**
 * Base chat object for consistent testing
 */
export const BASE_CHAT = {
	chat_id: TEST_CHAT_ID,
	type: 'group' as const,
	title: 'Test Group Chat',
	description: 'A test group chat for integration testing',
	members_count: 5,
};

/**
 * Base message object for consistent testing
 */
export const BASE_MESSAGE = {
	sender: BASE_USER,
	recipient: {
		chat_id: TEST_CHAT_ID,
		chat_type: 'group' as const,
	},
	timestamp: BASE_TIMESTAMP,
	body: {
		mid: TEST_MESSAGE_ID,
		seq: 1,
		text: 'Hello from Max messenger!',
		attachments: [] as Array<{ type: string; payload: any }>,
	},
	stat: {
		views: 0,
	},
	url: `https://max.ru/messages/${TEST_MESSAGE_ID}`,
};

/**
 * Complete event fixtures for all supported event types
 */
export const EVENT_FIXTURES: Record<string, MaxWebhookEvent> = {
	/**
	 * Message Created Event - Direct conversation
	 */
	message_created: {
		update_type: 'message_created',
		timestamp: BASE_TIMESTAMP,
		message: {
			...BASE_MESSAGE,
			recipient: {
				chat_id: TEST_CHAT_ID,
				chat_type: 'chat',
			},
		},
		user_locale: 'en',
	},

	/**
	 * Message Created Event - Group chat
	 */
	message_chat_created: {
		update_type: 'message_chat_created',
		timestamp: BASE_TIMESTAMP,
		message: {
			...BASE_MESSAGE,
			body: {
				...BASE_MESSAGE.body,
				text: 'Hello group chat!',
				attachments: [
					{
						type: 'image',
						payload: {
							token: 'img_token_123',
							url: 'https://example.com/image.jpg',
						},
					},
				],
			},
		},
		user_locale: 'en',
	},

	/**
	 * Message Edited Event
	 */
	message_edited: {
		update_type: 'message_edited',
		timestamp: BASE_TIMESTAMP + 60000, // 1 minute later
		chat: BASE_CHAT,
		user: BASE_USER,
		message: {
			...BASE_MESSAGE,
			body: {
				...BASE_MESSAGE.body,
				text: 'Updated message text',
				seq: 2,
			},
			timestamp: BASE_TIMESTAMP + 60000,
		},
		user_locale: 'en',
	},

	/**
	 * Message Removed Event
	 */
	message_removed: {
		update_type: 'message_removed',
		timestamp: BASE_TIMESTAMP + 120000, // 2 minutes later
		chat: BASE_CHAT,
		user: BASE_USER,
		message: {
			...BASE_MESSAGE,
			body: {
				...BASE_MESSAGE.body,
				text: 'This message will be deleted',
			},
		},
		user_locale: 'en',
	},

	/**
	 * Bot Started Event
	 */
	bot_started: {
		update_type: 'bot_started',
		timestamp: BASE_TIMESTAMP,
		user: {
			...BASE_USER,
			first_name: 'Alice',
			last_name: 'Smith',
			username: 'alice_smith',
		},
	},

	/**
	 * Bot Added to Chat Event
	 */
	bot_added: {
		update_type: 'bot_added',
		timestamp: BASE_TIMESTAMP,
		chat: BASE_CHAT,
		user: BASE_USER,
	},

	/**
	 * Bot Removed from Chat Event
	 */
	bot_removed: {
		update_type: 'bot_removed',
		timestamp: BASE_TIMESTAMP + 180000, // 3 minutes later
		chat: {
			...BASE_CHAT,
			members_count: 4, // One less member
		},
		user: BASE_USER,
	},

	/**
	 * User Added to Chat Event
	 */
	user_added: {
		update_type: 'user_added',
		timestamp: BASE_TIMESTAMP + 240000, // 4 minutes later
		chat: {
			...BASE_CHAT,
			members_count: 6, // One more member
		},
		user: {
			user_id: 555444,
			first_name: 'Bob',
			last_name: 'Wilson',
			username: 'bob_wilson',
			is_bot: false,
			last_activity_time: BASE_TIMESTAMP + 240000,
		},
		membership_context: {
			added_by: {
				user_id: TEST_USER_ID,
				name: 'John Doe',
				username: 'john_doe',
			},
			user_role: 'member',
			action_timestamp: BASE_TIMESTAMP + 240000,
		},
	},

	/**
	 * User Removed from Chat Event
	 */
	user_removed: {
		update_type: 'user_removed',
		timestamp: BASE_TIMESTAMP + 300000, // 5 minutes later
		chat: {
			...BASE_CHAT,
			members_count: 4, // One less member
		},
		user: {
			user_id: 333222,
			first_name: 'Charlie',
			last_name: 'Brown',
			username: 'charlie_brown',
			is_bot: false,
			last_activity_time: BASE_TIMESTAMP + 300000,
		},
	},

	/**
	 * Chat Title Changed Event
	 */
	chat_title_changed: {
		update_type: 'chat_title_changed',
		timestamp: BASE_TIMESTAMP + 360000, // 6 minutes later
		chat: {
			...BASE_CHAT,
			title: 'Updated Group Chat Title',
		},
		user: BASE_USER,
	},

	/**
	 * Message Callback Event (Button Click)
	 */
	message_callback: {
		update_type: 'message_callback',
		timestamp: BASE_TIMESTAMP + 420000, // 7 minutes later
		message: {
			...BASE_MESSAGE,
			body: {
				...BASE_MESSAGE.body,
				text: 'Please choose an option:',
				attachments: [
					{
						type: 'inline_keyboard',
						payload: {
							buttons: [
								[
									{
										text: 'Confirm',
										type: 'callback',
										payload: 'action_confirm',
										intent: 'positive',
									},
									{
										text: 'Cancel',
										type: 'callback',
										payload: 'action_cancel',
										intent: 'negative',
									},
								],
								[
									{
										text: 'More Info',
										type: 'link',
										url: 'https://example.com/info',
									},
								],
							],
						},
					},
				],
			},
		},
		callback: {
			callback_id: TEST_CALLBACK_ID,
			payload: 'action_confirm',
		},
		user_locale: 'en',
	},
};

/**
 * Malformed event fixtures for error testing
 */
export const MALFORMED_EVENT_FIXTURES: Record<string, any> = {
	/**
	 * Event with missing required fields
	 */
	missing_message: {
		update_type: 'message_created',
		timestamp: BASE_TIMESTAMP,
		// Missing message object
		user_locale: 'en',
	},

	/**
	 * Event with missing callback for callback event
	 */
	missing_callback: {
		update_type: 'message_callback',
		timestamp: BASE_TIMESTAMP,
		message: BASE_MESSAGE,
		// Missing callback object
		user_locale: 'en',
	},

	/**
	 * Event with missing chat for membership event
	 */
	missing_chat: {
		update_type: 'bot_added',
		timestamp: BASE_TIMESTAMP,
		user: BASE_USER,
		// Missing chat object
	},

	/**
	 * Event with missing timestamp
	 */
	missing_timestamp: {
		update_type: 'message_created',
		// Missing timestamp
		message: BASE_MESSAGE,
		user_locale: 'en',
	},

	/**
	 * Event with empty message content
	 */
	empty_message_content: {
		update_type: 'message_created',
		timestamp: BASE_TIMESTAMP,
		message: {
			...BASE_MESSAGE,
			body: {
				mid: TEST_MESSAGE_ID,
				seq: 1,
				// No text or attachments
			},
		},
		user_locale: 'en',
	},

	/**
	 * Event with invalid structure
	 */
	invalid_structure: {
		update_type: 'message_created',
		timestamp: BASE_TIMESTAMP,
		message: 'invalid_message_structure', // Should be object
		user_locale: 'en',
	},

	/**
	 * Event with null values
	 */
	null_values: {
		update_type: 'message_created',
		timestamp: BASE_TIMESTAMP,
		message: null,
		user: null,
		chat: null,
		user_locale: 'en',
	},
};

/**
 * Edge case event fixtures for boundary testing
 */
export const EDGE_CASE_EVENT_FIXTURES: Record<string, MaxWebhookEvent> = {
	/**
	 * Message with maximum length text
	 */
	max_length_message: {
		update_type: 'message_created',
		timestamp: BASE_TIMESTAMP,
		message: {
			...BASE_MESSAGE,
			body: {
				...BASE_MESSAGE.body,
				text: 'A'.repeat(4000), // Max allowed length
			},
		},
		user_locale: 'en',
	},

	/**
	 * Message with multiple attachments
	 */
	multiple_attachments: {
		update_type: 'message_created',
		timestamp: BASE_TIMESTAMP,
		message: {
			...BASE_MESSAGE,
			body: {
				...BASE_MESSAGE.body,
				text: 'Message with multiple attachments',
				attachments: [
					{
						type: 'image',
						payload: { token: 'img_token_1' },
					},
					{
						type: 'video',
						payload: { token: 'vid_token_1' },
					},
					{
						type: 'audio',
						payload: { token: 'aud_token_1' },
					},
					{
						type: 'file',
						payload: { token: 'file_token_1' },
					},
				],
			},
		},
		user_locale: 'en',
	},

	/**
	 * Complex inline keyboard
	 */
	complex_keyboard: {
		update_type: 'message_callback',
		timestamp: BASE_TIMESTAMP,
		message: {
			...BASE_MESSAGE,
			body: {
				...BASE_MESSAGE.body,
				text: 'Complex keyboard example',
				attachments: [
					{
						type: 'inline_keyboard',
						payload: {
							buttons: [
								[
									{ text: '1', type: 'callback', payload: 'num_1' },
									{ text: '2', type: 'callback', payload: 'num_2' },
									{ text: '3', type: 'callback', payload: 'num_3' },
								],
								[
									{ text: '4', type: 'callback', payload: 'num_4' },
									{ text: '5', type: 'callback', payload: 'num_5' },
									{ text: '6', type: 'callback', payload: 'num_6' },
								],
								[
									{ text: 'Contact', type: 'request_contact' },
									{ text: 'Location', type: 'request_geo_location' },
								],
								[{ text: 'Website', type: 'link', url: 'https://example.com' }],
							],
						},
					},
				],
			},
		},
		callback: {
			callback_id: TEST_CALLBACK_ID,
			payload: 'num_5',
		},
		user_locale: 'en',
	},

	/**
	 * Event with very long user names
	 */
	long_user_names: {
		update_type: 'bot_started',
		timestamp: BASE_TIMESTAMP,
		user: {
			user_id: TEST_USER_ID,
			first_name: 'VeryLongFirstNameThatExceedsNormalLimits',
			last_name: 'VeryLongLastNameThatExceedsNormalLimits',
			username: 'very_long_username_that_exceeds_normal_limits_for_testing',
			is_bot: false,
			last_activity_time: BASE_TIMESTAMP,
		},
	},

	/**
	 * Event with special characters in text
	 */
	special_characters: {
		update_type: 'message_created',
		timestamp: BASE_TIMESTAMP,
		message: {
			...BASE_MESSAGE,
			body: {
				...BASE_MESSAGE.body,
				text: '🎉 Special chars: áéíóú ñ ç 中文 العربية русский 日本語 emoji: 👋🎊🚀',
			},
		},
		user_locale: 'en',
	},

	/**
	 * Event with HTML/Markdown formatting
	 */
	formatted_message: {
		update_type: 'message_created',
		timestamp: BASE_TIMESTAMP,
		message: {
			...BASE_MESSAGE,
			body: {
				...BASE_MESSAGE.body,
				text: '<b>Bold text</b> and <i>italic text</i> with <a href="https://example.com">link</a>',
				markup: [
					{ type: 'strong', from: 0, length: 9 },
					{ type: 'emphasis', from: 14, length: 11 },
					{ type: 'link', from: 31, length: 4 },
				],
			},
		},
		user_locale: 'en',
	},
};

/**
 * Helper function to create custom event fixtures
 */
export function createCustomEventFixture(
	eventType: string,
	overrides: Partial<MaxWebhookEvent> = {},
): MaxWebhookEvent {
	const baseEvent = EVENT_FIXTURES[eventType];
	if (!baseEvent) {
		throw new Error(`Unknown event type: ${eventType}`);
	}

	return {
		...baseEvent,
		...overrides,
		timestamp: overrides.timestamp || Date.now(),
	};
}

/**
 * Helper function to create event with specific user/chat IDs for filtering tests
 */
export function createEventWithIds(
	eventType: string,
	userId?: number,
	chatId?: number,
): MaxWebhookEvent {
	const baseEvent = EVENT_FIXTURES[eventType];
	if (!baseEvent) {
		throw new Error(`Unknown event type: ${eventType}`);
	}

	// Create deep copy
	const event = JSON.parse(JSON.stringify(baseEvent)) as MaxWebhookEvent;

	if (userId && event.user) {
		event.user.user_id = userId;
	}
	if (userId && event.message?.sender) {
		event.message.sender.user_id = userId;
	}

	if (chatId && event.chat) {
		event.chat.chat_id = chatId;
	}
	if (chatId && event.message?.recipient) {
		event.message.recipient.chat_id = chatId;
	}

	return event;
}

/**
 * Helper function to create batch of events for load testing
 */
export function createEventBatch(
	eventType: string,
	count: number,
	startTimestamp: number = BASE_TIMESTAMP,
): MaxWebhookEvent[] {
	const events: MaxWebhookEvent[] = [];

	for (let i = 0; i < count; i++) {
		const event = createCustomEventFixture(eventType, {
			timestamp: startTimestamp + i * 1000, // 1 second apart
		});

		// Make each event unique
		if (event.message?.body) {
			event.message.body.mid = `${TEST_MESSAGE_ID}_${i}`;
			event.message.body.seq = i + 1;
			event.message.body.text = `${event.message.body.text} (${i + 1})`;
		}

		events.push(event);
	}

	return events;
}
