import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const write = (relativePath, content) => {
	const absolutePath = path.join(root, relativePath);
	fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
	fs.writeFileSync(absolutePath, content);
};

function replaceRequired(content, search, replacement, label) {
	if (!content.includes(search)) {
		throw new Error(`Expected ${label} was not found`);
	}
	return content.replace(search, replacement);
}

function removeIfExists(relativePath) {
	try {
		fs.rmSync(path.join(root, relativePath), { recursive: true, force: true });
	} catch {
		// Best effort cleanup; git status is verified by the workflow.
	}
}

for (const relativePath of [
	'.github/workflows/apply-max-api-coverage.yml',
	'.github/workflows/export-pr-source.yml',
	'scripts/apply-max-api-coverage.mjs',
	'scripts/fix-max-api-lint.mjs',
]) {
	removeIfExists(relativePath);
}

// Repair the original TDD test typing without falling back to any.
{
	const relativePath = 'nodes/Max/tests/MaxApiOperations.node.test.ts';
	let content = read(relativePath);
	content = content.replace(
		'.map((option) => option.value);',
		'.map((option: { value?: unknown }) => option.value);',
	);
	content = content.replace(
		'.map((option: any) => option.value);',
		'.map((option: { value?: unknown }) => option.value);',
	);
	write(relativePath, content);
}

// Keep a single payload control for callback, clipboard and open_app buttons.
{
	const relativePath = 'nodes/Max/MaxApiOperationsDescription.ts';
	let content = read(relativePath);
	content = content.replace(
		"show: { type: ['callback', 'clipboard'] },\n\t\t},\n\t\tdescription: 'The callback data or text copied to the clipboard.',",
		"show: { type: ['callback', 'clipboard', 'open_app'] },\n\t\t},\n\t\tdescription: 'The callback data, clipboard text, or optional mini-app payload.',",
	);
	content = content.replace(
		"\t{\n\t\tdisplayName: 'Start Payload',\n\t\tname: 'payload',\n\t\ttype: 'string',\n\t\tdefault: '',\n\t\tdisplayOptions: { show: { type: ['open_app'] } },\n\t\tdescription: 'The optional payload passed to the mini-app.',\n\t},\n",
		'',
	);
	write(relativePath, content);
}

// Migrate the old official host while preserving custom installations.
{
	const relativePath = 'nodes/Max/MaxApiRequest.ts';
	let content = read(relativePath);
	if (!content.includes('export function normalizeMaxBaseUrl')) {
		let insertionOffset = 0;
		for (const line of content.split(/(?<=\n)/)) {
			if (!line.startsWith('import ')) break;
			insertionOffset += line.length;
		}
		const helper = `\nexport function normalizeMaxBaseUrl(value: unknown): string {\n\tconst baseUrl = String(value ?? '').trim().replace(/\\/$/, '');\n\tif (!baseUrl || baseUrl === 'https://platform-api.max.ru') {\n\t\treturn 'https://platform-api2.max.ru';\n\t}\n\treturn baseUrl;\n}\n`;
		content = `${content.slice(0, insertionOffset)}${helper}${content.slice(insertionOffset)}`;
	}
	write(relativePath, content);
}

{
	const relativePath = 'nodes/Max/GenericFunctions.ts';
	let content = read(relativePath);
	if (!content.includes("from './MaxApiRequest'")) {
		content = replaceRequired(
			content,
			"import { basename, join } from 'path';\n",
			"import { basename, join } from 'path';\nimport { normalizeMaxBaseUrl } from './MaxApiRequest';\n",
			'GenericFunctions path import',
		);
	}
	content = content.replace(
		"const DEFAULT_MAX_BASE_URL = 'https://platform-api.max.ru';",
		"const DEFAULT_MAX_BASE_URL = 'https://platform-api2.max.ru';",
	);
	content = content.replace(
		"const baseUrl = (credentials['baseUrl'] as string) || DEFAULT_MAX_BASE_URL;",
		"const baseUrl = normalizeMaxBaseUrl(credentials['baseUrl'] || DEFAULT_MAX_BASE_URL);",
	);
	write(relativePath, content);
}

{
	const relativePath = 'nodes/Max/MaxWebhookManager.ts';
	let content = read(relativePath);
	if (!content.includes("from './MaxApiRequest'")) {
		content = replaceRequired(
			content,
			"import type { MaxSubscriptionsResponse, MaxTriggerEvent } from './MaxTriggerConfig';\n",
			"import type { MaxSubscriptionsResponse, MaxTriggerEvent } from './MaxTriggerConfig';\nimport { normalizeMaxBaseUrl } from './MaxApiRequest';\n",
			'MaxWebhookManager trigger import',
		);
	}
	content = content.replace(
		"private readonly DEFAULT_BASE_URL = 'https://platform-api.max.ru';",
		"private readonly DEFAULT_BASE_URL = 'https://platform-api2.max.ru';",
	);
	content = content.replace(
		"const baseUrl = (credentials['baseUrl'] as string) || this.DEFAULT_BASE_URL;",
		"const baseUrl = normalizeMaxBaseUrl(credentials['baseUrl'] || this.DEFAULT_BASE_URL);",
	);
	write(relativePath, content);
}

{
	const relativePath = 'credentials/MaxApi.credentials.ts';
	let content = read(relativePath);
	content = content.replace(
		"default: 'https://platform-api.max.ru',",
		"default: 'https://platform-api2.max.ru',",
	);
	content = content.replace(
		"baseURL: '={{$credentials.baseUrl}}',",
		"baseURL:\n\t\t\t\t'={{$credentials.baseUrl === \\\"https://platform-api.max.ru\\\" ? \\\"https://platform-api2.max.ru\\\" : $credentials.baseUrl}}',",
	);
	write(relativePath, content);
}

// Add the current API operations that were still absent from the first PR draft.
{
	const relativePath = 'nodes/Max/MaxApiOperationsDescription.ts';
	let content = read(relativePath);

	if (!content.includes("{ name: 'Upload', value: 'upload' }")) {
		content = replaceRequired(
			content,
			"\t\t\t{ name: 'Subscription', value: 'subscription' },",
			"\t\t\t{ name: 'Subscription', value: 'subscription' },\n\t\t\t{ name: 'Upload', value: 'upload' },",
			'Upload resource anchor',
		);
	}

	if (!content.includes("action: 'Get a chat'")) {
		content = replaceRequired(
			content,
			"\toperationProperty('chat', [\n",
			"\toperationProperty('chat', [\n\t\t{\n\t\t\tname: 'Get',\n\t\t\tvalue: 'get',\n\t\t\tdescription: 'Get one chat or channel by its ID',\n\t\t\taction: 'Get a chat',\n\t\t},\n",
			'Chat operation anchor',
		);
	}

	if (!content.includes("action: 'Delete a message'")) {
		content = replaceRequired(
			content,
			"\toperationProperty('message', [\n",
			"\toperationProperty('message', [\n\t\t{\n\t\t\tname: 'Delete',\n\t\t\tvalue: 'delete',\n\t\t\tdescription: 'Delete a message or channel post',\n\t\t\taction: 'Delete a message',\n\t\t},\n",
			'Message operation anchor',
		);
	}

	if (!content.includes("operationProperty('upload'")) {
		const marker = "\toperationProperty('subscription', [";
		const start = content.indexOf(marker);
		if (start < 0) throw new Error('Subscription operations were not found');
		let parentheses = 0;
		let brackets = 0;
		let quote = null;
		let escaped = false;
		let end = -1;
		for (let index = start; index < content.length; index++) {
			const character = content[index];
			if (quote) {
				if (escaped) escaped = false;
				else if (character === '\\') escaped = true;
				else if (character === quote) quote = null;
				continue;
			}
			if (character === '"' || character === "'" || character === '`') {
				quote = character;
				continue;
			}
			if (character === '(') parentheses++;
			else if (character === ')') parentheses--;
			else if (character === '[') brackets++;
			else if (character === ']') brackets--;
			if (index > start && parentheses === 0 && brackets === 0 && character === ',') {
				end = index + 1;
				break;
			}
		}
		if (end < 0) throw new Error('Could not locate the Subscription operation boundary');
		const uploadOperation = "\n\toperationProperty('upload', [\n\t\t{\n\t\t\tname: 'Upload',\n\t\t\tvalue: 'upload',\n\t\t\tdescription: 'Upload binary data and return the MAX attachment token',\n\t\t\taction: 'Upload a file',\n\t\t},\n\t]),";
		content = `${content.slice(0, end)}${uploadOperation}${content.slice(end)}`;
	}

	content = content.replace(
		"operation: ['get', 'update']",
		"operation: ['delete', 'get', 'update']",
	);

	if (!content.includes("name: 'uploadType'")) {
		const anchor = "\t...messageBodyProperties(['send', 'update']),";
		const index = content.indexOf(anchor);
		if (index < 0) throw new Error('Message body property anchor was not found');
		const uploadProperties = `\n\t{\n\t\tdisplayName: 'Upload Type',\n\t\tname: 'uploadType',\n\t\ttype: 'options',\n\t\toptions: [\n\t\t\t{ name: 'Audio', value: 'audio' },\n\t\t\t{ name: 'File', value: 'file' },\n\t\t\t{ name: 'Image', value: 'image' },\n\t\t\t{ name: 'Video', value: 'video' },\n\t\t],\n\t\tdefault: 'file',\n\t\tdisplayOptions: { show: { resource: ['upload'], operation: ['upload'] } },\n\t\tdescription: 'The attachment type requested from MAX before the binary upload.',\n\t},\n\t{\n\t\tdisplayName: 'Input Binary Field',\n\t\tname: 'binaryPropertyName',\n\t\ttype: 'string',\n\t\tdefault: 'data',\n\t\trequired: true,\n\t\tdisplayOptions: { show: { resource: ['upload'], operation: ['upload'] } },\n\t\tdescription: 'The name of the input binary field containing the file.',\n\t},\n`;
		content = `${content.slice(0, index)}${uploadProperties}${content.slice(index)}`;
	}

	write(relativePath, content);
}

write(
	'nodes/Max/MaxUpload.ts',
	`import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { maxApiRequest, requireString } from './MaxApiRequest';

export type MaxUploadType = 'audio' | 'file' | 'image' | 'video';

function sanitizeFileName(value: string): string {
\treturn value.replace(/[\\r\\n"]/g, '_');
}

export function buildMultipartUploadBody(
\tdata: Buffer,
\tfileName: string,
\tmimeType: string,
\tboundary: string,
): Buffer {
\tconst safeFileName = sanitizeFileName(fileName || 'upload');
\tconst safeMimeType = mimeType.replace(/[\\r\\n]/g, '') || 'application/octet-stream';
\treturn Buffer.concat([
\t\tBuffer.from(
\t\t\t\`--\${boundary}\\r\\nContent-Disposition: form-data; name="data"; filename="\${safeFileName}"\\r\\nContent-Type: \${safeMimeType}\\r\\n\\r\\n\`,
\t\t),
\t\tdata,
\t\tBuffer.from(\`\\r\\n--\${boundary}--\\r\\n\`),
\t]);
}

export function extractUploadUrl(value: unknown): string {
\tif (value === null || typeof value !== 'object' || Array.isArray(value)) {
\t\tthrow new Error('MAX did not return an upload descriptor');
\t}
\treturn requireString((value as IDataObject)['url'], 'Upload URL');
}

function asJsonObject(value: unknown): IDataObject {
\tif (value !== null && typeof value === 'object' && !Array.isArray(value)) {
\t\treturn value as IDataObject;
\t}
\treturn { data: value as IDataObject['data'] };
}

export async function uploadMaxBinary(
\tcontext: IExecuteFunctions,
\titemIndex: number,
\ttype: MaxUploadType,
\tbinaryPropertyName: string,
): Promise<IDataObject> {
\tconst binary = context.helpers.assertBinaryData(itemIndex, binaryPropertyName);
\tconst data = await context.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
\tconst descriptor = await maxApiRequest(context, {
\t\tmethod: 'POST',
\t\tpath: '/uploads',
\t\tqs: { type },
\t});
\tconst uploadUrl = extractUploadUrl(descriptor);
\tconst boundary = \`----n8n-max-\${Date.now().toString(16)}-\${Math.random().toString(16).slice(2)}\`;
\tconst response = await context.helpers.httpRequest({
\t\tmethod: 'POST',
\t\turl: uploadUrl,
\t\theaders: { 'Content-Type': \`multipart/form-data; boundary=\${boundary}\` },
\t\tbody: buildMultipartUploadBody(
\t\t\tdata,
\t\t\tbinary.fileName || 'upload',
\t\t\tbinary.mimeType || 'application/octet-stream',
\t\t\tboundary,
\t\t),
\t});

\treturn { descriptor: asJsonObject(descriptor), upload: asJsonObject(response) };
}
`,
);

// Use the existing implementation as the source of truth and insert only the three missing branches.
{
	const relativePath = 'nodes/Max/MaxApiOperations.node.ts';
	let content = read(relativePath);
	if (!content.includes("from './MaxUpload'")) {
		content = replaceRequired(
			content,
			"import { MAX_API_OPERATION_PROPERTIES } from './MaxApiOperationsDescription';",
			"import { MAX_API_OPERATION_PROPERTIES } from './MaxApiOperationsDescription';\nimport { uploadMaxBinary, type MaxUploadType } from './MaxUpload';",
			'Max API description import',
		);
	}

	let sourceFile = ts.createSourceFile(
		relativePath,
		content,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	function collectOperationIfs(file, source) {
		const entries = [];
		function visit(node) {
			if (ts.isIfStatement(node)) {
				const condition = node.expression.getText(file);
				const match = condition.match(/\boperation\s*===\s*['"]([^'"]+)['"]/);
				if (match) entries.push({ node, operation: match[1], condition });
			}
			ts.forEachChild(node, visit);
		}
		visit(file);
		return entries;
	}

	const textOf = (file, source, node) => source.slice(node.getStart(file), node.end);
	let operationIfs = collectOperationIfs(sourceFile, content);

	if (!/operation\s*===\s*['"]get['"][\s\S]{0,500}`\/chats\//.test(content)) {
		const membership = operationIfs.find(
			(entry) =>
				entry.operation === 'getMembership' &&
				textOf(sourceFile, content, entry.node.thenStatement).includes('/chats/'),
		);
		if (!membership) throw new Error('Chat membership execution branch was not found');
		const body = textOf(sourceFile, content, membership.node.thenStatement).replace(
			/\/members\/me/g,
			'',
		);
		const condition = membership.condition.replace(/(['"])getMembership\1/, "'get'");
		const insertion = `if (${condition}) ${body} else `;
		const offset = membership.node.getStart(sourceFile);
		content = `${content.slice(0, offset)}${insertion}${content.slice(offset)}`;
	}

	sourceFile = ts.createSourceFile(
		relativePath,
		content,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	operationIfs = collectOperationIfs(sourceFile, content);

	if (!/operation\s*===\s*['"]delete['"][\s\S]{0,700}message_id/.test(content)) {
		const messageGetCandidates = operationIfs.filter(
			(entry) =>
				entry.operation === 'get' &&
				textOf(sourceFile, content, entry.node.thenStatement).includes('/messages'),
		);
		const messageGet =
			messageGetCandidates.find((entry) =>
				textOf(sourceFile, content, entry.node.thenStatement).includes('messageId'),
			) ?? messageGetCandidates[0];
		if (!messageGet) throw new Error('Message get execution branch was not found');
		const bodyText = textOf(sourceFile, content, messageGet.node.thenStatement);
		const declaration =
			bodyText.match(/const\s+messageId\s*=\s*[\s\S]*?;/)?.[0] ??
			bodyText.match(/const\s+(\w*[Mm]essage\w*)\s*=\s*[\s\S]*?;/)?.[0];
		const identifier = declaration?.match(/const\s+(\w+)/)?.[1];
		const resultIdentifier = bodyText.match(
			/([A-Za-z_$][\w$]*)\s*=\s*await\s+request\s*\(/,
		)?.[1];
		if (!declaration || !identifier || !resultIdentifier) {
			throw new Error('Could not derive the Message get branch variables');
		}
		const condition = messageGet.condition.replace(/(['"])get\1/, "'delete'");
		const body = `{\n\t\t\t\t\t${declaration.trim()}\n\t\t\t\t\t${resultIdentifier} = await request(this, 'DELETE', '/messages', { message_id: ${identifier} });\n\t\t\t\t}`;
		const insertion = `if (${condition}) ${body} else `;
		const offset = messageGet.node.getStart(sourceFile);
		content = `${content.slice(0, offset)}${insertion}${content.slice(offset)}`;
	}

	if (!content.includes("case 'upload'")) {
		sourceFile = ts.createSourceFile(
			relativePath,
			content,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);
		let resourceSwitch;
		function findResourceSwitch(node) {
			if (
				ts.isSwitchStatement(node) &&
				/\bresource\b/.test(node.expression.getText(sourceFile))
			) {
				const text = textOf(sourceFile, content, node);
				if (text.includes("case 'message'") && text.includes("case 'chat'")) {
					resourceSwitch = node;
				}
			}
			if (!resourceSwitch) ts.forEachChild(node, findResourceSwitch);
		}
		findResourceSwitch(sourceFile);
		if (!resourceSwitch) throw new Error('Resource switch was not found');
		const switchText = textOf(sourceFile, content, resourceSwitch);
		const assignments = [...switchText.matchAll(
			/([A-Za-z_$][\w$]*)\s*=\s*await\s+(?:request|maxApiRequest)\s*\(/g,
		)].map((match) => match[1]);
		const resultIdentifier =
			assignments.sort(
				(left, right) =>
					assignments.filter((value) => value === right).length -
					assignments.filter((value) => value === left).length,
			)[0] ?? 'responseData';
		const itemIndex =
			content.match(/for\s*\(\s*let\s+(\w+)\s*=\s*0\s*;[^;]+\.length/)?.[1] ??
			'itemIndex';
		const defaultClause = resourceSwitch.caseBlock.clauses.find((clause) =>
			ts.isDefaultClause(clause),
		);
		const offset = defaultClause
			? defaultClause.getStart(sourceFile)
			: resourceSwitch.caseBlock.end - 1;
		const uploadCase = `\t\t\t\tcase 'upload': {\n\t\t\t\t\tconst uploadType = getParameter<MaxUploadType>(this, 'uploadType', ${itemIndex}, 'file');\n\t\t\t\t\tconst binaryPropertyName = requireString(\n\t\t\t\t\t\tgetParameter<unknown>(this, 'binaryPropertyName', ${itemIndex}, 'data'),\n\t\t\t\t\t\t'Input Binary Field',\n\t\t\t\t\t);\n\t\t\t\t\t${resultIdentifier} = await uploadMaxBinary(\n\t\t\t\t\t\tthis,\n\t\t\t\t\t\t${itemIndex},\n\t\t\t\t\t\tuploadType,\n\t\t\t\t\t\tbinaryPropertyName,\n\t\t\t\t\t);\n\t\t\t\t\tbreak;\n\t\t\t\t}\n`;
		content = `${content.slice(0, offset)}${uploadCase}${content.slice(offset)}`;
	}

	write(relativePath, content);
}

// Ensure every update type requested in issue #23 is selectable by Max Trigger.
{
	const relativePath = 'nodes/Max/MaxTriggerConfig.ts';
	let content = read(relativePath);
	const events = [
		'bot_stopped',
		'dialog_cleared',
		'dialog_muted',
		'dialog_unmuted',
		'dialog_removed',
		'comment_created',
		'comment_edited',
		'comment_removed',
	];
	for (const event of events) {
		if (content.includes(`'${event}'`)) continue;
		const arrayEnd = content.indexOf('] as const');
		if (arrayEnd < 0) throw new Error('MAX_TRIGGER_EVENTS boundary was not found');
		content = `${content.slice(0, arrayEnd)}\t'${event}',\n${content.slice(arrayEnd)}`;
	}
	write(relativePath, content);
}

write(
	'nodes/Max/tests/MaxApiAdditionalCoverage.test.ts',
	`import fs from 'node:fs';
import path from 'node:path';
import { MAX_API_OPERATION_PROPERTIES } from '../MaxApiOperationsDescription';
import { buildMultipartUploadBody, extractUploadUrl } from '../MaxUpload';

function operationValues(resource: string): unknown[] {
\tconst property = MAX_API_OPERATION_PROPERTIES.find((entry) => {
\t\tconst resources = entry.displayOptions?.show?.resource as string[] | undefined;
\t\treturn entry.name === 'operation' && resources?.includes(resource);
\t});
\treturn (property?.options ?? []).map((option) =>
\t\t'value' in option ? option.value : undefined,
\t);
}

describe('additional current MAX API coverage', () => {
\tit('exposes the current single-chat, delete-message and upload operations', () => {
\t\texpect(operationValues('chat')).toContain('get');
\t\texpect(operationValues('message')).toContain('delete');
\t\texpect(operationValues('upload')).toContain('upload');
\t});

\tit('routes the operations through the documented endpoints', () => {
\t\tconst source = fs.readFileSync(
\t\t\tpath.join(__dirname, '..', 'MaxApiOperations.node.ts'),
\t\t\t'utf8',
\t\t);
\t\texpect(source).toContain("'/uploads'");
\t\texpect(source).toMatch(/'DELETE'[\\s\\S]*'\\/messages'[\\s\\S]*message_id/);
\t\texpect(source).toContain('encodePath(chatId)');
\t});

\tit('builds a multipart body without corrupting binary bytes', () => {
\t\tconst body = buildMultipartUploadBody(
\t\t\tBuffer.from([0, 1, 2, 255]),
\t\t\t'photo.jpg',
\t\t\t'image/jpeg',
\t\t\t'test-boundary',
\t\t);
\t\texpect(body.includes(Buffer.from([0, 1, 2, 255]))).toBe(true);
\t\texpect(body.toString('latin1')).toContain('name="data"; filename="photo.jpg"');
\t\texpect(body.toString('latin1')).toContain('Content-Type: image/jpeg');
\t\texpect(body.toString('latin1')).toContain('--test-boundary--');
\t});

\tit('rejects upload descriptors without a URL', () => {
\t\texpect(extractUploadUrl({ url: 'https://upload.example' })).toBe(
\t\t\t'https://upload.example',
\t\t);
\t\texpect(() => extractUploadUrl({})).toThrow('Upload URL');
\t});
});
`,
);

// Register the node explicitly and remove any experimental polling node left by earlier work.
{
	const relativePath = 'package.json';
	const manifest = JSON.parse(read(relativePath));
	manifest.n8n ??= {};
	manifest.n8n.nodes ??= [];
	manifest.n8n.nodes = manifest.n8n.nodes.filter(
		(value) => !String(value).includes('Polling') && !String(value).includes('LongPoll'),
	);
	const nodePath = 'dist/nodes/Max/MaxApiOperations.node.js';
	if (!manifest.n8n.nodes.includes(nodePath)) manifest.n8n.nodes.push(nodePath);
	write(relativePath, `${JSON.stringify(manifest, null, '\t')}\n`);
}

for (const pattern of [
	'nodes/Max/MaxPollingTrigger.node.ts',
	'nodes/Max/MaxLongPollingTrigger.node.ts',
	'nodes/Max/tests/MaxPollingTrigger.node.test.ts',
	'nodes/Max/tests/MaxLongPollingTrigger.node.test.ts',
]) {
	removeIfExists(pattern);
}

// Documentation and release notes.
{
	const relativePath = 'README.md';
	let content = read(relativePath).trimEnd();
	if (!content.includes('## Расширенные операции MAX API')) {
		content += `\n\n## Расширенные операции MAX API\n\nНода **Max API** дополняет совместимую с прежними workflow ноду **Max** и покрывает текущие ресурсы Bot API:\n\n- сведения о боте и команды;\n- отправка, получение, изменение и удаление сообщений, история, callback-ответы и метаданные видео;\n- получение и изменение чатов, действия, закреплённые сообщения и membership бота;\n- участники, администраторы и их permissions;\n- комментарии к постам каналов и webhook-подписки;\n- самостоятельная загрузка image, video, audio и file из binary-поля n8n;\n- актуальные inline-кнопки и события Max Trigger.\n\n\`GET /chats\` намеренно отсутствует: список чатов больше не относится к поддерживаемым операциям API. Long Polling также не добавлен: для постоянно работающего workflow используется существующий webhook trigger. Все идентификаторы \`int64\` вводятся как строки, чтобы JavaScript не терял точность.\n`;
	}
	write(relativePath, `${content}\n`);
}

{
	const relativePath = 'CHANGELOG.md';
	let content = read(relativePath);
	if (!content.includes('Расширено покрытие актуального MAX Bot API')) {
		content = `## Не выпущено\n\n### Добавлено\n\n- Расширено покрытие актуального MAX Bot API: Bot, Message, Chat, Chat Member, Chat Administrator, Comment, Subscription и Upload.\n- В Max Trigger добавлены актуальные события остановки бота, изменений диалога и комментариев.\n- В inline-клавиатуру добавлены кнопки \`message\` и \`clipboard\`.\n\n### Улучшено\n\n- Существующая нода \`Max\` сохранена для совместимости, расширенные операции вынесены в \`Max API\`.\n- Идентификаторы \`int64\` передаются строками без потери точности.\n- Старое официальное значение API host автоматически переводится на актуальный host.\n\n${content}`;
	}
	write(relativePath, content);
}

// Update credential tests for the intentional migration expression and current default host.
{
	const relativePath = 'credentials/tests/MaxApi.credentials.test.ts';
	let content = read(relativePath).replaceAll(
		'https://platform-api.max.ru',
		'https://platform-api2.max.ru',
	);
	content = content.replace(
		"expect(maxApiCredentials.test.request.baseURL).toBe('={{$credentials.baseUrl}}');",
		"expect(maxApiCredentials.test.request.baseURL).toContain('platform-api2.max.ru');",
	);
	write(relativePath, content);
}

// The source tree must not contain a public Long Polling node after finalization.
for (const relativePath of fs
	.readdirSync(path.join(root, 'nodes/Max'))
	.filter((name) => /Polling|LongPoll/i.test(name))) {
	removeIfExists(path.join('nodes/Max', relativePath));
}
