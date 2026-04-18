<script lang="ts">
	import MenuIcon from '@lucide/svelte/icons/menu';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import ClapperboardIcon from '@lucide/svelte/icons/clapperboard';
	import TvMinimalPlayIcon from '@lucide/svelte/icons/tv-minimal-play';
	import XIcon from '@lucide/svelte/icons/x';
	import { fly } from 'svelte/transition';
	import { writable } from 'svelte/store';
	import '../app.css';
	import { Toaster } from '$lib/components/ui/sonner';
	import type { Component, Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	interface NavLink {
		href: string;
		label: string;
		icon: Component;
	}

	interface Props {
		children: Snippet;
		data: LayoutData;
	}

	let { children, data }: Props = $props();

	const mobileNavOpen = writable(false);

	const nav: NavLink[] = [
		{ href: '/', label: 'Dashboard', icon: ClapperboardIcon },
		{ href: '/shows', label: 'TV Shows', icon: TvMinimalPlayIcon },
		{ href: '/movies', label: 'Movies', icon: ClapperboardIcon },
		{ href: '/config', label: 'Config', icon: Settings2Icon }
	];

	function closeMobileNav() {
		mobileNavOpen.set(false);
	}

	function formatUptime(ms: number | null): string {
		if (ms === null) return 'Unavailable';
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	}

	const daemonUptime = $derived(formatUptime(data.health?.uptime ?? null));
	const transmissionConnected = $derived(data.transmissionSession !== null);
</script>

<svelte:head>
	<title>Pirate Claw</title>
	<meta
		name="description"
		content="Local read-only dashboard for Pirate Claw: candidates, shows, movies, and daemon status via the HTTP API."
	/>
</svelte:head>

{#snippet sidebarContent()}
	<div class="flex h-full w-full flex-col">
		<div class="border-border border-b px-4 py-5 md:px-3 lg:px-4">
			<a
				href="/"
				onclick={closeMobileNav}
				class="focus-visible:ring-ring flex items-center gap-3 rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
			>
				<img
					src="/pirate-claw-logo.png"
					alt=""
					width="44"
					height="44"
					class="h-11 w-11 rounded-2xl object-cover shadow-[0_12px_30px_rgba(5,10,21,0.35)]"
				/>
				<div class="min-w-0 md:hidden lg:block">
					<p class="text-foreground font-mono text-sm font-semibold tracking-[0.24em] uppercase">
						Pirate Claw
					</p>
					<p class="text-muted-foreground mt-1 text-xs">Library command deck</p>
				</div>
			</a>
		</div>

		<nav class="flex-1 px-3 py-4" aria-label="Main navigation">
			<ul class="flex flex-col space-y-2">
				{#each nav as link}
					<li class="flex md:justify-center lg:justify-start">
						<a
							href={link.href}
							onclick={closeMobileNav}
							class="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring flex flex-1 items-center gap-3 rounded-2xl px-3 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
						>
							<link.icon class="h-5 w-5 shrink-0" />
							<span class="text-sm font-medium md:sr-only lg:not-sr-only">{link.label}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>

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
						class:text-emerald-300={data.health}
						class:text-rose-300={!data.health}
						class="h-2.5 w-2.5 shrink-0 rounded-full"
						class:bg-emerald-400={data.health}
						class:bg-rose-400={!data.health}
						aria-label={data.health ? 'Daemon available' : 'Daemon unavailable'}
						title={data.health ? 'Daemon available' : 'Daemon unavailable'}
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
						aria-label={transmissionConnected
							? 'Transmission connected'
							: 'Transmission unavailable'}
						title={transmissionConnected ? 'Transmission connected' : 'Transmission unavailable'}
					></div>
				</div>
			</div>
		</div>
	</div>
{/snippet}

<div class="dark bg-background text-foreground min-h-screen">
	<div class="flex min-h-screen">
		<aside class="border-border bg-card/60 hidden border-r backdrop-blur md:flex md:w-16 lg:w-56">
			{@render sidebarContent()}
		</aside>

		<div class="flex min-w-0 flex-1 flex-col">
			<header
				class="border-border bg-background/88 sticky top-0 z-20 border-b backdrop-blur md:hidden"
			>
				<div class="flex items-center justify-between gap-3 px-4 py-3">
					<a href="/" class="flex items-center gap-3" aria-label="Home">
						<img
							src="/pirate-claw-logo.png"
							alt=""
							width="40"
							height="40"
							class="h-10 w-10 rounded-2xl object-cover"
						/>
						<div>
							<p
								class="text-foreground font-mono text-sm font-semibold tracking-[0.22em] uppercase"
							>
								Pirate Claw
							</p>
							<p class="text-muted-foreground text-xs">Library command deck</p>
						</div>
					</a>

					<button
						type="button"
						class="border-border bg-card text-foreground inline-flex h-11 w-11 items-center justify-center rounded-2xl border"
						aria-label="Open navigation menu"
						onclick={() => mobileNavOpen.set(true)}
					>
						<MenuIcon class="h-5 w-5" />
					</button>
				</div>
			</header>

			<main class="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-10">
				{@render children()}
			</main>
		</div>
	</div>

	{#if $mobileNavOpen}
		<div class="fixed inset-0 z-40 md:hidden" aria-label="Navigation drawer">
			<button
				type="button"
				class="absolute inset-0 bg-slate-950/72 backdrop-blur-sm"
				aria-label="Close navigation menu"
				onclick={closeMobileNav}
			></button>
			<div
				class="border-border bg-card absolute inset-y-0 left-0 flex w-full max-w-sm flex-col border-r shadow-[0_24px_80px_rgba(2,6,23,0.55)]"
				in:fly={{ x: -24, duration: 180 }}
				out:fly={{ x: -18, duration: 140 }}
			>
				<div class="border-border flex items-center justify-end border-b px-4 py-3">
					<button
						type="button"
						class="border-border bg-background text-foreground inline-flex h-11 w-11 items-center justify-center rounded-2xl border"
						aria-label="Close navigation menu"
						onclick={closeMobileNav}
					>
						<XIcon class="h-5 w-5" />
					</button>
				</div>
				{@render sidebarContent()}
			</div>
		</div>
	{/if}
</div>
<Toaster richColors closeButton />
