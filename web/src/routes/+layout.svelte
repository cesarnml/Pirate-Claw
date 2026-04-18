<script lang="ts">
	import MenuIcon from '@lucide/svelte/icons/menu';
	import ClapperboardIcon from '@lucide/svelte/icons/clapperboard';
	import TvMinimalPlayIcon from '@lucide/svelte/icons/tv-minimal-play';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import { writable } from 'svelte/store';
	import '../app.css';
	import { Toaster } from '$lib/components/ui/sonner';
	import { formatUptime } from '$lib/helpers';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import SidebarBrand from './components/SidebarBrand.svelte';
	import SidebarNav from './components/SidebarNav.svelte';
	import SidebarStatusFooter from './components/SidebarStatusFooter.svelte';
	import MobileNav from './components/MobileNav.svelte';
	import type { NavLink } from './components/SidebarNav.svelte';
	import { page } from '$app/stores';

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

	const daemonUptime = $derived(formatUptime(data.health?.uptime ?? null));
	const transmissionConnected = $derived(data.transmissionSession !== null);
	const showSidebar = $derived($page.url.pathname !== '/onboarding');
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
		<SidebarBrand onclick={closeMobileNav} />
		<SidebarNav {nav} onclick={closeMobileNav} />
		<SidebarStatusFooter {daemonUptime} daemonHealthy={!!data.health} {transmissionConnected} />
	</div>
{/snippet}

<div class="dark bg-background text-foreground min-h-screen">
	<div class="flex min-h-screen">
		{#if showSidebar}
			<aside class="border-border bg-card/60 hidden border-r backdrop-blur md:flex md:w-16 lg:w-56">
				{@render sidebarContent()}
			</aside>
		{/if}

		<div class="flex min-w-0 flex-1 flex-col">
			{#if showSidebar}
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
			{/if}

			<main class="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-10">
				{@render children()}
			</main>
		</div>
	</div>

	{#if showSidebar}
		<MobileNav open={$mobileNavOpen} onClose={closeMobileNav} content={sidebarContent} />
	{/if}
</div>
<Toaster richColors closeButton />
