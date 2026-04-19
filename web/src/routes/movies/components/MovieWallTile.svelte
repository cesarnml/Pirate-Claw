<script lang="ts">
	import StarIcon from '@lucide/svelte/icons/star';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import {
		formatLastWatched,
		formatMovieQueuedDate,
		formatRating,
		hasPlexChip,
		movieBackdropSrc,
		movieDisplayTitle
	} from '$lib/helpers';
	import type { MovieBreakdown, TorrentStatSnapshot } from '$lib/types';
	import MovieProgressBar from './MovieProgressBar.svelte';

	type DeckStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'missing' | 'error';

	const props = $props<{
		movie: MovieBreakdown;
		status: DeckStatus;
		pct: number;
		live: TorrentStatSnapshot | undefined;
	}>();

	const backdropUrl = $derived(movieBackdropSrc(props.movie.tmdb?.backdropUrl));
	const showProgress = $derived(
		props.status === 'downloading' || (props.status === 'paused' && props.pct > 0)
	);
	const showPlexChip = $derived(
		hasPlexChip(props.movie.plexStatus) && props.status === 'completed'
	);
</script>

<Card class="group bg-card/70 relative h-full overflow-hidden rounded-[30px] border-white/10">
	<div class="absolute inset-0">
		<img
			src={backdropUrl}
			alt=""
			class="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.08]"
			loading="lazy"
		/>
		<div
			class="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.28),rgba(15,23,42,0.96)_52%,rgba(15,23,42,1))]"
		></div>
	</div>

	<CardContent class="relative flex h-full flex-col gap-5 p-5">
		<div class="flex items-start gap-4">
			<div class="min-w-0 flex-1 space-y-3">
				<div class="flex flex-col gap-2">
					<div class="no-wrap flex items-start justify-between">
						<h2 class="flex-1 text-xl font-semibold tracking-[-0.03em] text-balance">
							{movieDisplayTitle(props.movie)}
						</h2>
						<div class="flex items-center gap-1">
							{#if props.movie.year}
								<Badge variant="secondary" class="bg-white/8 text-slate-200">
									{props.movie.year}
								</Badge>
							{/if}
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
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<StatusChip status={props.status} />
						{#if showPlexChip}
							<StatusChip status={props.movie.plexStatus} />
						{/if}
					</div>
				</div>

				{#if props.movie.tmdb?.overview}
					<p class="text-muted-foreground text-sm leading-6">{props.movie.tmdb.overview}</p>
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
						Queued @ {formatMovieQueuedDate(props.movie.queuedAt)}
					</Badge>
					{#if hasPlexChip(props.movie.plexStatus) && props.movie.lastWatchedAt}
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
