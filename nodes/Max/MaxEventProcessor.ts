import type { IWebhookFunctions, IDataObject, IWebhookResponseData } from 'n8n-workflow';
import type { MaxWebhookEvent, MaxTriggerEvent } from './MaxTriggerConfig';

/**
 * Event validation error interface
 */
interface IEventValidationError {
	field: string;
	message: string;
	severity: 'error' | 'warning';
}

/**
 * Normalized event data interface
 */
interface INormalizedEventData extends IDataObject {
	event_type: string;
	update_type: string;
	timestamp: number;
	event_id: string;
	event_context: IEventContext;
	validation_status: {
		is_valid: boolean;
		errors: IEventValidationError[];
		warnings: IEventValidationError[];
	};
	metadata: IEventMetadata;
}

/**
 * Event context interface for enhanced event information
 */
interface IEventContext {
	type: string;
	description: string;
	[key: string]: any;
}

/**
 * Event metadata interface for consistent metadata processing
 */
interface IEventMetadata {
	received_at: number;
	processing_time_ms: number;
	source: 'webhook' | 'polling';
	api_version?: string;
	user_context?: {
		user_id?: number;
		username?: string;
		display_name?: string;
		locale?: string;
	};
	chat_context?: {
		chat_id?: number;
		chat_type?: string;
		chat_title?: string;
		members_count?: number;
	};
}

/**
 * Max event processor
 * 
 * Handles processing of incoming webhook events from Max messenger.
 * Validates event data, applies filters, and prepares workflow data.
 */
export class MaxEventProcessor {
	/**
	 * Process incoming webhook events from Max messenger
	 * 
	 * Handles incoming webhook requests from the Max API, validates event data,
	 * applies configured filters, and triggers workflow execution for matching events.
	 * 
	 * @param this - Webhook function context providing access to request data and parameters
	 * @returns Promise resolving to webhook response data with workflow trigger information
	 */
	async processWebhookEvent(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const processor = new MaxEventProcessor();

		try {
			// Get request data safely
			const bodyData = this.getBodyData() as unknown as MaxWebhookEvent;
			const additionalFields = this.getNodeParameter('additionalFields') as IDataObject;
			const events = this.getNodeParameter('events') as MaxTriggerEvent[];

			console.log('Max Trigger - Processing webhook event');

			// Validate body data
			if (!bodyData) {
				console.log('Max Trigger - No body data received');
				return { workflowData: [] };
			}

			// Extract and validate event type
			const eventType = bodyData.update_type || bodyData.event_type || null;
			if (!eventType) {
				console.log('Max Trigger - No event type found, passing through data');
				return {
					workflowData: [this.helpers.returnJsonArray([bodyData as unknown as IDataObject])],
				};
			}

			// Filter by event type
			if (!events.includes(eventType as MaxTriggerEvent)) {
				console.log(`Max Trigger - Event type '${eventType}' filtered out`);
				return { workflowData: [] };
			}

			// Apply additional filters
			if (!processor.passesAdditionalFilters(bodyData, additionalFields)) {
				return { workflowData: [] };
			}

			console.log('Max Trigger - Event passed filters, triggering workflow');

			// Process event-specific data and normalize
			const normalizedData = processor.processEventSpecificData(bodyData, eventType);

			return {
				workflowData: [this.helpers.returnJsonArray([normalizedData as unknown as IDataObject])],
			};

		} catch (error) {
			// Log error but don't throw - return empty response to avoid webhook recreation
			console.log('Max Trigger - Error processing webhook:', error);
			return { workflowData: [] };
		}
	}



	/**
	 * Apply additional filters (chat IDs, user IDs)
	 */
	public passesAdditionalFilters(
		bodyData: MaxWebhookEvent,
		additionalFields: IDataObject
	): boolean {
		try {
			// Extract chat and user info safely
			const { chatInfo, userInfo } = this.extractChatAndUserInfo(bodyData);

			// Filter by chat IDs if specified
			if (!this.passesChatIdFilter(chatInfo, additionalFields)) {
				return false;
			}

			// Filter by user IDs if specified
			if (!this.passesUserIdFilter(userInfo, additionalFields)) {
				return false;
			}

			return true;
		} catch (filterError) {
			console.log('Max Trigger - Error in filtering, proceeding without filters:', filterError);
			// Continue processing even if filtering fails
			return true;
		}
	}

	/**
	 * Extract chat and user information from event data
	 */
	private extractChatAndUserInfo(bodyData: MaxWebhookEvent) {
		let chatInfo = bodyData.chat;
		let userInfo = bodyData.user;

		// For message events, extract chat/user info from the message object using correct structure
		if (bodyData.message) {
			// Extract chat info from message.recipient (correct Max API structure)
			if (bodyData.message.recipient && !chatInfo) {
				chatInfo = {
					chat_id: bodyData.message.recipient.chat_id,
					type: bodyData.message.recipient.chat_type || 'chat'
				} as MaxWebhookEvent['chat'];
			}
			// Extract user info from message.sender (correct Max API structure)
			if (bodyData.message.sender && !userInfo) {
				userInfo = {
					user_id: bodyData.message.sender.user_id,
					first_name: bodyData.message.sender.first_name,
					last_name: bodyData.message.sender.last_name,
					username: bodyData.message.sender.username,
					is_bot: bodyData.message.sender.is_bot,
					last_activity_time: bodyData.message.sender.last_activity_time
				} as MaxWebhookEvent['user'];
			}
		}

		return { chatInfo, userInfo };
	}

	/**
	 * Check if event passes chat ID filter
	 */
	private passesChatIdFilter(chatInfo: any, additionalFields: IDataObject): boolean {
		if (!additionalFields['chatIds'] || !chatInfo) {
			return true;
		}

		const chatIds = String(additionalFields['chatIds'])
			.split(',')
			.map((id) => id.trim())
			.filter((id) => id !== '');

		if (chatIds.length === 0) {
			return true;
		}

		const chatId = chatInfo.chat_id || chatInfo.id;
		const isAllowed = chatIds.includes(String(chatId));

		if (!isAllowed) {
			console.log(`Max Trigger - Chat ID ${chatId} filtered out`);
		}

		return isAllowed;
	}

	/**
	 * Check if event passes user ID filter
	 */
	private passesUserIdFilter(userInfo: any, additionalFields: IDataObject): boolean {
		if (!additionalFields['userIds'] || !userInfo) {
			return true;
		}

		const userIds = String(additionalFields['userIds'])
			.split(',')
			.map((id) => id.trim())
			.filter((id) => id !== '');

		if (userIds.length === 0) {
			return true;
		}

		const userId = userInfo.user_id || userInfo.id;
		const isAllowed = userIds.includes(String(userId));

		if (!isAllowed) {
			console.log(`Max Trigger - User ID ${userId} filtered out`);
		}

		return isAllowed;
	}

	/**
	 * Process event-specific data based on event type
	 * 
	 * Extracts and normalizes event-specific data for different Max messenger event types,
	 * providing enhanced context and metadata for each event type with comprehensive validation.
	 * 
	 * @param bodyData - Raw webhook event data from Max API
	 * @param eventType - The type of event being processed
	 * @returns Normalized event data with event-specific enhancements, validation, and metadata
	 */
	public processEventSpecificData(bodyData: MaxWebhookEvent, eventType: string): INormalizedEventData {
		const startTime = Date.now();

		// Validate event payload structure
		const validationResult = this.validateEventPayload(bodyData, eventType);

		// Generate unique event ID
		const eventId = this.generateEventId(bodyData, eventType);

		// Extract and normalize metadata
		const metadata = this.extractEventMetadata(bodyData);

		// Process event-specific data
		let eventSpecificData: IDataObject;
		let eventContext: IEventContext;

		switch (eventType) {
			case 'message_edited':
				({ data: eventSpecificData, context: eventContext } = this.processMessageEditedEvent(bodyData));
				break;

			case 'message_removed':
				({ data: eventSpecificData, context: eventContext } = this.processMessageRemovedEvent(bodyData));
				break;

			case 'bot_added':
			case 'bot_removed':
				({ data: eventSpecificData, context: eventContext } = this.processBotMembershipEvent(bodyData, eventType));
				break;

			case 'user_added':
			case 'user_removed':
				({ data: eventSpecificData, context: eventContext } = this.processUserMembershipEvent(bodyData, eventType));
				break;

			case 'chat_title_changed':
				({ data: eventSpecificData, context: eventContext } = this.processChatTitleChangedEvent(bodyData));
				break;

			case 'message_created':
				({ data: eventSpecificData, context: eventContext } = this.processMessageCreatedEvent(bodyData));
				break;

			case 'message_chat_created':
				({ data: eventSpecificData, context: eventContext } = this.processMessageChatCreatedEvent(bodyData));
				break;

			case 'message_callback':
				({ data: eventSpecificData, context: eventContext } = this.processMessageCallbackEvent(bodyData));
				break;

			case 'bot_started':
				({ data: eventSpecificData, context: eventContext } = this.processBotStartedEvent(bodyData));
				break;

			default:
				({ data: eventSpecificData, context: eventContext } = this.processGenericEvent(bodyData, eventType));
				break;
		}

		// Calculate processing time
		const processingTime = Date.now() - startTime;
		metadata.processing_time_ms = processingTime;

		// Build normalized event data
		const normalizedData: INormalizedEventData = {
			...eventSpecificData,
			event_type: eventType,
			update_type: eventType,
			timestamp: bodyData.timestamp || Date.now(),
			event_id: eventId,
			event_context: eventContext,
			validation_status: {
				is_valid: validationResult.isValid,
				errors: validationResult.errors,
				warnings: validationResult.warnings,
			},
			metadata,
		};

		return normalizedData;
	}





	/**
	 * Validate event payload structure and required fields
	 * 
	 * Performs comprehensive validation of the event payload structure,
	 * checking for required fields and data integrity based on event type.
	 * 
	 * @param bodyData - Raw webhook event data
	 * @param eventType - Type of event being validated
	 * @returns Validation result with errors and warnings
	 */
	private validateEventPayload(bodyData: MaxWebhookEvent, eventType: string): {
		isValid: boolean;
		errors: IEventValidationError[];
		warnings: IEventValidationError[];
	} {
		const errors: IEventValidationError[] = [];
		const warnings: IEventValidationError[] = [];

		// Basic structure validation
		if (!bodyData.timestamp) {
			warnings.push({
				field: 'timestamp',
				message: 'Missing timestamp, using current time',
				severity: 'warning',
			});
		}

		// Event-specific validation
		switch (eventType) {
			case 'message_created':
			case 'message_chat_created':
				this.validateMessageEvent(bodyData, errors, warnings);
				break;

			case 'message_edited':
				this.validateMessageEditedEvent(bodyData, errors, warnings);
				break;

			case 'message_removed':
				this.validateMessageRemovedEvent(bodyData, errors, warnings);
				break;

			case 'message_callback':
				this.validateCallbackEvent(bodyData, errors, warnings);
				break;

			case 'bot_added':
			case 'bot_removed':
			case 'user_added':
			case 'user_removed':
				this.validateMembershipEvent(bodyData, errors, warnings);
				break;

			case 'chat_title_changed':
				this.validateChatTitleChangedEvent(bodyData, errors, warnings);
				break;

			case 'bot_started':
				this.validateBotStartedEvent(bodyData, errors, warnings);
				break;
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Validate message events (message_created, message_chat_created)
	 */
	private validateMessageEvent(bodyData: MaxWebhookEvent, errors: IEventValidationError[], warnings: IEventValidationError[]): void {
		if (!bodyData.message) {
			errors.push({
				field: 'message',
				message: 'Message object is required for message events',
				severity: 'error',
			});
			return;
		}

		// Check for text with backward compatibility: message.body.text or message.text
		const hasText = Boolean(
			(bodyData.message.body && bodyData.message.body.text) ||
			(bodyData.message as any).text
		);
		// Check for attachments with backward compatibility: message.body.attachments or message.attachments
		const hasAttachments = Boolean(
			(bodyData.message.body && bodyData.message.body.attachments && bodyData.message.body.attachments.length) ||
			((bodyData.message as any).attachments && (bodyData.message as any).attachments.length)
		);

		if (!hasText && !hasAttachments) {
			warnings.push({
				field: 'message.content',
				message: 'Message has no text content or attachments',
				severity: 'warning',
			});
		}

		// Check for sender information with backward compatibility
		const hasSenderInfo = bodyData.message.sender ||
			bodyData.user ||
			(bodyData.message as any)?.from;

		if (!hasSenderInfo) {
			warnings.push({
				field: 'user',
				message: 'No sender information found in message event',
				severity: 'warning',
			});
		}
	}

	/**
	 * Validate message edited events
	 */
	private validateMessageEditedEvent(bodyData: MaxWebhookEvent, errors: IEventValidationError[], warnings: IEventValidationError[]): void {
		if (!bodyData.message) {
			errors.push({
				field: 'message',
				message: 'Message object is required for message_edited events',
				severity: 'error',
			});
		}

		if (!bodyData.old_message && !bodyData.new_message) {
			warnings.push({
				field: 'message_versions',
				message: 'No old_message or new_message data found for comparison',
				severity: 'warning',
			});
		}
	}

	/**
	 * Validate message removed events
	 */
	private validateMessageRemovedEvent(bodyData: MaxWebhookEvent, errors: IEventValidationError[], warnings: IEventValidationError[]): void {
		if (!bodyData.message) {
			errors.push({
				field: 'message',
				message: 'Message object is required for message_removed events',
				severity: 'error',
			});
		}

		if (!bodyData.deletion_context) {
			warnings.push({
				field: 'deletion_context',
				message: 'No deletion context provided',
				severity: 'warning',
			});
		}
	}

	/**
	 * Validate callback events
	 */
	private validateCallbackEvent(bodyData: MaxWebhookEvent, errors: IEventValidationError[], warnings: IEventValidationError[]): void {
		if (!bodyData.callback) {
			errors.push({
				field: 'callback',
				message: 'Callback object is required for message_callback events',
				severity: 'error',
			});
			return;
		}

		if (!bodyData.callback.payload && !bodyData.callback.id) {
			warnings.push({
				field: 'callback.payload',
				message: 'No callback payload or ID found',
				severity: 'warning',
			});
		}
	}

	/**
	 * Validate membership events (bot_added, bot_removed, user_added, user_removed)
	 */
	private validateMembershipEvent(bodyData: MaxWebhookEvent, errors: IEventValidationError[], warnings: IEventValidationError[]): void {
		if (!bodyData.chat) {
			errors.push({
				field: 'chat',
				message: 'Chat object is required for membership events',
				severity: 'error',
			});
		}

		if (!bodyData.user) {
			warnings.push({
				field: 'user',
				message: 'No user information found in membership event',
				severity: 'warning',
			});
		}

		if (!bodyData.membership_context) {
			warnings.push({
				field: 'membership_context',
				message: 'No membership context provided',
				severity: 'warning',
			});
		}
	}

	/**
	 * Validate chat title changed events
	 */
	private validateChatTitleChangedEvent(bodyData: MaxWebhookEvent, errors: IEventValidationError[], warnings: IEventValidationError[]): void {
		if (!bodyData.chat) {
			errors.push({
				field: 'chat',
				message: 'Chat object is required for chat_title_changed events',
				severity: 'error',
			});
		}

		if (!bodyData.chat_changes) {
			warnings.push({
				field: 'chat_changes',
				message: 'No chat_changes context provided',
				severity: 'warning',
			});
		}
	}

	/**
	 * Validate bot started events
	 */
	private validateBotStartedEvent(bodyData: MaxWebhookEvent, _errors: IEventValidationError[], warnings: IEventValidationError[]): void {
		if (!bodyData.user) {
			warnings.push({
				field: 'user',
				message: 'No user information found in bot_started event',
				severity: 'warning',
			});
		}
	}

	/**
	 * Generate unique event ID
	 * 
	 * Creates a unique identifier for the event based on event data and timestamp.
	 * 
	 * @param bodyData - Event data
	 * @param eventType - Type of event
	 * @returns Unique event ID
	 */
	private generateEventId(bodyData: MaxWebhookEvent, eventType: string): string {
		const timestamp = bodyData.timestamp || Date.now();
		// Use chat_id as primary field, fallback to message recipient chat_id
		const chatId = bodyData.chat?.chat_id || bodyData.message?.recipient?.chat_id || 'unknown';
		// Use user_id as primary field, fallback to message sender user_id
		const userId = bodyData.user?.user_id || bodyData.message?.sender?.user_id || 'unknown';
		// Use message body mid as primary message identifier
		const messageId = bodyData.message?.body?.mid || '';
		// Use callback_id for callback events
		const callbackId = bodyData.callback?.callback_id || '';

		// Create a hash-like ID from available data
		const dataString = `${eventType}-${timestamp}-${chatId}-${userId}-${messageId}-${callbackId}`;
		return Buffer.from(dataString).toString('base64').substring(0, 16);
	}

	/**
	 * Extract and normalize event metadata
	 * 
	 * Processes event data to extract consistent metadata including user context,
	 * chat context, and processing information.
	 * 
	 * @param bodyData - Raw event data
	 * @returns Normalized metadata object
	 */
	private extractEventMetadata(bodyData: MaxWebhookEvent): IEventMetadata {
		const metadata: IEventMetadata = {
			received_at: Date.now(),
			processing_time_ms: 0, // Will be set later
			source: 'webhook',
		};

		// Extract user context - use correct API structure with backward compatibility
		let user = bodyData.user;
		if (!user && bodyData.message?.sender) {
			user = bodyData.message.sender;
		}
		if (!user && (bodyData.message as any)?.from) {
			user = (bodyData.message as any).from;
		}

		if (user) {
			metadata.user_context = {};
			// Handle both user_id and id fields for backward compatibility
			const userId = user.user_id || (user as any).id;
			if (userId !== undefined) {
				metadata.user_context.user_id = userId;
			}
			if (user.username !== undefined) {
				metadata.user_context.username = user.username;
			}
			const displayName = user.first_name || user.last_name || user.name;
			if (displayName !== undefined) {
				metadata.user_context.display_name = displayName;
			}
			const locale = user.lang || (bodyData['user_locale'] as string);
			if (locale !== undefined) {
				metadata.user_context.locale = locale;
			}
		}

		// Extract chat context - use correct API structure with backward compatibility
		let chat = bodyData.chat;
		if (!chat && bodyData.message?.recipient) {
			chat = {
				chat_id: bodyData.message.recipient.chat_id,
				type: bodyData.message.recipient.chat_type || 'chat'
			} as MaxWebhookEvent['chat'];
		}

		if (chat) {
			metadata.chat_context = {};
			// Handle both chat_id and id fields for backward compatibility
			const chatId = chat.chat_id || (chat as any).id;
			if (chatId !== undefined) {
				metadata.chat_context.chat_id = chatId;
			}
			if (chat.type !== undefined) {
				metadata.chat_context.chat_type = chat.type;
			}
			if (chat.title !== undefined) {
				metadata.chat_context.chat_title = chat.title;
			}
			// Handle both members_count and legacy field
			const membersCount = chat.members_count || (chat as any).members_count;
			if (membersCount !== undefined) {
				metadata.chat_context.members_count = membersCount;
			}
		}

		return metadata;
	}

	/**
	 * Process message_created events
	 */
	private processMessageCreatedEvent(bodyData: MaxWebhookEvent): { data: IDataObject; context: IEventContext } {
		// Handle both design doc structure and legacy formats
		const messageText = bodyData.message?.body?.text || (bodyData.message as any)?.text;
		const hasAttachments = Boolean(
			bodyData.message?.body?.attachments?.length ||
			(bodyData.message as any)?.attachments?.length
		);

		const context: IEventContext = {
			type: 'message_created',
			description: 'New message received in direct conversation',
			message_id: bodyData.message?.body?.mid || (bodyData.message as any)?.id || (bodyData.message as any)?.message_id,
			has_text: Boolean(messageText),
			has_attachments: hasAttachments,
			message_length: messageText?.length || 0,
		};

		return {
			data: { ...bodyData },
			context,
		};
	}

	/**
	 * Process message_chat_created events
	 */
	private processMessageChatCreatedEvent(bodyData: MaxWebhookEvent): { data: IDataObject; context: IEventContext } {
		// Handle both design doc structure and legacy formats
		const messageText = bodyData.message?.body?.text || (bodyData.message as any)?.text;
		const hasAttachments = Boolean(
			bodyData.message?.body?.attachments?.length ||
			(bodyData.message as any)?.attachments?.length
		);

		const context: IEventContext = {
			type: 'message_chat_created',
			description: 'New message received in group chat',
			message_id: bodyData.message?.body?.mid || (bodyData.message as any)?.id || (bodyData.message as any)?.message_id,
			has_text: Boolean(messageText),
			has_attachments: hasAttachments,
			message_length: messageText?.length || 0,
			chat_type: bodyData.message?.recipient?.chat_type || 'unknown',
		};

		return {
			data: { ...bodyData },
			context,
		};
	}

	/**
	 * Process message_callback events
	 */
	private processMessageCallbackEvent(bodyData: MaxWebhookEvent): { data: IDataObject; context: IEventContext } {
		const context: IEventContext = {
			type: 'message_callback',
			description: 'User clicked an inline keyboard button',
			callback_id: bodyData.callback?.id || bodyData.callback?.callback_id,
			callback_payload: bodyData.callback?.payload,
			source_message_id: bodyData.message?.id || bodyData.message?.message_id,
		};

		return {
			data: { ...bodyData },
			context,
		};
	}

	/**
	 * Process bot_started events
	 */
	private processBotStartedEvent(bodyData: MaxWebhookEvent): { data: IDataObject; context: IEventContext } {
		const context: IEventContext = {
			type: 'bot_started',
			description: 'User started interaction with the bot',
			is_first_interaction: true, // Could be enhanced with actual data
			user_locale: bodyData.user?.lang,
		};

		return {
			data: { ...bodyData },
			context,
		};
	}

	/**
	 * Process generic/unknown events
	 */
	private processGenericEvent(bodyData: MaxWebhookEvent, eventType: string): { data: IDataObject; context: IEventContext } {
		const context: IEventContext = {
			type: eventType,
			description: `Generic event of type: ${eventType}`,
			is_supported: false,
		};

		return {
			data: { ...bodyData },
			context,
		};
	}

	/**
	 * Updated process message_edited events with new return format
	 */
	private processMessageEditedEvent(bodyData: MaxWebhookEvent): { data: IDataObject; context: IEventContext } {
		const context: IEventContext = {
			type: 'message_edited',
			description: 'Message content was modified',
			old_content: bodyData.old_message?.text || null,
			new_content: bodyData.new_message?.text || bodyData.message?.body?.text || null,
			edited_at: bodyData.new_message?.timestamp || bodyData.timestamp,
			message_id: bodyData.message?.message_id || bodyData.message?.id,
			has_content_changes: (bodyData.old_message?.text || '') !== (bodyData.new_message?.text || bodyData.message?.body?.text || ''),
			has_attachment_changes: this.compareAttachments(bodyData.old_message?.attachments, bodyData.new_message?.attachments || bodyData.message?.body?.attachments),
		};

		const data = {
			...bodyData,
			old_message: bodyData.old_message,
			new_message: bodyData.new_message || bodyData.message,
		};

		return { data, context };
	}

	/**
	 * Updated process message_removed events with new return format
	 */
	private processMessageRemovedEvent(bodyData: MaxWebhookEvent): { data: IDataObject; context: IEventContext } {
		const context: IEventContext = {
			type: 'message_removed',
			description: 'Message was deleted from chat',
			deleted_message_id: bodyData.message?.message_id || (bodyData.message as any)?.id,
			deleted_by: bodyData.deletion_context?.deleted_by || null,
			deletion_reason: bodyData.deletion_context?.deletion_reason || 'unknown',
			deleted_at: bodyData.deletion_context?.deleted_at || bodyData.timestamp,
			original_content: bodyData.message?.body?.text || (bodyData.message as any)?.text || null,
		};

		const data = {
			...bodyData,
			deletion_context: bodyData.deletion_context,
		};

		return { data, context };
	}

	/**
	 * Updated process bot membership events with new return format
	 */
	private processBotMembershipEvent(bodyData: MaxWebhookEvent, eventType: string): { data: IDataObject; context: IEventContext } {
		const isAdded = eventType === 'bot_added';

		const context: IEventContext = {
			type: eventType,
			description: isAdded ? 'Bot was added to chat' : 'Bot was removed from chat',
			action_by: bodyData.membership_context?.added_by || bodyData.membership_context?.removed_by || bodyData.user,
			chat_info: {
				chat_id: bodyData.chat?.chat_id || bodyData.chat?.id,
				chat_type: bodyData.chat?.type,
				chat_title: bodyData.chat?.title,
				members_count: bodyData.chat?.members_count,
			},
			action_timestamp: bodyData.membership_context?.action_timestamp || bodyData.timestamp,
		};

		const data = {
			...bodyData,
			membership_context: bodyData.membership_context,
		};

		return { data, context };
	}

	/**
	 * Updated process user membership events with new return format
	 */
	private processUserMembershipEvent(bodyData: MaxWebhookEvent, eventType: string): { data: IDataObject; context: IEventContext } {
		const isAdded = eventType === 'user_added';

		const context: IEventContext = {
			type: eventType,
			description: isAdded ? 'User joined the chat' : 'User left the chat',
			affected_user: bodyData.user,
			action_by: bodyData.membership_context?.added_by || bodyData.membership_context?.removed_by,
			user_role: bodyData.membership_context?.user_role || 'member',
			chat_info: {
				chat_id: bodyData.chat?.chat_id || bodyData.chat?.id,
				chat_type: bodyData.chat?.type,
				chat_title: bodyData.chat?.title,
				members_count: bodyData.chat?.members_count,
			},
			action_timestamp: bodyData.membership_context?.action_timestamp || bodyData.timestamp,
		};

		const data = {
			...bodyData,
			membership_context: bodyData.membership_context,
		};

		return { data, context };
	}

	/**
	 * Updated process chat title changed events with new return format
	 */
	private processChatTitleChangedEvent(bodyData: MaxWebhookEvent): { data: IDataObject; context: IEventContext } {
		const context: IEventContext = {
			type: 'chat_title_changed',
			description: 'Chat title was modified',
			old_title: bodyData.chat_changes?.old_title || null,
			new_title: bodyData.chat_changes?.new_title || bodyData.chat?.title || null,
			changed_by: bodyData.chat_changes?.changed_by || bodyData.user,
			changed_at: bodyData.chat_changes?.changed_at || bodyData.timestamp,
			chat_info: {
				chat_id: bodyData.chat?.chat_id || bodyData.chat?.id,
				chat_type: bodyData.chat?.type,
				members_count: bodyData.chat?.members_count,
			},
		};

		const data = {
			...bodyData,
			chat_changes: bodyData.chat_changes,
		};

		return { data, context };
	}

	/**
	 * Compare attachments between old and new messages
	 */
	private compareAttachments(oldAttachments?: Array<{ type: string; payload: any }>, newAttachments?: Array<{ type: string; payload: any }>): boolean {
		if (!oldAttachments && !newAttachments) return false;
		if (!oldAttachments || !newAttachments) return true;
		if (oldAttachments.length !== newAttachments.length) return true;

		// Simple comparison - in a real implementation, you might want more sophisticated comparison
		return JSON.stringify(oldAttachments) !== JSON.stringify(newAttachments);
	}
}