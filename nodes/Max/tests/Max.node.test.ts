import { Max } from '../Max.node';

describe('Max Node', () => {
	let maxNode: Max;

	beforeEach(() => {
		maxNode = new Max();
	});

	describe('Node Description', () => {
		it('should have correct basic properties', () => {
			expect(maxNode.description.displayName).toBe('Max');
			expect(maxNode.description.name).toBe('max');
			expect(maxNode.description.group).toContain('output');
			expect(maxNode.description.version).toBe(1);
		});

		it('should require maxApi credentials', () => {
			const credentials = maxNode.description.credentials;
			expect(credentials).toHaveLength(1);
			expect(credentials?.[0]?.name).toBe('maxApi');
			expect(credentials?.[0]?.required).toBe(true);
		});

		it('should have message resource', () => {
			const resourceProperty = maxNode.description.properties.find(p => p.name === 'resource');
			expect(resourceProperty).toBeDefined();
			expect(resourceProperty?.options).toContainEqual({
				name: 'Message',
				value: 'message',
			});
		});

		it('should have chat resource', () => {
			const resourceProperty = maxNode.description.properties.find(p => p.name === 'resource');
			expect(resourceProperty).toBeDefined();
			expect(resourceProperty?.options).toContainEqual({
				name: 'Chat',
				value: 'chat',
			});
		});

		it('should have sendMessage operation', () => {
			const operationProperty = maxNode.description.properties.find(p => p.name === 'operation');
			expect(operationProperty).toBeDefined();
			expect(operationProperty?.options).toContainEqual({
				name: 'Send Message',
				value: 'sendMessage',
				description: 'Send a message to a user or chat',
				action: 'Send a message',
			});
		});

		it('should have editMessage operation', () => {
			const operationProperty = maxNode.description.properties.find(p => p.name === 'operation');
			expect(operationProperty).toBeDefined();
			expect(operationProperty?.options).toContainEqual({
				name: 'Edit Message',
				value: 'editMessage',
				description: 'Edit an existing message',
				action: 'Edit a message',
			});
		});

		it('should have deleteMessage operation', () => {
			const operationProperty = maxNode.description.properties.find(p => p.name === 'operation');
			expect(operationProperty).toBeDefined();
			expect(operationProperty?.options).toContainEqual({
				name: 'Delete Message',
				value: 'deleteMessage',
				description: 'Delete an existing message',
				action: 'Delete a message',
			});
		});

		it('should have getChatInfo operation for chat resource', () => {
			const chatOperationProperties = maxNode.description.properties.filter(p => 
				p.name === 'operation' && 
				p.displayOptions?.show?.['resource']?.includes('chat')
			);
			expect(chatOperationProperties).toHaveLength(1);
			
			const chatOperationProperty = chatOperationProperties[0];
			expect(chatOperationProperty?.options).toContainEqual({
				name: 'Get Chat Info',
				value: 'getChatInfo',
				description: 'Get information about a chat',
				action: 'Get chat information',
			});
		});

		it('should have leaveChat operation for chat resource', () => {
			const chatOperationProperties = maxNode.description.properties.filter(p => 
				p.name === 'operation' && 
				p.displayOptions?.show?.['resource']?.includes('chat')
			);
			expect(chatOperationProperties).toHaveLength(1);
			
			const chatOperationProperty = chatOperationProperties[0];
			expect(chatOperationProperty?.options).toContainEqual({
				name: 'Leave Chat',
				value: 'leaveChat',
				description: 'Leave a chat/group',
				action: 'Leave a chat',
			});
		});
	});

	describe('Parameter Validation', () => {
		it('should have required text parameter', () => {
			const textProperty = maxNode.description.properties.find(p => p.name === 'text');
			expect(textProperty).toBeDefined();
			expect(textProperty?.required).toBe(true);
			expect(textProperty?.type).toBe('string');
		});

		it('should have sendTo parameter with user and chat options', () => {
			const sendToProperty = maxNode.description.properties.find(p => p.name === 'sendTo');
			expect(sendToProperty).toBeDefined();
			expect(sendToProperty?.options).toContainEqual({
				name: 'User',
				value: 'user',
				description: 'Send message to a specific user',
			});
			expect(sendToProperty?.options).toContainEqual({
				name: 'Chat',
				value: 'chat',
				description: 'Send message to a chat/group',
			});
		});

		it('should have format parameter with correct options', () => {
			const formatProperty = maxNode.description.properties.find(p => p.name === 'format');
			expect(formatProperty).toBeDefined();
			expect(formatProperty?.options).toHaveLength(3);
			expect(formatProperty?.options).toContainEqual({
				name: 'Plain Text',
				value: 'plain',
				description: 'Send message as plain text',
			});
			expect(formatProperty?.options).toContainEqual({
				name: 'HTML',
				value: 'html',
				description: 'Send message with HTML formatting',
			});
			expect(formatProperty?.options).toContainEqual({
				name: 'Markdown',
				value: 'markdown',
				description: 'Send message with Markdown formatting',
			});
		});

		it('should have messageId parameter for edit operation', () => {
			const messageIdProperties = maxNode.description.properties.filter(p => p.name === 'messageId');
			expect(messageIdProperties).toHaveLength(2); // One for edit, one for delete
			
			const editMessageIdProperty = messageIdProperties.find(p => 
				p.displayOptions?.show?.['operation']?.includes('editMessage')
			);
			expect(editMessageIdProperty).toBeDefined();
			expect(editMessageIdProperty?.required).toBe(true);
			expect(editMessageIdProperty?.type).toBe('string');
			expect(editMessageIdProperty?.description).toBe('The ID of the message to edit');
		});

		it('should have messageId parameter for delete operation', () => {
			const messageIdProperties = maxNode.description.properties.filter(p => p.name === 'messageId');
			expect(messageIdProperties).toHaveLength(2); // One for edit, one for delete
			
			const deleteMessageIdProperty = messageIdProperties.find(p => 
				p.displayOptions?.show?.['operation']?.includes('deleteMessage')
			);
			expect(deleteMessageIdProperty).toBeDefined();
			expect(deleteMessageIdProperty?.required).toBe(true);
			expect(deleteMessageIdProperty?.type).toBe('string');
			expect(deleteMessageIdProperty?.description).toBe('The ID of the message to delete');
		});

		it('should have text parameter for edit operation', () => {
			const textProperties = maxNode.description.properties.filter(p => p.name === 'text');
			expect(textProperties.length).toBeGreaterThanOrEqual(2); // One for send, one for edit
			
			const editTextProperty = textProperties.find(p => 
				p.displayOptions?.show?.['operation']?.includes('editMessage')
			);
			expect(editTextProperty).toBeDefined();
			expect(editTextProperty?.required).toBe(true);
			expect(editTextProperty?.type).toBe('string');
			expect(editTextProperty?.description).toBe('The new text content of the message (max 4000 characters)');
		});

		it('should have format parameter for edit operation', () => {
			const formatProperties = maxNode.description.properties.filter(p => p.name === 'format');
			expect(formatProperties.length).toBeGreaterThanOrEqual(2); // One for send, one for edit
			
			const editFormatProperty = formatProperties.find(p => 
				p.displayOptions?.show?.['operation']?.includes('editMessage')
			);
			expect(editFormatProperty).toBeDefined();
			expect(editFormatProperty?.options).toHaveLength(3);
			expect(editFormatProperty?.options).toContainEqual({
				name: 'Plain Text',
				value: 'plain',
				description: 'Edit message as plain text',
			});
		});

		it('should have chatId parameter for chat operations', () => {
			const chatIdProperties = maxNode.description.properties.filter(p => p.name === 'chatId');
			expect(chatIdProperties.length).toBeGreaterThanOrEqual(1);
			
			const chatOperationChatIdProperty = chatIdProperties.find(p => 
				p.displayOptions?.show?.['resource']?.includes('chat') &&
				p.displayOptions?.show?.['operation']?.includes('getChatInfo') &&
				p.displayOptions?.show?.['operation']?.includes('leaveChat')
			);
			expect(chatOperationChatIdProperty).toBeDefined();
			expect(chatOperationChatIdProperty?.required).toBe(true);
			expect(chatOperationChatIdProperty?.type).toBe('string');
			expect(chatOperationChatIdProperty?.description).toBe('The ID of the chat');
		});
	});
});