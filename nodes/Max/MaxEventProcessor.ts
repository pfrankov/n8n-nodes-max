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

			// Normalize and return event data
			const normalizedData = {
				...bodyData,
				event_type: eventType,
				update_type: eventType,
			};
			
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


}