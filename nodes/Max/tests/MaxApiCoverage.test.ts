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
	it('registers focused API nodes and removes both universal nodes', () => {
		expect(packageJson.n8n.nodes).toEqual(
			expect.arrayContaining([
				'dist/nodes/Max/MaxBot.node.js',
				'dist/nodes/Max/MaxChat.node.js',
				'dist/nodes/Max/MaxChatAdministrator.node.js',
				'dist/nodes/Max/MaxChatMember.node.js',
				'dist/nodes/Max/MaxComment.node.js',
				'dist/nodes/Max/MaxMessage.node.js',
				'dist/nodes/Max/MaxSubscription.node.js',
				'dist/nodes/Max/MaxVideo.node.js',
			]),
		);
		expect(packageJson.n8n.nodes).not.toContain('dist/nodes/Max/Max.node.js');
		expect(packageJson.n8n.nodes).not.toContain('dist/nodes/Max/MaxApiOperations.node.js');
	});

	it('uses connection descriptors that load with current n8n-workflow', async () => {
		const { MaxBot } = await import('../MaxBot.node');
		const { MaxMessage } = await import('../MaxMessage.node');
		const { MaxTrigger } = await import('../MaxTrigger.node');

		expect(new MaxBot().description.inputs).toEqual(['main']);
		expect(new MaxBot().description.outputs).toEqual(['main']);
		expect(new MaxMessage().description.inputs).toEqual(['main']);
		expect(new MaxMessage().description.outputs).toEqual(['main']);
		expect(new MaxTrigger().description.outputs).toEqual(['main']);
	});

	it('exposes all current webhook update types requested in issue #23', () => {
		expect(MAX_TRIGGER_EVENTS).toEqual(expect.arrayContaining(NEW_UPDATE_TYPES));

		const eventsProperty = MAX_TRIGGER_PROPERTIES.find((property) => property.name === 'events');
		const configuredValues = (eventsProperty as any).options.map(
			(option: { value: string }) => option.value,
		);
		expect(configuredValues).toEqual(expect.arrayContaining(NEW_UPDATE_TYPES));
	});

	it('documents focused nodes and the breaking migration for users and maintainers', () => {
		const readme = readFileSync('README.md', 'utf8');
		const agents = readFileSync('AGENTS.md', 'utf8');
		const changelog = readFileSync('CHANGELOG.md', 'utf8');
		const scenarios = readFileSync('SCENARIOS.md', 'utf8');

		expect(readme).toContain('### Функциональные ноды');
		expect(readme).toContain('Max Chat Administrator');
		expect(agents).toContain('MaxApiExecution.ts');
		expect(agents).toContain('platform-api2.max.ru');
		expect(changelog).toContain('Max Message');
		expect(changelog).toContain('комментар');
		expect(changelog).toContain('### Несовместимость');
		expect(scenarios).toContain('**Действие:**');
		expect(scenarios).toContain('**Результат:**');

		expect(['0.2.1', '1.0.0']).toContain(packageJson.version);
		expect(changelog).toContain('## v1.0.0 - 2026-09-04');
		expect(changelog).not.toContain('## v0.1.27 - 2026-09-03');
		const releaseEntry = changelog.split(/^## v0\.2\.1/m)[0] ?? '';
		expect(releaseEntry).toContain('### Кому важно');
		expect(releaseEntry).toContain('### Что проверить после обновления');
		expect(releaseEntry).toContain('не загружаются');
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
