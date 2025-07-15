import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { Bot } from '@maxhub/max-bot-api';
import {
	validateAttachment,
	downloadFileFromUrl,
	uploadFileToMax,
	processBinaryAttachment,
	processUrlAttachment,
	handleAttachments,
	IAttachmentConfig,
} from '../GenericFunctions';

// Mock the Bot class
jest.mock('@maxhub/max-bot-api');

describe('Max Node - Attachment Handling', () => {
	let mockExecuteFunctions: Partial<IExecuteFunctions>;
	let mockBot: jest.Mocked<Bot>;

	beforeEach(() => {
		mockBot = new Bot('test-token') as jest.Mocked<Bot>;
		
		mockExecuteFunctions = {
			getCredentials: jest.fn().mockResolvedValue({
				accessToken: 'test-token',
				baseUrl: 'https://botapi.max.ru',
			}),
			helpers: {
				httpRequest: jest.fn(),
				getBinaryDataBuffer: jest.fn(),
				writeContentToFile: jest.fn(),
			} as any,
			getNode: jest.fn().mockReturnValue({ name: 'Max Test Node' }),
		};
	});

	describe('validateAttachment', () => {
		it('should validate image attachment configuration', () => {
			const config: IAttachmentConfig = {
				type: 'image',
				inputType: 'binary',
				binaryProperty: 'data',
			};

			expect(() => validateAttachment(config, 1024 * 1024, 'test.jpg')).not.toThrow();
		});

		it('should throw error for unsupported attachment type', () => {
			const config: IAttachmentConfig = {
				type: 'unsupported' as any,
				inputType: 'binary',
				binaryProperty: 'data',
			};

			expect(() => validateAttachment(config)).toThrow('Unsupported attachment type: unsupported');
		});

		it('should throw error for file size exceeding limit', () => {
			const config: IAttachmentConfig = {
				type: 'image',
				inputType: 'binary',
				binaryProperty: 'data',
			};

			const largeFileSize = 15 * 1024 * 1024; // 15MB (exceeds 10MB limit for images)
			expect(() => validateAttachment(config, largeFileSize, 'test.jpg')).toThrow('File size');
		});

		it('should throw error for unsupported file extension', () => {
			const config: IAttachmentConfig = {
				type: 'image',
				inputType: 'binary',
				binaryProperty: 'data',
			};

			expect(() => validateAttachment(config, 1024, 'test.txt')).toThrow('Unsupported file extension');
		});

		it('should throw error for missing binary property', () => {
			const config: IAttachmentConfig = {
				type: 'image',
				inputType: 'binary',
				binaryProperty: '',
			};

			expect(() => validateAttachment(config)).toThrow('Binary property name is required');
		});

		it('should throw error for missing file URL', () => {
			const config: IAttachmentConfig = {
				type: 'image',
				inputType: 'url',
				fileUrl: '',
			};

			expect(() => validateAttachment(config)).toThrow('File URL is required');
		});

		it('should throw error for invalid file URL', () => {
			const config: IAttachmentConfig = {
				type: 'image',
				inputType: 'url',
				fileUrl: 'invalid-url',
			};

			expect(() => validateAttachment(config)).toThrow('Invalid file URL');
		});
	});

	describe('downloadFileFromUrl', () => {
		it('should download file from URL successfully', async () => {
			const mockResponse = {
				statusCode: 200,
				body: Buffer.from('test file content'),
			};

			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(mockResponse);
			(mockExecuteFunctions.helpers!.writeContentToFile as jest.Mock).mockResolvedValue(undefined);

			const result = await downloadFileFromUrl.call(
				mockExecuteFunctions as IExecuteFunctions,
				'https://example.com/test.jpg',
				'test.jpg'
			);

			expect(result.fileName).toBe('test.jpg');
			expect(result.fileSize).toBe(17); // Length of 'test file content'
			expect(result.filePath).toContain('test.jpg');
		});

		it('should handle HTTP error responses', async () => {
			const mockResponse = {
				statusCode: 404,
				body: 'Not Found',
			};

			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(mockResponse);

			await expect(
				downloadFileFromUrl.call(
					mockExecuteFunctions as IExecuteFunctions,
					'https://example.com/nonexistent.jpg'
				)
			).rejects.toThrow('Failed to download file: HTTP 404');
		});

		it('should generate filename from URL when not provided', async () => {
			const mockResponse = {
				statusCode: 200,
				body: Buffer.from('test file content'),
			};

			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue(mockResponse);
			(mockExecuteFunctions.helpers!.writeContentToFile as jest.Mock).mockResolvedValue(undefined);

			const result = await downloadFileFromUrl.call(
				mockExecuteFunctions as IExecuteFunctions,
				'https://example.com/path/image.png'
			);

			expect(result.fileName).toBe('image.png');
		});
	});

	describe('uploadFileToMax', () => {
		it('should upload file to Max API successfully', async () => {
			const mockUploadUrlResponse = {
				url: 'https://upload.max.ru/upload-endpoint',
			};

			const mockUploadResponse = {
				statusCode: 200,
				body: JSON.stringify({ token: 'file-token-123' }),
			};

			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce(mockUploadUrlResponse) // First call for upload URL
				.mockResolvedValueOnce(mockUploadResponse); // Second call for file upload

			const fs = await import('fs');
			jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('test file content'));

			const token = await uploadFileToMax.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				'/tmp/test.jpg',
				'test.jpg',
				'image'
			);

			expect(token).toBe('file-token-123');
			expect(mockExecuteFunctions.helpers!.httpRequest).toHaveBeenCalledTimes(2);
		});

		it('should handle upload URL request failure', async () => {
			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock).mockResolvedValue({});

			await expect(
				uploadFileToMax.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'/tmp/test.jpg',
					'test.jpg',
					'image'
				)
			).rejects.toThrow('Failed to get upload URL from Max API');
		});

		it('should handle file upload failure', async () => {
			const mockUploadUrlResponse = {
				url: 'https://upload.max.ru/upload-endpoint',
			};

			const mockUploadResponse = {
				statusCode: 500,
				body: 'Internal Server Error',
			};

			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce(mockUploadUrlResponse)
				.mockResolvedValueOnce(mockUploadResponse);

			const fs = await import('fs');
			jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('test file content'));

			await expect(
				uploadFileToMax.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					'/tmp/test.jpg',
					'test.jpg',
					'image'
				)
			).rejects.toThrow('File upload failed: HTTP 500');
		});
	});

	describe('processBinaryAttachment', () => {
		it('should process binary attachment successfully', async () => {
			const config: IAttachmentConfig = {
				type: 'image',
				inputType: 'binary',
				binaryProperty: 'data',
			};

			const item: INodeExecutionData = {
				json: {},
				binary: {
					data: {
						fileName: 'test.jpg',
						fileSize: '1024',
						id: '/tmp/test.jpg',
						mimeType: 'image/jpeg',
						data: '',
					},
				},
			};

			// Mock uploadFileToMax
			const mockUploadUrlResponse = {
				url: 'https://upload.max.ru/upload-endpoint',
			};

			const mockUploadResponse = {
				statusCode: 200,
				body: JSON.stringify({ token: 'file-token-123' }),
			};

			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce(mockUploadUrlResponse)
				.mockResolvedValueOnce(mockUploadResponse);

			const fs = await import('fs');
			jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('test file content'));

			const result = await processBinaryAttachment.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				config,
				item
			);

			expect(result).toEqual({
				type: 'image',
				payload: {
					token: 'file-token-123',
				},
			});
		});

		it('should throw error when binary data is missing', async () => {
			const config: IAttachmentConfig = {
				type: 'image',
				inputType: 'binary',
				binaryProperty: 'data',
			};

			const item: INodeExecutionData = {
				json: {},
				binary: {},
			};

			await expect(
				processBinaryAttachment.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					config,
					item
				)
			).rejects.toThrow('No binary data found for property "data"');
		});
	});

	describe('processUrlAttachment', () => {
		it('should process URL attachment successfully', async () => {
			const config: IAttachmentConfig = {
				type: 'image',
				inputType: 'url',
				fileUrl: 'https://example.com/test.jpg',
			};

			// Mock downloadFileFromUrl
			const mockDownloadResponse = {
				statusCode: 200,
				body: Buffer.from('test file content'),
			};

			// Mock uploadFileToMax
			const mockUploadUrlResponse = {
				url: 'https://upload.max.ru/upload-endpoint',
			};

			const mockUploadResponse = {
				statusCode: 200,
				body: JSON.stringify({ token: 'file-token-123' }),
			};

			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce(mockDownloadResponse) // Download file
				.mockResolvedValueOnce(mockUploadUrlResponse) // Get upload URL
				.mockResolvedValueOnce(mockUploadResponse); // Upload file

			const fs = await import('fs');
			jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
			jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('test file content'));
			jest.spyOn(fs.promises, 'unlink').mockResolvedValue();

			const result = await processUrlAttachment.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				config
			);

			expect(result).toEqual({
				type: 'image',
				payload: {
					token: 'file-token-123',
				},
			});
		});
	});

	describe('handleAttachments', () => {
		it('should handle multiple attachments successfully', async () => {
			const attachmentConfigs: IAttachmentConfig[] = [
				{
					type: 'image',
					inputType: 'binary',
					binaryProperty: 'image',
				},
				{
					type: 'video',
					inputType: 'url',
					fileUrl: 'https://example.com/video.mp4',
				},
			];

			const item: INodeExecutionData = {
				json: {},
				binary: {
					image: {
						fileName: 'test.jpg',
						fileSize: '1024',
						id: '/tmp/test.jpg',
						mimeType: 'image/jpeg',
						data: '',
					},
				},
			};

			// Mock all HTTP requests
			const mockDownloadResponse = {
				statusCode: 200,
				body: Buffer.from('test video content'),
			};

			const mockUploadUrlResponse = {
				url: 'https://upload.max.ru/upload-endpoint',
			};

			const mockUploadResponse1 = {
				statusCode: 200,
				body: JSON.stringify({ token: 'image-token-123' }),
			};

			const mockUploadResponse2 = {
				statusCode: 200,
				body: JSON.stringify({ token: 'video-token-456' }),
			};

			(mockExecuteFunctions.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce(mockUploadUrlResponse) // Image upload URL
				.mockResolvedValueOnce(mockUploadResponse1) // Image upload
				.mockResolvedValueOnce(mockDownloadResponse) // Video download
				.mockResolvedValueOnce(mockUploadUrlResponse) // Video upload URL
				.mockResolvedValueOnce(mockUploadResponse2); // Video upload

			const fs = await import('fs');
			jest.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('test file content'));
			jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
			jest.spyOn(fs.promises, 'unlink').mockResolvedValue();

			const result = await handleAttachments.call(
				mockExecuteFunctions as IExecuteFunctions,
				mockBot,
				attachmentConfigs,
				item
			);

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				type: 'image',
				payload: {
					token: 'image-token-123',
				},
			});
			expect(result[1]).toEqual({
				type: 'video',
				payload: {
					token: 'video-token-456',
				},
			});
		});

		it('should handle attachment processing errors', async () => {
			const attachmentConfigs: IAttachmentConfig[] = [
				{
					type: 'image',
					inputType: 'binary',
					binaryProperty: 'nonexistent',
				},
			];

			const item: INodeExecutionData = {
				json: {},
				binary: {},
			};

			await expect(
				handleAttachments.call(
					mockExecuteFunctions as IExecuteFunctions,
					mockBot,
					attachmentConfigs,
					item
				)
			).rejects.toThrow('Failed to process image attachment');
		});
	});

	describe('File Size Limits', () => {
		it('should enforce correct file size limits for different types', () => {
			const testCases = [
				{ type: 'image', maxSize: 10 * 1024 * 1024, ext: 'jpg' },
				{ type: 'video', maxSize: 50 * 1024 * 1024, ext: 'mp4' },
				{ type: 'audio', maxSize: 20 * 1024 * 1024, ext: 'mp3' },
				{ type: 'file', maxSize: 20 * 1024 * 1024, ext: 'pdf' },
			];

			testCases.forEach(({ type, maxSize, ext }) => {
				const config: IAttachmentConfig = {
					type: type as any,
					inputType: 'binary',
					binaryProperty: 'data',
				};

				// Should not throw for file at limit
				expect(() => validateAttachment(config, maxSize, `test.${ext}`)).not.toThrow();

				// Should throw for file exceeding limit
				expect(() => validateAttachment(config, maxSize + 1, `test.${ext}`)).toThrow('File size');
			});
		});
	});

	describe('Supported File Extensions', () => {
		it('should validate supported extensions for each attachment type', () => {
			const testCases = [
				{ type: 'image', validExt: '.jpg', invalidExt: '.txt' },
				{ type: 'video', validExt: '.mp4', invalidExt: '.jpg' },
				{ type: 'audio', validExt: '.mp3', invalidExt: '.jpg' },
				{ type: 'file', validExt: '.pdf', invalidExt: '.exe' },
			];

			testCases.forEach(({ type, validExt, invalidExt }) => {
				const config: IAttachmentConfig = {
					type: type as any,
					inputType: 'binary',
					binaryProperty: 'data',
				};

				// Should not throw for valid extension
				expect(() => validateAttachment(config, 1024, `test${validExt}`)).not.toThrow();

				// Should throw for invalid extension
				expect(() => validateAttachment(config, 1024, `test${invalidExt}`)).toThrow('Unsupported file extension');
			});
		});
	});
});