<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	const nav = [
		{ href: '/', label: 'Home' },
		{ href: '/candidates', label: 'Candidates' },
		{ href: '/shows', label: 'Shows' },
		{ href: '/config', label: 'Config' }
	];
</script>

<div class="min-h-screen bg-gray-950 text-gray-100">
	<header class="border-b border-gray-800 bg-gray-900">
		<nav class="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
			<span class="font-mono text-sm font-semibold tracking-wide text-amber-400">pirate-claw</span>
			{#each nav as link}
				<a
					href={link.href}
					class="text-sm text-gray-400 transition-colors hover:text-gray-100"
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</header>

	<main class="mx-auto max-w-5xl px-4 py-8">
		{@render children()}
	</main>
</div>
