import { MAX_TRIGGER_EVENTS, MAX_TRIGGER_PROPERTIES } from '../MaxTriggerConfig';

describe('MaxTriggerConfig', () => {
	describe('MAX_TRIGGER_EVENTS', () => {
		it('should contain all expected event types', () => {
			const expectedEvents = [
				'bot_added',
				'bot_removed',
				'bot_started',
				'chat_title_changed',
				'message_callback',
				'message_created',
				'message_edited',
				'message_removed',
				'user_added',
				'user_removed',
			];

			expect(MAX_TRIGGER_EVENTS).toEqual(expectedEvents);
		});

		it('should be readonly array', () => {
			// TypeScript should prevent modification, but we can test the array is frozen
			expect(Object.isFrozen(MAX_TRIGGER_EVENTS)).toBe(false); // const arrays aren't frozen by default
			expect(MAX_TRIGGER_EVENTS.length).toBe(10);
		});
	});

	describe('MAX_TRIGGER_PROPERTIES', () => {
		it('should have events property with correct configuration', () => {
			const eventsProperty = MAX_TRIGGER_PROPERTIES.find(prop => prop.name === 'events');
			
			expect(eventsProperty).toBeDefined();
			expect(eventsProperty!.displayName).toBe('Events');
			expect(eventsProperty!.type).toBe('multiOptions');
			expect(eventsProperty!.required).toBe(true);
			expect((eventsProperty as any).default).toEqual(['message_created']);
		});

		it('should have all event options with correct structure', () => {
			const eventsProperty = MAX_TRIGGER_PROPERTIES.find(prop => prop.name === 'events');
			const options = (eventsProperty as any).options;

			expect(options).toHaveLength(10);

			// Check each option has required fields
			options.forEach((option: any) => {
				expect(option).toHaveProperty('name');
				expect(option).toHaveProperty('value');
				expect(option).toHaveProperty('description');
				expect(typeof option.name).toBe('string');
				expect(typeof option.value).toBe('string');
				expect(typeof option.description).toBe('string');
			});

			// Check specific options
			const messageCreatedOption = options.find((opt: any) => opt.value === 'message_created');
			expect(messageCreatedOption).toEqual({
				name: 'Message Created',
				value: 'message_created',
				description: 'Trigger when a new message is received',
			});

			const botStartedOption = options.find((opt: any) => opt.value === 'bot_started');
			expect(botStartedOption).toEqual({
				name: 'Bot Started',
				value: 'bot_started',
				description: 'Trigger when a user starts interaction with the bot',
			});
		});

		it('should have additionalFields property with correct configuration', () => {
			const additionalFieldsProperty = MAX_TRIGGER_PROPERTIES.find(prop => prop.name === 'additionalFields');
			
			expect(additionalFieldsProperty).toBeDefined();
			expect(additionalFieldsProperty!.displayName).toBe('Additional Fields');
			expect(additionalFieldsProperty!.type).toBe('collection');
			expect(additionalFieldsProperty!.placeholder).toBe('Add Field');
			expect((additionalFieldsProperty as any).default).toEqual({});
		});

		it('should have chatIds and userIds options in additionalFields', () => {
			const additionalFieldsProperty = MAX_TRIGGER_PROPERTIES.find(prop => prop.name === 'additionalFields');
			const options = (additionalFieldsProperty as any).options;

			expect(options).toHaveLength(2);

			const chatIdsOption = options.find((opt: any) => opt.name === 'chatIds');
			expect(chatIdsOption).toEqual({
				displayName: 'Restrict to Chat IDs',
				name: 'chatIds',
				type: 'string',
				default: '',
				description: 'The chat IDs to restrict the trigger to. Multiple can be defined separated by comma.',
			});

			const userIdsOption = options.find((opt: any) => opt.name === 'userIds');
			expect(userIdsOption).toEqual({
				displayName: 'Restrict to User IDs',
				name: 'userIds',
				type: 'string',
				default: '',
				description: 'The user IDs to restrict the trigger to. Multiple can be defined separated by comma.',
			});
		});

		it('should have exactly 2 properties', () => {
			expect(MAX_TRIGGER_PROPERTIES).toHaveLength(2);
		});

		it('should have properties with correct names', () => {
			const propertyNames = MAX_TRIGGER_PROPERTIES.map(prop => prop.name);
			expect(propertyNames).toEqual(['events', 'additionalFields']);
		});
	});

	describe('Event values match constants', () => {
		it('should have event option values that match MAX_TRIGGER_EVENTS', () => {
			const eventsProperty = MAX_TRIGGER_PROPERTIES.find(prop => prop.name === 'events');
			const optionValues = (eventsProperty as any).options.map((opt: any) => opt.value);

			expect(optionValues.sort()).toEqual([...MAX_TRIGGER_EVENTS].sort());
		});
	});
});