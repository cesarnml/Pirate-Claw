<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { RESTART_RETURN_TIMEOUT_SECONDS } from '$lib/restart-roundtrip';
	import type { SubmitFunction } from '@sveltejs/kit';

	// Single, page-level "you have a saved change waiting on a restart"
	// control — replaces what used to be a Restart Daemon button + status
	// paragraph duplicated per-card (Daemon & Schedule, and it would have
	// needed copies on TMDB/Plex too once those saves started feeding the
	// same signal). One instance here instead, sticky so it's reachable
	// without scrolling back up regardless of which card you just saved on.
	//
	// Deliberately config-route-scoped, not global (root +layout.svelte) —
	// see the 2026-09-02 design discussion: this is a benign, deferred,
	// self-resolving state (the daemon just runs on the old
	// schedule/credentials until restarted), not an active functional
	// failure, and the single-operator using this tool already knows they
	// just made the change. That's different from
	// +layout.svelte's separate isReadyPendingRestart banner, which is
	// global because it reflects an actual functional problem (Transmission
	// unreachable post-setup), not this.
	//
	// Non-dismissible while pending, by design — see runtimeChangesPending
	// (+page.svelte) for how it survives a reload/nav back to /config.
	interface Props {
		canWrite: boolean;
		writeDisabledTooltip: string;
		restarting: boolean;
		restartPhase: 'idle' | 'requested' | 'restarting' | 'back_online' | 'failed_to_return';
		runtimeChangesPending: boolean;
		enhanceRestartDaemon: SubmitFunction;
	}

	const {
		canWrite,
		writeDisabledTooltip,
		restarting,
		restartPhase,
		runtimeChangesPending,
		enhanceRestartDaemon
	}: Props = $props();
</script>

{#if runtimeChangesPending}
	<form
		method="POST"
		action="?/restartDaemon"
		use:enhance={enhanceRestartDaemon}
		class="border-warning/30 bg-warning/10 text-warning sticky top-0 z-20 flex flex-col items-stretch justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur sm:flex-row sm:items-center"
	>
		<p>
			{#if restartPhase === 'requested'}
				Restart requested. Waiting for the daemon to go away.
			{:else if restartPhase === 'restarting'}
				Daemon restarting. This page will confirm when it comes back.
			{:else if restartPhase === 'failed_to_return'}
				Daemon failed to return within {RESTART_RETURN_TIMEOUT_SECONDS} seconds. Check the host, then
				retry or restart manually.
			{:else}
				Saved changes are waiting for a restart to take effect.
			{/if}
		</p>
		<Button
			type="submit"
			variant="outline"
			class="border-warning/40 text-warning hover:bg-warning/10 dark:hover:bg-warning/10 w-full shrink-0 rounded-full px-5 sm:w-auto"
			disabled={!canWrite || restarting}
			title={!canWrite ? writeDisabledTooltip : undefined}
		>
			{#if restarting}
				Restarting…
			{:else}
				Restart Daemon
			{/if}
		</Button>
	</form>
{/if}
