<script lang="ts">
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { movieBackdropSrc } from '$lib/helpers';
	import type { MovieBreakdown } from '$lib/types';
	import ClapperboardIcon from '@lucide/svelte/icons/clapperboard';
	import StarIcon from '@lucide/svelte/icons/star';
	import MovieProgressBar from './MovieProgressBar.svelte';

	const props = $props();

	function displayTitle(movie: MovieBreakdown): string {
		return movie.tmdb?.title ?? movie.normalizedTitle;
	}

	function safeImageUrl(value: string | undefined): string | null {
		if (!value) return null;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' ? url.href : null;
		} catch {
			return null;
		}
	}

	function formatRating(value: number): string {
		return value.toFixed(1);
	}

	function formatLastWatched(value: string | null): string {
		if (!value) return 'No Plex activity';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'No Plex activity';
		return `Last watched ${date.toLocaleDateString()}`;
	}

	function formatDate(value: string | undefined): string {
		if (!value) return 'Queued date unknown';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Queued date unknown';
		return date.toLocaleDateString();
	}

	function hasPlexChip(movie: MovieBreakdown): boolean {
		return movie.plexStatus === 'in_library' || movie.plexStatus === 'missing';
	}

	const backdropUrl = $derived(movieBackdropSrc(props.movie.tmdb?.backdropUrl));
	const posterUrl = $derived(safeImageUrl(props.movie.tmdb?.posterUrl));
	const showProgress = $derived(
		props.status === 'downloading' || (props.status === 'paused' && props.pct > 0)
	);
</script>

<Card class="group bg-card/70 relative h-full overflow-hidden rounded-[30px] border-white/10">
	<div class="absolute inset-0">
		<img
			src={backdropUrl}
			alt=""
			class="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-[1.05]"
			loading="lazy"
		/>
		<div
			class="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.28),rgba(15,23,42,0.96)_52%,rgba(15,23,42,1))]"
		></div>
	</div>

	<CardContent class="relative flex h-full flex-col gap-5 p-5">
		<div class="flex items-start gap-4">
			<div
				class="bg-muted/70 border-border/70 flex h-40 w-28 shrink-0 overflow-hidden rounded-[20px] border"
			>
				{#if posterUrl}
					<img
						src={posterUrl}
						alt={`Poster for ${displayTitle(props.movie)}${props.movie.year ? ` (${props.movie.year})` : ''}`}
						class="h-full w-full object-cover"
						loading="lazy"
					/>
				{:else}
					<div class="text-muted-foreground flex h-full w-full items-center justify-center">
						<ClapperboardIcon class="size-6" />
					</div>
				{/if}
			</div>

			<div class="min-w-0 flex-1 space-y-3">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="space-y-2">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-xl font-semibold tracking-[-0.03em] text-balance">
								{displayTitle(props.movie)}
							</h2>
							{#if props.movie.year}
								<Badge variant="secondary" class="bg-white/8 text-slate-200">
									{props.movie.year}
								</Badge>
							{/if}
						</div>

						<div class="flex flex-wrap items-center gap-2">
							<StatusChip status={props.status} />
							{#if hasPlexChip(props.movie)}
								<StatusChip status={props.movie.plexStatus} />
							{/if}
						</div>
					</div>

					{#if props.movie.tmdb?.voteAverage !== undefined}
						<div
							class="border-border bg-card/70 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase"
							aria-label={`TMDB vote average: ${formatRating(props.movie.tmdb.voteAverage)}`}
						>
							<StarIcon class="text-primary size-3.5 fill-current" />
							{formatRating(props.movie.tmdb.voteAverage)}
						</div>
					{/if}
				</div>

				{#if props.movie.tmdb?.overview}
					<p class="text-muted-foreground text-sm leading-6">
						{props.movie.tmdb.overview}
					</p>
				{/if}

				<div class="flex flex-wrap gap-2">
					{#if props.movie.resolution}
						<Badge variant="secondary" class="bg-white/8 text-slate-100">
							{props.movie.resolution}
						</Badge>
					{/if}
					{#if props.movie.codec}
						<Badge variant="secondary" class="bg-white/8 text-slate-100">
							{props.movie.codec}
						</Badge>
					{/if}
					<Badge variant="secondary" class="bg-white/8 text-slate-100">
						Queued {formatDate(props.movie.queuedAt)}
					</Badge>
					{#if hasPlexChip(props.movie) && props.movie.lastWatchedAt}
						<Badge variant="secondary" class="bg-white/8 text-slate-100">
							{formatLastWatched(props.movie.lastWatchedAt)}
						</Badge>
					{/if}
				</div>
			</div>
		</div>

		{#if showProgress}
			<MovieProgressBar pct={props.pct} live={props.live} status={props.status} />
		{/if}
	</CardContent>
</Card>
