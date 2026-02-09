import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import { createMaxBotInstance, sendMessage, editMessage, deleteMessage, answerCallbackQuery, getChatInfo, leaveChat, validateAndFormatText, addAdditionalFields, handleAttachments, processKeyboardFromParameters, processKeyboardFromAdditionalFields } from './GenericFunctions';

/**
 * Max messenger node for n8n
 * 
 * This node provides comprehensive integration with Max messenger Bot API,
 * enabling users to send messages, manage chats, handle attachments,
 * and create interactive keyboard interfaces.
 * 
 * Supported operations:
 * - Send messages to users and chats with text formatting
 * - Edit and delete existing messages
 * - Handle file attachments (images, videos, audio, documents)
 * - Create inline keyboards with callback buttons
 * - Answer callback queries from button interactions
 * - Get chat information and manage chat membership
 * 
 * @implements {INodeType}
 */
export class Max implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Max',
		name: 'max',
		icon: 'file:max.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with Max messenger',
		defaults: {
			name: 'Max',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'maxApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Message',
						value: 'message',
					},
					{
						name: 'Chat',
						value: 'chat',
					},
				],
				default: 'message',
			},
			// Message Resource
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['message'],
					},
				},
				options: [
					{
						name: 'Send Message',
						value: 'sendMessage',
						description: 'Send a message to a user or chat',
						action: 'Send a message',
					},
					{
						name: 'Edit Message',
						value: 'editMessage',
						description: 'Edit an existing message',
						action: 'Edit a message',
					},
					{
						name: 'Delete Message',
						value: 'deleteMessage',
						description: 'Delete an existing message',
						action: 'Delete a message',
					},
					{
						name: 'Answer Callback Query',
						value: 'answerCallbackQuery',
						description: 'Answer a callback query from an inline keyboard button',
						action: 'Answer a callback query',
					},
				],
				default: 'sendMessage',
			},
			// Send Message Operation
			{
				displayName: 'Send To',
				name: 'sendTo',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendMessage'],
					},
				},
				options: [
					{
						name: 'User',
						value: 'user',
						description: 'Send message to a specific user',
					},
					{
						name: 'Chat',
						value: 'chat',
						description: 'Send message to a chat/group',
					},
				],
				default: 'user',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendMessage'],
						sendTo: ['user'],
					},
				},
				default: '',
				description: 'The ID of the user to send the message to',
			},
			{
				displayName: 'Chat ID',
				name: 'chatId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendMessage'],
						sendTo: ['chat'],
					},
				},
				default: '',
				description: 'The ID of the chat to send the message to',
			},
			{
				displayName: 'Message Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendMessage'],
					},
				},
				default: '',
				description: 'The text content of the message (max 4000 characters)',
			},
			{
				displayName: 'Text Format',
				name: 'format',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendMessage'],
					},
				},
				options: [
					{
						name: 'Plain Text',
						value: 'plain',
						description: 'Send message as plain text',
					},
					{
						name: 'HTML',
						value: 'html',
						description: 'Send message with HTML formatting',
					},
					{
						name: 'Markdown',
						value: 'markdown',
						description: 'Send message with Markdown formatting',
					},
				],
				default: 'plain',
				description: 'The format of the message text',
			},

			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['sendMessage'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'Attachments',
						name: 'attachments',
						type: 'fixedCollection',
						placeholder: 'Add Attachment',
						default: {},
						typeOptions: {
							multipleValues: true,
						},
						options: [
							{
								name: 'attachment',
								displayName: 'Attachment',
								values: [
									{
										displayName: 'Binary Property',
										name: 'binaryProperty',
										type: 'string',
										default: 'data',
										description: 'Name of the binary property containing the file data',
									},
									{
										displayName: 'File Name',
										name: 'fileName',
										type: 'string',
										default: '',
										description: 'Name of the file (optional, will be auto-detected if not provided)',
									},
									{
										displayName: 'File URL',
										name: 'fileUrl',
										type: 'string',
										default: '',
										description: 'URL of the file to upload',
									},
									{
										displayName: 'Input Type',
										name: 'inputType',
										type: 'options',
										options: [
											{
												name: 'Binary Data',
												value: 'binary',
												description: 'Use binary data from previous node',
											},
											{
												name: 'URL',
												value: 'url',
												description: 'Upload from URL',
											},
										],
										default: 'binary',
										description: 'How to provide the file',
									},
									{
										displayName: 'Type',
										name: 'type',
										type: 'options',
										options: [
											{
												name: 'Image',
												value: 'image',
											},
											{
												name: 'Video',
												value: 'video',
											},
											{
												name: 'Audio',
												value: 'audio',
											},
											{
												name: 'File',
												value: 'file',
											},
										],
										default: 'image',
										description: 'Type of attachment to send',
									},
								],
							},
						],
					},
					{
						displayName: 'Disable Link Preview',
						name: 'disable_link_preview',
						type: 'boolean',
						default: false,
						description: 'Whether to disable link previews for URLs in the message',
					},
					{
						displayName: 'Inline Keyboard',
						name: 'inlineKeyboard',
						type: 'fixedCollection',
						placeholder: 'Add Button Row',
						default: {},
						typeOptions: {
							multipleValues: true,
						},
						options: [
							{
								name: 'buttons',
								displayName: 'Button Row',
								values: [
									{
										displayName: 'Row',
										name: 'row',
										type: 'fixedCollection',
										placeholder: 'Add Button',
										typeOptions: {
											multipleValues: true,
										},
										default: {},
										options: [
											{
												name: 'button',
												displayName: 'Button',
												values: [
													{
														displayName: 'Button Intent',
														name: 'intent',
														type: 'options',
														options: [
															{
																name: 'Default',
																value: 'default',
																description: 'Standard button appearance',
															},
															{
																name: 'Positive',
																value: 'positive',
																description: 'Green/positive button appearance',
															},
															{
																name: 'Negative',
																value: 'negative',
																description: 'Red/negative button appearance',
															},
														],
														default: 'default',
														description: 'Visual style of the button',
													},
													{
														displayName: 'Button Text',
														name: 'text',
														type: 'string',
														required: true,
														default: '',
														description: 'Text displayed on the button (max 128 characters)',
													},
													{
														displayName: 'Button Type',
														name: 'type',
														type: 'options',
														options: [
															{
																name: 'Callback',
																value: 'callback',
																description: 'Button that sends callback data when pressed',
															},
															{
																name: 'Create Chat',
																value: 'chat',
																description: 'Button that creates a new chat when clicked',
															},
															{
																name: 'Link',
																value: 'link',
																description: 'Button that opens a URL when pressed',
															},
															{
																name: 'Open App',
																value: 'open_app',
																description: 'Button that opens a MAX Mini App URL',
															},
															{
																name: 'Request Contact',
																value: 'request_contact',
																description: 'Button that requests user contact information',
															},
															{
																name: 'Request Location',
																value: 'request_geo_location',
																description: 'Button that requests user location',
															},
														],
														default: 'callback',
														description: 'Type of button action',
													},
													{
														displayName: 'Callback Data',
														name: 'payload',
														type: 'string',
														required: true,
														displayOptions: {
															show: {
																type: ['callback'],
															},
														},
														default: '',
														description: 'Data sent back when button is pressed (max 1024 characters)',
													},
													{
														displayName: 'Chat Description',
														name: 'chatDescription',
														type: 'string',
														displayOptions: {
															show: {
																type: ['chat'],
															},
														},
														default: '',
														description: 'Optional description of the chat (max 400 characters)',
													},
													{
														displayName: 'Chat Title',
														name: 'chatTitle',
														type: 'string',
														required: true,
														displayOptions: {
															show: {
																type: ['chat'],
															},
														},
														default: '',
														description: 'Title of the chat to be created (max 200 characters)',
													},
													{
														displayName: 'Start Payload',
														name: 'startPayload',
														type: 'string',
														displayOptions: {
															show: {
																type: ['chat'],
															},
														},
														default: '',
														description: 'Optional payload sent to the bot when the chat is created (max 512 characters)',
													},
													{
														displayName: 'URL',
														name: 'url',
														type: 'string',
														required: true,
														displayOptions: {
															show: {
																type: ['link', 'open_app'],
															},
														},
														default: '',
														description: 'URL to open when button is pressed',
													},
													{
														displayName: 'UUID',
														name: 'uuid',
														type: 'string',
														displayOptions: {
															show: {
																type: ['chat'],
															},
														},
														default: '',
														description: 'Optional chat button identifier reused when editing the keyboard',
													},
												],
											},
										],
									},
								],
							},
						],
					},
					{
						displayName: 'Notify',
						name: 'notify',
						type: 'boolean',
						default: true,
						description: 'Whether to notify chat participants about the message',
					},
					{
						displayName: 'Reply to Message ID',
						name: 'replyToMessageId',
						type: 'string',
						default: '',
						description: 'ID of the message to reply to (optional)',
					},
				],
			},
			// Edit Message Operation
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessage'],
					},
				},
				default: '',
				description: 'The ID of the message to edit',
			},
			{
				displayName: 'New Message Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessage'],
					},
				},
				default: '',
				description: 'The new text content of the message (max 4000 characters)',
			},
			{
				displayName: 'Text Format',
				name: 'format',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessage'],
					},
				},
				options: [
					{
						name: 'Plain Text',
						value: 'plain',
						description: 'Edit message as plain text',
					},
					{
						name: 'HTML',
						value: 'html',
						description: 'Edit message with HTML formatting',
					},
					{
						name: 'Markdown',
						value: 'markdown',
						description: 'Edit message with Markdown formatting',
					},
				],
				default: 'plain',
				description: 'The format of the message text',
			},
			{
				displayName: 'Inline Keyboard',
				name: 'inlineKeyboard',
				type: 'fixedCollection',
				placeholder: 'Add Button Row',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['editMessage'],
					},
				},
				default: {},
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						name: 'buttons',
						displayName: 'Button Row',
						values: [
							{
								displayName: 'Row',
								name: 'row',
								type: 'fixedCollection',
								placeholder: 'Add Button',
								typeOptions: {
									multipleValues: true,
								},
								default: {},
								options: [
									{
										name: 'button',
										displayName: 'Button',
										values: [
											{
												displayName: 'Button Intent',
												name: 'intent',
												type: 'options',
												options: [
													{
														name: 'Default',
														value: 'default',
														description: 'Standard button appearance',
													},
													{
														name: 'Positive',
														value: 'positive',
														description: 'Green/positive button appearance',
													},
													{
														name: 'Negative',
														value: 'negative',
														description: 'Red/negative button appearance',
													},
												],
												default: 'default',
												description: 'Visual style of the button',
											},
											{
												displayName: 'Button Text',
												name: 'text',
												type: 'string',
												required: true,
												default: '',
												description: 'Text displayed on the button (max 128 characters)',
											},
											{
												displayName: 'Button Type',
												name: 'type',
												type: 'options',
												options: [
													{
														name: 'Callback',
														value: 'callback',
														description: 'Button that sends callback data when pressed',
													},
													{
														name: 'Create Chat',
														value: 'chat',
														description: 'Button that creates a new chat when clicked',
													},
													{
														name: 'Link',
														value: 'link',
														description: 'Button that opens a URL when pressed',
													},
													{
														name: 'Open App',
														value: 'open_app',
														description: 'Button that opens a MAX Mini App URL',
													},
													{
														name: 'Request Contact',
														value: 'request_contact',
														description: 'Button that requests user contact information',
													},
													{
														name: 'Request Location',
														value: 'request_geo_location',
														description: 'Button that requests user location',
													},
												],
												default: 'callback',
												description: 'Type of button action',
											},
											{
												displayName: 'Callback Data',
												name: 'payload',
												type: 'string',
												required: true,
												displayOptions: {
													show: {
														type: ['callback'],
													},
												},
												default: '',
												description: 'Data sent back when button is pressed (max 1024 characters)',
											},
											{
												displayName: 'Chat Description',
												name: 'chatDescription',
												type: 'string',
												displayOptions: {
													show: {
														type: ['chat'],
													},
												},
												default: '',
												description: 'Optional description of the chat (max 400 characters)',
											},
											{
												displayName: 'Chat Title',
												name: 'chatTitle',
												type: 'string',
												required: true,
												displayOptions: {
													show: {
														type: ['chat'],
													},
												},
												default: '',
												description: 'Title of the chat to be created (max 200 characters)',
											},
											{
												displayName: 'Start Payload',
												name: 'startPayload',
												type: 'string',
												displayOptions: {
													show: {
														type: ['chat'],
													},
												},
												default: '',
												description: 'Optional payload sent to the bot when the chat is created (max 512 characters)',
											},
											{
												displayName: 'URL',
												name: 'url',
												type: 'string',
												required: true,
												displayOptions: {
													show: {
														type: ['link', 'open_app'],
													},
												},
												default: '',
												description: 'URL to open when button is pressed',
											},
											{
												displayName: 'UUID',
												name: 'uuid',
												type: 'string',
												displayOptions: {
													show: {
														type: ['chat'],
													},
												},
												default: '',
												description: 'Optional chat button identifier reused when editing the keyboard',
											},
										],
									},
								],
							},
						],
					},
				],
			},
			// Delete Message Operation
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['deleteMessage'],
					},
				},
				default: '',
				description: 'The ID of the message to delete',
			},
			// Answer Callback Query Operation
			{
				displayName: 'Callback Query ID',
				name: 'callbackQueryId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['answerCallbackQuery'],
					},
				},
				default: '',
				description: 'The ID of the callback query to answer',
			},
			{
				displayName: 'Response Text',
				name: 'text',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['answerCallbackQuery'],
					},
				},
				default: '',
				description: 'Optional one-time notification text to show to the user',
			},
			// Chat Resource
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['chat'],
					},
				},
				options: [
					{
						name: 'Get Chat Info',
						value: 'getChatInfo',
						description: 'Get information about a chat',
						action: 'Get chat information',
					},
					{
						name: 'Leave Chat',
						value: 'leaveChat',
						description: 'Leave a chat/group',
						action: 'Leave a chat',
					},
				],
				default: 'getChatInfo',
			},
			// Chat Operations Parameters
			{
				displayName: 'Chat ID',
				name: 'chatId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['chat'],
						operation: ['getChatInfo', 'leaveChat'],
					},
				},
				default: '',
				description: 'The ID of the chat',
			},
		],
	};

	/**
	 * Execute the Max messenger node operations
	 * 
	 * Processes input data and executes the specified operation (send message, edit message, etc.)
	 * based on the configured resource and operation parameters.
	 * 
	 * @param this - The execution context providing access to node parameters and credentials
	 * @returns Promise resolving to an array of node execution data containing API responses
	 * @throws {NodeOperationError} When validation fails or required parameters are missing
	 * @throws {NodeApiError} When Max API requests fail
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0);
		const operation = this.getNodeParameter('operation', 0);

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'message') {
					if (operation === 'sendMessage') {
						// Get parameters
						const sendTo = this.getNodeParameter('sendTo', i) as string;
						const text = this.getNodeParameter('text', i) as string;
						const format = this.getNodeParameter('format', i) as string;

						// Get additional fields
						const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						const replyToMessageId = additionalFields['replyToMessageId'] as string || '';

						// Validate and format text
						const formattedText = validateAndFormatText(text, format);

						// Get recipient ID with enhanced validation
						let recipientId: number;
						if (sendTo === 'user') {
							const userId = this.getNodeParameter('userId', i);
							// Handle both string and number inputs
							const userIdStr = String(userId || '');
							if (!userIdStr || userIdStr.trim() === '') {
								throw new NodeOperationError(this.getNode(), 'User ID is required and cannot be empty', { itemIndex: i });
							}
							recipientId = parseInt(userIdStr.trim(), 10);
							if (isNaN(recipientId)) {
								throw new NodeOperationError(this.getNode(), `Invalid User ID: "${userIdStr}". Must be a number.`, { itemIndex: i });
							}
						} else {
							const chatId = this.getNodeParameter('chatId', i);
							// Handle both string and number inputs
							const chatIdStr = String(chatId || '');
							if (!chatIdStr || chatIdStr.trim() === '') {
								throw new NodeOperationError(this.getNode(), 'Chat ID is required and cannot be empty', { itemIndex: i });
							}
							recipientId = parseInt(chatIdStr.trim(), 10);
							if (isNaN(recipientId)) {
								throw new NodeOperationError(this.getNode(), `Invalid Chat ID: "${chatIdStr}". Must be a number.`, { itemIndex: i });
							}
						}

						// Build options object
						const options: IDataObject = {};

						// Add format if not plain text
						if (format !== 'plain') {
							options['format'] = format;
						}

						// Add reply link if replyToMessageId is provided
						if (replyToMessageId) {
							const trimmedReplyId = replyToMessageId.trim();
							// Basic validation for message ID format
							if (trimmedReplyId.length === 0) {
								throw new NodeOperationError(this.getNode(), 'Reply to Message ID cannot be empty', { itemIndex: i });
							}

							options['link'] = {
								type: 'reply',
								mid: trimmedReplyId,
							};
						}

						// Add additional fields
						addAdditionalFields.call(this, options, i);

						// Create Max Bot instance (needed for both attachments and keyboard)
						const bot = await createMaxBotInstance.call(this);

						// Handle attachments if provided
						const attachments = additionalFields['attachments'] as IDataObject || {};
						if (attachments && attachments['attachment'] && Array.isArray(attachments['attachment']) && attachments['attachment'].length > 0) {
							// Process attachments and add to options
							const currentItem = items[i];
							if (currentItem) {
								options['attachments'] = await handleAttachments.call(this, bot, attachments['attachment'] as any[], currentItem);
							}
						}

						// Handle inline keyboard if provided
						const inlineKeyboard = additionalFields['inlineKeyboard'] as IDataObject || {};
						if (inlineKeyboard && inlineKeyboard['buttons'] && Array.isArray(inlineKeyboard['buttons']) && inlineKeyboard['buttons'].length > 0) {
							// Process keyboard and add to attachments
							const keyboardAttachment = processKeyboardFromAdditionalFields(inlineKeyboard);
							if (keyboardAttachment) {
								// Add keyboard to attachments array
								if (!options['attachments']) {
									options['attachments'] = [];
								}
								(options['attachments'] as any[]).push(keyboardAttachment);
							}
						}

						// Send message using Max Bot API
						const responseData = await sendMessage.call(
							this,
							bot,
							sendTo as 'user' | 'chat',
							recipientId,
							formattedText,
							options,
						);

						returnData.push({
							json: responseData,
							pairedItem: {
								item: i,
							},
						});
					} else if (operation === 'editMessage') {
						// Get parameters
						const messageId = this.getNodeParameter('messageId', i) as string;
						const text = this.getNodeParameter('text', i) as string;
						const format = this.getNodeParameter('format', i) as string;

						// Validate message ID
						if (!messageId || messageId.trim() === '') {
							throw new NodeOperationError(this.getNode(), 'Message ID is required and cannot be empty', { itemIndex: i });
						}

						// Validate and format text
						const formattedText = validateAndFormatText(text, format);

						// Build options object
						const options: IDataObject = {};

						// Add format if not plain text
						if (format !== 'plain') {
							options['format'] = format;
						}

						// Create Max Bot instance
						const bot = await createMaxBotInstance.call(this);

						// Handle inline keyboard if provided
						const keyboardAttachment = processKeyboardFromParameters.call(this, i);
						if (keyboardAttachment) {
							// Add keyboard to attachments array
							options['attachments'] = [keyboardAttachment];
						}

						// Edit message using Max Bot API
						const responseData = await editMessage.call(
							this,
							bot,
							messageId.trim(),
							formattedText,
							options,
						);

						returnData.push({
							json: responseData,
							pairedItem: {
								item: i,
							},
						});
					} else if (operation === 'deleteMessage') {
						// Get parameters
						const messageId = this.getNodeParameter('messageId', i) as string;

						// Validate message ID
						if (!messageId || messageId.trim() === '') {
							throw new NodeOperationError(this.getNode(), 'Message ID is required and cannot be empty', { itemIndex: i });
						}

						// Create Max Bot instance
						const bot = await createMaxBotInstance.call(this);

						// Delete message using Max Bot API
						const responseData = await deleteMessage.call(
							this,
							bot,
							messageId.trim(),
						);

						returnData.push({
							json: responseData,
							pairedItem: {
								item: i,
							},
						});
					} else if (operation === 'answerCallbackQuery') {
						// Get parameters
						const callbackQueryId = this.getNodeParameter('callbackQueryId', i) as string;
						const text = this.getNodeParameter('text', i, '') as string;

						// Validate callback query ID
						if (!callbackQueryId || callbackQueryId.trim() === '') {
							throw new NodeOperationError(this.getNode(), 'Callback Query ID is required and cannot be empty', { itemIndex: i });
						}

						// Create Max Bot instance
						const bot = await createMaxBotInstance.call(this);

						// Answer callback query using Max Bot API
						const responseData = await answerCallbackQuery.call(
							this,
							bot,
							callbackQueryId.trim(),
							text,
						);

						returnData.push({
							json: responseData,
							pairedItem: {
								item: i,
							},
						});
					} else {
						throw new NodeOperationError(this.getNode(), `The operation '${operation}' is not supported for resource '${resource}'`, { itemIndex: i });
					}
				} else if (resource === 'chat') {
					if (operation === 'getChatInfo') {
						// Get parameters
						const chatId = this.getNodeParameter('chatId', i) as string;

						// Validate chat ID
						if (!chatId || chatId.trim() === '') {
							throw new NodeOperationError(this.getNode(), 'Chat ID is required and cannot be empty', { itemIndex: i });
						}

						const chatIdNumber = parseInt(chatId.trim(), 10);
						if (isNaN(chatIdNumber)) {
							throw new NodeOperationError(this.getNode(), `Invalid Chat ID: "${chatId}". Must be a number.`, { itemIndex: i });
						}

						// Create Max Bot instance
						const bot = await createMaxBotInstance.call(this);

						// Get chat info using Max Bot API
						const responseData = await getChatInfo.call(
							this,
							bot,
							chatIdNumber,
						);

						returnData.push({
							json: responseData,
							pairedItem: {
								item: i,
							},
						});
					} else if (operation === 'leaveChat') {
						// Get parameters
						const chatId = this.getNodeParameter('chatId', i) as string;

						// Validate chat ID
						if (!chatId || chatId.trim() === '') {
							throw new NodeOperationError(this.getNode(), 'Chat ID is required and cannot be empty', { itemIndex: i });
						}

						const chatIdNumber = parseInt(chatId.trim(), 10);
						if (isNaN(chatIdNumber)) {
							throw new NodeOperationError(this.getNode(), `Invalid Chat ID: "${chatId}". Must be a number.`, { itemIndex: i });
						}

						// Create Max Bot instance
						const bot = await createMaxBotInstance.call(this);

						// Leave chat using Max Bot API
						const responseData = await leaveChat.call(
							this,
							bot,
							chatIdNumber,
						);

						returnData.push({
							json: responseData,
							pairedItem: {
								item: i,
							},
						});
					} else {
						throw new NodeOperationError(this.getNode(), `The operation '${operation}' is not supported for resource '${resource}'`, { itemIndex: i });
					}
				} else {
					throw new NodeOperationError(this.getNode(), `The resource '${resource}' is not supported.`, { itemIndex: i });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
