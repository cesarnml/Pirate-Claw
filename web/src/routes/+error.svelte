<script lang="ts">
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { page } from '$app/state';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';

	// The project-wide error boundary the dashboard-load-path review flagged
	// as missing (§05: "no +error.svelte exists" was the one path an
	// unhandled throw could fall through to SvelteKit's bare, unstyled
	// default error page instead of the app's own chrome). Renders inside
	// whichever parent +layout.svelte already succeeded — e.g. the sidebar
	// nav is still there, per the reporter's own screenshot — so this is
	// deliberately a small in-place panel, not a full standalone page.
	//
	// No "Restart daemon" button here on purpose, even though the requester
	// asked for one: the one place that action actually works
	// (/config?/restartDaemon, see +layout.svelte's isReadyPendingRestart
	// banner) posts to the very daemon HTTP surface that being unreachable is
	// usually what lands a visitor here — a button that silently can't work
	// is worse than no button. Pointing at /config, which already owns that
	// control and its own reachability handling, is the honest version of
	// "offer a restart."
	//
	// page.error.message is deliberately generic here — see hooks.server.ts's
	// handleError, the log line this page's own detail lives in instead.
	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong loading this page.');
</script>

<svelte:head>
	<title>Pirate Claw — error {status}</title>
</svelte:head>

<div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
	<Alert variant="destructive" role="alert" class="max-w-md text-left">
		<TriangleAlertIcon class="size-4" />
		<AlertTitle>This page hit an error ({status})</AlertTitle>
		<AlertDescription class="flex flex-col gap-3">
			<span>
				{message} This is usually the daemon being unreachable or overloaded, not something wrong with
				your data — it should clear on its own once the daemon catches up.
			</span>
			<div class="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					class="rounded-full"
					onclick={() => location.reload()}
				>
					<RefreshCwIcon class="mr-2 h-3.5 w-3.5" />
					Try again
				</Button>
				<Button type="button" variant="outline" size="sm" class="rounded-full" href="/config">
					Go to Config to restart the daemon
				</Button>
			</div>
		</AlertDescription>
	</Alert>
</div>
