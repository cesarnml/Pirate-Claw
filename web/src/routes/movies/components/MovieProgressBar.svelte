<script lang="ts">
	import { formatSpeed } from '$lib/helpers';
	import type { TorrentStatSnapshot } from '$lib/types';

	const props = $props<{
		pct: number;
		live: TorrentStatSnapshot | undefined;
		status: string;
	}>();
</script>

<div class="space-y-2">
	<div class="h-2 overflow-hidden rounded-full bg-white/8">
		<div
			class="bg-primary h-full rounded-full transition-[width]"
			style={`width: ${props.pct}%`}
		></div>
	</div>
	<div class="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
		<span>{props.pct}% acquired</span>
		{#if props.live && props.status === 'downloading'}
			<span>{formatSpeed(props.live.rateDownload)}</span>
		{/if}
	</div>
</div>
