import { URL, domainToASCII } from 'node:url';
import type { IDataObject, IHookFunctions } from 'n8n-workflow';
import type { MaxSubscriptionsResponse, MaxTriggerEvent } from './MaxTriggerConfig';

/**
 * Convert URL hostname to punycode so MAX can validate TLS certificates
 * for internationalized domain names (IDN).
 */
function toPunycodeUrl(urlString: string): string {
	try {
		const parsedUrl = new URL(urlString);
		parsedUrl.hostname = domainToASCII(parsedUrl.hostname);
		return parsedUrl.toString();
	} catch {
		return urlString;
	}
}

/**
 * Max webhook manager
 *
 * Handles webhook subscription lifecycle with the Max API.
 * Provides methods to check, create, and delete webhook subscriptions.
 */
export class MaxWebhookManager {
	private readonly DEFAULT_BASE_URL = 'https://platform-api.max.ru';

	/**
	 * Check if webhook subscription already exists
	 *
	 * Queries the Max API to determine if a webhook subscription
	 * for this node's webhook URL is already registered.
	 *
	 * @param this - Hook function context providing access to credentials and helpers
	 * @returns Promise resolving to true if webhook exists, false otherwise
	 */
	async checkExists(this: IHookFunctions): Promise<boolean> {
		const manager = new MaxWebhookManager();

		try {
			const { baseUrl, webhookUrl } = await manager.getWebhookConfig(this);

			console.log('Max Trigger - checkExists: Checking for webhook:', webhookUrl);

			const response = await manager.getSubscriptions(this, baseUrl);

			if (response && Array.isArray(response.subscriptions)) {
				const existingSubscription = response.subscriptions.find(
					(sub: any) => sub.url === webhookUrl,
				);

				if (existingSubscription) {
					console.log('Max Trigger - checkExists: Found existing webhook, returning true');
					return true;
				}

				console.log(
					`Max Trigger - checkExists: No matching webhook found among ${response.subscriptions.length} subscriptions`,
				);
			}

			return false;
		} catch (error) {
			console.log('Max Trigger - checkExists: Error checking webhook:', error);
			return false;
		}
	}

	/**
	 * Create webhook subscription with Max API
	 *
	 * Creates a webhook subscription only if one doesn't already exist.
	 * This prevents the constant recreation cycle that was causing issues.
	 *
	 * @param this - Hook function context providing access to credentials and parameters
	 * @returns Promise resolving to true if webhook creation succeeds
	 * @throws {Error} When webhook creation fails or API request is rejected
	 */
	async create(this: IHookFunctions): Promise<boolean> {
		const manager = new MaxWebhookManager();

		try {
			const { baseUrl, webhookUrl, events, credentials, additionalFields } =
				await manager.getWebhookConfig(this);

			console.log('Max Trigger - create: Creating webhook for:', webhookUrl);

			// Check if our specific webhook already exists
			const existingResponse = await manager.getSubscriptions(this, baseUrl);

			if (existingResponse && Array.isArray(existingResponse.subscriptions)) {
				const existingSubscription = existingResponse.subscriptions.find(
					(sub: any) => sub.url === webhookUrl,
				);

				if (existingSubscription) {
					console.log('Max Trigger - create: Webhook already exists, skipping creation');
					return true;
				}

				console.log(
					`Max Trigger - create: Found ${existingResponse.subscriptions.length} existing subscriptions, but none match our URL`,
				);
			}

			// Create new webhook subscription
			await manager.createSubscription(
				this,
				baseUrl,
				webhookUrl,
				events,
				credentials,
				additionalFields,
			);

			console.log('Max Trigger - create: Webhook subscription created successfully');
			return true;
		} catch (error) {
			console.log('Max Trigger - create: Error creating webhook subscription:', error);
			throw error;
		}
	}

	/**
	 * Delete webhook subscription from Max API
	 *
	 * Called when workflow is deactivated. Cleans up webhook subscriptions.
	 *
	 * @param this - Hook function context providing access to credentials and helpers
	 * @returns Promise resolving to true if deletion succeeds
	 */
	async delete(this: IHookFunctions): Promise<boolean> {
		const manager = new MaxWebhookManager();

		try {
			const { baseUrl, webhookUrl, credentials } = await manager.getWebhookConfig(this);

			console.log('Max Trigger - delete: Cleaning up webhook for:', webhookUrl);

			// Get existing subscriptions
			const existingResponse = await manager.getSubscriptions(this, baseUrl);

			if (existingResponse && Array.isArray(existingResponse.subscriptions)) {
				// Only delete our specific webhook
				const targetSubscription = existingResponse.subscriptions.find(
					(sub: any) => sub.url === webhookUrl,
				);

				if (targetSubscription) {
					await manager.deleteSubscription(this, baseUrl, targetSubscription.url, credentials);
					console.log('Max Trigger - delete: Webhook subscription deleted successfully');
				} else {
					console.log('Max Trigger - delete: No matching webhook found to delete');
				}
			}

			return true;
		} catch (error) {
			console.log('Max Trigger - delete: Error during cleanup:', error);
			return false;
		}
	}

	/**
	 * Get webhook configuration from node context
	 */
	public async getWebhookConfig(context: IHookFunctions) {
		const credentials = await context.getCredentials('maxApi');
		const baseUrl = (credentials['baseUrl'] as string) || this.DEFAULT_BASE_URL;
		const rawWebhookUrl = context.getNodeWebhookUrl('default') as string;
		const webhookUrl = toPunycodeUrl(rawWebhookUrl);
		const events = context.getNodeParameter('events') as MaxTriggerEvent[];
		const additionalFields = context.getNodeParameter('additionalFields', {}) as IDataObject;

		return {
			credentials,
			baseUrl,
			webhookUrl,
			events,
			additionalFields,
		};
	}

	/**
	 * Get existing subscriptions from Max API
	 */
	public async getSubscriptions(
		context: IHookFunctions,
		baseUrl: string,
	): Promise<MaxSubscriptionsResponse> {
		const credentials = await context.getCredentials('maxApi');

		return context.helpers.httpRequest({
			method: 'GET',
			url: `${baseUrl}/subscriptions`,
			headers: {
				Authorization: credentials['accessToken'] as string,
			},
			json: true,
		});
	}

	/**
	 * Create a new webhook subscription
	 */
	public async createSubscription(
		context: IHookFunctions,
		baseUrl: string,
		webhookUrl: string,
		events: MaxTriggerEvent[],
		credentials: any,
		additionalFields: IDataObject = {},
	): Promise<void> {
		const body: IDataObject = {
			url: webhookUrl,
			update_types: events,
		};

		const secret = additionalFields['secret'];
		if (typeof secret === 'string' && secret.trim().length > 0) {
			body['secret'] = secret.trim();
		}

		const version = additionalFields['version'];
		if (typeof version === 'string' && version.trim().length > 0) {
			body['version'] = version.trim();
		}

		await context.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/subscriptions`,
			headers: {
				Authorization: credentials['accessToken'] as string,
				'Content-Type': 'application/json',
			},
			body,
			json: true,
		});
	}

	/**
	 * Delete a webhook subscription
	 */
	public async deleteSubscription(
		context: IHookFunctions,
		baseUrl: string,
		webhookUrl: string,
		credentials: any,
	): Promise<void> {
		await context.helpers.httpRequest({
			method: 'DELETE',
			url: `${baseUrl}/subscriptions`,
			qs: {
				url: webhookUrl,
			},
			headers: {
				Authorization: credentials['accessToken'] as string,
			},
			json: true,
		});
	}
}
