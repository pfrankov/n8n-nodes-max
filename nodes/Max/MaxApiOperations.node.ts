import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { ApplicationError, NodeApiError, NodeOperationError } from 'n8n-workflow';
import { MAX_API_OPERATION_PROPERTIES } from './MaxApiOperationsDescription';
import { MAIN_CONNECTION } from './MaxNodeTypes';
import {
	buildInlineKeyboard,
	extractKeyboardRows,
	maxApiRequest,
	normalizeMaxWebhookUrl,
	parseIdList,
	parseJsonObjectArray,
	requireInt64,
	requireString,
	type MaxHttpMethod,
} from './MaxApiRequest';

function getParameter<T>(
	context: IExecuteFunctions,
	name: string,
	itemIndex: number,
	defaultValue: T,
): T {
	return context.getNodeParameter(name, itemIndex, defaultValue) as T;
}

function optionalString(value: unknown): string | undefined {
	const result = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
	return result.length > 0 ? result : undefined;
}

function encodePath(value: string): string {
	return encodeURIComponent(value);
}

function splitStringList(value: unknown, displayName: string): string[] {
	const result = String(value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	if (result.length === 0) {
		throw new ApplicationError(`${displayName} must contain at least one value`);
	}
	return Array.from(new Set(result));
}

function hasOwn(value: IDataObject, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

function asOutputJson(value: unknown): IDataObject {
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		return value as IDataObject;
	}
	return { data: value as IDataObject['data'] };
}

async function request(
	context: IExecuteFunctions,
	method: MaxHttpMethod,
	path: string,
	qs?: IDataObject,
	body?: IDataObject,
): Promise<unknown> {
	return await maxApiRequest(context, {
		method,
		path,
		...(qs && Object.keys(qs).length > 0 ? { qs } : {}),
		...(body !== undefined ? { body } : {}),
	});
}

function buildCommands(context: IExecuteFunctions, itemIndex: number): IDataObject[] {
	const value = getParameter<IDataObject>(context, 'commands', itemIndex, {});
	const commands = value['command'];
	if (!Array.isArray(commands)) {
		return [];
	}
	if (commands.length > 32) {
		throw new ApplicationError('Commands can contain at most 32 items');
	}

	return commands.map((command, index) => {
		if (!command || typeof command !== 'object' || Array.isArray(command)) {
			throw new ApplicationError(`Command ${index + 1} has an invalid value`);
		}
		const commandObject = command as IDataObject;
		return {
			name: requireString(commandObject['name'], `Command ${index + 1} name`),
			description: requireString(commandObject['description'], `Command ${index + 1} description`),
		};
	});
}

function buildMessageBody(
	context: IExecuteFunctions,
	itemIndex: number,
	options: { includeNotify: boolean; allowLink: boolean; allowEmptyAttachments: boolean },
): IDataObject {
	const body: IDataObject = {};
	const text = getParameter<string>(context, 'text', itemIndex, '');
	const format = getParameter<string>(context, 'format', itemIndex, 'plain');
	const attachments = parseJsonObjectArray(
		getParameter<unknown>(context, 'attachmentsJson', itemIndex, ''),
		'Attachments JSON',
	);
	const keyboard = buildInlineKeyboard(
		extractKeyboardRows(getParameter<unknown>(context, 'keyboard', itemIndex, {})),
	);
	const clearAttachments = getParameter<boolean>(context, 'clearAttachments', itemIndex, false);

	if (text.length > 4000) {
		throw new ApplicationError('Message text cannot exceed 4000 characters');
	}
	if (text.length > 0) {
		body['text'] = text;
		if (format !== 'plain') {
			body['format'] = format;
		}
	}

	if (options.includeNotify) {
		body['notify'] = getParameter<boolean>(context, 'notify', itemIndex, true);
	}

	if (clearAttachments) {
		body['attachments'] = [];
	} else if (attachments !== undefined || keyboard !== undefined) {
		const combinedAttachments = [...(attachments ?? []), ...(keyboard ? [keyboard] : [])];
		if (combinedAttachments.length > 0 || options.allowEmptyAttachments) {
			body['attachments'] = combinedAttachments;
		}
	}

	if (options.allowLink) {
		const replyMessageId = optionalString(
			getParameter<unknown>(context, 'replyToMessageId', itemIndex, ''),
		);
		const forwardMessageId = optionalString(
			getParameter<unknown>(context, 'forwardMessageId', itemIndex, ''),
		);
		if (replyMessageId && forwardMessageId) {
			throw new ApplicationError('Use either Reply to Message ID or Forward Message ID, not both');
		}
		if (replyMessageId || forwardMessageId) {
			body['link'] = {
				type: forwardMessageId ? 'forward' : 'reply',
				mid: forwardMessageId ?? replyMessageId,
			};
		}
	}

	const contentKeys = Object.keys(body).filter((key) => key !== 'notify');
	if (contentKeys.length === 0) {
		throw new ApplicationError(
			'Provide message text, attachments, a keyboard, or a reply/forward link',
		);
	}

	return body;
}

function buildCommentBody(context: IExecuteFunctions, itemIndex: number): IDataObject {
	const text = getParameter<string>(context, 'text', itemIndex, '');
	if (text.length > 4000) {
		throw new ApplicationError('Comment text cannot exceed 4000 characters');
	}

	const body: IDataObject = { text };
	const format = getParameter<string>(context, 'format', itemIndex, 'plain');
	if (format !== 'plain') {
		body['format'] = format;
	}

	const replyToCommentId = optionalString(
		getParameter<unknown>(context, 'replyToCommentId', itemIndex, ''),
	);
	if (replyToCommentId) {
		body['link'] = { type: 'reply', mid: replyToCommentId };
	}
	return body;
}

function buildChatUpdateBody(context: IExecuteFunctions, itemIndex: number): IDataObject {
	const fields = getParameter<IDataObject>(context, 'updateFields', itemIndex, {});
	const body: IDataObject = {};

	if (hasOwn(fields, 'title')) {
		body['title'] = String(fields['title'] ?? '');
	}
	if (hasOwn(fields, 'description')) {
		body['description'] = String(fields['description'] ?? '');
	}
	if (hasOwn(fields, 'pin')) {
		body['pin'] = String(fields['pin'] ?? '');
	}
	if (hasOwn(fields, 'notify')) {
		body['notify'] = Boolean(fields['notify']);
	}
	if (hasOwn(fields, 'iconUrl')) {
		const iconUrl = optionalString(fields['iconUrl']);
		if (iconUrl) {
			body['icon'] = { url: iconUrl };
		}
	}

	if (Object.keys(body).length === 0) {
		throw new ApplicationError('Select at least one chat field to update');
	}
	return body;
}

function validateAdminPermissions(permissions: string[]): void {
	const permissionsRequiringRead = ['delete', 'edit', 'pin_message', 'write'];
	if (
		permissionsRequiringRead.some((permission) => permissions.includes(permission)) &&
		!permissions.includes('read_all_messages')
	) {
		throw new ApplicationError(
			'Read All Messages is required together with Edit, Delete, Write, or Pin Message',
		);
	}
}

async function executeBotOperation(
	context: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<unknown> {
	if (operation === 'get') {
		return await request(context, 'GET', '/me');
	}
	if (operation === 'setCommands') {
		return await request(context, 'PATCH', '/me/commands', undefined, {
			commands: buildCommands(context, itemIndex),
		});
	}
	throw new ApplicationError(`Unsupported Bot operation: ${operation}`);
}

async function executeChatOperation(
	context: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<unknown> {
	const chatId = requireInt64(getParameter<unknown>(context, 'chatId', itemIndex, ''), 'Chat ID');
	const basePath = `/chats/${encodePath(chatId)}`;

	switch (operation) {
		case 'getMembership':
			return await request(context, 'GET', `${basePath}/members/me`);
		case 'getPinnedMessage':
			return await request(context, 'GET', `${basePath}/pin`);
		case 'leave':
			return await request(context, 'DELETE', `${basePath}/members/me`);
		case 'pinMessage':
			return await request(context, 'PUT', `${basePath}/pin`, undefined, {
				message_id: requireString(
					getParameter<unknown>(context, 'messageId', itemIndex, ''),
					'Message ID',
				),
				notify: getParameter<boolean>(context, 'notify', itemIndex, true),
			});
		case 'sendAction':
			return await request(context, 'POST', `${basePath}/actions`, undefined, {
				action: getParameter<string>(context, 'action', itemIndex, 'typing_on'),
			});
		case 'unpinMessage':
			return await request(context, 'DELETE', `${basePath}/pin`);
		case 'update':
			return await request(
				context,
				'PATCH',
				basePath,
				undefined,
				buildChatUpdateBody(context, itemIndex),
			);
		default:
			throw new ApplicationError(`Unsupported Chat operation: ${operation}`);
	}
}

async function executeAdminOperation(
	context: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<unknown> {
	const chatId = requireInt64(getParameter<unknown>(context, 'chatId', itemIndex, ''), 'Chat ID');
	const basePath = `/chats/${encodePath(chatId)}/members/admins`;

	if (operation === 'getMany') {
		return await request(context, 'GET', basePath);
	}

	const userId = requireInt64(getParameter<unknown>(context, 'userId', itemIndex, ''), 'User ID');
	if (operation === 'remove') {
		return await request(context, 'DELETE', `${basePath}/${encodePath(userId)}`);
	}
	if (operation === 'set') {
		const permissions = getParameter<string[]>(context, 'permissions', itemIndex, []);
		if (permissions.length === 0) {
			throw new ApplicationError('Select at least one administrator permission');
		}
		validateAdminPermissions(permissions);
		const admin: IDataObject = { user_id: userId, permissions };
		const alias = optionalString(getParameter<unknown>(context, 'alias', itemIndex, ''));
		if (alias) {
			admin['alias'] = alias;
		}
		return await request(context, 'POST', basePath, undefined, { admins: [admin] });
	}
	throw new ApplicationError(`Unsupported Chat Administrator operation: ${operation}`);
}

async function executeMemberOperation(
	context: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<unknown> {
	const chatId = requireInt64(getParameter<unknown>(context, 'chatId', itemIndex, ''), 'Chat ID');
	const path = `/chats/${encodePath(chatId)}/members`;

	if (operation === 'add') {
		return await request(context, 'POST', path, undefined, {
			user_ids: parseIdList(
				getParameter<unknown>(context, 'userIds', itemIndex, ''),
				'User IDs',
				100,
			),
		});
	}
	if (operation === 'remove') {
		return await request(context, 'DELETE', path, {
			user_id: requireInt64(getParameter<unknown>(context, 'userId', itemIndex, ''), 'User ID'),
			block: getParameter<boolean>(context, 'block', itemIndex, false),
		});
	}
	if (operation === 'getMany') {
		const selection = getParameter<string>(context, 'memberSelection', itemIndex, 'all');
		if (selection === 'userIds') {
			return await request(context, 'GET', path, {
				user_ids: parseIdList(
					getParameter<unknown>(context, 'userIds', itemIndex, ''),
					'User IDs',
				).join(','),
			});
		}

		const marker = optionalString(getParameter<unknown>(context, 'marker', itemIndex, ''));
		return await request(context, 'GET', path, {
			count: getParameter<number>(context, 'limit', itemIndex, 20),
			...(marker ? { marker } : {}),
		});
	}
	throw new ApplicationError(`Unsupported Chat Member operation: ${operation}`);
}

async function executeCommentOperation(
	context: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<unknown> {
	const messageId = requireString(
		getParameter<unknown>(context, 'messageId', itemIndex, ''),
		'Message ID',
	);
	const basePath = `/messages/${encodePath(messageId)}/comments`;

	if (operation === 'create') {
		return await request(
			context,
			'POST',
			basePath,
			undefined,
			buildCommentBody(context, itemIndex),
		);
	}
	if (operation === 'getMany') {
		const selection = getParameter<string>(context, 'commentSelection', itemIndex, 'filter');
		if (selection === 'commentIds') {
			return await request(context, 'GET', basePath, {
				comment_ids: splitStringList(
					getParameter<unknown>(context, 'commentIds', itemIndex, ''),
					'Comment IDs',
				).join(','),
			});
		}

		const after = getParameter<number>(context, 'after', itemIndex, 0);
		const before = getParameter<number>(context, 'before', itemIndex, 0);
		return await request(context, 'GET', basePath, {
			after: after > 0 ? after : undefined,
			before: before > 0 ? before : undefined,
			count: getParameter<number>(context, 'limit', itemIndex, 50),
		});
	}

	const commentId = requireString(
		getParameter<unknown>(context, 'commentId', itemIndex, ''),
		'Comment ID',
	);
	if (operation === 'get') {
		return await request(context, 'GET', `${basePath}/${encodePath(commentId)}`);
	}
	if (operation === 'delete') {
		return await request(context, 'DELETE', basePath, { comment_id: commentId });
	}
	if (operation === 'update') {
		return await request(
			context,
			'PUT',
			basePath,
			{ comment_id: commentId },
			buildCommentBody(context, itemIndex),
		);
	}
	throw new ApplicationError(`Unsupported Comment operation: ${operation}`);
}

async function executeMessageOperation(
	context: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<unknown> {
	if (operation === 'get') {
		const messageId = requireString(
			getParameter<unknown>(context, 'messageId', itemIndex, ''),
			'Message ID',
		);
		return await request(context, 'GET', `/messages/${encodePath(messageId)}`);
	}
	if (operation === 'getMany') {
		const selection = getParameter<string>(context, 'getMessagesBy', itemIndex, 'chatId');
		const from = getParameter<number>(context, 'from', itemIndex, 0);
		const to = getParameter<number>(context, 'to', itemIndex, 0);
		const qs: IDataObject = {
			count: getParameter<number>(context, 'limit', itemIndex, 50),
			from: from > 0 ? from : undefined,
			to: to > 0 ? to : undefined,
		};
		if (selection === 'messageIds') {
			qs['message_ids'] = splitStringList(
				getParameter<unknown>(context, 'messageIds', itemIndex, ''),
				'Message IDs',
			).join(',');
		} else {
			qs['chat_id'] = requireInt64(
				getParameter<unknown>(context, 'chatId', itemIndex, ''),
				'Chat ID',
			);
		}
		return await request(context, 'GET', '/messages', qs);
	}
	if (operation === 'getVideo') {
		const videoToken = requireString(
			getParameter<unknown>(context, 'videoIdentifier', itemIndex, ''),
			'Video Token',
		);
		return await request(context, 'GET', `/videos/${encodePath(videoToken)}`);
	}
	if (operation === 'send') {
		const sendTo = getParameter<string>(context, 'sendTo', itemIndex, 'user');
		const recipientId = requireInt64(
			getParameter<unknown>(context, 'recipientId', itemIndex, ''),
			'Recipient ID',
		);
		if (/^-?0+$/.test(recipientId)) {
			throw new ApplicationError(
				sendTo === 'chat'
					? 'Chat ID cannot be 0. For Max Trigger workflows use message.recipient.chat_id when sending to a chat.'
					: 'User ID cannot be 0. For Max Trigger workflows use message.sender.user_id when sending to a user.',
			);
		}
		return await request(
			context,
			'POST',
			'/messages',
			{
				[sendTo === 'chat' ? 'chat_id' : 'user_id']: recipientId,
				disable_link_preview: getParameter<boolean>(
					context,
					'disableLinkPreview',
					itemIndex,
					false,
				),
			},
			buildMessageBody(context, itemIndex, {
				includeNotify: true,
				allowLink: true,
				allowEmptyAttachments: false,
			}),
		);
	}
	if (operation === 'update') {
		const messageId = requireString(
			getParameter<unknown>(context, 'messageId', itemIndex, ''),
			'Message ID',
		);
		return await request(
			context,
			'PUT',
			'/messages',
			{
				message_id: messageId,
				disable_link_preview: getParameter<boolean>(
					context,
					'disableLinkPreview',
					itemIndex,
					false,
				),
			},
			buildMessageBody(context, itemIndex, {
				includeNotify: true,
				allowLink: true,
				allowEmptyAttachments: true,
			}),
		);
	}
	if (operation === 'answerCallback') {
		const callbackId = requireString(
			getParameter<unknown>(context, 'callbackId', itemIndex, ''),
			'Callback ID',
		);
		const body: IDataObject = {};
		const notification = optionalString(
			getParameter<unknown>(context, 'notification', itemIndex, ''),
		);
		if (notification) {
			body['notification'] = notification;
		}
		if (getParameter<boolean>(context, 'updateMessage', itemIndex, false)) {
			body['message'] = buildMessageBody(context, itemIndex, {
				includeNotify: false,
				allowLink: true,
				allowEmptyAttachments: true,
			});
		}
		if (Object.keys(body).length === 0) {
			throw new ApplicationError('Provide a notification or enable Update Message');
		}
		return await request(
			context,
			'POST',
			'/answers',
			{
				callback_id: callbackId,
				disable_link_preview: getParameter<boolean>(
					context,
					'disableLinkPreview',
					itemIndex,
					false,
				),
			},
			body,
		);
	}
	throw new ApplicationError(`Unsupported Message operation: ${operation}`);
}

async function executeSubscriptionOperation(
	context: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<unknown> {
	if (operation === 'getMany') {
		return await request(context, 'GET', '/subscriptions');
	}

	const url = normalizeMaxWebhookUrl(
		requireString(getParameter<unknown>(context, 'url', itemIndex, ''), 'Webhook URL'),
	);
	if (!url.startsWith('https://')) {
		throw new ApplicationError('Webhook URL must use HTTPS');
	}
	if (operation === 'delete') {
		return await request(context, 'DELETE', '/subscriptions', { url });
	}
	if (operation === 'create') {
		const updateTypes = getParameter<string[]>(context, 'updateTypes', itemIndex, []);
		if (updateTypes.length === 0) {
			throw new ApplicationError('Select at least one webhook update type');
		}
		const body: IDataObject = { url, update_types: updateTypes };
		const secret = optionalString(getParameter<unknown>(context, 'secret', itemIndex, ''));
		if (secret) {
			if (secret.length < 5 || secret.length > 256) {
				throw new ApplicationError('Webhook Secret must contain from 5 to 256 characters');
			}
			if (!/^[a-zA-Z0-9_-]+$/.test(secret)) {
				throw new ApplicationError(
					'Webhook Secret can contain only letters, numbers, underscores, and hyphens',
				);
			}
			body['secret'] = secret;
		}
		const version = optionalString(getParameter<unknown>(context, 'version', itemIndex, ''));
		if (version) {
			body['version'] = version;
		}
		return await request(context, 'POST', '/subscriptions', undefined, body);
	}
	throw new ApplicationError(`Unsupported Subscription operation: ${operation}`);
}

async function executeOperation(
	context: IExecuteFunctions,
	resource: string,
	operation: string,
	itemIndex: number,
): Promise<unknown> {
	switch (resource) {
		case 'bot':
			return await executeBotOperation(context, operation, itemIndex);
		case 'chat':
			return await executeChatOperation(context, operation, itemIndex);
		case 'chatAdmin':
			return await executeAdminOperation(context, operation, itemIndex);
		case 'chatMember':
			return await executeMemberOperation(context, operation, itemIndex);
		case 'comment':
			return await executeCommentOperation(context, operation, itemIndex);
		case 'message':
			return await executeMessageOperation(context, operation, itemIndex);
		case 'subscription':
			return await executeSubscriptionOperation(context, operation, itemIndex);
		default:
			throw new ApplicationError(`Unsupported resource: ${resource}`);
	}
}

/**
 * Advanced, docs-first operations that do not fit the compact legacy Max node.
 * Keeping these operations separate avoids breaking existing n8n workflows while
 * presenting the broader API as coherent resources.
 */
export class MaxApiOperations implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Max API',
		name: 'maxApiOperations',
		icon: 'file:max.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Use advanced operations from the current MAX Bot API',
		defaults: { name: 'Max API' },
		inputs: [MAIN_CONNECTION],
		outputs: [MAIN_CONNECTION],
		credentials: [{ name: 'maxApi', required: true }],
		properties: MAX_API_OPERATION_PROPERTIES,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const result = await executeOperation(this, resource, operation, itemIndex);
				returnData.push({ json: asOutputJson(result), pairedItem: { item: itemIndex } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error instanceof Error ? error.message : String(error) },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				if (error instanceof NodeOperationError || error instanceof NodeApiError) {
					throw error;
				}
				throw new NodeOperationError(
					this.getNode(),
					error instanceof Error ? error.message : String(error),
					{ itemIndex },
				);
			}
		}

		return [returnData];
	}
}
