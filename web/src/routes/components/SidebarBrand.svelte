<script lang="ts">
	interface Props {
		onclick?: () => void;
	}
	let { onclick }: Props = $props();
</script>

<div class="border-border border-b px-4 py-5 md:px-3 lg:px-4">
	<a
		href="/"
		{onclick}
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
