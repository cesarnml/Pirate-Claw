<script lang="ts">
	interface Props {
		daemonUptime: string;
		daemonHealthy: boolean;
		transmissionConnected: boolean;
	}
	let { daemonUptime, daemonHealthy, transmissionConnected }: Props = $props();
</script>

<div class="border-border bg-card/55 mt-auto border-t p-3 md:hidden lg:block">
	<div class="rounded-2xl border border-white/8 bg-black/10 p-3 backdrop-blur-sm">
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase">
					Daemon
				</p>
				<p class="text-foreground mt-1 text-sm font-medium md:hidden lg:block">
					{daemonUptime}
				</p>
			</div>
			<div
				class:text-emerald-300={daemonHealthy}
				class:text-rose-300={!daemonHealthy}
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				class:bg-emerald-400={daemonHealthy}
				class:bg-rose-400={!daemonHealthy}
				aria-label={daemonHealthy ? 'Daemon available' : 'Daemon unavailable'}
				title={daemonHealthy ? 'Daemon available' : 'Daemon unavailable'}
			></div>
		</div>

		<div class="mt-3 flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase">
					Transmission
				</p>
				<p class="text-foreground mt-1 text-sm font-medium md:hidden lg:block">
					{transmissionConnected ? 'Connected' : 'Unavailable'}
				</p>
			</div>
			<div
				class:text-emerald-300={transmissionConnected}
				class:text-amber-300={!transmissionConnected}
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				class:bg-emerald-400={transmissionConnected}
				class:bg-amber-400={!transmissionConnected}
				aria-label={transmissionConnected ? 'Transmission connected' : 'Transmission unavailable'}
				title={transmissionConnected ? 'Transmission connected' : 'Transmission unavailable'}
			></div>
		</div>
	</div>
</div>
