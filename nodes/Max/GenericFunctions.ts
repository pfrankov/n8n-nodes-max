import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { Bot } from '@maxhub/max-bot-api';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import FormData from 'form-data';

const DEFAULT_MAX_BASE_URL = 'https://platform-api.max.ru';
const ATTACHMENT_READY_RETRY_DELAYS_MS = [700, 1500, 3000];

function getAuthHeaders(accessToken: string): IDataObject {
	return {
		Authorization: accessToken,
	};
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function extractMaxErrorText(error: unknown): string {
	const parts: string[] = [];

	const append = (value: unknown) => {
		if (typeof value === 'string' && value.trim().length > 0) {
			parts.push(value.toLowerCase());
		}
	};

	append((error as { message?: string })?.message);
	append((error as { description?: string })?.description);

	const responseBody = (error as { response?: { body?: unknown } })?.response?.body;
	const directBody = (error as { body?: unknown })?.body;
	const nestedError = (error as { error?: unknown })?.error;

	for (const bodyCandidate of [responseBody, directBody, nestedError]) {
		if (typeof bodyCandidate === 'string') {
			append(bodyCandidate);
			continue;
		}

		if (bodyCandidate && typeof bodyCandidate === 'object') {
			const typedBody = bodyCandidate as {
				message?: string;
				description?: string;
				error?: string;
				error_description?: string;
			};
			append(typedBody.message);
			append(typedBody.description);
			append(typedBody.error);
			append(typedBody.error_description);
		}
	}

	return parts.join(' ');
}

function isUnsupportedMarkdownSyntaxError(error: unknown): boolean {
	const errorText = extractMaxErrorText(error);
	return (
		errorText.includes('some markdown syntax is not supported') ||
		(errorText.includes('markdown syntax') && errorText.includes('not supported')) ||
		errorText.includes('use basic formatting')
	);
}

function isAttachmentNotReadyError(error: unknown): boolean {
	const errorText = extractMaxErrorText(error);
	return (
		errorText.includes('attachment.not.ready') ||
		errorText.includes('errors.process.attachment.file.not.processed') ||
		errorText.includes('file.not.processed')
	);
}

function hasMediaAttachments(body: IDataObject): boolean {
	const attachments = body['attachments'];
	if (!Array.isArray(attachments)) {
		return false;
	}

	return attachments.some((attachment) => {
		if (!attachment || typeof attachment !== 'object') {
			return false;
		}

		const type = (attachment as IDataObject)['type'];
		return typeof type === 'string' && ['image', 'video', 'audio', 'file'].includes(type);
	});
}

function hasAnyAttachments(options: IDataObject): boolean {
	const attachments = options['attachments'];
	return Array.isArray(attachments) && attachments.length > 0;
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.keys(value).length > 0
	);
}

function getNonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function hasKnownUploadPayloadFields(payload: IMaxUploadResponse): boolean {
	return (
		getNonEmptyString(payload.token) !== undefined ||
		getNonEmptyString(payload.url) !== undefined ||
		isNonEmptyObject(payload.photos)
	);
}

function resolveUploadPayload(
	uploadResult: IMaxUploadResponse,
	attachmentType: IAttachmentConfig['type'],
	tokenFromUploadsEndpoint?: string,
): IMaxUploadResponse | null {
	const token = getNonEmptyString(uploadResult.token);
	const url = getNonEmptyString(uploadResult.url);
	const photos = isNonEmptyObject(uploadResult.photos) ? uploadResult.photos : undefined;

	if (attachmentType === 'image') {
		if (token) {
			return { token };
		}
		if (photos) {
			return { photos };
		}
		if (url) {
			return { url };
		}
		return null;
	}

	if (attachmentType === 'video' || attachmentType === 'audio') {
		if (token) {
			return { token };
		}
		const fallbackToken = getNonEmptyString(tokenFromUploadsEndpoint);
		return fallbackToken ? { token: fallbackToken } : null;
	}

	// file
	if (token) {
		return { token };
	}
	if (url) {
		return { url };
	}
	return null;
}

function stripMarkdownFormatting(text: string): string {
	let sanitizedText = text;

	// Convert markdown links/mentions to readable plain text while preserving URL.
	sanitizedText = sanitizedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

	// Remove code fences and inline code markers, preserving content.
	sanitizedText = sanitizedText.replace(/```([\s\S]*?)```/g, '$1');
	sanitizedText = sanitizedText.replace(/`([^`]+)`/g, '$1');

	// Remove formatting wrappers while preserving text content.
	sanitizedText = sanitizedText.replace(/(\*\*|__|~~|\+\+)([\s\S]*?)\1/g, '$2');
	sanitizedText = sanitizedText.replace(/(\*|_)([^*_]+)\1/g, '$2');

	// Unescape common markdown escapes to improve readability.
	sanitizedText = sanitizedText.replace(/\\([\\`*_{}[\]()#+\-.!~])/g, '$1');

	return sanitizedText;
}

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
export async function createMaxBotInstance(this: IExecuteFunctions): Promise<Bot> {
	const credentials = await this.getCredentials('maxApi');

	if (!credentials['accessToken']) {
		throw new NodeApiError(this.getNode(), {
			message: 'Max API access token is required',
		} as JsonObject);
	}

	// Create Bot instance with configured base URL.
	const config = {
		clientOptions: {
			baseUrl: (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL,
		},
	};

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
 * @param text - Message text content (max 4000 characters). May be empty when attachments are provided
 * @param options - Additional message options (format, attachments, etc.)
 * @returns Promise resolving to the API response with message details
 * @throws {NodeOperationError} When validation fails or parameters are invalid
 * @throws {NodeApiError} When Max API request fails
 */
export async function sendMessage(
	this: IExecuteFunctions,
	_bot: Bot,
	recipientType: 'user' | 'chat',
	recipientId: number,
	text: string,
	options: IDataObject = {},
): Promise<any> {
	const hasAttachments = hasAnyAttachments(options);
	const hasText = text.trim().length > 0;
	const format = hasText ? (options['format'] as string | undefined) : undefined;

	// Validate input parameters before making API call
	validateInputParameters(recipientType, recipientId, text, format, {
		allowEmptyText: hasAttachments,
	});

	try {
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL;
		const accessToken = credentials['accessToken'] as string;

		const disableLinkPreview = options['disable_link_preview'] as boolean | undefined;
		const bodyOptions = { ...options };
		delete bodyOptions['disable_link_preview'];

		if (!hasText) {
			delete bodyOptions['format'];
		}

		const body: IDataObject = {
			...bodyOptions,
		};

		if (hasText) {
			body['text'] = text;
		}

		const qs: IDataObject =
			recipientType === 'user' ? { user_id: recipientId } : { chat_id: recipientId };
		if (disableLinkPreview !== undefined) {
			qs['disable_link_preview'] = disableLinkPreview;
		}

		const requestOptions: IHttpRequestOptions = {
			method: 'POST',
			url: `${baseUrl}/messages`,
			qs,
			headers: {
				...getAuthHeaders(accessToken),
				'Content-Type': 'application/json',
			},
			body,
			json: true,
		};
		const hasMediaAttachmentPayload = hasMediaAttachments(body);
		let requestBody = body;
		let markdownFallbackApplied = false;
		let attachmentRetryAttempt = 0;

		while (true) {
			try {
				return await this.helpers.httpRequest({
					...requestOptions,
					body: requestBody,
				});
			} catch (error) {
				if (
					!markdownFallbackApplied &&
					format === 'markdown' &&
					isUnsupportedMarkdownSyntaxError(error)
				) {
					const plainText = stripMarkdownFormatting(text);
					requestBody = {
						...requestBody,
						text: plainText.trim().length > 0 ? plainText : text,
					};
					delete requestBody['format'];
					markdownFallbackApplied = true;
					continue;
				}

				if (
					hasMediaAttachmentPayload &&
					isAttachmentNotReadyError(error) &&
					attachmentRetryAttempt < ATTACHMENT_READY_RETRY_DELAYS_MS.length
				) {
					const retryDelay = ATTACHMENT_READY_RETRY_DELAYS_MS[attachmentRetryAttempt] as number;
					attachmentRetryAttempt += 1;
					await sleep(retryDelay);
					continue;
				}

				throw error;
			}
		}
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
			throw new Error(
				'HTML format error: unclosed tags detected. Make sure all HTML tags are properly closed.',
			);
		}
	}

	if (format === 'markdown') {
		// Check for unmatched markdown syntax
		const boldCount = (text.match(/\*/g) || []).length;
		const italicCount = (text.match(/_/g) || []).length;
		const codeCount = (text.match(/`/g) || []).length;

		if (boldCount % 2 !== 0) {
			throw new Error(
				'Markdown format error: unmatched bold markers (*). Make sure all bold text is properly closed.',
			);
		}
		if (italicCount % 2 !== 0) {
			throw new Error(
				'Markdown format error: unmatched italic markers (_). Make sure all italic text is properly closed.',
			);
		}
		if (codeCount % 2 !== 0) {
			throw new Error(
				'Markdown format error: unmatched code markers (`). Make sure all code blocks are properly closed.',
			);
		}
	}

	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL;
		const accessToken = credentials['accessToken'] as string;

		// Build request body. `disable_link_preview` is supported only for POST /messages.
		const requestBody: IDataObject = {
			text,
			...options,
		};
		delete requestBody['disable_link_preview'];

		// Make HTTP request to edit message endpoint
		const requestOptions: IHttpRequestOptions = {
			method: 'PUT',
			url: `${baseUrl}/messages`,
			qs: {
				message_id: messageId.trim(),
			},
			headers: {
				...getAuthHeaders(accessToken),
				'Content-Type': 'application/json',
			},
			body: requestBody,
			json: true,
		};

		try {
			return await this.helpers.httpRequest(requestOptions);
		} catch (error) {
			const format = options['format'] as string | undefined;
			if (format === 'markdown' && isUnsupportedMarkdownSyntaxError(error)) {
				const plainText = stripMarkdownFormatting(text);
				const fallbackBody: IDataObject = {
					...requestBody,
					text: plainText.trim().length > 0 ? plainText : text,
				};
				delete fallbackBody['format'];

				return await this.helpers.httpRequest({
					...requestOptions,
					body: fallbackBody,
				});
			}

			throw error;
		}
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
		const baseUrl = (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL;
		const accessToken = credentials['accessToken'] as string;

		// Make HTTP request to delete message endpoint
		const result = await this.helpers.httpRequest({
			method: 'DELETE',
			url: `${baseUrl}/messages`,
			qs: {
				message_id: messageId.trim(),
			},
			headers: getAuthHeaders(accessToken),
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
 * @param text - Optional one-time notification text to show to the user
 * @returns Promise resolving to the API response confirming the callback answer
 * @throws {Error} When callback query ID is invalid
 * @throws {NodeApiError} When Max API request fails
 */
export async function answerCallbackQuery(
	this: IExecuteFunctions,
	_bot: Bot,
	callbackQueryId: string,
	text?: string,
): Promise<any> {
	// Validate callback query ID
	if (!callbackQueryId || callbackQueryId.trim() === '') {
		throw new Error('Callback Query ID is required and cannot be empty');
	}

	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL;
		const accessToken = credentials['accessToken'] as string;

		// Build request body
		const requestBody: IDataObject = {};
		if (text && text.trim().length > 0) {
			requestBody['notification'] = text.trim();
		}

		// Make HTTP request to answer callback query endpoint
		const result = await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/answers`,
			qs: {
				callback_id: callbackQueryId.trim(),
			},
			headers: {
				...getAuthHeaders(accessToken),
				'Content-Type': 'application/json',
			},
			body: requestBody,
			json: true,
		});

		return (
			result || {
				success: true,
				callback_id: callbackQueryId,
				notification: text || '',
			}
		);
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
		// Simple validation - check for basic HTML tags that Max supports per OpenAPI
		const allowedTags = [
			'b',
			'strong',
			'i',
			'em',
			'u',
			'ins',
			's',
			'del',
			'code',
			'pre',
			'a',
			'mark',
			'h1',
		];
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
		// Allow Max-flavored markdown as per schema; do not restrict here
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
	if (
		error.error_code === 401 ||
		error.status === 401 ||
		error.description?.toLowerCase().includes('unauthorized') ||
		error.message?.toLowerCase().includes('unauthorized') ||
		error.description?.toLowerCase().includes('invalid token') ||
		error.message?.toLowerCase().includes('invalid token')
	) {
		return MaxErrorCategory.AUTHENTICATION;
	}

	// Rate limiting errors
	if (
		error.error_code === 429 ||
		error.status === 429 ||
		error.description?.toLowerCase().includes('too many requests') ||
		error.message?.toLowerCase().includes('too many requests') ||
		error.parameters?.retry_after !== undefined
	) {
		return MaxErrorCategory.RATE_LIMIT;
	}

	// Validation errors
	if (
		error.error_code === 400 ||
		error.status === 400 ||
		error.description?.toLowerCase().includes('bad request') ||
		error.message?.toLowerCase().includes('bad request') ||
		error.description?.toLowerCase().includes('invalid parameter') ||
		error.message?.toLowerCase().includes('invalid parameter')
	) {
		return MaxErrorCategory.VALIDATION;
	}

	// Business logic errors
	if (
		error.error_code === 403 ||
		error.status === 403 ||
		error.error_code === 404 ||
		error.status === 404 ||
		error.description?.toLowerCase().includes('forbidden') ||
		error.message?.toLowerCase().includes('forbidden') ||
		error.description?.toLowerCase().includes('not found') ||
		error.message?.toLowerCase().includes('not found') ||
		error.description?.toLowerCase().includes('chat not found') ||
		error.message?.toLowerCase().includes('chat not found') ||
		error.description?.toLowerCase().includes('user blocked') ||
		error.message?.toLowerCase().includes('user blocked')
	) {
		return MaxErrorCategory.BUSINESS_LOGIC;
	}

	// Network errors
	if (
		error.code === 'ECONNREFUSED' ||
		error.code === 'ENOTFOUND' ||
		error.code === 'ETIMEDOUT' ||
		error.code === 'ECONNRESET' ||
		error.message?.toLowerCase().includes('network') ||
		error.message?.toLowerCase().includes('timeout') ||
		error.message?.toLowerCase().includes('connection')
	) {
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
export function createUserFriendlyErrorMessage(
	error: IMaxError,
	category: MaxErrorCategory,
): string {
	const baseMessage = error.description || error.message || 'An unknown error occurred';

	switch (category) {
		case MaxErrorCategory.AUTHENTICATION:
			return `Authorization failed - please check your credentials: ${baseMessage}. Please check your Max API access token in the credentials. Make sure the token is valid and has not expired. You can get a new token from @PrimeBot in Max messenger.`;

		case MaxErrorCategory.RATE_LIMIT:
			const retryAfter = error.parameters?.retry_after;
			const retryMessage = retryAfter
				? ` Please wait ${retryAfter} seconds before retrying.`
				: ' Please wait before retrying.';
			return `The service is receiving too many requests from you: ${baseMessage}.${retryMessage} Consider reducing the frequency of your requests or implementing delays between operations.`;

		case MaxErrorCategory.VALIDATION:
			return `Invalid request parameters: ${baseMessage}. Please check your input data. Common issues include: invalid user/chat IDs, message text too long (max 4000 characters), unsupported formatting, or missing required fields.`;

		case MaxErrorCategory.BUSINESS_LOGIC:
			if (baseMessage.toLowerCase().includes('chat not found')) {
				return `Chat not found: ${baseMessage}. The specified chat ID may be incorrect, or the bot may not have access to this chat. Make sure the bot has been added to the chat and has appropriate permissions.`;
			}
			if (
				baseMessage.toLowerCase().includes('user blocked') ||
				baseMessage.toLowerCase().includes('forbidden')
			) {
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
 * @param validationOptions - Optional validation flags
 * @throws {Error} When any parameter validation fails
 */
export function validateInputParameters(
	recipientType: 'user' | 'chat',
	recipientId: number,
	text: string,
	format?: string,
	validationOptions: {
		allowEmptyText?: boolean;
	} = {},
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
		if (validationOptions.allowEmptyText) {
			return;
		}

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
			throw new Error(
				'HTML format error: unclosed tags detected. Make sure all HTML tags are properly closed.',
			);
		}
	}

	if (format === 'markdown') {
		// Check for unmatched markdown syntax
		const boldCount = (text.match(/\*/g) || []).length;
		const italicCount = (text.match(/_/g) || []).length;
		const codeCount = (text.match(/`/g) || []).length;

		if (boldCount % 2 !== 0) {
			throw new Error(
				'Markdown format error: unmatched bold markers (*). Make sure all bold text is properly closed.',
			);
		}
		if (italicCount % 2 !== 0) {
			throw new Error(
				'Markdown format error: unmatched italic markers (_). Make sure all italic text is properly closed.',
			);
		}
		if (codeCount % 2 !== 0) {
			throw new Error(
				'Markdown format error: unmatched code markers (`). Make sure all code blocks are properly closed.',
			);
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
	type: 'callback' | 'link' | 'open_app' | 'request_contact' | 'request_geo_location' | 'chat';
	payload?: string;
	url?: string;
	chat_title?: string;
	chat_description?: string;
	start_payload?: string;
	uuid?: number;
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
	url?: string;
	token?: string;
	photos?: Record<string, unknown>;
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
	file: 20 * 1024 * 1024, // 20MB
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
	if (
		config.inputType === 'binary' &&
		(!config.binaryProperty || config.binaryProperty.trim() === '')
	) {
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
				`File size (${Math.round((fileSize / 1024 / 1024) * 100) / 100}MB) exceeds maximum allowed size for ${config.type} (${Math.round(maxSize / 1024 / 1024)}MB)`,
			);
		}
	}

	// Validate file extension if fileName is provided
	if (fileName) {
		const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
		const supportedExts = SUPPORTED_EXTENSIONS[config.type];

		if (extension && !supportedExts.includes(extension)) {
			throw new Error(
				`Unsupported file extension "${extension}" for ${config.type}. Supported extensions: ${supportedExts.join(', ')}`,
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
 * Upload file to Max API and get attachment payload
 *
 * Uploads a file to the Max API using the two-step upload process:
 * 1. Get upload URL from Max API
 * 2. Upload file to the provided URL
 * 3. Receive attachment payload JSON for use in messages
 *
 * @param this - The execution context providing access to credentials and helpers
 * @param bot - Configured Max Bot API instance
 * @param filePath - Local file path of the file to upload
 * @param fileName - Name of the file for upload
 * @param attachmentType - Type of attachment ('image', 'video', 'audio', 'file')
 * @returns Promise resolving to attachment payload for use in message attachments
 * @throws {NodeOperationError} When upload fails or API responses are invalid
 */
export async function uploadFileToMax(
	this: IExecuteFunctions,
	_bot: Bot,
	filePath: string,
	fileName: string,
	attachmentType: IAttachmentConfig['type'],
): Promise<IMaxUploadResponse> {
	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL;
		const accessToken = credentials['accessToken'] as string;

		// Step 1: Get upload URL from Max API
		const uploadUrlResponse = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/uploads`,
			qs: {
				type: attachmentType,
			},
			headers: getAuthHeaders(accessToken),
			json: true,
		})) as IMaxUploadResponse;
		const tokenFromUploadsEndpoint = uploadUrlResponse.token;

		// For some media types API can return token immediately.
		if (uploadUrlResponse.token && !uploadUrlResponse.url) {
			return { token: uploadUrlResponse.token };
		}

		if (!uploadUrlResponse.url || typeof uploadUrlResponse.url !== 'string') {
			throw new Error('Failed to get upload URL from Max API');
		}

		// Step 2: Read file data from binary data
		const fs = await import('fs');
		const fileBuffer = await fs.promises.readFile(filePath);
		const formData = new FormData();
		formData.append('data', fileBuffer, {
			filename: fileName,
			contentType: 'application/octet-stream',
		});

		// Step 3: Upload file to the provided URL
		const uploadResponse = await this.helpers.httpRequest({
			method: 'POST',
			url: uploadUrlResponse.url,
			body: formData,
			headers: {
				...formData.getHeaders(),
				...getAuthHeaders(accessToken),
			},
			returnFullResponse: true,
		});

		if (uploadResponse.statusCode >= 400) {
			throw new Error(`File upload failed: HTTP ${uploadResponse.statusCode}`);
		}

		// Step 4: Get file token from upload response
		let uploadResult: IMaxUploadResponse = {};
		if (
			uploadResponse.body !== undefined &&
			uploadResponse.body !== null &&
			uploadResponse.body !== ''
		) {
			try {
				const parsedBody =
					typeof uploadResponse.body === 'string'
						? JSON.parse(uploadResponse.body)
						: uploadResponse.body;
				if (!isNonEmptyObject(parsedBody)) {
					throw new Error('Upload response is not a JSON object');
				}
				uploadResult = parsedBody as IMaxUploadResponse;
			} catch {
				if (tokenFromUploadsEndpoint) {
					return { token: tokenFromUploadsEndpoint };
				}
				throw new Error('Invalid response format from file upload');
			}
		}

		const supportedPayload = resolveUploadPayload(
			uploadResult,
			attachmentType,
			tokenFromUploadsEndpoint,
		);
		if (supportedPayload) {
			return supportedPayload;
		}

		throw new Error('No supported attachment payload received from Max API');
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
 * @returns Promise resolving to Max attachment object with upload payload
 * @throws {NodeOperationError} When binary data is missing or upload fails
 */
export async function processBinaryAttachment(
	this: IExecuteFunctions,
	bot: Bot,
	config: IAttachmentConfig,
	item: INodeExecutionData,
	itemIndex: number = 0,
): Promise<IMaxAttachment> {
	// Get binary data
	const binaryProperty = config.binaryProperty as string;
	const binaryData = item.binary?.[binaryProperty];
	if (!binaryData) {
		throw new NodeOperationError(
			this.getNode(),
			`No binary data found for property "${config.binaryProperty}"`,
		);
	}

	// Validate file
	const fileName = config.fileName || binaryData.fileName || `file_${randomUUID()}`;
	const fileSize =
		typeof binaryData.fileSize === 'string'
			? parseInt(binaryData.fileSize, 10)
			: binaryData.fileSize;
	validateAttachment(config, fileSize, fileName);

	let tempFilePath = '';
	try {
		const binaryBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProperty);
		if (!binaryBuffer || binaryBuffer.length === 0) {
			throw new NodeOperationError(this.getNode(), `Binary data for "${binaryProperty}" is empty`);
		}

		const fs = await import('fs');
		const safeFileName = basename(fileName);
		tempFilePath = join(tmpdir(), `max_upload_${randomUUID()}_${safeFileName}`);
		await fs.promises.writeFile(tempFilePath, binaryBuffer);

		// Upload file and get token/url
		const uploadResult = await uploadFileToMax.call(this, bot, tempFilePath, fileName, config.type);
		if (!hasKnownUploadPayloadFields(uploadResult)) {
			throw new NodeOperationError(
				this.getNode(),
				'Upload completed but no attachment payload was returned',
			);
		}

		return {
			type: config.type,
			payload: uploadResult,
		};
	} finally {
		if (tempFilePath) {
			try {
				const fs = await import('fs');
				await fs.promises.unlink(tempFilePath);
			} catch {
				// Ignore cleanup errors
			}
		}
	}
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
 * @returns Promise resolving to Max attachment object with upload payload
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

		// Upload file and get token/url
		const uploadResult = await uploadFileToMax.call(this, bot, filePath, fileName, config.type);
		if (!hasKnownUploadPayloadFields(uploadResult)) {
			throw new NodeOperationError(
				this.getNode(),
				'Upload completed but no attachment payload was returned',
			);
		}

		return {
			type: config.type,
			payload: uploadResult,
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
	itemIndex: number = 0,
): Promise<IMaxAttachment[]> {
	const attachments: IMaxAttachment[] = [];

	for (const config of attachmentConfigs) {
		try {
			let attachment: IMaxAttachment;

			if (config.inputType === 'binary') {
				attachment = await processBinaryAttachment.call(this, bot, config, item, itemIndex);
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
	MAX_BUTTONS_PER_ROW: 7,
	MAX_ROWS: 30,
	MAX_TOTAL_BUTTONS: 210,
	MAX_LIMITED_TYPE_BUTTONS_PER_ROW: 3,
	MAX_BUTTON_TEXT_LENGTH: 128,
	MAX_CALLBACK_DATA_LENGTH: 1024,
	MAX_URL_LENGTH: 2048,
	MAX_CHAT_TITLE_LENGTH: 200,
	MAX_CHAT_DESCRIPTION_LENGTH: 400,
	MAX_START_PAYLOAD_LENGTH: 512,
};

/**
 * Button Configuration Interface
 *
 * Defines the configuration for individual buttons in inline keyboards,
 * including text, type, and type-specific properties like callbacks and URLs.
 */
export interface IButtonConfig {
	text: string;
	type: 'callback' | 'link' | 'open_app' | 'request_contact' | 'request_geo_location' | 'chat';
	payload?: string;
	url?: string;
	chat_title?: string;
	chat_description?: string;
	start_payload?: string;
	uuid?: number;
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
		throw new Error(
			`Button text cannot exceed ${KEYBOARD_LIMITS.MAX_BUTTON_TEXT_LENGTH} characters`,
		);
	}

	// Validate button type
	const validTypes = [
		'callback',
		'link',
		'open_app',
		'request_contact',
		'request_geo_location',
		'chat',
	];
	if (!validTypes.includes(button.type)) {
		throw new Error(`Invalid button type: ${button.type}. Valid types: ${validTypes.join(', ')}`);
	}

	// Validate type-specific fields
	if (button.type === 'callback') {
		if (!button.payload || typeof button.payload !== 'string') {
			throw new Error('Callback buttons must have a payload string');
		}
		if (button.payload.length > KEYBOARD_LIMITS.MAX_CALLBACK_DATA_LENGTH) {
			throw new Error(
				`Callback payload cannot exceed ${KEYBOARD_LIMITS.MAX_CALLBACK_DATA_LENGTH} characters`,
			);
		}
	}

	if (button.type === 'link' || button.type === 'open_app') {
		if (!button.url || typeof button.url !== 'string') {
			throw new Error(`${button.type} buttons must have a URL string`);
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

	if (button.type === 'chat') {
		if (
			!button.chat_title ||
			typeof button.chat_title !== 'string' ||
			button.chat_title.trim().length === 0
		) {
			throw new Error('Chat buttons must have a non-empty chat_title string');
		}
		if (button.chat_title.length > KEYBOARD_LIMITS.MAX_CHAT_TITLE_LENGTH) {
			throw new Error(
				`chat_title cannot exceed ${KEYBOARD_LIMITS.MAX_CHAT_TITLE_LENGTH} characters`,
			);
		}
		if (button.chat_description !== undefined) {
			if (typeof button.chat_description !== 'string') {
				throw new Error('chat_description must be a string when provided');
			}
			if (button.chat_description.length > KEYBOARD_LIMITS.MAX_CHAT_DESCRIPTION_LENGTH) {
				throw new Error(
					`chat_description cannot exceed ${KEYBOARD_LIMITS.MAX_CHAT_DESCRIPTION_LENGTH} characters`,
				);
			}
		}
		if (button.start_payload !== undefined) {
			if (typeof button.start_payload !== 'string') {
				throw new Error('start_payload must be a string when provided');
			}
			if (button.start_payload.length > KEYBOARD_LIMITS.MAX_START_PAYLOAD_LENGTH) {
				throw new Error(
					`start_payload cannot exceed ${KEYBOARD_LIMITS.MAX_START_PAYLOAD_LENGTH} characters`,
				);
			}
		}
		if (button.uuid !== undefined && (!Number.isInteger(button.uuid) || button.uuid < 0)) {
			throw new Error('uuid must be a non-negative integer when provided');
		}
	}

	// Validate intent if provided
	if (button.intent && !['default', 'positive', 'negative'].includes(button.intent)) {
		throw new Error(
			`Invalid button intent: ${button.intent}. Valid intents: default, positive, negative`,
		);
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
		const baseUrl = (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL;
		const accessToken = credentials['accessToken'] as string;

		// Make HTTP request to get chat info endpoint
		const result = await this.helpers.httpRequest({
			method: 'GET',
			url: `${baseUrl}/chats/${chatId}`,
			headers: {
				...getAuthHeaders(accessToken),
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
export async function leaveChat(this: IExecuteFunctions, _bot: Bot, chatId: number): Promise<any> {
	// Validate chat ID
	if (!chatId || isNaN(chatId)) {
		throw new Error('Chat ID is required and must be a number');
	}

	try {
		// Get credentials for API calls
		const credentials = await this.getCredentials('maxApi');
		const baseUrl = (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL;
		const accessToken = credentials['accessToken'] as string;

		// Make HTTP request to leave chat endpoint
		const result = await this.helpers.httpRequest({
			method: 'DELETE',
			url: `${baseUrl}/chats/${chatId}/members/me`,
			headers: getAuthHeaders(accessToken),
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
			throw new Error(
				`Row ${rowIndex + 1} cannot have more than ${KEYBOARD_LIMITS.MAX_BUTTONS_PER_ROW} buttons`,
			);
		}

		const limitedTypeButtonsInRow = row.filter(
			(button) =>
				button.type === 'link' ||
				button.type === 'chat' ||
				button.type === 'open_app' ||
				button.type === 'request_geo_location' ||
				button.type === 'request_contact',
		).length;
		if (limitedTypeButtonsInRow > KEYBOARD_LIMITS.MAX_LIMITED_TYPE_BUTTONS_PER_ROW) {
			throw new Error(
				`Row ${rowIndex + 1} cannot have more than ${KEYBOARD_LIMITS.MAX_LIMITED_TYPE_BUTTONS_PER_ROW} link/chat/open_app/request_geo_location/request_contact buttons`,
			);
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
		throw new Error(
			`Keyboard cannot have more than ${KEYBOARD_LIMITS.MAX_TOTAL_BUTTONS} buttons total`,
		);
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
	const formattedButtons: IMaxKeyboardButton[][] = buttons.map((row) =>
		row.map((button) => {
			const maxButton: IMaxKeyboardButton = {
				text: button.text.trim(),
				type: button.type,
			};

			// Add type-specific fields
			if (button.type === 'callback' && button.payload) {
				maxButton.payload = button.payload;
			}

			if ((button.type === 'link' || button.type === 'open_app') && button.url) {
				maxButton.url = button.url;
			}

			if (button.type === 'chat') {
				if (button.chat_title !== undefined) {
					maxButton.chat_title = button.chat_title;
				}
				if (button.chat_description !== undefined) {
					maxButton.chat_description = button.chat_description;
				}
				if (button.start_payload !== undefined) {
					maxButton.start_payload = button.start_payload;
				}
				if (button.uuid !== undefined) {
					maxButton.uuid = button.uuid;
				}
			}

			// Add intent if specified
			if (button.intent && button.intent !== 'default') {
				maxButton.intent = button.intent;
			}

			return maxButton;
		}),
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

function normalizeButtonUuid(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}

	if (typeof value === 'number' && Number.isInteger(value)) {
		return value;
	}

	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10);
		if (Number.isInteger(parsed)) {
			return parsed;
		}
	}

	return undefined;
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

	if (
		!keyboardData ||
		!keyboardData['buttons'] ||
		!Array.isArray(keyboardData['buttons']) ||
		keyboardData['buttons'].length === 0
	) {
		return null;
	}

	try {
		// Convert n8n parameter format to button config format
		const buttonRows: IButtonConfig[][] = [];

		for (const rowData of keyboardData['buttons'] as any[]) {
			if (
				rowData.row &&
				rowData.row.button &&
				Array.isArray(rowData.row.button) &&
				rowData.row.button.length > 0
			) {
				const row: IButtonConfig[] = rowData.row.button.map((buttonData: any) => ({
					text: buttonData.text || '',
					type: buttonData.type || 'callback',
					payload: buttonData.payload || undefined,
					url: buttonData.url || undefined,
					chat_title: buttonData.chatTitle || undefined,
					chat_description: buttonData.chatDescription || undefined,
					start_payload: buttonData.startPayload || undefined,
					uuid: normalizeButtonUuid(buttonData.uuid),
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
	if (
		!keyboardData ||
		!keyboardData['buttons'] ||
		!Array.isArray(keyboardData['buttons']) ||
		keyboardData['buttons'].length === 0
	) {
		return null;
	}

	try {
		// Convert n8n parameter format to button config format
		const buttonRows: IButtonConfig[][] = [];

		for (const rowData of keyboardData['buttons'] as any[]) {
			if (
				rowData.row &&
				rowData.row.button &&
				Array.isArray(rowData.row.button) &&
				rowData.row.button.length > 0
			) {
				const row: IButtonConfig[] = rowData.row.button.map((buttonData: any) => ({
					text: buttonData.text || '',
					type: buttonData.type || 'callback',
					payload: buttonData.payload || undefined,
					url: buttonData.url || undefined,
					chat_title: buttonData.chatTitle || undefined,
					chat_description: buttonData.chatDescription || undefined,
					start_payload: buttonData.startPayload || undefined,
					uuid: normalizeButtonUuid(buttonData.uuid),
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
