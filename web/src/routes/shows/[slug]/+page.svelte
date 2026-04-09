<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatRating(v: number | undefined): string {
		if (v === undefined) return '—';
		return v.toFixed(1);
	}

	function displayTitle(show: NonNullable<PageData['show']>): string {
		return show.tmdb?.name ?? show.normalizedTitle;
	}

	/** Only allow https URLs in inline `background: url(...)` to avoid CSS injection from malformed strings. */
	function safeHttpsBackgroundUrl(raw: string | undefined): string | undefined {
		if (!raw) return undefined;
		try {
			const u = new URL(raw);
			if (u.protocol !== 'https:') return undefined;
			return u.href;
		} catch {
			return undefined;
		}
	}
</script>

<div class="mb-4">
	<Button variant="ghost" size="sm" href="/shows" class="-ml-2 h-auto px-2 py-1">← Shows</Button>
</div>

{#if data.error}
	<Alert variant="destructive">
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{data.error}</AlertDescription>
	</Alert>
{:else if !data.show}
	<Card class="mt-4">
		<CardContent class="pt-6">
			<p class="text-sm text-muted-foreground">Show not found.</p>
		</CardContent>
	</Card>
{:else}
	{@const backdropUrl = safeHttpsBackgroundUrl(data.show.tmdb?.backdropUrl)}
	<div
		class="mb-8 flex flex-col gap-4 rounded-xl border border-border sm:flex-row sm:items-start"
		class:overflow-hidden={!!backdropUrl}
		style={backdropUrl
			? `background: linear-gradient(hsl(var(--background) / 0.92), hsl(var(--background) / 0.92)), url(${backdropUrl}) center/cover no-repeat`
			: undefined}
	>
		{#if data.show.tmdb?.posterUrl}
			<img
				src={data.show.tmdb.posterUrl}
				alt={`Poster for ${displayTitle(data.show)}`}
				class="mx-auto h-56 w-40 shrink-0 rounded-md object-cover sm:mx-0"
				loading="eager"
				fetchpriority="high"
			/>
		{:else}
			<div
				class="mx-auto flex h-56 w-40 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground sm:mx-0"
			>
				No poster
			</div>
		{/if}
		<div class="min-w-0 flex-1 p-4 sm:py-4 sm:pr-4 sm:pl-0">
			<div class="flex flex-wrap items-baseline gap-2">
				<h1 class="text-2xl font-semibold tracking-tight">
					{displayTitle(data.show)}
				</h1>
				{#if data.show.tmdb?.voteAverage !== undefined}
					<Badge
						variant="secondary"
						aria-label="TMDB vote average: {formatRating(data.show.tmdb.voteAverage)}"
					>
						★ {formatRating(data.show.tmdb.voteAverage)}
					</Badge>
				{/if}
				{#if data.show.tmdb?.numberOfSeasons !== undefined}
					<span class="text-sm text-muted-foreground">
						{data.show.tmdb.numberOfSeasons} season{data.show.tmdb.numberOfSeasons === 1
							? ''
							: 's'} (TMDB)
					</span>
				{/if}
			</div>
			{#if data.show.tmdb?.overview}
				<p class="mt-3 text-sm leading-relaxed text-muted-foreground">{data.show.tmdb.overview}</p>
			{/if}
		</div>
	</div>

	{#each data.show.seasons as season (season.season)}
		<section class="mb-8">
			<Card>
				<CardHeader class="pb-3">
					<h2 class="text-lg font-semibold tracking-tight">Season {season.season}</h2>
				</CardHeader>
				<CardContent class="pt-0">
					<div class="rounded-md border border-border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-28">
										<span class="sr-only">Still image</span>
									</TableHead>
									<TableHead>Episode</TableHead>
									<TableHead>Title</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Queued At</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each season.episodes as ep (ep.identityKey)}
									<TableRow>
										<TableCell class="align-top">
											{#if ep.tmdb?.stillUrl}
												<img
													src={ep.tmdb.stillUrl}
													alt={ep.tmdb?.name ? `Still for ${ep.tmdb.name}` : 'Episode still'}
													class="h-14 w-24 rounded-md object-cover"
													loading="lazy"
												/>
											{:else}
												<div class="h-14 w-24 rounded-md bg-muted"></div>
											{/if}
										</TableCell>
										<TableCell class="align-top font-medium whitespace-nowrap">
											E{String(ep.episode).padStart(2, '0')}
										</TableCell>
										<TableCell class="align-top">
											{#if ep.tmdb?.name}
												<span>{ep.tmdb.name}</span>
												{#if ep.tmdb.airDate}
													<span class="ml-1 text-xs text-muted-foreground">({ep.tmdb.airDate})</span>
												{/if}
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
										</TableCell>
										<TableCell class="align-top">
											{ep.status}
											{#if ep.lifecycleStatus}
												<span class="ml-1 text-xs text-muted-foreground">({ep.lifecycleStatus})</span>
											{/if}
										</TableCell>
										<TableCell class="align-top text-muted-foreground">{ep.queuedAt ?? '—'}</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</section>
	{/each}
{/if}
