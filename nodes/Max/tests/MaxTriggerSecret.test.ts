import type { IDataObject, IWebhookFunctions } from 'n8n-workflow';
import { MaxTrigger } from '../MaxTrigger.node';

describe('Max Trigger webhook secret', () => {
	function createContext(additionalFields: IDataObject, headerSecret?: unknown) {
		const request = {
			rawBody: Buffer.from(
				'{"update_type":"message_created","timestamp":1775026671403,"message":{"sender":{"user_id":9007199254740993},"recipient":{"chat_id":123},"body":{"mid":"mid.test","text":"Hello"}}}',
			),
			body: {},
		};
		const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
		const context = {
			getNodeParameter: jest.fn((name: string) =>
				name === 'events' ? ['message_created'] : additionalFields,
			),
			getHeaderData: jest.fn(() => ({ 'x-max-bot-api-secret': headerSecret })),
			getRequestObject: jest.fn(() => request),
			getBodyData: jest.fn(() => request.body),
			getResponseObject: jest.fn(() => response),
			helpers: {
				returnJsonArray: jest.fn((data: IDataObject[]) => data.map((json) => ({ json }))),
			},
		};
		return { context, request, response };
	}

	it.each([
		['missing', undefined],
		['wrong with the same length', 'wrong_value'],
		['wrong with a different length', 'wrong'],
		['padded', ' correct_key '],
		['multiple values', ['correct_key', 'correct_key']],
		['joined multiple values', 'correct_key, correct_key'],
	])(
		'rejects a %s header before parsing or dispatching the event',
		async (_label, headerSecret) => {
			const { context, request, response } = createContext({ secret: 'correct_key' }, headerSecret);

			const result = await new MaxTrigger().webhook.call(context as unknown as IWebhookFunctions);

			expect(response.status).toHaveBeenCalledWith(403);
			expect(response.json).toHaveBeenCalledWith({ message: 'Invalid webhook secret' });
			expect(result).toEqual({ noWebhookResponse: true });
			expect(context.getRequestObject).not.toHaveBeenCalled();
			expect(context.getBodyData).not.toHaveBeenCalled();
			expect(context.helpers.returnJsonArray).not.toHaveBeenCalled();
			expect(request.body).toEqual({});
		},
	);

	it.each(['correct_key', '  correct_key  '])(
		'accepts a matching header and trims only the configured secret (%p)',
		async (secret) => {
			const { context, response } = createContext({ secret }, 'correct_key');

			const result = await new MaxTrigger().webhook.call(context as unknown as IWebhookFunctions);

			expect(response.status).not.toHaveBeenCalled();
			expect(result.workflowData).toHaveLength(1);
			expect(result.workflowData?.[0]?.[0]?.json['message']).toMatchObject({
				sender: { user_id: '9007199254740993' },
			});
		},
	);

	it.each([{}, { secret: '' }, { secret: '   ' }])(
		'preserves workflows without a configured secret (%p)',
		async (additionalFields) => {
			const { context, response } = createContext(additionalFields);

			const result = await new MaxTrigger().webhook.call(context as unknown as IWebhookFunctions);

			expect(result.workflowData).toHaveLength(1);
			expect(context.getHeaderData).not.toHaveBeenCalled();
			expect(response.status).not.toHaveBeenCalled();
		},
	);
});
