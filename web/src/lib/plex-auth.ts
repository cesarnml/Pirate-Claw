export function sanitizePlexReturnTo(input: string | null | undefined): string {
	if (typeof input !== 'string') {
		return '/config';
	}

	if (!input.startsWith('/') || input.startsWith('//') || input.startsWith('/\\')) {
		return '/config';
	}

	return input;
}
