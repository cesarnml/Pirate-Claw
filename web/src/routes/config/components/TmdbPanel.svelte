<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
	import type { TmdbConfig } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';

	interface Props {
		tmdb?: TmdbConfig;
		canWrite: boolean;
		currentEtag: string | null;
		writeDisabledTooltip: string;
		tmdbMessage?: string;
		enhanceSaveTmdb: SubmitFunction;
	}

	const { tmdb, canWrite, currentEtag, writeDisabledTooltip, tmdbMessage, enhanceSaveTmdb }: Props =
		$props();

	const apiKeyConfigured = $derived(!!tmdb?.apiKey);
</script>

<Card class="bg-card/75 rounded-[30px] border-white/10">
	<CardHeader class="space-y-4">
		<div class="flex items-start justify-between gap-3">
			<div class="space-y-1">
				<p class="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
					03 · Metadata
				</p>
				<h2 class="text-2xl font-semibold tracking-[-0.03em]">TMDB Metadata</h2>
			</div>
			<div class="text-muted-foreground inline-flex items-center gap-2 text-xs uppercase">
				<span
					class={`inline-block size-2 rounded-full ${apiKeyConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`}
					aria-label={apiKeyConfigured ? 'configured' : 'not configured'}
				></span>
				{apiKeyConfigured ? 'Configured' : 'No API Key'}
			</div>
		</div>
	</CardHeader>
	<CardContent>
		<form method="POST" action="?/saveTmdb" class="space-y-5" use:enhance={enhanceSaveTmdb}>
			<input type="hidden" name="tmdbIfMatch" value={currentEtag ?? ''} />

			<div class="grid gap-3 sm:grid-cols-2">
				<label class="grid gap-1 text-sm sm:col-span-2">
					<span class="text-muted-foreground">API key</span>
					<div class="relative">
						<KeyRoundIcon class="text-muted-foreground absolute top-3 left-3 size-4" />
						<input
							name="tmdbApiKey"
							type="password"
							autocomplete="off"
							placeholder={apiKeyConfigured
								? 'Configured; enter a new key to replace'
								: 'TMDB API key'}
							disabled={!canWrite}
							title={!canWrite ? writeDisabledTooltip : undefined}
							class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-2xl border pr-3 pl-10 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
						/>
					</div>
				</label>

				<label class="grid gap-1 text-sm">
					<span class="text-muted-foreground">Cache TTL (days)</span>
					<input
						name="tmdbCacheTtlDays"
						type="number"
						min="1"
						max="3650"
						step="1"
						value={tmdb?.cacheTtlDays ?? 7}
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>

				<label class="grid gap-1 text-sm">
					<span class="text-muted-foreground">Negative cache TTL (days)</span>
					<input
						name="tmdbNegativeCacheTtlDays"
						type="number"
						min="1"
						max="3650"
						step="1"
						value={tmdb?.negativeCacheTtlDays ?? 1}
						disabled={!canWrite}
						title={!canWrite ? writeDisabledTooltip : undefined}
						class="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-2xl border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
					/>
				</label>
			</div>

			{#if tmdbMessage}
				<p class="text-destructive text-xs">{tmdbMessage}</p>
			{/if}

			<Button
				type="submit"
				class="rounded-full px-5"
				disabled={!canWrite || !currentEtag}
				title={!canWrite ? writeDisabledTooltip : undefined}
			>
				<DatabaseIcon class="size-4" />
				Save TMDB
			</Button>
		</form>
	</CardContent>
</Card>
