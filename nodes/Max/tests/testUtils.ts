import type { IExecuteFunctions, INodeExecutionData, IBinaryData } from 'n8n-workflow';

/**
 * Test Utilities for GenericFunctions Testing
 * 
 * Provides comprehensive mock infrastructure and test data factories
 * for achieving maximum code coverage with minimum test cases.
 */

// ============================================================================
// MOCK INFRASTRUCTURE
// ============================================================================

/**
 * Creates a comprehensive mock of IExecuteFunctions with all required methods
 */
export function createMockExecuteFunctions(overrides: Partial<IExecuteFunctions> = {}): IExecuteFunctions {
	const defaultMock = {
		getCredentials: jest.fn().mockResolvedValue({
			accessToken: 'test-access-token',
			baseUrl: 'https://botapi.max.ru'
		}),
		getNode: jest.fn().mockReturnValue({
			name: 'Max Test Node',
			type: 'n8n-nodes-max.max',
			typeVersion: 1
		}),
		getNodeParameter: jest.fn(),
		helpers: {
			httpRequest: jest.fn(),
		},
		// Add other required methods as needed
		continueOnFail: jest.fn().mockReturnValue(false),
		getExecutionId: jest.fn().mockReturnValue('test-execution-id'),
		getWorkflowStaticData: jest.fn().mockReturnValue({}),
		getTimezone: jest.fn().mockReturnValue('UTC'),
		getMode: jest.fn().mockReturnValue('manual'),
		getActivationMode: jest.fn().mockReturnValue('manual'),
		getNodeInputData: jest.fn().mockReturnValue([]),
		getInputData: jest.fn().mockReturnValue([]),
		getWorkflow: jest.fn().mockReturnValue({ id: 'test-workflow' }),
		getRestApiUrl: jest.fn().mockReturnValue('http://localhost:5678/rest'),
		getInstanceBaseUrl: jest.fn().mockReturnValue('http://localhost:5678'),
		getInstanceId: jest.fn().mockReturnValue('test-instance'),
		getWebhookName: jest.fn().mockReturnValue('webhook'),
		getWebhookDescription: jest.fn().mockReturnValue('Test webhook'),
		getChildNodes: jest.fn().mockReturnValue([]),
		getParentNodes: jest.fn().mockReturnValue([]),
		getInputSourceData: jest.fn().mockReturnValue({ main: [[]] }),
		logNodeOutput: jest.fn(),
		prepareOutputData: jest.fn(),
		putExecutionToWait: jest.fn(),
		sendMessageToUI: jest.fn(),
		sendResponse: jest.fn(),
		getContext: jest.fn().mockReturnValue({}),
		evaluateExpression: jest.fn(),
		executeWorkflow: jest.fn(),
		getKnownBinaryMimeTypes: jest.fn().mockReturnValue([]),
		getBinaryDataBuffer: jest.fn(),
		setBinaryDataBuffer: jest.fn(),
		getScheduleTriggerData: jest.fn(),
		getSSHClient: jest.fn(),
		...overrides
	} as unknown as IExecuteFunctions;

	return defaultMock;
}

/**
 * Creates mock HTTP request function with configurable responses
 */
export function createMockHttpRequest() {
	return jest.fn().mockImplementation((_options: any) => {
		// Default successful response
		return Promise.resolve({
			statusCode: 200,
			body: { success: true },
			headers: {}
		});
	});
}

/**
 * Creates mock file system operations
 */
export function createMockFileSystem() {
	return {
		promises: {
			writeFile: jest.fn().mockResolvedValue(undefined),
			readFile: jest.fn().mockResolvedValue(Buffer.from('test file content')),
			unlink: jest.fn().mockResolvedValue(undefined)
		}
	};
}

/**
 * Creates mock crypto functions
 */
export function createMockCrypto() {
	return {
		randomUUID: jest.fn().mockReturnValue('test-uuid-12345')
	};
}

/**
 * Creates mock OS functions
 */
export function createMockOS() {
	return {
		tmpdir: jest.fn().mockReturnValue('/tmp')
	};
}

/**
 * Creates mock path functions
 */
export function createMockPath() {
	return {
		join: jest.fn().mockImplementation((...paths: string[]) => paths.join('/'))
	};
}

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

/**
 * Factory for creating test error objects
 */
export class ErrorFactory {
	static createAuthError(overrides: any = {}) {
		return {
			error_code: 401,
			description: 'Unauthorized access',
			message: 'Invalid token provided',
			...overrides
		};
	}

	static createRateLimitError(overrides: any = {}) {
		return {
			error_code: 429,
			description: 'Too Many Requests',
			parameters: { retry_after: 60 },
			...overrides
		};
	}

	static createValidationError(overrides: any = {}) {
		return {
			error_code: 400,
			description: 'Bad Request',
			message: 'Invalid parameter: text too long',
			...overrides
		};
	}

	static createBusinessLogicError(overrides: any = {}) {
		return {
			error_code: 404,
			description: 'Chat not found',
			message: 'The specified chat does not exist',
			...overrides
		};
	}

	static createNetworkError(overrides: any = {}) {
		return {
			code: 'ECONNREFUSED',
			message: 'Connection refused',
			...overrides
		};
	}

	static createUnknownError(overrides: any = {}) {
		return {
			message: 'Something unexpected happened',
			...overrides
		};
	}
}

/**
 * Factory for creating test attachment configurations
 */
export class AttachmentConfigFactory {
	static createImageConfig(overrides: any = {}) {
		return {
			type: 'image' as const,
			inputType: 'binary' as const,
			binaryProperty: 'data',
			fileName: 'test-image.jpg',
			...overrides
		};
	}

	static createVideoConfig(overrides: any = {}) {
		return {
			type: 'video' as const,
			inputType: 'url' as const,
			fileUrl: 'https://example.com/video.mp4',
			fileName: 'test-video.mp4',
			...overrides
		};
	}

	static createFileConfig(overrides: any = {}) {
		return {
			type: 'file' as const,
			inputType: 'binary' as const,
			binaryProperty: 'document',
			fileName: 'test-document.pdf',
			...overrides
		};
	}
}

/**
 * Factory for creating test keyboard button configurations
 */
export class KeyboardButtonFactory {
	static createCallbackButton(overrides: any = {}) {
		return {
			text: 'Click Me',
			type: 'callback' as const,
			payload: 'button_clicked',
			intent: 'default' as const,
			...overrides
		};
	}

	static createLinkButton(overrides: any = {}) {
		return {
			text: 'Visit Website',
			type: 'link' as const,
			url: 'https://example.com',
			intent: 'positive' as const,
			...overrides
		};
	}

	static createContactButton(overrides: any = {}) {
		return {
			text: 'Share Contact',
			type: 'request_contact' as const,
			intent: 'default' as const,
			...overrides
		};
	}

	static createLocationButton(overrides: any = {}) {
		return {
			text: 'Share Location',
			type: 'request_geo_location' as const,
			intent: 'default' as const,
			...overrides
		};
	}
}

/**
 * Factory for creating test binary data
 */
export class BinaryDataFactory {
	static createImageBinary(overrides: Partial<IBinaryData> = {}): IBinaryData {
		return {
			data: 'base64-encoded-image-data',
			mimeType: 'image/jpeg',
			fileName: 'test-image.jpg',
			fileSize: '102400', // 100KB
			fileExtension: 'jpg',
			id: '/tmp/test-image-12345.jpg',
			...overrides
		};
	}

	static createVideoBinary(overrides: Partial<IBinaryData> = {}): IBinaryData {
		return {
			data: 'base64-encoded-video-data',
			mimeType: 'video/mp4',
			fileName: 'test-video.mp4',
			fileSize: '10485760', // 10MB
			fileExtension: 'mp4',
			id: '/tmp/test-video-12345.mp4',
			...overrides
		};
	}

	static createDocumentBinary(overrides: Partial<IBinaryData> = {}): IBinaryData {
		return {
			data: 'base64-encoded-document-data',
			mimeType: 'application/pdf',
			fileName: 'test-document.pdf',
			fileSize: '512000', // 500KB
			fileExtension: 'pdf',
			id: '/tmp/test-document-12345.pdf',
			...overrides
		};
	}
}

/**
 * Factory for creating test node execution data
 */
export class NodeExecutionDataFactory {
	static createWithBinary(binaryData: Record<string, IBinaryData>, jsonData: any = {}): INodeExecutionData {
		return {
			json: jsonData,
			binary: binaryData
		};
	}

	static createWithImageBinary(jsonData: any = {}): INodeExecutionData {
		return {
			json: jsonData,
			binary: {
				data: BinaryDataFactory.createImageBinary()
			}
		};
	}

	static createWithDocumentBinary(jsonData: any = {}): INodeExecutionData {
		return {
			json: jsonData,
			binary: {
				document: BinaryDataFactory.createDocumentBinary()
			}
		};
	}
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Helper functions for common test assertions
 */
export class AssertionHelpers {
	/**
	 * Asserts that a function throws a specific error type with message
	 */
	static expectError(fn: () => any, errorType: any, messagePattern?: string | RegExp) {
		expect(fn).toThrow(errorType);
		if (messagePattern) {
			expect(fn).toThrow(messagePattern);
		}
	}

	/**
	 * Asserts that an async function throws a specific error type with message
	 */
	static async expectAsyncError(fn: () => Promise<any>, errorType: any, messagePattern?: string | RegExp) {
		await expect(fn()).rejects.toThrow(errorType);
		if (messagePattern) {
			await expect(fn()).rejects.toThrow(messagePattern);
		}
	}

	/**
	 * Asserts HTTP request was called with specific parameters
	 */
	static expectHttpRequest(mockHttpRequest: jest.Mock, expectedOptions: any) {
		expect(mockHttpRequest).toHaveBeenCalledWith(
			expect.objectContaining(expectedOptions)
		);
	}

	/**
	 * Asserts that credentials were retrieved
	 */
	static expectCredentialsCall(mockExecuteFunctions: any, credentialType = 'maxApi') {
		expect(mockExecuteFunctions.getCredentials).toHaveBeenCalledWith(credentialType);
	}
}

// ============================================================================
// MOCK BUILDERS
// ============================================================================

/**
 * Builder pattern for creating complex mock scenarios
 */
export class MockScenarioBuilder {
	private mockExecuteFunctions: IExecuteFunctions;
	private mockHttpRequest: jest.Mock;

	constructor() {
		this.mockHttpRequest = createMockHttpRequest();
		this.mockExecuteFunctions = createMockExecuteFunctions({
			helpers: {
				httpRequest: this.mockHttpRequest,
			} as any
		});
	}

	withCredentials(credentials: any) {
		(this.mockExecuteFunctions.getCredentials as jest.Mock).mockResolvedValue(credentials);
		return this;
	}

	withHttpResponse(response: any) {
		this.mockHttpRequest.mockResolvedValue(response);
		return this;
	}

	withHttpError(error: any) {
		this.mockHttpRequest.mockRejectedValue(error);
		return this;
	}

	withNodeParameter(paramName: string, value: any) {
		(this.mockExecuteFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
			if (name === paramName) return value;
			return {};
		});
		return this;
	}

	build() {
		return {
			mockExecuteFunctions: this.mockExecuteFunctions,
			mockHttpRequest: this.mockHttpRequest
		};
	}
}

// ============================================================================
// TEST CONSTANTS
// ============================================================================

export const TEST_CONSTANTS = {
	// File size limits for testing
	FILE_SIZES: {
		SMALL: 1024, // 1KB
		MEDIUM: 1024 * 1024, // 1MB
		LARGE: 1024 * 1024 * 10, // 10MB
		OVERSIZED_IMAGE: 1024 * 1024 * 15, // 15MB (over 10MB limit)
		OVERSIZED_VIDEO: 1024 * 1024 * 60, // 60MB (over 50MB limit)
	},

	// Text length limits for testing
	TEXT_LENGTHS: {
		SHORT: 'Hello world',
		MEDIUM: 'A'.repeat(1000),
		LONG: 'A'.repeat(3999), // Just under limit
		OVERSIZED: 'A'.repeat(4001), // Over 4000 character limit
	},

	// Common URLs for testing
	URLS: {
		VALID: 'https://example.com/file.jpg',
		INVALID: 'not-a-valid-url',
		LOCALHOST: 'http://localhost:3000/test',
	},

	// Common IDs for testing
	IDS: {
		VALID_USER: 123456,
		VALID_CHAT: 789012,
		INVALID_ZERO: 0,
		INVALID_NEGATIVE: -1,
		INVALID_NAN: NaN,
	}
};