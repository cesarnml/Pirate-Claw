<script lang="ts">
	import '../app.css';
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	const nav = [
		{ href: '/candidates', label: 'Candidates' },
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

<div class="dark min-h-screen bg-background text-foreground">
	<header class="border-b border-border bg-card">
		<nav
			class="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-3"
			aria-label="Main navigation"
		>
			<a
				href="/"
				aria-label="Home"
				class="mr-2 flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
			>
				<img
					src="/pirate-claw-logo.png"
					alt=""
					width="40"
					height="40"
					class="h-10 w-10 rounded-md object-cover"
				/>
				<span class="font-mono text-sm font-semibold tracking-wide text-primary">pirate-claw</span>
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
