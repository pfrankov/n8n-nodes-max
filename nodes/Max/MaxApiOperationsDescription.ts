/* eslint-disable n8n-nodes-base/node-param-default-missing -- The operation helper supplies a resource-specific default dynamically. */
import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { MAX_TRIGGER_EVENTS } from './MaxTriggerConfig';

function operationProperty(resource: string, options: INodePropertyOptions[]): INodeProperties {
	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options,
		default: options[0]?.value ?? '',
	};
}

function humanizeUpdateType(value: string): string {
	return value
		.split('_')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

const updateTypeOptions: INodePropertyOptions[] = MAX_TRIGGER_EVENTS.map((value) => ({
	name: humanizeUpdateType(value),
	value,
}));

const keyboardButtonValues: INodeProperties[] = [
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		options: [
			{ name: 'Callback', value: 'callback' },
			{ name: 'Clipboard', value: 'clipboard' },
			{ name: 'Link', value: 'link' },
			{ name: 'Message', value: 'message' },
			{ name: 'Open App', value: 'open_app' },
			{ name: 'Request Contact', value: 'request_contact' },
			{ name: 'Request Location', value: 'request_geo_location' },
		],
		default: 'callback',
		description: 'The action performed when the user presses the button',
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		default: '',
		required: true,
		description: 'The text displayed on the button, up to 128 characters',
	},
	{
		displayName: 'Payload',
		name: 'payload',
		type: 'string',
		default: '',
		displayOptions: {
			show: { type: ['callback', 'clipboard', 'open_app'] },
		},
		description: 'The callback data, clipboard text, or optional mini-app payload',
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		displayOptions: { show: { type: ['link'] } },
		description: 'The URL opened by the button, up to 2048 characters',
	},
	{
		displayName: 'Web App',
		name: 'web_app',
		type: 'string',
		default: '',
		displayOptions: { show: { type: ['open_app'] } },
		description: 'The mini-app link opened by the button',
	},
	{
		displayName: 'Contact ID',
		name: 'contact_id',
		type: 'string',
		default: '',
		displayOptions: { show: { type: ['open_app'] } },
		description: 'The int64 contact ID used by the open-app button',
	},
	{
		displayName: 'Quick Request',
		name: 'quick',
		type: 'boolean',
		default: false,
		displayOptions: { show: { type: ['request_geo_location'] } },
		description: 'Whether to use the quick location request mode',
	},
];

function keyboardProperty(
	operations: string[],
	extraShow: Record<string, unknown> = {},
): INodeProperties {
	return {
		displayName: 'Inline Keyboard',
		name: 'keyboard',
		type: 'fixedCollection',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: {
			show: {
				resource: ['message'],
				operation: operations,
				...extraShow,
			},
		},
		options: [
			{
				name: 'rows',
				displayName: 'Row',
				values: [
					{
						displayName: 'Buttons',
						name: 'buttons',
						type: 'fixedCollection',
						default: {},
						typeOptions: { multipleValues: true },
						options: [
							{
								name: 'button',
								displayName: 'Button',
								values: keyboardButtonValues,
							},
						],
						description: 'Buttons shown in this keyboard row',
					},
				],
			},
		],
		description: 'An inline keyboard built with the current MAX button types',
	};
}

const messageFormatProperty = (
	operations: string[],
	extraShow: Record<string, unknown> = {},
): INodeProperties => ({
	displayName: 'Text Format',
	name: 'format',
	type: 'options',
	displayOptions: {
		show: { resource: ['message'], operation: operations, ...extraShow },
	},
	options: [
		{ name: 'HTML', value: 'html' },
		{ name: 'Markdown', value: 'markdown' },
		{ name: 'Plain Text', value: 'plain' },
	],
	default: 'plain',
	description: 'The formatting mode used for the message text',
});

const messageBodyProperties = (
	operations: string[],
	extraShow: Record<string, unknown> = {},
): INodeProperties[] => [
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: operations, ...extraShow },
		},
		description: 'The message text, up to 4000 characters',
	},
	messageFormatProperty(operations, extraShow),
	{
		displayName: 'Attachments JSON',
		name: 'attachmentsJson',
		type: 'json',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: operations, ...extraShow },
		},
		description: 'An optional JSON array of MAX attachment request objects',
	},
	keyboardProperty(operations, extraShow),
	{
		displayName: 'Reply to Message ID',
		name: 'replyToMessageId',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: operations, ...extraShow },
		},
		description: 'The message ID to reply to. Cannot be combined with forwarding.',
	},
	{
		displayName: 'Forward Message ID',
		name: 'forwardMessageId',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: operations, ...extraShow },
		},
		description: 'The message ID to forward. Cannot be combined with replying.',
	},
];

export const MAX_API_OPERATION_PROPERTIES: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Bot', value: 'bot' },
			{ name: 'Chat', value: 'chat' },
			{ name: 'Chat Administrator', value: 'chatAdmin' },
			{ name: 'Chat Member', value: 'chatMember' },
			{ name: 'Comment', value: 'comment' },
			{ name: 'Message', value: 'message' },
			{ name: 'Subscription', value: 'subscription' },
		],
		default: 'message',
	},
	operationProperty('bot', [
		{
			name: 'Get',
			value: 'get',
			description: 'Get information about the authenticated bot',
			action: 'Get bot information',
		},
		{
			name: 'Update Commands',
			value: 'setCommands',
			description: 'Replace the complete list of bot commands',
			action: 'Update bot commands',
		},
	]),
	operationProperty('chat', [
		{
			name: 'Get Bot Membership',
			value: 'getMembership',
			description: 'Get the bot membership and permissions',
			action: 'Get bot membership',
		},
		{
			name: 'Get Pinned Message',
			value: 'getPinnedMessage',
			description: 'Get the pinned message or channel post',
			action: 'Get pinned message',
		},
		{
			name: 'Leave',
			value: 'leave',
			description: 'Remove the bot from a chat or channel',
			action: 'Leave a chat',
		},
		{
			name: 'Pin Message',
			value: 'pinMessage',
			description: 'Pin a message or channel post',
			action: 'Pin a message',
		},
		{
			name: 'Send Action',
			value: 'sendAction',
			description: 'Show a typing or file-sending action',
			action: 'Send a chat action',
		},
		{
			name: 'Unpin Message',
			value: 'unpinMessage',
			description: 'Remove the current pinned message',
			action: 'Unpin a message',
		},
		{
			name: 'Update',
			value: 'update',
			description: 'Update title, description, icon, or pinned message',
			action: 'Update a chat',
		},
	]),
	operationProperty('chatAdmin', [
		{
			name: 'Add or Update',
			value: 'set',
			description: 'Grant or completely replace administrator permissions',
			action: 'Add or update an administrator',
		},
		{
			name: 'Get Many',
			value: 'getMany',
			description: 'Get many chat administrators',
			action: 'Get many chat administrators',
		},
		{
			name: 'Remove',
			value: 'remove',
			description: 'Revoke administrator rights without removing the member',
			action: 'Remove an administrator',
		},
	]),
	operationProperty('chatMember', [
		{
			name: 'Add',
			value: 'add',
			description: 'Add up to 100 users to a group chat',
			action: 'Add chat members',
		},
		{
			name: 'Get Many',
			value: 'getMany',
			description: 'Get many chat or channel members',
			action: 'Get many chat members',
		},
		{
			name: 'Remove',
			value: 'remove',
			description: 'Remove one member and optionally block them',
			action: 'Remove a chat member',
		},
	]),
	operationProperty('comment', [
		{
			name: 'Create',
			value: 'create',
			description: 'Create a comment on a channel post',
			action: 'Create a comment',
		},
		{
			name: 'Delete',
			value: 'delete',
			description: 'Delete a comment from a channel post',
			action: 'Delete a comment',
		},
		{
			name: 'Get',
			value: 'get',
			description: 'Get one comment by its ID',
			action: 'Get a comment',
		},
		{
			name: 'Get Many',
			value: 'getMany',
			description: 'Get many comments for a channel post',
			action: 'Get many comments',
		},
		{
			name: 'Update',
			value: 'update',
			description: 'Edit a bot or channel comment',
			action: 'Update a comment',
		},
	]),
	operationProperty('message', [
		{
			name: 'Answer Callback',
			value: 'answerCallback',
			description: 'Answer a button click with a notification or updated message',
			action: 'Answer a callback',
		},
		{
			name: 'Get',
			value: 'get',
			description: 'Get one message or channel post by its ID',
			action: 'Get a message',
		},
		{
			name: 'Get Many',
			value: 'getMany',
			description: 'Get many messages by chat ID or message IDs',
			action: 'Get many messages',
		},
		{
			name: 'Get Video',
			value: 'getVideo',
			description: 'Get processing information for an attached video',
			action: 'Get video information',
		},
		{
			name: 'Send',
			value: 'send',
			description: 'Send an advanced message with current keyboard types',
			action: 'Send an advanced message',
		},
		{
			name: 'Update',
			value: 'update',
			description: 'Update a message and optionally replace its attachments',
			action: 'Update a message',
		},
	]),
	operationProperty('subscription', [
		{
			name: 'Create',
			value: 'create',
			description: 'Create or update a webhook subscription',
			action: 'Create a webhook subscription',
		},
		{
			name: 'Delete',
			value: 'delete',
			description: 'Delete a webhook subscription by URL',
			action: 'Delete a webhook subscription',
		},
		{
			name: 'Get Many',
			value: 'getMany',
			description: 'Get many webhook subscriptions',
			action: 'Get many webhook subscriptions',
		},
	]),
	{
		displayName: 'Commands',
		name: 'commands',
		type: 'fixedCollection',
		default: {},
		typeOptions: { multipleValues: true },
		displayOptions: { show: { resource: ['bot'], operation: ['setCommands'] } },
		options: [
			{
				name: 'command',
				displayName: 'Command',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						required: true,
						description: 'The command name without the leading slash',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						required: true,
						description: 'The command description shown to users',
					},
				],
			},
		],
		description: 'The complete command list. Leave empty to remove all commands.',
	},
	{
		displayName: 'Chat ID',
		name: 'chatId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['chat', 'chatAdmin', 'chatMember'] } },
		description: 'The signed int64 ID of the group chat or channel',
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		default: {},
		placeholder: 'Add Field',
		displayOptions: { show: { resource: ['chat'], operation: ['update'] } },
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'The new description. An empty string removes it.',
			},
			{
				displayName: 'Icon URL',
				name: 'iconUrl',
				type: 'string',
				default: '',
				description: 'The URL of the new chat or channel icon',
			},
			{
				displayName: 'Notify',
				name: 'notify',
				type: 'boolean',
				default: true,
				description: 'Whether to notify members about the change',
			},
			{
				displayName: 'Pin Message ID',
				name: 'pin',
				type: 'string',
				default: '',
				description: 'The message ID to pin while updating the chat',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'The new title, from 1 to 200 characters',
			},
		],
	},
	{
		displayName: 'Action',
		name: 'action',
		type: 'options',
		displayOptions: { show: { resource: ['chat'], operation: ['sendAction'] } },
		options: [
			{ name: 'Sending Audio', value: 'sending_audio', action: 'Show sending audio' },
			{ name: 'Sending File', value: 'sending_file', action: 'Show sending file' },
			{ name: 'Sending Photo', value: 'sending_photo', action: 'Show sending photo' },
			{ name: 'Sending Video', value: 'sending_video', action: 'Show sending video' },
			{ name: 'Typing', value: 'typing_on', action: 'Show typing' },
		],
		default: 'typing_on',
		description: 'The activity displayed to chat members',
	},
	{
		displayName: 'Message ID',
		name: 'messageId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['chat'], operation: ['pinMessage'] } },
		description: 'The message or post ID to pin',
	},
	{
		displayName: 'Notify',
		name: 'notify',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['chat'], operation: ['pinMessage'] } },
		description: 'Whether to notify members about the pinned message',
	},
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['chatAdmin'],
				operation: ['remove', 'set'],
			},
		},
		description: 'The signed int64 ID of the user or bot',
	},
	{
		displayName: 'Alias',
		name: 'alias',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['chatAdmin'], operation: ['set'] } },
		description: 'The optional administrator label',
	},
	{
		displayName: 'Permissions',
		name: 'permissions',
		type: 'multiOptions',
		default: [],
		required: true,
		displayOptions: { show: { resource: ['chatAdmin'], operation: ['set'] } },
		options: [
			{ name: 'Add Administrators', value: 'add_admins' },
			{ name: 'Add or Remove Members', value: 'add_remove_members' },
			{ name: 'Change Chat Information', value: 'change_chat_info' },
			{ name: 'Delete', value: 'delete' },
			{ name: 'Edit', value: 'edit' },
			{ name: 'Edit Link', value: 'edit_link' },
			{ name: 'Pin Message', value: 'pin_message' },
			{ name: 'Read All Messages', value: 'read_all_messages' },
			{ name: 'Write', value: 'write' },
		],
		description: 'The complete permission set that replaces the current administrator rights',
	},
	{
		displayName: 'Member Selection',
		name: 'memberSelection',
		type: 'options',
		displayOptions: { show: { resource: ['chatMember'], operation: ['getMany'] } },
		options: [
			{ name: 'All Members', value: 'all' },
			{ name: 'Specific User IDs', value: 'userIds' },
		],
		default: 'all',
		description: 'Whether to page through members or request specific user IDs',
	},
	{
		displayName: 'User IDs',
		name: 'userIds',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['chatMember'],
				operation: ['add'],
			},
		},
		description: 'A comma-separated list of signed int64 user IDs, up to 100',
	},
	{
		displayName: 'User IDs',
		name: 'userIds',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['chatMember'],
				operation: ['getMany'],
				memberSelection: ['userIds'],
			},
		},
		description: 'A comma-separated list of signed int64 user IDs',
	},
	{
		displayName: 'Marker',
		name: 'marker',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['chatMember'],
				operation: ['getMany'],
				memberSelection: ['all'],
			},
		},
		description: 'The marker returned by the previous page',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: {
			show: {
				resource: ['chatMember'],
				operation: ['getMany'],
				memberSelection: ['all'],
			},
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['chatMember'], operation: ['remove'] } },
		description: 'The signed int64 ID of the user to remove',
	},
	{
		displayName: 'Block',
		name: 'block',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['chatMember'], operation: ['remove'] } },
		description: 'Whether to block the removed user when the chat supports blocking',
	},
	{
		displayName: 'Message ID',
		name: 'messageId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['comment'] } },
		description: 'The channel post ID that owns the comment',
	},
	{
		displayName: 'Comment ID',
		name: 'commentId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['comment'], operation: ['delete', 'get', 'update'] },
		},
	},
	{
		displayName: 'Comment Selection',
		name: 'commentSelection',
		type: 'options',
		displayOptions: { show: { resource: ['comment'], operation: ['getMany'] } },
		options: [
			{ name: 'By Filter', value: 'filter' },
			{ name: 'Specific Comment IDs', value: 'commentIds' },
		],
		default: 'filter',
		description: 'Whether to use time filters or request specific comments',
	},
	{
		displayName: 'Comment IDs',
		name: 'commentIds',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['comment'],
				operation: ['getMany'],
				commentSelection: ['commentIds'],
			},
		},
		description: 'A comma-separated list of comment IDs',
	},
	{
		displayName: 'After',
		name: 'after',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
		displayOptions: {
			show: {
				resource: ['comment'],
				operation: ['getMany'],
				commentSelection: ['filter'],
			},
		},
		description: 'The earliest Unix timestamp in milliseconds. Zero omits the filter.',
	},
	{
		displayName: 'Before',
		name: 'before',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
		displayOptions: {
			show: {
				resource: ['comment'],
				operation: ['getMany'],
				commentSelection: ['filter'],
			},
		},
		description: 'The latest Unix timestamp in milliseconds. Zero omits the filter.',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['comment'], operation: ['getMany'] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: { show: { resource: ['comment'], operation: ['create', 'update'] } },
		description: 'The comment text, up to 4000 characters',
	},
	{
		displayName: 'Text Format',
		name: 'format',
		type: 'options',
		displayOptions: { show: { resource: ['comment'], operation: ['create', 'update'] } },
		options: [
			{ name: 'HTML', value: 'html' },
			{ name: 'Markdown', value: 'markdown' },
			{ name: 'Plain Text', value: 'plain' },
		],
		default: 'plain',
		description: 'The formatting mode used for the comment text',
	},
	{
		displayName: 'Reply to Comment ID',
		name: 'replyToCommentId',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['comment'], operation: ['create', 'update'] } },
		description: 'The optional comment ID to reply to',
	},
	{
		displayName: 'Message ID',
		name: 'messageId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['message'], operation: ['get', 'update'] } },
		description: 'The message or channel post ID',
	},
	{
		displayName: 'Get Messages By',
		name: 'getMessagesBy',
		type: 'options',
		displayOptions: { show: { resource: ['message'], operation: ['getMany'] } },
		options: [
			{ name: 'Chat ID', value: 'chatId' },
			{ name: 'Message IDs', value: 'messageIds' },
		],
		default: 'chatId',
		description: 'Whether to retrieve messages from a chat or by explicit IDs',
	},
	{
		displayName: 'Chat ID',
		name: 'chatId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['getMany'],
				getMessagesBy: ['chatId'],
			},
		},
		description: 'The signed int64 ID of the chat or channel',
	},
	{
		displayName: 'Message IDs',
		name: 'messageIds',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['getMany'],
				getMessagesBy: ['messageIds'],
			},
		},
		description: 'A comma-separated list of message or post IDs',
	},
	{
		displayName: 'From',
		name: 'from',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
		displayOptions: { show: { resource: ['message'], operation: ['getMany'] } },
		description: 'The upper Unix timestamp boundary in milliseconds. Zero omits it.',
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
		displayOptions: { show: { resource: ['message'], operation: ['getMany'] } },
		description: 'The lower Unix timestamp boundary in milliseconds. Zero omits it.',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['message'], operation: ['getMany'] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Video Identifier',
		name: 'videoIdentifier',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['message'], operation: ['getVideo'] } },
		description: 'The identifier of the attached video',
	},
	{
		displayName: 'Send To',
		name: 'sendTo',
		type: 'options',
		displayOptions: { show: { resource: ['message'], operation: ['send'] } },
		options: [
			{ name: 'Chat or Channel', value: 'chat' },
			{ name: 'User', value: 'user' },
		],
		default: 'user',
		description: 'Whether to send the message to a user or a chat',
	},
	{
		displayName: 'Recipient ID',
		name: 'recipientId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['message'], operation: ['send'] } },
		description: 'The signed int64 user, chat, or channel ID',
	},
	...messageBodyProperties(['send', 'update']),
	{
		displayName: 'Notify',
		name: 'notify',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['message'], operation: ['send', 'update'] } },
		description: 'Whether to send a push notification to chat members',
	},
	{
		displayName: 'Disable Link Preview',
		name: 'disableLinkPreview',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: { resource: ['message'], operation: ['answerCallback', 'send', 'update'] },
		},
		description: 'Whether to prevent MAX from generating link previews',
	},
	{
		displayName: 'Clear Attachments',
		name: 'clearAttachments',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['update'] } },
		description: 'Whether to remove all current message attachments',
	},
	{
		displayName: 'Callback ID',
		name: 'callbackId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['message'], operation: ['answerCallback'] } },
		description: 'The callback ID received in a message_callback update',
	},
	{
		displayName: 'Notification',
		name: 'notification',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['message'], operation: ['answerCallback'] } },
		description: 'The optional one-time notification shown to the user',
	},
	{
		displayName: 'Update Message',
		name: 'updateMessage',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['answerCallback'] } },
		description: 'Whether to replace the message after answering the callback',
	},
	...messageBodyProperties(['answerCallback'], { updateMessage: [true] }),
	{
		displayName: 'Clear Attachments',
		name: 'clearAttachments',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['answerCallback'],
				updateMessage: [true],
			},
		},
		description: 'Whether to remove all current message attachments',
	},
	{
		displayName: 'Webhook URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['subscription'], operation: ['create', 'delete'] } },
		description: 'The HTTPS URL used for the webhook subscription',
	},
	{
		displayName: 'Update Types',
		name: 'updateTypes',
		type: 'multiOptions',
		default: [],
		required: true,
		displayOptions: { show: { resource: ['subscription'], operation: ['create'] } },
		options: updateTypeOptions,
		description: 'The update types delivered to this webhook',
	},
	{
		displayName: 'Secret',
		name: 'secret',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		displayOptions: { show: { resource: ['subscription'], operation: ['create'] } },
		description: 'The optional X-Max-Bot-Api-Secret value, from 5 to 256 characters',
	},
	{
		displayName: 'API Version',
		name: 'version',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['subscription'], operation: ['create'] } },
		description: 'The optional API version requested for webhook payloads',
	},
];

export function maxApiPropertiesFor(
	resource: string,
	allowedOperations?: string[],
): INodeProperties[] {
	return MAX_API_OPERATION_PROPERTIES.filter((property) => property.name !== 'resource')
		.filter((property) => property.displayOptions?.show?.['resource']?.includes(resource))
		.filter((property) => {
			const operations = property.displayOptions?.show?.['operation'];
			return (
				!allowedOperations ||
				!operations ||
				operations.some((operation) => allowedOperations.includes(String(operation)))
			);
		})
		.map((property) => {
			const copy = structuredClone(property);
			if (copy.displayOptions?.show) {
				delete copy.displayOptions.show['resource'];
				const operations = copy.displayOptions.show['operation'];
				if (allowedOperations && operations) {
					copy.displayOptions.show['operation'] = operations.filter((operation) =>
						allowedOperations.includes(String(operation)),
					);
				}
			}
			if (copy.name === 'operation' && allowedOperations && Array.isArray(copy.options)) {
				copy.options = copy.options.filter(
					(option) => 'value' in option && allowedOperations.includes(String(option.value)),
				);
				const firstOption = copy.options[0];
				copy.default = firstOption && 'value' in firstOption ? firstOption.value : '';
			}
			return copy;
		});
}
