import type { INodeProperties } from 'n8n-workflow';

/**
 * Supported Max messenger event types
 * Based on official Max API documentation
 */
export const MAX_TRIGGER_EVENTS = [
	'bot_added',
	'bot_removed',
	'bot_started',
	'chat_title_changed',
	'message_callback',
	'message_chat_created',
	'message_created',
	'message_edited',
	'message_removed',
	'user_added',
	'user_removed',
] as const;

export type MaxTriggerEvent = typeof MAX_TRIGGER_EVENTS[number];

/**
 * Node properties configuration for Max Trigger
 */
export const MAX_TRIGGER_PROPERTIES: INodeProperties[] = [
	{
		displayName: 'Events',
		name: 'events',
		type: 'multiOptions',
		options: [
			{
				name: 'Bot Added To Chat',
				value: 'bot_added',
				description: 'Trigger when the bot is added to a chat (update_type: bot_added)',
			},
			{
				name: 'Bot Removed From Chat',
				value: 'bot_removed',
				description: 'Trigger when the bot is removed from a chat (update_type: bot_removed)',
			},
			{
				name: 'Bot Started',
				value: 'bot_started',
				description: 'Trigger when a user starts interaction with the bot (update_type: bot_started)',
			},
			{
				name: 'Button Clicked',
				value: 'message_callback',
				description: 'Trigger when a user clicks an inline keyboard button (update_type: message_callback)',
			},
			{
				name: 'Chat Title Changed',
				value: 'chat_title_changed',
				description: 'Trigger when a chat title is changed (update_type: chat_title_changed)',
			},
			{
				name: 'Message Deleted',
				value: 'message_removed',
				description: 'Trigger when a message is deleted (update_type: message_removed)',
			},
			{
				name: 'Message Edited',
				value: 'message_edited',
				description: 'Trigger when a message is edited (update_type: message_edited)',
			},
			{
				name: 'Message Received (Chat)',
				value: 'message_chat_created',
				description: 'Trigger when a new message is received in group chats (update_type: message_chat_created)',
			},
			{
				name: 'Message Received (Direct)',
				value: 'message_created',
				description: 'Trigger when a new message is received in direct conversation (update_type: message_created)',
			},
			{
				name: 'User Joined Chat',
				value: 'user_added',
				description: 'Trigger when a user is added to a chat (update_type: user_added)',
			},
			{
				name: 'User Left Chat',
				value: 'user_removed',
				description: 'Trigger when a user is removed from a chat (update_type: user_removed)',
			},
		],
		required: true,
		default: ['message_created'],
		description: 'The events that should trigger the workflow',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: [
			{
				displayName: 'Restrict to Chat IDs',
				name: 'chatIds',
				type: 'string',
				default: '',
				description: 'The chat IDs to restrict the trigger to. Multiple can be defined separated by comma.',
			},
			{
				displayName: 'Restrict to User IDs',
				name: 'userIds',
				type: 'string',
				default: '',
				description: 'The user IDs to restrict the trigger to. Multiple can be defined separated by comma.',
			},
		],
	},
];

/**
 * Max API webhook subscription interface
 */
export interface MaxWebhookSubscription {
	url: string;
	time: number;
	update_types: string[];
}

/**
 * Max API subscriptions response interface
 */
export interface MaxSubscriptionsResponse {
	subscriptions: MaxWebhookSubscription[];
}

/**
 * Max webhook event data interface
 * Based on the official Max API OpenAPI schema
 */
export interface MaxWebhookEvent {
	update_type: string;
	timestamp: number;
	
	// Common fields for message events
	message?: {
		message_id?: string;
		text?: string;
		timestamp?: number;
		attachments?: Array<{
			type: string;
			payload: any;
		}>;
		markup?: Array<{
			type: string;
			from: number;
			length: number;
		}>;
		sender?: {
			user_id: number;
			name?: string;
			username?: string;
			first_name?: string;
			last_name?: string;
			is_bot?: boolean;
			last_activity_time?: number;
		};
		recipient?: {
			chat_id: number;
			chat_type?: string;
			user_id?: number;
		};
		// Legacy support for tests
		body?: {
			mid?: string;
			seq?: number;
			text?: string;
			attachments?: Array<{
				type: string;
				payload: any;
			}>;
			markup?: Array<{
				type: string;
				from: number;
				length: number;
			}>;
		};
		stat?: {
			views?: number;
		};
		url?: string;
		from?: {
			user_id: number;
			first_name?: string;
			username?: string;
			name?: string;
		};
		id?: number;
		link?: {
			type?: string;
			sender?: {
				user_id: number;
				name?: string;
				username?: string;
				first_name?: string;
				last_name?: string;
				is_bot?: boolean;
				last_activity_time?: number;
			};
			chat_id?: number;
			message?: {
				mid?: string;
				seq?: number;
				text?: string;
				attachments?: Array<{
					type: string;
					payload: any;
				}>;
				markup?: Array<{
					type: string;
					from: number;
					length: number;
				}>;
			};
		};
	};

	// User information
	user?: {
		user_id: number;
		name?: string;
		username?: string;
		first_name?: string;
		last_name?: string;
		is_bot?: boolean;
		last_activity_time?: number;
		avatar_url?: string;
		lang?: string;
		// Legacy support
		id?: number;
	};

	// Chat information (for message_chat_created events)
	chat?: {
		chat_id: number;
		type: string;
		title?: string;
		description?: string;
		avatar_url?: string;
		members_count?: number;
		is_public?: boolean;
		link?: string;
		// Legacy support
		id?: number;
	};

	// Callback information (for message_callback events)
	callback?: {
		timestamp?: number;
		callback_id?: string;
		payload?: string;
		user?: {
			user_id: number;
			name?: string;
			username?: string;
			first_name?: string;
			last_name?: string;
			is_bot?: boolean;
			last_activity_time?: number;
		};
		// Legacy support
		id?: string;
	};

	// Event-specific fields based on OpenAPI schema
	
	// For bot_added/bot_removed events
	chat_id?: number;
	is_channel?: boolean;

	// For user_added events
	inviter_id?: number;

	// For user_removed events  
	admin_id?: number;

	// For message_removed events
	message_id?: string;
	user_id?: number;

	// For bot_started events
	payload?: string;
	user_locale?: string;

	// For chat_title_changed events
	title?: string;

	// For message_chat_created events
	start_payload?: string;

	// Legacy fields for backward compatibility with tests
	old_message?: {
		id?: number;
		message_id?: string;
		text?: string;
		timestamp?: number;
		attachments?: Array<{
			type: string;
			payload: any;
		}>;
	};
	new_message?: {
		id?: number;
		message_id?: string;
		text?: string;
		timestamp?: number;
		attachments?: Array<{
			type: string;
			payload: any;
		}>;
	};
	deletion_context?: {
		deleted_by?: {
			user_id?: number;
			name?: string;
			username?: string;
		};
		deletion_reason?: string;
		deleted_at?: number;
	};
	chat_changes?: {
		old_title?: string;
		new_title?: string;
		changed_by?: {
			user_id?: number;
			name?: string;
			username?: string;
		};
		changed_at?: number;
	};
	membership_context?: {
		added_by?: {
			user_id?: number;
			name?: string;
			username?: string;
		};
		removed_by?: {
			user_id?: number;
			name?: string;
			username?: string;
		};
		user_role?: string;
		action_timestamp?: number;
	};

	[key: string]: any;
}