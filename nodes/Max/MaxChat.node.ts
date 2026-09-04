import type { IExecuteFunctions, INodeType } from 'n8n-workflow';
import { maxApiPropertiesFor } from './MaxApiOperationsDescription';
import {
	executeLegacyResource,
	executeMaxResource,
	legacyPropertiesFor,
	maxResourceDescription,
	mergeResourceProperties,
} from './MaxResourceNode';

const LEGACY_OPERATIONS = ['getChatInfo', 'leaveChat'];

export class MaxChat implements INodeType {
	description = maxResourceDescription({
		displayName: 'Max Chat',
		name: 'maxChat',
		description: 'Manage a MAX chat, its pinned message, and bot membership',
		properties: mergeResourceProperties(
			legacyPropertiesFor('chat', LEGACY_OPERATIONS),
			maxApiPropertiesFor('chat', [
				'getMembership',
				'getPinnedMessage',
				'pinMessage',
				'sendAction',
				'unpinMessage',
				'update',
			]),
		),
	});

	async execute(this: IExecuteFunctions) {
		const operation = this.getNodeParameter('operation', 0) as string;
		if (LEGACY_OPERATIONS.includes(operation)) {
			return await executeLegacyResource(this, 'chat');
		}
		return await executeMaxResource(this, 'chat');
	}
}
