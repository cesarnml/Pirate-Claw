<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import type { SubmitFunction } from '@sveltejs/kit';
	import SelectablePillGroup from './SelectablePillGroup.svelte';
	import SegmentedChoice from './SegmentedChoice.svelte';

	interface Props {
		movieYears: number[];
		movieYearInput: string;
		movieResolutions: string[];
		movieCodecs: string[];
		movieCodecPolicy: 'prefer' | 'require';
		allResolutions: string[];
		allCodecs: string[];
		canWrite: boolean;
		currentEtag: string | null;
		writeDisabledTooltip: string;
		enhanceSaveMovies: SubmitFunction;
		setMoviesFormEl: (element: HTMLFormElement | null) => void;
		setMoviesSubmitButtonEl: (element: HTMLButtonElement | null) => void;
		onRemoveMovieYear: (year: number) => void;
		onMovieYearInputChange: (value: string) => void;
		onAddMovieYear: () => void;
		onToggleMovieResolution: (value: string) => void;
		onToggleMovieCodec: (value: string) => void;
		onMovieCodecPolicyChange: (value: 'prefer' | 'require') => void;
	}

	const {
		movieYears,
		movieYearInput,
		movieResolutions,
		movieCodecs,
		movieCodecPolicy,
		allResolutions,
		allCodecs,
		canWrite,
		currentEtag,
		writeDisabledTooltip,
		enhanceSaveMovies,
		setMoviesFormEl,
		setMoviesSubmitButtonEl,
		onRemoveMovieYear,
		onMovieYearInputChange,
		onAddMovieYear,
		onToggleMovieResolution,
		onToggleMovieCodec,
		onMovieCodecPolicyChange
	}: Props = $props();

	let formEl = $state<HTMLFormElement | null>(null);
	let submitButtonEl = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		setMoviesFormEl(formEl);
	});

	$effect(() => {
		setMoviesSubmitButtonEl(submitButtonEl);
	});
</script>

<Card id="movie-policy" class="bg-card/75 rounded-[30px] border-white/10">
	<CardHeader class="space-y-4">
		<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
			04 · Movie Acquisition Policies
		</p>
		<h2 class="text-2xl font-semibold tracking-[-0.03em]">Movie Policy</h2>
	</CardHeader>
	<CardContent>
		<form
			bind:this={formEl}
			method="POST"
			action="?/saveMovies"
			class="space-y-5"
			use:enhance={enhanceSaveMovies}
		>
			<input type="hidden" name="moviesIfMatch" value={currentEtag ?? ''} />
			{#each movieYears as year}
				<input type="hidden" name="movieYear" value={year} />
			{/each}
			{#each movieResolutions as resolution}
				<input type="hidden" name="movieResolution" value={resolution} />
			{/each}
			{#each movieCodecs as codec}
				<input type="hidden" name="movieCodec" value={codec} />
			{/each}
			<input type="hidden" name="movieCodecPolicy" value={movieCodecPolicy} />

			<div class="space-y-2">
				<p class="text-muted-foreground text-sm font-medium">Release year range</p>
				<div class="flex flex-wrap gap-2">
					{#each movieYears as year}
						<span
							class="border-border bg-background/50 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
						>
							{year}
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground disabled:opacity-50"
								disabled={!canWrite}
								title={!canWrite ? writeDisabledTooltip : undefined}
								aria-label={`Remove year ${year}`}
								onclick={() => onRemoveMovieYear(year)}
							>
								×
							</button>
						</span>
					{/each}
				</div>
				<div class="flex flex-wrap gap-2" title={!canWrite ? writeDisabledTooltip : undefined}>
					<input
						type="number"
						min="1900"
						max="2100"
						step="1"
						placeholder="e.g. 2025"
						value={movieYearInput}
						disabled={!canWrite}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-36 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
						oninput={(event) => onMovieYearInputChange(event.currentTarget.value)}
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								onAddMovieYear();
							}
						}}
					/>
					<Button
						type="button"
						variant="outline"
						class="rounded-full px-5"
						disabled={!canWrite}
						onclick={onAddMovieYear}
					>
						Add year
					</Button>
				</div>
			</div>

			<div class="space-y-4">
				<p class="text-muted-foreground text-sm font-medium">Required specs</p>
				<SelectablePillGroup
					label="Target resolutions"
					options={allResolutions}
					selected={movieResolutions}
					disabled={!canWrite}
					title={!canWrite ? writeDisabledTooltip : undefined}
					onToggle={onToggleMovieResolution}
				/>
				<SelectablePillGroup
					label="Preferred codecs"
					options={allCodecs}
					selected={movieCodecs}
					disabled={!canWrite}
					title={!canWrite ? writeDisabledTooltip : undefined}
					onToggle={onToggleMovieCodec}
				/>
			</div>

			<SegmentedChoice
				label="Constraint level"
				options={['prefer', 'require']}
				value={movieCodecPolicy}
				disabled={!canWrite}
				title={!canWrite ? writeDisabledTooltip : undefined}
				onChange={(value) => onMovieCodecPolicyChange(value as 'prefer' | 'require')}
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
