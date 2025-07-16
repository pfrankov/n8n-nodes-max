import type { INodeProperties } from 'n8n-workflow';

/**
 * Supported Max messenger event types
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
 */
export interface MaxWebhookEvent {
	update_type?: string;
	event_type?: string;
	timestamp?: number;
	chat?: {
		id?: number;
		chat_id?: number;
		type?: string;
		title?: string;
		description?: string;
		avatar_url?: string;
		members_count?: number;
	};
	user?: {
		id?: number;
		user_id?: number;
		first_name?: string;
		last_name?: string;
		username?: string;
		name?: string;
		avatar_url?: string;
		lang?: string;
	};
	message?: {
		id?: number;
		message_id?: string;
		text?: string;
		timestamp?: number;
		chat?: any;
		from?: any;
		body?: {
			text?: string;
			mid?: string;
		};
		attachments?: Array<{
			type: string;
			payload: any;
		}>;
		link?: {
			message_id: string;
			chat_id?: number;
			user_id?: number;
		};
		format?: 'html' | 'markdown';
	};
	callback?: {
		id?: string;
		callback_id?: string;
		payload?: string;
	};

	// Event-specific data for enhanced event processing
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