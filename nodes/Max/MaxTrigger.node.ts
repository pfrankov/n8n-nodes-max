import type {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

import { MaxWebhookManager } from './MaxWebhookManager';
import { MaxEventProcessor } from './MaxEventProcessor';
import { MAX_TRIGGER_PROPERTIES } from './MaxTriggerConfig';

/**
 * Max messenger trigger node for n8n
 *
 * This trigger node enables webhook-based event reception from Max messenger,
 * allowing workflows to react to various Max messenger events such as:
 * - New messages and message edits
 * - Bot interactions and chat membership changes
 * - Inline keyboard button callbacks
 * - User and chat management events
 *
 * The node automatically manages webhook subscriptions with the Max API
 * and filters events based on configured criteria.
 *
 * @implements {INodeType}
 */
export class MaxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Max Trigger',
		name: 'maxTrigger',
		icon: 'file:max.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '=Events: {{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow on a Max messenger event',
		defaults: {
			name: 'Max Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'maxApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: MAX_TRIGGER_PROPERTIES,
	};

	/**
	 * Webhook management methods for Max messenger trigger
	 * Uses static instances to avoid context binding issues
	 */
	webhookMethods = {
		default: {
			/**
			 * Check if webhook subscription already exists
			 */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookManager = new MaxWebhookManager();
				return webhookManager.checkExists.call(this);
			},

			/**
			 * Create webhook subscription with Max API
			 */
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookManager = new MaxWebhookManager();
				return webhookManager.create.call(this);
			},

			/**
			 * Delete webhook subscription from Max API
			 */
			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookManager = new MaxWebhookManager();
				return webhookManager.delete.call(this);
			},
		},
	};

	/**
	 * Process incoming webhook events from Max messenger
	 * Uses static instance to avoid context binding issues
	 */
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const eventProcessor = new MaxEventProcessor();
		return eventProcessor.processWebhookEvent.call(this);
	}
}
