/**
 * Build a POST `Request` carrying URL-encoded form data for action tests.
 *
 * The body is serialized to a string rather than passed as the `URLSearchParams`
 * instance directly. Bun's native `Request` constructor validates the body with
 * an `instanceof URLSearchParams` check against its own realm's class, but under
 * the jsdom test environment the global `URLSearchParams` is jsdom's class. On
 * Linux CI (Bun 1.3.14) those identities diverge and `Request` rejects the body
 * with "Expected init.body to be an instance of URLSearchParams". Serializing to
 * a string sidesteps the check and parses identically via `request.formData()`.
 */
export function formPostRequest(url: string, body: URLSearchParams): Request {
	return new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: body.toString()
	});
}
