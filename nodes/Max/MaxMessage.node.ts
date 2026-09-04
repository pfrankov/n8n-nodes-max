import type { IExecuteFunctions, INodeType } from 'n8n-workflow';
import { maxApiPropertiesFor } from './MaxApiOperationsDescription';
import {
	executeLegacyResource,
	executeMaxResource,
	legacyPropertiesFor,
	maxResourceDescription,
	mergeResourceProperties,
} from './MaxResourceNode';

const LEGACY_OPERATIONS = ['answerCallbackQuery', 'deleteMessage', 'editMessage', 'sendMessage'];

export class MaxMessage implements INodeType {
	description = maxResourceDescription({
		displayName: 'Max Message',
		name: 'maxMessage',
		description: 'Send, read, update, and answer callbacks for MAX messages',
		properties: mergeResourceProperties(
			legacyPropertiesFor('message', LEGACY_OPERATIONS),
			maxApiPropertiesFor('message', ['get', 'getMany']),
		),
	});

	async execute(this: IExecuteFunctions) {
		const operation = this.getNodeParameter('operation', 0) as string;
		if (LEGACY_OPERATIONS.includes(operation)) {
			return await executeLegacyResource(this, 'message');
		}
		return await executeMaxResource(this, 'message');
	}
}
