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
				name: 'Bot Added',
				value: 'bot_added',
				description: 'Trigger when the bot is added to a chat',
			},
			{
				name: 'Bot Removed',
				value: 'bot_removed',
				description: 'Trigger when the bot is removed from a chat',
			},
			{
				name: 'Bot Started',
				value: 'bot_started',
				description: 'Trigger when a user starts interaction with the bot',
			},
			{
				name: 'Chat Title Changed',
				value: 'chat_title_changed',
				description: 'Trigger when a chat title is changed',
			},
			{
				name: 'Message Callback',
				value: 'message_callback',
				description: 'Trigger when a user clicks an inline keyboard button',
			},
			{
				name: 'Message Created',
				value: 'message_created',
				description: 'Trigger when a new message is received',
			},
			{
				name: 'Message Edited',
				value: 'message_edited',
				description: 'Trigger when a message is edited',
			},
			{
				name: 'Message Removed',
				value: 'message_removed',
				description: 'Trigger when a message is deleted',
			},
			{
				name: 'User Added',
				value: 'user_added',
				description: 'Trigger when a user is added to a chat',
			},
			{
				name: 'User Removed',
				value: 'user_removed',
				description: 'Trigger when a user is removed from a chat',
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
	};
	user?: {
		id?: number;
		user_id?: number;
		first_name?: string;
		last_name?: string;
		username?: string;
	};
	message?: {
		id?: number;
		text?: string;
		timestamp?: number;
		chat?: any;
		from?: any;
		body?: {
			text?: string;
			mid?: string;
		};
	};
	callback?: {
		id?: string;
		payload?: string;
	};
	[key: string]: any;
}