import type { IWebhookFunctions, IDataObject, IWebhookResponseData } from 'n8n-workflow';
import type { MaxWebhookEvent, MaxTriggerEvent } from './MaxTriggerConfig';

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

		// For message events, extract chat/user info from the message object
		if (bodyData.message) {
			if (bodyData.message.chat && !chatInfo) {
				chatInfo = bodyData.message.chat;
			}
			if (bodyData.message.from && !userInfo) {
				userInfo = bodyData.message.from;
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
	 * providing enhanced context and metadata for each event type.
	 * 
	 * @param bodyData - Raw webhook event data from Max API
	 * @param eventType - The type of event being processed
	 * @returns Normalized event data with event-specific enhancements
	 */
	public processEventSpecificData(bodyData: MaxWebhookEvent, eventType: string): IDataObject {
		const baseData = {
			...bodyData,
			event_type: eventType,
			update_type: eventType,
		};

		switch (eventType) {
			case 'message_edited':
				return this.processMessageEditedEvent(baseData);
			
			case 'message_removed':
				return this.processMessageRemovedEvent(baseData);
			
			case 'bot_added':
			case 'bot_removed':
				return this.processBotMembershipEvent(baseData, eventType);
			
			case 'user_added':
			case 'user_removed':
				return this.processUserMembershipEvent(baseData, eventType);
			
			case 'chat_title_changed':
				return this.processChatTitleChangedEvent(baseData);
			
			case 'message_created':
			case 'message_chat_created':
			case 'message_callback':
			case 'bot_started':
			default:
				// For basic events, return normalized data without additional processing
				return baseData;
		}
	}

	/**
	 * Process message_edited events with old/new content comparison
	 */
	private processMessageEditedEvent(baseData: IDataObject): IDataObject {
		const data = baseData as MaxWebhookEvent;
		
		return {
			...baseData,
			event_context: {
				type: 'message_edited',
				description: 'Message content was modified',
				old_content: data.old_message?.text || null,
				new_content: data.new_message?.text || data.message?.text || null,
				edited_at: data.new_message?.timestamp || data.timestamp,
				message_id: data.message?.message_id || data.message?.id,
				has_content_changes: (data.old_message?.text || '') !== (data.new_message?.text || data.message?.text || ''),
				has_attachment_changes: this.compareAttachments(data.old_message?.attachments, data.new_message?.attachments || data.message?.attachments),
			},
			old_message: data.old_message,
			new_message: data.new_message || data.message,
		};
	}

	/**
	 * Process message_removed events with deletion context
	 */
	private processMessageRemovedEvent(baseData: IDataObject): IDataObject {
		const data = baseData as MaxWebhookEvent;
		
		return {
			...baseData,
			event_context: {
				type: 'message_removed',
				description: 'Message was deleted from chat',
				deleted_message_id: data.message?.message_id || data.message?.id,
				deleted_by: data.deletion_context?.deleted_by || null,
				deletion_reason: data.deletion_context?.deletion_reason || 'unknown',
				deleted_at: data.deletion_context?.deleted_at || data.timestamp,
				original_content: data.message?.text || null,
			},
			deletion_context: data.deletion_context,
		};
	}

	/**
	 * Process bot_added/bot_removed events with chat and user context
	 */
	private processBotMembershipEvent(baseData: IDataObject, eventType: string): IDataObject {
		const data = baseData as MaxWebhookEvent;
		const isAdded = eventType === 'bot_added';
		
		return {
			...baseData,
			event_context: {
				type: eventType,
				description: isAdded ? 'Bot was added to chat' : 'Bot was removed from chat',
				action_by: data.membership_context?.added_by || data.membership_context?.removed_by || data.user,
				chat_info: {
					chat_id: data.chat?.chat_id || data.chat?.id,
					chat_type: data.chat?.type,
					chat_title: data.chat?.title,
					members_count: data.chat?.members_count,
				},
				action_timestamp: data.membership_context?.action_timestamp || data.timestamp,
			},
			membership_context: data.membership_context,
		};
	}

	/**
	 * Process user_added/user_removed events with user details and roles
	 */
	private processUserMembershipEvent(baseData: IDataObject, eventType: string): IDataObject {
		const data = baseData as MaxWebhookEvent;
		const isAdded = eventType === 'user_added';
		
		return {
			...baseData,
			event_context: {
				type: eventType,
				description: isAdded ? 'User joined the chat' : 'User left the chat',
				affected_user: data.user,
				action_by: data.membership_context?.added_by || data.membership_context?.removed_by,
				user_role: data.membership_context?.user_role || 'member',
				chat_info: {
					chat_id: data.chat?.chat_id || data.chat?.id,
					chat_type: data.chat?.type,
					chat_title: data.chat?.title,
					members_count: data.chat?.members_count,
				},
				action_timestamp: data.membership_context?.action_timestamp || data.timestamp,
			},
			membership_context: data.membership_context,
		};
	}

	/**
	 * Process chat_title_changed events with old/new titles
	 */
	private processChatTitleChangedEvent(baseData: IDataObject): IDataObject {
		const data = baseData as MaxWebhookEvent;
		
		return {
			...baseData,
			event_context: {
				type: 'chat_title_changed',
				description: 'Chat title was modified',
				old_title: data.chat_changes?.old_title || null,
				new_title: data.chat_changes?.new_title || data.chat?.title || null,
				changed_by: data.chat_changes?.changed_by || data.user,
				changed_at: data.chat_changes?.changed_at || data.timestamp,
				chat_info: {
					chat_id: data.chat?.chat_id || data.chat?.id,
					chat_type: data.chat?.type,
					members_count: data.chat?.members_count,
				},
			},
			chat_changes: data.chat_changes,
		};
	}



	/**
	 * Compare attachments between old and new messages
	 */
	private compareAttachments(oldAttachments?: Array<{type: string; payload: any}>, newAttachments?: Array<{type: string; payload: any}>): boolean {
		if (!oldAttachments && !newAttachments) return false;
		if (!oldAttachments || !newAttachments) return true;
		if (oldAttachments.length !== newAttachments.length) return true;
		
		// Simple comparison - in a real implementation, you might want more sophisticated comparison
		return JSON.stringify(oldAttachments) !== JSON.stringify(newAttachments);
	}
}