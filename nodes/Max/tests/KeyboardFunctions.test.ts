import {
	validateKeyboardButton,
	validateKeyboardLayout,
	formatInlineKeyboard,
	createInlineKeyboardAttachment,
	IButtonConfig,
} from '../GenericFunctions';

describe('Keyboard Functions', () => {
	describe('validateKeyboardButton', () => {
		it('should validate a valid callback button', () => {
			const button: IButtonConfig = {
				text: 'Click me',
				type: 'callback',
				payload: 'button_clicked',
			};

			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should validate a valid link button', () => {
			const button: IButtonConfig = {
				text: 'Visit site',
				type: 'link',
				url: 'https://example.com',
			};

			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should validate a valid contact request button', () => {
			const button: IButtonConfig = {
				text: 'Share contact',
				type: 'request_contact',
			};

			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should validate a valid location request button', () => {
			const button: IButtonConfig = {
				text: 'Share location',
				type: 'request_geo_location',
			};

			expect(() => validateKeyboardButton(button)).not.toThrow();
		});

		it('should throw error for empty button text', () => {
			const button: IButtonConfig = {
				text: '',
				type: 'callback',
				payload: 'test',
			};

			expect(() => validateKeyboardButton(button)).toThrow('Button text cannot be empty');
		});

		it('should throw error for missing button text', () => {
			const button: any = {
				type: 'callback',
				payload: 'test',
			};

			expect(() => validateKeyboardButton(button)).toThrow('Button text is required and must be a string');
		});

		it('should throw error for button text exceeding max length', () => {
			const button: IButtonConfig = {
				text: 'a'.repeat(65), // 65 characters, max is 64
				type: 'callback',
				payload: 'test',
			};

			expect(() => validateKeyboardButton(button)).toThrow('Button text cannot exceed 64 characters');
		});

		it('should throw error for invalid button type', () => {
			const button: any = {
				text: 'Test',
				type: 'invalid_type',
			};

			expect(() => validateKeyboardButton(button)).toThrow('Invalid button type: invalid_type');
		});

		it('should throw error for callback button without payload', () => {
			const button: IButtonConfig = {
				text: 'Test',
				type: 'callback',
			};

			expect(() => validateKeyboardButton(button)).toThrow('Callback buttons must have a payload string');
		});

		it('should throw error for callback payload exceeding max length', () => {
			const button: IButtonConfig = {
				text: 'Test',
				type: 'callback',
				payload: 'a'.repeat(65), // 65 characters, max is 64
			};

			expect(() => validateKeyboardButton(button)).toThrow('Callback payload cannot exceed 64 characters');
		});

		it('should throw error for link button without URL', () => {
			const button: IButtonConfig = {
				text: 'Test',
				type: 'link',
			};

			expect(() => validateKeyboardButton(button)).toThrow('Link buttons must have a URL string');
		});

		it('should throw error for invalid URL format', () => {
			const button: IButtonConfig = {
				text: 'Test',
				type: 'link',
				url: 'not-a-valid-url',
			};

			expect(() => validateKeyboardButton(button)).toThrow('Invalid URL format: not-a-valid-url');
		});

		it('should throw error for URL exceeding max length', () => {
			const button: IButtonConfig = {
				text: 'Test',
				type: 'link',
				url: 'https://example.com/' + 'a'.repeat(2048), // Exceeds 2048 character limit
			};

			expect(() => validateKeyboardButton(button)).toThrow('Button URL cannot exceed 2048 characters');
		});

		it('should throw error for invalid intent', () => {
			const button: any = {
				text: 'Test',
				type: 'callback',
				payload: 'test',
				intent: 'invalid_intent',
			};

			expect(() => validateKeyboardButton(button)).toThrow('Invalid button intent: invalid_intent');
		});

		it('should accept valid intents', () => {
			const intents = ['default', 'positive', 'negative'];
			
			intents.forEach(intent => {
				const button: IButtonConfig = {
					text: 'Test',
					type: 'callback',
					payload: 'test',
					intent: intent as any,
				};

				expect(() => validateKeyboardButton(button)).not.toThrow();
			});
		});
	});

	describe('validateKeyboardLayout', () => {
		it('should validate a simple keyboard layout', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: 'Button 1', type: 'callback', payload: 'btn1' },
					{ text: 'Button 2', type: 'callback', payload: 'btn2' },
				],
			];

			expect(() => validateKeyboardLayout(buttons)).not.toThrow();
		});

		it('should validate a multi-row keyboard layout', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: 'Button 1', type: 'callback', payload: 'btn1' },
					{ text: 'Button 2', type: 'callback', payload: 'btn2' },
				],
				[
					{ text: 'Link', type: 'link', url: 'https://example.com' },
				],
				[
					{ text: 'Contact', type: 'request_contact' },
					{ text: 'Location', type: 'request_geo_location' },
				],
			];

			expect(() => validateKeyboardLayout(buttons)).not.toThrow();
		});

		it('should throw error for empty keyboard', () => {
			const buttons: IButtonConfig[][] = [];

			expect(() => validateKeyboardLayout(buttons)).toThrow('Keyboard must have at least one row of buttons');
		});

		it('should throw error for empty row', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: 'Button 1', type: 'callback', payload: 'btn1' },
				],
				[], // Empty row
			];

			expect(() => validateKeyboardLayout(buttons)).toThrow('Row 2 cannot be empty');
		});

		it('should throw error for too many buttons per row', () => {
			const buttons: IButtonConfig[][] = [
				Array(9).fill(0).map((_, i) => ({ // 9 buttons, max is 8
					text: `Button ${i + 1}`,
					type: 'callback' as const,
					payload: `btn${i + 1}`,
				})),
			];

			expect(() => validateKeyboardLayout(buttons)).toThrow('Row 1 cannot have more than 8 buttons');
		});

		it('should throw error for too many rows', () => {
			const buttons: IButtonConfig[][] = Array(101).fill(0).map((_, i) => [ // 101 rows, max is 100
				{ text: `Button ${i + 1}`, type: 'callback' as const, payload: `btn${i + 1}` },
			]);

			expect(() => validateKeyboardLayout(buttons)).toThrow('Keyboard cannot have more than 100 rows');
		});

		it('should throw error for too many total buttons', () => {
			// Create 101 buttons across multiple rows (max is 100)
			const buttons: IButtonConfig[][] = [];
			for (let i = 0; i < 13; i++) { // 13 rows of 8 buttons = 104 buttons
				buttons.push(
					Array(8).fill(0).map((_, j) => ({
						text: `Button ${i * 8 + j + 1}`,
						type: 'callback' as const,
						payload: `btn${i * 8 + j + 1}`,
					}))
				);
			}

			expect(() => validateKeyboardLayout(buttons)).toThrow('Keyboard cannot have more than 100 buttons total');
		});

		it('should provide specific error location for invalid buttons', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: 'Valid Button', type: 'callback', payload: 'valid' },
					{ text: '', type: 'callback', payload: 'invalid' }, // Invalid button
				],
			];

			expect(() => validateKeyboardLayout(buttons)).toThrow('Row 1, Button 2: Button text cannot be empty');
		});
	});

	describe('formatInlineKeyboard', () => {
		it('should format a simple keyboard correctly', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: 'Button 1', type: 'callback', payload: 'btn1' },
					{ text: 'Button 2', type: 'callback', payload: 'btn2' },
				],
			];

			const result = formatInlineKeyboard(buttons);

			expect(result).toEqual({
				type: 'inline_keyboard',
				payload: {
					buttons: [
						[
							{ text: 'Button 1', type: 'callback', payload: 'btn1' },
							{ text: 'Button 2', type: 'callback', payload: 'btn2' },
						],
					],
				},
			});
		});

		it('should format different button types correctly', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: 'Callback', type: 'callback', payload: 'cb_data' },
					{ text: 'Link', type: 'link', url: 'https://example.com' },
				],
				[
					{ text: 'Contact', type: 'request_contact' },
					{ text: 'Location', type: 'request_geo_location' },
				],
			];

			const result = formatInlineKeyboard(buttons);

			expect(result).toEqual({
				type: 'inline_keyboard',
				payload: {
					buttons: [
						[
							{ text: 'Callback', type: 'callback', payload: 'cb_data' },
							{ text: 'Link', type: 'link', url: 'https://example.com' },
						],
						[
							{ text: 'Contact', type: 'request_contact' },
							{ text: 'Location', type: 'request_geo_location' },
						],
					],
				},
			});
		});

		it('should include intent when specified and not default', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: 'Default', type: 'callback', payload: 'default', intent: 'default' },
					{ text: 'Positive', type: 'callback', payload: 'positive', intent: 'positive' },
					{ text: 'Negative', type: 'callback', payload: 'negative', intent: 'negative' },
				],
			];

			const result = formatInlineKeyboard(buttons);

			expect(result.payload.buttons[0]).toEqual([
				{ text: 'Default', type: 'callback', payload: 'default' }, // No intent for default
				{ text: 'Positive', type: 'callback', payload: 'positive', intent: 'positive' },
				{ text: 'Negative', type: 'callback', payload: 'negative', intent: 'negative' },
			]);
		});

		it('should trim button text', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: '  Trimmed  ', type: 'callback', payload: 'trimmed' },
				],
			];

			const result = formatInlineKeyboard(buttons);

			expect(result.payload.buttons?.[0]?.[0]?.text).toBe('Trimmed');
		});
	});

	describe('createInlineKeyboardAttachment', () => {
		it('should create a valid attachment structure', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: 'Button 1', type: 'callback', payload: 'btn1' },
				],
			];

			const result = createInlineKeyboardAttachment(buttons);

			expect(result).toEqual({
				type: 'inline_keyboard',
				payload: {
					buttons: [
						[
							{ text: 'Button 1', type: 'callback', payload: 'btn1' },
						],
					],
				},
			});
		});

		it('should validate buttons before creating attachment', () => {
			const buttons: IButtonConfig[][] = [
				[
					{ text: '', type: 'callback', payload: 'invalid' }, // Invalid button
				],
			];

			expect(() => createInlineKeyboardAttachment(buttons)).toThrow('Button text cannot be empty');
		});
	});
});