import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';

/** Applies an explicit TLS opt-out only to requests made with these MAX credentials. */
export function getMaxTlsOptions(
	credentials: IDataObject,
): Pick<IHttpRequestOptions, 'skipSslCertificateValidation'> {
	return credentials['ignoreSslIssues'] === true ? { skipSslCertificateValidation: true } : {};
}
