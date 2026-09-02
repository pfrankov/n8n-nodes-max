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

replaceRequired(
	'nodes/Max/MaxApiOperations.node.ts',
	"import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';",
	"import { ApplicationError, NodeConnectionType, NodeOperationError } from 'n8n-workflow';",
);
replaceRequired(
	'nodes/Max/MaxApiOperations.node.ts',
	'throw new Error(',
	'throw new ApplicationError(',
);
replaceRequired(
	'nodes/Max/MaxApiOperationsDescription.ts',
	"\t\tname: 'action',\n\t\ttype: 'options',\n\t\tdisplayOptions: { show: { resource: ['chat'], operation: ['sendAction'] } },",
	"\t\tname: 'chatAction',\n\t\ttype: 'options',\n\t\tdisplayOptions: { show: { resource: ['chat'], operation: ['sendAction'] } },",
);
replaceRequired(
	'nodes/Max/MaxApiOperations.node.ts',
	"getParameter<string>(context, 'action', itemIndex, 'typing_on')",
	"getParameter<string>(context, 'chatAction', itemIndex, 'typing_on')",
);
