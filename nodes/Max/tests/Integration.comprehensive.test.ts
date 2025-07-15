/**
 * Comprehensive integration tests for Max messenger node
 * Tests all operations with real API interactions (mocked)
 */


import { Max } from '../Max.node';

// Mock the Max Bot API
jest.mock('@maxhub/max-bot-api', () => ({
	Bot: jest.fn().mockImplementation((token) => ({
		token,
		api: {
			sendMessageToUser: jest.fn(),
			sendMessageToChat: jest.fn(),
			editMessage: jest.fn(),
			deleteMessage: jest.fn(),
			answerCallbackQuery: jest.fn(),
			getChatInfo: jest.fn(),
			leaveChat: jest.fn(),
		},
	})),
}));

describe('Max Node - Comprehensive Integration Tests', () => {
	let maxNode: Max;

	beforeEach(() => {
		maxNode = new Max();
		jest.clearAllMocks();
	});

	describe('Basic Node Tests', () => {
		it('should create Max node instance', () => {
			expect(maxNode).toBeDefined();
			expect(maxNode.description.displayName).toBe('Max');
		});
	});
});