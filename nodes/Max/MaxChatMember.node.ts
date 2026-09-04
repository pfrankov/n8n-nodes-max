import type { IExecuteFunctions, INodeType } from 'n8n-workflow';
import { maxApiPropertiesFor } from './MaxApiOperationsDescription';
import { executeMaxResource, maxResourceDescription } from './MaxResourceNode';

export class MaxChatMember implements INodeType {
	description = maxResourceDescription({
		displayName: 'Max Chat Member',
		name: 'maxChatMember',
		description: 'List, add, remove, and block MAX chat members',
		properties: maxApiPropertiesFor('chatMember'),
	});

	async execute(this: IExecuteFunctions) {
		return await executeMaxResource(this, 'chatMember');
	}
}
