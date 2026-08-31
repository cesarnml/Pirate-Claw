<script lang="ts">
	import type { PlexAuthState } from '$lib/types';

	type SidebarPlexAuthState = PlexAuthState | 'unavailable';

	interface Props {
		daemonUptime: string;
		daemonHealthy: boolean;
		transmissionConnected: boolean;
		plexAuthState: SidebarPlexAuthState;
	}
	let { daemonUptime, daemonHealthy, transmissionConnected, plexAuthState }: Props = $props();

	const plexStatus = $derived.by(() => {
		switch (plexAuthState) {
			case 'connected':
			case 'renewing':
				return {
					label: 'Connected',
					dotClass: 'bg-emerald-400',
					title: 'Plex connected'
				};
			case 'connecting':
				return {
					label: 'Connecting',
					dotClass: 'bg-amber-400',
					title: 'Plex sign-in in progress'
				};
			case 'reconnect_required':
			case 'expired_reconnect_required':
			case 'error_reconnect_required':
				return {
					label: 'Reconnect required',
					dotClass: 'bg-rose-400',
					title: 'Plex reconnect required'
				};
			case 'not_connected':
				return {
					label: 'Not connected',
					dotClass: 'bg-amber-400',
					title: 'Plex not connected'
				};
			case 'unavailable':
				return {
					label: 'Unavailable',
					dotClass: 'bg-amber-400',
					title: 'Plex unavailable'
				};
		}
	});
</script>

<!-- mobile drawer (below md): same full card as the expanded desktop sidebar.
     The drawer is rendered by MobileNav, which is itself `md:hidden`, so
     neither of the two breakpoint-gated variants below ever matched here —
     the drawer showed no status panel at all. -->
<div class="border-border bg-card/55 mt-auto border-t p-3 md:hidden">
	<div class="rounded-2xl border border-white/8 bg-black/10 p-3 backdrop-blur-sm">
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase">
					Daemon
				</p>
				<p class="text-foreground mt-1 text-sm font-medium">
					{daemonUptime}
				</p>
			</div>
			<div
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				class:bg-emerald-400={daemonHealthy}
				class:bg-rose-400={!daemonHealthy}
				title={daemonHealthy ? `Daemon · up ${daemonUptime}` : 'Daemon unavailable'}
			></div>
		</div>

		<div class="mt-3 flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase">
					Transmission
				</p>
				<p class="text-foreground mt-1 text-sm font-medium">
					{transmissionConnected ? 'Connected' : 'Unavailable'}
				</p>
			</div>
			<div
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				class:bg-emerald-400={transmissionConnected}
				class:bg-amber-400={!transmissionConnected}
				title={transmissionConnected ? 'Transmission · connected' : 'Transmission unavailable'}
			></div>
		</div>
		<div class="mt-3 flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase">
					Plex
				</p>
				<p class="text-foreground mt-1 text-sm font-medium">
					{plexStatus.label}
				</p>
			</div>
			<div
				class={`h-2.5 w-2.5 shrink-0 rounded-full ${plexStatus.dotClass}`}
				title={plexStatus.title}
			></div>
		</div>
	</div>
</div>

<!-- collapsed sidebar (md–lg, icon-only rail): dots only with custom hover tooltip -->
<div class="border-border bg-card/55 mt-auto hidden border-t p-3 md:block lg:hidden">
	<div class="group relative rounded-2xl border border-white/8 bg-black/10 p-3 backdrop-blur-sm">
		<div class="flex flex-col items-center gap-3">
			<div
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				class:bg-emerald-400={daemonHealthy}
				class:bg-rose-400={!daemonHealthy}
			></div>
			<div
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				class:bg-emerald-400={transmissionConnected}
				class:bg-amber-400={!transmissionConnected}
			></div>
			<div class={`h-2.5 w-2.5 shrink-0 rounded-full ${plexStatus.dotClass}`}></div>
		</div>

		<!-- tooltip: appears on hover of the whole panel -->
		<div
			class="pointer-events-none absolute bottom-0 left-full z-[100] ml-2 w-44 rounded-xl border border-white/20 bg-slate-950 p-3 opacity-0 shadow-xl transition-opacity delay-75 duration-200 group-hover:opacity-100"
		>
			<div class="flex items-center justify-between gap-2">
				<span class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
					>Daemon</span
				>
				<div class="flex items-center gap-1.5">
					<span class="text-foreground text-xs">{daemonHealthy ? daemonUptime : 'Unavailable'}</span
					>
					<div
						class="h-2 w-2 shrink-0 rounded-full"
						class:bg-emerald-400={daemonHealthy}
						class:bg-rose-400={!daemonHealthy}
					></div>
				</div>
			</div>
			<div class="mt-2 flex items-center justify-between gap-2">
				<span class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
					>Torrent</span
				>
				<div class="flex items-center gap-1.5">
					<span class="text-foreground text-xs"
						>{transmissionConnected ? 'Connected' : 'Unavailable'}</span
					>
					<div
						class="h-2 w-2 shrink-0 rounded-full"
						class:bg-emerald-400={transmissionConnected}
						class:bg-amber-400={!transmissionConnected}
					></div>
				</div>
			</div>
			<div class="mt-2 flex items-center justify-between gap-2">
				<span class="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase"
					>Plex</span
				>
				<div class="flex items-center gap-1.5">
					<span class="text-foreground text-xs">{plexStatus.label}</span>
					<div class={`h-2 w-2 shrink-0 rounded-full ${plexStatus.dotClass}`}></div>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- expanded sidebar (lg+): full card -->
<div class="border-border bg-card/55 mt-auto hidden border-t p-3 lg:block">
	<div class="rounded-2xl border border-white/8 bg-black/10 p-3 backdrop-blur-sm">
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase">
					Daemon
				</p>
				<p class="text-foreground mt-1 text-sm font-medium">
					{daemonUptime}
				</p>
			</div>
			<div
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				class:bg-emerald-400={daemonHealthy}
				class:bg-rose-400={!daemonHealthy}
				title={daemonHealthy ? `Daemon · up ${daemonUptime}` : 'Daemon unavailable'}
			></div>
		</div>

		<div class="mt-3 flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase">
					Transmission
				</p>
				<p class="text-foreground mt-1 text-sm font-medium">
					{transmissionConnected ? 'Connected' : 'Unavailable'}
				</p>
			</div>
			<div
				class="h-2.5 w-2.5 shrink-0 rounded-full"
				class:bg-emerald-400={transmissionConnected}
				class:bg-amber-400={!transmissionConnected}
				title={transmissionConnected ? 'Transmission · connected' : 'Transmission unavailable'}
			></div>
		</div>
		<div class="mt-3 flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase">
					Plex
				</p>
				<p class="text-foreground mt-1 text-sm font-medium">
					{plexStatus.label}
				</p>
			</div>
			<div
				class={`h-2.5 w-2.5 shrink-0 rounded-full ${plexStatus.dotClass}`}
				title={plexStatus.title}
			></div>
		</div>
	</div>
</div>
