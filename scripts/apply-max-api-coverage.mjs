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
replaceRequired(
	'credentials/MaxApi.credentials.ts',
	"baseURL: '={{$credentials.baseUrl}}',",
	"baseURL:\n\t\t\t\t'={{$credentials.baseUrl === \\\"https://platform-api.max.ru\\\" ? \\\"https://platform-api2.max.ru\\\" : $credentials.baseUrl}}',",
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
	const addition = [
		'',
		'## Advanced MAX API operations',
		'',
		'Use **Max API** for current operations that do not fit the compact legacy node:',
		'',
		'- bot information and command management;',
		'- message history, individual messages, video metadata, advanced callback answers, and current inline keyboard buttons;',
		'- chat updates, actions, pinned messages, bot membership, members, and administrators;',
		'- channel comments and explicit webhook subscription management.',
		'',
		'Existing workflows using **Max** and **Max Trigger** remain compatible. **Max Trigger** also exposes the current bot, dialog, and comment update types. The removed `GET /chats` method and Long Polling are intentionally not exposed: MAX marks chat listing as unsupported and recommends Webhook instead of Long Polling for production.',
		'',
	].join('\n');
	write('README.md', `${readme.trimEnd()}\n${addition}`);
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
	const entry = [
		'## Не выпущено',
		'',
		'### Добавлено',
		'',
		'- Расширено покрытие актуального MAX Bot API: команды бота, чтение сообщений, сведения о видео, управление чатами, участниками и администраторами, комментарии и подписки Webhook.',
		'- В inline-клавиатуру добавлены кнопки типов `message` и `clipboard`.',
		'- В Max Trigger добавлены события остановки бота, изменений диалога и комментариев.',
		'',
		'### Улучшено',
		'',
		'- Запросы по умолчанию направляются на актуальный домен `platform-api2.max.ru`; сохранённые настройки со старым официальным доменом переводятся автоматически.',
		'- Идентификаторы `int64` передаются строками без риска потери точности JavaScript.',
		'',
		'### Кому важно',
		'',
		'Пользователям, которым раньше требовалась HTTP Request для работы с участниками, администраторами, комментариями, историей сообщений или командами бота.',
		'',
		'### Что проверить после обновления',
		'',
		'- Доступность новой ноды Max API.',
		'- Активацию Max Trigger с новыми типами событий.',
		'- Отправку сообщений и работу существующих Webhook после перехода на новый API-домен.',
		'',
	].join('\n');
	write('CHANGELOG.md', `${entry}\n${changelog}`);
}
