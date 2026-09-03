import { describe, expect, it } from 'vitest';
import { isStrictRule, strictMatchPatternFor } from '$lib/tv-strict-match';

describe('strictMatchPatternFor', () => {
	// Case is preserved in the generated string, same as deriveMatchPattern in
	// src/tv-match.ts — case-insensitivity comes from the 'i' flag callers
	// apply at match time (buildRulePattern), not from lowercasing here.
	it('anchors both ends for a multi-word name (the Tomb Raider King regression)', () => {
		expect(strictMatchPatternFor('Tomb raider')).toBe('^Tomb +raider$');
		expect(new RegExp(strictMatchPatternFor('Tomb raider'), 'i').test('Tomb raider')).toBe(true);
		expect(new RegExp(strictMatchPatternFor('Tomb raider'), 'i').test('Tomb Raider King')).toBe(
			false
		);
	});

	it('anchors a single-word name the same way loose matching already does', () => {
		expect(strictMatchPatternFor('Andor')).toBe('^Andor$');
	});

	it('strips bracket/paren symbols to whitespace, same as loose matching', () => {
		expect(strictMatchPatternFor('Star Wars (2077)')).toBe('^Star +Wars +2077$');
	});

	it('escapes a literal regex-special character in the name', () => {
		expect(strictMatchPatternFor('Show $ Money')).toBe('^Show +\\$ +Money$');
	});

	it('returns ^$ for an empty/whitespace-only name', () => {
		expect(strictMatchPatternFor('   ')).toBe('^$');
	});
});

describe('isStrictRule', () => {
	it('is true when matchPattern equals the generated strict pattern for name', () => {
		expect(isStrictRule({ name: 'Tomb raider', matchPattern: '^Tomb +raider$' })).toBe(true);
	});

	it('is false when matchPattern is unset', () => {
		expect(isStrictRule({ name: 'Tomb raider' })).toBe(false);
	});

	it('is false for a hand-authored matchPattern that does not match the generated one', () => {
		expect(isStrictRule({ name: 'Tomb raider', matchPattern: 'tomb.*raider' })).toBe(false);
	});
});
