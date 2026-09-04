import type { IExecuteFunctions, INodeType } from 'n8n-workflow';
import { maxApiPropertiesFor } from './MaxApiOperationsDescription';
import { executeMaxResource, maxResourceDescription } from './MaxResourceNode';

export class MaxChatAdministrator implements INodeType {
	description = maxResourceDescription({
		displayName: 'Max Chat Administrator',
		name: 'maxChatAdministrator',
		description: 'List and manage MAX chat administrators',
		properties: maxApiPropertiesFor('chatAdmin'),
	});

	async execute(this: IExecuteFunctions) {
		return await executeMaxResource(this, 'chatAdmin');
	}
}
