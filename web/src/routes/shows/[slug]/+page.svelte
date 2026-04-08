<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<h1 class="text-2xl font-semibold">{data.slug}</h1>
<p class="mt-2 text-gray-400">Show detail coming in P10.03.</p>
