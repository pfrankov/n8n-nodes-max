import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeTypeDescription,
} from 'n8n-workflow';
import { MAIN_CONNECTION } from './MaxNodeTypes';
import { executeMaxApiNode } from './MaxApiExecution';
import { MaxLegacyExecution } from './MaxLegacyExecution';

export function maxResourceDescription(options: {
	displayName: string;
	name: string;
	description: string;
	properties: INodeProperties[];
}): INodeTypeDescription {
	return {
		displayName: options.displayName,
		name: options.name,
		icon: 'file:max.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: options.description,
		defaults: { name: options.displayName },
		inputs: [MAIN_CONNECTION],
		outputs: [MAIN_CONNECTION],
		credentials: [{ name: 'maxApi', required: true }],
		properties: options.properties,
	};
}

export async function executeMaxResource(
	context: IExecuteFunctions,
	resource: string,
	mapOperation?: (operation: string) => string,
): Promise<INodeExecutionData[][]> {
	return await executeMaxApiNode(context, resource, mapOperation);
}

export function legacyPropertiesFor(
	resource: string,
	allowedOperations: string[],
): INodeProperties[] {
	const properties = new MaxLegacyExecution().description.properties;
	return properties
		.filter((property) => property.name !== 'resource')
		.filter((property) => property.displayOptions?.show?.['resource']?.includes(resource))
		.filter((property) => {
			const operations = property.displayOptions?.show?.['operation'];
			return (
				!operations || operations.some((operation) => allowedOperations.includes(String(operation)))
			);
		})
		.map((property) => {
			const copy = structuredClone(property);
			if (copy.displayOptions?.show) {
				delete copy.displayOptions.show['resource'];
				const operations = copy.displayOptions.show['operation'];
				if (operations) {
					copy.displayOptions.show['operation'] = operations.filter((operation) =>
						allowedOperations.includes(String(operation)),
					);
				}
			}
			if (copy.name === 'operation' && Array.isArray(copy.options)) {
				copy.options = copy.options.filter(
					(option) => 'value' in option && allowedOperations.includes(String(option.value)),
				);
				const firstOption = copy.options[0];
				copy.default = firstOption && 'value' in firstOption ? firstOption.value : '';
			}
			return copy;
		});
}

export function mergeResourceProperties(
	primary: INodeProperties[],
	secondary: INodeProperties[],
): INodeProperties[] {
	const primaryOperation = primary.find((property) => property.name === 'operation');
	const secondaryOperation = secondary.find((property) => property.name === 'operation');
	if (!primaryOperation || !secondaryOperation) {
		return [...primary, ...secondary];
	}
	primaryOperation.options = [
		...(primaryOperation.options ?? []),
		...(secondaryOperation.options ?? []),
	];
	return [...primary, ...secondary.filter((property) => property.name !== 'operation')];
}

export async function executeLegacyResource(
	context: IExecuteFunctions,
	resource: 'chat' | 'message',
): Promise<INodeExecutionData[][]> {
	const legacyContext = new Proxy(context, {
		get(target, property, receiver) {
			if (property === 'getNodeParameter') {
				return (name: string, ...args: unknown[]) =>
					name === 'resource'
						? resource
						: Reflect.apply(target.getNodeParameter, target, [name, ...args]);
			}
			return Reflect.get(target, property, receiver);
		},
	});
	return await new MaxLegacyExecution().execute.call(legacyContext);
}
