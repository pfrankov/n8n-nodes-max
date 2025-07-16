import { MaxTrigger } from '../MaxTrigger.node';
import { MAX_TRIGGER_EVENTS } from '../MaxTriggerConfig';

describe('MaxTrigger', () => {
	let maxTrigger: MaxTrigger;

	beforeEach(() => {
		maxTrigger = new MaxTrigger();
	});

	describe('Node Description', () => {
		it('should have correct basic properties', () => {
			expect(maxTrigger.description.displayName).toBe('Max Trigger');
			expect(maxTrigger.description.name).toBe('maxTrigger');
			expect(maxTrigger.description.group).toEqual(['trigger']);
			expect(maxTrigger.description.version).toBe(1);
			expect(maxTrigger.description.icon).toBe('file:max.svg');
		});

		it('should have correct node configuration', () => {
			expect(maxTrigger.description.inputs).toEqual([]);
			expect(maxTrigger.description.outputs).toHaveLength(1);
			expect(maxTrigger.description.defaults.name).toBe('Max Trigger');
		});

		it('should have webhook configuration', () => {
			expect(maxTrigger.description.webhooks).toHaveLength(1);
			expect(maxTrigger.description.webhooks![0]).toEqual({
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			});
		});

		it('should require maxApi credentials', () => {
			expect(maxTrigger.description.credentials).toHaveLength(1);
			expect(maxTrigger.description.credentials![0]).toEqual({
				name: 'maxApi',
				required: true,
			});
		});

		it('should have all supported event types', () => {
			const eventsProperty = maxTrigger.description.properties.find(
				(prop) => prop.name === 'events'
			);
			expect(eventsProperty).toBeDefined();
			expect(eventsProperty!.type).toBe('multiOptions');
			expect(eventsProperty!.required).toBe(true);
			expect((eventsProperty as any).default).toEqual(['message_created']);
			
			const actualEvents = (eventsProperty as any).options.map((opt: any) => opt.value);
			// Compare sorted arrays since UI options are alphabetized by name but constants are in original order
			expect(actualEvents.sort()).toEqual([...MAX_TRIGGER_EVENTS].sort());
		});

		it('should have additional fields for filtering', () => {
			const additionalFieldsProperty = maxTrigger.description.properties.find(
				(prop) => prop.name === 'additionalFields'
			);
			expect(additionalFieldsProperty).toBeDefined();
			expect(additionalFieldsProperty!.type).toBe('collection');
			
			const options = (additionalFieldsProperty as any).options;
			expect(options).toHaveLength(2);
			expect(options[0].name).toBe('chatIds');
			expect(options[1].name).toBe('userIds');
		});

		it('should have proper subtitle configuration', () => {
			expect(maxTrigger.description.subtitle).toBe('=Events: {{$parameter["events"].join(", ")}}');
		});
	});

	describe('Webhook Methods Structure', () => {
		it('should have webhook methods defined', () => {
			expect(maxTrigger.webhookMethods).toBeDefined();
			expect(maxTrigger.webhookMethods.default).toBeDefined();
			expect(typeof maxTrigger.webhookMethods.default.checkExists).toBe('function');
			expect(typeof maxTrigger.webhookMethods.default.create).toBe('function');
			expect(typeof maxTrigger.webhookMethods.default.delete).toBe('function');
		});

		it('should have webhook function defined', () => {
			expect(typeof maxTrigger.webhook).toBe('function');
		});
	});

	describe('Component Integration', () => {
		it('should have webhook manager and event processor instances', () => {
			// These are private properties, but we can test that the methods work
			expect(maxTrigger.webhookMethods.default.checkExists).toBeDefined();
			expect(maxTrigger.webhookMethods.default.create).toBeDefined();
			expect(maxTrigger.webhookMethods.default.delete).toBeDefined();
			expect(maxTrigger.webhook).toBeDefined();
		});
	});
});