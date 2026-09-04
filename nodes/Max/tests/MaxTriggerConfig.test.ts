import { MAX_TRIGGER_EVENTS, MAX_TRIGGER_PROPERTIES } from '../MaxTriggerConfig';

const expectedEvents = [
	'bot_added',
	'bot_removed',
	'bot_started',
	'bot_stopped',
	'chat_title_changed',
	'comment_created',
	'comment_edited',
	'comment_removed',
	'dialog_cleared',
	'dialog_muted',
	'dialog_removed',
	'dialog_unmuted',
	'message_callback',
	'message_chat_created',
	'message_created',
	'message_edited',
	'message_removed',
	'user_added',
	'user_removed',
];

describe('MaxTriggerConfig', () => {
	describe('MAX_TRIGGER_EVENTS', () => {
		it('should contain all expected event types', () => {
			expect(MAX_TRIGGER_EVENTS).toEqual(expectedEvents);
		});

		it('should include only unique event values', () => {
			expect(new Set(MAX_TRIGGER_EVENTS).size).toBe(MAX_TRIGGER_EVENTS.length);
			expect(MAX_TRIGGER_EVENTS).toHaveLength(expectedEvents.length);
		});
	});

	describe('MAX_TRIGGER_PROPERTIES', () => {
		it('should have events property with correct configuration', () => {
			const eventsProperty = MAX_TRIGGER_PROPERTIES.find((prop) => prop.name === 'events');

			expect(eventsProperty).toBeDefined();
			expect(eventsProperty!.displayName).toBe('Events');
			expect(eventsProperty!.type).toBe('multiOptions');
			expect(eventsProperty!.required).toBe(true);
			expect((eventsProperty as any).default).toEqual(['message_created']);
		});

		it('should have one option for every supported event', () => {
			const eventsProperty = MAX_TRIGGER_PROPERTIES.find((prop) => prop.name === 'events');
			const options = (eventsProperty as any).options;

			expect(options).toHaveLength(expectedEvents.length);
			options.forEach((option: any) => {
				expect(option).toHaveProperty('name');
				expect(option).toHaveProperty('value');
				expect(option).toHaveProperty('description');
				expect(typeof option.name).toBe('string');
				expect(typeof option.value).toBe('string');
				expect(typeof option.description).toBe('string');
			});

			const messageCreatedOption = options.find((opt: any) => opt.value === 'message_created');
			expect(messageCreatedOption).toEqual({
				name: 'Message Received (Direct)',
				value: 'message_created',
				description: 'Trigger on a new direct message (update_type: message_created)',
			});

			const commentCreatedOption = options.find((opt: any) => opt.value === 'comment_created');
			expect(commentCreatedOption).toEqual({
				name: 'Comment Created',
				value: 'comment_created',
				description: 'Trigger when a channel comment is created (update_type: comment_created)',
			});
		});

		it('should have additionalFields property with correct configuration', () => {
			const additionalFieldsProperty = MAX_TRIGGER_PROPERTIES.find(
				(prop) => prop.name === 'additionalFields',
			);

			expect(additionalFieldsProperty).toBeDefined();
			expect(additionalFieldsProperty!.displayName).toBe('Additional Fields');
			expect(additionalFieldsProperty!.type).toBe('collection');
			expect(additionalFieldsProperty!.placeholder).toBe('Add Field');
			expect((additionalFieldsProperty as any).default).toEqual({});
		});

		it('should have chatIds, userIds, and secret options in additionalFields', () => {
			const additionalFieldsProperty = MAX_TRIGGER_PROPERTIES.find(
				(prop) => prop.name === 'additionalFields',
			);
			const options = (additionalFieldsProperty as any).options;

			expect(options.length).toBeGreaterThanOrEqual(3);

			const chatIdsOption = options.find((opt: any) => opt.name === 'chatIds');
			expect(chatIdsOption).toEqual({
				displayName: 'Restrict to Chat IDs',
				name: 'chatIds',
				type: 'string',
				default: '',
				description: 'Only trigger for these chat IDs. Comma-separated.',
			});

			const userIdsOption = options.find((opt: any) => opt.name === 'userIds');
			expect(userIdsOption).toEqual({
				displayName: 'Restrict to User IDs',
				name: 'userIds',
				type: 'string',
				default: '',
				description: 'Only trigger for these user IDs. Comma-separated.',
			});

			const secretOption = options.find((opt: any) => opt.name === 'secret');
			expect(secretOption).toEqual({
				displayName: 'Webhook Secret',
				name: 'secret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'A secret for the X-Max-Bot-Api-Secret header. Optional. 5-256 chars.',
			});
		});

		it('should have exactly 2 properties', () => {
			expect(MAX_TRIGGER_PROPERTIES).toHaveLength(2);
		});

		it('should have properties with correct names', () => {
			const propertyNames = MAX_TRIGGER_PROPERTIES.map((prop) => prop.name);
			expect(propertyNames).toEqual(['events', 'additionalFields']);
		});
	});

	describe('Event values match constants', () => {
		it('should have event option values that match MAX_TRIGGER_EVENTS', () => {
			const eventsProperty = MAX_TRIGGER_PROPERTIES.find((prop) => prop.name === 'events');
			const optionValues = (eventsProperty as any).options.map((opt: any) => opt.value);

			expect(optionValues.sort()).toEqual([...MAX_TRIGGER_EVENTS].sort());
		});
	});
});
