<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import type { OnboardingStatus } from '$lib/types';

	const {
		onboarding,
		showResumeCopy,
		showOnboardingLink,
		onboardingDismissed,
		onDismiss
	}: {
		onboarding: OnboardingStatus;
		showResumeCopy: boolean;
		showOnboardingLink: boolean;
		onboardingDismissed: boolean;
		onDismiss: () => void;
	} = $props();
</script>

<Alert class="border-primary/20 bg-primary/8">
	<AlertTitle>{showResumeCopy ? 'Resume onboarding' : 'Finish first-time setup'}</AlertTitle>
	<AlertDescription class="flex flex-wrap items-center gap-3">
		<span>
			{#if onboarding.state === 'writes_disabled'}
				Config writes are disabled, so guided setup is unavailable until write access is enabled.
			{:else if showResumeCopy}
				Continue the guided setup flow from where you left off, or keep configuring manually.
			{:else}
				Start onboarding to save your first feed and finish the rest of setup without editing JSON.
			{/if}
		</span>
		{#if showOnboardingLink}
			<a href="/onboarding" class="text-primary text-sm font-medium hover:underline">
				{showResumeCopy ? 'Resume onboarding' : 'Start onboarding'}
			</a>
		{:else}
			<a href="/config" class="text-primary text-sm font-medium hover:underline">Open config</a>
		{/if}
		{#if onboarding.state === 'initial_empty' && !onboardingDismissed}
			<button
				type="button"
				class="text-muted-foreground text-sm hover:underline"
				onclick={onDismiss}
			>
				Skip for now
			</button>
		{/if}
	</AlertDescription>
</Alert>
