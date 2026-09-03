import type { IWebhookFunctions } from 'n8n-workflow';
import { MaxEventProcessor } from '../MaxEventProcessor';
import { MaxTrigger } from '../MaxTrigger.node';

jest.mock('../MaxEventProcessor');

describe('Max Trigger int64 handling', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('reparses the retained raw webhook body without rounding int64 identifiers', async () => {
		const request = {
			rawBody: Buffer.from(
				'{"update_type":"comment_removed","timestamp":1775026671403,"message_id":"mid.comment","post_id":"mid.post","chat_id":9223372036854775807,"user_id":9007199254740993}',
			),
			body: {
				chat_id: 9223372036854776000,
				user_id: 9007199254740992,
			},
		};
		const context = {
			getRequestObject: jest.fn().mockReturnValue(request),
		} as unknown as IWebhookFunctions;

		await new MaxTrigger().webhook.call(context);

		expect(request.body).toEqual({
			update_type: 'comment_removed',
			timestamp: 1775026671403,
			message_id: 'mid.comment',
			post_id: 'mid.post',
			chat_id: '9223372036854775807',
			user_id: '9007199254740993',
		});
		expect(MaxEventProcessor).toHaveBeenCalledTimes(1);
	});

	it('keeps the existing parsed body and fails softly when the retained raw body is malformed', async () => {
		const parsedBody = {
			update_type: 'message_created',
			timestamp: 1775026671403,
		};
		const request = {
			rawBody: Buffer.from('{not-valid-json'),
			body: parsedBody,
		};
		const context = {
			getRequestObject: jest.fn().mockReturnValue(request),
		} as unknown as IWebhookFunctions;

		await new MaxTrigger().webhook.call(context);

		expect(request.body).toBe(parsedBody);
		expect(MaxEventProcessor).toHaveBeenCalledTimes(1);
	});
});
