/**
 * Mirrors src/tv-match.ts's deriveMatchPattern tokenizing/escaping exactly,
 * but always anchors both ends of the pattern instead of only the front for
 * multi-word names. deriveMatchPattern's loose multi-word pattern (e.g.
 * "Tomb raider" -> `(?:^| )tomb +raider(?:$| )`) intentionally tolerates
 * trailing words — "Example Show" still matches a release titled "Example
 * Show UK" — but that same tolerance let "Tomb raider" absorb RSS releases
 * for the unrelated show "Tomb Raider King" (2026-09-02 incident: an
 * upcoming/unaired show's tracking got contaminated with a different show's
 * episodes). The "Strict" toggle on the Config page's show list opts a show
 * out of that tolerance by baking this anchored pattern into its
 * matchPattern — the backend already supports a per-show matchPattern
 * override (src/config.ts), this just gives the simple web UI a one-click
 * way to set one instead of requiring hand-written regex in config.json.
 */
export function strictMatchPatternFor(name: string): string {
	const normalizedName = name
		.trim()
		.replace(/[._-]+/g, ' ')
		.replace(/[()[\]{}]+/g, ' ')
		.replace(/\s+/g, ' ');
	const tokens = normalizedName
		.split(' ')
		.map((token) => escapeForRegex(token))
		.filter((token) => token.length > 0);

	if (tokens.length === 0) {
		return '^$';
	}

	return `^${tokens.join(' +')}$`;
}

/**
 * True when `rule.matchPattern` is exactly the strict pattern this module
 * would generate for `rule.name` right now — i.e. matching was made strict
 * via the toggle, not via some other hand-authored matchPattern override in
 * config.json. A hand-authored override reads as "not strict" here (the
 * checkbox shows unchecked), which is the safe default: toggling strict
 * off/on in the UI never clobbers a custom pattern the user didn't ask it
 * to touch, because the toggle is only ever wired to flip between "no
 * override" and "this exact generated pattern."
 */
export function isStrictRule(rule: { name: string; matchPattern?: string }): boolean {
	return rule.matchPattern !== undefined && rule.matchPattern === strictMatchPatternFor(rule.name);
}

function escapeForRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
