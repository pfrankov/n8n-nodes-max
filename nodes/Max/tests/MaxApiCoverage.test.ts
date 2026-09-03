import { readFileSync, readdirSync } from 'node:fs';
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

	it('documents the published Max API node for users and maintainers', () => {
		const readme = readFileSync('README.md', 'utf8');
		const agents = readFileSync('AGENTS.md', 'utf8');
		const changelog = readFileSync('CHANGELOG.md', 'utf8');

		expect(readme).toContain('### Max API');
		expect(readme).toContain('Chat Administrator');
		expect(agents).toContain('MaxApiOperations.node.ts');
		expect(agents).toContain('platform-api2.max.ru');
		expect(changelog).toContain('Max API');
		expect(changelog).toContain('комментар');

		expect(packageJson.version).toBe('0.1.26');
		expect(changelog).toContain('## Не выпущено');
		expect(changelog).not.toContain('## v0.1.27 - 2026-09-03');
		const unreleasedEntry = changelog.split(/^## v0\.1\.26/m)[0] ?? '';
		expect(unreleasedEntry).toContain('### Кому важно');
		expect(unreleasedEntry).toContain('### Что проверить после обновления');
	});

	it('keeps only permanent workflows and verifies pushes to master', () => {
		const workflowFiles = readdirSync('.github/workflows');
		const temporaryFiles = workflowFiles.filter((name) =>
			/(certif|finaliz|one-shot|pr24|publish-max-api)/i.test(name),
		);
		const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

		expect(temporaryFiles).toEqual([]);
		expect(ci).toMatch(/push:\s*\n\s*branches:\s*\n\s*- master/);
		expect(ci).not.toContain('feature/max-api-coverage-23');
	});
});
