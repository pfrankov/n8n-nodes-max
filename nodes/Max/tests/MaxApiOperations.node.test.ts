import type { IExecuteFunctions, INodeExecutionData, INodePropertyOptions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { MaxApiOperations } from '../MaxApiOperations.node';

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

function findOperations(node: MaxApiOperations, resource: string) {
	return node.description.properties.find(
		(property) =>
			property.name === 'operation' &&
			property.displayOptions?.show?.['resource']?.includes(resource),
	)?.options;
}

describe('Max API Operations node', () => {
	let node: MaxApiOperations;

	beforeEach(() => {
		node = new MaxApiOperations();
	});

	describe('description', () => {
		it('exposes the complete supported resource split without obsolete chat listing or long polling', () => {
			expect(node.description.displayName).toBe('Max API');
			expect(node.description.name).toBe('maxApiOperations');

			const resources = node.description.properties.find(
				(property) => property.name === 'resource',
			)?.options;
			expect(resources).toEqual(
				expect.arrayContaining([
					{ name: 'Bot', value: 'bot' },
					{ name: 'Chat', value: 'chat' },
					{ name: 'Chat Administrator', value: 'chatAdmin' },
					{ name: 'Chat Member', value: 'chatMember' },
					{ name: 'Comment', value: 'comment' },
					{ name: 'Message', value: 'message' },
					{ name: 'Subscription', value: 'subscription' },
				]),
			);

			expect(findOperations(node, 'bot')).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ value: 'get' }),
					expect.objectContaining({ value: 'setCommands' }),
				]),
			);
			expect(findOperations(node, 'message')).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ value: 'answerCallback' }),
					expect.objectContaining({ value: 'get' }),
					expect.objectContaining({ value: 'getMany' }),
					expect.objectContaining({ value: 'getVideo' }),
					expect.objectContaining({ value: 'send' }),
					expect.objectContaining({ value: 'update' }),
				]),
			);
			expect(findOperations(node, 'chat')).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ value: 'getMembership' }),
					expect.objectContaining({ value: 'getPinnedMessage' }),
					expect.objectContaining({ value: 'pinMessage' }),
					expect.objectContaining({ value: 'sendAction' }),
					expect.objectContaining({ value: 'unpinMessage' }),
					expect.objectContaining({ value: 'update' }),
				]),
			);

			const allOperationValues = node.description.properties
				.filter((property) => property.name === 'operation')
				.flatMap((property) => property.options ?? [])
				.filter((option): option is INodePropertyOptions => 'value' in option)
				.map((option) => option.value);
			expect(allOperationValues).not.toContain('getChats');
			expect(allOperationValues).not.toContain('longPolling');
		});

		it('offers current message and clipboard inline keyboard buttons', () => {
			const keyboard = node.description.properties.find(
				(property) => property.name === 'keyboard',
			) as any;
			const buttonValues = keyboard.options[0].values.find(
				(value: { name: string }) => value.name === 'buttons',
			).options[0].values;
			const type = buttonValues.find((value: { name: string }) => value.name === 'type');

			expect(type.options).toEqual(
				expect.arrayContaining([
					{ name: 'Clipboard', value: 'clipboard' },
					{ name: 'Message', value: 'message' },
				]),
			);
		});
	});

	describe('execute', () => {
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

			await node.execute.call(context);

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

			await node.execute.call(context);

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

			await node.execute.call(context);

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

			await node.execute.call(context);

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

			await node.execute.call(context);

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

			await node.execute.call(context);

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

			await node.execute.call(context);

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

			await node.execute.call(context);

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

			await node.execute.call(context);

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

			await expect(node.execute.call(context)).rejects.toThrow(
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

			await expect(node.execute.call(context)).rejects.toThrow(expectedMessage);
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

				await expect(node.execute.call(context)).rejects.toThrow(
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

			await expect(node.execute.call(context)).rejects.toThrow(
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

			const error = await node.execute.call(context).catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(NodeApiError);
			expect(error).not.toEqual(expect.objectContaining({ name: 'NodeOperationError' }));
		});
	});
});
