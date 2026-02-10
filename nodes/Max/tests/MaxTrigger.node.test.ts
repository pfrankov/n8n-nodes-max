import type { IHookFunctions, IWebhookFunctions, INodeTypeDescription } from 'n8n-workflow';
import { MaxTrigger } from '../MaxTrigger.node';
import { MaxWebhookManager } from '../MaxWebhookManager';
import { MaxEventProcessor } from '../MaxEventProcessor';

// Mock the classes
jest.mock('../MaxWebhookManager');
jest.mock('../MaxEventProcessor');

describe('MaxTrigger Node', () => {
	let triggerInstance: MaxTrigger;

	beforeEach(() => {
		triggerInstance = new MaxTrigger();
		// Clear all mock instances and calls before each test
		(MaxWebhookManager as jest.Mock).mockClear();
		(MaxEventProcessor as jest.Mock).mockClear();
	});

	describe('Node Description', () => {
		it('should have correct properties', () => {
			const description: INodeTypeDescription = triggerInstance.description;
			expect(description.displayName).toBe('Max Trigger');
			expect(description.name).toBe('maxTrigger');
			expect(description.group).toEqual(['trigger']);
			expect(description.version).toBe(1);
			expect(description.subtitle).toBe('=Events: {{$parameter["events"].join(", ")}}');
			expect(description.description).toBe('Starts the workflow on a Max messenger event');
			expect(description.defaults).toEqual({ name: 'Max Trigger' });
			expect(description.inputs).toEqual([]);
			expect(description.outputs).toEqual(['main']);
			expect(description.credentials).toEqual([{ name: 'maxApi', required: true }]);
			const { webhooks } = description;
			if (!webhooks) {
				return fail('Webhooks are not defined');
			}
			expect(webhooks).toHaveLength(1);
			const webhook = webhooks[0];
			if (!webhook) {
				return fail('First webhook is undefined');
			}
			expect(webhook.name).toBe('default');
		});
	});

	describe('Webhook Methods', () => {
		const mockHookFunctions = {
			getCredentials: jest.fn(),
			getWebhookUrl: jest.fn(),
			getNode: jest.fn(),
		} as unknown as IHookFunctions;

		it('checkExists should instantiate MaxWebhookManager and call checkExists', async () => {
			await triggerInstance.webhookMethods.default.checkExists.call(mockHookFunctions);
			expect(MaxWebhookManager).toHaveBeenCalledTimes(1);
			const mockManagerInstance = (MaxWebhookManager as jest.Mock).mock.instances[0];
			expect(mockManagerInstance.checkExists).toHaveBeenCalledTimes(1);
		});

		it('create should instantiate MaxWebhookManager and call create', async () => {
			await triggerInstance.webhookMethods.default.create.call(mockHookFunctions);
			expect(MaxWebhookManager).toHaveBeenCalledTimes(1);
			const mockManagerInstance = (MaxWebhookManager as jest.Mock).mock.instances[0];
			expect(mockManagerInstance.create).toHaveBeenCalledTimes(1);
		});

		it('delete should instantiate MaxWebhookManager and call delete', async () => {
			await triggerInstance.webhookMethods.default.delete.call(mockHookFunctions);
			expect(MaxWebhookManager).toHaveBeenCalledTimes(1);
			const mockManagerInstance = (MaxWebhookManager as jest.Mock).mock.instances[0];
			expect(mockManagerInstance.delete).toHaveBeenCalledTimes(1);
		});
	});

	describe('Webhook Endpoint', () => {
		const mockWebhookFunctions = {
			getHeaderData: jest.fn(),
			getBodyData: jest.fn(),
			getNode: jest.fn(),
			getWorkflow: jest.fn(),
		} as unknown as IWebhookFunctions;

		it('webhook should instantiate MaxEventProcessor and call processWebhookEvent', async () => {
			await triggerInstance.webhook.call(mockWebhookFunctions);
			expect(MaxEventProcessor).toHaveBeenCalledTimes(1);
			const mockProcessorInstance = (MaxEventProcessor as jest.Mock).mock.instances[0];
			expect(mockProcessorInstance.processWebhookEvent).toHaveBeenCalledTimes(1);
		});
	});
});
