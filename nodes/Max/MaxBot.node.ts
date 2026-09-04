import type { IExecuteFunctions, INodeType } from 'n8n-workflow';
import { maxApiPropertiesFor } from './MaxApiOperationsDescription';
import { executeMaxResource, maxResourceDescription } from './MaxResourceNode';

export class MaxBot implements INodeType {
	description = maxResourceDescription({
		displayName: 'Max Bot',
		name: 'maxBot',
		description: 'Get the authenticated MAX bot and manage its commands',
		properties: maxApiPropertiesFor('bot'),
	});

	async execute(this: IExecuteFunctions) {
		return await executeMaxResource(this, 'bot');
	}
}
