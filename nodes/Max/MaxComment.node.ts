import type { IExecuteFunctions, INodeType } from 'n8n-workflow';
import { maxApiPropertiesFor } from './MaxApiOperationsDescription';
import { executeMaxResource, maxResourceDescription } from './MaxResourceNode';

export class MaxComment implements INodeType {
	description = maxResourceDescription({
		displayName: 'Max Comment',
		name: 'maxComment',
		description: 'Create, read, update, and delete MAX message comments',
		properties: maxApiPropertiesFor('comment'),
	});

	async execute(this: IExecuteFunctions) {
		return await executeMaxResource(this, 'comment');
	}
}
