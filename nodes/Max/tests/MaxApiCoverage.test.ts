import packageJson from '../../../package.json';
import { MAX_TRIGGER_EVENTS, MAX_TRIGGER_PROPERTIES } from '../MaxTriggerConfig';

const NEW_UPDATE_TYPES = [
	'bot_stopped',
	'comment_created',
	'comment_edited',
	'comment_removed',
	'dialog_cleared',
	'dialog_muted',
	'dialog_removed',
	'dialog_unmuted',
] as const;

describe('current MAX API coverage', () => {
	it('registers the advanced Max API node in the published package', () => {
		expect(packageJson.n8n.nodes).toContain('dist/nodes/Max/MaxApiOperations.node.js');
	});

	it('exposes all current webhook update types requested in issue #23', () => {
		expect(MAX_TRIGGER_EVENTS).toEqual(expect.arrayContaining(NEW_UPDATE_TYPES));

		const eventsProperty = MAX_TRIGGER_PROPERTIES.find((property) => property.name === 'events');
		const configuredValues = (eventsProperty as any).options.map(
			(option: { value: string }) => option.value,
		);
		expect(configuredValues).toEqual(expect.arrayContaining(NEW_UPDATE_TYPES));
	});
});
