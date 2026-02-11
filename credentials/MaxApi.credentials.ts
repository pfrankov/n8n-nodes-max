import type { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Max messenger API credentials configuration for n8n
 *
 * This class defines the credential type for Max messenger Bot API integration.
 * It provides secure storage for bot access tokens and API configuration.
 *
 * @implements {ICredentialType}
 */
export class MaxApi implements ICredentialType {
	/** Unique identifier for this credential type */
	name = 'maxApi';

	/** Display name shown in the n8n UI */
	displayName = 'Max API';

	/** Icon file reference for the credential type */
	icon: Icon = 'file:max.svg';

	/** URL to the official Max messenger Bot API documentation */
	documentationUrl = 'https://dev.max.ru/docs-api';

	/**
	 * Configuration properties for Max messenger API credentials
	 * Defines the input fields shown to users when configuring credentials
	 */
	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'The bot access token. Get it from @PrimeBot in Max messenger.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://platform-api.max.ru',
			description: 'The API URL. Use the default value unless you use a custom server.',
		},
	];

	/**
	 * Credential test configuration to validate the provided credentials
	 * Makes a request to the Max API /me endpoint to verify token validity
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/me',
			headers: {
				Authorization: '={{$credentials.accessToken}}',
			},
		},
	};
}
