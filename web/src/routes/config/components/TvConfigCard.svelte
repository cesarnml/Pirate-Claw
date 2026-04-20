<script lang="ts">
	import { enhance } from '$app/forms';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import type { SubmitFunction } from '@sveltejs/kit';
	import SelectablePillGroup from './SelectablePillGroup.svelte';

	interface Props {
		resolutions: string[];
		codecs: string[];
		allResolutions: string[];
		allCodecs: string[];
		canWrite: boolean;
		currentEtag: string | null;
		writeDisabledTooltip: string;
		enhanceSaveTvDefaults: SubmitFunction;
		setTvFormEl: (element: HTMLFormElement | null) => void;
		setTvSubmitButtonEl: (element: HTMLButtonElement | null) => void;
		onToggleResolution: (value: string) => void;
		onToggleCodec: (value: string) => void;
	}

	const {
		resolutions,
		codecs,
		allResolutions,
		allCodecs,
		canWrite,
		currentEtag,
		writeDisabledTooltip,
		enhanceSaveTvDefaults,
		setTvFormEl,
		setTvSubmitButtonEl,
		onToggleResolution,
		onToggleCodec
	}: Props = $props();

	let formEl = $state<HTMLFormElement | null>(null);
	let submitButtonEl = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		setTvFormEl(formEl);
	});

	$effect(() => {
		setTvSubmitButtonEl(submitButtonEl);
	});
</script>

<Card class="bg-card/75 rounded-[30px] border-white/10">
	<CardHeader class="space-y-4">
		<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
			03 · TV Serial Parameters
		</p>
		<h2 class="text-2xl font-semibold tracking-[-0.03em]">TV Configuration</h2>
	</CardHeader>
	<CardContent class="space-y-6">
		<form
			bind:this={formEl}
			method="POST"
			action="?/saveTvDefaults"
			class="space-y-4"
			use:enhance={enhanceSaveTvDefaults}
		>
			<input type="hidden" name="tvDefaultsIfMatch" value={currentEtag ?? ''} />
			{#each resolutions as resolution}
				<input type="hidden" name="tvResolution" value={resolution} />
			{/each}
			{#each codecs as codec}
				<input type="hidden" name="tvCodec" value={codec} />
			{/each}

			<SelectablePillGroup
				label="Target resolutions"
				options={allResolutions}
				selected={resolutions}
				disabled={!canWrite}
				title={!canWrite ? writeDisabledTooltip : undefined}
				onToggle={onToggleResolution}
			/>

			<SelectablePillGroup
				label="Preferred codecs"
				options={allCodecs}
				selected={codecs}
				disabled={!canWrite}
				title={!canWrite ? writeDisabledTooltip : undefined}
				onToggle={onToggleCodec}
			/>
			<button
				bind:this={submitButtonEl}
				type="submit"
				class="hidden"
				tabindex="-1"
				aria-hidden="true"
			>
			</button>
		</form>
	</CardContent>
</Card>
