import type { IExecuteFunctions, INodeExecutionData, INodeType } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { executeMaxApiNode } from '../MaxApiExecution';
import { MaxBot } from '../MaxBot.node';
import { MaxChat } from '../MaxChat.node';
import { MaxChatAdministrator } from '../MaxChatAdministrator.node';
import { MaxChatMember } from '../MaxChatMember.node';
import { MaxComment } from '../MaxComment.node';
import { MaxMessage } from '../MaxMessage.node';
import { MaxSubscription } from '../MaxSubscription.node';
import { MaxVideo } from '../MaxVideo.node';
import { MaxLegacyExecution } from '../MaxLegacyExecution';

function createExecuteContext(
	parameters: Record<string, unknown>,
	response: unknown = { success: true },
): { context: IExecuteFunctions; httpRequest: jest.Mock } {
	const httpRequest = jest.fn().mockResolvedValue(response);
	const context = {
		getNodeParameter: jest.fn((name: string, _index: number, defaultValue?: unknown) =>
			parameters[name] === undefined ? defaultValue : parameters[name],
		),
		getCredentials: jest.fn().mockResolvedValue({
			accessToken: 'test-token',
			baseUrl: 'https://platform-api.max.ru',
		}),
		getInputData: jest.fn().mockReturnValue([{ json: {} }] as INodeExecutionData[]),
		continueOnFail: jest.fn().mockReturnValue(false),
		getNode: jest.fn().mockReturnValue({ name: 'Max API' }),
		helpers: { httpRequest },
	} as unknown as IExecuteFunctions;

	return { context, httpRequest };
}

async function execute(context: IExecuteFunctions) {
	const resource = context.getNodeParameter('resource', 0) as string;
	return await executeMaxApiNode(context, resource);
}

describe('focused MAX API nodes', () => {
	describe('description', () => {
		it('exposes one node per supported resource without a resource selector', () => {
			const nodes: INodeType[] = [
				new MaxBot(),
				new MaxChat(),
				new MaxChatAdministrator(),
				new MaxChatMember(),
				new MaxComment(),
				new MaxMessage(),
				new MaxSubscription(),
				new MaxVideo(),
			];
			expect(nodes.map((node) => node.description.name)).toEqual([
				'maxBot',
				'maxChat',
				'maxChatAdministrator',
				'maxChatMember',
				'maxComment',
				'maxMessage',
				'maxSubscription',
				'maxVideo',
			]);
			expect(
				nodes.every((node) => !node.description.properties.some((p) => p.name === 'resource')),
			).toBe(true);

			const allOperationValues = nodes.flatMap((node) =>
				node.description.properties
					.filter((property) => property.name === 'operation')
					.flatMap((property) => property.options ?? [])
					.map((option) => ('value' in option ? option.value : undefined)),
			);
			expect(allOperationValues).not.toContain('getChats');
			expect(allOperationValues).not.toContain('longPolling');
			expect(
				new MaxMessage().description.properties.find((p) => p.name === 'operation')?.options,
			).not.toContainEqual(expect.objectContaining({ value: 'getVideo' }));
			expect(
				new MaxVideo().description.properties.find((p) => p.name === 'operation')?.options,
			).toEqual([expect.objectContaining({ value: 'getVideo' })]);
		});

		it('offers current message and clipboard inline keyboard buttons', () => {
			const keyboard = new MaxMessage().description.properties.find(
				(property) => property.name === 'additionalFields',
			) as any;
			const inlineKeyboard = keyboard.options.find(
				(value: { name: string }) => value.name === 'inlineKeyboard',
			);
			const buttonValues = inlineKeyboard.options[0].values[0].options[0].values;
			const type = buttonValues.find((value: { name: string }) => value.name === 'type');

			expect(type.options).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: 'Clipboard', value: 'clipboard' }),
					expect.objectContaining({ name: 'Message', value: 'message' }),
				]),
			);
		});
	});

	describe('execute', () => {
		it('injects the removed resource parameter for migrated operations', async () => {
			const { context } = createExecuteContext({
				operation: 'sendMessage',
			});
			const executeLegacy = jest
				.spyOn(MaxLegacyExecution.prototype, 'execute')
				.mockImplementation(async function (this: IExecuteFunctions) {
					return [[{ json: { resource: this.getNodeParameter('resource', 0) } }]];
				});

			const result = await new MaxMessage().execute.call(context);

			expect(result).toEqual([[{ json: { resource: 'message' } }]]);
			expect(executeLegacy).toHaveBeenCalledTimes(1);
			executeLegacy.mockRestore();
		});

		it('runs current API operations without a resource parameter', async () => {
			const { context, httpRequest } = createExecuteContext({
				operation: 'get',
				messageId: 'mid.1',
			});

			await new MaxMessage().execute.call(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'GET',
					url: 'https://platform-api2.max.ru/messages/mid.1',
				}),
			);
		});

		it('updates bot commands and allows an empty list to clear them', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'bot',
				operation: 'setCommands',
				commands: {
					command: [
						{ name: 'start', description: 'Start bot' },
						{ name: 'help', description: 'Show help' },
					],
				},
			});

			await execute(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'PATCH',
					url: 'https://platform-api2.max.ru/me/commands',
					body: {
						commands: [
							{ name: 'start', description: 'Start bot' },
							{ name: 'help', description: 'Show help' },
						],
					},
				}),
			);
		});

		it('gets messages by chat ID with the documented filters', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'message',
				operation: 'getMany',
				getMessagesBy: 'chatId',
				chatId: '-9223372036854775807',
				from: 1000,
				to: 2000,
				limit: 75,
			});

			await execute(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'GET',
					url: 'https://platform-api2.max.ru/messages',
					qs: {
						chat_id: '-9223372036854775807',
						count: 75,
						from: 1000,
						to: 2000,
					},
				}),
			);
		});

		it('sends current message and clipboard keyboard button types', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'message',
				operation: 'send',
				sendTo: 'chat',
				recipientId: '-123',
				text: 'Choose',
				format: 'plain',
				disableLinkPreview: false,
				notify: false,
				attachmentsJson: '[]',
				keyboard: {
					rows: [
						{
							buttons: {
								button: [
									{ type: 'message', text: 'Quick answer' },
									{ type: 'clipboard', text: 'Copy', payload: 'PROMO-42' },
								],
							},
						},
					],
				},
			});

			await execute(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'POST',
					url: 'https://platform-api2.max.ru/messages',
					qs: { chat_id: '-123', disable_link_preview: false },
					body: {
						text: 'Choose',
						notify: false,
						attachments: [
							{
								type: 'inline_keyboard',
								payload: {
									buttons: [
										[
											{ type: 'message', text: 'Quick answer' },
											{ type: 'clipboard', text: 'Copy', payload: 'PROMO-42' },
										],
									],
								},
							},
						],
					},
				}),
			);
		});

		it('answers a callback with both notification and an updated message', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'message',
				operation: 'answerCallback',
				callbackId: 'callback-1',
				disableLinkPreview: true,
				notification: 'Done',
				updateMessage: true,
				text: 'Updated',
				format: 'markdown',
				attachmentsJson: '[]',
				keyboard: {},
			});

			await execute(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'POST',
					url: 'https://platform-api2.max.ru/answers',
					qs: { callback_id: 'callback-1', disable_link_preview: true },
					body: {
						notification: 'Done',
						message: { text: 'Updated', format: 'markdown', attachments: [] },
					},
				}),
			);
		});

		it('updates chat description and preserves notify=false', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'chat',
				operation: 'update',
				chatId: '-123',
				updateFields: { description: '', notify: false, title: 'New title' },
			});

			await execute(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'PATCH',
					url: 'https://platform-api2.max.ru/chats/-123',
					body: { description: '', notify: false, title: 'New title' },
				}),
			);
		});

		it('adds or replaces administrator permissions using the current permission names', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'chatAdmin',
				operation: 'set',
				chatId: '-123',
				userId: '9223372036854775807',
				alias: 'Moderator',
				permissions: ['read_all_messages', 'edit', 'delete', 'write', 'edit_link'],
			});

			await execute(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'POST',
					url: 'https://platform-api2.max.ru/chats/-123/members/admins',
					body: {
						admins: [
							{
								user_id: '9223372036854775807',
								alias: 'Moderator',
								permissions: ['read_all_messages', 'edit', 'delete', 'write', 'edit_link'],
							},
						],
					},
				}),
			);
		});

		it('removes a member while preserving block=false', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'chatMember',
				operation: 'remove',
				chatId: '-123',
				userId: '777',
				block: false,
			});

			await execute(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'DELETE',
					url: 'https://platform-api2.max.ru/chats/-123/members',
					qs: { block: false, user_id: '777' },
				}),
			);
		});

		it('updates a comment using comment_id in query parameters', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'comment',
				operation: 'update',
				messageId: 'post-1',
				commentId: 'comment-1',
				text: 'Edited',
				format: 'html',
				replyToCommentId: '',
			});

			await execute(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'PUT',
					url: 'https://platform-api2.max.ru/messages/post-1/comments',
					qs: { comment_id: 'comment-1' },
					body: { text: 'Edited', format: 'html' },
				}),
			);
		});

		it('creates an explicit webhook subscription without exposing long polling', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'subscription',
				operation: 'create',
				url: 'https://пример.рф/max',
				updateTypes: ['message_created', 'comment_created'],
				secret: 'secret-value',
				version: '0.0.1',
			});

			await execute(context);

			expect(httpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					method: 'POST',
					url: 'https://platform-api2.max.ru/subscriptions',
					body: {
						url: 'https://xn--e1afmkfd.xn--p1ai/max',
						update_types: ['message_created', 'comment_created'],
						secret: 'secret-value',
						version: '0.0.1',
					},
				}),
			);
		});

		it('rejects webhook secrets with unsupported characters before calling MAX', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'subscription',
				operation: 'create',
				url: 'https://example.com/max',
				updateTypes: ['message_created'],
				secret: 'not valid!',
			});

			await expect(execute(context)).rejects.toThrow(
				'Webhook Secret can contain only letters, numbers, underscores, and hyphens',
			);
			expect(httpRequest).not.toHaveBeenCalled();
		});

		it.each([
			[
				'user',
				'User ID cannot be 0. For Max Trigger workflows use message.sender.user_id when sending to a user.',
			],
			[
				'chat',
				'Chat ID cannot be 0. For Max Trigger workflows use message.recipient.chat_id when sending to a chat.',
			],
		])('rejects a zero %s recipient before calling MAX', async (sendTo, expectedMessage) => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'message',
				operation: 'send',
				sendTo,
				recipientId: '0',
				text: 'Hello',
				format: 'plain',
				attachmentsJson: '',
				keyboard: {},
			});

			await expect(execute(context)).rejects.toThrow(expectedMessage);
			expect(httpRequest).not.toHaveBeenCalled();
		});

		it.each(['00', '000', '-0', '-00'])(
			'rejects the textual zero recipient ID %s before calling MAX',
			async (recipientId) => {
				const { context, httpRequest } = createExecuteContext({
					resource: 'message',
					operation: 'send',
					sendTo: 'user',
					recipientId,
					text: 'Hello',
					format: 'plain',
					attachmentsJson: '',
					keyboard: {},
				});

				await expect(execute(context)).rejects.toThrow(
					'User ID cannot be 0. For Max Trigger workflows use message.sender.user_id when sending to a user.',
				);
				expect(httpRequest).not.toHaveBeenCalled();
			},
		);

		it('rejects an empty attachments array as the only content of a new message', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'message',
				operation: 'send',
				sendTo: 'user',
				recipientId: '123',
				text: '',
				format: 'plain',
				disableLinkPreview: false,
				notify: true,
				attachmentsJson: '[]',
				keyboard: {},
				replyToMessageId: '',
				forwardMessageId: '',
			});

			await expect(execute(context)).rejects.toThrow(
				'Provide message text, attachments, a keyboard, or a reply/forward link',
			);
			expect(httpRequest).not.toHaveBeenCalled();
		});

		it('preserves NodeApiError details from upstream MAX failures', async () => {
			const { context, httpRequest } = createExecuteContext({
				resource: 'bot',
				operation: 'get',
			});
			httpRequest.mockRejectedValue({
				message: 'Service unavailable',
				response: {
					statusCode: 503,
					body: { code: 'service.unavailable', message: 'Try later' },
				},
			});

			const error = await execute(context).catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(NodeApiError);
			expect(error).not.toEqual(expect.objectContaining({ name: 'NodeOperationError' }));
		});
	});
});
