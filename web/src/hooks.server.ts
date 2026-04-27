import { readFileSync } from 'fs';

export function init() {
	if (process.env.PIRATE_CLAW_API_WRITE_TOKEN) return;

	const tokenFile = process.env.PIRATE_CLAW_DAEMON_TOKEN_FILE;
	if (!tokenFile) return;

	try {
		const token = readFileSync(tokenFile, 'utf8').trim();
		if (token) {
			process.env.PIRATE_CLAW_API_WRITE_TOKEN = token;
		}
	} catch {
		// file not yet written; PIRATE_CLAW_API_WRITE_TOKEN stays unset
	}
}
