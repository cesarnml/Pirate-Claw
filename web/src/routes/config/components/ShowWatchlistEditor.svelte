<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import XIcon from '@lucide/svelte/icons/x';

	interface Props {
		showRows: string[];
		showStrict: boolean[];
		canWrite: boolean;
		currentEtag: string | null;
		showsMessage?: string;
		writeDisabledTooltip: string;
		enhanceSaveShows: SubmitFunction;
		setShowsFormEl: (element: HTMLFormElement | null) => void;
		setShowsSubmitButtonEl: (element: HTMLButtonElement | null) => void;
		onUpdateShowName: (index: number, value: string) => void;
		onHandleShowEnter: (index: number) => void;
		onRemoveShow: (index: number) => void;
		onToggleShowStrict: (index: number) => void;
	}

	const {
		showRows,
		showStrict,
		canWrite,
		currentEtag,
		showsMessage,
		writeDisabledTooltip,
		enhanceSaveShows,
		setShowsFormEl,
		setShowsSubmitButtonEl,
		onUpdateShowName,
		onHandleShowEnter,
		onRemoveShow,
		onToggleShowStrict
	}: Props = $props();

	let showsFormEl = $state<HTMLFormElement | null>(null);
	let showsSubmitButtonEl = $state<HTMLButtonElement | null>(null);
	let focusedShowIndex = $state<number | null>(null);

	$effect(() => {
		setShowsFormEl(showsFormEl);
	});

	$effect(() => {
		setShowsSubmitButtonEl(showsSubmitButtonEl);
	});
</script>

<form
	bind:this={showsFormEl}
	method="POST"
	action="?/saveShows"
	class="space-y-4 border-t border-white/8 pt-5"
	use:enhance={enhanceSaveShows}
>
	<input type="hidden" name="ifMatch" value={currentEtag ?? ''} />

	<div class="space-y-2">
		<p class="text-muted-foreground text-sm font-medium">Active watchlist</p>
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
			{#if showRows.length === 0}
				<p class="text-muted-foreground text-sm">No tracked shows configured yet.</p>
			{:else}
				{#each showRows as name, index}
					<div
						class={`border-border focus-within:border-primary/70 focus-within:ring-primary/30 relative flex w-full items-center gap-3 rounded-full px-4 transition-[border-color,box-shadow,background-color] focus-within:ring-2 ${
							focusedShowIndex === index ? 'bg-transparent' : 'bg-background/50'
						}`}
						data-focused={focusedShowIndex === index ? 'true' : 'false'}
					>
						<input
							name="showName"
							type="text"
							value={name}
							autocomplete="off"
							aria-label={`TV show ${index + 1}`}
							disabled={!canWrite}
							title={!canWrite ? writeDisabledTooltip : undefined}
							class="min-w-0 flex-1 bg-transparent py-2 text-sm text-ellipsis whitespace-nowrap outline-none disabled:opacity-50"
							oninput={(event) => onUpdateShowName(index, event.currentTarget.value)}
							onfocus={() => {
								focusedShowIndex = index;
							}}
							onblur={() => {
								if (focusedShowIndex === index) focusedShowIndex = null;
							}}
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									onHandleShowEnter(index);
								}
							}}
						/>
						<input type="hidden" name="showStrict" value={showStrict[index] ? 'true' : 'false'} />
						<button
							type="button"
							class={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase transition-colors disabled:opacity-50 ${
								showStrict[index]
									? 'border-primary/60 bg-primary/15 text-primary'
									: 'border-border text-muted-foreground hover:border-primary/60 hover:text-primary'
							}`}
							disabled={!canWrite}
							title={!canWrite
								? writeDisabledTooltip
								: showStrict[index]
									? 'Strict: only exact-title RSS matches are tracked. Click to allow loose matches again.'
									: 'Loose: RSS releases whose title starts with this one also match (e.g. a sequel or spin-off). Click for an exact-title-only match.'}
							onclick={() => onToggleShowStrict(index)}
						>
							Strict
						</button>
						<button
							type="button"
							class={`border-border text-muted-foreground hover:border-primary/60 hover:text-primary hover:bg-muted inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-xs transition-[opacity,color,border-color,background-color] disabled:opacity-50 ${
								focusedShowIndex === index ? 'pointer-events-none opacity-0' : 'opacity-100'
							}`}
							disabled={!canWrite || showRows.length <= 1}
							title={!canWrite ? writeDisabledTooltip : undefined}
							aria-label="Remove show"
							onclick={() => onRemoveShow(index)}
						>
							<XIcon class="size-3.5" />
						</button>
					</div>
				{/each}
			{/if}
		</div>
	</div>
	<button
		bind:this={showsSubmitButtonEl}
		type="submit"
		class="hidden"
		tabindex="-1"
		aria-hidden="true"
	></button>

	{#if showsMessage}
		<p class="text-destructive text-xs">{showsMessage}</p>
	{/if}
</form>
