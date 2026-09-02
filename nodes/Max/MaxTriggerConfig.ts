import type { INodeProperties } from 'n8n-workflow';

/** Supported webhook update types from the current MAX Bot API. */
export const MAX_TRIGGER_EVENTS = [
	'bot_added',
	'bot_removed',
	'bot_started',
	'bot_stopped',
	'chat_title_changed',
	'comment_created',
	'comment_edited',
	'comment_removed',
	'dialog_cleared',
	'dialog_muted',
	'dialog_removed',
	'dialog_unmuted',
	'message_callback',
	'message_chat_created',
	'message_created',
	'message_edited',
	'message_removed',
	'user_added',
	'user_removed',
] as const;

export type MaxTriggerEvent = (typeof MAX_TRIGGER_EVENTS)[number];

/** Node properties configuration for Max Trigger. */
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
				description: 'Trigger when a user starts the bot (update_type: bot_started)',
			},
			{
				name: 'Bot Stopped',
				value: 'bot_stopped',
				description: 'Trigger when a user stops the bot (update_type: bot_stopped)',
			},
			{
				name: 'Button Clicked',
				value: 'message_callback',
				description: 'Trigger when an inline button is pressed (update_type: message_callback)',
			},
			{
				name: 'Chat Title Changed',
				value: 'chat_title_changed',
				description: 'Trigger when a chat title changes (update_type: chat_title_changed)',
			},
			{
				name: 'Comment Created',
				value: 'comment_created',
				description: 'Trigger when a channel comment is created (update_type: comment_created)',
			},
			{
				name: 'Comment Deleted',
				value: 'comment_removed',
				description: 'Trigger when a channel comment is deleted (update_type: comment_removed)',
			},
			{
				name: 'Comment Edited',
				value: 'comment_edited',
				description: 'Trigger when a channel comment is edited (update_type: comment_edited)',
			},
			{
				name: 'Dialog Cleared',
				value: 'dialog_cleared',
				description: 'Trigger when a dialog history is cleared (update_type: dialog_cleared)',
			},
			{
				name: 'Dialog Muted',
				value: 'dialog_muted',
				description: 'Trigger when a dialog is muted (update_type: dialog_muted)',
			},
			{
				name: 'Dialog Removed',
				value: 'dialog_removed',
				description: 'Trigger when a dialog is removed (update_type: dialog_removed)',
			},
			{
				name: 'Dialog Unmuted',
				value: 'dialog_unmuted',
				description: 'Trigger when a dialog is unmuted (update_type: dialog_unmuted)',
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
				description: 'Trigger on a new group message (update_type: message_chat_created)',
			},
			{
				name: 'Message Received (Direct)',
				value: 'message_created',
				description: 'Trigger on a new direct message (update_type: message_created)',
			},
			{
				name: 'User Joined Chat',
				value: 'user_added',
				description: 'Trigger when a user is added (update_type: user_added)',
			},
			{
				name: 'User Left Chat',
				value: 'user_removed',
				description: 'Trigger when a user is removed (update_type: user_removed)',
			},
		],
		required: true,
		default: ['message_created'],
		description: 'The webhook update types that start the workflow',
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
				description: 'Only trigger for these chat IDs. Comma-separated.',
			},
			{
				displayName: 'Restrict to User IDs',
				name: 'userIds',
				type: 'string',
				default: '',
				description: 'Only trigger for these user IDs. Comma-separated.',
			},
			{
				displayName: 'Webhook Secret',
				name: 'secret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'A secret for the X-Max-Bot-Api-Secret header. Optional. 5-256 chars.',
			},
			{
				displayName: 'API Version',
				name: 'version',
				type: 'string',
				default: '',
				description: 'The API version for webhooks. Optional. Example: 0.0.1',
			},
		],
	},
];

export interface MaxWebhookSubscription {
	url: string;
	time: number;
	update_types: string[];
}

export interface MaxSubscriptionsResponse {
	subscriptions: MaxWebhookSubscription[];
}

/** Webhook payload is intentionally open because its shape differs for every update_type. */
export interface MaxWebhookEvent {
	update_type: string;
	timestamp: number;
	message?: {
		message_id?: string;
		text?: string;
		timestamp?: number;
		attachments?: Array<{ type: string; payload: any }>;
		markup?: Array<{ type: string; from: number; length: number }>;
		sender?: {
			user_id: number;
			name?: string;
			username?: string;
			first_name?: string;
			last_name?: string;
			is_bot?: boolean;
			last_activity_time?: number;
		};
		recipient?: { chat_id: number; chat_type?: string; user_id?: number };
		body?: {
			mid?: string;
			seq?: number;
			text?: string;
			attachments?: Array<{ type: string; payload: any }>;
			markup?: Array<{ type: string; from: number; length: number }>;
		};
		stat?: { views?: number };
		url?: string;
		from?: { user_id: number; first_name?: string; username?: string; name?: string };
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
				attachments?: Array<{ type: string; payload: any }>;
				markup?: Array<{ type: string; from: number; length: number }>;
			};
		};
	};
	comment?: Record<string, any>;
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
	};
	chat?: {
		chat_id: number;
		type: string;
		title?: string;
		description?: string;
		avatar_url?: string;
		members_count?: number;
		is_public?: boolean;
		link?: string;
	};
	callback?: {
		timestamp?: number;
		callback_id?: string;
		id?: string;
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
	};
	chat_id?: number;
	is_channel?: boolean;
	inviter_id?: number;
	admin_id?: number;
	message_id?: string;
	comment_id?: string;
	user_id?: number;
	payload?: string;
	user_locale?: string;
	title?: string;
	start_payload?: string;
	old_message?: {
		text?: string;
		timestamp?: number;
		attachments?: Array<{ type: string; payload: any }>;
	};
	new_message?: {
		text?: string;
		timestamp?: number;
		attachments?: Array<{ type: string; payload: any }>;
	};
	deletion_context?: {
		deleted_by?: { user_id: number; name?: string; username?: string };
		deleted_at?: number;
		deletion_reason?: string;
	};
	membership_context?: {
		added_by?: { user_id: number; name?: string; username?: string };
		removed_by?: { user_id: number; name?: string; username?: string };
		user_role?: string;
		action_timestamp?: number;
	};
	chat_changes?: {
		old_title?: string;
		new_title?: string;
		changed_by?: { user_id: number; name?: string; username?: string };
		changed_at?: number;
	};
	[key: string]: any;
}
