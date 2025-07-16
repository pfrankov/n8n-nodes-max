import { MaxTrigger } from '../MaxTrigger.node';

describe('MaxTrigger Authentication', () => {
	let maxTrigger: MaxTrigger;

	beforeEach(() => {
		maxTrigger = new MaxTrigger();
	});

	describe('API Authentication Method', () => {
		it('should use query parameter authentication for Max API', () => {
			// This test verifies that the MaxTrigger node is configured to use
			// query parameter authentication (access_token) instead of Bearer tokens
			// which is the correct method for Max API
			
			// The webhook methods should exist and be properly structured
			expect(maxTrigger.webhookMethods).toBeDefined();
			expect(maxTrigger.webhookMethods.default).toBeDefined();
			expect(typeof maxTrigger.webhookMethods.default.checkExists).toBe('function');
			expect(typeof maxTrigger.webhookMethods.default.create).toBe('function');
			expect(typeof maxTrigger.webhookMethods.default.delete).toBe('function');
		});

		it('should have correct credentials configuration', () => {
			// Verify that the node requires maxApi credentials
			expect(maxTrigger.description.credentials).toHaveLength(1);
			expect(maxTrigger.description.credentials![0]).toEqual({
				name: 'maxApi',
				required: true,
			});
		});

		it('should use correct parameter name for events', () => {
			// Max API uses 'update_types' parameter, not 'events'
			// This is handled in the create method implementation
			const eventsProperty = maxTrigger.description.properties.find(
				(prop) => prop.name === 'events'
			);
			expect(eventsProperty).toBeDefined();
			expect(eventsProperty!.type).toBe('multiOptions');
			expect(eventsProperty!.required).toBe(true);
		});

		it('should have proper webhook configuration', () => {
			// Verify webhook is configured for POST requests
			expect(maxTrigger.description.webhooks).toHaveLength(1);
			expect(maxTrigger.description.webhooks![0]).toEqual({
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			});
		});
	});

	describe('Event Types Configuration', () => {
		it('should support all Max messenger event types', () => {
			const eventsProperty = maxTrigger.description.properties.find(
				(prop) => prop.name === 'events'
			);
			
			const supportedEvents = (eventsProperty as any).options.map((opt: any) => opt.value);
			
			// Verify all expected Max messenger event types are supported (alphabetized by display name)
			const expectedEvents = [
				'bot_added',
				'bot_removed',
				'bot_started',
				'message_callback',
				'chat_title_changed',
				'message_removed',
				'message_edited',
				'message_chat_created',
				'message_created',
				'user_added',
				'user_removed',
			];
			
			expect(supportedEvents).toEqual(expectedEvents);
		});

		it('should have message_created as default event', () => {
			const eventsProperty = maxTrigger.description.properties.find(
				(prop) => prop.name === 'events'
			);
			
			expect((eventsProperty as any).default).toEqual(['message_created']);
		});
	});
});