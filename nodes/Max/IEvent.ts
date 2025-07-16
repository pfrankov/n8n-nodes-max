/**
 * Max messenger event interfaces
 * 
 * This file defines TypeScript interfaces for Max messenger webhook events
 * and related data structures used in the Max messenger n8n integration.
 */

/**
 * Max messenger user information interface
 * 
 * Represents user data received in Max messenger webhook events,
 * containing user identification and profile information.
 */
export interface IMaxUser {
	user_id: number;
	name?: string;
	username?: string;
	avatar_url?: string;
	lang?: string;
}

/**
 * Max messenger chat information interface
 * 
 * Represents chat/group data received in Max messenger webhook events,
 * containing chat identification, type, and metadata information.
 */
export interface IMaxChat {
	chat_id: number;
	type: 'dialog' | 'group' | 'channel';
	title?: string;
	description?: string;
	avatar_url?: string;
	members_count?: number;
}

/**
 * Max messenger message information interface
 * 
 * Represents message data received in Max messenger webhook events,
 * containing message content, attachments, and formatting information.
 */
export interface IMaxMessage {
	message_id: string;
	text?: string;
	timestamp: number;
	attachments?: Array<{
		type: string;
		payload: any;
	}>;
	link?: {
		message_id: string;
		chat_id?: number;
		user_id?: number;
	};
	format?: 'html' | 'markdown';
}

/**
 * Max messenger callback query information interface
 * 
 * Represents callback data received when users interact with inline keyboard buttons,
 * containing the callback payload and associated message information.
 */
export interface IMaxCallback {
	callback_id: string;
	payload: string;
	message?: IMaxMessage;
	timestamp: number;
}

/**
 * Max messenger event information interface
 * 
 * Represents the complete webhook event structure received from Max messenger API,
 * containing event type, timestamp, and associated data objects (user, chat, message, callback).
 * This is the main interface for processing incoming webhook events in the trigger node.
 */
export interface IMaxEvent {
	update_type: 'bot_started' | 'message_created' | 'message_edited' | 'message_removed' | 
	           'bot_added' | 'bot_removed' | 'user_added' | 'user_removed' | 
	           'chat_title_changed' | 'message_callback' | 'message_chat_created';
	event_type?: 'bot_started' | 'message_created' | 'message_edited' | 'message_removed' | 
	           'bot_added' | 'bot_removed' | 'user_added' | 'user_removed' | 
	           'chat_title_changed' | 'message_callback' | 'message_chat_created'; // For backward compatibility
	timestamp: number;
	chat?: IMaxChat;
	user?: IMaxUser;
	message?: IMaxMessage;
	callback?: IMaxCallback;
	event_id?: string;
	user_locale?: string; // As per Max API documentation
	
	// Event-specific data for enhanced event processing
	old_message?: IMaxMessage; // For message_edited events - original message content
	new_message?: IMaxMessage; // For message_edited events - updated message content
	deletion_context?: {
		deleted_by?: IMaxUser;
		deletion_reason?: string;
		deleted_at?: number;
	}; // For message_removed events
	
	chat_changes?: {
		old_title?: string;
		new_title?: string;
		changed_by?: IMaxUser;
		changed_at?: number;
	}; // For chat_title_changed events
	
	membership_context?: {
		added_by?: IMaxUser;
		removed_by?: IMaxUser;
		user_role?: string;
		action_timestamp?: number;
	}; // For user_added/user_removed and bot_added/bot_removed events
	

}