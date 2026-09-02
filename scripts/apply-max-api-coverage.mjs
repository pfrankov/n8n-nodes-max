import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
	return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function write(relativePath, content) {
	fs.writeFileSync(path.join(root, relativePath), content);
}

function replaceRequired(relativePath, search, replacement) {
	const content = read(relativePath);
	if (!content.includes(search)) {
		throw new Error(`Expected text was not found in ${relativePath}: ${search}`);
	}
	write(relativePath, content.replaceAll(search, replacement));
}

function replaceOptional(relativePath, search, replacement) {
	const content = read(relativePath);
	if (content.includes(search)) {
		write(relativePath, content.replaceAll(search, replacement));
	}
}

function replaceHostInTests(directory) {
	for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
		const relativePath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			replaceHostInTests(relativePath);
			continue;
		}
		if (!entry.name.endsWith('.ts') || relativePath.endsWith('MaxApiRequest.test.ts')) {
			continue;
		}
		replaceOptional(
			relativePath,
			'https://platform-api.max.ru',
			'https://platform-api2.max.ru',
		);
	}
}

replaceRequired(
	'nodes/Max/GenericFunctions.ts',
	"import { basename, join } from 'path';\n",
	"import { basename, join } from 'path';\nimport { normalizeMaxBaseUrl } from './MaxApiRequest';\n",
);
replaceRequired(
	'nodes/Max/GenericFunctions.ts',
	"const DEFAULT_MAX_BASE_URL = 'https://platform-api.max.ru';",
	"const DEFAULT_MAX_BASE_URL = 'https://platform-api2.max.ru';",
);
replaceRequired(
	'nodes/Max/GenericFunctions.ts',
	"const baseUrl = (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL;",
	"const baseUrl = normalizeMaxBaseUrl(credentials['baseUrl'] || DEFAULT_MAX_BASE_URL);",
);

replaceRequired(
	'nodes/Max/MaxWebhookManager.ts',
	"import type { MaxSubscriptionsResponse, MaxTriggerEvent } from './MaxTriggerConfig';\n",
	"import type { MaxSubscriptionsResponse, MaxTriggerEvent } from './MaxTriggerConfig';\nimport { normalizeMaxBaseUrl } from './MaxApiRequest';\n",
);
replaceRequired(
	'nodes/Max/MaxWebhookManager.ts',
	"private readonly DEFAULT_BASE_URL = 'https://platform-api.max.ru';",
	"private readonly DEFAULT_BASE_URL = 'https://platform-api2.max.ru';",
);
replaceRequired(
	'nodes/Max/MaxWebhookManager.ts',
	"const baseUrl = (credentials['baseUrl'] as string) || this.DEFAULT_BASE_URL;",
	"const baseUrl = normalizeMaxBaseUrl(credentials['baseUrl'] || this.DEFAULT_BASE_URL);",
);

replaceRequired(
	'credentials/MaxApi.credentials.ts',
	"default: 'https://platform-api.max.ru',",
	"default: 'https://platform-api2.max.ru',",
);

replaceHostInTests('credentials/tests');
replaceHostInTests('nodes/Max/tests');

replaceRequired(
	'nodes/Max/tests/MaxApiOperations.node.test.ts',
	'.map((option) => option.value);',
	'.map((option: any) => option.value);',
);

replaceRequired(
	'nodes/Max/MaxApiOperationsDescription.ts',
	"\t{\n\t\tdisplayName: 'Payload',\n\t\tname: 'payload',\n\t\ttype: 'string',\n\t\tdefault: '',\n\t\tdisplayOptions: {\n\t\t\tshow: { type: ['callback', 'clipboard'] },\n\t\t},\n\t\tdescription: 'The callback data or text copied to the clipboard.',\n\t},",
	"\t{\n\t\tdisplayName: 'Payload',\n\t\tname: 'payload',\n\t\ttype: 'string',\n\t\tdefault: '',\n\t\tdisplayOptions: {\n\t\t\tshow: { type: ['callback', 'clipboard', 'open_app'] },\n\t\t},\n\t\tdescription: 'The callback data, clipboard text, or optional mini-app payload.',\n\t},",
);
replaceRequired(
	'nodes/Max/MaxApiOperationsDescription.ts',
	"\t{\n\t\tdisplayName: 'Start Payload',\n\t\tname: 'payload',\n\t\ttype: 'string',\n\t\tdefault: '',\n\t\tdisplayOptions: { show: { type: ['open_app'] } },\n\t\tdescription: 'The optional payload passed to the mini-app.',\n\t},\n",
	'',
);

replaceOptional(
	'AGENTS.md',
	'https://platform-api.max.ru',
	'https://platform-api2.max.ru',
);
replaceOptional(
	'README.md',
	'https://platform-api.max.ru',
	'https://platform-api2.max.ru',
);

const readme = read('README.md');
if (!readme.includes('## Advanced MAX API operations')) {
	write(
		'README.md',
		`${readme.trimEnd()}\n\n## Advanced MAX API operations\n\nUse **Max API** for current operations that do not fit the compact legacy node:\n\n- bot information and command management;\n- message history, individual messages, video metadata, advanced callback answers, and current inline keyboard buttons;\n- chat updates, actions, pinned messages, bot membership, members, and administrators;\n- channel comments and explicit webhook subscription management.\n\nExisting workflows using **Max** and **Max Trigger** remain compatible. **Max Trigger** also exposes the current bot, dialog, and comment update types. The removed `GET /chats` method and Long Polling are intentionally not exposed: MAX marks chat listing as unsupported and recommends Webhook instead of Long Polling for production.\n`,
	);
}

const agents = read('AGENTS.md');
if (!agents.includes('`Max API` node')) {
	write(
		'AGENTS.md',
		agents.replace(
			'| `Max` node           | Outbound actions for messages/chats                        |',
			'| `Max` node           | Backward-compatible core message/chat actions              |\n| `Max API` node       | Current Bot API resources and advanced operations           |',
		),
	);
}

const changelog = read('CHANGELOG.md');
if (!changelog.includes('Расширено покрытие актуального MAX Bot API')) {
	const entry = `## Не выпущено\n\n### Добавлено\n\n- Расширено покрытие актуального MAX Bot API: команды бота, чтение сообщений, сведения о видео, управление чатами, участниками и администраторами, комментарии и подписки Webhook.\n- В inline-клавиатуру добавлены кнопки типов \`message\` и \`clipboard\`.\n- В Max Trigger добавлены события остановки бота, изменений диалога и комментариев.\n\n### Улучшено\n\n- Запросы по умолчанию направляются на актуальный домен \`platform-api2.max.ru\`; сохранённые настройки со старым официальным доменом переводятся автоматически.\n- Идентификаторы \`int64\` передаются строками без риска потери точности JavaScript.\n\n### Кому важно\n\nПользователям, которым раньше требовалась HTTP Request для работы с участниками, администраторами, комментариями, историей сообщений или командами бота.\n\n### Что проверить после обновления\n\n- Доступность новой ноды Max API.\n- Активацию Max Trigger с новыми типами событий.\n- Отправку сообщений и работу существующих Webhook после перехода на новый API-домен.\n\n`;
	write('CHANGELOG.md', `${entry}${changelog}`);
}
