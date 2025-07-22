import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { Bot } from '@maxhub/max-bot-api';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Max API Error Categories
 * 
 * Categorizes different types of errors that can occur when interacting with the Max API
 * to provide appropriate error handling and user guidance.
 */
export enum MaxErrorCategory {
	AUTHENTICATION = 'authentication',
	VALIDATION = 'validation',
	RATE_LIMIT = 'rate_limit',
	NETWORK = 'network',
	BUSINESS_LOGIC = 'business_logic',
	UNKNOWN = 'unknown',
}

/**
 * Max API Error Interface
 * 
 * Represents the structure of errors returned by the Max API,
 * including error codes, descriptions, and additional parameters.
 */
export interface IMaxError {
	error_code?: number;
	description?: string;
	parameters?: {
		retry_after?: number;
		migrate_to_chat_id?: number;
	};
	message?: string;
	code?: string | number;
	status?: number;
}

/**
 * Create a Max Bot API instance with credentials
 * 
 * Creates and configures a Max Bot API instance using the provided credentials.
 * Supports custom base URL configuration for different Max API environments.
 * 
 * @param this - The execution context providing access to credentials
 * @returns Promise resolving to a configured Bot instance
 * @throws {NodeApiError} When access token is missing or invalid
 */
export async function createMaxBotInstance(
	this: IExecuteFunctions,
): Promise<Bot> {
	const credentials = await this.getCredentials('maxApi');

	if (!credentials['accessToken']) {
		throw new NodeApiError(this.getNode(), {
			message: 'Max API access token is required',
		} as JsonObject);
	}

	// Create Bot instance with custom base URL if provided
	const config = credentials['baseUrl'] ? {
		clientOptions: {
			baseUrl: credentials['baseUrl'],
		},
	} : undefined;

	return new Bot(credentials['accessToken'] as string, config as any);
}

/**
 * Send message using Max Bot API with enhanced error handling
 * 
 * Sends a text message to a user or chat using the Max Bot API.
 * Supports text formatting, attachments, and inline keyboards.
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param recipientType - Type of recipient ('user' or 'chat')
 * @param recipientId - Numeric ID of the recipient user or chat
 * @param text - Message text content (max 4000 characters)
 * @param options - Additional message options (format, attachments, etc.)
 * @returns Promise resolving to the API response with message details
 * @throws {NodeOperationError} When validation fails or parameters are invalid
 * @throws {NodeApiError} When Max API request fails
 */
export async function sendMessage(
	this: IExecuteFunctions,
	bot: Bot,
	recipientType: 'user' | 'chat',
	recipientId: number,
	text: string,
	options: IDataObject = {},
): Promise<any> {
	// Validate input parameters before making API call
	validateInputParameters(recipientType, recipientId, text, options['format'] as string);

	try {
		let result;

		if (recipientType === 'user') {
			result = await bot.api.sendMessageToUser(recipientId, text, options);
		} else {
			result = await bot.api.sendMessageToChat(recipientId, text, options);
		}

		return result;
	} catch (error) {
		// Use enhanced error handling
		return await handleMaxApiError.call(this, error, `send message to ${recipientType}`);
	}
}

/**
 * Edit message using Max Bot API with enhanced error handling
 * 
 * Modifies the text content of an existing message in Max messenger.
 * Supports text formatting and inline keyboard updates.
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param messageId - Unique identifier of the message to edit
 * @param text - New message text content (max 4000 characters)
 * @param options - Additional message options (format, attachments, etc.)
 * @returns Promise resolving to the API response with updated message details
 * @throws {Error} When message ID is invalid or text validation fails
 * @throws {NodeApiError} When Max API request fails
 */
export async function editMessage(
	this: IExecuteFunctions,
	_bot: Bot,
	messageId: string,
	text: string,
	options: IDataObject = {},
): Promise<any> {
	// Validate message ID
	if (!messageId || messageId.trim() === '') {
		throw new Error('Message ID is required and cannot be empty');
	}

	// Validate text content with comprehensive checks
	if (text === null || text === undefined || typeof text !== 'string') {
		throw new Error('Message text is required and must be a string');
	}

	if (text.trim().length === 0) {
		throw new Error('Message text cannot be empty');
	}

	// Use existing text validation
	validateAndFormatText(text, options['format'] as string);

	// Additional format-specific validations
	const format = options['format'] as string;
	if (format === 'html') {
		// Check for unclosed tags
		const openTags = (text.match(/<[^\/][^>]*>/g) || []).length;
		const closeTags = (text.match(/<\/[^>]*>/g) || []).length;
		if (openTags !== closeTags) {
			throw new Error('HTML format error: unclosed tags detected. Make sure all HTML tags are properly closed.');
		}
	}

	if (format === 'markdown') {
		// Check for unmatched markdown syntax
		const boldCount = (text.match(/\*/g) || []).length;
		const italicCount = (text.match(/_/g) || []).length;
		const codeCount = (text.match(/`/g) || []).length;

		if (boldCount % 2 !== 0) {
			throw new Error('Markdown format error: unmatched bold markers (*). Make sure all bold text is properly closed.');
		}
		if (italicCount % 2 !== 0) {
			throw new Error('Markdown format error: unmatched italic markers (_). Make sure all italic text is properly closed.');
		}
		if (codeCount % 2 !== 0) {
			throw new Error('Markdown format error: unmatched code markers (`). Make sure all code blocks are properly closed.');
		}
	}

	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = credentials['baseUrl'] || 'https://botapi.max.ru';

		// Build request body
		const requestBody: IDataObject = {
			text,
			...options,
		};

		// Make HTTP request to edit message endpoint
		const result = await this.helpers.httpRequest({
			method: 'PUT',
			url: `${baseUrl}/messages/${messageId}`,
			headers: {
				'Authorization': `Bearer ${credentials['accessToken']}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
			json: true,
		});

		return result;
	} catch (error) {
		// Use enhanced error handling
		return await handleMaxApiError.call(this, error, 'edit message');
	}
}

/**
 * Delete message using Max Bot API with enhanced error handling
 * 
 * Permanently removes a message from Max messenger chat.
 * Only messages sent by the bot can be deleted.
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param messageId - Unique identifier of the message to delete
 * @returns Promise resolving to the API response confirming deletion
 * @throws {Error} When message ID is invalid or empty
 * @throws {NodeApiError} When Max API request fails or message cannot be deleted
 */
export async function deleteMessage(
	this: IExecuteFunctions,
	_bot: Bot,
	messageId: string,
): Promise<any> {
	// Validate message ID
	if (!messageId || messageId.trim() === '') {
		throw new Error('Message ID is required and cannot be empty');
	}

	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = credentials['baseUrl'] || 'https://botapi.max.ru';

		// Make HTTP request to delete message endpoint
		const result = await this.helpers.httpRequest({
			method: 'DELETE',
			url: `${baseUrl}/messages/${messageId}`,
			headers: {
				'Authorization': `Bearer ${credentials['accessToken']}`,
				'Content-Type': 'application/json',
			},
			json: true,
		});

		return result || { success: true, message_id: messageId };
	} catch (error) {
		// Use enhanced error handling
		return await handleMaxApiError.call(this, error, 'delete message');
	}
}

/**
 * Answer callback query using Max Bot API with enhanced error handling
 * 
 * Responds to a callback query from an inline keyboard button press.
 * Can show a notification or alert dialog to the user.
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param callbackQueryId - Unique identifier of the callback query to answer
 * @param text - Optional response text to show to the user (max 200 characters)
 * @param showAlert - Whether to show an alert dialog instead of a notification
 * @param cacheTime - Maximum time in seconds that the result may be cached client-side (0-3600)
 * @returns Promise resolving to the API response confirming the callback answer
 * @throws {Error} When callback query ID is invalid or parameters are out of range
 * @throws {NodeApiError} When Max API request fails
 */
export async function answerCallbackQuery(
	this: IExecuteFunctions,
	_bot: Bot,
	callbackQueryId: string,
	text?: string,
	showAlert?: boolean,
	cacheTime?: number,
): Promise<any> {
	// Validate callback query ID
	if (!callbackQueryId || callbackQueryId.trim() === '') {
		throw new Error('Callback Query ID is required and cannot be empty');
	}

	// Validate response text length if provided
	if (text && text.length > 200) {
		throw new Error('Response text cannot exceed 200 characters');
	}

	// Validate cache time
	if (cacheTime !== undefined && (cacheTime < 0 || cacheTime > 3600)) {
		throw new Error('Cache time must be between 0 and 3600 seconds');
	}

	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = credentials['baseUrl'] || 'https://botapi.max.ru';

		// Build request body
		const requestBody: IDataObject = {
			callback_query_id: callbackQueryId.trim(),
		};

		// Add optional parameters
		if (text && text.trim().length > 0) {
			requestBody['text'] = text.trim();
		}

		if (showAlert !== undefined) {
			requestBody['show_alert'] = showAlert;
		}

		if (cacheTime !== undefined) {
			requestBody['cache_time'] = cacheTime;
		}

		// Make HTTP request to answer callback query endpoint
		const result = await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/callbacks/answers`,
			headers: {
				'Authorization': `Bearer ${credentials['accessToken']}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
			json: true,
		});

		return result || {
			success: true,
			callback_query_id: callbackQueryId,
			text: text || '',
			show_alert: showAlert || false,
			cache_time: cacheTime || 0,
		};
	} catch (error) {
		// Use enhanced error handling
		return await handleMaxApiError.call(this, error, 'answer callback query');
	}
}

/**
 * Validate and format text content for Max messenger
 * 
 * Validates message text against Max messenger constraints and format requirements.
 * Supports HTML and Markdown format validation with specific tag/syntax checking.
 * 
 * @param text - Message text content to validate (max 4000 characters)
 * @param format - Optional text format ('html', 'markdown', or undefined for plain text)
 * @returns The validated text content (unchanged if valid)
 * @throws {Error} When text exceeds character limit or contains invalid formatting
 */
export function validateAndFormatText(text: string, format?: string): string {
	// Max messenger supports up to 4000 characters
	if (text.length > 4000) {
		throw new Error('Message text cannot exceed 4000 characters');
	}

	// Basic validation for HTML format
	if (format === 'html') {
		// Simple validation - check for basic HTML tags that Max supports
		const allowedTags = ['b', 'i', 'u', 's', 'code', 'pre', 'a'];
		const htmlTagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
		let match;

		while ((match = htmlTagRegex.exec(text)) !== null) {
			const tagName = match[1]?.toLowerCase();
			if (tagName && !allowedTags.includes(tagName)) {
				throw new Error(`HTML tag '${tagName}' is not supported by Max messenger`);
			}
		}
	}

	// Basic validation for Markdown format
	if (format === 'markdown') {
		// Max messenger supports basic markdown: *bold*, _italic_, `code`, ```pre```
		// This is a simple validation - in production you might want more comprehensive checks
		const unsupportedMarkdown = /(\[.*?\]\(.*?\)|#{1,6}\s|>\s)/g;
		if (unsupportedMarkdown.test(text)) {
			throw new Error('Some Markdown syntax is not supported by Max messenger. Use basic formatting: *bold*, _italic_, `code`, ```pre```');
		}
	}

	return text;
}

/**
 * Add additional fields to the request body
 * 
 * Processes additional optional fields from node parameters and adds them to the request body.
 * Supports fields like disable_link_preview and notify for message customization.
 * 
 * @param this - The execution context providing access to node parameters
 * @param body - The request body object to modify
 * @param index - The current item index for parameter retrieval
 */
export function addAdditionalFields(
	this: IExecuteFunctions,
	body: IDataObject,
	index: number,
): void {
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	// Add supported additional fields
	if (additionalFields['disable_link_preview'] !== undefined) {
		body['disable_link_preview'] = additionalFields['disable_link_preview'];
	}

	if (additionalFields['notify'] !== undefined) {
		body['notify'] = additionalFields['notify'];
	}
}

/**
 * Categorize Max API errors based on error codes and messages
 * 
 * Analyzes error responses from the Max API and categorizes them into specific types
 * to enable appropriate error handling and user guidance.
 * 
 * @param error - The error object from Max API containing error codes and messages
 * @returns The categorized error type for appropriate handling
 */
export function categorizeMaxError(error: IMaxError): MaxErrorCategory {
	// Authentication errors
	if (error.error_code === 401 || error.status === 401 ||
		error.description?.toLowerCase().includes('unauthorized') ||
		error.message?.toLowerCase().includes('unauthorized') ||
		error.description?.toLowerCase().includes('invalid token') ||
		error.message?.toLowerCase().includes('invalid token')) {
		return MaxErrorCategory.AUTHENTICATION;
	}

	// Rate limiting errors
	if (error.error_code === 429 || error.status === 429 ||
		error.description?.toLowerCase().includes('too many requests') ||
		error.message?.toLowerCase().includes('too many requests') ||
		error.parameters?.retry_after !== undefined) {
		return MaxErrorCategory.RATE_LIMIT;
	}

	// Validation errors
	if (error.error_code === 400 || error.status === 400 ||
		error.description?.toLowerCase().includes('bad request') ||
		error.message?.toLowerCase().includes('bad request') ||
		error.description?.toLowerCase().includes('invalid parameter') ||
		error.message?.toLowerCase().includes('invalid parameter')) {
		return MaxErrorCategory.VALIDATION;
	}

	// Business logic errors
	if (error.error_code === 403 || error.status === 403 ||
		error.error_code === 404 || error.status === 404 ||
		error.description?.toLowerCase().includes('forbidden') ||
		error.message?.toLowerCase().includes('forbidden') ||
		error.description?.toLowerCase().includes('not found') ||
		error.message?.toLowerCase().includes('not found') ||
		error.description?.toLowerCase().includes('chat not found') ||
		error.message?.toLowerCase().includes('chat not found') ||
		error.description?.toLowerCase().includes('user blocked') ||
		error.message?.toLowerCase().includes('user blocked')) {
		return MaxErrorCategory.BUSINESS_LOGIC;
	}

	// Network errors
	if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' ||
		error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' ||
		error.message?.toLowerCase().includes('network') ||
		error.message?.toLowerCase().includes('timeout') ||
		error.message?.toLowerCase().includes('connection')) {
		return MaxErrorCategory.NETWORK;
	}

	return MaxErrorCategory.UNKNOWN;
}

/**
 * Create user-friendly error messages with troubleshooting guidance
 * 
 * Generates human-readable error messages with specific troubleshooting guidance
 * based on the error category and Max API response details.
 * 
 * @param error - The error object from Max API containing error details
 * @param category - The categorized error type for appropriate messaging
 * @returns A user-friendly error message with troubleshooting guidance
 */
export function createUserFriendlyErrorMessage(error: IMaxError, category: MaxErrorCategory): string {
	const baseMessage = error.description || error.message || 'An unknown error occurred';

	switch (category) {
		case MaxErrorCategory.AUTHENTICATION:
			return `Authorization failed - please check your credentials: ${baseMessage}. Please check your Max API access token in the credentials. Make sure the token is valid and has not expired. You can get a new token from @MasterBot in Max messenger.`;

		case MaxErrorCategory.RATE_LIMIT:
			const retryAfter = error.parameters?.retry_after;
			const retryMessage = retryAfter ? ` Please wait ${retryAfter} seconds before retrying.` : ' Please wait before retrying.';
			return `The service is receiving too many requests from you: ${baseMessage}.${retryMessage} Consider reducing the frequency of your requests or implementing delays between operations.`;

		case MaxErrorCategory.VALIDATION:
			return `Invalid request parameters: ${baseMessage}. Please check your input data. Common issues include: invalid user/chat IDs, message text too long (max 4000 characters), unsupported formatting, or missing required fields.`;

		case MaxErrorCategory.BUSINESS_LOGIC:
			if (baseMessage.toLowerCase().includes('chat not found')) {
				return `Chat not found: ${baseMessage}. The specified chat ID may be incorrect, or the bot may not have access to this chat. Make sure the bot has been added to the chat and has appropriate permissions.`;
			}
			if (baseMessage.toLowerCase().includes('user blocked') || baseMessage.toLowerCase().includes('forbidden')) {
				return `Access denied: ${baseMessage}. The user may have blocked the bot, or the bot lacks necessary permissions. Check that the bot has been properly configured and authorized.`;
			}
			return `Operation failed: ${baseMessage}. This may be due to insufficient permissions, missing resources, or business rule violations. Please verify your bot's access rights and the validity of the target resources.`;

		case MaxErrorCategory.NETWORK:
			return `Network error: ${baseMessage}. Please check your internet connection and the Max API service status. If the problem persists, try again later or verify the base URL in your credentials.`;

		default:
			return `The service was not able to process your request: ${baseMessage}. If this error persists, please check the Max API documentation or contact support with the error details.`;
	}
}

/**
 * Enhanced error handling with retry logic and user-friendly messages
 * 
 * Provides comprehensive error handling for Max API requests with categorization,
 * user-friendly messages, and retry logic for transient failures.
 * 
 * @param this - The execution context providing access to node information
 * @param error - The error object from the Max API request
 * @param operation - Description of the operation that failed
 * @param retryCount - Current retry attempt number (default: 0)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @throws {NodeApiError} For API-related errors with enhanced information
 * @throws {NodeOperationError} For validation and parameter errors
 */
export async function handleMaxApiError(
	this: IExecuteFunctions,
	error: any,
	operation: string,
	retryCount: number = 0,
	maxRetries: number = 3,
): Promise<never> {
	const maxError: IMaxError = {
		error_code: error.error_code || error.status,
		description: error.description || error.message,
		parameters: error.parameters,
		message: error.message,
		code: error.code,
		status: error.status,
	};

	const category = categorizeMaxError(maxError);
	const userMessage = createUserFriendlyErrorMessage(maxError, category);

	// Handle rate limiting with retry logic
	if (category === MaxErrorCategory.RATE_LIMIT && retryCount < maxRetries) {
		const retryAfter = maxError.parameters?.retry_after || Math.pow(2, retryCount);

		// For rate limiting, we don't actually retry here but provide guidance
		throw new NodeApiError(this.getNode(), {
			message: userMessage,
			description: `Rate limit hit during ${operation}. Retry attempt ${retryCount + 1}/${maxRetries}`,
			httpCode: '429',
			error_code: maxError.error_code,
			retry_after: retryAfter,
			category,
		} as JsonObject);
	}

	// Handle network errors with retry logic
	if (category === MaxErrorCategory.NETWORK && retryCount < maxRetries) {
		throw new NodeApiError(this.getNode(), {
			message: userMessage,
			description: `Network error during ${operation}. Retry attempt ${retryCount + 1}/${maxRetries}`,
			error_code: maxError.error_code,
			category,
			retryable: true,
		} as JsonObject);
	}

	// For validation and business logic errors, provide specific guidance
	if (category === MaxErrorCategory.VALIDATION) {
		throw new NodeOperationError(this.getNode(), userMessage, {
			description: `Validation error during ${operation}`,
		});
	}

	// For all other errors, throw NodeApiError with enhanced information
	throw new NodeApiError(this.getNode(), {
		message: userMessage,
		description: `Error during ${operation}`,
		httpCode: maxError.status?.toString() || maxError.error_code?.toString(),
		error_code: maxError.error_code,
		category,
		original_error: error,
	} as JsonObject);
}

/**
 * Validate input parameters with comprehensive checks
 * 
 * Performs comprehensive validation of message parameters including recipient ID,
 * text content, and format-specific syntax validation.
 * 
 * @param recipientType - Type of recipient ('user' or 'chat')
 * @param recipientId - Numeric ID of the recipient user or chat
 * @param text - Message text content to validate
 * @param format - Optional text format ('html', 'markdown', or undefined)
 * @throws {Error} When any parameter validation fails
 */
export function validateInputParameters(
	recipientType: 'user' | 'chat',
	recipientId: number,
	text: string,
	format?: string,
): void {
	// Validate recipient ID
	if (recipientId === undefined || recipientId === null || isNaN(recipientId)) {
		throw new Error(`Invalid ${recipientType} ID: must be a number`);
	}

	// Validate text content
	if (text === null || text === undefined || typeof text !== 'string') {
		throw new Error('Message text is required and must be a string');
	}

	if (text.trim().length === 0) {
		throw new Error('Message text cannot be empty');
	}

	// Use existing text validation
	validateAndFormatText(text, format);

	// Additional format-specific validations
	if (format === 'html') {
		// Check for unclosed tags
		const openTags = (text.match(/<[^\/][^>]*>/g) || []).length;
		const closeTags = (text.match(/<\/[^>]*>/g) || []).length;
		if (openTags !== closeTags) {
			throw new Error('HTML format error: unclosed tags detected. Make sure all HTML tags are properly closed.');
		}
	}

	if (format === 'markdown') {
		// Check for unmatched markdown syntax
		const boldCount = (text.match(/\*/g) || []).length;
		const italicCount = (text.match(/_/g) || []).length;
		const codeCount = (text.match(/`/g) || []).length;

		if (boldCount % 2 !== 0) {
			throw new Error('Markdown format error: unmatched bold markers (*). Make sure all bold text is properly closed.');
		}
		if (italicCount % 2 !== 0) {
			throw new Error('Markdown format error: unmatched italic markers (_). Make sure all italic text is properly closed.');
		}
		if (codeCount % 2 !== 0) {
			throw new Error('Markdown format error: unmatched code markers (`). Make sure all code blocks are properly closed.');
		}
	}
}

/**
 * Max Attachment Interface
 * 
 * Represents a file attachment or interactive element that can be included in Max messages.
 * Supports various attachment types including media files and inline keyboards.
 */
export interface IMaxAttachment {
	type: 'image' | 'video' | 'audio' | 'file' | 'inline_keyboard';
	payload: {
		token?: string;
		url?: string;
		buttons?: IMaxKeyboardButton[][];
		[key: string]: any;
	};
}

/**
 * Max Keyboard Button Interface
 * 
 * Represents a single button in an inline keyboard with its properties and behavior.
 * Supports different button types including callbacks, links, and contact/location requests.
 */
export interface IMaxKeyboardButton {
	text: string;
	type: 'callback' | 'link' | 'request_contact' | 'request_geo_location';
	payload?: string;
	url?: string;
	intent?: 'default' | 'positive' | 'negative';
}

/**
 * Max Keyboard Interface
 * 
 * Represents an inline keyboard structure with multiple rows of buttons.
 * Used for creating interactive message interfaces in Max messenger.
 */
export interface IMaxKeyboard {
	type: 'inline_keyboard';
	payload: {
		buttons: IMaxKeyboardButton[][];
	};
}

/**
 * Max Upload Response Interface
 * 
 * Represents the response from Max API file upload operations,
 * containing the upload URL and file token for attachment usage.
 */
export interface IMaxUploadResponse {
	url: string;
	token?: string;
}

/**
 * Attachment Configuration Interface
 * 
 * Defines the configuration for file attachments including type, input method,
 * and source information for uploading files to Max messenger.
 */
export interface IAttachmentConfig {
	type: 'image' | 'video' | 'audio' | 'file';
	inputType: 'binary' | 'url';
	binaryProperty?: string;
	fileUrl?: string;
	fileName?: string;
}

/**
 * File size limits for different attachment types (in bytes)
 */
const FILE_SIZE_LIMITS = {
	image: 10 * 1024 * 1024, // 10MB
	video: 50 * 1024 * 1024, // 50MB
	audio: 20 * 1024 * 1024, // 20MB
	file: 20 * 1024 * 1024,  // 20MB
};

/**
 * Supported file extensions for different attachment types
 */
const SUPPORTED_EXTENSIONS = {
	image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
	video: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'],
	audio: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'],
	file: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.zip', '.rar'],
};

/**
 * Validate attachment configuration and file properties
 * 
 * Validates attachment configuration including type, input method, file size,
 * and file extension against Max messenger constraints and supported formats.
 * 
 * @param config - Attachment configuration object with type and input details
 * @param fileSize - Optional file size in bytes for validation
 * @param fileName - Optional file name for extension validation
 * @throws {Error} When attachment configuration or file properties are invalid
 */
export function validateAttachment(
	config: IAttachmentConfig,
	fileSize?: number,
	fileName?: string,
): void {
	// Validate attachment type
	if (!['image', 'video', 'audio', 'file'].includes(config.type)) {
		throw new Error(`Unsupported attachment type: ${config.type}`);
	}

	// Validate input type
	if (!['binary', 'url'].includes(config.inputType)) {
		throw new Error(`Unsupported input type: ${config.inputType}`);
	}

	// Validate binary property for binary input
	if (config.inputType === 'binary' && (!config.binaryProperty || config.binaryProperty.trim() === '')) {
		throw new Error('Binary property name is required for binary input type');
	}

	// Validate file URL for URL input
	if (config.inputType === 'url') {
		if (!config.fileUrl || config.fileUrl.trim() === '') {
			throw new Error('File URL is required for URL input type');
		}

		// Basic URL validation
		try {
			new URL(config.fileUrl);
		} catch {
			throw new Error(`Invalid file URL: ${config.fileUrl}`);
		}
	}

	// Validate file size if provided
	if (fileSize !== undefined) {
		const maxSize = FILE_SIZE_LIMITS[config.type];
		if (fileSize > maxSize) {
			throw new Error(
				`File size (${Math.round(fileSize / 1024 / 1024 * 100) / 100}MB) exceeds maximum allowed size for ${config.type} (${Math.round(maxSize / 1024 / 1024)}MB)`
			);
		}
	}

	// Validate file extension if fileName is provided
	if (fileName) {
		const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
		const supportedExts = SUPPORTED_EXTENSIONS[config.type];

		if (extension && !supportedExts.includes(extension)) {
			throw new Error(
				`Unsupported file extension "${extension}" for ${config.type}. Supported extensions: ${supportedExts.join(', ')}`
			);
		}
	}
}

/**
 * Download file from URL to temporary location
 * 
 * Downloads a file from a remote URL to a temporary local file for processing.
 * Handles file naming and validates the download response.
 * 
 * @param this - The execution context providing access to HTTP helpers
 * @param url - The URL of the file to download
 * @param fileName - Optional custom file name (auto-generated if not provided)
 * @returns Promise resolving to file details including path, name, and size
 * @throws {NodeOperationError} When download fails or URL is invalid
 */
export async function downloadFileFromUrl(
	this: IExecuteFunctions,
	url: string,
	fileName?: string,
): Promise<{ filePath: string; fileName: string; fileSize: number }> {
	try {
		const response = await this.helpers.httpRequest({
			method: 'GET',
			url,
			encoding: 'arraybuffer',
			returnFullResponse: true,
		});

		if (response.statusCode !== 200) {
			throw new Error(`Failed to download file: HTTP ${response.statusCode}`);
		}

		// Generate file name if not provided
		if (!fileName) {
			const urlPath = new URL(url).pathname;
			fileName = urlPath.substring(urlPath.lastIndexOf('/') + 1) || `file_${randomUUID()}`;
		}

		// Create temporary file path
		const tempDir = tmpdir();
		const filePath = join(tempDir, `max_upload_${randomUUID()}_${fileName}`);

		// Write file to temporary location
		const fileBuffer = Buffer.from(response.body as string, 'binary');

		// Write file to disk for upload
		const fs = await import('fs');
		await fs.promises.writeFile(filePath, fileBuffer);

		return {
			filePath,
			fileName,
			fileSize: fileBuffer.length,
		};
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`Failed to download file from URL: ${error.message}`,
		);
	}
}

/**
 * Upload file to Max API and get token
 * 
 * Uploads a file to the Max API using the two-step upload process:
 * 1. Get upload URL from Max API
 * 2. Upload file to the provided URL
 * 3. Receive file token for use in messages
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param filePath - Local file path of the file to upload
 * @param fileName - Name of the file for upload
 * @param attachmentType - Type of attachment ('image', 'video', 'audio', 'file')
 * @returns Promise resolving to the file token for use in attachments
 * @throws {NodeOperationError} When upload fails or API responses are invalid
 */
export async function uploadFileToMax(
	this: IExecuteFunctions,
	_bot: Bot,
	filePath: string,
	fileName: string,
	attachmentType: string,
): Promise<string> {
	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = credentials['baseUrl'] || 'https://botapi.max.ru';

		// Step 1: Get upload URL from Max API
		const uploadUrlResponse = await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/uploads`,
			headers: {
				'Authorization': `Bearer ${credentials['accessToken']}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				type: attachmentType,
			}),
			json: true,
		});

		if (!uploadUrlResponse.url) {
			throw new Error('Failed to get upload URL from Max API');
		}

		// Step 2: Read file data from binary data
		const fs = await import('fs');
		const fileBuffer = await fs.promises.readFile(filePath);

		// Step 3: Upload file to the provided URL
		const uploadResponse = await this.helpers.httpRequest({
			method: 'POST',
			url: uploadUrlResponse.url,
			body: fileBuffer,
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="${fileName}"`,
			},
			returnFullResponse: true,
		});

		if (uploadResponse.statusCode !== 200) {
			throw new Error(`File upload failed: HTTP ${uploadResponse.statusCode}`);
		}

		// Step 4: Get file token from upload response
		let uploadResult;
		try {
			uploadResult = typeof uploadResponse.body === 'string'
				? JSON.parse(uploadResponse.body)
				: uploadResponse.body;
		} catch {
			throw new Error('Invalid response format from file upload');
		}

		if (!uploadResult.token) {
			throw new Error('No file token received from upload response');
		}

		return uploadResult.token;
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`Failed to upload file to Max API: ${error.message}`,
		);
	}
}

/**
 * Process binary data and upload to Max API
 * 
 * Processes binary data from n8n workflow and uploads it to Max API for use as attachment.
 * Validates file properties and handles the complete upload workflow.
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param config - Attachment configuration specifying type and binary property
 * @param item - Node execution data containing binary data
 * @returns Promise resolving to Max attachment object with file token
 * @throws {NodeOperationError} When binary data is missing or upload fails
 */
export async function processBinaryAttachment(
	this: IExecuteFunctions,
	bot: Bot,
	config: IAttachmentConfig,
	item: INodeExecutionData,
): Promise<IMaxAttachment> {
	// Get binary data
	const binaryData = item.binary?.[config.binaryProperty!];
	if (!binaryData) {
		throw new NodeOperationError(
			this.getNode(),
			`No binary data found for property "${config.binaryProperty}"`,
		);
	}

	// Validate file
	const fileName = config.fileName || binaryData.fileName || `file_${randomUUID()}`;
	const fileSize = typeof binaryData.fileSize === 'string' ? parseInt(binaryData.fileSize, 10) : binaryData.fileSize;
	validateAttachment(config, fileSize, fileName);

	// Get file path from binary data
	const filePath = binaryData.id;
	if (!filePath) {
		throw new NodeOperationError(
			this.getNode(),
			'Binary data does not contain file path',
		);
	}

	// Upload file and get token
	const token = await uploadFileToMax.call(this, bot, filePath, fileName, config.type);

	return {
		type: config.type,
		payload: {
			token,
		},
	};
}

/**
 * Process URL-based attachment and upload to Max API
 * 
 * Downloads a file from a URL and uploads it to Max API for use as attachment.
 * Handles temporary file management and cleanup after upload.
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param config - Attachment configuration specifying type and URL
 * @returns Promise resolving to Max attachment object with file token
 * @throws {NodeOperationError} When download or upload fails
 */
export async function processUrlAttachment(
	this: IExecuteFunctions,
	bot: Bot,
	config: IAttachmentConfig,
): Promise<IMaxAttachment> {
	// Download file from URL
	const { filePath, fileName, fileSize } = await downloadFileFromUrl.call(
		this,
		config.fileUrl!,
		config.fileName,
	);

	try {
		// Validate downloaded file
		validateAttachment(config, fileSize, fileName);

		// Upload file and get token
		const token = await uploadFileToMax.call(this, bot, filePath, fileName, config.type);

		return {
			type: config.type,
			payload: {
				token,
			},
		};
	} finally {
		// Clean up temporary file
		try {
			const fs = await import('fs');
			await fs.promises.unlink(filePath);
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Handle multiple attachments for a message
 * 
 * Processes multiple file attachments for a Max message, handling both binary data
 * and URL-based attachments with validation and upload to Max API.
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param attachmentConfigs - Array of attachment configurations to process
 * @param item - Node execution data containing binary data
 * @returns Promise resolving to array of Max attachment objects with file tokens
 * @throws {NodeOperationError} When attachment processing fails
 */
export async function handleAttachments(
	this: IExecuteFunctions,
	bot: Bot,
	attachmentConfigs: IAttachmentConfig[],
	item: INodeExecutionData,
): Promise<IMaxAttachment[]> {
	const attachments: IMaxAttachment[] = [];

	for (const config of attachmentConfigs) {
		try {
			let attachment: IMaxAttachment;

			if (config.inputType === 'binary') {
				attachment = await processBinaryAttachment.call(this, bot, config, item);
			} else {
				attachment = await processUrlAttachment.call(this, bot, config);
			}

			attachments.push(attachment);
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Failed to process ${config.type} attachment: ${error.message}`,
			);
		}
	}

	return attachments;
}

/**
 * Max API limits for inline keyboards
 */
const KEYBOARD_LIMITS = {
	MAX_BUTTONS_PER_ROW: 8,
	MAX_ROWS: 100,
	MAX_TOTAL_BUTTONS: 100,
	MAX_BUTTON_TEXT_LENGTH: 64,
	MAX_CALLBACK_DATA_LENGTH: 64,
	MAX_URL_LENGTH: 2048,
};

/**
 * Button Configuration Interface
 * 
 * Defines the configuration for individual buttons in inline keyboards,
 * including text, type, and type-specific properties like callbacks and URLs.
 */
export interface IButtonConfig {
	text: string;
	type: 'callback' | 'link' | 'request_contact' | 'request_geo_location';
	payload?: string;
	url?: string;
	intent?: 'default' | 'positive' | 'negative';
}

/**
 * Validate a single keyboard button
 * 
 * Validates the configuration of an individual keyboard button including text,
 * type, and type-specific properties against Max messenger constraints.
 * 
 * @param button - Button configuration object to validate
 * @throws {Error} When button configuration is invalid or exceeds limits
 */
export function validateKeyboardButton(button: IButtonConfig): void {
	// Validate button text
	if (typeof button.text !== 'string') {
		throw new Error('Button text is required and must be a string');
	}

	if (!button.text || button.text.trim().length === 0) {
		throw new Error('Button text cannot be empty');
	}

	if (button.text.length > KEYBOARD_LIMITS.MAX_BUTTON_TEXT_LENGTH) {
		throw new Error(`Button text cannot exceed ${KEYBOARD_LIMITS.MAX_BUTTON_TEXT_LENGTH} characters`);
	}

	// Validate button type
	const validTypes = ['callback', 'link', 'request_contact', 'request_geo_location'];
	if (!validTypes.includes(button.type)) {
		throw new Error(`Invalid button type: ${button.type}. Valid types: ${validTypes.join(', ')}`);
	}

	// Validate type-specific fields
	if (button.type === 'callback') {
		if (!button.payload || typeof button.payload !== 'string') {
			throw new Error('Callback buttons must have a payload string');
		}
		if (button.payload.length > KEYBOARD_LIMITS.MAX_CALLBACK_DATA_LENGTH) {
			throw new Error(`Callback payload cannot exceed ${KEYBOARD_LIMITS.MAX_CALLBACK_DATA_LENGTH} characters`);
		}
	}

	if (button.type === 'link') {
		if (!button.url || typeof button.url !== 'string') {
			throw new Error('Link buttons must have a URL string');
		}
		if (button.url.length > KEYBOARD_LIMITS.MAX_URL_LENGTH) {
			throw new Error(`Button URL cannot exceed ${KEYBOARD_LIMITS.MAX_URL_LENGTH} characters`);
		}

		// Basic URL validation
		try {
			new URL(button.url);
		} catch {
			throw new Error(`Invalid URL format: ${button.url}`);
		}
	}

	// Validate intent if provided
	if (button.intent && !['default', 'positive', 'negative'].includes(button.intent)) {
		throw new Error(`Invalid button intent: ${button.intent}. Valid intents: default, positive, negative`);
	}
}

/**
 * Get chat information using Max Bot API with enhanced error handling
 * 
 * Retrieves detailed information about a specific chat including metadata,
 * member count, and chat settings from the Max messenger API.
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param chatId - Numeric ID of the chat to retrieve information for
 * @returns Promise resolving to chat information object
 * @throws {NodeApiError} When Max API request fails or chat is not accessible
 */
export async function getChatInfo(
	this: IExecuteFunctions,
	_bot: Bot,
	chatId: number,
): Promise<any> {
	// Validate chat ID
	if (!chatId || isNaN(chatId)) {
		throw new Error('Chat ID is required and must be a number');
	}

	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = credentials['baseUrl'] || 'https://botapi.max.ru';

		// Make HTTP request to get chat info endpoint
		const result = await this.helpers.httpRequest({
			method: 'GET',
			url: `${baseUrl}/chats/${chatId}`,
			headers: {
				'Authorization': `Bearer ${credentials['accessToken']}`,
				'Content-Type': 'application/json',
			},
			json: true,
		});

		return result;
	} catch (error) {
		// Use enhanced error handling
		return await handleMaxApiError.call(this, error, 'get chat info');
	}
}

/**
 * Leave chat using Max Bot API with enhanced error handling
 * 
 * Removes the bot from a specific chat or group in Max messenger.
 * Only works for group chats where the bot has appropriate permissions.
 * 
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param chatId - Numeric ID of the chat to leave
 * @returns Promise resolving to the API response confirming chat exit
 * @throws {NodeApiError} When Max API request fails or bot cannot leave chat
 */
export async function leaveChat(
	this: IExecuteFunctions,
	_bot: Bot,
	chatId: number,
): Promise<any> {
	// Validate chat ID
	if (!chatId || isNaN(chatId)) {
		throw new Error('Chat ID is required and must be a number');
	}

	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = credentials['baseUrl'] || 'https://botapi.max.ru';

		// Make HTTP request to leave chat endpoint
		const result = await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/chats/${chatId}/leave`,
			headers: {
				'Authorization': `Bearer ${credentials['accessToken']}`,
				'Content-Type': 'application/json',
			},
			json: true,
		});

		return result || { success: true, chat_id: chatId, message: 'Successfully left the chat' };
	} catch (error) {
		// Use enhanced error handling
		return await handleMaxApiError.call(this, error, 'leave chat');
	}
}

/**
 * Validate keyboard layout and enforce Max API limits
 * 
 * Validates the overall structure of an inline keyboard including row count,
 * button count per row, and total button limits according to Max API constraints.
 * 
 * @param buttons - Two-dimensional array of button configurations representing keyboard layout
 * @throws {Error} When keyboard layout exceeds Max API limits or is invalid
 */
export function validateKeyboardLayout(buttons: IButtonConfig[][]): void {
	// Check if keyboard is empty
	if (!buttons || buttons.length === 0) {
		throw new Error('Keyboard must have at least one row of buttons');
	}

	// Check maximum rows
	if (buttons.length > KEYBOARD_LIMITS.MAX_ROWS) {
		throw new Error(`Keyboard cannot have more than ${KEYBOARD_LIMITS.MAX_ROWS} rows`);
	}

	let totalButtons = 0;

	// Validate each row
	for (let rowIndex = 0; rowIndex < buttons.length; rowIndex++) {
		const row = buttons[rowIndex];

		// Check if row is empty
		if (!row || row.length === 0) {
			throw new Error(`Row ${rowIndex + 1} cannot be empty`);
		}

		// Check maximum buttons per row
		if (row.length > KEYBOARD_LIMITS.MAX_BUTTONS_PER_ROW) {
			throw new Error(`Row ${rowIndex + 1} cannot have more than ${KEYBOARD_LIMITS.MAX_BUTTONS_PER_ROW} buttons`);
		}

		// Validate each button in the row
		for (let buttonIndex = 0; buttonIndex < row.length; buttonIndex++) {
			const button = row[buttonIndex];
			if (button) {
				try {
					validateKeyboardButton(button);
				} catch (error) {
					throw new Error(`Row ${rowIndex + 1}, Button ${buttonIndex + 1}: ${error.message}`);
				}
			}
		}

		totalButtons += row.length;
	}

	// Check total button limit
	if (totalButtons > KEYBOARD_LIMITS.MAX_TOTAL_BUTTONS) {
		throw new Error(`Keyboard cannot have more than ${KEYBOARD_LIMITS.MAX_TOTAL_BUTTONS} buttons total`);
	}
}

/**
 * Format keyboard buttons for Max API inline_keyboard structure
 * 
 * Converts a two-dimensional array of button configurations into the proper
 * Max API inline keyboard format with validation and structure formatting.
 * 
 * @param buttons - Two-dimensional array of button configurations representing keyboard layout
 * @returns Formatted Max keyboard object ready for API submission
 * @throws {Error} When keyboard layout validation fails
 */
export function formatInlineKeyboard(buttons: IButtonConfig[][]): IMaxKeyboard {
	// Validate the keyboard layout first
	validateKeyboardLayout(buttons);

	// Convert button configs to Max API format
	const formattedButtons: IMaxKeyboardButton[][] = buttons.map(row =>
		row.map(button => {
			const maxButton: IMaxKeyboardButton = {
				text: button.text.trim(),
				type: button.type,
			};

			// Add type-specific fields
			if (button.type === 'callback' && button.payload) {
				maxButton.payload = button.payload;
			}

			if (button.type === 'link' && button.url) {
				maxButton.url = button.url;
			}

			// Add intent if specified
			if (button.intent && button.intent !== 'default') {
				maxButton.intent = button.intent;
			}

			return maxButton;
		})
	);

	return {
		type: 'inline_keyboard',
		payload: {
			buttons: formattedButtons,
		},
	};
}

/**
 * Create inline keyboard attachment from button configuration
 * 
 * Creates a Max attachment object containing an inline keyboard from button configurations.
 * Validates and formats the keyboard structure for use in messages.
 * 
 * @param buttons - Two-dimensional array of button configurations representing keyboard layout
 * @returns Max attachment object containing the formatted inline keyboard
 * @throws {Error} When keyboard layout validation fails
 */
export function createInlineKeyboardAttachment(buttons: IButtonConfig[][]): IMaxAttachment {
	const keyboard = formatInlineKeyboard(buttons);

	return {
		type: 'inline_keyboard',
		payload: keyboard.payload,
	};
}

/**
 * Process keyboard configuration from n8n parameters
 * 
 * Extracts and processes inline keyboard configuration from n8n node parameters,
 * converting the UI structure into Max API compatible button arrays.
 * 
 * @param this - The execution context providing access to node parameters
 * @param index - The current item index for parameter retrieval
 * @returns Max attachment object containing the inline keyboard or null if no keyboard configured
 */
export function processKeyboardFromParameters(
	this: IExecuteFunctions,
	index: number,
): IMaxAttachment | null {
	const keyboardData = this.getNodeParameter('inlineKeyboard', index, {}) as IDataObject;

	if (!keyboardData || !keyboardData['buttons'] || !Array.isArray(keyboardData['buttons']) || keyboardData['buttons'].length === 0) {
		return null;
	}

	try {
		// Convert n8n parameter format to button config format
		const buttonRows: IButtonConfig[][] = [];

		for (const rowData of keyboardData['buttons'] as any[]) {
			if (rowData.row && rowData.row.button && Array.isArray(rowData.row.button) && rowData.row.button.length > 0) {
				const row: IButtonConfig[] = rowData.row.button.map((buttonData: any) => ({
					text: buttonData.text || '',
					type: buttonData.type || 'callback',
					payload: buttonData.payload || undefined,
					url: buttonData.url || undefined,
					intent: buttonData.intent || 'default',
				}));

				buttonRows.push(row);
			}
		}

		if (buttonRows.length === 0) {
			return null;
		}

		return createInlineKeyboardAttachment(buttonRows);
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`Failed to process inline keyboard: ${error.message}`,
		);
	}
}

/**
 * Process inline keyboard from additional fields data
 * 
 * Converts inline keyboard configuration from additional fields format to Max attachment format.
 * This function is used when keyboard data comes from additionalFields instead of direct parameters.
 * 
 * @param keyboardData - Keyboard configuration data from additionalFields
 * @returns Max attachment object containing the inline keyboard or null if no keyboard configured
 * @throws {Error} When keyboard configuration is invalid or processing fails
 */
export function processKeyboardFromAdditionalFields(
	keyboardData: IDataObject,
): IMaxAttachment | null {
	if (!keyboardData || !keyboardData['buttons'] || !Array.isArray(keyboardData['buttons']) || keyboardData['buttons'].length === 0) {
		return null;
	}

	try {
		// Convert n8n parameter format to button config format
		const buttonRows: IButtonConfig[][] = [];

		for (const rowData of keyboardData['buttons'] as any[]) {
			if (rowData.row && rowData.row.button && Array.isArray(rowData.row.button) && rowData.row.button.length > 0) {
				const row: IButtonConfig[] = rowData.row.button.map((buttonData: any) => ({
					text: buttonData.text || '',
					type: buttonData.type || 'callback',
					payload: buttonData.payload || undefined,
					url: buttonData.url || undefined,
					intent: buttonData.intent || 'default',
				}));

				buttonRows.push(row);
			}
		}

		if (buttonRows.length === 0) {
			return null;
		}

		return createInlineKeyboardAttachment(buttonRows);
	} catch (error) {
		throw new Error(`Failed to process inline keyboard: ${error.message}`);
	}
}