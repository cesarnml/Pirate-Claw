<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		content: Snippet;
	}
	let { open, onClose, content }: Props = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-40 md:hidden" aria-label="Navigation drawer">
		<button
			type="button"
			class="absolute inset-0 bg-slate-950/72 backdrop-blur-sm"
			aria-label="Close navigation menu"
			onclick={onClose}
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
					onclick={onClose}
				>
					<XIcon class="h-5 w-5" />
				</button>
			</div>
			{@render content()}
		</div>
	</div>
{/if}
