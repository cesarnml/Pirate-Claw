import type { AppConfig, OnboardingStatus } from '$lib/types';

export const ONBOARDING_DISMISSED_KEY = 'pirate-claw:onboarding-dismissed';
export const ONBOARDING_PATH_KEY = 'pirate-claw:onboarding-path';
let onboardingDismissedFallback = false;
let onboardingPathFallback: 'tv' | 'movie' | 'both' = 'tv';

export function deriveOnboardingStatus(config: AppConfig, canWrite: boolean): OnboardingStatus {
	const hasFeeds = config.feeds.length > 0;
	const hasTvTargets = config.tv.length > 0;
	const hasMovieTargets = config.movies.years.length > 0;
	const minimumComplete = hasFeeds && (hasTvTargets || hasMovieTargets);

	if (minimumComplete) {
		return {
			state: 'ready',
			hasFeeds,
			hasTvTargets,
			hasMovieTargets,
			minimumComplete
		};
	}

	if (!canWrite) {
		return {
			state: 'writes_disabled',
			hasFeeds,
			hasTvTargets,
			hasMovieTargets,
			minimumComplete
		};
	}

	if (!hasFeeds && !hasTvTargets && !hasMovieTargets) {
		return {
			state: 'initial_empty',
			hasFeeds,
			hasTvTargets,
			hasMovieTargets,
			minimumComplete
		};
	}

	return {
		state: 'partial_setup',
		hasFeeds,
		hasTvTargets,
		hasMovieTargets,
		minimumComplete
	};
}

function getStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
	const storage = globalThis.localStorage;
	if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
		return storage;
	}
	return null;
}

export function readOnboardingDismissed(): boolean {
	const storage = getStorage();
	if (!storage) return onboardingDismissedFallback;
	return storage.getItem(ONBOARDING_DISMISSED_KEY) === 'true';
}

export function writeOnboardingDismissed(value: boolean): void {
	onboardingDismissedFallback = value;
	const storage = getStorage();
	if (!storage) return;
	storage.setItem(ONBOARDING_DISMISSED_KEY, value ? 'true' : 'false');
}

export function readOnboardingPath(): 'tv' | 'movie' | 'both' {
	const storage = getStorage();
	const raw = storage ? storage.getItem(ONBOARDING_PATH_KEY) : onboardingPathFallback;
	if (raw === 'movie' || raw === 'both') return raw;
	return 'tv';
}

export function writeOnboardingPath(value: 'tv' | 'movie' | 'both'): void {
	onboardingPathFallback = value;
	const storage = getStorage();
	if (!storage) return;
	storage.setItem(ONBOARDING_PATH_KEY, value);
}
