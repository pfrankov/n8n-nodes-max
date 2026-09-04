import type { IExecuteFunctions, INodeType } from 'n8n-workflow';
import { maxApiPropertiesFor } from './MaxApiOperationsDescription';
import { executeMaxResource, maxResourceDescription } from './MaxResourceNode';

export class MaxVideo implements INodeType {
	description = maxResourceDescription({
		displayName: 'Max Video',
		name: 'maxVideo',
		description: 'Get MAX video download information by token',
		properties: maxApiPropertiesFor('message', ['getVideo']),
	});

	async execute(this: IExecuteFunctions) {
		return await executeMaxResource(this, 'message');
	}
}
