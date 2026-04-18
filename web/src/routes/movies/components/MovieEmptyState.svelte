<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';

	const props = $props<{ variant: 'no-targets' | 'no-filter-results' }>();
</script>

<Card class="bg-card/75 rounded-[30px] border-white/10">
	<CardContent class="space-y-4 pt-8">
		{#if props.variant === 'no-targets'}
			<div class="space-y-2">
				<p class="text-lg font-semibold">No movie targets yet.</p>
				<p class="text-muted-foreground max-w-xl text-sm leading-6">
					Add a movie policy target to start building the poster wall.
				</p>
			</div>
			<Button href="/config" class="w-fit rounded-full px-5">Open Config</Button>
		{:else}
			<div class="space-y-2">
				<p class="text-lg font-semibold">No movies match this filter.</p>
				<p class="text-muted-foreground text-sm leading-6">
					Try a different command-state view or add another movie target in Config.
				</p>
			</div>
		{/if}
	</CardContent>
</Card>
