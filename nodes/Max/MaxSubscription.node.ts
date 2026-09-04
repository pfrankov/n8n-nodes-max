import type { IExecuteFunctions, INodeType } from 'n8n-workflow';
import { maxApiPropertiesFor } from './MaxApiOperationsDescription';
import { executeMaxResource, maxResourceDescription } from './MaxResourceNode';

export class MaxSubscription implements INodeType {
	description = maxResourceDescription({
		displayName: 'Max Subscription',
		name: 'maxSubscription',
		description: 'Create, list, and delete MAX webhook subscriptions',
		properties: maxApiPropertiesFor('subscription'),
	});

	async execute(this: IExecuteFunctions) {
		return await executeMaxResource(this, 'subscription');
	}
}
