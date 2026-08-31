/** Reads a newline-delimited-JSON streaming Response body, calling
 * `onEvent` for each parsed line as it arrives. Shared by every bulk-action
 * progress UI (shows bulk Plex refresh, Config's Plex TV/Movie sync,
 * movie-calendar's Top Movies rescan) — extracted 2026-08-31 so the
 * stream-reading/line-buffering mechanics live in one place instead of
 * being copy-pasted per feature. Deliberately generic over the event shape:
 * each feature has its own progress event fields (title, counts, etc), so
 * this only owns the wire-format parsing, not the UI state it drives. */
export async function readNdjsonStream<Event>(
	response: Response,
	onEvent: (event: Event) => void
): Promise<void> {
	if (!response.body) throw new Error('Response has no body to stream.');

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.trim()) continue;
			onEvent(JSON.parse(line) as Event);
		}
	}
}
