<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { cn } from '$lib/utils';

	const props = $props<{
		message: string | null | undefined;
		class?: string;
	}>();
</script>

{#if props.message}
	<Alert variant="destructive" role="alert" class={cn(props.class)}>
		<AlertTitle>API unavailable</AlertTitle>
		<AlertDescription>{props.message}</AlertDescription>
	</Alert>
{/if}
