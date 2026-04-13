<script lang="ts">
	import '../app.css';
	import { Button } from '$lib/components/ui/button';
	import { Toaster } from '$lib/components/ui/sonner';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	const nav = [
		{ href: '/candidates', label: 'Candidates' },
		{ href: '/candidates/unmatched', label: 'Unmatched' },
		{ href: '/shows', label: 'Shows' },
		{ href: '/movies', label: 'Movies' },
		{ href: '/config', label: 'Config' }
	];
</script>

<svelte:head>
	<title>Pirate Claw</title>
	<meta
		name="description"
		content="Local read-only dashboard for Pirate Claw: candidates, shows, movies, and daemon status via the HTTP API."
	/>
</svelte:head>

<div class="dark bg-background text-foreground min-h-screen">
	<header class="border-border bg-card border-b">
		<nav
			class="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-3"
			aria-label="Main navigation"
		>
			<a
				href="/"
				aria-label="Home"
				class="focus-visible:ring-ring mr-2 flex shrink-0 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:outline"
			>
				<img
					src="/pirate-claw-logo.png"
					alt=""
					width="40"
					height="40"
					class="h-10 w-10 rounded-md object-cover"
				/>
				<span class="text-primary font-mono text-sm font-semibold tracking-wide">pirate-claw</span>
			</a>
			{#each nav as link}
				<Button variant="ghost" size="sm" href={link.href}>{link.label}</Button>
			{/each}
		</nav>
	</header>

	<main class="mx-auto max-w-5xl px-4 py-8">
		{@render children()}
	</main>
</div>
<Toaster richColors closeButton />
