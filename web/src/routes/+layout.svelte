<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	const nav = [
		{ href: '/candidates', label: 'Candidates' },
		{ href: '/shows', label: 'Shows' },
		{ href: '/config', label: 'Config' }
	];
</script>

<div class="min-h-screen bg-gray-950 text-gray-100">
	<header class="border-b border-gray-800 bg-gray-900">
		<nav class="mx-auto flex max-w-5xl flex-wrap items-center gap-6 px-4 py-3">
			<a
				href="/"
				aria-label="Home"
				class="flex shrink-0 items-center gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
			>
				<img
					src="/pirate-claw-logo.png"
					alt=""
					width="40"
					height="40"
					class="h-10 w-10 rounded-md object-cover"
				/>
				<span class="font-mono text-sm font-semibold tracking-wide text-amber-400">pirate-claw</span>
			</a>
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
