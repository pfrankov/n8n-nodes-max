import { parseMaxJsonLosslessly } from '../MaxJsonUtils';

describe('parseMaxJsonLosslessly', () => {
	it('preserves unsafe integer literals as strings without changing safe JSON values', () => {
		const parsed = parseMaxJsonLosslessly(
			'{"safe":9007199254740991,"unsafe":9007199254740992,"negative":-9223372036854775808,"decimal":9007199254740992.5,"exponent":9.007199254740992e15,"text":"9007199254740992","nested":{"chat_id":9223372036854775807},"ids":[1,9007199254740993]}',
		);

		expect(parsed).toEqual({
			safe: 9007199254740991,
			unsafe: '9007199254740992',
			negative: '-9223372036854775808',
			decimal: 9007199254740992.5,
			exponent: 9.007199254740992e15,
			text: '9007199254740992',
			nested: { chat_id: '9223372036854775807' },
			ids: ['1', '9007199254740993'],
		});
	});

	it('normalizes numeric identifier fields and ID arrays to strings regardless of magnitude', () => {
		const parsed = parseMaxJsonLosslessly(
			'{"id":5,"user_id":42,"owner_id":-7,"callback_id":"callback-1","user_ids":[1,9007199254740993],"failed_user_ids":[0,2],"nested":[{"photo_id":12}],"seq":8,"safe":9}',
		);

		expect(parsed).toEqual({
			id: '5',
			user_id: '42',
			owner_id: '-7',
			callback_id: 'callback-1',
			user_ids: ['1', '9007199254740993'],
			failed_user_ids: ['0', '2'],
			nested: [{ photo_id: '12' }],
			seq: 8,
			safe: 9,
		});
	});

	it('does not interpret number-like content inside escaped strings', () => {
		const parsed = parseMaxJsonLosslessly(
			'{"message":"value \\\"9223372036854775807\\\" and \\\\9007199254740992","id":9007199254740993}',
		);

		expect(parsed).toEqual({
			message: 'value "9223372036854775807" and \\9007199254740992',
			id: '9007199254740993',
		});
	});
});
