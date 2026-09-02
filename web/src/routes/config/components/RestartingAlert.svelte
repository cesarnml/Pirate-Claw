<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { RESTART_RETURN_TIMEOUT_SECONDS } from '$lib/restart-roundtrip';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	// Shown instead of the generic ApiUnavailableAlert when the page load
	// can't reach the API for the one reason that's actually expected right
	// now: a restart we know is in flight (either just triggered, or
	// resumed from localStorage after a reload — see +page.svelte's
	// restartInProgress/onMount). An unreachable API during a known
	// restart isn't an outage to be alarmed about, so this reads calm
	// rather than destructive.
</script>

<Alert
	variant="default"
	role="status"
	class="border-amber-400/30 bg-amber-400/10 [&_[data-slot=alert-description]]:text-amber-100/80"
>
	<Loader2Icon class="size-4 animate-spin text-amber-400" />
	<AlertTitle class="text-amber-300">Daemon restarting…</AlertTitle>
	<AlertDescription>
		The daemon is briefly unreachable while it restarts — this page will pick back up automatically
		once it's back online (up to {RESTART_RETURN_TIMEOUT_SECONDS} seconds).
	</AlertDescription>
</Alert>
