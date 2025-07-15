/**
 * Jest unit tests for MaxApi credentials
 * 
 * Run with: npm test
 * Run with coverage: npm run test:coverage
 * Run in watch mode: npm run test:watch
 */

import { MaxApi } from '../MaxApi.credentials';

describe('MaxApi Credentials', () => {
	let maxApiCredentials: MaxApi;

	beforeEach(() => {
		maxApiCredentials = new MaxApi();
	});

	describe('Credential Properties', () => {
		it('should have correct name', () => {
			expect(maxApiCredentials.name).toBe('maxApi');
		});

		it('should have correct display name', () => {
			expect(maxApiCredentials.displayName).toBe('Max API');
		});

		it('should have correct documentation URL', () => {
			expect(maxApiCredentials.documentationUrl).toBe('https://dev.max.ru/docs/chatbots/bots-coding/library/js');
		});

		it('should have access token property with password masking', () => {
			const accessTokenProperty = maxApiCredentials.properties.find(
				(prop) => prop.name === 'accessToken'
			);

			expect(accessTokenProperty).toBeDefined();
			expect(accessTokenProperty?.displayName).toBe('Access Token');
			expect(accessTokenProperty?.type).toBe('string');
			expect(accessTokenProperty?.typeOptions?.password).toBe(true);
			expect(accessTokenProperty?.default).toBe('');
			expect(accessTokenProperty?.description).toContain('Bot access token');
		});

		it('should have base URL property with default value', () => {
			const baseUrlProperty = maxApiCredentials.properties.find(
				(prop) => prop.name === 'baseUrl'
			);

			expect(baseUrlProperty).toBeDefined();
			expect(baseUrlProperty?.displayName).toBe('Base URL');
			expect(baseUrlProperty?.type).toBe('string');
			expect(baseUrlProperty?.default).toBe('https://botapi.max.ru');
			expect(baseUrlProperty?.description).toContain('Base URL for Max messenger Bot API');
		});
	});

	describe('Credential Test Configuration', () => {
		it('should have correct test request configuration', () => {
			expect(maxApiCredentials.test).toBeDefined();
			expect(maxApiCredentials.test.request).toBeDefined();
			expect(maxApiCredentials.test.request.baseURL).toBe('={{$credentials.baseUrl}}');
			expect(maxApiCredentials.test.request.url).toBe('/me');
			expect(maxApiCredentials.test.request.qs).toEqual({
				access_token: '={{$credentials.accessToken}}',
			});
		});

		it('should use Max API /me endpoint for credential validation', () => {
			const testRequest = maxApiCredentials.test.request;

			expect(testRequest.url).toBe('/me');
			expect(testRequest.qs?.['access_token']).toBe('={{$credentials.accessToken}}');
		});
	});

	describe('Credential Validation', () => {
		it('should validate credentials structure', () => {
			// Test that all required properties are present
			const requiredProperties = ['accessToken', 'baseUrl'];
			const propertyNames = maxApiCredentials.properties.map(prop => prop.name);

			requiredProperties.forEach(prop => {
				expect(propertyNames).toContain(prop);
			});
		});

		it('should have proper field descriptions', () => {
			const accessTokenProperty = maxApiCredentials.properties.find(
				(prop) => prop.name === 'accessToken'
			);
			const baseUrlProperty = maxApiCredentials.properties.find(
				(prop) => prop.name === 'baseUrl'
			);

			expect(accessTokenProperty?.description).toContain('Bot access token');
			expect(accessTokenProperty?.description).toContain('@MasterBot');
			expect(baseUrlProperty?.description).toContain('Base URL for Max messenger Bot API');
		});

		it('should have all required properties for n8n credential interface', () => {
			// Verify the credential implements ICredentialType properly
			expect(maxApiCredentials.name).toBeDefined();
			expect(maxApiCredentials.displayName).toBeDefined();
			expect(maxApiCredentials.properties).toBeDefined();
			expect(maxApiCredentials.test).toBeDefined();
			expect(Array.isArray(maxApiCredentials.properties)).toBe(true);
			expect(maxApiCredentials.properties.length).toBeGreaterThan(0);
		});

		it('should use proper Max API authentication format', () => {
			const testRequest = maxApiCredentials.test.request;

			// Max API uses access_token as query parameter, not Authorization header
			expect(testRequest.qs).toBeDefined();
			expect(testRequest.qs?.['access_token']).toBeDefined();
			expect(testRequest.headers).toBeUndefined();
		});
	});
});