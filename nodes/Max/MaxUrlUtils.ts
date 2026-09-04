import { URL, domainToASCII } from 'node:url';

export const MAX_API_BASE_URL = 'https://platform-api2.max.ru';
const LEGACY_MAX_API_HOST = 'platform-api.max.ru';
const CURRENT_MAX_API_HOST = 'platform-api2.max.ru';

/**
 * Uses the current official host while preserving explicitly configured custom endpoints.
 * Stored credentials that still contain the former MAX host are migrated transparently.
 */
export function normalizeMaxBaseUrl(value: unknown): string {
	const rawValue = typeof value === 'string' ? value.trim() : '';
	if (rawValue.length === 0) {
		return MAX_API_BASE_URL;
	}

	try {
		const parsed = new URL(rawValue);
		if (parsed.hostname === LEGACY_MAX_API_HOST) {
			parsed.hostname = CURRENT_MAX_API_HOST;
		}
		return parsed.toString().replace(/\/+$/, '');
	} catch {
		return rawValue.replace(/\/+$/, '');
	}
}

/** Converts an IDN webhook hostname to its ASCII/Punycode form for MAX TLS validation. */
export function normalizeMaxWebhookUrl(value: unknown): string {
	const rawValue = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
	if (rawValue.length === 0) {
		return rawValue;
	}

	try {
		const parsed = new URL(rawValue);
		parsed.hostname = domainToASCII(parsed.hostname);
		return parsed.toString();
	} catch {
		return rawValue;
	}
}
