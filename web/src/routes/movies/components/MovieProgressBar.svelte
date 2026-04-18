<script lang="ts">
	import type { TorrentStatSnapshot } from '$lib/types';

	const props = $props<{
		pct: number;
		live: TorrentStatSnapshot | undefined;
		status: string;
	}>();

	function formatSpeed(bytesPerSecond: number): string {
		if (bytesPerSecond >= 1_048_576) return `${(bytesPerSecond / 1_048_576).toFixed(1)} MB/s`;
		return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
	}
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
