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
 * Based on official Max API documentation.
 */
export interface IMaxUser {
	user_id: number;
	first_name?: string;
	last_name?: string;
	name?: string; // Deprecated field, will be removed soon
	username?: string;
	is_bot?: boolean;
	last_activity_time?: number;
}

/**
 * Max messenger chat information interface
 *
 * Represents chat/group data received in Max messenger webhook events,
 * containing chat identification, type, and metadata information.
 * Based on official Max API documentation.
 */
export interface IMaxChat {
	chat_id: number;
	type: 'chat' | 'dialog' | 'group'; // 'chat' is official, others for backward compatibility
	status?: 'active' | 'removed' | 'left' | 'closed';
	title?: string;
	icon?: {
		url?: string;
	};
	last_event_time?: number;
	participants_count?: number;
	owner_id?: number;
	participants?: any;
	is_public?: boolean;
	link?: string;
	description?: string;
	dialog_with_user?: {
		user_id: number;
		first_name?: string;
		last_name?: string;
		name?: string;
		username?: string;
		is_bot?: boolean;
		last_activity_time?: number;
		description?: string;
		avatar_url?: string;
		full_avatar_url?: string;
	};
	messages_count?: number;
	chat_message_id?: string;
	pinned_message?: IMaxMessage;
}

/**
 * Max messenger message information interface
 *
 * Represents message data received in Max messenger webhook events,
 * containing message content, attachments, and formatting information.
 * Based on official Max API documentation structure.
 */
export interface IMaxMessage {
	sender?: {
		user_id: number;
		first_name?: string;
		last_name?: string;
		name?: string;
		username?: string;
		is_bot?: boolean;
		last_activity_time?: number;
	};
	recipient?: {
		chat_id?: number;
		chat_type?: string;
		user_id?: number;
	};
	timestamp: number;
	link?: {
		type?: string;
		sender?: {
			user_id: number;
			first_name?: string;
			last_name?: string;
			name?: string;
			username?: string;
			is_bot?: boolean;
			last_activity_time?: number;
		};
		chat_id?: number;
		message?: {
			mid: string;
			seq?: number;
			text?: string;
			attachments?: Array<{
				type: string;
				payload: any;
			}>;
			markup?: Array<{
				type: string;
				from: number;
				length: number;
			}>;
		};
	};
	body?: {
		mid: string;
		seq?: number;
		text?: string;
		attachments?: Array<{
			type: string;
			payload: any;
		}>;
		markup?: Array<{
			type: string;
			from: number;
			length: number;
		}>;
	};
	stat?: {
		views?: number;
	};
	url?: string;
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
