<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
</script>

<Card class="bg-card/55 border-border/70 h-full rounded-[30px] border border-dashed">
	<CardContent
		class="flex h-full min-h-72 flex-col items-center justify-center gap-4 p-8 text-center"
	>
		<div class="bg-primary/12 text-primary flex size-14 items-center justify-center rounded-full">
			<PlusIcon class="size-6" />
		</div>
		<div class="space-y-2">
			<h2 class="text-xl font-semibold tracking-[-0.03em]">Add New</h2>
			<p class="text-muted-foreground text-sm leading-6">
				Open Config to expand the movie policy and add more targets to the wall.
			</p>
		</div>
		<Button href="/config" variant="outline" class="rounded-full px-5">Open Config</Button>
	</CardContent>
</Card>
