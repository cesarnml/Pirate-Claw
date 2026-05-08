type LogLevel = 'debug' | 'info' | 'warn' | 'silent';

const LOG_PRIORITY: Record<Exclude<LogLevel, 'silent'>, number> = {
	debug: 10,
	info: 20,
	warn: 30
};

function currentLogLevel(): LogLevel {
	const level = process.env.PIRATE_CLAW_LOG_LEVEL;
	if (level === 'debug' || level === 'info' || level === 'warn' || level === 'silent') {
		return level;
	}
	return 'info';
}

export function log(level: Exclude<LogLevel, 'silent'>, data: Record<string, unknown>): void {
	const current = currentLogLevel();
	if (current === 'silent') return;
	if (LOG_PRIORITY[level] < LOG_PRIORITY[current]) return;

	if (level === 'warn') {
		console.warn(data);
		return;
	}

	console.log(data);
}
