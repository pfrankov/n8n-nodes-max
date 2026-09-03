const MAX_SAFE_INTEGER_ABSOLUTE = String(Number.MAX_SAFE_INTEGER);

function isDigit(value: string | undefined): boolean {
	return value !== undefined && value >= '0' && value <= '9';
}

function isUnsafeIntegerLiteral(value: string): boolean {
	const digits = value.startsWith('-') ? value.slice(1) : value;
	const normalized = digits.replace(/^0+(?=\d)/, '');

	return (
		normalized.length > MAX_SAFE_INTEGER_ABSOLUTE.length ||
		(normalized.length === MAX_SAFE_INTEGER_ABSOLUTE.length &&
			normalized > MAX_SAFE_INTEGER_ABSOLUTE)
	);
}

function readJsonNumber(
	source: string,
	start: number,
): { end: number; integer: boolean } | undefined {
	let cursor = start;
	if (source[cursor] === '-') {
		cursor += 1;
	}

	if (!isDigit(source[cursor])) {
		return undefined;
	}

	if (source[cursor] === '0') {
		cursor += 1;
	} else {
		while (isDigit(source[cursor])) {
			cursor += 1;
		}
	}

	let integer = true;
	if (source[cursor] === '.') {
		integer = false;
		cursor += 1;
		while (isDigit(source[cursor])) {
			cursor += 1;
		}
	}

	if (source[cursor] === 'e' || source[cursor] === 'E') {
		integer = false;
		cursor += 1;
		if (source[cursor] === '+' || source[cursor] === '-') {
			cursor += 1;
		}
		while (isDigit(source[cursor])) {
			cursor += 1;
		}
	}

	return { end: cursor, integer };
}

function isIdentifierFieldName(key: string): boolean {
	return key === 'id' || key.endsWith('_id');
}

function isIdentifierArrayFieldName(key: string): boolean {
	return key === 'ids' || key.endsWith('_ids');
}

function normalizeIntegerIdentifier(value: unknown): unknown {
	return typeof value === 'number' && Number.isInteger(value) ? String(value) : value;
}

function normalizeIdentifierFields(key: string, value: unknown): unknown {
	if (isIdentifierFieldName(key)) {
		return normalizeIntegerIdentifier(value);
	}

	if (isIdentifierArrayFieldName(key) && Array.isArray(value)) {
		return value.map((item) => normalizeIntegerIdentifier(item));
	}

	return value;
}

/**
 * Parses MAX JSON without rounding integer literals beyond JavaScript's safe range.
 * Unsafe integers become decimal strings before parsing. Identifier fields and ID arrays
 * are normalized to strings regardless of magnitude; unrelated JSON values keep native types.
 */
export function parseMaxJsonLosslessly(source: string): unknown {
	let transformed = '';
	let cursor = 0;
	let inString = false;
	let escaped = false;

	while (cursor < source.length) {
		const character = source[cursor];
		if (character === undefined) {
			break;
		}

		if (inString) {
			transformed += character;
			if (escaped) {
				escaped = false;
			} else if (character === '\\') {
				escaped = true;
			} else if (character === '"') {
				inString = false;
			}
			cursor += 1;
			continue;
		}

		if (character === '"') {
			inString = true;
			transformed += character;
			cursor += 1;
			continue;
		}

		if (character === '-' || isDigit(character)) {
			const number = readJsonNumber(source, cursor);
			if (number) {
				const literal = source.slice(cursor, number.end);
				transformed +=
					number.integer && isUnsafeIntegerLiteral(literal) ? JSON.stringify(literal) : literal;
				cursor = number.end;
				continue;
			}
		}

		transformed += character;
		cursor += 1;
	}

	return JSON.parse(transformed, (key, value: unknown) =>
		normalizeIdentifierFields(key, value),
	) as unknown;
}
