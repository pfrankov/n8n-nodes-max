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
	type: 'dialog' | 'group' | 'channel';
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
