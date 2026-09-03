import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const resolve = (relativePath) => path.join(root, relativePath);
const read = (relativePath) => fs.readFileSync(resolve(relativePath), 'utf8');
const write = (relativePath, content) => {
	fs.mkdirSync(path.dirname(resolve(relativePath)), { recursive: true });
	fs.writeFileSync(resolve(relativePath), content);
};

function remove(relativePath) {
	fs.rmSync(resolve(relativePath), { recursive: true, force: true });
}

// If the first one-shot pass did not finish, reuse its implementation step now.
if (fs.existsSync(resolve('scripts/finalize-pr24.mjs'))) {
	const result = spawnSync(process.execPath, ['scripts/finalize-pr24.mjs'], {
		cwd: root,
		stdio: 'inherit',
	});
	if (result.status !== 0) {
		throw new Error(`The primary finalizer failed with exit code ${result.status}`);
	}
}

// Regression expectations should use the current official host, except the test
// that explicitly verifies migration from the legacy host.
for (const directory of ['nodes/Max/tests', 'credentials/tests']) {
	if (!fs.existsSync(resolve(directory))) continue;
	for (const entry of fs.readdirSync(resolve(directory), { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
		if (entry.name === 'MaxApiRequest.test.ts') continue;
		const relativePath = path.join(directory, entry.name);
		write(
			relativePath,
			read(relativePath).replaceAll(
				'https://platform-api.max.ru',
				'https://platform-api2.max.ru',
			),
		);
	}
}

// Keep the credential assertion resilient to the intentional migration expression.
{
	const relativePath = 'credentials/tests/MaxApi.credentials.test.ts';
	if (fs.existsSync(resolve(relativePath))) {
		let content = read(relativePath);
		content = content.replace(
			"expect(maxApiCredentials.test.request.baseURL).toBe('={{$credentials.baseUrl}}');",
			"expect(maxApiCredentials.test.request.baseURL).toContain('platform-api2.max.ru');",
		);
		write(relativePath, content);
	}
}

// Use explicit public types in the added contract test.
write(
	'nodes/Max/tests/MaxApiAdditionalCoverage.test.ts',
	`import fs from 'node:fs';
import path from 'node:path';
import type { INodePropertyOptions } from 'n8n-workflow';
import { MAX_API_OPERATION_PROPERTIES } from '../MaxApiOperationsDescription';
import { buildMultipartUploadBody, extractUploadUrl } from '../MaxUpload';

function operationValues(resource: string): Array<string | number | boolean> {
\tconst property = MAX_API_OPERATION_PROPERTIES.find((entry) => {
\t\tconst resources = entry.displayOptions?.show?.resource as string[] | undefined;
\t\treturn entry.name === 'operation' && resources?.includes(resource);
\t});
\tconst options = (property?.options ?? []) as INodePropertyOptions[];
\treturn options.map((option) => option.value);
}

describe('additional current MAX API coverage', () => {
\tit('exposes single-chat, delete-message and upload operations', () => {
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
\t\tconst bytes = Buffer.from([0, 1, 2, 255]);
\t\tconst body = buildMultipartUploadBody(
\t\t\tbytes,
\t\t\t'photo.jpg',
\t\t\t'image/jpeg',
\t\t\t'test-boundary',
\t\t);
\t\texpect(body.includes(bytes)).toBe(true);
\t\texpect(body.toString('latin1')).toContain('name="data"; filename="photo.jpg"');
\t\texpect(body.toString('latin1')).toContain('Content-Type: image/jpeg');
\t\texpect(body.toString('latin1')).toContain('--test-boundary--');
\t});

\tit('sanitizes multipart metadata and rejects descriptors without a URL', () => {
\t\tconst body = buildMultipartUploadBody(
\t\t\tBuffer.from('data'),
\t\t\t'bad\\r\\nname".txt',
\t\t\t'text/plain\\r\\nX-Injected: yes',
\t\t\t'safe-boundary',
\t\t).toString('latin1');
\t\texpect(body).not.toContain('X-Injected: yes');
\t\texpect(body).toContain('filename="bad__name_.txt"');
\t\texpect(extractUploadUrl({ url: 'https://upload.example' })).toBe(
\t\t\t'https://upload.example',
\t\t);
\t\texpect(() => extractUploadUrl({})).toThrow('Upload URL');
\t});
});
`,
);

// Keep the upload helper strict enough for production and simple enough for the
// n8n IDataObject contract.
write(
	'nodes/Max/MaxUpload.ts',
	`import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { maxApiRequest, requireString } from './MaxApiRequest';

export type MaxUploadType = 'audio' | 'file' | 'image' | 'video';

function sanitizeFileName(value: string): string {
\treturn value.replace(/[\\r\\n"]/g, '_');
}

function sanitizeMimeType(value: string): string {
\tconst firstLine = value.split(/[\\r\\n]/, 1)[0]?.trim();
\treturn firstLine || 'application/octet-stream';
}

export function buildMultipartUploadBody(
\tdata: Buffer,
\tfileName: string,
\tmimeType: string,
\tboundary: string,
): Buffer {
\tconst safeFileName = sanitizeFileName(fileName || 'upload');
\tconst safeMimeType = sanitizeMimeType(mimeType);
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
\tif (value === undefined) return { data: null };
\tif (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
\t\treturn { data: value };
\t}
\treturn { data: JSON.stringify(value) };
}

export async function uploadMaxBinary(
\tcontext: IExecuteFunctions,
\titemIndex: number,
\ttype: MaxUploadType,
\tbinaryPropertyName: string,
): Promise<IDataObject> {
\tconst binary = context.helpers.assertBinaryData(itemIndex, binaryPropertyName);
\tconst data = await context.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
\tconst descriptor: unknown = await maxApiRequest(context, {
\t\tmethod: 'POST',
\t\tpath: '/uploads',
\t\tqs: { type },
\t});
\tconst uploadUrl = extractUploadUrl(descriptor);
\tconst boundary = \`----n8n-max-\${Date.now().toString(16)}-\${Math.random().toString(16).slice(2)}\`;
\tconst response: unknown = await context.helpers.httpRequest({
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

// Remove all temporary or generator-only assets from the final source tree.
for (const relativePath of [
	'.github/workflows/apply-max-api-coverage.yml',
	'.github/workflows/export-pr-source.yml',
	'scripts/apply-max-api-coverage.mjs',
	'scripts/fix-max-api-lint.mjs',
]) {
	remove(relativePath);
}

// Explicitly reject reintroducing experimental polling nodes.
if (fs.existsSync(resolve('nodes/Max'))) {
	for (const entry of fs.readdirSync(resolve('nodes/Max'))) {
		if (/Polling|LongPoll/i.test(entry)) remove(path.join('nodes/Max', entry));
	}
}

// The package manifest must register the advanced node and no polling node.
{
	const relativePath = 'package.json';
	const manifest = JSON.parse(read(relativePath));
	manifest.n8n ??= {};
	manifest.n8n.nodes ??= [];
	manifest.n8n.nodes = manifest.n8n.nodes.filter(
		(value) => !/Polling|LongPoll/i.test(String(value)),
	);
	const advancedNode = 'dist/nodes/Max/MaxApiOperations.node.js';
	if (!manifest.n8n.nodes.includes(advancedNode)) manifest.n8n.nodes.push(advancedNode);
	write(relativePath, `${JSON.stringify(manifest, null, '\t')}\n`);
}
