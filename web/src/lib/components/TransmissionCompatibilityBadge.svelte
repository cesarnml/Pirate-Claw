<script lang="ts">
	import type { TransmissionCompatibility } from '$lib/types';

	interface Props {
		compatibility: TransmissionCompatibility;
		advisory?: string;
	}

	let { compatibility, advisory }: Props = $props();

	const label: Record<TransmissionCompatibility, string> = {
		recommended: 'Recommended',
		compatible: 'Compatible',
		compatible_custom: 'Compatible (custom)',
		not_reachable: 'Not reachable'
	};

	const colorClass: Record<TransmissionCompatibility, string> = {
		recommended: 'text-emerald-400',
		compatible: 'text-emerald-400',
		compatible_custom: 'text-yellow-400',
		not_reachable: 'text-red-400'
	};
</script>

<span class="inline-flex flex-col gap-1 text-sm">
	<span class={colorClass[compatibility]} data-testid="compatibility-badge"
		>{label[compatibility]}</span
	>
	{#if advisory}
		<span class="text-muted-foreground text-xs">{advisory}</span>
	{/if}
</span>
